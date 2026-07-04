import { h, btn, modal, field, textInput, textarea, statusDot, emptyState, toast, spinner } from '../ui.js'
import { api } from '../api.js'
import { devicesPoller, scanNow } from '../state.js'
import { CATEGORIES, categoryOf } from '../categories.js'
import { deviceLabel, fmtDateTime, fmtMs, ipSortKey, timeAgo } from '../format.js'

const FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: 'online', label: 'オンライン' },
  { id: 'offline', label: 'オフライン' },
  { id: 'new', label: 'NEW' },
  { id: 'hidden', label: '非表示' },
]

export function renderDevicesPage(root) {
  let query = ''
  let filter = 'all'
  let category = ''
  let modalOpen = false

  const head = h('div', { class: 'dev-head' })
  const controls = h('div', { class: 'dev-controls' })
  const listArea = h('div', {})
  const note = h(
    'p',
    { class: 'dash-hint' },
    '💡 デバイスはMACアドレスで識別されるため、DHCPでIPが変わっても名前やメモは引き継がれます。iPhone等の「プライベートWi-Fiアドレス」を使う端末は、接続のたびに別デバイスとして見えることがあります（端末側の設定でこのネットワークだけ固定にすると安定します）。'
  )
  root.replaceChildren(head, controls, listArea, note)

  const renderHead = () => {
    const { data } = devicesPoller.get()
    const ov = data?.overview
    const visible = (data?.devices || []).filter((d) => !d.hidden)
    head.replaceChildren(
      h('h1', { class: 'page-title' }, 'デバイス'),
      h('span', { class: 'dev-count' }, ov ? `${visible.filter((d) => d.online).length}/${visible.length} 台オンライン` : ''),
      h('span', { class: 'flex-1' }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          disabled: ov?.scanning,
          onClick: async () => {
            try {
              await scanNow()
              toast('info', 'スキャンを開始しました（数秒かかります）')
            } catch (err) {
              toast('error', err.message)
            }
          },
        },
        ov?.scanning ? [spinner(), ' スキャン中…'] : '🔍 今すぐスキャン'
      )
    )
  }

  const renderControls = () => {
    controls.replaceChildren(
      h(
        'div',
        { class: 'chip-row' },
        FILTERS.map((f) =>
          h(
            'button',
            {
              type: 'button',
              class: `chip ${filter === f.id ? 'chip-on' : ''}`,
              onClick: () => {
                filter = f.id
                renderControls()
                renderList()
              },
            },
            f.label
          )
        )
      ),
      h('input', {
        class: 'input dev-search',
        type: 'search',
        placeholder: '検索（名前・IP・MAC・メモ）',
        value: query,
        onInput: (e) => {
          query = e.target.value
          renderList()
        },
      }),
      h(
        'select',
        {
          class: 'input dev-catsel',
          onChange: (e) => {
            category = e.target.value
            renderList()
          },
        },
        h('option', { value: '', selected: category === '' }, 'カテゴリ: すべて'),
        CATEGORIES.map((c) => h('option', { value: c.id, selected: category === c.id }, `${c.emoji} ${c.label}`))
      )
    )
  }

  const filtered = () => {
    const { data } = devicesPoller.get()
    let list = data?.devices || []
    list = filter === 'hidden' ? list.filter((d) => d.hidden) : list.filter((d) => !d.hidden)
    if (filter === 'online') list = list.filter((d) => d.online)
    if (filter === 'offline') list = list.filter((d) => !d.online)
    if (filter === 'new') list = list.filter((d) => d.isNew)
    if (category) list = list.filter((d) => d.category === category)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter((d) =>
        [d.name, d.hostname, d.ip, d.mac, d.vendor, d.note].some((v) => v && String(v).toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => Number(b.online) - Number(a.online) || ipSortKey(a.ip) - ipSortKey(b.ip))
  }

  const renderList = () => {
    const { data, error } = devicesPoller.get()
    const list = filtered()
    if (error && !data) {
      listArea.replaceChildren(h('div', { class: 'card' }, emptyState('⚠️', 'サーバーに接続できません', error.message)))
      return
    }
    if (list.length === 0) {
      const loading = !data
      listArea.replaceChildren(
        h(
          'div',
          { class: 'card' },
          emptyState(
            loading ? '📡' : '🔍',
            loading ? 'スキャン中です…' : 'デバイスが見つかりません',
            loading
              ? '初回スキャンには少し時間がかかります。'
              : '検索条件を変えるか、「今すぐスキャン」を試してください。同じネットワーク（サブネット）に接続されている端末のみ検出できます。'
          )
        )
      )
      return
    }

    const rows = list.map((d) => {
      const cat = categoryOf(d.category)
      return h(
        'tr',
        { class: 'dev-row', onClick: () => openEdit(d.mac) },
        h(
          'td',
          { class: 'nowrap' },
          h(
            'span',
            { class: 'dev-status' },
            statusDot(d.online),
            h('span', { class: d.online ? 'is-good' : 'is-muted' }, d.online ? 'オンライン' : 'オフライン'),
            d.online && d.lastRttMs != null ? h('span', { class: 'dev-ms' }, fmtMs(d.lastRttMs)) : null
          )
        ),
        h(
          'td',
          { class: 'dev-name-cell' },
          h(
            'div',
            { class: 'dev-name' },
            h('b', {}, deviceLabel(d)),
            d.isNew ? h('span', { class: 'badge-new' }, 'NEW') : null,
            d.self ? h('span', { class: 'badge-self' }, 'この機器') : null
          ),
          d.hostname && d.name ? h('div', { class: 'dev-sub' }, d.hostname) : null
        ),
        h('td', { class: 'nowrap dev-cat' }, `${cat.emoji} ${cat.label}`),
        h('td', { class: 'mono nowrap' }, d.ip || '-'),
        h(
          'td',
          { class: 'mono nowrap' },
          d.ipBased ? 'IPベース追跡' : d.mac,
          d.vendor || d.randomizedMac
            ? h('div', { class: 'dev-sub' }, d.vendor || 'ランダムMAC（プライベートアドレス）')
            : null
        ),
        h('td', { class: 'nowrap dev-ago' }, timeAgo(d.lastSeen)),
        h('td', { class: 'dev-note' }, d.note || ''),
        h('td', { class: 'dev-editlink' }, '編集')
      )
    })

    const cardsMobile = list.map((d) => {
      const cat = categoryOf(d.category)
      return h(
        'button',
        { type: 'button', class: 'dev-card', onClick: () => openEdit(d.mac) },
        h(
          'div',
          { class: 'dev-card-top' },
          statusDot(d.online),
          h('span', { 'aria-hidden': 'true' }, cat.emoji),
          h('b', { class: 'dev-card-name' }, deviceLabel(d)),
          d.isNew ? h('span', { class: 'badge-new' }, 'NEW') : null
        ),
        h('div', { class: 'dev-card-mid mono' }, `${d.ip || '-'} ・ ${d.ipBased ? 'IPベース' : d.mac}`),
        h(
          'div',
          { class: 'dev-card-bottom' },
          h('span', {}, d.vendor || (d.randomizedMac ? 'ランダムMAC' : cat.label)),
          h('span', {}, d.online ? fmtMs(d.lastRttMs) : timeAgo(d.lastSeen))
        )
      )
    })

    listArea.replaceChildren(
      h(
        'div',
        { class: 'card dev-table-wrap' },
        h(
          'table',
          { class: 'dev-table' },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              ...['状態', '名前', 'カテゴリ', 'IPアドレス', 'MACアドレス', '最終確認', 'メモ', ''].map((t) => h('th', {}, t))
            )
          ),
          h('tbody', {}, rows)
        )
      ),
      h('div', { class: 'dev-cards' }, cardsMobile)
    )
  }

  const openEdit = (mac) => {
    const device = (devicesPoller.get().data?.devices || []).find((d) => d.mac === mac)
    if (!device || modalOpen) return
    modalOpen = true
    const draft = { name: device.name || '', category: device.category || '', note: device.note || '' }

    const catArea = h('div', { class: 'chip-row' })
    const renderCats = () => {
      catArea.replaceChildren(
        ...CATEGORIES.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: `chip ${draft.category === c.id ? 'chip-on' : ''}`,
              onClick: () => {
                draft.category = draft.category === c.id ? '' : c.id
                renderCats()
              },
            },
            `${c.emoji} ${c.label}`
          )
        )
      )
    }
    renderCats()

    const info = [
      ['IPアドレス', device.ip || '-'],
      ['MACアドレス', device.ipBased ? '不明（IPベース追跡）' : device.mac],
      ['メーカー（推定）', device.vendor || (device.randomizedMac ? 'ランダムMAC（プライベートアドレス）' : '不明')],
      ['ホスト名', device.hostname || '-'],
      ['初回検出', fmtDateTime(device.firstSeen)],
      ['最終確認', `${fmtDateTime(device.lastSeen)}（${timeAgo(device.lastSeen)}）`],
    ]

    const dangerArea = h('div', {})
    const renderDanger = (confirming) => {
      dangerArea.replaceChildren(
        ...(confirming
          ? [
              h('span', { class: 'danger-text' }, '履歴も消えます。次のスキャンで再検出されることがあります。'),
              btn({
                label: '削除する',
                variant: 'danger',
                onClick: async () => {
                  try {
                    await api.deleteDevice(device.mac)
                    devicesPoller.refresh()
                    toast('success', '削除しました')
                    m.close()
                  } catch (err) {
                    toast('error', err.message)
                  }
                },
              }),
              btn({ label: 'やめる', onClick: () => renderDanger(false) }),
            ]
          : [btn({ label: '🗑️ 削除', variant: 'danger', onClick: () => renderDanger(true) })])
      )
    }
    renderDanger(false)

    const m = modal({
      title: 'デバイスの編集',
      wide: true,
      onClose: () => (modalOpen = false),
      body: h(
        'div',
        { class: 'form' },
        h(
          'div',
          { class: 'dev-status' },
          statusDot(device.online),
          h(
            'span',
            { class: device.online ? 'is-good' : 'is-muted' },
            device.online ? `オンライン${device.lastRttMs != null ? ` (${fmtMs(device.lastRttMs)})` : ''}` : 'オフライン'
          )
        ),
        field('名前', textInput({ value: draft.name, placeholder: '例: リビングのテレビ', onInput: (v) => (draft.name = v) }), '例: リビングのテレビ、寝室のエアコン'),
        field('カテゴリ', catArea),
        field('メモ', textarea({ value: draft.note, onInput: (v) => (draft.note = v) }), '設置場所や固定IPの予定などを自由に記録'),
        h(
          'div',
          { class: 'info-grid' },
          info.map(([k, v]) => h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, k), h('span', { class: 'info-v mono', title: v }, v)))
        ),
        h(
          'div',
          { class: 'row-gap row-actions' },
          !device.ipBased
            ? btn({
                label: '⚡ WoLで起動',
                title: 'Wake-on-LANで起動',
                onClick: async () => {
                  try {
                    await api.wake(device.mac)
                    toast('success', 'マジックパケットを送信しました')
                  } catch (err) {
                    toast('error', err.message)
                  }
                },
              })
            : null,
          btn({
            label: device.hidden ? '👁 再表示する' : '🙈 一覧から非表示',
            onClick: async () => {
              try {
                await api.patchDevice(device.mac, { hidden: !device.hidden })
                devicesPoller.refresh()
                m.close()
              } catch (err) {
                toast('error', err.message)
              }
            },
          }),
          h('span', { class: 'flex-1' }),
          dangerArea
        )
      ),
      footer: [
        btn({ label: 'キャンセル', onClick: () => m.close() }),
        btn({
          label: '保存',
          variant: 'primary',
          onClick: async () => {
            try {
              await api.patchDevice(device.mac, draft)
              devicesPoller.refresh()
              toast('success', '保存しました')
              m.close()
            } catch (err) {
              toast('error', err.message)
            }
          },
        }),
      ],
    })
  }

  renderControls()
  const unsub = devicesPoller.subscribe(() => {
    renderHead()
    if (!modalOpen) renderList()
  })

  return () => unsub()
}
