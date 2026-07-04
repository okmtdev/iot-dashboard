import { h, toast } from '../ui.js'
import { devicesPoller, scanNow } from '../state.js'
import { timeAgo } from '../format.js'
import { widgetMessage, cleanupBag } from './common.js'

export default {
  type: 'network-summary',
  name: 'ネットワークサマリー',
  emoji: '📡',
  description: 'オンライン台数・新規デバイス・最終スキャンなどの概況',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 3 },
  defaultConfig: () => ({}),
  needsConfig: false,

  mount() {
    const bag = cleanupBag()
    const el = h('div', { class: 'w-summary' })

    const render = ({ data }) => {
      const ov = data?.overview
      if (!ov) {
        el.replaceChildren(widgetMessage('読み込み中…'))
        return
      }
      el.replaceChildren(
        h(
          'div',
          { class: 'w-summary-big' },
          h('span', { class: 'num' }, String(ov.onlineCount)),
          h('span', { class: 'den' }, `/${ov.deviceCount}`),
          h('span', { class: 'unit' }, ' 台オンライン')
        ),
        h(
          'div',
          { class: 'w-summary-rows' },
          row('🆕 新しいデバイス (24h)', ov.newCount24h > 0 ? `${ov.newCount24h}台` : 'なし'),
          row('🕒 最終スキャン', ov.scanning ? 'スキャン中…' : timeAgo(ov.lastScanAt)),
          row('🌐 サブネット', ov.subnets?.join(', ') || '検出中')
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'mini-btn',
            disabled: ov.scanning,
            onClick: async () => {
              try {
                await scanNow()
                toast('info', 'スキャンを開始しました')
              } catch (err) {
                toast('error', err.message)
              }
            },
          },
          ov.scanning ? 'スキャン中…' : '🔍 今すぐスキャン'
        )
      )
    }
    const row = (k, v) => h('div', { class: 'w-summary-row' }, h('span', { class: 'k' }, k), h('span', { class: 'v', title: v }, v))

    bag.add(devicesPoller.subscribe(render))
    return { el, destroy: () => bag.run() }
  },

  configForm: null,
}
