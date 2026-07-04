import { Router, HttpError } from '../lib/http.js'
import { uid, starterWidgets } from '../lib/store.js'
import { sendWol, normalizeMac } from '../lib/wol.js'
import { getSystemStats } from '../lib/system.js'
import { forecast, geocode, demoForecast } from '../lib/weather.js'

const MAC_KEY_RE = /^(([0-9a-f]{2}:){5}[0-9a-f]{2}|ip:\d+\.\d+\.\d+\.\d+)$/

export function createApiRouter({ store, scanner, version, demo = false }) {
  const router = new Router()

  router.get('/api/health', (c) => c.json(200, { ok: true, version }))

  router.get('/api/overview', (c) => c.json(200, { ...scanner.overview(), version }))

  // ---- デバイス ----

  router.get('/api/devices', (c) => {
    c.json(200, scanner.publicDevices({ includeHidden: c.query.get('includeHidden') === '1' }))
  })

  router.patch('/api/devices/:mac', async (c) => {
    const mac = c.params.mac.toLowerCase()
    const device = store.data.devices[mac]
    if (!device) throw new HttpError(404, 'デバイスが見つかりません')
    const { name, category, note, hidden } = await c.body()
    if (name !== undefined) device.name = String(name).slice(0, 60)
    if (category !== undefined) device.category = String(category).slice(0, 30)
    if (note !== undefined) device.note = String(note).slice(0, 2000)
    if (hidden !== undefined) device.hidden = !!hidden
    store.save()
    c.json(200, device)
  })

  router.delete('/api/devices/:mac', (c) => {
    const mac = c.params.mac.toLowerCase()
    if (!store.data.devices[mac]) throw new HttpError(404, 'デバイスが見つかりません')
    delete store.data.devices[mac]
    scanner.latencyHistory.delete(mac)
    store.save()
    c.json(200, { ok: true })
  })

  router.get('/api/devices/:mac/latency', (c) => {
    const mac = c.params.mac.toLowerCase()
    if (!MAC_KEY_RE.test(mac)) throw new HttpError(400, 'MACアドレスの形式が不正です')
    const device = store.data.devices[mac]
    c.json(200, {
      mac,
      name: device?.name || device?.hostname || mac,
      history: scanner.latencyOf(mac),
    })
  })

  router.post('/api/devices/:mac/wake', async (c) => {
    const mac = normalizeMac(c.params.mac)
    if (!mac) throw new HttpError(400, 'MACアドレスの形式が不正です')
    const result = await sendWol(mac, { broadcast: scanner.broadcastAddress() })
    c.json(200, { ok: true, ...result })
  })

  // ---- スキャン ----

  router.post('/api/scan', (c) => {
    if (!scanner.scanning) {
      scanner.sweep().catch((err) => console.error('[scanner] 手動スキャン失敗:', err))
    }
    c.json(202, { scanning: true })
  })

  // ---- ダッシュボード ----

  router.get('/api/dashboards', (c) => c.json(200, store.data.dashboards))

  router.post('/api/dashboards', async (c) => {
    const { name, icon, preset } = await c.body()
    const dashboard = {
      id: uid('d'),
      name: String(name || '新しいダッシュボード').slice(0, 40),
      icon: String(icon || '📊').slice(0, 8),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      widgets: preset === 'starter' ? starterWidgets() : [],
    }
    store.data.dashboards.push(dashboard)
    store.save()
    c.json(201, dashboard)
  })

  router.put('/api/dashboards/:id', async (c) => {
    const dashboard = store.data.dashboards.find((d) => d.id === c.params.id)
    if (!dashboard) throw new HttpError(404, 'ダッシュボードが見つかりません')
    const { name, icon, widgets } = await c.body()
    if (name !== undefined) dashboard.name = String(name).slice(0, 40)
    if (icon !== undefined) dashboard.icon = String(icon).slice(0, 8)
    if (widgets !== undefined) {
      if (!Array.isArray(widgets) || widgets.length > 80) {
        throw new HttpError(400, 'ウィジェットの形式が不正です')
      }
      const cleaned = []
      for (const w of widgets) {
        if (!w || typeof w !== 'object') continue
        const layout = w.layout || {}
        cleaned.push({
          id: String(w.id || uid('w')).slice(0, 20),
          type: String(w.type || '').slice(0, 40),
          layout: {
            x: Math.max(0, Math.min(11, Number(layout.x) || 0)),
            y: Math.max(0, Math.min(4000, Number(layout.y) || 0)),
            w: Math.max(1, Math.min(12, Number(layout.w) || 3)),
            h: Math.max(1, Math.min(48, Number(layout.h) || 3)),
          },
          config: w.config && typeof w.config === 'object' ? w.config : {},
        })
      }
      if (JSON.stringify(cleaned).length > 300_000) {
        throw new HttpError(400, 'ダッシュボードのデータが大きすぎます')
      }
      dashboard.widgets = cleaned
    }
    dashboard.updatedAt = Date.now()
    store.save()
    c.json(200, dashboard)
  })

  router.delete('/api/dashboards/:id', (c) => {
    const idx = store.data.dashboards.findIndex((d) => d.id === c.params.id)
    if (idx === -1) throw new HttpError(404, 'ダッシュボードが見つかりません')
    store.data.dashboards.splice(idx, 1)
    store.save()
    c.json(200, { ok: true })
  })

  // ---- 外部情報・システム ----

  router.get('/api/system', async (c) => {
    c.json(200, await getSystemStats(scanner.iface?.name))
  })

  router.get('/api/weather', async (c) => {
    if (demo) return c.json(200, demoForecast(c.query.get('lat'), c.query.get('lon')))
    c.json(200, await forecast(c.query.get('lat'), c.query.get('lon')))
  })

  router.get('/api/geocode', async (c) => {
    c.json(200, await geocode(c.query.get('q')))
  })

  // ---- 設定・データ ----

  router.get('/api/settings', (c) => {
    c.json(200, { ...store.data.settings, dataFile: store.file })
  })

  router.put('/api/settings', async (c) => {
    const body = await c.body()
    const s = store.data.settings
    const intIn = (v, min, max) => {
      const n = Math.round(Number(v))
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null
    }
    if (body.scanIntervalSec !== undefined) s.scanIntervalSec = intIn(body.scanIntervalSec, 30, 3600) ?? s.scanIntervalSec
    if (body.pingIntervalSec !== undefined) s.pingIntervalSec = intIn(body.pingIntervalSec, 5, 600) ?? s.pingIntervalSec
    if (body.offlineGraceSec !== undefined) s.offlineGraceSec = intIn(body.offlineGraceSec, 30, 3600) ?? s.offlineGraceSec
    if (body.subnetOverride !== undefined) {
      const raw = String(body.subnetOverride).trim()
      const parts = raw ? raw.split(',').map((p) => p.trim()) : []
      const valid = parts.every((p) => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(p))
      if (!valid) throw new HttpError(400, 'サブネットは "192.168.1.0/24" 形式（カンマ区切り可）で入力してください')
      s.subnetOverride = parts.join(', ')
    }
    if (body.interfaceOverride !== undefined) s.interfaceOverride = String(body.interfaceOverride).trim().slice(0, 30)
    store.save()
    c.json(200, { ...s, dataFile: store.file })
  })

  router.get('/api/export', (c) => {
    c.res.setHeader('Content-Disposition', 'attachment; filename="iot-dashboard-backup.json"')
    c.json(200, store.data)
  })

  return router
}
