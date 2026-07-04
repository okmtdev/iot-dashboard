import { h, btn, field, textInput, select, segmented, toast } from '../ui.js'
import { api } from '../api.js'
import { devicesPoller, getTheme, setTheme } from '../state.js'

function section(title, ...children) {
  return h('section', { class: 'card settings-section' }, h('h2', { class: 'settings-title' }, title), children)
}

export function renderSettingsPage(root) {
  const wrap = h('div', { class: 'settings' })
  root.replaceChildren(h('h1', { class: 'page-title' }, '設定'), wrap)
  wrap.append(h('div', { class: 'page-loading' }, '読み込み中…'))

  const overview = () => devicesPoller.get().data?.overview

  const saveField = async (patch) => {
    try {
      const next = await api.saveSettings(patch)
      toast('success', '設定を保存しました')
      return next
    } catch (err) {
      toast('error', err.message)
      return null
    }
  }

  api
    .settings()
    .then((settings) => {
      const draft = { subnetOverride: settings.subnetOverride || '', interfaceOverride: settings.interfaceOverride || '' }
      const ov = overview()

      wrap.replaceChildren(
        section(
          '🎨 外観',
          field(
            'テーマ',
            segmented({
              options: [
                { value: 'light', label: '☀️ ライト' },
                { value: 'dark', label: '🌙 ダーク' },
                { value: 'system', label: '💻 システム連動' },
              ],
              value: getTheme(),
              onChange: (v) => setTheme(v),
            })
          )
        ),

        section(
          '📡 ネットワークスキャン',
          h(
            'div',
            { class: 'settings-grid' },
            field(
              '全体スキャンの間隔',
              select({
                options: [
                  { value: 60, label: '1分' },
                  { value: 120, label: '2分' },
                  { value: 180, label: '3分（推奨）' },
                  { value: 300, label: '5分' },
                  { value: 600, label: '10分' },
                  { value: 1800, label: '30分' },
                ],
                value: settings.scanIntervalSec,
                onChange: (v) => saveField({ scanIntervalSec: Number(v) }),
              })
            ),
            field(
              '死活監視 (ping) の間隔',
              select({
                options: [
                  { value: 10, label: '10秒' },
                  { value: 15, label: '15秒' },
                  { value: 30, label: '30秒（推奨）' },
                  { value: 60, label: '1分' },
                  { value: 120, label: '2分' },
                ],
                value: settings.pingIntervalSec,
                onChange: (v) => saveField({ pingIntervalSec: Number(v) }),
              })
            ),
            field(
              'オフライン判定の猶予',
              select({
                options: [
                  { value: 60, label: '1分' },
                  { value: 120, label: '2分（推奨）' },
                  { value: 300, label: '5分' },
                  { value: 600, label: '10分' },
                ],
                value: settings.offlineGraceSec,
                onChange: (v) => saveField({ offlineGraceSec: Number(v) }),
              })
            )
          ),
          h(
            'div',
            { class: 'settings-grid settings-grid-2' },
            field(
              'スキャン対象サブネット（上書き）',
              textInput({ value: draft.subnetOverride, placeholder: '例: 192.168.1.0/24', onInput: (v) => (draft.subnetOverride = v) }),
              `空欄で自動検出${ov?.subnets?.length ? `（現在: ${ov.subnets.join(', ')}）` : ''}。カンマ区切りで複数指定できます`
            ),
            field(
              'ネットワークインターフェース（上書き）',
              textInput({ value: draft.interfaceOverride, placeholder: '例: enp1s0', onInput: (v) => (draft.interfaceOverride = v) }),
              `空欄で自動検出${ov?.iface ? `（現在: ${ov.iface.name} / ${ov.iface.address}）` : ''}`
            )
          ),
          btn({
            label: 'ネットワーク設定を保存',
            variant: 'primary',
            onClick: () => saveField(draft),
          }),
          h(
            'p',
            { class: 'form-note' },
            '死活判定は ping（ICMP）と ARP の両方で行います。ping に応答しない端末も、ARP応答があればオンラインとして扱われます。',
            ov?.capabilities?.tcpFallback
              ? h('span', { class: 'is-warn' }, ' ⚠️ ping コマンドが見つからないため、TCP接続による簡易判定で動作中です（iputils-ping のインストールを推奨）。')
              : null
          )
        ),

        section(
          '💾 データ',
          h(
            'div',
            { class: 'info-grid' },
            h('div', { class: 'info-row' }, h('span', { class: 'info-k' }, '保存先'), h('span', { class: 'info-v mono' }, settings.dataFile)),
            h(
              'div',
              { class: 'info-row' },
              h('span', { class: 'info-k' }, '登録デバイス数'),
              h('span', { class: 'info-v' }, ov ? `${ov.deviceCount}台` : '-')
            )
          ),
          h('a', { href: '/api/export', download: 'iot-dashboard-backup.json', class: 'btn btn-ghost settings-export' }, '⬇️ バックアップをダウンロード'),
          h(
            'p',
            { class: 'form-note' },
            'デバイス名・カテゴリ・メモ・ダッシュボード構成・設定がすべて1つのJSONファイルに保存されています。復元はファイルを保存先に戻すだけです。'
          )
        ),

        section(
          'ℹ️ このアプリについて',
          h(
            'div',
            { class: 'form-note' },
            `iot-dashboard v${ov?.version || '1.0.0'} — おうちのネットワークを見える化するローカルWebアプリ。`,
            h('br', {}),
            'デバイスの識別はMACアドレスで行うため、DHCP環境でIPアドレスが変わっても追従します。デプロイ・運用方法は README.md を参照してください。'
          )
        )
      )
    })
    .catch((err) => {
      wrap.replaceChildren(h('div', { class: 'page-loading' }, `設定を読み込めませんでした: ${err.message}`))
    })

  return () => {}
}
