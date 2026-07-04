async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    let message = `エラー (HTTP ${res.status})`
    try {
      const j = await res.json()
      if (j.error) message = j.error
    } catch {
      /* JSONでないエラー応答 */
    }
    throw new Error(message)
  }
  return res.json()
}

export const api = {
  overview: () => request('/api/overview'),
  devices: (includeHidden = false) => request(`/api/devices${includeHidden ? '?includeHidden=1' : ''}`),
  patchDevice: (mac, body) => request(`/api/devices/${encodeURIComponent(mac)}`, { method: 'PATCH', body }),
  deleteDevice: (mac) => request(`/api/devices/${encodeURIComponent(mac)}`, { method: 'DELETE' }),
  latency: (mac) => request(`/api/devices/${encodeURIComponent(mac)}/latency`),
  wake: (mac) => request(`/api/devices/${encodeURIComponent(mac)}/wake`, { method: 'POST' }),
  scan: () => request('/api/scan', { method: 'POST' }),
  dashboards: () => request('/api/dashboards'),
  createDashboard: (body) => request('/api/dashboards', { method: 'POST', body }),
  updateDashboard: (id, body) => request(`/api/dashboards/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteDashboard: (id) => request(`/api/dashboards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  system: () => request('/api/system'),
  weather: (lat, lon) => request(`/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
  geocode: (q) => request(`/api/geocode?q=${encodeURIComponent(q)}`),
  settings: () => request('/api/settings'),
  saveSettings: (body) => request('/api/settings', { method: 'PUT', body }),
  uploadImage: async (blob) => {
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    })
    if (!res.ok) {
      let message = `アップロードに失敗しました (HTTP ${res.status})`
      try {
        const j = await res.json()
        if (j.error) message = j.error
      } catch {
        /* JSONでないエラー応答 */
      }
      throw new Error(message)
    }
    return res.json()
  },
  deleteUpload: (name) => request(`/api/uploads/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}
