export function timeAgo(ts) {
  if (!ts) return '未確認'
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (sec < 10) return 'たった今'
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day}日前`
  return new Date(ts).toLocaleDateString('ja-JP')
}

export function fmtDateTime(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtBytes(bytes, perSec = false) {
  if (bytes == null || !Number.isFinite(bytes)) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}${perSec ? '/s' : ''}`
}

export function fmtMs(ms) {
  if (ms == null) return '-'
  if (ms < 1) return '<1ms'
  return `${ms >= 100 ? Math.round(ms) : ms.toFixed(1)}ms`
}

export function fmtUptime(sec) {
  if (sec == null) return '-'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}日 ${h}時間`
  if (h > 0) return `${h}時間 ${m}分`
  return `${m}分`
}

export function ipSortKey(ip) {
  if (!ip) return Number.MAX_SAFE_INTEGER
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(Number.isNaN)) return Number.MAX_SAFE_INTEGER
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3]
}

export function deviceLabel(device) {
  if (!device) return '不明なデバイス'
  return device.name || device.hostname || (device.ipBased ? device.ip : device.mac)
}

export function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function uid(prefix = 'w') {
  return prefix + Math.random().toString(36).slice(2, 10)
}
