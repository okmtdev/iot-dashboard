import { execFile } from 'node:child_process'
import net from 'node:net'

// 同時実行数を制限する小さなヘルパー
export function pLimit(concurrency) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= concurrency || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--
        next()
      })
  }
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject })
      next()
    })
}

let pingAvailable = null

export async function detectPing() {
  if (pingAvailable != null) return pingAvailable
  pingAvailable = await new Promise((resolve) => {
    execFile('ping', ['-V'], { timeout: 3000 }, (err) => {
      // BusyBox等は -V で非0を返すことがあるため、ENOENT以外は「あり」とみなす
      resolve(!(err && err.code === 'ENOENT'))
    })
  })
  return pingAvailable
}

export function pingProbe(ip, timeoutSec = 1) {
  return new Promise((resolve) => {
    execFile(
      'ping',
      ['-n', '-c', '1', '-W', String(timeoutSec), ip],
      { timeout: timeoutSec * 1000 + 1500 },
      (err, stdout) => {
        if (err) return resolve({ alive: false, rttMs: null, method: 'icmp' })
        const m = /time[=<]([\d.]+)\s*ms/.exec(stdout || '')
        resolve({ alive: true, rttMs: m ? Number(m[1]) : null, method: 'icmp' })
      }
    )
  })
}

const TCP_PROBE_PORTS = [80, 443, 22, 8080, 554, 8009, 445, 631]

// ping バイナリがない環境向けのフォールバック。
// 接続成功だけでなく RST（ECONNREFUSED）も「ホスト生存」とみなす。
export function tcpProbe(ip, { ports = TCP_PROBE_PORTS, timeoutMs = 900 } = {}) {
  return new Promise((resolve) => {
    let pending = ports.length
    let done = false
    const sockets = []
    const finish = (result) => {
      if (done) return
      done = true
      for (const s of sockets) s.destroy()
      resolve(result)
    }
    if (pending === 0) return finish({ alive: false, rttMs: null, method: 'tcp' })
    for (const port of ports) {
      const started = Date.now()
      const sock = net.connect({ host: ip, port, family: 4 })
      sockets.push(sock)
      sock.setTimeout(timeoutMs)
      sock.once('connect', () => finish({ alive: true, rttMs: Date.now() - started, method: 'tcp' }))
      sock.once('error', (err) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          finish({ alive: true, rttMs: Date.now() - started, method: 'tcp' })
        } else if (--pending === 0) {
          finish({ alive: false, rttMs: null, method: 'tcp' })
        }
      })
      sock.once('timeout', () => {
        sock.destroy()
        if (--pending === 0) finish({ alive: false, rttMs: null, method: 'tcp' })
      })
    }
  })
}

export async function probeHost(ip, { pingTimeoutSec = 1, tcpFallback = true } = {}) {
  if (await detectPing()) return pingProbe(ip, pingTimeoutSec)
  if (tcpFallback) return tcpProbe(ip)
  return { alive: false, rttMs: null, method: 'none' }
}

export function probeCapabilities() {
  return { ping: pingAvailable === true, tcpFallback: pingAvailable === false }
}
