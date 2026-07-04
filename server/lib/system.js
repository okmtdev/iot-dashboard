import fs from 'node:fs'
import os from 'node:os'

let prevCpu = null
let prevNet = null
let cached = null
let cachedAt = 0

function readCpuTimes() {
  try {
    const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0]
    const nums = line.trim().split(/\s+/).slice(1).map(Number)
    const [user, nice, system, idle, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums
    return { idle: idle + iowait, total: user + nice + system + idle + iowait + irq + softirq + steal }
  } catch {
    return null
  }
}

function cpuPercent() {
  const cur = readCpuTimes()
  if (!cur) return null
  let pct = null
  if (prevCpu && cur.total > prevCpu.total) {
    const totalD = cur.total - prevCpu.total
    const idleD = cur.idle - prevCpu.idle
    pct = Math.max(0, Math.min(100, (1 - idleD / totalD) * 100))
  }
  prevCpu = cur
  return pct
}

function memInfo() {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8')
    const get = (key) => {
      const m = new RegExp(`^${key}:\\s+(\\d+) kB`, 'm').exec(text)
      return m ? Number(m[1]) * 1024 : null
    }
    const total = get('MemTotal')
    const available = get('MemAvailable')
    if (total == null || available == null) return null
    return { total, used: total - available }
  } catch {
    return null
  }
}

async function diskInfo(path = '/') {
  try {
    const s = await fs.promises.statfs(path)
    const total = s.blocks * s.bsize
    const free = s.bavail * s.bsize
    return { total, used: total - free }
  } catch {
    return null
  }
}

function temperature() {
  try {
    const zones = fs.readdirSync('/sys/class/thermal').filter((d) => d.startsWith('thermal_zone'))
    let best = null
    for (const z of zones) {
      try {
        const raw = Number(fs.readFileSync(`/sys/class/thermal/${z}/temp`, 'utf8').trim())
        const type = fs.readFileSync(`/sys/class/thermal/${z}/type`, 'utf8').trim()
        const celsius = raw > 1000 ? raw / 1000 : raw
        if (celsius > 0 && celsius < 150 && (best == null || celsius > best.celsius)) {
          best = { celsius, sensor: type }
        }
      } catch {
        continue
      }
    }
    return best
  } catch {
    return null
  }
}

function netRates(ifaceName) {
  try {
    const text = fs.readFileSync('/proc/net/dev', 'utf8')
    let rx = 0
    let tx = 0
    for (const line of text.split('\n').slice(2)) {
      const m = /^\s*([^:]+):\s*(.+)$/.exec(line)
      if (!m) continue
      const name = m[1].trim()
      if (name === 'lo') continue
      if (ifaceName && name !== ifaceName) continue
      const cols = m[2].trim().split(/\s+/).map(Number)
      rx += cols[0]
      tx += cols[8]
    }
    const now = Date.now()
    let rates = null
    if (prevNet && now > prevNet.t) {
      const dt = (now - prevNet.t) / 1000
      rates = {
        rxBytesPerSec: Math.max(0, (rx - prevNet.rx) / dt),
        txBytesPerSec: Math.max(0, (tx - prevNet.tx) / dt),
      }
    }
    prevNet = { t: now, rx, tx }
    return rates
  } catch {
    return null
  }
}

export async function getSystemStats(ifaceName = null) {
  const now = Date.now()
  if (cached && now - cachedAt < 1000) return cached
  const load = os.loadavg()
  cached = {
    hostname: os.hostname(),
    uptimeSec: os.uptime(),
    cores: os.cpus().length,
    loadavg1: Math.round(load[0] * 100) / 100,
    cpuPercent: cpuPercent(),
    memory: memInfo(),
    disk: await diskInfo('/'),
    temperature: temperature(),
    network: netRates(ifaceName),
    at: now,
  }
  cachedAt = now
  return cached
}
