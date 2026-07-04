import { h, field, textInput, toggle } from '../ui.js'
import { cleanupBag } from './common.js'

function todayMidnight() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

// 対象日までの残り日数を計算（毎年繰り返しなら次回の記念日を対象にする）
function computeTarget(dateStr, repeatYearly) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '')
  if (!m) return null
  const today = todayMidnight()
  let target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  let years = null
  if (repeatYearly) {
    const origin = new Date(target)
    target = new Date(today.getFullYear(), origin.getMonth(), origin.getDate())
    if (target < today) target.setFullYear(today.getFullYear() + 1)
    years = target.getFullYear() - origin.getFullYear()
  }
  const days = Math.round((target - today) / 86400000)
  return { target, days, years }
}

export default {
  type: 'countdown',
  name: 'カウントダウン',
  emoji: '⏳',
  description: '記念日・旅行・締切などその日までの残り日数を大きく表示',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({ title: '', date: '', emoji: '🎉', repeatYearly: false }),
  needsConfig: true,

  mount(config) {
    if (!config.date) {
      return { el: widgetMsg('⏳ 設定から日付を指定してください'), destroy() {} }
    }
    const bag = cleanupBag()
    const el = h('div', { class: 'w-count' })

    const render = () => {
      const info = computeTarget(config.date, config.repeatYearly)
      if (!info) {
        el.replaceChildren(widgetMsg('日付の形式が不正です'))
        return
      }
      const { days, target, years } = info
      let big
      let sub
      if (days === 0) {
        big = h('div', { class: 'w-count-today' }, `${config.emoji || '🎉'} 今日です！`)
        sub = years ? `${years}周年` : ''
      } else if (days > 0) {
        big = h(
          'div',
          { class: 'w-count-num' },
          h('span', { class: 'w-count-emoji' }, config.emoji || '🎉'),
          h('span', { class: 'w-count-days' }, String(days)),
          h('span', { class: 'w-count-unit' }, '日')
        )
        sub = 'あと'
      } else {
        big = h(
          'div',
          { class: 'w-count-num is-past' },
          h('span', { class: 'w-count-days' }, String(-days)),
          h('span', { class: 'w-count-unit' }, '日')
        )
        sub = '経過'
      }
      const dateLabel = target.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      el.replaceChildren(
        config.title ? h('div', { class: 'w-count-title' }, config.title) : null,
        days !== 0 ? h('div', { class: 'w-count-lead' }, sub) : null,
        big,
        h('div', { class: 'w-count-date' }, `${dateLabel}${config.repeatYearly && years ? ` ・ ${years}周年` : ''}`)
      )
    }
    render()
    // 日付が変わると残り日数も変わるので1分ごとに再計算
    bag.interval(render, 60_000)
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      field('タイトル', textInput({ value: draft.title || '', placeholder: '例: 家族旅行、結婚記念日', onInput: (v) => (draft.title = v) })),
      field(
        '日付',
        h('input', {
          class: 'input',
          type: 'date',
          value: draft.date || '',
          onInput: (e) => (draft.date = e.target.value),
        })
      ),
      field('アイコン（絵文字）', textInput({ value: draft.emoji || '🎉', class: 'input input-emoji', onInput: (v) => (draft.emoji = v) })),
      toggle({ checked: !!draft.repeatYearly, label: '毎年くり返す（誕生日・記念日など）', onChange: (v) => (draft.repeatYearly = v) })
    )
  },
}

function widgetMsg(text) {
  return h('div', { class: 'w-msg' }, text)
}
