import { h, s, field, textInput, select, toggle, segmented } from '../ui.js'
import { TIMEZONES } from '../timezones.js'
import { cleanupBag } from './common.js'

function timeParts(date, timezone, hour12) {
  try {
    const fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: hour12 ? 'h12' : 'h23',
    })
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
    return { hour: parts.hour, minute: parts.minute, second: parts.second, dayPeriod: parts.dayPeriod || '' }
  } catch {
    return { hour: '--', minute: '--', second: '--', dayPeriod: '' }
  }
}

function dateLabel(date, timezone) {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(date)
  } catch {
    return ''
  }
}

function renderAnalog(svg, date, timezone, size) {
  const p = timeParts(date, timezone, false)
  const hh = Number(p.hour) % 12
  const mm = Number(p.minute)
  const ss = (date.getTime() % 60000) / 1000
  const r = size / 2
  const angles = [
    { a: hh * 30 + mm * 0.5, len: r * 0.5, w: Math.max(3, size * 0.03), color: 'var(--c-ink)' },
    { a: mm * 6 + ss * 0.1, len: r * 0.72, w: Math.max(2, size * 0.02), color: 'var(--c-ink)' },
    { a: ss * 6, len: r * 0.8, w: 1.5, color: 'var(--c-accent)' },
  ]
  svg.replaceChildren(
    s('circle', { cx: r, cy: r, r: r - 2, fill: 'var(--c-surface2)', stroke: 'var(--c-line)' }),
    ...Array.from({ length: 12 }, (_, i) => {
      const rad = (i * 30 * Math.PI) / 180
      const inner = r - Math.max(8, size * 0.08)
      return s('line', {
        x1: r + Math.cos(rad) * inner,
        y1: r + Math.sin(rad) * inner,
        x2: r + Math.cos(rad) * (r - 5),
        y2: r + Math.sin(rad) * (r - 5),
        stroke: i % 3 === 0 ? 'var(--c-sub)' : 'var(--c-grid)',
        'stroke-width': i % 3 === 0 ? 2.5 : 1.5,
        'stroke-linecap': 'round',
      })
    }),
    ...angles.map(({ a, len, w, color }) => {
      const rad = ((a - 90) * Math.PI) / 180
      return s('line', {
        x1: r,
        y1: r,
        x2: r + Math.cos(rad) * len,
        y2: r + Math.sin(rad) * len,
        stroke: color,
        'stroke-width': w,
        'stroke-linecap': 'round',
      })
    }),
    s('circle', { cx: r, cy: r, r: Math.max(3, size * 0.025), fill: 'var(--c-accent)' })
  )
}

export default {
  type: 'clock',
  name: '時計・日付',
  emoji: '🕒',
  description: '国・地域を選べる時計（デジタル/アナログ・日付表示）',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({
    timezone: 'Asia/Tokyo',
    label: '日本 (東京)',
    style: 'digital',
    showSeconds: true,
    showDate: true,
    hour12: false,
  }),
  needsConfig: false,

  mount(config) {
    const bag = cleanupBag()
    const tz = config.timezone || 'Asia/Tokyo'
    const el = h('div', { class: 'w-clock' })
    let size = { w: 200, h: 120 }

    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) {
        size = { w: r.width, h: r.height }
        render()
      }
    })
    obs.observe(el)
    bag.add(() => obs.disconnect())

    let svg = null
    const render = () => {
      const now = new Date()
      if (config.style === 'analog') {
        const dim = Math.max(60, Math.min(size.w - 16, size.h - (config.showDate ? 52 : 24)))
        if (!svg || Number(svg.getAttribute('width')) !== Math.round(dim)) {
          svg = s('svg', { width: Math.round(dim), height: Math.round(dim), class: 'w-clock-analog' })
        }
        renderAnalog(svg, now, tz, Math.round(dim))
        el.replaceChildren(
          svg,
          config.showDate ? h('div', { class: 'w-clock-date' }, dateLabel(now, tz)) : null,
          config.label ? h('div', { class: 'w-clock-label' }, config.label) : null
        )
        el.classList.add('w-clock-center')
      } else {
        const p = timeParts(now, tz, config.hour12)
        const fontPx = Math.max(22, Math.min(size.w / (config.showSeconds ? 5.4 : 3.8), size.h * 0.42))
        el.replaceChildren(
          h(
            'div',
            { class: 'w-clock-time', style: { fontSize: `${fontPx}px` } },
            config.hour12 && p.dayPeriod ? h('span', { class: 'w-clock-ampm' }, p.dayPeriod) : null,
            `${p.hour}:${p.minute}`,
            config.showSeconds ? h('span', { class: 'w-clock-sec' }, `:${p.second}`) : null
          ),
          config.showDate ? h('div', { class: 'w-clock-date' }, dateLabel(now, tz)) : null,
          config.label ? h('div', { class: 'w-clock-label' }, config.label) : null
        )
      }
    }
    render()
    bag.interval(render, config.style === 'analog' ? 100 : 250)
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    const isPreset = TIMEZONES.some((t) => t.tz === draft.timezone)
    const tzArea = h('div', {})
    const renderTz = (custom) => {
      tzArea.replaceChildren(
        custom
          ? h(
              'div',
              { class: 'row-gap' },
              textInput({
                value: draft.timezone,
                placeholder: '例: Europe/Madrid',
                onInput: (v) => (draft.timezone = v),
              }),
              h('button', { class: 'link-btn', type: 'button', onClick: () => renderTz(false) }, '一覧から選ぶ')
            )
          : select({
              options: [...TIMEZONES.map((t) => ({ value: t.tz, label: t.label })), { value: '__custom__', label: 'その他（手入力）…' }],
              value: draft.timezone,
              onChange: (v) => {
                if (v === '__custom__') return renderTz(true)
                draft.timezone = v
                draft.label = TIMEZONES.find((t) => t.tz === v)?.label || v
                labelInput.value = draft.label
              },
            })
      )
    }
    const labelInput = textInput({ value: draft.label || '', onInput: (v) => (draft.label = v) })
    renderTz(!isPreset)

    return h(
      'div',
      { class: 'form' },
      field('国・地域（タイムゾーン）', tzArea),
      field('表示ラベル', labelInput, '空欄にするとラベルを表示しません'),
      field(
        'スタイル',
        segmented({
          options: [
            { value: 'digital', label: 'デジタル' },
            { value: 'analog', label: 'アナログ' },
          ],
          value: draft.style || 'digital',
          onChange: (v) => (draft.style = v),
        })
      ),
      h(
        'div',
        { class: 'row-wrap' },
        toggle({ checked: !!draft.showSeconds, label: '秒を表示', onChange: (v) => (draft.showSeconds = v) }),
        toggle({ checked: !!draft.showDate, label: '日付を表示', onChange: (v) => (draft.showDate = v) }),
        toggle({ checked: !!draft.hour12, label: '12時間表記', onChange: (v) => (draft.hour12 = v) })
      )
    )
  },
}
