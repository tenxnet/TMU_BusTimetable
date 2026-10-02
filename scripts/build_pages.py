#!/usr/bin/env python3
"""Generate crawlable direction timetables from the app's shared JSON data.

Run from any directory: python3 scripts/build_pages.py [--check]
Only the Python standard library is required. On the home page, only the marked
data-coverage block is synchronized; the rest of the page stays unchanged.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date
from html import escape
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://tenxnet.github.io/TMU_BusTimetable/"
STOPS = ("minamiosawa_east", "minamiosawa_west", "hino")
SERVICES = {
    "two_bus": ("2台運行", "通常授業開講日・試験期間の運行区分です。"),
    "three_bus_all": ("3台運行（日野デー・終日）", "日野デーの臨時便を終日運行する区分です。"),
    "three_bus_pm": ("3台運行（日野デー・午後）", "日野デーの臨時便は午後のみです。午前を含む一日の全便を掲載しています。"),
    "one_bus": ("1台運行", "集中授業日・補講期間の運行区分です。"),
}
DIRECTIONS = {
    "hino": {
        "title": "日野発の都立大連絡バス時刻表｜南大沢行き",
        "heading": "日野発・南大沢行き 連絡バス時刻表",
        "stops": ("hino",),
        "columns": ("日野キャンパス発",),
        "intro": "日野キャンパスから南大沢キャンパスへ向かう、東京都立大学の連絡バス時刻表です。",
        "description": "都立大の日野キャンパス発・南大沢行き連絡バス。{label}の全4運行区分の発車時刻と適用日、6号館前の乗り場、利用方法を確認できます。",
        "boarding": (("日野キャンパス", "6号館前"),),
    },
    "minamiosawa": {
        "title": "南大沢発の都立大連絡バス時刻表｜東・西から日野へ",
        "heading": "南大沢発・日野行き 連絡バス時刻表（東・西）",
        "stops": ("minamiosawa_east", "minamiosawa_west"),
        "columns": ("南大沢キャンパス東発", "南大沢キャンパス西発"),
        "intro": "南大沢キャンパスから日野キャンパスへ向かう、東京都立大学の連絡バス時刻表です。東・西それぞれの停留所の発車時刻を並べて確認できます。",
        "description": "都立大の南大沢キャンパス東・西発、日野行き連絡バス。{label}の全4運行区分の発車時刻を比較でき、適用日と東・西の乗り場、利用方法も確認できます。",
        "boarding": (("南大沢キャンパス東", "9〜10号館北側"), ("南大沢キャンパス西", "6号館地下駐車場入口")),
    },
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def iso_date(value):
    require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value), f"Invalid ISO date: {value!r}")
    return date.fromisoformat(value)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate_data(registry, calendar, timetable):
    """Reject input that could silently publish an incomplete or wrong timetable."""
    terms = registry["terms"]
    require(bool(terms), "No published terms")
    ids = [term["id"] for term in terms]
    require(len(ids) == len(set(ids)), "Duplicate term id")
    require(registry["currentTerm"] in ids, "currentTerm must identify a published term")
    iso_date(registry["updated"])
    term = next(term for term in terms if term["id"] == registry["currentTerm"])
    start, end = iso_date(term["validFrom"]), iso_date(term["validThrough"])
    require(start <= end, "Term coverage is reversed")
    iso_date(term["calendarVerifiedOn"])
    require(set(timetable["meta"]["stops"]) == set(STOPS), "Unexpected timetable stops")
    require(set(timetable["timetables"]) == set(SERVICES), "Unknown or missing service type in timetable")
    require(set(calendar) == {f"{service}_dates" for service in SERVICES}, "Unknown or missing service type in calendar")
    seen_dates = set()
    for service in SERVICES:
        dates = calendar[f"{service}_dates"]
        require(dates == sorted(dates), f"Unsorted calendar dates: {service}")
        for value in dates:
            require(start <= iso_date(value) <= end, f"Calendar date outside published coverage: {value}")
            require(value not in seen_dates, f"Duplicate calendar date: {value}")
            seen_dates.add(value)
        schedules = timetable["timetables"][service]
        require(set(schedules) == set(STOPS), f"Unexpected stops in {service}")
        for stop, times in schedules.items():
            require(bool(times), f"Empty timetable: {service}/{stop}")
            require(all(isinstance(value, str) and re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) for value in times), f"Invalid time: {service}/{stop}")
            require(times == sorted(set(times)), f"Times must be unique and sorted: {service}/{stop}")
        require(len(schedules["minamiosawa_east"]) == len(schedules["minamiosawa_west"]), f"East/west timetable lengths differ: {service}")
    require(bool(seen_dates), "Calendar has no operating dates")
    return term


def load_data(root=ROOT):
    registry = read_json(root / "data/terms.json")
    matches = [term for term in registry["terms"] if term["id"] == registry["currentTerm"]]
    require(len(matches) == 1, "currentTerm must identify exactly one published term")
    directory = (root / matches[0]["directory"]).resolve()
    require(directory.is_relative_to(root.resolve()), "Term directory must be inside the repository")
    calendar = read_json(directory / "bus_calendar.json")
    timetable = read_json(directory / "bus_timetable.json")
    term = validate_data(registry, calendar, timetable)
    return registry, term, calendar, timetable


def e(value):
    return escape(str(value), quote=True)


def japanese_date(value):
    parsed = iso_date(value)
    return f"{parsed.year}年{parsed.month}月{parsed.day}日"


def date_markup(value):
    return f'<time datetime="{e(value)}">{japanese_date(value)}</time>'


def date_details(service, dates):
    months = defaultdict(list)
    for value in dates:
        months[value[:7]].append(value)
    items = []
    weekdays = "月火水木金土日"
    for month, values in months.items():
        parsed_month = iso_date(f"{month}-01")
        days = "、".join(
            f'<time datetime="{e(value)}">{iso_date(value).day}日（{weekdays[iso_date(value).weekday()]}）</time>'
            for value in values
        )
        items.append(f"            <li><strong>{parsed_month.year}年{parsed_month.month}月：</strong>{days}</li>")
    content = "\n".join(items) or "            <li>この期間に該当する運行日はありません。</li>"
    return f'''        <details class="service-dates">
          <summary>{e(SERVICES[service][0])}の適用日を確認（{len(dates)}日）</summary>
          <ul class="date-list">
{content}
          </ul>
        </details>'''


def service_table(service, config, calendar, timetable):
    label, explanation = SERVICES[service]
    schedules = timetable["timetables"][service]
    columns = "".join(f'<th scope="col">{e(label)}</th>' for label in config["columns"])
    rows = []
    for times in zip(*(schedules[stop] for stop in config["stops"])):
        cells = "".join(f'<td><time datetime="{e(value)}">{e(value)}</time></td>' for value in times)
        rows.append(f"              <tr>{cells}</tr>")
    return f'''    <section class="panel timetable-section" id="{service}" aria-labelledby="{service}-title">
      <h2 id="{service}-title">{e(label)}</h2>
      <p>{e(explanation)}</p>
{date_details(service, calendar[f"{service}_dates"])}
      <div class="table-scroll">
        <table class="schedule-table">
          <caption>{e(label)}の発車時刻（各停留所 {len(rows)}便）</caption>
          <thead><tr>{columns}</tr></thead>
          <tbody>
{chr(10).join(rows)}
          </tbody>
        </table>
      </div>
      <p class="note"><a href="#service-types">運行区分の一覧へ戻る</a></p>
    </section>'''


def render_page(direction, registry, term, calendar, timetable):
    config = DIRECTIONS[direction]
    canonical = f"{BASE_URL}{direction}/"
    description = config["description"].format(label=term["label"])
    links = []
    for slug, label in (("", "次の便を検索"), ("hino", "日野発の時刻表"), ("minamiosawa", "南大沢発（東・西）の時刻表")):
        href = f"../{slug}/" if slug else "../#search"
        current = ' aria-current="page"' if slug == direction else ""
        links.append(f'        <a href="{href}"{current}>{label}</a>')
    services = "\n".join(f'        <a href="#{service}">{e(label)}</a>' for service, (label, _) in SERVICES.items())
    boarding = "\n".join(f"        <li><strong>{e(stop)}：</strong>{e(location)}</li>" for stop, location in config["boarding"])
    stop_links = "\n".join(f'        <a href="../?stop={stop}#search">{e(label.removesuffix("発"))}から次の便を検索</a>' for stop, label in zip(config["stops"], config["columns"]))
    source_links = [
        (registry["officialPage"], "東京都立大学公式の連絡バス情報"),
        (term["calendarSource"], f'{term["label"]}の運行日程（公式PDF）'),
        (registry["boardingMap"], "乗降場地図（公式PDF）"),
    ]
    if term.get("noticeSource"):
        source_links.append((term["noticeSource"], f'{term["label"]}の運行・利用案内（公式）'))
    sources = "\n".join(f'        <li><a href="{e(url)}">{e(label)}</a></li>' for url, label in source_links)
    sections = "\n\n".join(service_table(service, config, calendar, timetable) for service in SERVICES)
    return f'''<!doctype html>
<!-- Generated by scripts/build_pages.py from data/terms.json and shared timetable data. -->
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <title>{e(config["title"])}</title>
  <meta name="description" content="{e(description)}">
  <link rel="canonical" href="{canonical}">
  <meta property="og:title" content="{e(config["title"])}">
  <meta property="og:description" content="{e(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{canonical}">
  <meta property="og:locale" content="ja_JP">
  <link rel="icon" type="image/png" href="../assets/icon.png">
  <link rel="stylesheet" href="../styles.css?v={e(registry["updated"])}">
</head>
<body>
  <main class="shell">
    <header class="hero">
      <h1 class="hero-title">{e(config["heading"])}</h1>
      <p>{e(term["label"])} · 運行区分別の時刻表</p>
    </header>

    <nav class="direction-nav" aria-label="時刻表のページ">
{chr(10).join(links)}
    </nav>

    <section class="panel site-guide data-coverage" aria-labelledby="coverage-title">
      <h2 id="coverage-title">対応期間と運行日の確認</h2>
      <p>{e(config["intro"])}</p>
      <p><strong>対応期間：{date_markup(term["validFrom"])}〜{date_markup(term["validThrough"])}</strong><br>公式運行日程の確認日：{date_markup(term["calendarVerifiedOn"])}</p>
      <p>このページは運行区分別の全便を掲載しています。日付を選んだ当日の運行状況ではありません。乗車する日の運行区分を、各表の「適用日」または<a href="../#search">日付を指定できる検索ページ</a>で確認してください。</p>
      <p>この対応期間内で、いずれの区分の適用日にも含まれない日は運行日程上の運休日です。期間外はデータ未確認です。臨時の変更や運休は、<a href="{e(registry["officialPage"])}">大学公式のお知らせ</a>をご確認ください。</p>
      <div class="service-links">
{stop_links}
      </div>
    </section>

    <section class="panel site-guide" id="service-types" aria-labelledby="service-types-title">
      <h2 id="service-types-title">運行区分を選ぶ</h2>
      <nav class="service-links" aria-label="運行区分別の時刻表">
{services}
      </nav>
    </section>

{sections}

    <section class="panel site-guide" aria-labelledby="boarding-title">
      <h2 id="boarding-title">乗り場と利用方法</h2>
      <ul class="boarding-list">
{boarding}
      </ul>
      <p>大学が案内する乗降場は<a href="{e(registry["boardingMap"])}">公式の乗降場地図（PDF）</a>で確認できます。南大沢の東と西は異なる乗り場です。</p>
      <p>連絡バスは無料です。乗車の際は学生証または教職員証を提示してください。大学の学生・教職員等の利用案内は、<a href="{e(term.get("noticeSource", registry["officialPage"]))}">公式の運行・利用案内</a>をご確認ください。</p>
      <p>このサイトは東京都立大学の公式サイトではありません。公式資料をもとに時刻表を掲載しています。道路状況などで遅れる場合があるため、時間に余裕をもってご利用ください。</p>
    </section>

    <footer class="site-footer">
      <p>掲載内容の確認元</p>
      <ul class="source-list">
{sources}
      </ul>
      <p><a href="../#search">日付・時刻を指定して次の便を検索する</a></p>
    </footer>
  </main>
</body>
</html>
'''


def render_sitemap(updated):
    entries = "\n".join(
        f"  <url>\n    <loc>{BASE_URL}{path}</loc>\n    <lastmod>{e(updated)}</lastmod>\n  </url>"
        for path in ("", "hino/", "minamiosawa/")
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{entries}\n</urlset>\n'


def render_home_coverage(source, term):
    begin = "<!-- BEGIN DATA COVERAGE -->"
    end = "<!-- END DATA COVERAGE -->"
    require(source.count(begin) == source.count(end) == 1, "Home page needs one BEGIN/END DATA COVERAGE marker pair")
    start, finish = source.index(begin), source.index(end)
    require(start < finish, "Home coverage markers are reversed")
    indent = source[source.rfind("\n", 0, start) + 1:start]
    require(not indent.strip(), "Home coverage marker must be on its own line")
    block = f'''{begin}
{indent}<div class="data-coverage">
{indent}  <p id="data-coverage">掲載データ：{e(term["label"])}（{date_markup(term["validFrom"])}〜{date_markup(term["validThrough"])}）<br>運行日程の確認日：{date_markup(term["calendarVerifiedOn"])}</p>
{indent}  <a id="calendar-source" href="{e(term["calendarSource"])}">運行日程の出典</a>
{indent}</div>
{indent}{end}'''
    return source[:start] + block + source[finish + len(end):]


def build_outputs(root=ROOT):
    registry, term, calendar, timetable = load_data(root)
    outputs = {
        f"{direction}/index.html": render_page(direction, registry, term, calendar, timetable)
        for direction in DIRECTIONS
    }
    outputs["sitemap.xml"] = render_sitemap(registry["updated"])
    outputs["index.html"] = render_home_coverage((root / "index.html").read_text(encoding="utf-8"), term)
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated files differ; never write files")
    args = parser.parse_args()
    try:
        outputs = build_outputs()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Cannot generate timetables: {error}", file=sys.stderr)
        return 1
    stale = []
    for relative, content in outputs.items():
        path = ROOT / relative
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(relative)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"Generated {relative}")
    if stale:
        print("Generated files are stale: " + ", ".join(stale), file=sys.stderr)
        print("Run python3 scripts/build_pages.py and commit the updated files.", file=sys.stderr)
        return 1
    if args.check:
        print("Direction pages, sitemap and home coverage match their source data.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
