// デモモード (DEMO=1): 実スキャンの代わりにサンプルデバイスを投入して UI を試せるようにする

const SAMPLES = [
  { mac: 'aa:10:22:33:44:01', ip: '192.168.1.1', name: 'ルーター', category: 'network', vendor: 'Buffalo', gateway: true, online: true, rtt: 1.2, hostname: 'router.local' },
  { mac: 'aa:10:22:33:44:02', ip: '192.168.1.2', name: 'このサーバー (mini PC)', category: 'server', vendor: 'Intel (NUC等)', self: true, online: true, rtt: 0 },
  { mac: 'aa:10:22:33:44:03', ip: '192.168.1.10', name: 'NAS', category: 'server', vendor: 'Synology', online: true, rtt: 0.8, hostname: 'nas.local', note: '写真・バックアップ用' },
  { mac: 'aa:10:22:33:44:04', ip: '192.168.1.21', name: 'リビングのテレビ', category: 'tv', vendor: 'Sony (PlayStation)', online: false, note: '有機EL 55型' },
  { mac: 'aa:10:22:33:44:05', ip: '192.168.1.22', name: '玄関カメラ', category: 'camera', vendor: 'Reolink (Baichuan)', online: true, rtt: 3.4, note: 'RTSP→go2rtcでHLS配信' },
  { mac: 'aa:10:22:33:44:06', ip: '192.168.1.23', name: 'ベランダの温湿度計', category: 'sensor', vendor: 'Espressif (ESP)', online: true, rtt: 12.1, note: 'ESP32 + BME280' },
  { mac: 'aa:10:22:33:44:07', ip: '192.168.1.30', name: 'ノートPC', category: 'pc', vendor: 'Apple', online: true, rtt: 5.6, hostname: 'MacBook-Air.local' },
  { mac: 'ce:11:22:33:44:08', ip: '192.168.1.31', name: 'お父さんのスマホ', category: 'smartphone', vendor: null, randomized: true, online: true, rtt: 45.2 },
  { mac: 'aa:10:22:33:44:09', ip: '192.168.1.32', name: '', category: '', vendor: 'Xiaomi', online: true, rtt: 22.0, isNew: true },
  { mac: 'aa:10:22:33:44:0a', ip: '192.168.1.40', name: 'Switch', category: 'game', vendor: 'Nintendo', online: false, note: '子ども部屋' },
  { mac: 'aa:10:22:33:44:0b', ip: '192.168.1.41', name: 'プリンター', category: 'printer', vendor: 'Brother', online: false },
  { mac: 'aa:10:22:33:44:0c', ip: '192.168.1.50', name: 'スマートスピーカー', category: 'speaker', vendor: 'Amazon', online: true, rtt: 8.9 },
]

export function seedDemoDevices(store) {
  const now = Date.now()
  for (const s of SAMPLES) {
    if (store.data.devices[s.mac]) continue
    store.data.devices[s.mac] = {
      mac: s.mac,
      ip: s.ip,
      name: s.name || '',
      category: s.category || '',
      note: s.note || '',
      hostname: s.hostname || '',
      vendor: s.vendor ?? null,
      randomizedMac: !!s.randomized,
      firstSeen: s.isNew ? now - 3600_000 : now - 14 * 24 * 3600_000,
      lastSeen: s.online ? now : now - 26 * 3600_000,
      lastRttMs: s.online ? s.rtt : null,
      lastRttAt: s.online ? now : null,
      probeMethod: 'icmp',
      hidden: false,
      self: !!s.self,
      gateway: !!s.gateway,
    }
  }
  store.save()
}

// スキャナーの状態もそれっぽく見せる（デモではスキャンは動かないため）
export function demoScannerState(scanner) {
  scanner.lastScanAt = Date.now() - 25_000
  scanner.lastScanDurationMs = 4200
  scanner.subnets = ['192.168.1.0/24']
  scanner.gatewayIp = '192.168.1.1'
  scanner.iface = { name: 'enp1s0', address: '192.168.1.2', prefix: 24, mac: 'aa:10:22:33:44:02' }
}

// オンラインのサンプルを定期的に「見えた」ことにして、猶予切れでオフラインにならないようにする
export function keepDemoAlive(store, scanner) {
  const online = new Set(SAMPLES.filter((s) => s.online).map((s) => s.mac))
  const timer = setInterval(() => {
    const now = Date.now()
    for (const mac of online) {
      const d = store.data.devices[mac]
      if (d) d.lastSeen = now
    }
    if (scanner) scanner.lastScanAt = now - 25_000
  }, 30_000)
  timer.unref?.()
}
