export const CATEGORIES = [
  { id: 'pc', emoji: '💻', label: 'PC' },
  { id: 'smartphone', emoji: '📱', label: 'スマホ・タブレット' },
  { id: 'tv', emoji: '📺', label: 'テレビ・レコーダー' },
  { id: 'game', emoji: '🎮', label: 'ゲーム機' },
  { id: 'camera', emoji: '📷', label: 'カメラ' },
  { id: 'speaker', emoji: '🔊', label: 'スピーカー・音響' },
  { id: 'light', emoji: '💡', label: '照明' },
  { id: 'appliance', emoji: '🔌', label: 'スマート家電' },
  { id: 'sensor', emoji: '🌡️', label: 'センサー' },
  { id: 'network', emoji: '📡', label: 'ネットワーク機器' },
  { id: 'printer', emoji: '🖨️', label: 'プリンター' },
  { id: 'server', emoji: '🖥️', label: 'サーバー・NAS' },
  { id: 'other', emoji: '📦', label: 'その他' },
]

const UNKNOWN = { id: '', emoji: '❓', label: '未分類' }

export function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id) || UNKNOWN
}
