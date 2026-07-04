import { h, field, textInput, toggle } from '../ui.js'
import { uid } from '../format.js'
import { cleanupBag } from './common.js'

// チェックの状態はウィジェット表示上でそのまま切り替えられ、サーバーに保存される。
export default {
  type: 'todo',
  name: 'やることリスト',
  emoji: '✅',
  description: 'チェックできる ToDo リスト。表示中にチェックするとそのまま保存されます',
  defaultLayout: { w: 3, h: 4, minW: 2, minH: 2 },
  defaultConfig: () => ({ title: '', items: [], hideDone: false }),
  needsConfig: false,

  mount(config, ctx = {}) {
    const bag = cleanupBag()
    const items = Array.isArray(config.items) ? config.items.map((it) => ({ ...it })) : []
    const el = h('div', { class: 'w-todo' })

    const persist = () => ctx.save?.({ items })

    const render = () => {
      const shown = config.hideDone ? items.filter((it) => !it.done) : items
      const doneCount = items.filter((it) => it.done).length
      el.replaceChildren(
        h(
          'div',
          { class: 'w-todo-head' },
          h('span', { class: 'w-todo-title' }, config.title || 'やること'),
          items.length ? h('span', { class: 'w-todo-count' }, `${doneCount}/${items.length}`) : null
        ),
        items.length
          ? h(
              'div',
              { class: 'w-todo-list' },
              shown.length
                ? shown.map((it) =>
                    h(
                      'label',
                      { class: `w-todo-item ${it.done ? 'is-done' : ''}` },
                      h('input', {
                        type: 'checkbox',
                        class: 'w-todo-check',
                        checked: it.done,
                        onChange: (e) => {
                          it.done = e.target.checked
                          persist()
                          render()
                        },
                      }),
                      h('span', { class: 'w-todo-text' }, it.text)
                    )
                  )
                : h('div', { class: 'w-todo-alldone' }, '🎉 すべて完了しました！')
            )
          : h('div', { class: 'w-msg' }, '✅ 設定から項目を追加できます'),
        // その場でサッと追加できる入力欄
        h('form', {
          class: 'w-todo-add',
          onSubmit: (e) => {
            e.preventDefault()
            const input = e.target.querySelector('input')
            const text = input.value.trim()
            if (!text) return
            items.push({ id: uid('t'), text, done: false })
            input.value = ''
            persist()
            render()
            el.querySelector('.w-todo-add input')?.focus()
          },
        }, h('input', { class: 'w-todo-addinput', placeholder: '＋ 項目を追加してEnter', 'aria-label': '項目を追加' }))
      )
    }
    render()
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    if (!Array.isArray(draft.items)) draft.items = []
    const rows = h('div', { class: 'form' })
    const render = () => {
      rows.replaceChildren(
        ...draft.items.map((it, i) =>
          h(
            'div',
            { class: 'row-gap' },
            h('input', {
              type: 'checkbox',
              checked: it.done,
              title: '完了',
              onChange: (e) => (it.done = e.target.checked),
            }),
            textInput({ value: it.text || '', placeholder: '項目', onInput: (v) => (it.text = v) }),
            h(
              'button',
              {
                type: 'button',
                class: 'icon-btn',
                title: '削除',
                onClick: () => {
                  draft.items.splice(i, 1)
                  render()
                },
              },
              '🗑️'
            )
          )
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost',
            onClick: () => {
              draft.items.push({ id: uid('t'), text: '', done: false })
              render()
            },
          },
          '＋ 項目を追加'
        )
      )
    }
    render()
    return h(
      'div',
      { class: 'form' },
      field('タイトル', textInput({ value: draft.title || '', placeholder: '例: 買い物リスト', onInput: (v) => (draft.title = v) })),
      field('項目', rows),
      toggle({ checked: !!draft.hideDone, label: '完了した項目を隠す', onChange: (v) => (draft.hideDone = v) })
    )
  },
}
