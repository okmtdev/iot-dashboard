import { h, field, textInput, toggle } from '../ui.js'
import { api } from '../api.js'
import { weatherInfo } from '../weathercodes.js'
import { debounce } from '../format.js'
import { widgetMessage, cleanupBag } from './common.js'

const PRESETS = [
  { name: '札幌', lat: 43.0618, lon: 141.3545 },
  { name: '仙台', lat: 38.2682, lon: 140.8694 },
  { name: '東京', lat: 35.6895, lon: 139.6917 },
  { name: '横浜', lat: 35.4437, lon: 139.638 },
  { name: '名古屋', lat: 35.1815, lon: 136.9066 },
  { name: '京都', lat: 35.0116, lon: 135.7681 },
  { name: '大阪', lat: 34.6937, lon: 135.5023 },
  { name: '広島', lat: 34.3853, lon: 132.4553 },
  { name: '福岡', lat: 33.5904, lon: 130.4017 },
  { name: '那覇', lat: 26.2124, lon: 127.6809 },
]

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

function dayLabel(dateStr, index) {
  if (index === 0) return '今日'
  if (index === 1) return '明日'
  return WEEKDAYS[new Date(dateStr + 'T00:00:00').getDay()]
}

export default {
  type: 'weather',
  name: '天気予報',
  emoji: '🌤️',
  description: '地域を選んで現在の天気・気温・湿度・降水確率と週間予報を表示',
  defaultLayout: { w: 6, h: 5, minW: 3, minH: 3 },
  defaultConfig: () => ({ locationName: '東京', lat: 35.6895, lon: 139.6917, showHourly: true, showWeekly: true }),
  needsConfig: false,

  mount(config) {
    const bag = cleanupBag()
    const el = h('div', { class: 'w-weather' })

    if (config.lat == null || config.lon == null) {
      el.replaceChildren(widgetMessage('🗾 設定から地域を選んでください'))
      return { el, destroy: () => bag.run() }
    }

    let lastData = null
    let curPctStep = null
    let curHourStep = null

    // 幅から「ラベル1個に使える最小px」を割って、収まる本数→間引き間隔を決める
    const stepFor = (per) => {
      const usable = Math.max(80, (el.clientWidth || 320) - 32)
      const fit = Math.max(1, Math.floor(usable / per))
      return Math.max(1, Math.ceil(24 / fit))
    }

    // 24時間の降水確率バー。%・バー・時刻を固定高の別々の行にして底辺を必ず揃える。
    const hourlyBlock = (data) => {
      const hours = data.hourly || []
      if (config.showHourly === false || hours.length === 0) return null
      const pctStep = stepFor(26) // %ラベルの間引き
      const hourStep = Math.max(pctStep, stepFor(42)) // 時刻ラベルは幅を取るので粗め
      curPctStep = pctStep
      curHourStep = hourStep
      return h(
        'div',
        { class: 'w-weather-hourly' },
        h('div', { class: 'w-weather-sec' }, 'これから24時間の降水確率'),
        h(
          'div',
          { class: 'w-weather-hours' },
          hours.map((hh, i) => {
            const hour = new Date(hh.time).getHours()
            const prob = hh.precipProb ?? 0
            return h(
              'div',
              {
                class: `wx-col ${i === 0 ? 'is-now' : ''}`,
                title: `${hour}時 ・ 降水確率 ${hh.precipProb ?? '-'}% ・ ${hh.temperature ?? '-'}℃`,
              },
              h(
                'div',
                { class: `wx-pct ${prob >= 50 ? 'is-strong' : ''}` },
                i % pctStep === 0 ? `${hh.precipProb ?? '-'}%` : ''
              ),
              h(
                'div',
                { class: 'wx-track' },
                h('div', { class: 'wx-bar', style: { height: prob > 0 ? `max(2px, ${prob}%)` : '0' } })
              ),
              h('div', { class: 'wx-tick' }, i % hourStep === 0 ? `${hour}時` : '')
            )
          })
        )
      )
    }

    const render = (data, error) => {
      if (error) {
        el.replaceChildren(
          h(
            'div',
            { class: 'w-msg w-msg-col' },
            h('span', {}, '☁️ 天気を取得できませんでした'),
            h('span', { class: 'w-msg-sub' }, `${error.message}（インターネット接続を確認してください）`),
            h('button', { class: 'link-btn', type: 'button', onClick: load }, '再試行')
          )
        )
        return
      }
      if (!data) {
        el.replaceChildren(widgetMessage('読み込み中…'))
        return
      }
      lastData = data
      const cur = data.current
      const info = weatherInfo(cur.weatherCode, cur.isDay)
      const precipNow = data.hourly?.[0]?.precipProb

      el.replaceChildren(
        h(
          'div',
          { class: 'w-weather-head' },
          h('span', { class: 'w-weather-loc' }, `📍 ${config.locationName || '選択地点'}`),
          h(
            'span',
            { class: 'w-weather-upd' },
            `${new Date(data.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 更新`
          )
        ),
        h(
          'div',
          { class: 'w-weather-now' },
          h('div', { class: 'w-weather-icon', 'aria-hidden': 'true' }, info.emoji),
          h(
            'div',
            {},
            h('div', { class: 'w-weather-temp' }, cur.temperature != null ? `${cur.temperature.toFixed(1)}℃` : '--'),
            h('div', { class: 'w-weather-desc' }, info.label)
          ),
          h(
            'div',
            { class: 'w-weather-chips' },
            cur.apparentTemperature != null ? h('div', {}, `体感 ${cur.apparentTemperature.toFixed(0)}℃`) : null,
            cur.humidity != null ? h('div', {}, `💧 湿度 ${cur.humidity}%`) : null,
            precipNow != null ? h('div', {}, `☔ 降水確率 ${precipNow}%`) : null
          )
        ),
        hourlyBlock(data),
        config.showWeekly !== false && data.daily?.length > 0
          ? h(
              'div',
              { class: 'w-weather-week' },
              data.daily.slice(0, 7).map((d, i) => {
                const wi = weatherInfo(d.weatherCode)
                return h(
                  'div',
                  { class: 'w-weather-day', title: wi.label },
                  h('div', { class: `w-weather-dayname ${i === 0 ? 'is-today' : ''}` }, dayLabel(d.date, i)),
                  h('div', { class: 'w-weather-dayicon', 'aria-hidden': 'true' }, wi.emoji),
                  h(
                    'div',
                    { class: 'w-weather-hilo' },
                    `${d.tempMax != null ? Math.round(d.tempMax) : '-'}°`,
                    h('span', {}, `/${d.tempMin != null ? Math.round(d.tempMin) : '-'}°`)
                  ),
                  h('div', { class: 'w-weather-pop' }, d.precipProbMax != null ? `${d.precipProbMax}%` : '-')
                )
              })
            )
          : null
      )
    }

    const load = async () => {
      try {
        render(await api.weather(config.lat, config.lon), null)
      } catch (err) {
        render(null, err)
      }
    }
    // 幅が変わってラベルの間引き間隔が変わるときだけ再描画（無限ループ防止）
    const ro = new ResizeObserver(() => {
      if (!lastData) return
      if (stepFor(26) !== curPctStep || Math.max(stepFor(26), stepFor(42)) !== curHourStep) render(lastData, null)
    })
    ro.observe(el)
    bag.add(() => ro.disconnect())

    render(null, null)
    load()
    bag.interval(load, 10 * 60 * 1000)
    return { el, destroy: () => bag.run() }
  },

  configForm(draft) {
    const current = h('div', { class: 'form-note' })
    const updateCurrent = () => {
      current.textContent = `現在の地域: ${draft.locationName || '未設定'}`
    }
    updateCurrent()

    const resultsEl = h('div', {})
    const presetsEl = h('div', { class: 'chip-row' })
    const renderPresets = () => {
      presetsEl.replaceChildren(
        ...PRESETS.map((p) =>
          h(
            'button',
            {
              type: 'button',
              class: `chip ${draft.locationName === p.name ? 'chip-on' : ''}`,
              onClick: () => {
                Object.assign(draft, { locationName: p.name, lat: p.lat, lon: p.lon })
                updateCurrent()
                renderPresets()
                resultsEl.replaceChildren()
              },
            },
            p.name
          )
        )
      )
    }
    renderPresets()

    const search = debounce(async (q) => {
      if (!q || q.length < 2) return resultsEl.replaceChildren()
      resultsEl.replaceChildren(h('div', { class: 'form-note' }, '検索中…'))
      try {
        const results = await api.geocode(q)
        resultsEl.replaceChildren(
          results.length === 0
            ? h('div', { class: 'form-note' }, '見つかりませんでした')
            : h(
                'div',
                { class: 'pick-list' },
                results.map((r) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'pick-result',
                      onClick: () => {
                        Object.assign(draft, { locationName: r.name, lat: r.lat, lon: r.lon })
                        updateCurrent()
                        renderPresets()
                        resultsEl.replaceChildren()
                      },
                    },
                    h('b', {}, r.name),
                    h('span', { class: 'pick-ip' }, [r.admin1, r.country].filter(Boolean).join(' / '))
                  )
                )
              )
        )
      } catch (err) {
        resultsEl.replaceChildren(h('div', { class: 'form-note' }, `検索できませんでした: ${err.message}`))
      }
    }, 400)

    return h(
      'div',
      { class: 'form' },
      current,
      field('主要都市から選ぶ', presetsEl),
      field('地名で検索', textInput({ placeholder: '例: 世田谷、軽井沢', onInput: search }), '市区町村名などを入力（日本語OK・海外も検索できます）'),
      resultsEl,
      h(
        'div',
        { class: 'row-wrap' },
        toggle({ checked: draft.showHourly !== false, label: '24時間の降水確率', onChange: (v) => (draft.showHourly = v) }),
        toggle({ checked: draft.showWeekly !== false, label: '週間予報', onChange: (v) => (draft.showWeekly = v) })
      )
    )
  },
}
