import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// フォトウィジェット用の画像アップロード置き場（DATA_DIR/uploads）

export const IMAGE_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const UPLOAD_NAME_RE = /^img_[a-z0-9]{16}\.(jpg|png|webp|gif|avif)$/

export const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

export function uploadsDirOf(dataDir) {
  return path.join(dataDir, 'uploads')
}

// 先頭バイトで実際の画像形式を軽く検証する（Content-Type偽装対策）
export function sniffImage(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return 'gif'
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (buf.slice(4, 8).toString('latin1') === 'ftyp') return 'avif'
  return null
}

export async function saveUpload(dataDir, buf, ext) {
  const dir = uploadsDirOf(dataDir)
  await fs.promises.mkdir(dir, { recursive: true })
  const name = `img_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}.${ext}`
  await fs.promises.writeFile(path.join(dir, name), buf)
  return name
}

// どのウィジェットからも参照されなくなった画像を削除する。
// アップロード直後（設定保存前）を消さないよう、1時間の猶予を置く。
export function gcUploads(store) {
  const dir = uploadsDirOf(store.dataDir)
  let files
  try {
    files = fs.readdirSync(dir)
  } catch {
    return
  }
  const referenced = new Set()
  for (const dashboard of store.data.dashboards) {
    for (const w of dashboard.widgets || []) {
      if (w.type !== 'photo') continue
      for (const p of w.config?.photos || []) {
        if (p?.file) referenced.add(p.file)
      }
    }
  }
  const cutoff = Date.now() - 3600_000
  let removed = 0
  for (const file of files) {
    if (!UPLOAD_NAME_RE.test(file) || referenced.has(file)) continue
    try {
      const full = path.join(dir, file)
      if (fs.statSync(full).mtimeMs < cutoff) {
        fs.unlinkSync(full)
        removed++
      }
    } catch {
      continue
    }
  }
  if (removed > 0) console.log(`[uploads] 未使用の画像を${removed}件削除しました`)
}
