import { api } from './api.js'

// 購読者がいる間だけ動くポーリングストア
function createPoller(fetcher, intervalMs) {
  let data = null
  let error = null
  let timer = null
  let inflight = false
  const subs = new Set()

  const emit = () => {
    for (const fn of subs) fn({ data, error })
  }

  const tick = async () => {
    if (inflight) return
    if (document.hidden) return
    inflight = true
    try {
      data = await fetcher()
      error = null
    } catch (err) {
      error = err
    } finally {
      inflight = false
    }
    emit()
  }

  const start = () => {
    if (timer) return
    tick()
    timer = setInterval(tick, intervalMs)
  }
  const stop = () => {
    clearInterval(timer)
    timer = null
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && subs.size > 0) tick()
  })

  return {
    subscribe(fn) {
      subs.add(fn)
      if (subs.size === 1) start()
      fn({ data, error })
      return () => {
        subs.delete(fn)
        if (subs.size === 0) stop()
      }
    },
    refresh: () => tick(),
    get: () => ({ data, error }),
  }
}

// デバイス一覧 + 概況（アプリ全体で共有）
export const devicesPoller = createPoller(async () => {
  const [devices, overview] = await Promise.all([api.devices(true), api.overview()])
  return { devices, overview }
}, 10_000)

// サーバー（mini PC）のリソース状況
export const systemPoller = createPoller(() => api.system(), 5_000)

export async function scanNow() {
  await api.scan()
  setTimeout(() => devicesPoller.refresh(), 1500)
  setTimeout(() => devicesPoller.refresh(), 6000)
}

// ---- テーマ ----

const mq = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme() {
  return localStorage.getItem('theme') || 'system'
}

export function applyTheme() {
  const mode = getTheme()
  const dark = mode === 'dark' || (mode === 'system' && mq.matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(mode) {
  localStorage.setItem('theme', mode)
  applyTheme()
}

mq.addEventListener('change', applyTheme)
