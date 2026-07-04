import { h, field, textInput, statusDot, toast } from '../ui.js'
import { api } from '../api.js'
import { devicesPoller } from '../state.js'
import { deviceLabel, timeAgo } from '../format.js'
import { categoryOf } from '../categories.js'
import { widgetMessage, deviceSelect, cleanupBag } from './common.js'

export default {
  type: 'wol',
  name: 'リモート起動 (WoL)',
  emoji: '⚡',
  description: 'Wake-on-LANでPCやNASをワンタップ起動',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({ mac: '', label: '' }),
  needsConfig: true,

  mount(config) {
    if (!config.mac) {
      return { el: widgetMessage('⚡ 設定から対象デバイスを選んでください'), destroy() {} }
    }
    const bag = cleanupBag()
    const el = h('div', { class: 'w-wol' })
    let sending = false

    const render = () => {
      const devices = devicesPoller.get().data?.devices || []
      const device = devices.find((d) => d.mac === config.mac)
      el.replaceChildren(
        h(
          'div',
          { class: 'w-wol-name' },
          statusDot(device?.online),
          h('span', {}, `${categoryOf(device?.category).emoji} ${config.label || deviceLabel(device) || config.mac}`)
        ),
        h(
          'div',
          { class: 'w-wol-sub' },
          device?.online ? '現在オンラインです' : device?.lastSeen ? `最終確認: ${timeAgo(device.lastSeen)}` : 'オフライン'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary w-wol-btn',
            disabled: sending,
            onClick: async () => {
              sending = true
              render()
              try {
                await api.wake(config.mac)
                toast('success', 'マジックパケットを送信しました。起動まで少し待ちます…')
              } catch (err) {
                toast('error', `送信に失敗しました: ${err.message}`)
              } finally {
                sending = false
                render()
              }
            },
          },
          sending ? '送信中…' : '⚡ 起動する (WoL)'
        ),
        h('div', { class: 'w-wol-hint' }, '対象デバイス側で Wake-on-LAN が有効になっている必要があります')
      )
    }
    bag.add(devicesPoller.subscribe(render))
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      field('起動するデバイス', deviceSelect(draft.mac, (v) => (draft.mac = v))),
      field('表示名（任意）', textInput({ value: draft.label || '', placeholder: '例: デスクトップPC', onInput: (v) => (draft.label = v) }))
    )
  },
}
