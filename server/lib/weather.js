// Open-Meteo（APIキー不要・非商用無料）のプロキシ。
// ブラウザから直接叩かず、サーバー側で短時間キャッシュして外部アクセスを抑える。

function localIso(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
}

// デモモード用のそれっぽい予報データ（外部アクセスなし）
export function demoForecast(lat, lon) {
  const now = new Date()
  const hour = now.getHours()
  const hourly = []
  for (let i = 0; i < 24; i++) {
    const t = new Date(now.getTime() + i * 3600_000)
    const hh = t.getHours()
    const rainy = hh >= 15 && hh <= 19
    hourly.push({
      time: localIso(t),
      temperature: Math.round((24 + 6 * Math.sin(((hh - 5) / 24) * Math.PI * 2) + 3) * 10) / 10,
      precipProb: rainy ? 40 + ((hh * 7) % 30) : (hh * 3) % 12,
      weatherCode: rainy ? 80 : hh >= 6 && hh <= 18 ? 1 : 0,
    })
  }
  const dailyCodes = [2, 1, 3, 61, 80, 0, 2]
  const daily = []
  for (let i = 0; i < 7; i++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    daily.push({
      date: localIso(t).slice(0, 10),
      weatherCode: dailyCodes[i],
      tempMax: 29 + ((i * 3) % 5),
      tempMin: 22 + ((i * 2) % 4),
      precipProbMax: dailyCodes[i] >= 61 ? 60 + i * 5 : 10 + i * 4,
    })
  }
  return {
    location: { lat: Number(lat) || 35.69, lon: Number(lon) || 139.69, timezone: 'Asia/Tokyo' },
    fetchedAt: Date.now(),
    demo: true,
    current: {
      temperature: 28.6,
      apparentTemperature: 31.2,
      humidity: 68,
      precipitation: 0,
      weatherCode: 2,
      windSpeed: 3.4,
      isDay: hour >= 6 && hour <= 18 ? 1 : 0,
    },
    hourly,
    daily,
  }
}

const FORECAST_TTL_MS = 10 * 60 * 1000
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000

const forecastCache = new Map()
const geocodeCache = new Map()

function cacheGet(map, key, ttl) {
  const hit = map.get(key)
  if (hit && Date.now() - hit.t < ttl) return hit.data
  return null
}

function cacheSet(map, key, data, max = 200) {
  map.set(key, { t: Date.now(), data })
  if (map.size > max) map.delete(map.keys().next().value)
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) {
    const err = new Error(`天気APIの応答エラー (HTTP ${res.status})`)
    err.status = 502
    throw err
  }
  return res.json()
}

export async function geocode(query) {
  const q = String(query || '').trim().slice(0, 80)
  if (!q) return []
  const cached = cacheGet(geocodeCache, q, GEOCODE_TTL_MS)
  if (cached) return cached
  const url =
    'https://geocoding-api.open-meteo.com/v1/search?' +
    new URLSearchParams({ name: q, count: '8', language: 'ja', format: 'json' })
  const json = await fetchJson(url)
  const results = (json.results || []).map((r) => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || '',
    countryCode: r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
  }))
  cacheSet(geocodeCache, q, results)
  return results
}

export async function forecast(lat, lon) {
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    const err = new Error('lat / lon が不正です')
    err.status = 400
    throw err
  }
  const key = `${la.toFixed(2)},${lo.toFixed(2)}`
  const cached = cacheGet(forecastCache, key, FORECAST_TTL_MS)
  if (cached) return cached

  const url =
    'https://api.open-meteo.com/v1/forecast?' +
    new URLSearchParams({
      latitude: String(la),
      longitude: String(lo),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
      hourly: 'temperature_2m,precipitation_probability,weather_code',
      forecast_hours: '24',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: '7',
      timezone: 'auto',
    })
  const json = await fetchJson(url)

  const cur = json.current || {}
  const hourly = []
  const ht = json.hourly?.time || []
  for (let i = 0; i < ht.length; i++) {
    hourly.push({
      time: ht[i],
      temperature: json.hourly.temperature_2m?.[i] ?? null,
      precipProb: json.hourly.precipitation_probability?.[i] ?? null,
      weatherCode: json.hourly.weather_code?.[i] ?? null,
    })
  }
  const daily = []
  const dt = json.daily?.time || []
  for (let i = 0; i < dt.length; i++) {
    daily.push({
      date: dt[i],
      weatherCode: json.daily.weather_code?.[i] ?? null,
      tempMax: json.daily.temperature_2m_max?.[i] ?? null,
      tempMin: json.daily.temperature_2m_min?.[i] ?? null,
      precipProbMax: json.daily.precipitation_probability_max?.[i] ?? null,
    })
  }

  const data = {
    location: { lat: la, lon: lo, timezone: json.timezone || 'Asia/Tokyo' },
    fetchedAt: Date.now(),
    current: {
      temperature: cur.temperature_2m ?? null,
      apparentTemperature: cur.apparent_temperature ?? null,
      humidity: cur.relative_humidity_2m ?? null,
      precipitation: cur.precipitation ?? null,
      weatherCode: cur.weather_code ?? null,
      windSpeed: cur.wind_speed_10m ?? null,
      isDay: cur.is_day ?? 1,
    },
    hourly,
    daily,
  }
  cacheSet(forecastCache, key, data, 50)
  return data
}
