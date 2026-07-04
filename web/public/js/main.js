import { h, statusDot, spinner } from './ui.js'
import { devicesPoller, applyTheme, getTheme, setTheme } from './state.js'
import { renderDashboardPage } from './pages/dashboard.js'
import { renderDevicesPage } from './pages/devices.js'
import { renderSettingsPage } from './pages/settings.js'

applyTheme()

const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' }
const THEME_ICON = { light: '☀️', dark: '🌙', system: '💻' }
const THEME_LABEL = { light: 'ライト', dark: 'ダーク', system: 'システム連動' }

const app = document.getElementById('app')
const headerStatus = h('span', { class: 'header-status' })
const themeBtn = h('button', { class: 'theme-btn', type: 'button', onClick: cycleTheme })
const navLinks = {}

function navLink(hash, emoji, label) {
  const a = h('a', { class: 'nav-link', href: hash }, h('span', { 'aria-hidden': 'true' }, emoji), h('span', { class: 'nav-label' }, label))
  navLinks[hash] = a
  return a
}

const header = h(
  'header',
  { class: 'header' },
  h(
    'div',
    { class: 'header-inner' },
    h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-emoji', 'aria-hidden': 'true' }, '🏠'), h('span', { class: 'brand-name' }, 'おうちネットワーク')),
    h('nav', { class: 'nav' }, navLink('#/', '🧩', 'ダッシュボード'), navLink('#/devices', '📡', 'デバイス'), navLink('#/settings', '⚙️', '設定')),
    h('span', { class: 'flex-1' }),
    headerStatus,
    themeBtn
  )
)

const main = h('main', { class: 'main' })
app.replaceChildren(header, main)

function updateThemeBtn() {
  const mode = getTheme()
  themeBtn.textContent = THEME_ICON[mode]
  themeBtn.title = `テーマ: ${THEME_LABEL[mode]}（クリックで切り替え）`
}
function cycleTheme() {
  setTheme(THEME_CYCLE[getTheme()])
  updateThemeBtn()
}
updateThemeBtn()

devicesPoller.subscribe(({ data }) => {
  const ov = data?.overview
  if (!ov) {
    headerStatus.replaceChildren()
    return
  }
  headerStatus.replaceChildren(
    ov.scanning
      ? h('span', { class: 'header-scan' }, spinner(12), ' スキャン中…')
      : h('span', { class: 'header-count', title: 'オンライン / 検出済みデバイス' }, statusDot(true), ` ${ov.onlineCount}/${ov.deviceCount} 台オンライン`)
  )
})

// ---- ハッシュルーター ----
let destroyPage = null

function route() {
  const hash = location.hash || '#/'
  const [, page, param] = /^#\/([^/]*)\/?(.*)$/.exec(hash) || []
  destroyPage?.()
  main.replaceChildren()
  const pageRoot = h('div', { class: 'page' })
  main.append(pageRoot)

  let current = '#/'
  if (page === 'devices') {
    current = '#/devices'
    destroyPage = renderDevicesPage(pageRoot)
  } else if (page === 'settings') {
    current = '#/settings'
    destroyPage = renderSettingsPage(pageRoot)
  } else if (page === 'd') {
    current = '#/'
    destroyPage = renderDashboardPage(pageRoot, param || null)
  } else {
    destroyPage = renderDashboardPage(pageRoot, null)
  }
  for (const [hashKey, a] of Object.entries(navLinks)) {
    a.classList.toggle('nav-on', hashKey === current)
  }
}

window.addEventListener('hashchange', route)
route()
