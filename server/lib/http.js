import fs from 'node:fs'
import path from 'node:path'

// 依存ゼロで動かすための小さなHTTPルーター & 静的ファイル配信

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

const MAX_BODY = 1024 * 1024

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function compilePattern(pattern) {
  const keys = []
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            keys.push(seg.slice(1))
            return '([^/]+)'
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('/') +
      '$'
  )
  return { regex, keys }
}

function readBody(req, maxBytes = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new HttpError(413, 'リクエストが大きすぎます'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export class Router {
  constructor() {
    this.routes = []
  }

  add(method, pattern, handler) {
    this.routes.push({ method, ...compilePattern(pattern), handler })
    return this
  }

  get(p, h) {
    return this.add('GET', p, h)
  }
  post(p, h) {
    return this.add('POST', p, h)
  }
  put(p, h) {
    return this.add('PUT', p, h)
  }
  patch(p, h) {
    return this.add('PATCH', p, h)
  }
  delete(p, h) {
    return this.add('DELETE', p, h)
  }

  // マッチしたら処理して true、しなければ false
  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    for (const route of this.routes) {
      if (route.method !== req.method) continue
      const m = route.regex.exec(pathname)
      if (!m) continue
      const params = {}
      route.keys.forEach((k, i) => (params[k] = m[i + 1]))
      const ctx = {
        req,
        res,
        params,
        query: url.searchParams,
        json(status, obj) {
          const body = JSON.stringify(obj)
          res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(body)
        },
        async body() {
          const raw = await readBody(req)
          if (raw.length === 0) return {}
          try {
            return JSON.parse(raw.toString('utf8'))
          } catch {
            throw new HttpError(400, 'JSONの形式が不正です')
          }
        },
        raw(maxBytes) {
          return readBody(req, maxBytes)
        },
      }
      try {
        await route.handler(ctx)
      } catch (err) {
        const status = err.status || 500
        if (status >= 500) console.error('[api]', err)
        if (!res.headersSent) {
          ctx.json(status, { error: err.message || 'サーバーエラーが発生しました' })
        } else {
          res.end()
        }
      }
      return true
    }
    return false
  }
}

// 静的ファイル配信（パストラバーサル対策込み）
export function serveStatic(rootDir, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  const url = new URL(req.url, 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.resolve(rootDir, '.' + pathname)
  if (!filePath.startsWith(path.resolve(rootDir) + path.sep) && filePath !== path.resolve(rootDir)) {
    res.writeHead(403).end('Forbidden')
    return true
  }
  let stat
  try {
    stat = fs.statSync(filePath)
  } catch {
    return false
  }
  if (!stat.isFile()) return false
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') return res.end(), true
  fs.createReadStream(filePath).pipe(res)
  return true
}
