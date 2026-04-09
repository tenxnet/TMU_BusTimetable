# TMU Bus Timetable Prototype

Goで作った、八王子キャンパス連絡バスのプロトタイプです。

GitHub Pages で動かす静的版も追加しています。`index.html` をそのまま Pages の公開対象にできます。

できること:

- 指定した日時から次に乗れるバスを表示
- 現在時刻を使って、今乗れる便と到着目安を表示
- 最終便を過ぎたら「本日のバスは終了しました」と表示
- スマホでも見やすいレスポンシブUI

## 起動

```bash
go run .
```

ブラウザで `http://localhost:8080` を開いてください。

静的版をローカルで確認するなら、次を実行してください。

```bash
python3 serve.py
```

その後、`http://127.0.0.1:8000` を開くと GitHub Pages 向けの静的版が見られます。

環境変数 `PORT` を指定すると、ポートを変更できます。

```bash
PORT=3000 go run .
```

## API

- `GET /api/now?stop=hino`
- `GET /api/next?stop=hino&date=2026-04-08&time=16:00`

## GitHub Pages

- `index.html`、`app.js`、`styles.css` が静的版です。
- `data/2026/first/bus_calendar.json` と `data/2026/first/bus_timetable.json` をブラウザ側で読み込みます。
- 現在時刻の判定はブラウザの `Asia/Tokyo` 表示を使います。

## 停留所

- `minamiosawa_east` - 南大沢キャンパス東
- `minamiosawa_west` - 南大沢キャンパス西
- `hino` - 日野キャンパス
