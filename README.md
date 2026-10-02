# 東京都立大学 南大沢⇔日野キャンパス連絡バス タイムテーブル
https://www.tmu.ac.jp/campuslife_career/facility/minamiosawa_hino.html

東京都立大学の南大沢キャンパスと日野キャンパスを結ぶ連絡バスのタイムテーブルが確認できるサイト

## できること

- 指定した日時から次の便を表示する
- 現在時刻を使って、直近の便を調べる
- 当日の運行種別（1台 / 2台 / 3台・日野デー / 運休）を表示する
- データの対応期間外は「データ未確認」と表示し、運休と区別する
- 日野発・南大沢発の静的ページで、運行区分別の全便・適用日・乗り場を確認する

## ファイル構成

- `index.html`: 画面のマークアップ
- `app.js`: 検索、時刻計算、画面更新
- `styles.css`: UIスタイル
- `serve.py`: ローカル確認用の簡易サーバー
- `data/terms.json`: 学期ごとの対応期間・出典・運行日程の確認日
- `scripts/build_pages.py`: 共通データから方面別ページ・トップの対応期間・サイトマップを生成
- `hino/index.html`, `minamiosawa/index.html`: 生成した方面別時刻表
- `tests/`: 日付判定と静的ページ生成の回帰テスト
- `data/2026/first/`: 2026年度前期データ（運行日・時刻表・確認用CLI）
- `data/2026/second/`: 2026年度後期データ（運行日・時刻表・確認用CLI・元資料PDF）
  - `bus_calendar.json`: 運行日データ
  - `bus_timetable.json`: 時刻表データ
  - `app.py`: データ確認用CLI

## データ

- `data/terms.json` の学期データをすべて読み込み、日付から該当する学期の時刻表を使います。
- `validFrom` / `validThrough` は運休日を含む公式日程の確認範囲です。最後の運行日を対応期限にしません。期間内の非運行日は運休、どの期間にも含まれない日は未確認です。
- `calendarVerifiedOn` は運行日程を資料と照合した日です。資料公開日 (`noticePublishedOn`) やサイト更新日 (`updated`) と区別し、ビルドだけで更新しません。全発車時刻の照合日を意味しません。
- 新しい学期は `data/<年度>/<学期>/` にJSONと元資料を置き、`terms` に対応期間・出典を追記します。最新公開分の `currentTerm` と実質更新日 `updated` を更新し、下記の生成と検証を実行して生成結果もコミットします。
- 現在時刻の判定はブラウザ側で `Asia/Tokyo` を使います

## 生成と検証

Python 3とNode.jsの標準ライブラリのみ使用します。

```sh
python3 scripts/build_pages.py
python3 scripts/build_pages.py --check
python3 -m unittest discover -s tests -p 'test_pages.py' -v
node --test tests/app.test.cjs
python3 serve.py
```

`hino/index.html` と `minamiosawa/index.html`、トップページの `BEGIN DATA COVERAGE` ブロック、`sitemap.xml` は生成対象です。生成ページを直接編集せず、元のJSON・registry・生成スクリプトを変更してください。`--check` は生成漏れがあると失敗します。GitHub Pagesはmainブランチのルートを配信するため、生成済みHTMLも必要です。

## 停留所

- `minamiosawa_east`: 南大沢キャンパス東
- `minamiosawa_west`: 南大沢キャンパス西
- `hino`: 日野キャンパス

トップページの `?stop=hino`、`?stop=minamiosawa_east`、`?stop=minamiosawa_west` で初期停留所を選べます。日付・時刻はアクセス時の値です。

## 検索エンジン向けの情報

- ページ名、説明文、正規URL、見出し、使い方と公式情報へのリンクは `index.html` に記載しています。
- 各方面ページにも固有のタイトル・説明・正規URLを設定し、トップと相互リンクしています。
- `sitemap.xml` にはトップ・日野発・南大沢発の3つの正規URLを記載しています。`lastmod` はregistryの `updated` から生成します。
- 公開先は `https://tenxnet.github.io/TMU_BusTimetable/` です。リポジトリ内の `robots.txt` はこのサブディレクトリに配信されるため、ドメイン全体のクロール制御には使われません。クロール制御を行う場合は `https://tenxnet.github.io/robots.txt` で設定する必要があります。
- 公開後はSearch Consoleの公開URLテストで取得結果を確認します。サイトマップの送信受付と、サイトマップレポートの読み取り成功は別々に確認します。
- 2026-10-02にトップのタイトルを「都立大連絡バス時刻表｜南大沢・日野の次の便を検索」へ変更し、対応期間表示・方面別ページ・乗り場案内も同時に追加しました。変更前のSearch Console Web検索（2026-06-30〜09-29）は838表示・10クリック・CTR 1.2%・平均順位7.5です。4週間程度を最初の観察目安とし、検索語・端末・順位帯や学期の違いも見て評価します。同時変更のためタイトル単独の効果は分離できません。
