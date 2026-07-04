import dns from 'node:dns'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { scanTargets, broadcastForInterface } from './netinfo.js'
import { probeHost, detectPing, probeCapabilities, pLimit } from './probe.js'
import { readNeighbors, isFreshState } from './neigh.js'
import { lookupVendor } from './oui.js'

const SWEEP_CONCURRENCY = 64
const MONITOR_CONCURRENCY = 32
const LATENCY_HISTORY_MAX = 240

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms).unref?.())])
}

let avahiAvailable = null
async function resolveHostname(ip) {
  try {
    const names = await withTimeout(dns.promises.reverse(ip), 1500)
    if (names?.[0]) return names[0]
  } catch {
    // 逆引き失敗は普通のこと。次に mDNS を試す。
  }
  if (avahiAvailable !== false) {
    try {
      const out = await new Promise((resolve, reject) => {
        execFile('avahi-resolve-address', [ip], { timeout: 1500 }, (err, stdout) => {
          if (err) return reject(err)
          resolve(stdout)
        })
      })
      avahiAvailable = true
      const name = out.trim().split(/\s+/)[1]
      if (name) return name
    } catch (err) {
      if (err.code === 'ENOENT') avahiAvailable = false
    }
  }
  return null
}

export class Scanner {
  constructor(store) {
    this.store = store
    this.scanning = false
    this.lastScanAt = null
    this.lastScanDurationMs = null
    this.lastPingRoundAt = 0
    this.iface = null
    this.subnets = []
    this.gatewayIp = null
    this.latencyHistory = new Map() // mac -> [{t, ms}]
    this._tickTimer = null
    this._hostnameLimit = pLimit(6)
  }

  get settings() {
    return this.store.data.settings
  }

  start() {
    detectPing().then((ok) => {
      if (!ok) console.warn('[scanner] ping コマンドが見つからないため TCP プローブで代替します')
    })
    this.sweep().catch((err) => console.error('[scanner] 初回スキャン失敗:', err))
    this._tickTimer = setInterval(() => this.#tick(), 2000)
    this._tickTimer.unref?.()
  }

  stop() {
    if (this._tickTimer) clearInterval(this._tickTimer)
  }

  #tick() {
    if (this.scanning) return
    const now = Date.now()
    if (!this.lastScanAt || now - this.lastScanAt >= this.settings.scanIntervalSec * 1000) {
      this.sweep().catch((err) => console.error('[scanner] スキャン失敗:', err))
    } else if (now - this.lastPingRoundAt >= this.settings.pingIntervalSec * 1000) {
      this.pingRound().catch((err) => console.error('[scanner] 死活監視失敗:', err))
    }
  }

  // ネットワーク全体を掃引して端末を発見・更新する
  async sweep() {
    if (this.scanning) return
    this.scanning = true
    const started = Date.now()
    try {
      const { iface, subnets, ips } = scanTargets(this.settings)
      this.iface = iface
      this.subnets = subnets
      this.gatewayIp = iface?.gateway || null

      const limit = pLimit(SWEEP_CONCURRENCY)
      const results = new Map()
      await Promise.all(
        ips.map((ip) =>
          limit(async () => {
            results.set(ip, await probeHost(ip))
          })
        )
      )

      const neighbors = await readNeighbors(iface?.name)
      const now = Date.now()
      const macsSeen = new Set()

      // 自分自身（このサーバー）
      if (iface?.mac) {
        const self = this.#upsertDevice(iface.mac, {
          ip: iface.address,
          now,
          alive: true,
          rttMs: 0,
          method: 'self',
        })
        self.self = true
        if (!self.name) {
          self.name = `このサーバー (${os.hostname()})`
          self.category = 'server'
        }
        macsSeen.add(iface.mac)
      }

      // 近隣テーブル上の端末（MACが分かるもの）
      const neighborByIp = new Map()
      for (const n of neighbors) {
        if (n.ip === iface?.address) continue
        neighborByIp.set(n.ip, n)
        const probe = results.get(n.ip)
        const aliveNow = probe?.alive || isFreshState(n.state)
        const device = this.#upsertDevice(n.mac, {
          ip: n.ip,
          now,
          alive: aliveNow,
          rttMs: probe?.alive ? probe.rttMs : null,
          method: probe?.alive ? probe.method : 'arp',
        })
        macsSeen.add(n.mac)
        if (n.ip === this.gatewayIp) {
          device.gateway = true
          if (!device.name) {
            device.name = 'ルーター'
            device.category = 'network'
          }
        }
        if (probe?.alive || isFreshState(n.state)) {
          this.#pushLatency(n.mac, now, probe?.alive ? probe.rttMs : null)
        }
      }

      // MACが取れないが応答したIP（ルーター越しの別セグメント等）は IP ベースで追跡
      for (const [ip, probe] of results) {
        if (!probe.alive || neighborByIp.has(ip) || ip === iface?.address) continue
        const key = `ip:${ip}`
        const device = this.#upsertDevice(key, { ip, now, alive: true, rttMs: probe.rttMs, method: probe.method })
        device.ipBased = true
        macsSeen.add(key)
        this.#pushLatency(key, now, probe.rttMs)
      }

      // ホスト名の解決（新規 or 未解決のオンライン端末のみ・裏で実行）
      for (const key of macsSeen) {
        const d = this.store.data.devices[key]
        if (d && !d.hostname && d.ip) {
          this._hostnameLimit(async () => {
            const name = await resolveHostname(d.ip)
            if (name) {
              d.hostname = name
              this.store.save()
            }
          }).catch(() => {})
        }
      }

      this.lastScanAt = Date.now()
      this.lastPingRoundAt = this.lastScanAt
      this.lastScanDurationMs = this.lastScanAt - started
      this.store.save()
    } finally {
      this.scanning = false
    }
  }

  // 既知デバイスだけを対象にした軽い死活監視
  async pingRound() {
    if (this.scanning) return
    const devices = Object.values(this.store.data.devices).filter((d) => d.ip && !d.hidden)
    if (devices.length === 0) return
    const limit = pLimit(MONITOR_CONCURRENCY)
    const results = new Map()
    await Promise.all(
      devices.map((d) =>
        limit(async () => {
          results.set(d.mac, await probeHost(d.ip))
        })
      )
    )
    // ping に応答しない端末も ARP が新鮮なら生存とみなす
    const neighbors = await readNeighbors(this.iface?.name)
    const freshByMac = new Map()
    for (const n of neighbors) if (isFreshState(n.state)) freshByMac.set(n.mac, n)

    const now = Date.now()
    for (const d of devices) {
      const probe = results.get(d.mac)
      const fresh = freshByMac.get(d.mac)
      if (probe?.alive) {
        d.lastSeen = now
        d.lastRttMs = probe.rttMs
        d.lastRttAt = now
        d.probeMethod = probe.method
        this.#pushLatency(d.mac, now, probe.rttMs)
      } else if (fresh) {
        d.lastSeen = now
        d.probeMethod = 'arp'
        this.#pushLatency(d.mac, now, null)
      } else if (!d.self) {
        this.#pushLatency(d.mac, now, null)
      }
    }
    if (this.iface?.mac) {
      const self = this.store.data.devices[this.iface.mac]
      if (self) self.lastSeen = now
    }
    this.lastPingRoundAt = now
    this.store.save()
  }

  #upsertDevice(key, { ip, now, alive, rttMs, method }) {
    const devices = this.store.data.devices
    let d = devices[key]
    if (!d) {
      const { vendor, randomized } = lookupVendor(key)
      d = devices[key] = {
        mac: key,
        ip,
        name: '',
        category: '',
        note: '',
        hostname: '',
        vendor,
        randomizedMac: randomized,
        firstSeen: now,
        lastSeen: alive ? now : null,
        lastRttMs: null,
        lastRttAt: null,
        probeMethod: method,
        hidden: false,
      }
      console.log(`[scanner] 新しいデバイスを検出: ${key} (${ip})`)
    }
    d.ip = ip
    if (alive) {
      d.lastSeen = now
      d.probeMethod = method
      if (rttMs != null) {
        d.lastRttMs = rttMs
        d.lastRttAt = now
      }
    }
    return d
  }

  #pushLatency(mac, t, ms) {
    let arr = this.latencyHistory.get(mac)
    if (!arr) {
      arr = []
      this.latencyHistory.set(mac, arr)
    }
    arr.push({ t, ms: ms != null ? Math.round(ms * 10) / 10 : null })
    if (arr.length > LATENCY_HISTORY_MAX) arr.splice(0, arr.length - LATENCY_HISTORY_MAX)
  }

  // 公開用のデバイス一覧（オンライン判定は猶予付きで算出）
  publicDevices({ includeHidden = false } = {}) {
    const graceMs = Math.max(this.settings.offlineGraceSec, this.settings.pingIntervalSec * 2) * 1000
    const now = Date.now()
    return Object.values(this.store.data.devices)
      .filter((d) => includeHidden || !d.hidden)
      .map((d) => ({
        ...d,
        online: !!d.lastSeen && now - d.lastSeen <= graceMs,
        isNew: now - d.firstSeen < 24 * 3600 * 1000,
      }))
  }

  overview() {
    const devices = this.publicDevices()
    return {
      deviceCount: devices.length,
      onlineCount: devices.filter((d) => d.online).length,
      newCount24h: devices.filter((d) => d.isNew).length,
      lastScanAt: this.lastScanAt,
      lastScanDurationMs: this.lastScanDurationMs,
      scanning: this.scanning,
      iface: this.iface ? { name: this.iface.name, address: this.iface.address } : null,
      subnets: this.subnets,
      gatewayIp: this.gatewayIp,
      capabilities: probeCapabilities(),
      serverTime: Date.now(),
    }
  }

  latencyOf(mac) {
    return this.latencyHistory.get(mac) || []
  }

  broadcastAddress() {
    return broadcastForInterface(this.iface)
  }

  // デモ用: 過去2時間ぶんのそれっぽい応答履歴を合成する
  seedDemoHistory() {
    const now = Date.now()
    for (const d of Object.values(this.store.data.devices)) {
      if (!d.lastSeen || d.hidden) continue
      const base = 2 + Math.random() * 12
      const arr = []
      for (let i = LATENCY_HISTORY_MAX; i > 0; i--) {
        const t = now - i * 30_000
        const lost = Math.random() < 0.02
        const ms = base + Math.sin(i / 9) * base * 0.3 + Math.random() * 2.5
        arr.push({ t, ms: lost ? null : Math.round(ms * 10) / 10 })
      }
      this.latencyHistory.set(d.mac, arr)
    }
  }
}
