import { h, statusDot, textInput } from '../ui.js'
import { devicesPoller } from '../state.js'
import { deviceLabel, ipSortKey } from '../format.js'
import { categoryOf } from '../categories.js'

export function widgetMessage(text) {
  return h('div', { class: 'w-msg' }, text)
}

export function sortedDevices(devices) {
  return [...devices]
    .filter((d) => !d.hidden)
    .sort((a, b) => Number(b.online) - Number(a.online) || ipSortKey(a.ip) - ipSortKey(b.ip))
}

// 単一デバイス選択セレクト（設定フォーム用）
export function deviceSelect(value, onChange) {
  const devices = sortedDevices(devicesPoller.get().data?.devices || [])
  return h(
    'select',
    { class: 'input', onChange: (e) => onChange(e.target.value) },
    h('option', { value: '', selected: !value }, '-- デバイスを選択 --'),
    devices.map((d) =>
      h(
        'option',
        { value: d.mac, selected: d.mac === value },
        `${categoryOf(d.category).emoji} ${deviceLabel(d)} (${d.ip || 'IP不明'})`
      )
    )
  )
}

// 複数デバイス選択チェックリスト（設定フォーム用）
export function deviceMultiPicker(selected, onChange) {
  const all = sortedDevices(devicesPoller.get().data?.devices || [])
  const listEl = h('div', { class: 'pick-list' })
  const render = (query = '') => {
    const q = query.toLowerCase()
    const list = all.filter(
      (d) => !q || [d.name, d.hostname, d.ip, d.mac, d.vendor].some((v) => v && String(v).toLowerCase().includes(q))
    )
    listEl.replaceChildren(
      ...(list.length === 0 ? [h('div', { class: 'pick-empty' }, 'デバイスが見つかりません')] : []),
      ...list.map((d) =>
        h(
          'label',
          { class: 'pick-row' },
          h('input', {
            type: 'checkbox',
            checked: selected.includes(d.mac),
            onChange: (e) => {
              const next = e.target.checked ? [...selected, d.mac] : selected.filter((m) => m !== d.mac)
              selected = next
              onChange(next)
            },
          }),
          statusDot(d.online),
          h('span', { class: 'pick-name' }, `${categoryOf(d.category).emoji} ${deviceLabel(d)}`),
          h('span', { class: 'pick-ip' }, d.ip || '')
        )
      )
    )
  }
  render()
  return h('div', { class: 'pick' }, textInput({ placeholder: '検索（名前・IP・MAC）', onInput: (v) => render(v) }), listEl)
}

// 破棄処理をまとめるヘルパー
export function cleanupBag() {
  const fns = []
  return {
    add: (fn) => fns.push(fn),
    interval: (fn, ms) => {
      const t = setInterval(fn, ms)
      fns.push(() => clearInterval(t))
    },
    run: () => fns.forEach((fn) => fn()),
  }
}
