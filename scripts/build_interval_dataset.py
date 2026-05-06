#!/usr/bin/env python3
"""
Build or update the quarter-hour price artifact for the frontend.

The upstream AT endpoint exposes historical hourly prices and newer 15-minute
prices through the same API. This script maintains a separate artifact that
contains only the consecutive 15-minute portion.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests

sys.path.insert(0, str(Path(__file__).parent))

from smart_batch_downloader import OptimizedEnergyPriceEncoder

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "public"
METADATA_DIR = Path(__file__).parent / "data"
BASE_URL = "https://api.energy-charts.info/price"
FIRST_INTERVAL_DAY = date(2025, 10, 1)
CHUNK_DAYS = 31

COUNTRY_NAMES = {
    "AT": "Austria",
    "DE-LU": "Germany & Luxembourg",
    "FR": "France",
}


class IntervalPriceDecoder:
    BASE_YEAR = 2000

    def __init__(self, data: bytes, interval_minutes: int = 15):
        self.data = data
        self.interval_minutes = interval_minutes
        self.bit_position = 0

    def read_bits(self, num_bits: int) -> int:
        result = 0

        for _ in range(num_bits):
            byte_index = self.bit_position // 8
            bit_in_byte = 7 - (self.bit_position % 8)

            if byte_index >= len(self.data):
                raise ValueError(f"Attempting to read beyond buffer bounds at bit position {self.bit_position}")

            bit = (self.data[byte_index] >> bit_in_byte) & 1
            result = (result << 1) | bit
            self.bit_position += 1

        return result

    def read_date(self) -> date:
        year = self.read_bits(7) + self.BASE_YEAR
        month = self.read_bits(4)
        day = self.read_bits(5)
        return date(year, month, day)

    def read_price(self) -> float:
        mode = self.read_bits(1)
        if mode == 0:
            return self.read_bits(14) / 100.0

        price_cents = self.read_bits(19)
        is_negative = self.read_bits(1) == 1
        price = price_cents / 100.0
        return -price if is_negative else price

    def decode_all(self) -> list[tuple[datetime, float]]:
        if len(self.data) < 4:
            return []

        self.bit_position = 0
        start_date = self.read_date()
        end_date = self.read_date()
        current = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        records: list[tuple[datetime, float]] = []

        while True:
            remaining_bits = (len(self.data) * 8) - self.bit_position
            if remaining_bits < 15:
                break

            try:
                price = self.read_price()
            except ValueError:
                break

            if current.date() > end_date:
                break

            records.append((current, price))
            current += timedelta(minutes=self.interval_minutes)

        return records


def chunk_ranges(start_date: date, end_date: date, chunk_days: int = CHUNK_DAYS) -> Iterable[tuple[date, date]]:
    current = start_date
    while current <= end_date:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_date)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def fetch_interval_records(country_code: str, start_date: date, end_date: date) -> list[tuple[datetime, float]]:
    session = requests.Session()
    session.headers.update(
        {
            "accept": "application/json",
            "User-Agent": "European-Energy-Price-Analyzer/0.1",
        }
    )

    all_records: list[tuple[datetime, float]] = []
    utc_start = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    utc_end = datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    for chunk_start, chunk_end in chunk_ranges(start_date, end_date):
        url = (
            f"{BASE_URL}?bzn={country_code}&start={chunk_start.isoformat()}&end={chunk_end.isoformat()}"
        )
        logger.info("Downloading interval range %s to %s", chunk_start, chunk_end)
        response = session.get(url, timeout=60)
        response.raise_for_status()
        payload = response.json()

        timestamps = payload.get("unix_seconds", [])
        prices = payload.get("price", [])
        if len(timestamps) != len(prices):
            raise ValueError("Timestamp and price arrays have different lengths")

        chunk_records = [
            (datetime.fromtimestamp(timestamp, tz=timezone.utc), price)
            for timestamp, price in zip(timestamps, prices)
            if price is not None
        ]
        chunk_records = [
            (record_time, price)
            for record_time, price in chunk_records
            if utc_start <= record_time < utc_end
        ]

        if not chunk_records:
            logger.info("No records in %s to %s", chunk_start, chunk_end)
            continue

        has_subhourly = any(record_time.minute != 0 for record_time, _ in chunk_records)
        if not has_subhourly:
            logger.info("Skipping %s to %s because upstream data is still hourly", chunk_start, chunk_end)
            continue

        all_records.extend(chunk_records)
        time.sleep(1.0)

    return all_records


def load_existing_records(path: Path) -> list[tuple[datetime, float]]:
    if not path.exists():
        return []

    decoder = IntervalPriceDecoder(path.read_bytes())
    return decoder.decode_all()


def merge_records(existing_records: list[tuple[datetime, float]], new_records: list[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    merged: dict[datetime, float] = {timestamp: price for timestamp, price in existing_records}
    merged.update({timestamp: price for timestamp, price in new_records})
    return sorted(merged.items(), key=lambda item: item[0])


def write_metadata(country_code: str, binary_file: Path, records: list[tuple[datetime, float]]) -> None:
    covered_dates = sorted({timestamp.date().isoformat() for timestamp, _ in records})
    metadata = {
        "country": {
            "code": country_code,
            "name": COUNTRY_NAMES.get(country_code, country_code),
        },
        "data_coverage": {
            "total_records": len(records),
            "first_timestamp": records[0][0].isoformat() if records else None,
            "last_timestamp": records[-1][0].isoformat() if records else None,
            "covered_dates": covered_dates,
            "missing_dates": [],
        },
        "file_info": {
            "binary_file": binary_file.name,
            "file_size": binary_file.stat().st_size if binary_file.exists() else 0,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "version": "1.0",
            "resolution": "15min",
        },
        "data_source": {
            "api_url": BASE_URL,
            "update_frequency": "daily",
        },
    }

    METADATA_DIR.mkdir(parents=True, exist_ok=True)
    metadata_path = METADATA_DIR / f"{country_code.lower()}_electricity_prices_15min_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    logger.info("Wrote interval metadata to %s", metadata_path)


def write_binary(binary_file: Path, records: list[tuple[datetime, float]]) -> None:
    if not records:
        logger.warning("No interval records available; leaving artifact unchanged")
        return

    encoder = OptimizedEnergyPriceEncoder()
    encoded = encoder.encode_price_data(records)
    binary_file.write_bytes(encoded)
    logger.info("Wrote %s (%s bytes)", binary_file, len(encoded))


def main() -> int:
    args = sys.argv[1:]
    country_code = (args[0] if args else "AT").upper()

    if len(args) >= 3:
        requested_start = datetime.strptime(args[1], "%Y-%m-%d").date()
        requested_end = datetime.strptime(args[2], "%Y-%m-%d").date()
    else:
        requested_start = FIRST_INTERVAL_DAY
        requested_end = datetime.now(timezone.utc).date() + timedelta(days=1)

    start_date = max(FIRST_INTERVAL_DAY, requested_start)
    end_date = requested_end

    if end_date < start_date:
        logger.info("Requested interval range %s to %s has no quarter-hour window", requested_start, requested_end)
        return 0

    binary_file = PUBLIC_DIR / f"{country_code.lower()}_electricity_prices_15min.bin"
    existing_records = load_existing_records(binary_file)
    new_records = fetch_interval_records(country_code, start_date, end_date)
    merged_records = merge_records(existing_records, new_records)

    if not merged_records:
        logger.warning("No merged interval records available")
        return 0

    write_binary(binary_file, merged_records)
    write_metadata(country_code, binary_file, merged_records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
