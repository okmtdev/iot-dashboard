import { h, field, textInput, btn } from '../ui.js'
import { widgetMessage } from './common.js'

export default {
  type: 'links',
  name: 'クイックリンク',
  emoji: '🔗',
  description: 'ルーター管理画面やNASなど、よく使うURLをまとめるランチャー',
  defaultLayout: { w: 4, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({ links: [] }),
  needsConfig: true,

  mount(config) {
    const links = (config.links || []).filter((l) => l.url)
    if (links.length === 0) {
      return { el: widgetMessage('🔗 設定からリンクを追加できます'), destroy() {} }
    }
    const el = h(
      'div',
      { class: 'w-links' },
      links.map((l) =>
        h(
          'a',
          { class: 'w-link', href: l.url, target: '_blank', rel: 'noopener noreferrer', title: l.url },
          h('span', { class: 'w-link-emoji' }, l.emoji || '🔗'),
          h('span', { class: 'w-link-label' }, l.label || l.url)
        )
      )
    )
    return { el, destroy() {} }
  },

  configForm(draft) {
    if (!Array.isArray(draft.links)) draft.links = []
    const rows = h('div', { class: 'form' })
    const render = () => {
      rows.replaceChildren(
        ...draft.links.map((l, i) =>
          h(
            'div',
            { class: 'row-gap' },
            textInput({ value: l.emoji || '', placeholder: '🔗', class: 'input input-emoji', onInput: (v) => (l.emoji = v) }),
            textInput({ value: l.label || '', placeholder: '名前', onInput: (v) => (l.label = v) }),
            textInput({ value: l.url || '', placeholder: 'http://192.168.1.1', onInput: (v) => (l.url = v) }),
            h(
              'button',
              {
                class: 'icon-btn',
                type: 'button',
                title: '削除',
                onClick: () => {
                  draft.links.splice(i, 1)
                  render()
                },
              },
              '🗑️'
            )
          )
        ),
        btn({
          label: '＋ リンクを追加',
          onClick: () => {
            draft.links.push({ emoji: '', label: '', url: '' })
            render()
          },
        })
      )
    }
    render()
    return h(
      'div',
      { class: 'form' },
      h('p', { class: 'form-note' }, 'ルーター管理画面・NAS・プリンター設定など、家の中のURLをまとめておくと便利です。'),
      rows
    )
  },
}
