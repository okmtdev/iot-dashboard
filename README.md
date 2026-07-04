# 🏠 iot-dashboard — おうちネットワーク可視化ダッシュボード

家庭内ネットワークにつながっている PC・スマホ・IoT 機器・カメラなどを **見える化** する、
ローカル運用前提の Web アプリケーションです。mini PC（Ubuntu）に置いて、家族みんなのブラウザから使えます。

- **依存パッケージゼロ**: Node.js 標準ライブラリのみで動作。`git clone` して `node server/index.js` だけで起動（`npm install` 不要）
- **デバイス台帳**: 検出した端末に名前・カテゴリ・メモを付けて管理。**MACアドレスで識別**するので DHCP で IP が変わっても追従
- **死活監視**: ping（ICMP）と ARP の併用で接続状態を判定。応答時間の履歴グラフも
- **カスタムダッシュボード**: 時計・天気・カメラ映像・死活モニター・カレンダー・ToDo など 14 種類のウィジェットをドラッグ＆リサイズで自由に配置
- **全画面（キオスク）表示**: ページ内全画面／ブラウザ全画面の 2 段階。壁掛けタブレットやサブモニターにそのまま常時表示できる
- **Markdown 対応メモ**: 見出し・太字・チェックリストなどで見やすい伝言・覚え書きを
- **ライト / ダークモード** 対応のやさしい UI（システム連動も可）

| ダッシュボード（ライト） | ダッシュボード（ダーク） |
| --- | --- |
| ![dashboard light](docs/dashboard-light.png) | ![dashboard dark](docs/dashboard-dark.png) |

| デバイス一覧 | モバイル表示 |
| --- | --- |
| ![devices](docs/devices-light.png) | <img src="docs/mobile.png" width="260" alt="mobile"> |

---

## 目次

- [ウィジェット一覧](#ウィジェット一覧)
- [仕組み（どうやって検出しているか）](#仕組みどうやって検出しているか)
- [必要要件](#必要要件)
- [クイックスタート](#クイックスタート)
- [本番運用（systemd）](#本番運用systemd)
- [Docker で運用する場合](#docker-で運用する場合)
- [環境変数](#環境変数)
- [画面の使い方](#画面の使い方)
- [カメラ映像を表示するには](#カメラ映像を表示するには)
- [運用・メンテナンス](#運用メンテナンス)
- [セキュリティ](#セキュリティ)
- [トラブルシューティング](#トラブルシューティング)
- [API リファレンス（抜粋）](#api-リファレンス抜粋)
- [開発](#開発)

---

## ウィジェット一覧

| ウィジェット | 内容 |
| --- | --- |
| 🟢 デバイス死活モニター | 選んだデバイス（または全デバイス）のオンライン状態と応答時間を一覧表示 |
| 📈 応答時間グラフ | 1台のデバイスへの ping 応答時間の推移と損失率（ホバーで詳細） |
| 🎥 カメラ・ストリーミング | HLS / MJPEG / 動画 / YouTube / Webページ埋め込み。全画面表示対応 |
| 🖼️ フォト | 写真をその場でアップロードして表示。複数枚ならスライドショー（デジタルフォトフレームに） |
| 📅 カレンダー | 今月のカレンダー。今日をハイライト（タイムゾーン・週はじまり選択可） |
| ⏳ カウントダウン | 記念日・旅行・締切などその日までの残り日数を大きく表示（毎年くり返し対応） |
| ✅ やることリスト | チェックできる ToDo。表示中にチェック／その場で項目追加でき、そのまま保存 |
| 🕒 時計・日付 | 国・地域（タイムゾーン）を選べる時計。デジタル / アナログ、秒・日付表示 |
| 🌤️ 天気予報 | 地域を選んで現在の天気・気温・湿度・降水確率、24時間の降水確率、週間予報（Open-Meteo・APIキー不要） |
| 📡 ネットワークサマリー | オンライン台数・新規デバイス・最終スキャン・サブネット |
| 🖥️ サーバーモニター | mini PC の CPU・メモリ・ディスク・温度・通信量・稼働時間 |
| ⚡ リモート起動 (WoL) | Wake-on-LAN のマジックパケットをワンタップ送信 |
| 🔗 クイックリンク | ルーター管理画面や NAS など、家の中の URL ランチャー |
| 📝 メモ | 家族への伝言・覚え書き。**Markdown**（見出し・太字・斜体・チェックリスト・引用・リンク・コード等）に対応 |

ダッシュボードは複数枚作成でき（リビング用・カメラ用など）、レイアウトは自動保存されます。

## 仕組み（どうやって検出しているか）

1. **スイープスキャン**（既定 3 分ごと）: 接続中のサブネット（例 `192.168.1.0/24`）全体へ ping を打ち、
   カーネルの ARP テーブル（`ip neigh`）から **IP と MAC アドレスの対応** を取得します。
2. **死活監視**（既定 30 秒ごと）: 登録済みデバイスにだけ ping し、応答時間を記録します。
3. **オンライン判定**: ping 応答 **または** 新鮮な ARP 応答があれば「オンライン」。
   ping をブロックする機器（スマート家電に多い）も ARP には必ず応答するため拾えます。
   最後に確認できてから猶予時間（既定 2 分）を過ぎると「オフライン」になります。
4. デバイスは **MACアドレスをキー** に保存されるため、DHCP で IP が変わっても名前・カテゴリ・メモは引き継がれます。

補足:

- `ping` コマンドが無い環境では TCP 接続による簡易判定に自動フォールバックします（精度はやや落ちます）。
- 検出できるのは **同じ L2 セグメント（サブネット）にいる端末** です。別 VLAN・別セグメントは
  設定の「サブネット上書き」でスキャン対象に追加できます（MAC が取れないため IP ベースの追跡になります）。
- ホスト名は DNS 逆引きと mDNS（`avahi-resolve-address` があれば）で自動取得を試みます。

## 必要要件

- Ubuntu 22.04 / 24.04（他の Linux でも動作します）
- **Node.js 18.17 以上**（推奨: 22 LTS）
- `iputils-ping`, `iproute2`（Ubuntu なら標準で入っています）
- 任意: `avahi-daemon avahi-utils`（ホスト名の自動取得が強化されます）

Node.js が古い/無い場合（Ubuntu 22.04 の `apt` は古いので注意）:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # v22.x ならOK
```

## クイックスタート

```bash
git clone https://github.com/okmtdev/iot-dashboard.git
cd iot-dashboard
node server/index.js
```

これだけです（ビルドも `npm install` も不要）。起動したら同じ LAN 内のブラウザから
**`http://<mini PCのIPアドレス>:3000`** を開いてください。数秒後に最初のスキャンが終わり、
デバイスが並びはじめます。

> 🧪 **お試しモード**: 実ネットワークをスキャンせず、サンプルデータで UI を試せます。
> `npm run demo`（データは `./demo-data` に保存され、本番データとは分離されます）

## 本番運用（systemd）

電源を入れたら自動で起動する常駐サービスにします。

```bash
# 1) 配置（/opt に置く例）
sudo git clone https://github.com/okmtdev/iot-dashboard.git /opt/iot-dashboard

# 2) 専用ユーザーとデータディレクトリ
sudo useradd -r -s /usr/sbin/nologin iotdash
sudo mkdir -p /opt/iot-dashboard/data
sudo chown -R iotdash:iotdash /opt/iot-dashboard/data

# 3) サービス登録
sudo cp /opt/iot-dashboard/deploy/iot-dashboard.service /etc/systemd/system/
#    （node のパスが /usr/bin/node 以外なら ExecStart を修正: `which node` で確認）
sudo systemctl daemon-reload
sudo systemctl enable --now iot-dashboard

# 4) 動作確認
systemctl status iot-dashboard
curl http://localhost:3000/api/health
```

ログの確認:

```bash
journalctl -u iot-dashboard -f
```

ファイアウォール（ufw）を使っている場合は LAN からのアクセスだけ許可します:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp
```

> 💡 `http://<IP>:3000` の `:3000` を省きたい場合は、ユニットファイルの `Environment=PORT=80` に変更し、
> `sudo setcap 'cap_net_bind_service=+ep' $(readlink -f $(which node))` を実行してください
> （非 root で 80 番を使うための設定です）。

## Docker で運用する場合

```bash
git clone https://github.com/okmtdev/iot-dashboard.git
cd iot-dashboard
docker compose up -d --build
```

- **`network_mode: host` が必須** です。ブリッジネットワークだとコンテナから家庭内 LAN の
  ARP テーブルが見えず、デバイスを検出できません（WoL のブロードキャストも届きません）。
- ping（ICMP）のために `cap_add: NET_RAW` を付けています。
- データは `./data` にボリュームとして保存されます。

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `PORT` | `3000` | 待ち受けポート |
| `HOST` | `0.0.0.0` | 待ち受けアドレス（自分の端末だけで使うなら `127.0.0.1`） |
| `DATA_DIR` | `./data` | データ（`db.json`）の保存先ディレクトリ |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | なし | 両方設定すると Basic 認証が有効になります |
| `NO_SCAN` | なし | `1` でネットワークスキャンを無効化（UI開発用） |
| `DEMO` | なし | `1` でサンプルデータのデモモード（スキャン無効） |

スキャン間隔・監視間隔・対象サブネットなどは Web UI の **設定** 画面から変更できます。

## 画面の使い方

### デバイス

- 行をクリックすると編集画面が開き、**名前・カテゴリ（絵文字つき13種）・メモ** を付けられます
- IP・MAC・推定メーカー・ホスト名・初回検出・最終確認を確認できます
- フィルタ（オンライン / オフライン / NEW / 非表示）と検索、カテゴリ絞り込み
- 「⚡ WoL で起動」「🙈 一覧から非表示」「🗑️ 削除」もここから
- 24 時間以内に初めて見つかった端末には **NEW** バッジが付きます（知らないデバイスの検知に）

### ダッシュボード

1. 右上の「✏️ 編集」を押すと編集モードになります
2. 「＋ ウィジェット」から追加、上部のバーをドラッグで移動、右下の角でサイズ変更
3. ウィジェットの「⚙️」で設定（対象デバイス・地域・URL など）
4. 「✓ 完了」で通常表示に戻ります。**変更はすべて自動保存** されます

タブの「＋」でダッシュボードを何枚でも作れます（例: 全体用 / カメラ用 / 子ども部屋用）。

**⛶ 全画面表示（2段階）**: 閲覧モードの「⛶ 全画面」ボタンで、まずアプリのヘッダーやツールバーを
隠して**ページ内全画面**（タブいっぱい）にします。さらに右上の「⛶ ブラウザ全画面」を押すと、
ブラウザのアドレスバーごと**画面いっぱいの全画面**（Fullscreen API）になります。
終了は右上の「✕ 終了」または Esc。壁掛けタブレットやリビングのサブモニターに常時表示する
使い方にどうぞ。フォトウィジェットと組み合わせるとデジタルフォトフレーム兼モニターになります。

> 埋め込み環境などブラウザ全画面が使えない場合でも、ページ内全画面は常に利用できます。

**📝 メモ（Markdown）**: メモウィジェットは Markdown で書けます。設定画面のツールバー（見出し・
太字・チェックリスト等）とライブプレビューつきで、`# 見出し`・`**太字**`・`- [ ] やること`・
`> 引用`・`[リンク](URL)`・`` `コード` `` などが使えます。安全のため HTML タグはそのまま
文字として表示され、スクリプトは実行されません。

**🖼️ フォトウィジェット**: 設定画面の「📷 写真を追加」から、見ている端末（スマホ可）の写真を
その場でアップロードできます。アップロード時にブラウザ側で自動縮小（最大1920px・EXIF位置情報は
除去）され、サーバーの `data/uploads/` に保存されます。複数枚登録すると指定間隔のスライドショーに
なります。ウィジェットから外した写真は自動的に掃除されます（1時間の猶予つき）。

### 設定

- テーマ（ライト / ダーク / システム連動）
- スキャン間隔・死活監視間隔・オフライン判定の猶予
- スキャン対象サブネットの上書き（カンマ区切りで複数可）・インターフェース指定
- バックアップのダウンロード

## カメラ映像を表示するには

「🎥 カメラ・ストリーミング」ウィジェットは URL を入れるだけで表示します。

| 映像の種類 | 対応 | 例 |
| --- | --- | --- |
| MJPEG | ✅ そのまま表示 | `http://192.168.1.22:8081/`（motionEye、ESP32-CAM など） |
| HLS (.m3u8) | ✅（下記参照） | `http://192.168.1.5:1984/api/stream.m3u8?src=cam1` |
| MP4 / WebM | ✅ | ローカルの動画配信 URL |
| YouTube | ✅ 埋め込み表示 | 動画・ライブの URL をそのまま |
| Webページ埋め込み | ✅ iframe | go2rtc の再生ページなど |
| RTSP | ❌ ブラウザ非対応 | ↓ の変換を使ってください |

### RTSP カメラ（多くの監視カメラ）の場合

ブラウザは RTSP を直接再生できないため、[go2rtc](https://github.com/AlexxIT/go2rtc) や
[mediamtx](https://github.com/bluenviron/mediamtx) で変換するのが定番です。go2rtc の例:

```yaml
# go2rtc.yaml
streams:
  entrance: rtsp://user:pass@192.168.1.22:554/stream1
```

ウィジェットには次のどちらかを設定します。

- **Webページ埋め込み**モード: `http://<go2rtcのIP>:1984/stream.html?src=entrance`（追加ファイル不要・低遅延）
- **HLS** モード: `http://<go2rtcのIP>:1984/api/stream.m3u8?src=entrance`

### HLS を Chrome / Firefox で再生する場合の注意

Safari 以外のブラウザで HLS を再生するには [hls.js](https://github.com/video-dev/hls.js) が必要です。
本アプリは外部ライブラリを同梱しないため、必要な場合のみ 1 ファイル配置してください:

```bash
curl -L -o web/public/vendor/hls.min.js https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js
```

置くだけで自動的に読み込まれます（再起動不要）。go2rtc の埋め込みページ方式なら不要です。

## 運用・メンテナンス

### バックアップ

デバイス名・メモ・ダッシュボード構成・設定は **1 ファイル**（`data/db.json`）、
フォトウィジェットの写真は `data/uploads/` に入っています。`data/` ディレクトリごと
バックアップすれば完全です。

- 画面から: 設定 → 「⬇️ バックアップをダウンロード」（`db.json` のみ）
- コマンドで（cron の例・毎日3時に曜日ごと7世代保持）:

```bash
# crontab -e
0 3 * * * tar czf /var/backups/iot-dashboard-$(date +\%u).tar.gz -C /opt/iot-dashboard data
```

復元はサービスを止めて `data/` を書き戻すだけです。
起動時に自動で 1 世代のバックアップ（`db.json.bak`）も作られます。

### アップデート

```bash
cd /opt/iot-dashboard
sudo git pull
sudo systemctl restart iot-dashboard
```

依存パッケージが無いので `npm install` などは不要です。

### 知っておくと良いこと

- **応答時間の履歴（グラフ）はメモリ保持** です。サーバーを再起動するとグラフはリセットされます（台帳データは消えません）
- スキャンは 1 回あたり数秒、/24（254台ぶん）への ping 程度のごく軽い通信です
- データが壊れた場合は `data/db.json.bak` から復旧できます

## セキュリティ

- **LAN 内での利用が前提** です。ルーターのポート開放などでインターネットへ公開しないでください
- 家庭内でも念のため保護したい場合は Basic 認証を有効化:
  `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` を設定（systemd ユニット内のコメント参照）
- 外出先から見たい場合は、ポート公開ではなく **Tailscale などの VPN** を使うのがおすすめです
- このアプリが外部に送信する通信は、天気ウィジェット使用時の Open-Meteo API への問い合わせのみです

## トラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| デバイスが見つからない | 同一サブネットにいるか確認。メッシュWi-Fiの「APアイソレーション（プライバシーセパレーター）」が有効だと他端末が見えません。別セグメントは設定の「サブネット上書き」に追加 |
| スマホがすぐオフラインになる | スマホはスリープ中 ping に応答しないことがあります。設定で「オフライン判定の猶予」を伸ばす（5〜10分）と安定します |
| スマホが毎回“別デバイス”になる | iOS/Android の「プライベート Wi-Fi アドレス（ランダムMAC）」が原因。端末側でこの Wi-Fi だけ「固定」にすると台帳が安定します |
| オンラインのはずの機器がオフライン表示 | 機器が ICMP も ARP 更新も返さない省電力状態の可能性。ping間隔・猶予を調整 |
| WoL で起動しない | 対象機器の BIOS/UEFI と OS 側で Wake-on-LAN を有効化。無線LANでは使えないことが多く、有線接続推奨 |
| 天気が表示されない | サーバーがインターネットに出られるか確認（Open-Meteo へ HTTPS）。デモモードでは常にサンプル表示 |
| `ping コマンドが見つからない` と警告が出る | `sudo apt install iputils-ping`。無くても TCP フォールバックで動作はします |
| 起動しない（SyntaxError 等） | Node.js が古い可能性。`node --version` が 18.17 以上か確認 |
| ホスト名が出ない | ルーターが逆引きに対応していない環境では取れません。`sudo apt install avahi-daemon avahi-utils` で mDNS 解決が有効になります |

## API リファレンス（抜粋）

すべて `http://<host>:3000/api/...` の JSON API です。自動化やスクリプト連携にどうぞ。

| メソッド / パス | 説明 |
| --- | --- |
| `GET /api/overview` | 概況（台数・スキャン状態・サブネット等） |
| `GET /api/devices` | デバイス一覧（`?includeHidden=1` で非表示も） |
| `PATCH /api/devices/:mac` | 名前・カテゴリ・メモ・非表示の更新 |
| `GET /api/devices/:mac/latency` | 応答時間の履歴 |
| `POST /api/devices/:mac/wake` | Wake-on-LAN 送信 |
| `POST /api/scan` | 今すぐスキャン |
| `GET/POST /api/dashboards`, `PUT/DELETE /api/dashboards/:id` | ダッシュボード CRUD |
| `GET /api/system` | サーバー（mini PC）のリソース状況 |
| `GET /api/weather?lat=..&lon=..` | 天気（Open-Meteo プロキシ・10分キャッシュ） |
| `POST /api/uploads` | 画像アップロード（ボディに画像バイナリ・`Content-Type` 必須） |
| `GET /uploads/:file`, `DELETE /api/uploads/:file` | アップロード画像の取得 / 削除 |
| `GET/PUT /api/settings` | 設定 |
| `GET /api/export` | 設定・台帳データのバックアップダウンロード |

## 開発

```bash
node --watch server/index.js   # 変更を自動リロード（npm run dev）
NO_SCAN=1 npm run dev          # スキャンなしでUI開発
npm run demo                   # サンプルデータで起動
```

```
server/               Node.js（標準ライブラリのみ）
  index.js            エントリーポイント（HTTPサーバー・静的配信・認証）
  lib/scanner.js      スイープスキャン・死活監視・応答履歴
  lib/netinfo.js      インターフェース/サブネット/ゲートウェイ検出
  lib/probe.js        ping / TCPフォールバック
  lib/neigh.js        ARPテーブル（ip neigh / /proc/net/arp）
  lib/store.js        JSONファイルストア（アトミック書き込み）
  lib/{wol,oui,system,weather,uploads,demo}.js
  routes/api.js       REST API
web/public/           フロントエンド（ビルド不要の素のES Modules）
  js/grid.js          自作のドラッグ&リサイズグリッド
  js/markdown.js      依存ゼロの安全なMarkdownレンダラー（DOM構築でXSS対策）
  js/widgets/*.js     ウィジェット（1種類=1ファイル。自作ウィジェットの追加も簡単）
  app.css             デザイントークン（ライト/ダーク）
deploy/               systemd ユニット
```

外部ライブラリに依存しない構成のため、mini PC への導入が `git clone` だけで完結し、
サプライチェーンの心配もありません。新しいウィジェットは `web/public/js/widgets/` に
1 ファイル追加して `registry.js` に登録するだけで作れます。

## ライセンス

[MIT License](LICENSE)
