# 東京都立大学 南大沢⇔日野キャンパス連絡バス タイムテーブル
https://www.tmu.ac.jp/campuslife_career/facility/minamiosawa_hino.html

東京都立大学の南大沢キャンパスと日野キャンパスを結ぶ連絡バスのタイムテーブルが確認できるサイト

## できること

- 指定した日時から次の便を表示する
- 現在時刻を使って、直近の便を調べる
- 当日の運行種別（1台 / 2台 / 3台・日野デー / 運休）を表示する

## ファイル構成

- `index.html`: 画面のマークアップ
- `app.js`: 検索、時刻計算、画面更新
- `styles.css`: UIスタイル
- `serve.py`: ローカル確認用の簡易サーバー
- `data/2026/first/`: 2026年度前期データ（運行日・時刻表・確認用CLI）
- `data/2026/second/`: 2026年度後期データ（運行日・時刻表・確認用CLI・元資料PDF）
  - `bus_calendar.json`: 運行日データ
  - `bus_timetable.json`: 時刻表データ
  - `app.py`: データ確認用CLI

## データ

- `app.js` の `termDirs` に並べた学期データ（2026年度前期・後期）をすべて読み込み、日付から該当する学期の時刻表を使います
- 新しい学期を追加するときは `data/<年度>/<学期>/` にデータを置き、`termDirs` に追記します
- 現在時刻の判定はブラウザ側で `Asia/Tokyo` を使います

## 停留所

- `minamiosawa_east`: 南大沢キャンパス東
- `minamiosawa_west`: 南大沢キャンパス西
- `hino`: 日野キャンパス

