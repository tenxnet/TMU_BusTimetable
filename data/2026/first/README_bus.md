# 2026年度前期 連絡バスデータ

含まれているファイル:

- `bus_calendar.json`: 日付ごとの運行種別
- `bus_timetable.json`: 停留所ごとの発車時刻
- `app.py`: 時刻表確認用CLI

## 使い方

### 指定日の時刻表を表示

```bash
python app.py schedule --date 2026-04-08 --stop minamiosawa_east
```

### 指定時刻の次のバスを表示

```bash
python app.py next --datetime "2026-04-08 16:00" --stop hino
```

## 停留所名

- `minamiosawa_east`: 南大沢キャンパス東
- `minamiosawa_west`: 南大沢キャンパス西
- `hino`: 日野キャンパス
