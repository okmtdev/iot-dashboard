import { h, btn, modal, field, textInput, segmented, emptyState, toast } from '../ui.js'
import { api } from '../api.js'
import { uid } from '../format.js'
import { WIDGETS, widgetDef } from '../widgets/registry.js'
import { createGrid, findFreeSpot } from '../grid.js'

const ROW_H = 52
const GAP = 14
const MOBILE = window.matchMedia('(max-width: 767px)')

function starterWidgets() {
  return [
    { id: uid(), type: 'clock', layout: { x: 0, y: 0, w: 3, h: 3 }, config: WIDGETS.clock.defaultConfig() },
    { id: uid(), type: 'network-summary', layout: { x: 3, y: 0, w: 3, h: 3 }, config: {} },
    { id: uid(), type: 'system-monitor', layout: { x: 6, y: 0, w: 6, h: 3 }, config: { showSparkline: true } },
    { id: uid(), type: 'weather', layout: { x: 0, y: 3, w: 6, h: 5 }, config: WIDGETS.weather.defaultConfig() },
    { id: uid(), type: 'device-status', layout: { x: 6, y: 3, w: 6, h: 5 }, config: WIDGETS['device-status'].defaultConfig() },
  ]
}

export function renderDashboardPage(root, routeId) {
  let dashboards = null
  let active = null
  let edit = false
  let grid = null
  let saveTimer = null
  let pendingSave = null
  const cards = new Map() // widgetId -> {card, inst, configJson}

  const toolbar = h('div', { class: 'dash-toolbar' })
  const body = h('div', { class: 'dash-body' })
  root.replaceChildren(toolbar, body)

  // ---- 保存（デバウンス + 破棄時フラッシュ） ----
  const scheduleSave = () => {
    if (!active) return
    pendingSave = { id: active.id, name: active.name, icon: active.icon, widgets: active.widgets }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flushSave, 700)
  }
  const flushSave = () => {
    clearTimeout(saveTimer)
    if (!pendingSave) return
    const { id, ...data } = pendingSave
    pendingSave = null
    api.updateDashboard(id, data).catch((err) => toast('error', `保存に失敗しました: ${err.message}`))
  }

  // ---- ウィジェットカード ----
  const buildCard = (widget) => {
    const def = widgetDef(widget.type)
    const inst = def.mount(structuredClone(widget.config || {}))
    const head = h(
      'div',
      { class: 'widget-head drag-handle' },
      h('span', { class: 'widget-grip', 'aria-hidden': 'true' }, '⠿'),
      h('span', { class: 'widget-head-name' }, `${def.emoji} ${def.name}`),
      def.configForm
        ? h('button', { class: 'icon-btn icon-sm', type: 'button', title: 'ウィジェットの設定', onClick: () => openConfig(widget.id) }, '⚙️')
        : null,
      h('button', { class: 'icon-btn icon-sm icon-danger', type: 'button', title: 'ウィジェットを削除', onClick: () => removeWidget(widget.id) }, '✕')
    )
    const card = h('div', { class: 'widget-card' }, head, h('div', { class: 'widget-body' }, inst.el))
    return { card, inst, configJson: JSON.stringify(widget.config || {}) }
  }

  const getCard = (widget) => {
    let entry = cards.get(widget.id)
    const configJson = JSON.stringify(widget.config || {})
    if (entry && (entry.type !== widget.type || entry.configJson !== configJson)) {
      entry.inst.destroy()
      cards.delete(widget.id)
      entry = null
    }
    if (!entry) {
      entry = { ...buildCard(widget), type: widget.type }
      cards.set(widget.id, entry)
    }
    return entry
  }

  const dropRemovedCards = () => {
    const ids = new Set((active?.widgets || []).map((w) => w.id))
    for (const [id, entry] of cards) {
      if (!ids.has(id)) {
        entry.inst.destroy()
        cards.delete(id)
      }
    }
  }

  // ---- 操作 ----
  const mutate = (fn) => {
    fn(active)
    scheduleSave()
    renderBody()
  }

  const addWidget = (type) => {
    const def = widgetDef(type)
    const spot = findFreeSpot(
      active.widgets.map((w) => ({ id: w.id, ...w.layout })),
      def.defaultLayout.w,
      def.defaultLayout.h
    )
    const widget = {
      id: uid(),
      type,
      layout: { ...spot, w: def.defaultLayout.w, h: def.defaultLayout.h },
      config: def.defaultConfig(),
    }
    edit = true
    mutate((d) => d.widgets.push(widget))
    renderToolbar()
    if (def.needsConfig) openConfig(widget.id)
  }

  const removeWidget = (id) => {
    mutate((d) => (d.widgets = d.widgets.filter((w) => w.id !== id)))
  }

  const openConfig = (widgetId) => {
    const widget = active.widgets.find((w) => w.id === widgetId)
    if (!widget) return
    const def = widgetDef(widget.type)
    const draft = structuredClone(widget.config || {})
    const m = modal({
      title: `${def.emoji} ${def.name} の設定`,
      wide: true,
      body: def.configForm ? def.configForm(draft) : h('p', { class: 'form-note' }, 'このウィジェットに設定項目はありません。'),
      footer: [
        btn({ label: 'キャンセル', onClick: () => m.close() }),
        btn({
          label: '保存',
          variant: 'primary',
          onClick: () => {
            widget.config = draft
            m.close()
            scheduleSave()
            renderBody()
          },
        }),
      ],
    })
  }

  const openGallery = () => {
    const m = modal({
      title: 'ウィジェットを追加',
      wide: true,
      body: h(
        'div',
        { class: 'gallery' },
        Object.values(WIDGETS).map((def) =>
          h(
            'button',
            {
              type: 'button',
              class: 'gallery-card',
              onClick: () => {
                m.close()
                addWidget(def.type)
              },
            },
            h('div', { class: 'gallery-name' }, h('span', { class: 'gallery-emoji' }, def.emoji), def.name),
            h('div', { class: 'gallery-desc' }, def.description)
          )
        )
      ),
    })
  }

  const openCreate = () => {
    const draft = { name: '', icon: '📊', preset: 'starter' }
    const m = modal({
      title: '新しいダッシュボード',
      body: h(
        'div',
        { class: 'form' },
        field('名前', textInput({ value: '', placeholder: '例: リビング、書斎、カメラ', onInput: (v) => (draft.name = v) })),
        field('アイコン（絵文字）', textInput({ value: draft.icon, class: 'input input-emoji', onInput: (v) => (draft.icon = v) })),
        field(
          '初期状態',
          segmented({
            options: [
              { value: 'starter', label: 'おすすめセット' },
              { value: 'empty', label: '空にする' },
            ],
            value: draft.preset,
            onChange: (v) => (draft.preset = v),
          })
        )
      ),
      footer: [
        btn({ label: 'キャンセル', onClick: () => m.close() }),
        btn({
          label: '作成',
          variant: 'primary',
          onClick: async () => {
            try {
              const created = await api.createDashboard({ name: draft.name || '新しいダッシュボード', icon: draft.icon, preset: draft.preset })
              m.close()
              location.hash = `#/d/${created.id}`
            } catch (err) {
              toast('error', err.message)
            }
          },
        }),
      ],
    })
  }

  const openDashSettings = () => {
    const draft = { name: active.name, icon: active.icon || '📊' }
    const dangerArea = h('div', { class: 'modal-danger' })
    const renderDanger = (confirming) => {
      dangerArea.replaceChildren(
        ...(confirming
          ? [
              h('span', { class: 'danger-text' }, '本当に削除しますか？（元に戻せません）'),
              btn({
                label: '削除する',
                variant: 'danger',
                onClick: async () => {
                  try {
                    await api.deleteDashboard(active.id)
                    m.close()
                    edit = false
                    location.hash = '#/'
                    load()
                  } catch (err) {
                    toast('error', err.message)
                  }
                },
              }),
              btn({ label: 'やめる', onClick: () => renderDanger(false) }),
            ]
          : [btn({ label: '🗑️ このダッシュボードを削除', variant: 'danger', onClick: () => renderDanger(true) })])
      )
    }
    renderDanger(false)
    const m = modal({
      title: 'ダッシュボードの設定',
      body: h(
        'div',
        { class: 'form' },
        field('名前', textInput({ value: draft.name, onInput: (v) => (draft.name = v) })),
        field('アイコン（絵文字）', textInput({ value: draft.icon, class: 'input input-emoji', onInput: (v) => (draft.icon = v) })),
        dangerArea
      ),
      footer: [
        btn({ label: 'キャンセル', onClick: () => m.close() }),
        btn({
          label: '保存',
          variant: 'primary',
          onClick: () => {
            active.name = draft.name || active.name
            active.icon = draft.icon
            m.close()
            scheduleSave()
            renderToolbar()
          },
        }),
      ],
    })
  }

  // ---- 描画 ----
  const renderToolbar = () => {
    if (!dashboards) return
    toolbar.replaceChildren(
      h(
        'div',
        { class: 'dash-tabs' },
        dashboards.map((d) =>
          h(
            'button',
            {
              type: 'button',
              class: `dash-tab ${active?.id === d.id ? 'dash-tab-on' : ''}`,
              onClick: () => (location.hash = `#/d/${d.id}`),
            },
            h('span', { 'aria-hidden': 'true' }, d.icon || '📊'),
            h('span', {}, d.name)
          )
        ),
        h('button', { type: 'button', class: 'dash-tab dash-tab-add', title: 'ダッシュボードを追加', onClick: openCreate }, '＋')
      ),
      active
        ? h(
            'div',
            { class: 'dash-actions' },
            edit ? btn({ label: '＋ ウィジェット', variant: 'soft', onClick: openGallery }) : null,
            edit ? btn({ label: '名前・削除', onClick: openDashSettings }) : null,
            btn({
              label: edit ? '✓ 完了' : '✏️ 編集',
              variant: edit ? 'primary' : 'ghost',
              onClick: () => {
                edit = !edit
                if (!edit) flushSave()
                root.classList.toggle('edit-mode', edit)
                renderToolbar()
                renderBody()
              },
            })
          )
        : null
    )
  }

  const renderBody = () => {
    if (!dashboards) {
      body.replaceChildren(h('div', { class: 'page-loading' }, '読み込み中…'))
      return
    }
    dropRemovedCards()

    if (!active) {
      destroyGrid()
      body.replaceChildren(
        h(
          'div',
          { class: 'card' },
          emptyState('🧩', 'ダッシュボードがありません', '「＋」から新しいダッシュボードを作成しましょう。', h('div', { class: 'empty-actions' }, btn({ label: 'ダッシュボードを作成', variant: 'primary', onClick: openCreate })))
        )
      )
      return
    }

    if (active.widgets.length === 0) {
      destroyGrid()
      body.replaceChildren(
        h(
          'div',
          { class: 'card card-dashed' },
          emptyState(
            '🧩',
            'ウィジェットを配置しましょう',
            '時計・天気・カメラ・デバイス監視などを自由にレイアウトできます。',
            h(
              'div',
              { class: 'empty-actions' },
              btn({ label: '＋ ウィジェットを追加', variant: 'primary', onClick: openGallery }),
              btn({
                label: '🎁 おまかせセットで始める',
                onClick: () => mutate((d) => (d.widgets = starterWidgets())),
              })
            )
          )
        )
      )
      return
    }

    if (MOBILE.matches) {
      // モバイルは縦積み（Y→X順）
      destroyGrid()
      const sorted = [...active.widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x)
      body.replaceChildren(
        h(
          'div',
          { class: 'dash-stack' },
          sorted.map((w) => {
            const entry = getCard(w)
            entry.card.style.height = `${w.layout.h * ROW_H + (w.layout.h - 1) * GAP}px`
            return entry.card
          })
        ),
        edit ? h('p', { class: 'dash-hint' }, 'レイアウトの変更（ドラッグ・リサイズ）は画面の広い端末で行えます') : null
      )
      return
    }

    // デスクトップ: グリッド
    let gridEl = body.querySelector('.grid')
    if (!grid || !gridEl) {
      destroyGrid()
      gridEl = h('div', {})
      body.replaceChildren(gridEl, h('p', { class: `dash-hint ${edit ? '' : 'is-hidden'}` }, '💡 上部のバーをドラッグで移動、右下の角でサイズ変更。変更は自動保存されます。'))
      grid = createGrid({
        container: gridEl,
        rowH: ROW_H,
        gap: GAP,
        onChange: (layout) => {
          const byId = new Map(layout.map((l) => [l.id, l]))
          for (const w of active.widgets) {
            const l = byId.get(w.id)
            if (l) w.layout = { x: l.x, y: l.y, w: l.w, h: l.h }
          }
          scheduleSave()
        },
      })
    }
    body.querySelector('.dash-hint')?.classList.toggle('is-hidden', !edit)
    grid.sync(
      active.widgets.map((w) => {
        const def = widgetDef(w.type)
        return {
          id: w.id,
          ...w.layout,
          minW: def.defaultLayout.minW,
          minH: def.defaultLayout.minH,
          el: getCard(w).card,
        }
      }),
      { editable: edit }
    )
  }

  const destroyGrid = () => {
    grid?.destroy()
    grid = null
  }

  // ---- 初期化 ----
  const load = async () => {
    try {
      dashboards = await api.dashboards()
      active = dashboards.find((d) => d.id === routeId) || dashboards[0] || null
      renderToolbar()
      renderBody()
    } catch (err) {
      body.replaceChildren(h('div', { class: 'page-loading' }, `読み込みに失敗しました: ${err.message}`))
    }
  }
  load()

  const onMedia = () => renderBody()
  MOBILE.addEventListener('change', onMedia)

  return () => {
    flushSave()
    MOBILE.removeEventListener('change', onMedia)
    destroyGrid()
    for (const entry of cards.values()) entry.inst.destroy()
    cards.clear()
  }
}
