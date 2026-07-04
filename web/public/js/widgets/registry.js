import clock from './clock.js'
import weather from './weather.js'
import deviceStatus from './device-status.js'
import networkSummary from './network-summary.js'
import systemMonitor from './system-monitor.js'
import stream from './stream.js'
import links from './links.js'
import notes from './notes.js'
import wol from './wol.js'
import pingChart from './ping-chart.js'

import { widgetMessage } from './common.js'

// ダッシュボードに配置できるウィジェット一覧（ギャラリーの表示順）
export const WIDGETS = Object.fromEntries(
  [deviceStatus, pingChart, stream, clock, weather, networkSummary, systemMonitor, wol, links, notes].map((w) => [
    w.type,
    w,
  ])
)

const UNKNOWN = {
  name: '不明なウィジェット',
  emoji: '❓',
  description: '',
  defaultLayout: { w: 3, h: 3, minW: 2, minH: 2 },
  defaultConfig: () => ({}),
  needsConfig: false,
  mount: () => ({ el: widgetMessage('未対応のウィジェットです'), destroy() {} }),
  configForm: null,
}

export function widgetDef(type) {
  return WIDGETS[type] || UNKNOWN
}
