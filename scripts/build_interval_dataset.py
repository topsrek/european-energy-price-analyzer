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

from metadata_manager import artifact_dir, atomic_write_bytes, atomic_write_text, metadata_dir
from price_downloader import is_retryable_error, retry_delay_from_response
from smart_batch_downloader import (
    CorruptArtifactError,
    OptimizedEnergyPriceEncoder,
    OptimizedPriceDecoder,
    metadata_record_count,
    parse_rebuild_flag,
    series_equal,
    trim_to_utc_midnight_start,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PUBLIC_DIR = artifact_dir()
METADATA_DIR = metadata_dir()
BASE_URL = "https://api.energy-charts.info/price"
FIRST_INTERVAL_DAY = date(2025, 10, 1)
CHUNK_DAYS = 31
REQUEST_TIMEOUT_SECONDS = 45
REQUEST_RETRY_DELAYS_SECONDS = (5, 15, 30, 60)
# Hourly prices are stored as the rounded mean of the four quarter-hours, so the
# two artifacts can differ by at most half a cent where both cover an hour.
HOURLY_MATCH_TOLERANCE = 0.005

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
            # A header-less file is damage, not "no history". Returning [] here made
            # the caller rebuild from the fetch window and overwrite everything.
            raise CorruptArtifactError(f"File too small - missing header ({len(self.data)} bytes)")

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


def fetch_chunk_payload(
    session: requests.Session,
    country_code: str,
    chunk_start: date,
    chunk_end: date,
) -> dict:
    url = f"{BASE_URL}?bzn={country_code}&start={chunk_start.isoformat()}&end={chunk_end.isoformat()}"

    for attempt in range(1, len(REQUEST_RETRY_DELAYS_SECONDS) + 2):
        response = None
        try:
            response = session.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as exc:
            # Only 429, 5xx and connection problems are transient. A 4xx fails the
            # same way every time, so retrying it just burned the backoff budget.
            if not is_retryable_error(exc):
                raise RuntimeError(
                    f"Failed to download interval range {chunk_start} to {chunk_end}: {exc}"
                ) from exc
            if attempt > len(REQUEST_RETRY_DELAYS_SECONDS):
                raise RuntimeError(
                    f"Failed to download interval range {chunk_start} to {chunk_end} after {attempt} attempts"
                ) from exc

            # Honour Retry-After: the fixed first delay was shorter than the window
            # the limiter asks for, so that attempt was spent earning another 429.
            retry_delay = retry_delay_from_response(response, REQUEST_RETRY_DELAYS_SECONDS[attempt - 1])
            logger.warning(
                "Interval download failed for %s to %s on attempt %s: %s. Retrying in %ss.",
                chunk_start,
                chunk_end,
                attempt,
                exc,
                retry_delay,
            )
            time.sleep(retry_delay)


def fetch_interval_records(country_code: str, start_date: date, end_date: date) -> list[tuple[datetime, float]]:
    session = requests.Session()
    session.headers.update(
        {
            "accept": "application/json",
            "User-Agent": "European-Energy-Price-Analyzer/0.1",
        }
    )

    # Upstream days are local (CET/CEST), not UTC: start=2026-05-07 answers from
    # 2026-05-06T22:00Z. Clipping the response at UTC midnight therefore threw away
    # the records that bridge back to what is already stored, which left a hole the
    # positional artifact format cannot represent. Keep a day of slack on both ends
    # and let merge_records dedupe; the caller's window decides what is fetched.
    all_records: list[tuple[datetime, float]] = []
    utc_start = datetime.combine(start_date - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
    utc_end = datetime.combine(end_date + timedelta(days=2), datetime.min.time(), tzinfo=timezone.utc)

    for chunk_start, chunk_end in chunk_ranges(start_date, end_date):
        logger.info("Downloading interval range %s to %s", chunk_start, chunk_end)
        payload = fetch_chunk_payload(session, country_code, chunk_start, chunk_end)

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


def interval_metadata_path(country_code: str) -> Path:
    return METADATA_DIR / f"{country_code.lower()}_electricity_prices_15min_metadata.json"


def load_existing_records(path: Path) -> list[tuple[datetime, float]]:
    """Decode the stored artifact, raising CorruptArtifactError if it is unusable.

    A missing file is a legitimate fresh start; an existing file that is
    header-less or decodes to nothing is damage and must not be overwritten
    with just the fetch window.
    """
    if not path.exists():
        return []

    try:
        records = IntervalPriceDecoder(path.read_bytes()).decode_all()
    except CorruptArtifactError:
        raise
    except Exception as exc:
        raise CorruptArtifactError(f"Failed to decode {path.name}: {exc}") from exc

    if not records:
        raise CorruptArtifactError(f"{path.name} exists but decodes to no records")

    return records


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
    metadata_path = interval_metadata_path(country_code)
    atomic_write_text(metadata_path, json.dumps(metadata, indent=2))
    logger.info("Wrote interval metadata to %s", metadata_path)


def find_gaps(records: list[tuple[datetime, float]], step: timedelta) -> list[tuple[datetime, datetime]]:
    """Return adjacent pairs that are not exactly one step apart.

    The artifact stores prices positionally and the decoder rebuilds timestamps as
    start + index * step, so a hole does not read back as a hole -- it shifts every
    later record earlier. Callers must refuse to write a non-contiguous series.
    """
    return [
        (earlier, later)
        for (earlier, _), (later, _) in zip(records, records[1:])
        if later - earlier != step
    ]


def write_binary(binary_file: Path, records: list[tuple[datetime, float]]) -> bool:
    if not records:
        logger.warning("No interval records available; leaving artifact unchanged")
        return False

    records = trim_to_utc_midnight_start(records)

    gaps = find_gaps(records, timedelta(minutes=15))
    if gaps:
        for earlier, later in gaps[:10]:
            missing = int((later - earlier) / timedelta(minutes=15)) - 1
            logger.error("Interval gap: %s -> %s (%s slots missing)", earlier, later, missing)
        raise ValueError(
            f"Refusing to write {binary_file.name}: {len(gaps)} gap(s) in the 15-minute series. "
            "Writing it would shift every later timestamp earlier."
        )

    encoder = OptimizedEnergyPriceEncoder()
    encoded = encoder.encode_price_data(records)
    atomic_write_bytes(binary_file, encoded)
    logger.info("Wrote %s (%s bytes)", binary_file, len(encoded))
    return True


def hourly_interval_mismatches(
    hourly_records: list[tuple[datetime, float]],
    interval_records: list[tuple[datetime, float]],
    tolerance: float = HOURLY_MATCH_TOLERANCE,
) -> list[tuple[datetime, float, float]]:
    """Hours whose hourly price is not the mean of the stored quarter-hours.

    Returns (hour, hourly_price, quarter_mean) for every hour both artifacts cover
    completely. A mismatch means one artifact missed an upstream correction (or
    was encoded wrongly) and the views of the same hour disagree.
    """
    quarters = dict(interval_records)
    mismatches = []
    for hour, price in hourly_records:
        values = [quarters.get(hour + timedelta(minutes=minute)) for minute in (0, 15, 30, 45)]
        if any(value is None for value in values):
            continue
        mean = sum(values) / len(values)
        if abs(mean - price) > tolerance + 1e-9:
            mismatches.append((hour, price, mean))
    return mismatches


def check_hourly_consistency(country_code: str, interval_records: list[tuple[datetime, float]]) -> list:
    """Log a warning when the hourly artifact disagrees with the 15-minute one."""
    hourly_file = PUBLIC_DIR / f"{country_code.lower()}_electricity_prices.bin"
    if not hourly_file.exists() or not interval_records:
        return []
    try:
        hourly_records = OptimizedPriceDecoder(hourly_file.read_bytes()).decode_all()
    except Exception as exc:
        logger.warning("Cannot check %s against the 15-minute data: %s", hourly_file.name, exc)
        return []

    mismatches = hourly_interval_mismatches(hourly_records, interval_records)
    if mismatches:
        hour, price, mean = mismatches[0]
        logger.warning(
            "%s: %s hour(s) where the hourly price is not the mean of the 15-minute prices "
            "(first %s: hourly %.2f, quarter mean %.4f). Re-run smart_batch_downloader.py "
            "and build_interval_dataset.py over the affected days.",
            country_code,
            len(mismatches),
            hour.isoformat(),
            price,
            mean,
        )
    return mismatches


def main(argv: list[str] | None = None) -> int:
    args, rebuild = parse_rebuild_flag(sys.argv[1:] if argv is None else argv)
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

    if rebuild:
        logger.warning("--rebuild: ignoring the existing %s and rebuilding from the fetch window", binary_file.name)
        existing_records: list[tuple[datetime, float]] = []
        existing_count = 0
    else:
        try:
            existing_records = load_existing_records(binary_file)
        except CorruptArtifactError as exc:
            logger.error("Refusing to update %s: %s. Pass --rebuild to rebuild it from the fetch window.", binary_file.name, exc)
            return 2
        # The metadata count catches a truncated artifact that still decodes.
        existing_count = max(len(existing_records), metadata_record_count(interval_metadata_path(country_code)))

    new_records = fetch_interval_records(country_code, start_date, end_date)
    merged_records = merge_records(existing_records, new_records)

    if not merged_records:
        logger.warning("No merged interval records available")
        return 0

    # Align once, here, so the artifact and the metadata describe the same series.
    merged_records = trim_to_utc_midnight_start(merged_records)

    if series_equal(merged_records, existing_records):
        logger.info("No new interval data yet for %s; artifact unchanged", country_code)
        check_hourly_consistency(country_code, existing_records)
        return 0

    if len(merged_records) < existing_count:
        logger.error(
            "Refusing to write %s: merged series has %s records, fewer than the %s already stored. "
            "Pass --rebuild to allow shrinking it.",
            binary_file.name,
            len(merged_records),
            existing_count,
        )
        return 2

    # Binary first, then metadata: the worker's staleness check reads the metadata,
    # so it must never claim data the artifact does not hold.
    if write_binary(binary_file, merged_records):
        write_metadata(country_code, binary_file, merged_records)
    check_hourly_consistency(country_code, merged_records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
