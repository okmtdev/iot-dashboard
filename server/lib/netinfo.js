import os from 'node:os'
import fs from 'node:fs'

export function ipToInt(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

export function intToIp(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function netmaskToPrefix(mask) {
  const n = ipToInt(mask)
  if (n == null) return null
  let bits = 0
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) bits++
    else break
  }
  return bits
}

export function parseCidr(cidr) {
  const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(String(cidr).trim())
  if (!m) return null
  const base = ipToInt(m[1])
  const prefix = Number(m[2])
  if (base == null || prefix < 0 || prefix > 32) return null
  return { base, prefix }
}

// IPv4アドレスを持つ非内部インターフェースの一覧
export function listInterfaces() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      out.push({
        name,
        address: a.address,
        netmask: a.netmask,
        prefix: netmaskToPrefix(a.netmask) ?? 24,
        mac: (a.mac || '').toLowerCase(),
      })
    }
  }
  return out
}

// /proc/net/route からデフォルトゲートウェイを取得（Linux）
export function getDefaultRoute() {
  try {
    const text = fs.readFileSync('/proc/net/route', 'utf8')
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 8) continue
      const [iface, dest, gwHex, flags] = [cols[0], cols[1], cols[2], parseInt(cols[3], 16)]
      // dest 00000000 かつ RTF_GATEWAY(0x2)
      if (dest === '00000000' && (flags & 0x2)) {
        const gw = parseInt(gwHex, 16) // リトルエンディアン
        const gateway = [gw & 255, (gw >>> 8) & 255, (gw >>> 16) & 255, (gw >>> 24) & 255].join('.')
        return { iface, gateway }
      }
    }
  } catch {
    // /proc が読めない環境ではフォールバックなし（後段で先頭インターフェースを使用）
  }
  return null
}

export function pickInterface(interfaceOverride = '') {
  const ifaces = listInterfaces()
  if (interfaceOverride) {
    const hit = ifaces.find((i) => i.name === interfaceOverride)
    if (hit) return hit
  }
  const route = getDefaultRoute()
  if (route) {
    const hit = ifaces.find((i) => i.name === route.iface)
    if (hit) return { ...hit, gateway: route.gateway }
  }
  return ifaces[0] || null
}

const MAX_HOSTS_TOTAL = 1024

// スキャン対象のホストIP一覧を返す。/22より広いレンジはホスト自身の/24に丸める。
export function hostsForCidr(base, prefix, selfIp) {
  if (prefix >= 31) return [intToIp(base)]
  if (prefix < 22) {
    const self = selfIp ? ipToInt(selfIp) : null
    if (self != null) {
      base = (self & 0xffffff00) >>> 0
      prefix = 24
    } else {
      prefix = 22
    }
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const network = (base & mask) >>> 0
  const size = 2 ** (32 - prefix)
  const ips = []
  for (let i = 1; i < size - 1 && ips.length < MAX_HOSTS_TOTAL; i++) {
    ips.push(intToIp((network + i) >>> 0))
  }
  return ips
}

// 設定（カンマ区切りCIDR上書き）とインターフェース情報からスキャン対象を決める
export function scanTargets(settings = {}) {
  const iface = pickInterface(settings.interfaceOverride)
  const subnets = []
  const ips = new Set()

  const overrides = String(settings.subnetOverride || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (overrides.length > 0) {
    for (const cidr of overrides) {
      const parsed = parseCidr(cidr)
      if (!parsed) continue
      subnets.push(cidr)
      for (const ip of hostsForCidr(parsed.base, parsed.prefix, iface?.address)) {
        if (ips.size >= MAX_HOSTS_TOTAL) break
        ips.add(ip)
      }
    }
  } else if (iface) {
    const base = (ipToInt(iface.address) ?? 0) >>> 0
    const effPrefix = iface.prefix < 22 ? 24 : iface.prefix
    const mask = (0xffffffff << (32 - effPrefix)) >>> 0
    subnets.push(`${intToIp((base & mask) >>> 0)}/${effPrefix}`)
    for (const ip of hostsForCidr(base, iface.prefix, iface.address)) ips.add(ip)
  }

  if (iface?.address) ips.delete(iface.address)
  return { iface, subnets, ips: [...ips] }
}

export function broadcastForInterface(iface) {
  if (!iface) return null
  const base = ipToInt(iface.address)
  if (base == null) return null
  const prefix = iface.prefix ?? 24
  if (prefix >= 31) return null
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return intToIp(((base & mask) | ~mask) >>> 0)
}
