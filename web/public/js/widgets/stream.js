import { h, field, textInput, select, toggle } from '../ui.js'
import { widgetMessage } from './common.js'

export function detectMode(url = '') {
  const u = url.toLowerCase()
  if (!u) return 'none'
  if (/(youtube\.com|youtu\.be)/.test(u)) return 'youtube'
  if (u.includes('.m3u8')) return 'hls'
  if (/(\.mjpg|\.mjpeg|mjpeg|action=stream|\/video\.cgi)/.test(u)) return 'mjpeg'
  if (u.startsWith('rtsp:')) return 'rtsp'
  return 'video'
}

function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|live\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url) || []
  return m[1] || null
}

// /vendor/hls.min.js が置いてあれば読み込む（任意・README参照）
let hlsLoader = null
function loadHlsLib() {
  if (!hlsLoader) {
    hlsLoader = new Promise((resolve) => {
      if (window.Hls) return resolve(window.Hls)
      const script = document.createElement('script')
      script.src = '/vendor/hls.min.js'
      script.onload = () => resolve(window.Hls || null)
      script.onerror = () => resolve(null)
      document.head.append(script)
    })
  }
  return hlsLoader
}

function overlay(...children) {
  return h('div', { class: 'w-stream-overlay' }, children)
}

export default {
  type: 'stream',
  name: 'カメラ・ストリーミング',
  emoji: '🎥',
  description: '監視カメラ（HLS/MJPEG）やYouTubeなどの映像を埋め込み表示',
  defaultLayout: { w: 5, h: 5, minW: 2, minH: 2 },
  defaultConfig: () => ({ url: '', mode: 'auto', title: '', fit: 'cover', muted: true }),
  needsConfig: true,

  mount(config) {
    if (!config.url) {
      return { el: widgetMessage('🎥 設定から配信URLを入力してください'), destroy() {} }
    }
    const mode = config.mode && config.mode !== 'auto' ? config.mode : detectMode(config.url)
    const fit = config.fit || 'cover'
    const el = h('div', { class: 'w-stream' })
    let hls = null
    let destroyed = false

    const addChrome = () => {
      if (config.title) el.append(h('div', { class: 'w-stream-title' }, config.title))
      if (mode !== 'youtube' && mode !== 'iframe') {
        el.append(
          h(
            'button',
            { type: 'button', class: 'w-stream-fs', title: '全画面表示', onClick: () => el.requestFullscreen?.() },
            '⛶'
          )
        )
      }
    }

    if (mode === 'youtube') {
      const id = youtubeId(config.url)
      if (id) {
        el.append(
          h('iframe', {
            class: 'w-stream-frame',
            src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${config.muted === false ? 0 : 1}&playsinline=1&rel=0`,
            allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
            allowfullscreen: true,
            title: config.title || 'YouTube',
          })
        )
      } else {
        el.append(overlay('YouTubeのURLを認識できませんでした'))
      }
    } else if (mode === 'iframe') {
      el.append(h('iframe', { class: 'w-stream-frame w-stream-frame-page', src: config.url, title: config.title || 'ページ' }))
    } else if (mode === 'mjpeg') {
      const img = h('img', { class: 'w-stream-media', alt: config.title || 'カメラ映像', style: { objectFit: fit } })
      const err = overlay(
        h('span', {}, '⚠️ カメラに接続できません'),
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onClick: () => {
              err.style.display = 'none'
              img.src = config.url.includes('?') ? `${config.url}&_ts=${Date.now()}` : `${config.url}?_ts=${Date.now()}`
            },
          },
          '再接続'
        )
      )
      err.style.display = 'none'
      img.onerror = () => {
        if (!destroyed) err.style.display = 'flex'
      }
      img.src = config.url
      el.append(img, err)
    } else if (mode === 'rtsp') {
      el.append(
        overlay(
          h('span', {}, '⚠️ RTSPはブラウザで直接再生できません'),
          h('span', { class: 'w-msg-sub' }, 'go2rtc / mediamtx でHLSに変換してください（README参照）')
        )
      )
    } else {
      // hls または 通常の動画
      const video = h('video', {
        class: 'w-stream-media',
        muted: config.muted !== false,
        autoplay: true,
        playsinline: true,
        loop: mode === 'video',
        style: { objectFit: fit },
      })
      el.append(video)
      const fail = (msg, hint) => {
        if (destroyed) return
        el.append(overlay(h('span', {}, `⚠️ ${msg}`), hint ? h('span', { class: 'w-msg-sub' }, hint) : null))
      }
      if (mode === 'hls') {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = config.url
          video.play().catch(() => {})
        } else {
          loadHlsLib().then((Hls) => {
            if (destroyed) return
            if (Hls && Hls.isSupported()) {
              hls = new Hls({ maxBufferLength: 10 })
              hls.loadSource(config.url)
              hls.attachMedia(video)
              hls.on(Hls.Events.ERROR, (_evt, data) => {
                if (data.fatal) fail('ストリームに接続できません', 'URLとカメラの状態を確認してください')
              })
            } else {
              fail(
                'このブラウザでHLSを再生するには hls.js が必要です',
                'web/public/vendor/hls.min.js を配置してください（README参照）'
              )
            }
          })
        }
      } else {
        video.src = config.url
        video.onerror = () => fail('動画を再生できません', 'URLを確認してください')
        video.play().catch(() => {})
      }
    }
    addChrome()

    return {
      el,
      destroy() {
        destroyed = true
        hls?.destroy?.()
      },
    }
  },

  configForm(draft) {
    const modeNames = { youtube: 'YouTube', hls: 'HLS', mjpeg: 'MJPEG', video: '動画ファイル', rtsp: 'RTSP（非対応）', none: '-' }
    const hintEl = h('span', {}, '')
    const updateHint = () => {
      const auto = detectMode(draft.url)
      hintEl.textContent =
        !draft.mode || draft.mode === 'auto'
          ? `例: http://192.168.1.22:8080/stream.m3u8（HLS）、MJPEG、YouTubeのURL — 自動判定: ${modeNames[auto]}`
          : '例: http://192.168.1.22:8080/stream.m3u8'
    }
    updateHint()

    return h(
      'div',
      { class: 'form' },
      field(
        '配信URL',
        textInput({
          value: draft.url || '',
          placeholder: 'http://... または https://www.youtube.com/...',
          onInput: (v) => {
            draft.url = v
            updateHint()
          },
        }),
        hintEl
      ),
      field(
        '種類',
        select({
          options: [
            { value: 'auto', label: '自動判定' },
            { value: 'hls', label: 'HLS (.m3u8)' },
            { value: 'mjpeg', label: 'MJPEG（IPカメラ）' },
            { value: 'video', label: '動画 (MP4/WebM)' },
            { value: 'youtube', label: 'YouTube' },
            { value: 'iframe', label: 'Webページ埋め込み' },
          ],
          value: draft.mode || 'auto',
          onChange: (v) => {
            draft.mode = v
            updateHint()
          },
        })
      ),
      field('表示名（任意）', textInput({ value: draft.title || '', placeholder: '例: 玄関カメラ', onInput: (v) => (draft.title = v) })),
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
      toggle({ checked: draft.muted !== false, label: 'ミュートで再生', onChange: (v) => (draft.muted = v) }),
      h(
        'p',
        { class: 'form-note' },
        '💡 RTSPカメラは go2rtc や mediamtx でHLS/MJPEGに変換すると表示できます。go2rtc の再生ページを「Webページ埋め込み」で表示する方法もあります（README参照）。'
      )
    )
  },
}
