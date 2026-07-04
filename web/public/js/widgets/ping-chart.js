import { h, s, field, textInput } from '../ui.js'
import { api } from '../api.js'
import { fmtMs } from '../format.js'
import { widgetMessage, deviceSelect, cleanupBag } from './common.js'

function niceMax(v) {
  if (v <= 1) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 5, 10]) {
    if (v <= m * pow) return m * pow
  }
  return 10 * pow
}

export default {
  type: 'ping-chart',
  name: '応答時間グラフ',
  emoji: '📈',
  description: '1台のデバイスへのping応答時間の推移と損失率をグラフ表示',
  defaultLayout: { w: 5, h: 4, minW: 3, minH: 3 },
  defaultConfig: () => ({ mac: '', title: '' }),
  needsConfig: true,

  mount(config) {
    if (!config.mac) {
      return { el: widgetMessage('📈 設定から対象デバイスを選んでください'), destroy() {} }
    }
    const bag = cleanupBag()
    const statsEl = h('div', { class: 'w-ping-stats' })
    const chartWrap = h('div', { class: 'w-ping-chart' })
    const el = h('div', { class: 'w-ping' }, statsEl, chartWrap)

    let history = []
    let name = ''
    let size = { w: 300, h: 120 }

    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && (Math.abs(r.width - size.w) > 2 || Math.abs(r.height - size.h) > 2)) {
        size = { w: r.width, h: r.height }
        renderChart()
      }
    })
    obs.observe(chartWrap)
    bag.add(() => obs.disconnect())

    const renderStats = () => {
      const ok = history.filter((p) => p.ms != null)
      const lossPct = history.length ? ((history.length - ok.length) / history.length) * 100 : 0
      const avg = ok.length ? ok.reduce((sum, p) => sum + p.ms, 0) / ok.length : null
      const current = history.length ? history[history.length - 1].ms : null
      statsEl.replaceChildren(
        h('span', { class: 'w-ping-name' }, config.title || name),
        h('span', {}, '現在 ', h('b', {}, fmtMs(current))),
        h('span', {}, '平均 ', h('b', {}, avg != null ? fmtMs(avg) : '-')),
        h('span', { class: lossPct > 5 ? 'is-crit' : '' }, `損失 ${lossPct.toFixed(0)}%`)
      )
    }

    let tooltip = null
    const renderChart = () => {
      if (history.length < 2) {
        chartWrap.replaceChildren(widgetMessage('データを収集中です…（数十秒お待ちください）'))
        return
      }
      const W = Math.max(80, size.w)
      const H = Math.max(50, size.h)
      const padL = 34
      const padB = 14
      const padT = 6
      const plotW = W - padL - 6
      const plotH = H - padT - padB
      const values = history.filter((p) => p.ms != null).map((p) => p.ms)
      const yMax = niceMax(Math.max(1, ...values))
      const stepX = plotW / (history.length - 1)
      const yOf = (ms) => padT + plotH - (ms / yMax) * plotH
      const xOf = (i) => padL + i * stepX

      let d = ''
      let pen = false
      history.forEach((p, i) => {
        if (p.ms == null) {
          pen = false
          return
        }
        d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(p.ms).toFixed(1)}`
        pen = true
      })

      const svg = s('svg', { width: W, height: H, class: 'w-ping-svg' })
      for (const f of [0, 0.5, 1]) {
        svg.append(
          s('line', { x1: padL, x2: W - 4, y1: yOf(yMax * f), y2: yOf(yMax * f), stroke: 'var(--c-grid)', 'stroke-width': 1 }),
          s(
            'text',
            { x: padL - 5, y: yOf(yMax * f) + 3.5, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--c-muted)' },
            String(yMax * f >= 10 ? Math.round(yMax * f) : (yMax * f).toFixed(yMax < 2 ? 1 : 0))
          )
        )
      }
      svg.append(s('path', { d, fill: 'none', stroke: 'var(--c-series1)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
      history.forEach((p, i) => {
        if (p.ms == null) {
          svg.append(s('rect', { x: xOf(i) - 1.25, y: padT + plotH - 5, width: 2.5, height: 5, rx: 1, fill: 'var(--c-crit)' }))
        }
      })
      const spanMin = Math.round((history[history.length - 1].t - history[0].t) / 60000)
      svg.append(
        s(
          'text',
          { x: W - 6, y: H - 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--c-muted)' },
          `直近${spanMin > 0 ? `${spanMin}分` : '数十秒'} / ms`
        )
      )

      // ホバー: 最寄り点のクロスヘア + ツールチップ
      const hoverLine = s('line', { y1: padT, y2: padT + plotH, stroke: 'var(--c-muted)', 'stroke-dasharray': '3 3', 'stroke-width': 1, visibility: 'hidden' })
      const hoverDot = s('circle', { r: 3.5, fill: 'var(--c-series1)', stroke: 'var(--c-surface)', 'stroke-width': 1.5, visibility: 'hidden' })
      svg.append(hoverLine, hoverDot)
      svg.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect()
        const i = Math.max(0, Math.min(history.length - 1, Math.round((e.clientX - rect.left - padL) / stepX)))
        const p = history[i]
        hoverLine.setAttribute('x1', xOf(i))
        hoverLine.setAttribute('x2', xOf(i))
        hoverLine.setAttribute('visibility', 'visible')
        if (p.ms != null) {
          hoverDot.setAttribute('cx', xOf(i))
          hoverDot.setAttribute('cy', yOf(p.ms))
          hoverDot.setAttribute('visibility', 'visible')
        } else {
          hoverDot.setAttribute('visibility', 'hidden')
        }
        if (!tooltip) {
          tooltip = h('div', { class: 'w-ping-tip' })
          chartWrap.append(tooltip)
        }
        tooltip.style.left = `${Math.min(Math.max(xOf(i) - 50, 0), W - 110)}px`
        tooltip.replaceChildren(
          h('div', { class: 'w-ping-tip-time' }, new Date(p.t).toLocaleTimeString('ja-JP')),
          h('div', { class: `w-ping-tip-val ${p.ms == null ? 'is-crit' : ''}` }, p.ms == null ? '応答なし' : fmtMs(p.ms))
        )
        tooltip.style.display = 'block'
      })
      svg.addEventListener('mouseleave', () => {
        hoverLine.setAttribute('visibility', 'hidden')
        hoverDot.setAttribute('visibility', 'hidden')
        if (tooltip) tooltip.style.display = 'none'
      })
      chartWrap.replaceChildren(svg)
      if (tooltip) {
        tooltip.style.display = 'none'
        chartWrap.append(tooltip)
      }
    }

    const load = async () => {
      try {
        const data = await api.latency(config.mac)
        history = data.history || []
        name = data.name || config.mac
        renderStats()
        renderChart()
      } catch {
        // 一時的な取得失敗は無視して次回に賭ける
      }
    }
    load()
    bag.interval(load, 15_000)
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      field('監視するデバイス', deviceSelect(draft.mac, (v) => (draft.mac = v))),
      field('タイトル（任意）', textInput({ value: draft.title || '', placeholder: '例: ルーターの応答', onInput: (v) => (draft.title = v) })),
      h('p', { class: 'form-note' }, '応答履歴はサーバーのメモリに保持されます（再起動でリセット）。')
    )
  },
}
