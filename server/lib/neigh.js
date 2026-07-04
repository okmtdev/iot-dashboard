import { execFile } from 'node:child_process'
import fs from 'node:fs'

const FRESH_STATES = new Set(['REACHABLE', 'DELAY', 'PROBE'])

function isUsableMac(mac) {
  if (!mac) return false
  const m = mac.toLowerCase()
  return m !== '00:00:00:00:00:00' && m !== 'ff:ff:ff:ff:ff:ff'
}

function isUnicastV4(ip) {
  if (!ip || !ip.includes('.')) return false
  const first = Number(ip.split('.')[0])
  return first > 0 && first < 224
}

function readViaIpNeigh() {
  return new Promise((resolve) => {
    execFile('ip', ['-j', 'neigh', 'show'], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve(null)
      try {
        const rows = JSON.parse(stdout)
        resolve(
          rows
            .filter((r) => isUnicastV4(r.dst) && isUsableMac(r.lladdr))
            .map((r) => ({
              ip: r.dst,
              mac: r.lladdr.toLowerCase(),
              dev: r.dev,
              state: Array.isArray(r.state) ? r.state[0] : String(r.state || ''),
            }))
        )
      } catch {
        resolve(null)
      }
    })
  })
}

function readViaProcArp() {
  try {
    const text = fs.readFileSync('/proc/net/arp', 'utf8')
    const out = []
    for (const line of text.split('\n').slice(1)) {
      const cols = line.trim().split(/\s+/)
      if (cols.length < 6) continue
      const [ip, , flags, mac, , dev] = cols
      // 0x2 = ATF_COM（解決済み）。ただし鮮度は不明なので STALE 扱いにする。
      if ((parseInt(flags, 16) & 0x2) && isUnicastV4(ip) && isUsableMac(mac)) {
        out.push({ ip, mac: mac.toLowerCase(), dev, state: 'STALE' })
      }
    }
    return out
  } catch {
    return []
  }
}

// 近隣テーブル（ARP）を読む。iproute2 があれば状態付き、なければ /proc/net/arp。
export async function readNeighbors(ifaceName = null) {
  const rows = (await readViaIpNeigh()) ?? readViaProcArp()
  return ifaceName ? rows.filter((r) => !r.dev || r.dev === ifaceName) : rows
}

// ARP的に「今つながっている」とみなせる状態か
export function isFreshState(state) {
  return FRESH_STATES.has(String(state || '').toUpperCase())
}
