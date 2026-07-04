import { h, field, select, toggle } from '../ui.js'
import { TIMEZONES } from '../timezones.js'
import { cleanupBag } from './common.js'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 指定タイムゾーンの「今日」を {y, m, d} で得る
function todayIn(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const g = (t) => Number(parts.find((p) => p.type === t).value)
    return { y: g('year'), m: g('month') - 1, d: g('day') }
  } catch {
    const n = new Date()
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
  }
}

export default {
  type: 'calendar',
  name: 'カレンダー',
  emoji: '📅',
  description: '今月のカレンダー。今日をハイライト表示（タイムゾーン選択可）',
  defaultLayout: { w: 4, h: 4, minW: 3, minH: 4 },
  defaultConfig: () => ({ timezone: 'Asia/Tokyo', weekStart: 0 }),
  needsConfig: false,

  mount(config) {
    const bag = cleanupBag()
    const tz = config.timezone || 'Asia/Tokyo'
    const weekStart = config.weekStart === 1 ? 1 : 0
    const today = todayIn(tz)
    let view = { y: today.y, m: today.m } // 表示中の年月（前後に移動可）
    const el = h('div', { class: 'w-cal' })

    const render = () => {
      const first = new Date(view.y, view.m, 1)
      const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
      const leadRaw = first.getDay() - weekStart
      const lead = (leadRaw + 7) % 7
      const cells = []
      for (let i = 0; i < lead; i++) cells.push(null)
      for (let d = 1; d <= daysInMonth; d++) cells.push(d)

      const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
      const isCurrentMonth = view.y === today.y && view.m === today.m

      el.replaceChildren(
        h(
          'div',
          { class: 'w-cal-head' },
          h('button', { class: 'w-cal-nav', type: 'button', title: '前の月', onClick: () => move(-1) }, '‹'),
          h('div', { class: 'w-cal-month' }, `${view.y}年 ${view.m + 1}月`),
          h('button', { class: 'w-cal-nav', type: 'button', title: '次の月', onClick: () => move(1) }, '›')
        ),
        h(
          'div',
          { class: 'w-cal-grid' },
          order.map((wd) =>
            h('div', { class: `w-cal-wd ${wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : ''}` }, WEEKDAYS[wd])
          ),
          cells.map((d, idx) => {
            if (d == null) return h('div', { class: 'w-cal-cell is-empty' })
            const wd = order[idx % 7]
            const isToday = isCurrentMonth && d === today.d
            return h(
              'div',
              { class: `w-cal-cell ${isToday ? 'is-today' : ''} ${wd === 0 ? 'is-sun' : wd === 6 ? 'is-sat' : ''}` },
              String(d)
            )
          })
        ),
        !isCurrentMonth
          ? h('button', { class: 'w-cal-back', type: 'button', onClick: () => ((view = { y: today.y, m: today.m }), render()) }, '今日に戻る')
          : null
      )
    }
    const move = (delta) => {
      let m = view.m + delta
      let y = view.y
      if (m < 0) {
        m = 11
        y--
      } else if (m > 11) {
        m = 0
        y++
      }
      view = { y, m }
      render()
    }
    render()
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      field(
        'タイムゾーン',
        select({
          options: TIMEZONES.map((t) => ({ value: t.tz, label: t.label })),
          value: draft.timezone || 'Asia/Tokyo',
          onChange: (v) => (draft.timezone = v),
        })
      ),
      toggle({
        checked: draft.weekStart === 1,
        label: '月曜はじまりにする',
        onChange: (v) => (draft.weekStart = v ? 1 : 0),
      })
    )
  },
}
