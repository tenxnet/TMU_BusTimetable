from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Literal

BASE_DIR = Path(__file__).resolve().parent
CALENDAR_PATH = BASE_DIR / "bus_calendar.json"
TIMETABLE_PATH = BASE_DIR / "bus_timetable.json"

Stop = Literal["minamiosawa_east", "minamiosawa_west", "hino"]
ServiceType = Literal["two_bus", "one_bus", "no_service"]

STOP_LABELS = {
    "minamiosawa_east": "南大沢キャンパス東",
    "minamiosawa_west": "南大沢キャンパス西",
    "hino": "日野キャンパス",
}


@dataclass(frozen=True)
class BusData:
    two_bus_dates: set[str]
    one_bus_dates: set[str]
    timetables: dict[str, dict[str, list[str]]]


def load_bus_data() -> BusData:
    with CALENDAR_PATH.open("r", encoding="utf-8") as f:
        calendar = json.load(f)
    with TIMETABLE_PATH.open("r", encoding="utf-8") as f:
        timetable = json.load(f)

    return BusData(
        two_bus_dates=set(calendar["two_bus_dates"]),
        one_bus_dates=set(calendar["one_bus_dates"]),
        timetables=timetable["timetables"],
    )


BUS_DATA = load_bus_data()


def get_service_type(target_date: date) -> ServiceType:
    d = target_date.isoformat()
    if d in BUS_DATA.two_bus_dates:
        return "two_bus"
    if d in BUS_DATA.one_bus_dates:
        return "one_bus"
    return "no_service"


def get_departures(target_date: date, stop: Stop) -> list[str]:
    service_type = get_service_type(target_date)
    if service_type == "no_service":
        return []
    return BUS_DATA.timetables[service_type][stop]


def get_next_bus(now: datetime, stop: Stop) -> str | None:
    departures = get_departures(now.date(), stop)
    current = now.strftime("%H:%M")
    for departure in departures:
        if departure >= current:
            return departure
    return None


def print_day_schedule(target_date: date, stop: Stop) -> None:
    service_type = get_service_type(target_date)
    stop_label = STOP_LABELS[stop]

    print(f"日付: {target_date.isoformat()}")
    print(f"停留所: {stop_label}")
    print(f"運行種別: {service_type}")

    departures = get_departures(target_date, stop)
    if not departures:
        print("この日は運休です。")
        return

    print("発車時刻:")
    for departure in departures:
        print(f"- {departure}")


def print_next_bus(now: datetime, stop: Stop) -> None:
    service_type = get_service_type(now.date())
    stop_label = STOP_LABELS[stop]

    print(f"現在時刻: {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"停留所: {stop_label}")
    print(f"運行種別: {service_type}")

    if service_type == "no_service":
        print("本日は運休です。")
        return

    next_bus = get_next_bus(now, stop)
    if next_bus is None:
        print("本日の便はすべて終了しています。")
    else:
        print(f"次のバス: {next_bus}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="2026年度前期 連絡バス時刻表を参照するCLI"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    schedule_parser = subparsers.add_parser("schedule", help="指定日の時刻表を表示")
    schedule_parser.add_argument("--date", required=True, help="YYYY-MM-DD")
    schedule_parser.add_argument(
        "--stop",
        required=True,
        choices=list(STOP_LABELS.keys()),
        help="minamiosawa_east / minamiosawa_west / hino",
    )

    next_parser = subparsers.add_parser("next", help="指定時刻時点の次のバスを表示")
    next_parser.add_argument("--datetime", required=True, help="YYYY-MM-DD HH:MM")
    next_parser.add_argument(
        "--stop",
        required=True,
        choices=list(STOP_LABELS.keys()),
        help="minamiosawa_east / minamiosawa_west / hino",
    )

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "schedule":
        target_date = date.fromisoformat(args.date)
        print_day_schedule(target_date, args.stop)
        return

    if args.command == "next":
        now = datetime.strptime(args.datetime, "%Y-%m-%d %H:%M")
        print_next_bus(now, args.stop)
        return

    raise ValueError("Unknown command")


if __name__ == "__main__":
    main()
