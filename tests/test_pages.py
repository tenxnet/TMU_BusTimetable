"""Checks for data loss and misleading publication in generated timetables."""

import copy
import importlib.util
import unittest
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_pages", ROOT / "scripts/build_pages.py")
pages = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages)


class PageParser(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.links = []
        self.canonical = None
        self.description = None
        self.stylesheets = []
        self.title = ""
        self.h1 = []
        self.tables = []
        self.dates = []
        self._heading = None
        self._table = None
        self._row = None
        self.feed(content)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "a":
            self.links.append(attrs["href"])
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs["href"]
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.stylesheets.append(attrs["href"])
        if tag == "meta" and attrs.get("name") == "description":
            self.description = attrs["content"]
        if tag in ("title", "h1"):
            self._heading = tag
            if tag == "h1":
                self.h1.append("")
        if tag == "table":
            self._table = {"rows": [], "headers": [], "caption": False}
            self.tables.append(self._table)
        if tag == "caption" and self._table is not None:
            self._table["caption"] = True
        if tag == "th":
            self._table["headers"].append(attrs.get("scope"))
        if tag == "tr" and self._table is not None:
            self._row = []
        if tag == "time":
            value = attrs["datetime"]
            if self._table is not None:
                self._row.append(value)
            else:
                self.dates.append(value)

    def handle_data(self, content):
        if self._heading == "title":
            self.title += content
        if self._heading == "h1":
            self.h1[-1] += content

    def handle_endtag(self, tag):
        if tag in ("title", "h1"):
            self._heading = None
        if tag == "tr" and self._row:
            self._table["rows"].append(self._row)
        if tag == "table":
            self._table = None


class GeneratedPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry, cls.term, cls.calendar, cls.timetable = pages.load_data(ROOT)
        cls.outputs = pages.build_outputs(ROOT)

    def test_all_departures_and_dates_are_published_without_loss(self):
        expected_dates = [value for values in self.calendar.values() for value in values]
        for direction, config in pages.DIRECTIONS.items():
            with self.subTest(direction=direction):
                parsed = PageParser(self.outputs[f"{direction}/index.html"])
                self.assertEqual(len(parsed.tables), len(pages.SERVICES))
                for service, table in zip(pages.SERVICES, parsed.tables):
                    expected_rows = list(zip(*(self.timetable["timetables"][service][stop] for stop in config["stops"])))
                    self.assertEqual(table["rows"], [list(row) for row in expected_rows])
                    self.assertEqual(table["headers"], ["col"] * len(config["stops"]))
                    self.assertTrue(table["caption"])
                # Coverage and verification dates appear in addition to applicable dates.
                self.assertCountEqual(parsed.dates, [self.term["validFrom"], self.term["validThrough"], self.term["calendarVerifiedOn"], *expected_dates])

    def test_metadata_and_internal_navigation_are_distinct_and_complete(self):
        titles, descriptions = set(), set()
        for direction, config in pages.DIRECTIONS.items():
            with self.subTest(direction=direction):
                parsed = PageParser(self.outputs[f"{direction}/index.html"])
                titles.add(parsed.title)
                descriptions.add(parsed.description)
                self.assertEqual(len(parsed.h1), 1)
                self.assertEqual(parsed.canonical, f"{pages.BASE_URL}{direction}/")
                self.assertEqual(parsed.stylesheets, [f'../styles.css?v={self.registry["updated"]}'])
                for target in ("../#search", "../hino/", "../minamiosawa/"):
                    self.assertIn(target, parsed.links)
                for stop in config["stops"]:
                    self.assertIn(f"../?stop={stop}#search", parsed.links)
                for service in pages.SERVICES:
                    self.assertIn(f"#{service}", parsed.links)
        self.assertEqual(len(titles), len(pages.DIRECTIONS))
        self.assertEqual(len(descriptions), len(pages.DIRECTIONS))

    def test_sitemap_contains_only_the_three_canonical_pages(self):
        root = ElementTree.fromstring(self.outputs["sitemap.xml"])
        namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        self.assertCountEqual([item.text for item in root.findall("s:url/s:loc", namespace)], [pages.BASE_URL, f"{pages.BASE_URL}hino/", f"{pages.BASE_URL}minamiosawa/"])
        self.assertTrue(all(item.text == self.registry["updated"] for item in root.findall("s:url/s:lastmod", namespace)))

    def test_home_coverage_updates_only_the_marked_block(self):
        before = '<h1>Keep my heading</h1>\n  <!-- BEGIN DATA COVERAGE -->'
        after = '<!-- END DATA COVERAGE -->\n<p>Keep my description</p>'
        source = before + '\n  <p>Old dates</p>\n  ' + after
        updated = pages.render_home_coverage(source, self.term)
        self.assertTrue(updated.startswith(before))
        self.assertTrue(updated.endswith(after))
        self.assertNotIn("Old dates", updated)
        for value in (self.term["label"], self.term["validFrom"], self.term["validThrough"], self.term["calendarVerifiedOn"]):
            self.assertIn(value, updated)
        self.assertEqual(pages.render_home_coverage(updated, self.term), updated)
        with self.assertRaisesRegex(ValueError, "marker pair"):
            pages.render_home_coverage("<h1>Missing markers</h1>", self.term)

    def test_committed_outputs_match_shared_sources(self):
        for relative, expected in self.outputs.items():
            with self.subTest(path=relative):
                self.assertEqual((ROOT / relative).read_text(encoding="utf-8"), expected)

    def test_duplicate_calendar_date_is_rejected(self):
        calendar = copy.deepcopy(self.calendar)
        calendar["one_bus_dates"].append(calendar["two_bus_dates"][0])
        calendar["one_bus_dates"].sort()
        with self.assertRaisesRegex(ValueError, "Duplicate calendar date"):
            pages.validate_data(self.registry, calendar, self.timetable)

    def test_date_outside_coverage_is_rejected(self):
        calendar = copy.deepcopy(self.calendar)
        calendar["one_bus_dates"].append("2099-04-01")
        with self.assertRaisesRegex(ValueError, "outside published coverage"):
            pages.validate_data(self.registry, calendar, self.timetable)

    def test_invalid_or_unsorted_times_are_rejected(self):
        for replacement in (("24:00", "Invalid time"), ("00:00", "unique and sorted")):
            with self.subTest(value=replacement[0]):
                timetable = copy.deepcopy(self.timetable)
                timetable["timetables"]["two_bus"]["hino"][-1] = replacement[0]
                with self.assertRaisesRegex(ValueError, replacement[1]):
                    pages.validate_data(self.registry, self.calendar, timetable)

    def test_unknown_stop_and_truncated_comparison_are_rejected(self):
        timetable = copy.deepcopy(self.timetable)
        timetable["timetables"]["two_bus"]["unknown"] = ["09:00"]
        with self.assertRaisesRegex(ValueError, "Unexpected stops"):
            pages.validate_data(self.registry, self.calendar, timetable)
        timetable = copy.deepcopy(self.timetable)
        timetable["timetables"]["two_bus"]["minamiosawa_west"].pop()
        with self.assertRaisesRegex(ValueError, "lengths differ"):
            pages.validate_data(self.registry, self.calendar, timetable)


if __name__ == "__main__":
    unittest.main()
