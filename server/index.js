import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Store } from './lib/store.js'
import { Scanner } from './lib/scanner.js'
import { createApiRouter } from './routes/api.js'
import { serveStatic } from './lib/http.js'
import { seedDemoDevices, keepDemoAlive, demoScannerState } from './lib/demo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.HOST || '0.0.0.0'
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'))
const DEMO = process.env.DEMO === '1'
const NO_SCAN = process.env.NO_SCAN === '1' || DEMO

const version = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version
const publicDir = path.join(rootDir, 'web', 'public')

const store = new Store(DATA_DIR).load()
const scanner = new Scanner(store)

if (DEMO) {
  seedDemoDevices(store)
  keepDemoAlive(store, scanner)
  scanner.seedDemoHistory()
  demoScannerState(scanner)
  console.log('[demo] デモモードで起動します（ネットワークスキャンは行いません）')
}
if (!NO_SCAN) scanner.start()

const router = createApiRouter({ store, scanner, version, demo: DEMO })

// BASIC_AUTH_USER / BASIC_AUTH_PASS を設定した場合のみ Basic 認証を有効化
const AUTH_USER = process.env.BASIC_AUTH_USER
const AUTH_PASS = process.env.BASIC_AUTH_PASS
const authExpected =
  AUTH_USER && AUTH_PASS ? 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64') : null
if (authExpected) console.log('[auth] Basic認証を有効化しました')

function checkAuth(req, res) {
  if (!authExpected) return true
  const got = Buffer.from(req.headers.authorization || '')
  const want = Buffer.from(authExpected)
  if (got.length === want.length && crypto.timingSafeEqual(got, want)) return true
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="iot-dashboard"',
    'Content-Type': 'text/plain; charset=utf-8',
  })
  res.end('認証が必要です')
  return false
}

const server = http.createServer(async (req, res) => {
  try {
    if (!checkAuth(req, res)) return
    if (await router.handle(req, res)) return
    if (serveStatic(publicDir, req, res)) return
    if (req.url.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'APIエンドポイントが見つかりません' }))
      return
    }
    // ハッシュルーティングのSPAなので、未知のパスは index.html へ
    req.url = '/'
    if (serveStatic(publicDir, req, res)) return
    res.writeHead(404).end('Not Found')
  } catch (err) {
    console.error('[server]', err)
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('サーバーエラーが発生しました')
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[server] iot-dashboard v${version} が http://${HOST}:${PORT} で起動しました`)
  console.log(`[server] データ保存先: ${store.file}`)
})

function shutdown(signal) {
  console.log(`[server] ${signal} を受信、終了します`)
  scanner.stop()
  store.flushSync()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
