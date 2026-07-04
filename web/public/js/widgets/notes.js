import { h, field, segmented } from '../ui.js'
import { renderMarkdown } from '../markdown.js'
import { widgetMessage } from './common.js'

// テキストエリアの選択範囲を before/after で囲む
function surround(ta, before, after = before, placeholder = 'テキスト') {
  const s = ta.selectionStart
  const e = ta.selectionEnd
  const val = ta.value
  const sel = val.slice(s, e) || placeholder
  ta.value = val.slice(0, s) + before + sel + after + val.slice(e)
  ta.focus()
  ta.selectionStart = s + before.length
  ta.selectionEnd = s + before.length + sel.length
}

// カーソル行の先頭に prefix を挿入
function prefixLine(ta, prefix) {
  const s = ta.selectionStart
  const val = ta.value
  const lineStart = val.lastIndexOf('\n', s - 1) + 1
  ta.value = val.slice(0, lineStart) + prefix + val.slice(lineStart)
  ta.focus()
  ta.selectionStart = ta.selectionEnd = s + prefix.length
}

const TOOLBAR = [
  { label: 'H1', title: '見出し', act: (ta) => prefixLine(ta, '# ') },
  { label: 'H2', title: '小見出し', act: (ta) => prefixLine(ta, '## ') },
  { label: '𝐁', title: '太字', act: (ta) => surround(ta, '**') },
  { label: '𝐼', title: '斜体', act: (ta) => surround(ta, '*') },
  { label: 'S̶', title: '打ち消し', act: (ta) => surround(ta, '~~') },
  { label: '• 一覧', title: '箇条書き', act: (ta) => prefixLine(ta, '- ') },
  { label: '☑ チェック', title: 'チェックリスト', act: (ta) => prefixLine(ta, '- [ ] ') },
  { label: '❝ 引用', title: '引用', act: (ta) => prefixLine(ta, '> ') },
  { label: '‹ ›', title: 'コード', act: (ta) => surround(ta, '`', '`', 'コード') },
  { label: '🔗', title: 'リンク', act: (ta) => surround(ta, '[', '](https://)', 'リンク名') },
]

const PLACEHOLDER = `# 今週のメモ

**ゴミの日**: 火・金（燃えるゴミ）

- [x] 牛乳を買う
- [ ] ルーターのファーム更新
- [ ] 玄関カメラのSDカード確認

> Wi-Fiパスワードは冷蔵庫の裏に貼ってあります

管理画面 → [ルーター](http://192.168.1.1)`

export default {
  type: 'notes',
  name: 'メモ',
  emoji: '📝',
  description: '家族への伝言や覚え書き。Markdown（見出し・太字・チェックリスト等）に対応',
  defaultLayout: { w: 3, h: 4, minW: 2, minH: 2 },
  defaultConfig: () => ({ text: '', size: 'md' }),
  needsConfig: true,

  mount(config) {
    if (!config.text || !config.text.trim()) {
      return { el: widgetMessage('📝 設定からメモを入力できます（Markdown対応）'), destroy() {} }
    }
    const el = h('div', { class: `w-notes md-scroll w-notes-${config.size || 'md'}` }, renderMarkdown(config.text))
    return { el, destroy() {} }
  },

  configForm(draft) {
    const ta = h('textarea', {
      class: 'input md-editor',
      rows: 10,
      spellcheck: 'false',
      placeholder: PLACEHOLDER,
      value: draft.text || '',
      onInput: (e) => {
        draft.text = e.target.value
        renderPreview()
      },
    })

    const preview = h('div', { class: 'md-preview' })
    const renderPreview = () => {
      preview.replaceChildren(
        draft.text && draft.text.trim()
          ? renderMarkdown(draft.text)
          : h('span', { class: 'form-note' }, 'ここにプレビューが表示されます')
      )
    }
    renderPreview()

    const toolbar = h(
      'div',
      { class: 'md-toolbar' },
      TOOLBAR.map((b) =>
        h(
          'button',
          {
            type: 'button',
            class: 'md-tool',
            title: b.title,
            // mousedown で処理してテキストエリアの選択が外れないようにする
            onMousedown: (e) => {
              e.preventDefault()
              b.act(ta)
              draft.text = ta.value
              renderPreview()
            },
          },
          b.label
        )
      )
    )

    return h(
      'div',
      { class: 'form' },
      field('メモの内容', h('div', { class: 'md-edit' }, toolbar, ta), 'Markdown が使えます（# 見出し、**太字**、- [ ] チェックリスト など）'),
      field('プレビュー', preview),
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
