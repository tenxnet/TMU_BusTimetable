# 東京都立大学 南大沢⇔日野キャンパス連絡バス タイムテーブル
https://www.tmu.ac.jp/campuslife_career/facility/minamiosawa_hino.html

東京都立大学の南大沢キャンパスと日野キャンパスを結ぶ連絡バスのタイムテーブルが確認できるサイト

## できること

- 指定した日時から次の便を表示する
- 現在時刻を使って、直近の便を調べる
- 当日の運行種別を表示する 

## ファイル構成

- `index.html`: 画面のマークアップ
- `app.js`: 検索、時刻計算、画面更新
- `styles.css`: UIスタイル
- `serve.py`: ローカル確認用の簡易サーバー
- `data/2026/first/bus_calendar.json`: 運行日データ
- `data/2026/first/bus_timetable.json`: 時刻表データ
- `data/2026/first/app.py`: データ確認用CLI

## データ

- 現在は `data/2026/first/` 配下の 2026年度前期データを読み込みます
- 現在時刻の判定はブラウザ側で `Asia/Tokyo` を使います

## 停留所

- `minamiosawa_east`: 南大沢キャンパス東
- `minamiosawa_west`: 南大沢キャンパス西
- `hino`: 日野キャンパス

