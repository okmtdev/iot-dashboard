// 小さなDOMヘルパー群（フレームワークなしでUIを組むための道具箱）

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  applyProps(el, props)
  append(el, children)
  return el
}

// SVG用（名前空間つき・属性はsetAttribute）
export function s(tag, props = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else el.setAttribute(k, String(v))
  }
  append(el, children)
  return el
}

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'value') el.value = v
    else if (k === 'checked') el.checked = !!v
    else if (k === 'disabled') el.disabled = !!v
    else if (k === 'selected') el.selected = !!v
    else el.setAttribute(k, v === true ? '' : String(v))
  }
}

export function append(el, children) {
  for (const child of [].concat(children).flat(Infinity)) {
    if (child == null || child === false || child === true) continue
    el.append(child.nodeType ? child : document.createTextNode(String(child)))
  }
  return el
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

export function replace(el, ...children) {
  clear(el)
  append(el, children)
  return el
}

// ---- トースト通知 ----

let toastBox = null

export function toast(type, message) {
  if (!toastBox) {
    toastBox = h('div', { class: 'toast-box' })
    document.body.append(toastBox)
  }
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' }
  const el = h('div', { class: `toast toast-${type}`, role: 'status' }, h('span', {}, icons[type] || ''), h('span', {}, message))
  toastBox.append(el)
  setTimeout(() => {
    el.classList.add('toast-out')
    setTimeout(() => el.remove(), 300)
  }, 3800)
}

// ---- モーダル ----

export function modal({ title, body, footer, wide = false, onClose = () => {} }) {
  const close = () => {
    document.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
    overlay.remove()
    onClose()
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  const overlay = h(
    'div',
    { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-backdrop', onClick: close }),
    h(
      'div',
      { class: `modal ${wide ? 'modal-wide' : ''}` },
      h(
        'div',
        { class: 'modal-head' },
        h('h2', {}, title),
        h('button', { class: 'icon-btn', title: '閉じる', onClick: close }, '✕')
      ),
      h('div', { class: 'modal-body' }, body),
      footer ? h('div', { class: 'modal-foot' }, footer) : null
    )
  )
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  document.body.append(overlay)
  return { close, el: overlay }
}

// ---- フォーム部品 ----

export function field(label, control, hint) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null
  )
}

export function textInput({ value = '', placeholder = '', onInput, ...rest } = {}) {
  return h('input', {
    class: 'input',
    type: 'text',
    value,
    placeholder,
    onInput: onInput ? (e) => onInput(e.target.value) : null,
    ...rest,
  })
}

export function textarea({ value = '', placeholder = '', rows = 4, onInput } = {}) {
  return h('textarea', {
    class: 'input',
    rows,
    placeholder,
    onInput: onInput ? (e) => onInput(e.target.value) : null,
    value,
  })
}

export function select({ options, value, onChange } = {}) {
  const el = h(
    'select',
    { class: 'input', onChange: onChange ? (e) => onChange(e.target.value) : null },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label))
  )
  return el
}

export function toggle({ checked = false, label = '', onChange } = {}) {
  const input = h('input', { type: 'checkbox', checked, onChange: (e) => onChange?.(e.target.checked) })
  return h('label', { class: 'toggle' }, input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }), label ? h('span', {}, label) : null)
}

export function segmented({ options, value, onChange } = {}) {
  const wrap = h('div', { class: 'seg' })
  let current = value
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        class: `seg-btn ${String(o.value) === String(current) ? 'seg-on' : ''}`,
        onClick: () => {
          current = o.value
          buttons.forEach((b, i) => b.classList.toggle('seg-on', options[i].value === current))
          onChange?.(o.value)
        },
      },
      o.label
    )
  )
  append(wrap, buttons)
  return wrap
}

export function btn({ label, variant = 'ghost', onClick, title, disabled = false, class: cls = '' }) {
  return h(
    'button',
    { type: 'button', class: `btn btn-${variant} ${cls}`, onClick, title, disabled },
    label
  )
}

export function statusDot(online) {
  return h('span', { class: `dot ${online ? 'dot-on' : 'dot-off'}`, 'aria-hidden': 'true' })
}

export function emptyState(emoji, title, ...body) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-emoji', 'aria-hidden': 'true' }, emoji),
    h('div', { class: 'empty-title' }, title),
    h('div', { class: 'empty-body' }, body)
  )
}

export function spinner(size = 14) {
  return h('span', { class: 'spin', style: { width: `${size}px`, height: `${size}px` }, 'aria-hidden': 'true' })
}
