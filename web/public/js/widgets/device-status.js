import { h, field, toggle, segmented, statusDot } from '../ui.js'
import { devicesPoller } from '../state.js'
import { deviceLabel, fmtMs, ipSortKey, timeAgo } from '../format.js'
import { categoryOf } from '../categories.js'
import { widgetMessage, deviceMultiPicker, cleanupBag } from './common.js'

export default {
  type: 'device-status',
  name: 'デバイス死活モニター',
  emoji: '🟢',
  description: '選んだデバイス（または全デバイス）のオンライン状態と応答時間を一覧表示',
  defaultLayout: { w: 4, h: 5, minW: 2, minH: 3 },
  defaultConfig: () => ({ mode: 'auto', macs: [], showLatency: true }),
  needsConfig: false,

  mount(config) {
    const bag = cleanupBag()
    const el = h('div', { class: 'w-devstat' })

    const render = ({ data }) => {
      const devices = data?.devices || []
      const mode = config.mode || 'auto'
      let list =
        mode === 'auto'
          ? devices.filter((d) => !d.hidden)
          : (config.macs || []).map((mac) => devices.find((d) => d.mac === mac)).filter(Boolean)
      list = [...list].sort((a, b) => Number(b.online) - Number(a.online) || ipSortKey(a.ip) - ipSortKey(b.ip))

      if (list.length === 0) {
        el.replaceChildren(
          widgetMessage(mode === 'auto' ? '📡 デバイスをスキャン中です…' : '⚙️ 設定から監視するデバイスを選んでください')
        )
        return
      }
      const online = list.filter((d) => d.online).length
      el.replaceChildren(
        h('div', { class: 'w-devstat-head' }, h('b', {}, `${online}/${list.length}`), ' 台オンライン'),
        h(
          'div',
          { class: 'w-devstat-list' },
          list.map((d) =>
            h(
              'div',
              { class: 'w-devstat-row', title: `${d.ip || ''} ${d.ipBased ? '' : d.mac}` },
              statusDot(d.online),
              h('span', { class: 'w-devstat-emoji' }, categoryOf(d.category).emoji),
              h('span', { class: `w-devstat-name ${d.online ? '' : 'is-off'}` }, deviceLabel(d)),
              d.online
                ? config.showLatency !== false
                  ? h('span', { class: 'w-devstat-ms' }, d.lastRttMs != null ? fmtMs(d.lastRttMs) : '—')
                  : null
                : h('span', { class: 'w-devstat-ago' }, timeAgo(d.lastSeen))
            )
          )
        )
      )
    }
    bag.add(devicesPoller.subscribe(render))
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    const pickerArea = h('div', {})
    const renderPicker = () => {
      pickerArea.replaceChildren(
        (draft.mode || 'auto') === 'manual' ? deviceMultiPicker(draft.macs || [], (macs) => (draft.macs = macs)) : ''
      )
    }
    renderPicker()
    return h(
      'div',
      { class: 'form' },
      field(
        '対象デバイス',
        segmented({
          options: [
            { value: 'auto', label: 'すべて（自動）' },
            { value: 'manual', label: '選んだものだけ' },
          ],
          value: draft.mode || 'auto',
          onChange: (v) => {
            draft.mode = v
            renderPicker()
          },
        })
      ),
      pickerArea,
      toggle({ checked: draft.showLatency !== false, label: '応答時間 (ping) を表示', onChange: (v) => (draft.showLatency = v) })
    )
  },
}
