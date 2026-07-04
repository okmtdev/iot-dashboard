// 12カラムのドラッグ&リサイズ対応グリッドエンジン（外部ライブラリなし）
// レイアウト単位: {id, x, y, w, h}（グリッド座標）。衝突は下に押し出し、縦方向に自動で詰める。

function collides(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function firstCollision(list, item) {
  for (const other of list) {
    if (other.id !== item.id && collides(other, item)) return other
  }
  return null
}

// 上に詰める（y順に走査して、各アイテムを衝突しない範囲で引き上げる）
export function compact(layout) {
  const sorted = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
  const placed = []
  for (const item of sorted) {
    const it = { ...item }
    while (it.y > 0) {
      it.y--
      if (firstCollision(placed, it)) {
        it.y++
        break
      }
    }
    let c
    let guard = 0
    while ((c = firstCollision(placed, it)) && guard++ < 200) {
      it.y = c.y + c.h
    }
    placed.push(it)
  }
  return placed
}

// 1アイテムに変更を適用し、衝突するものを下へ連鎖的に押し出してから詰め直す
export function withPatch(layout, id, patch) {
  const list = layout.map((i) => ({ ...i }))
  const target = list.find((i) => i.id === id)
  if (!target) return list
  Object.assign(target, patch)
  const queue = [target]
  let guard = 0
  while (queue.length > 0 && guard++ < 500) {
    const cur = queue.shift()
    for (const other of list) {
      if (other.id === cur.id || other.id === target.id) continue
      if (collides(cur, other)) {
        other.y = cur.y + cur.h
        queue.push(other)
      }
    }
  }
  return compact(list)
}

// 空いている場所を探す（新規ウィジェット配置用）
export function findFreeSpot(layout, w, h, cols = 12) {
  for (let y = 0; y < 1000; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const probe = { id: '__probe__', x, y, w, h }
      if (!firstCollision(layout, probe)) return { x, y }
    }
  }
  return { x: 0, y: 1000 }
}

function layoutEquals(a, b) {
  if (a.length !== b.length) return false
  const map = new Map(b.map((i) => [i.id, i]))
  return a.every((i) => {
    const o = map.get(i.id)
    return o && o.x === i.x && o.y === i.y && o.w === i.w && o.h === i.h
  })
}

export function createGrid({ container, cols = 12, rowH = 52, gap = 14, onChange = () => {} }) {
  container.classList.add('grid')
  const wrappers = new Map() // id -> {wrap, contentEl}
  let layout = [] // [{id,x,y,w,h,minW,minH}]
  let editable = false
  let width = container.clientWidth
  let drag = null
  let placeholder = null

  const cellW = () => (width - gap * (cols - 1)) / cols
  const xPx = (x) => x * (cellW() + gap)
  const yPx = (y) => y * (rowH + gap)
  const wPx = (w) => w * cellW() + (w - 1) * gap
  const hPx = (h) => h * rowH + (h - 1) * gap

  const resizeObs = new ResizeObserver(() => {
    const newWidth = container.clientWidth
    if (Math.abs(newWidth - width) > 1) {
      width = newWidth
      position()
    }
  })
  resizeObs.observe(container)

  function position(exceptId = null) {
    for (const item of layout) {
      if (item.id === exceptId) continue
      const entry = wrappers.get(item.id)
      if (!entry) continue
      const { wrap } = entry
      wrap.style.transform = `translate(${xPx(item.x)}px, ${yPx(item.y)}px)`
      wrap.style.width = `${wPx(item.w)}px`
      wrap.style.height = `${hPx(item.h)}px`
    }
    const maxY = layout.reduce((m, i) => Math.max(m, i.y + i.h), 0)
    container.style.height = `${yPx(maxY) - (maxY > 0 ? gap : 0) + 4}px`
  }

  function showPlaceholder(item) {
    if (!placeholder) {
      placeholder = document.createElement('div')
      placeholder.className = 'grid-placeholder'
      container.append(placeholder)
    }
    placeholder.style.transform = `translate(${xPx(item.x)}px, ${yPx(item.y)}px)`
    placeholder.style.width = `${wPx(item.w)}px`
    placeholder.style.height = `${hPx(item.h)}px`
  }

  function hidePlaceholder() {
    placeholder?.remove()
    placeholder = null
  }

  function onPointerDown(e) {
    if (!editable || e.button !== 0) return
    const wrap = e.target.closest('.grid-item')
    if (!wrap || wrap.parentElement !== container) return
    const id = wrap.dataset.id
    const item = layout.find((i) => i.id === id)
    if (!item) return

    const isResize = !!e.target.closest('.grid-resize')
    const isDragHandle = !!e.target.closest('.drag-handle')
    if (!isResize && !isDragHandle) return
    if (e.target.closest('button')) return

    e.preventDefault()
    drag = {
      id,
      mode: isResize ? 'resize' : 'move',
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...item },
      base: layout.map((i) => ({ ...i })),
      pending: layout.map((i) => ({ ...i })),
      lastTarget: null,
      wrap,
    }
    wrap.classList.add(isResize ? 'grid-resizing' : 'grid-dragging')
    container.classList.add('grid-active')
    showPlaceholder(item)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function onPointerMove(e) {
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const { origin, wrap } = drag

    if (drag.mode === 'move') {
      // つかんだ要素はポインターに追従、確定位置はプレースホルダーで示す
      wrap.style.transform = `translate(${xPx(origin.x) + dx}px, ${Math.max(-rowH, yPx(origin.y) + dy)}px)`
      const tx = Math.max(0, Math.min(cols - origin.w, Math.round((xPx(origin.x) + dx) / (cellW() + gap))))
      const ty = Math.max(0, Math.round((yPx(origin.y) + dy) / (rowH + gap)))
      const key = `${tx},${ty}`
      if (drag.lastTarget !== key) {
        drag.lastTarget = key
        drag.pending = withPatch(drag.base, drag.id, { x: tx, y: ty })
        const me = drag.pending.find((i) => i.id === drag.id)
        applyPending(me)
      }
    } else {
      const minW = origin.minW || 1
      const minH = origin.minH || 1
      const newWpx = Math.max(wPx(minW), wPx(origin.w) + dx)
      const newHpx = Math.max(hPx(minH), hPx(origin.h) + dy)
      wrap.style.width = `${newWpx}px`
      wrap.style.height = `${newHpx}px`
      const tw = Math.max(minW, Math.min(cols - origin.x, Math.round((newWpx + gap) / (cellW() + gap))))
      const th = Math.max(minH, Math.round((newHpx + gap) / (rowH + gap)))
      const key = `${tw}x${th}`
      if (drag.lastTarget !== key) {
        drag.lastTarget = key
        drag.pending = withPatch(drag.base, drag.id, { w: tw, h: th })
        const me = drag.pending.find((i) => i.id === drag.id)
        applyPending(me)
      }
    }
  }

  function applyPending(me) {
    const mins = new Map(layout.map((i) => [i.id, { minW: i.minW, minH: i.minH }]))
    layout = drag.pending.map((i) => ({ ...i, ...mins.get(i.id) }))
    position(drag.id)
    if (me) showPlaceholder(me)
  }

  function onPointerUp() {
    if (!drag) return
    const { wrap } = drag
    wrap.classList.remove('grid-dragging', 'grid-resizing')
    container.classList.remove('grid-active')
    hidePlaceholder()
    window.removeEventListener('pointermove', onPointerMove)
    const changed = !layoutEquals(drag.base, layout)
    drag = null
    position()
    if (changed) onChange(layout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })))
  }

  container.addEventListener('pointerdown', onPointerDown)

  return {
    // items: [{id, x, y, w, h, minW, minH, el}]
    sync(items, opts = {}) {
      editable = !!opts.editable
      container.classList.toggle('grid-edit', editable)
      const ids = new Set(items.map((i) => i.id))
      for (const [id, entry] of wrappers) {
        if (!ids.has(id)) {
          entry.wrap.remove()
          wrappers.delete(id)
        }
      }
      for (const item of items) {
        let entry = wrappers.get(item.id)
        if (!entry) {
          const wrap = document.createElement('div')
          wrap.className = 'grid-item'
          wrap.dataset.id = item.id
          const resize = document.createElement('span')
          resize.className = 'grid-resize'
          resize.title = 'サイズ変更'
          wrap.append(item.el, resize)
          container.append(wrap)
          entry = { wrap, contentEl: item.el }
          wrappers.set(item.id, entry)
        } else if (entry.contentEl !== item.el) {
          entry.contentEl.replaceWith(item.el)
          entry.contentEl = item.el
        }
      }
      layout = compact(items.map(({ id, x, y, w, h, minW, minH }) => ({ id, x, y, w, h, minW, minH })))
      width = container.clientWidth
      position()
      requestAnimationFrame(() => container.classList.add('grid-ready'))
    },
    getLayout: () => layout.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
    destroy() {
      resizeObs.disconnect()
      container.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      wrappers.clear()
      container.classList.remove('grid', 'grid-edit', 'grid-ready')
      container.style.height = ''
    },
  }
}
