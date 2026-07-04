# vendor/ — 任意の追加ライブラリ置き場

このアプリ本体は外部ライブラリなしで動作しますが、**Safari 以外のブラウザで
HLS (.m3u8) ストリーミングを再生する場合のみ**、hls.js をここに配置してください。

インターネットに接続できる環境で:

```bash
curl -L -o web/public/vendor/hls.min.js https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js
```

配置するとカメラウィジェットが自動で読み込みます（サーバーの再起動は不要）。
hls.js は Apache-2.0 ライセンスです。

なお、go2rtc の再生ページをウィジェットの「Webページ埋め込み」モードで表示する
方法なら、hls.js なしでもカメラ映像を表示できます（README.md 参照）。
