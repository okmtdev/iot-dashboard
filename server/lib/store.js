import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const DEFAULT_SETTINGS = {
  scanIntervalSec: 180, // ネットワーク全体スキャンの間隔
  pingIntervalSec: 30, // 既知デバイスの死活監視間隔
  offlineGraceSec: 120, // 最後に確認できてからオフライン判定するまでの猶予
  subnetOverride: '', // 例: "192.168.1.0/24, 192.168.10.0/24"（空なら自動検出）
  interfaceOverride: '', // 例: "eth0"（空なら自動検出）
}

export function uid(prefix = '') {
  return prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 10)
}

export function starterWidgets() {
  return [
    {
      id: uid('w'),
      type: 'clock',
      layout: { x: 0, y: 0, w: 3, h: 3 },
      config: { timezone: 'Asia/Tokyo', label: '日本 (東京)', style: 'digital', showSeconds: true, showDate: true, hour12: false },
    },
    {
      id: uid('w'),
      type: 'network-summary',
      layout: { x: 3, y: 0, w: 3, h: 3 },
      config: {},
    },
    {
      id: uid('w'),
      type: 'system-monitor',
      layout: { x: 6, y: 0, w: 6, h: 3 },
      config: { showSparkline: true },
    },
    {
      id: uid('w'),
      type: 'weather',
      layout: { x: 0, y: 3, w: 6, h: 5 },
      config: { locationName: '東京', lat: 35.6895, lon: 139.6917, showHourly: true, showWeekly: true },
    },
    {
      id: uid('w'),
      type: 'device-status',
      layout: { x: 6, y: 3, w: 6, h: 5 },
      config: { mode: 'auto', macs: [], showLatency: true },
    },
  ]
}

function defaultData() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    devices: {},
    dashboards: [
      {
        id: uid('d'),
        name: 'ホーム',
        icon: '🏠',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        widgets: starterWidgets(),
      },
    ],
  }
}

// 小規模データ向けの JSON ファイルストア。
// 書き込みは一時ファイル + rename でアトミックに行い、デバウンスでまとめる。
export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir
    this.file = path.join(dataDir, 'db.json')
    this.data = null
    this._timer = null
    this._dirty = false
  }

  load() {
    fs.mkdirSync(this.dataDir, { recursive: true })
    if (fs.existsSync(this.file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
        this.data = {
          ...defaultData(),
          ...raw,
          settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
          devices: raw.devices || {},
          dashboards: Array.isArray(raw.dashboards) ? raw.dashboards : [],
        }
        // 起動時に1世代だけバックアップを残す
        fs.copyFileSync(this.file, this.file + '.bak')
      } catch (err) {
        console.error(`[store] ${this.file} の読み込みに失敗したため初期化します:`, err.message)
        this.data = defaultData()
      }
    } else {
      this.data = defaultData()
      this.flushSync()
    }
    return this
  }

  save() {
    this._dirty = true
    if (this._timer) return
    this._timer = setTimeout(() => {
      this._timer = null
      if (this._dirty) this.flushSync()
    }, 800)
    this._timer.unref?.()
  }

  flushSync() {
    if (!this.data) return
    this._dirty = false
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1))
    fs.renameSync(tmp, this.file)
  }
}
