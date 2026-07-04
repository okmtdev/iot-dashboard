import { h, field, select, toast } from '../ui.js'
import { api } from '../api.js'
import { widgetMessage, cleanupBag } from './common.js'

// アップロード前にブラウザ側で縮小してJPEG化する（EXIFの向きも反映・位置情報等は除去される）
async function prepareImage(file) {
  if (file.type === 'image/gif') return file // アニメGIFは変換せずそのまま
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const maxDim = 1920
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 3 * 1024 * 1024 && file.type !== 'image/heic') {
      bmp.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bmp.width * scale))
    canvas.height = Math.max(1, Math.round(bmp.height * scale))
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    return blob || file
  } catch {
    return file
  }
}

export default {
  type: 'photo',
  name: 'フォト',
  emoji: '🖼️',
  description: '写真をその場でアップロードして表示。複数枚ならスライドショーに',
  defaultLayout: { w: 4, h: 5, minW: 2, minH: 2 },
  defaultConfig: () => ({ photos: [], intervalSec: 10, fit: 'cover' }),
  needsConfig: true,

  mount(config) {
    const photos = (config.photos || []).filter((p) => p && p.file)
    if (photos.length === 0) {
      return { el: widgetMessage('🖼️ 設定から写真を追加できます'), destroy() {} }
    }
    const bag = cleanupBag()
    const fit = config.fit || 'cover'
    let index = 0

    // 2枚のimgを重ねてクロスフェード
    const imgA = h('img', { class: 'w-photo-img is-active', alt: '', style: { objectFit: fit } })
    const imgB = h('img', { class: 'w-photo-img', alt: '', style: { objectFit: fit } })
    let front = imgA
    let back = imgB
    imgA.src = `/uploads/${photos[0].file}`

    const show = (i) => {
      index = (i + photos.length) % photos.length
      back.src = `/uploads/${photos[index].file}`
      const done = () => {
        back.classList.add('is-active')
        front.classList.remove('is-active')
        ;[front, back] = [back, front]
      }
      if (back.complete) done()
      else back.onload = done
    }

    const el = h('div', { class: 'w-photo' }, imgA, imgB)

    if (photos.length > 1) {
      const counter = h('span', { class: 'w-photo-counter' }, `1/${photos.length}`)
      const update = (i) => {
        show(i)
        counter.textContent = `${index + 1}/${photos.length}`
        restart()
      }
      el.append(
        h('button', { class: 'w-photo-nav w-photo-prev', type: 'button', title: '前の写真', onClick: () => update(index - 1) }, '‹'),
        h('button', { class: 'w-photo-nav w-photo-next', type: 'button', title: '次の写真', onClick: () => update(index + 1) }, '›'),
        counter
      )
      let timer = null
      const restart = () => {
        clearInterval(timer)
        timer = setInterval(() => update(index + 1), Math.max(3, config.intervalSec || 10) * 1000)
      }
      restart()
      bag.add(() => clearInterval(timer))
    }

    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    if (!Array.isArray(draft.photos)) draft.photos = []

    const thumbs = h('div', { class: 'w-photo-thumbs' })
    const status = h('div', { class: 'form-note' }, '')
    const renderThumbs = () => {
      thumbs.replaceChildren(
        ...draft.photos.map((p, i) =>
          h(
            'div',
            { class: 'w-photo-thumb' },
            h('img', { src: `/uploads/${p.file}`, alt: `写真${i + 1}`, loading: 'lazy' }),
            h(
              'button',
              {
                type: 'button',
                class: 'w-photo-thumb-del',
                title: 'この写真を削除',
                onClick: async () => {
                  draft.photos.splice(i, 1)
                  renderThumbs()
                  api.deleteUpload(p.file).catch(() => {})
                },
              },
              '✕'
            )
          )
        )
      )
    }
    renderThumbs()

    const fileInput = h('input', {
      type: 'file',
      accept: 'image/*',
      multiple: true,
      class: 'is-hidden',
      onChange: async (e) => {
        const files = [...e.target.files]
        e.target.value = ''
        if (files.length === 0) return
        let done = 0
        status.textContent = `アップロード中… (0/${files.length})`
        for (const file of files) {
          try {
            const blob = await prepareImage(file)
            const result = await api.uploadImage(blob)
            draft.photos.push({ file: result.file })
            renderThumbs()
          } catch (err) {
            toast('error', `${file.name}: ${err.message}`)
          }
          status.textContent = `アップロード中… (${++done}/${files.length})`
        }
        status.textContent = ''
      },
    })

    return h(
      'div',
      { class: 'form' },
      field(
        '写真',
        h(
          'div',
          {},
          fileInput,
          h('button', { type: 'button', class: 'btn btn-soft', onClick: () => fileInput.click() }, '📷 写真を追加（アップロード）'),
          status,
          thumbs
        ),
        'スマホからも追加できます。アップロード時に自動で縮小されます（最大25MB/枚）'
      ),
      h(
        'div',
        { class: 'settings-grid-2 settings-grid' },
        field(
          '表示方法',
          select({
            options: [
              { value: 'cover', label: '枠いっぱいに表示（見切れあり）' },
              { value: 'contain', label: '全体を表示（余白あり）' },
            ],
            value: draft.fit || 'cover',
            onChange: (v) => (draft.fit = v),
          })
        ),
        field(
          '切り替え間隔（2枚以上のとき）',
          select({
            options: [
              { value: 5, label: '5秒' },
              { value: 10, label: '10秒' },
              { value: 30, label: '30秒' },
              { value: 60, label: '1分' },
              { value: 300, label: '5分' },
            ],
            value: draft.intervalSec || 10,
            onChange: (v) => (draft.intervalSec = Number(v)),
          })
        )
      ),
      h('p', { class: 'form-note' }, '写真はこのサーバーの data/uploads/ に保存されます。ウィジェットから外した写真は自動的に掃除されます。')
    )
  },
}
