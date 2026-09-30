# 2026年度後期 連絡バスデータ

含まれているファイル:

- `bus_calendar.json`: 日付ごとの運行種別
- `bus_timetable.json`: 停留所ごとの発車時刻
- `app.py`: 時刻表確認用CLI
- `20260914_news.pdf` / `20260914_bus.pdf` / `20260914_time.pdf`: 大学公開の元資料

## 運行種別

- `two_bus`: 2台運行日（通常授業開講日及び試験期間）
- `three_bus_all`: 3台運行日（日野デー臨時便終日運行、水曜日）
- `three_bus_pm`: 3台運行日（日野デー臨時便午後便のみ運行、木曜日）
- `one_bus`: 1台運行日（集中授業日及び補講期間）

※ 11月23日（祝日）は授業実施のため通常運行

## 使い方

### 指定日の時刻表を表示

```bash
python app.py schedule --date 2026-10-07 --stop minamiosawa_east
```

### 指定時刻の次のバスを表示

```bash
python app.py next --datetime "2026-10-07 16:00" --stop hino
```

## 停留所名

- `minamiosawa_east`: 南大沢キャンパス東
- `minamiosawa_west`: 南大沢キャンパス西
- `hino`: 日野キャンパス
