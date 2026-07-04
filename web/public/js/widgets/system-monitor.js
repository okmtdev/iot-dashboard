import { h, s, toggle } from '../ui.js'
import { systemPoller } from '../state.js'
import { fmtBytes, fmtUptime } from '../format.js'
import { widgetMessage, cleanupBag } from './common.js'

function bar(percent) {
  const p = Math.max(0, Math.min(100, percent ?? 0))
  const color = p >= 90 ? 'var(--c-crit)' : p >= 70 ? 'var(--c-warn)' : 'var(--c-accent)'
  return h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: { width: `${p}%`, background: color } }))
}

function row(label, percentOrNull, value) {
  return h(
    'div',
    { class: 'w-sys-row' },
    h('span', { class: 'w-sys-label' }, label),
    percentOrNull != null ? bar(percentOrNull) : h('span', { class: 'meter-none' }),
    h('span', { class: 'w-sys-value' }, value)
  )
}

function sparkline(values, width = 90, height = 24, max = 100) {
  const svg = s('svg', { width, height, class: 'w-sys-spark', 'aria-hidden': 'true' })
  if (values.length < 2) return svg
  const stepX = width / (values.length - 1)
  let d = ''
  values.forEach((v, i) => {
    const x = i * stepX
    const y = height - 2 - (Math.min(v, max) / max) * (height - 4)
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  })
  svg.append(s('path', { d, fill: 'none', stroke: 'var(--c-series1)', 'stroke-width': 2, 'stroke-linecap': 'round' }))
  return svg
}

export default {
  type: 'system-monitor',
  name: 'サーバーモニター',
  emoji: '🖥️',
  description: 'このアプリが動くmini PCのCPU・メモリ・ディスク・温度・通信量',
  defaultLayout: { w: 4, h: 3, minW: 3, minH: 3 },
  defaultConfig: () => ({ showSparkline: true }),
  needsConfig: false,

  mount(config) {
    const bag = cleanupBag()
    const el = h('div', { class: 'w-sys' })
    const cpuHistory = []

    const render = ({ data: stats, error }) => {
      if (error) {
        el.replaceChildren(widgetMessage(`取得エラー: ${error.message}`))
        return
      }
      if (!stats) {
        el.replaceChildren(widgetMessage('読み込み中…'))
        return
      }
      if (stats.cpuPercent != null && (cpuHistory.length === 0 || cpuHistory[cpuHistory.length - 1].at !== stats.at)) {
        cpuHistory.push({ at: stats.at, v: stats.cpuPercent })
        if (cpuHistory.length > 60) cpuHistory.shift()
      }
      const memPct = stats.memory ? (stats.memory.used / stats.memory.total) * 100 : null
      const diskPct = stats.disk ? (stats.disk.used / stats.disk.total) * 100 : null

      el.replaceChildren(
        h(
          'div',
          { class: 'w-sys-head' },
          h('span', { class: 'w-sys-host' }, `🖥️ ${stats.hostname} ・ 稼働 ${fmtUptime(stats.uptimeSec)}`),
          config.showSparkline !== false && cpuHistory.length > 1 ? sparkline(cpuHistory.map((x) => x.v)) : null
        ),
        h(
          'div',
          { class: 'w-sys-rows' },
          row('CPU', stats.cpuPercent, stats.cpuPercent != null ? `${stats.cpuPercent.toFixed(0)}%` : '計測中'),
          stats.memory ? row('メモリ', memPct, `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.total)}`) : null,
          stats.disk ? row('ディスク', diskPct, `${diskPct.toFixed(0)}% 使用`) : null,
          stats.temperature ? row('温度', stats.temperature.celsius, `${stats.temperature.celsius.toFixed(0)}℃`) : null,
          h(
            'div',
            { class: 'w-sys-row' },
            h('span', { class: 'w-sys-label' }, 'ネット'),
            h(
              'span',
              { class: 'w-sys-net' },
              `↓ ${fmtBytes(stats.network?.rxBytesPerSec, true)}　↑ ${fmtBytes(stats.network?.txBytesPerSec, true)}`
            )
          )
        )
      )
    }
    bag.add(systemPoller.subscribe(render))
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      h('p', { class: 'form-note' }, 'このアプリが動いているサーバー（mini PC）の状態を表示します。'),
      toggle({
        checked: draft.showSparkline !== false,
        label: 'CPU使用率の推移グラフを表示',
        onChange: (v) => (draft.showSparkline = v),
      })
    )
  },
}
