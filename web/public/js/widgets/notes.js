import { h, field, textarea, segmented } from '../ui.js'
import { widgetMessage } from './common.js'

export default {
  type: 'notes',
  name: 'メモ',
  emoji: '📝',
  description: '家族への伝言や覚え書きを貼っておけるメモ',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({ text: '', size: 'md' }),
  needsConfig: true,

  mount(config) {
    const el = config.text
      ? h('div', { class: `w-notes w-notes-${config.size || 'md'}` }, config.text)
      : widgetMessage('✏️ 設定からメモを入力できます')
    return { el, destroy() {} }
  },

  configForm(draft) {
    return h(
      'div',
      { class: 'form' },
      field(
        'メモの内容',
        textarea({
          value: draft.text || '',
          rows: 6,
          placeholder: '例:\n・ゴミの日は火・金\n・Wi-Fiパスワードは冷蔵庫の裏',
          onInput: (v) => (draft.text = v),
        })
      ),
      field(
        '文字サイズ',
        segmented({
          options: [
            { value: 'sm', label: '小' },
            { value: 'md', label: '中' },
            { value: 'lg', label: '大' },
          ],
          value: draft.size || 'md',
          onChange: (v) => (draft.size = v),
        })
      )
    )
  },
}
