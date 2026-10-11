#!/usr/bin/env python3
"""
Smart Batch Energy Price Downloader

Maintains the hourly price artifact:
1. Reads the existing binary data (refusing to continue if it is damaged)
2. Re-downloads the whole requested window, so partial days get completed and
   upstream corrections land
3. Aggregates quarter-hour prices to hourly means
4. Merges with the existing data (new values win) and writes atomically

Usage: python smart_batch_downloader.py [country_code] [start_date] [end_date] [--rebuild]
If no dates provided, downloads Austria from July 1, 2025 to today.

--rebuild ignores the existing artifact and writes only the fetched window, even
if that leaves fewer records than before. Without it the script refuses to touch
an artifact it cannot decode and never shrinks one.
"""

import sys
import logging
import time
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json

# Add current directory to path for imports  
sys.path.insert(0, str(Path(__file__).parent))

from price_downloader import EnergyPriceDownloader
from metadata_manager import CountryMetadata, artifact_dir, atomic_write_bytes, metadata_dir as default_metadata_dir

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OptimizedEnergyPriceEncoder:
    """Optimized encoder with date range header and consecutive prices."""
    
    BASE_YEAR = 2000
    MAX_CENTS_PRICE = 16383  # 163.83 EUR (14 bits max)
    
    def __init__(self):
        self.buffer = bytearray()
        self.bit_position = 0
    
    def write_bits(self, value: int, num_bits: int) -> None:
        """Write bits to the buffer."""
        for i in range(num_bits - 1, -1, -1):
            bit = (value >> i) & 1
            
            # Add a new byte if needed
            if self.bit_position % 8 == 0:
                self.buffer.append(0)
            
            byte_index = len(self.buffer) - 1
            bit_in_byte = 7 - (self.bit_position % 8)
            
            if bit:
                self.buffer[byte_index] |= (1 << bit_in_byte)
            
            self.bit_position += 1
    
    def write_date(self, target_date: date) -> None:
        """Write a date (16 bits: year + month + day)."""
        year = target_date.year - self.BASE_YEAR
        month = target_date.month
        day = target_date.day
        
        # Validate ranges
        if not (0 <= year <= 127):
            raise ValueError(f"Year {target_date.year} out of range (2000-2127)")
        if not (1 <= month <= 12):
            raise ValueError(f"Month {month} out of range")
        if not (1 <= day <= 31):
            raise ValueError(f"Day {day} out of range")
        
        self.write_bits(year, 7)
        self.write_bits(month, 4)
        self.write_bits(day, 5)
    
    def write_price_record(self, price: float) -> None:
        """Write a single price record (mode + price + optional sign)."""
        is_negative = price < 0
        # Round first and pick the mode from the cents value. Choosing it from the
        # raw price sent 163.835-163.839 to the short form, where it rounds to
        # 16384 cents and had to be clamped to 163.83.
        price_cents = int(round(abs(price) * 100))

        # Choose encoding mode
        if not is_negative and price_cents <= self.MAX_CENTS_PRICE:  # Mode 0: short form (positive only)
            self.write_bits(0, 1)  # Mode bit
            self.write_bits(price_cents, 14)

        else:  # Mode 1: long form (for high prices or negative values)
            self.write_bits(1, 1)  # Mode bit

            # Clamp to 19-bit range
            if price_cents > (1 << 19) - 1:
                price_cents = (1 << 19) - 1

            self.write_bits(price_cents, 19)
            self.write_bits(1 if is_negative else 0, 1)  # Sign bit

    def encode_price_data(self, records: List[Tuple[datetime, float]]) -> bytes:
        """Encode a list of (timestamp, price) records using the optimized format."""
        if not records:
            raise ValueError("No records to encode")
        
        # Sort records by timestamp
        sorted_records = sorted(records, key=lambda x: x[0])
        
        # Determine date range
        start_date = sorted_records[0][0].date()
        end_date = sorted_records[-1][0].date()
        
        logger.info(f"Encoding {len(sorted_records)} records from {start_date} to {end_date}")
        
        # Store records as-is from API (UTC) - NO timezone conversion or "expected" generation
        logger.info(f"Encoding {len(sorted_records)} ACTUAL records (no placeholders)")
        
        # Write header (32 bits) 
        self.write_date(start_date)
        self.write_date(end_date)
        
        # Write actual price records in chronological order (as provided by API)
        for timestamp, price in sorted_records:
            # Validate price data
            if price is None:
                logger.error(f"Null price at {timestamp} - skipping record")
                continue
                
            self.write_price_record(price)
        
        actual_records = len(sorted_records)
        logger.info(f"Encoded {actual_records} actual records (NO placeholders)")
        logger.info(f"Total bits: {self.bit_position}, bytes: {len(self.buffer)}")
        logger.info(f"Avg bits per record: {(self.bit_position - 32) / actual_records:.1f}")
        
        return bytes(self.buffer)

def trim_to_utc_midnight_start(records):
    """Drop leading records until the series begins exactly at UTC midnight.

    The header stores only a date, and the decoder rebuilds timestamps starting at
    that date's UTC midnight. A series that starts mid-day therefore reads back
    shifted by the offset, so the invariant has to hold before encoding. Upstream
    serves local days, so a fetch can legitimately begin at 22:00Z the day before.
    """
    for index, (timestamp, _) in enumerate(records):
        if (timestamp.hour, timestamp.minute, timestamp.second, timestamp.microsecond) == (0, 0, 0, 0):
            if index:
                logger.warning(
                    f"Dropping {index} record(s) before the first UTC midnight "
                    f"({records[0][0]} -> {timestamp}) to keep the artifact aligned"
                )
            return records[index:]

    raise ValueError("No record starts at UTC midnight; refusing to write a misaligned artifact")


class CorruptArtifactError(Exception):
    """An existing artifact cannot be decoded, so it must not be overwritten."""


REBUILD_FLAG = "--rebuild"

# Day-ahead markets switched to a 15-minute MTU for delivery on 2025-10-01
# (00:00 CEST). Before that upstream serves one value per hour.
MTU_SWITCH_UTC = datetime(2025, 9, 30, 22, 0, tzinfo=timezone.utc)
QUARTER_MINUTES = (0, 15, 30, 45)
FETCH_CHUNK_DAYS = 31


def parse_rebuild_flag(argv: List[str]) -> Tuple[List[str], bool]:
    """Split --rebuild out of the positional arguments."""
    rebuild = REBUILD_FLAG in argv
    return [arg for arg in argv if arg != REBUILD_FLAG], rebuild


def metadata_record_count(metadata_path: Path) -> int:
    """total_records from a metadata file, or 0 if it is missing or unreadable."""
    try:
        coverage = json.loads(Path(metadata_path).read_text(encoding="utf-8")).get("data_coverage", {})
        return int(coverage.get("total_records") or 0)
    except (OSError, ValueError, TypeError, AttributeError):
        return 0


def aggregate_to_hourly(records: List[Tuple[datetime, float]]) -> Tuple[List[Tuple[datetime, float]], List[datetime]]:
    """Turn upstream records into one price per UTC hour.

    Since the 15-minute MTU switch upstream serves four quarter-hours per hour.
    Keeping only the :00 record made the "hourly" price the first quarter-hour,
    not the hourly average. An hour is written as the mean of its four quarters;
    an hour with fewer quarters is reported as incomplete and left out, so it is
    re-fetched later instead of being written with a wrong value.

    A lone :00 record is a genuine hourly price before the switch, and after it
    only if the response contains no sub-hourly data at all (a zone still served
    hourly).

    Returns (hourly_records, incomplete_hours).
    """
    buckets: Dict[datetime, Dict[int, float]] = {}
    for timestamp, price in records:
        if price is None:
            continue
        if timestamp.second or timestamp.microsecond or timestamp.minute not in QUARTER_MINUTES:
            logger.warning(f"Ignoring record at unexpected offset {timestamp}")
            continue
        hour = timestamp.replace(minute=0)
        buckets.setdefault(hour, {})[timestamp.minute] = price

    has_subhourly = any(set(quarters) != {0} for quarters in buckets.values())

    hourly: List[Tuple[datetime, float]] = []
    incomplete: List[datetime] = []
    for hour in sorted(buckets):
        quarters = buckets[hour]
        if len(quarters) == len(QUARTER_MINUTES):
            hourly.append((hour, sum(quarters[minute] for minute in QUARTER_MINUTES) / len(QUARTER_MINUTES)))
        elif set(quarters) == {0} and (hour < MTU_SWITCH_UTC or not has_subhourly):
            hourly.append((hour, quarters[0]))
        else:
            incomplete.append(hour)

    return hourly, incomplete


def merge_records(existing_records: List[Tuple[datetime, float]],
                  new_records: List[Tuple[datetime, float]]) -> List[Tuple[datetime, float]]:
    """Union by timestamp where freshly fetched values win (upstream corrections)."""
    merged: Dict[datetime, float] = {timestamp: price for timestamp, price in existing_records}
    merged.update({timestamp: price for timestamp, price in new_records})
    return sorted(merged.items(), key=lambda item: item[0])


def series_equal(left: List[Tuple[datetime, float]], right: List[Tuple[datetime, float]]) -> bool:
    """Whether two series would encode identically (prices are stored in cents)."""
    return len(left) == len(right) and all(
        left_ts == right_ts and round(left_price * 100) == round(right_price * 100)
        for (left_ts, left_price), (right_ts, right_price) in zip(left, right)
    )


def load_existing_records(path: Path) -> List[Tuple[datetime, float]]:
    """Decode the stored hourly artifact, raising CorruptArtifactError if unusable.

    A missing file is a fresh start. An existing file that fails to decode or
    decodes to nothing used to be treated as "no history": the script then wrote
    only the fetch window over it and wiped years of data while exiting 0.
    """
    if not path.exists():
        return []

    try:
        records = OptimizedPriceDecoder(path.read_bytes()).decode_all()
    except Exception as exc:
        raise CorruptArtifactError(f"Failed to decode {path.name}: {exc}") from exc

    if not records:
        raise CorruptArtifactError(f"{path.name} exists but decodes to no records")

    return records


class OptimizedPriceDecoder:
    """Decoder for the optimized format."""
    
    BASE_YEAR = 2000
    
    def __init__(self, data: bytes):
        self.data = data
        self.bit_position = 0
    
    def read_bits(self, num_bits: int) -> int:
        """Read specified number of bits from the data."""
        result = 0
        
        for i in range(num_bits):
            byte_index = self.bit_position // 8
            bit_in_byte = 7 - (self.bit_position % 8)
            
            if byte_index >= len(self.data):
                raise ValueError(f"Attempting to read beyond buffer bounds at bit position {self.bit_position}")
            
            bit = (self.data[byte_index] >> bit_in_byte) & 1
            result = (result << 1) | bit
            self.bit_position += 1
        
        return result
    
    def read_date(self) -> date:
        """Read a date from the buffer (16 bits)."""
        year = self.read_bits(7) + self.BASE_YEAR
        month = self.read_bits(4)
        day = self.read_bits(5)
        
        return date(year, month, day)
    
    def read_price_record(self) -> float:
        """Read a single price record."""
        mode = self.read_bits(1)
        
        if mode == 0:
            # Mode 0: Short form - positive values only (14 bits)
            price_cents = self.read_bits(14)
            return price_cents / 100.0
        else:
            # Mode 1: Long form - with sign bit (19 + 1 bits)
            price_cents = self.read_bits(19)
            is_negative = self.read_bits(1) == 1
            
            price = price_cents / 100.0
            return -price if is_negative else price
    
    def decode_all(self) -> List[Tuple[datetime, float]]:
        """Decode all price records from the optimized format."""
        self.bit_position = 0
        
        if len(self.data) < 4:
            raise ValueError("File too small - missing header (need at least 32 bits)")

        # Read header (32 bits)
        start_date = self.read_date()
        end_date = self.read_date()
        
        logger.info(f"Decoding data from {start_date} to {end_date}")
        
        # Decode actual records (no fixed expectations due to DST)
        records = []
        record_count = 0
        
        # Start from midnight of start date (UTC)
        current_hour = 0
        current_date = start_date
        
        while True:
            try:
                # Check if we have enough bits remaining
                remaining_bits = (len(self.data) * 8) - self.bit_position
                if remaining_bits < 15:  # Minimum record size
                    break
                
                # Try to read next price record
                price = self.read_price_record()
                
                # Calculate timestamp: start_date + consecutive hours in UTC
                timestamp = datetime.combine(current_date, datetime.min.time()).replace(tzinfo=timezone.utc)
                timestamp += timedelta(hours=current_hour)
                
                records.append((timestamp, price))
                record_count += 1
                
                # Advance to next hour
                current_hour += 1
                
                # Check if we've gone past the end date
                if timestamp.date() > end_date:
                    break
                
            except Exception as e:
                logger.info(f"Decode completed at record {record_count}: {e}")
                break
        
        logger.info(f"Successfully decoded {len(records)} actual records (UTC timestamps)")
        
        return records

class SmartBatchDownloader:
    """Batch downloader that merges fresh data into the existing artifact."""
    
    def __init__(self, country_code: str = "AT", public_dir: str = None, metadata_dir: str = None):
        self.country_code = country_code.upper()
        self.public_dir = Path(public_dir) if public_dir else artifact_dir()
        self.public_dir.mkdir(parents=True, exist_ok=True)
        
        # Country-specific files  
        self.web_file = self.public_dir / f"{country_code.lower()}_electricity_prices.bin"
        
        # Metadata stored in data directory (backend only, not public)
        self.metadata_dir = Path(metadata_dir) if metadata_dir else default_metadata_dir()
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self.metadata = CountryMetadata(country_code, str(self.metadata_dir), binary_file=self.web_file)
        
        self.downloader = EnergyPriceDownloader(country_code=self.country_code)
    
    def analyze_records(self, records: List[Tuple[datetime, float]]) -> dict:
        """Summarise a decoded series for the status report."""
        if not records:
            return {"total_records": 0, "date_range": "No data"}

        timestamps = [ts for ts, _ in records]
        prices = [price for _, price in records]
        analysis = {
            "total_records": len(records),
            "date_range": f"{timestamps[0].date()} to {timestamps[-1].date()}",
            "min_price": min(prices),
            "max_price": max(prices),
            "file_size": self.web_file.stat().st_size if self.web_file.exists() else 0,
            "days_covered": len({ts.date() for ts in timestamps}),
        }

        logger.info("Existing data analysis:")
        logger.info(f"  Records: {analysis['total_records']:,}")
        logger.info(f"  Date range: {analysis['date_range']}")
        logger.info(f"  Days covered: {analysis['days_covered']}")
        logger.info(f"  File size: {analysis['file_size']:,} bytes")
        logger.info(f"  Price range: {analysis['min_price']:.2f} - {analysis['max_price']:.2f} EUR/MWh")

        return {
            "total_records": analysis["total_records"],
            "date_range": analysis["date_range"],
            "analysis": analysis,
        }

    def download_window(self, start_date: date, end_date: date) -> Optional[List[Tuple[datetime, float]]]:
        """Download the whole window and return hourly records, or None on failure.

        Every day in the window is fetched, including days already stored. The
        last stored day is usually partial and upstream occasionally corrects
        published prices; skipping "covered" days meant neither ever landed.
        """
        raw: Dict[datetime, float] = {}
        chunks = []
        current = start_date
        while current <= end_date:
            chunk_end = min(current + timedelta(days=FETCH_CHUNK_DAYS - 1), end_date)
            chunks.append((current, chunk_end))
            current = chunk_end + timedelta(days=1)

        for index, (chunk_start, chunk_end) in enumerate(chunks, 1):
            logger.info(f"Downloading range {index}/{len(chunks)}: {chunk_start} to {chunk_end}")
            result = self.downloader.download_date_range_data(chunk_start, chunk_end)
            if result is None:
                logger.error(f"✗ Failed to download range {chunk_start} to {chunk_end}")
                return None

            timestamps, prices = result
            for timestamp, price in zip(timestamps, prices):
                if price is None:
                    continue
                # API provides Unix timestamps in UTC - keep as UTC
                raw[datetime.fromtimestamp(timestamp, tz=timezone.utc)] = price

            # Pace requests like the interval builder does, so a multi-country run
            # does not burst straight into the upstream rate limit.
            if index < len(chunks):
                time.sleep(1.0)

        hourly, incomplete = aggregate_to_hourly(sorted(raw.items()))
        if incomplete:
            logger.warning(
                f"Skipping {len(incomplete)} hour(s) without all four quarter-hours "
                f"(first {incomplete[0]}, last {incomplete[-1]}); they will be re-fetched later"
            )
        logger.info(f"Obtained {len(hourly)} hourly records from {len(raw)} upstream records")
        return hourly
    
    def merge_and_save_data(self, existing_records: List[Tuple[datetime, float]], 
                           new_records: List[Tuple[datetime, float]],
                           existing_count: Optional[int] = None) -> List[Tuple[datetime, float]]:
        """Merge new data over existing data and save it. Returns the saved series."""
        logger.info("Merging and saving data...")

        unique_records = merge_records(existing_records, new_records)
        
        logger.info(f"Data merge summary:")
        logger.info(f"  Existing records: {len(existing_records):,}")
        logger.info(f"  New records: {len(new_records):,}")
        logger.info(f"  Final unique records: {len(unique_records):,}")
        
        if unique_records:
            date_range = f"{unique_records[0][0].date()} to {unique_records[-1][0].date()}"
            logger.info(f"  Final date range: {date_range}")
        
        unique_records = trim_to_utc_midnight_start(unique_records)

        if existing_count is None:
            existing_count = len(existing_records)
        if len(unique_records) < existing_count:
            raise ValueError(
                f"Refusing to write {self.web_file.name}: merged series has {len(unique_records)} records, "
                f"fewer than the {existing_count} already stored. Pass {REBUILD_FLAG} to allow shrinking it."
            )

        # The decoder rebuilds timestamps as start_date + index hours, so a hole in
        # the series does not read back as a hole - it shifts every later record
        # earlier. Refuse to write rather than ship silently misaligned prices.
        gaps = [
            (earlier, later)
            for (earlier, _), (later, _) in zip(unique_records, unique_records[1:])
            if later - earlier != timedelta(hours=1)
        ]
        if gaps:
            for earlier, later in gaps[:10]:
                missing = int((later - earlier) / timedelta(hours=1)) - 1
                logger.error(f"Hourly gap: {earlier} -> {later} ({missing} hours missing)")
            raise ValueError(
                f"Refusing to write {self.web_file.name}: {len(gaps)} gap(s) in the hourly series. "
                "Writing it would shift every later timestamp earlier."
            )

        # Encode the merged data using optimized format
        encoder = OptimizedEnergyPriceEncoder()

        try:
            encoded_data = encoder.encode_price_data(unique_records)
        except Exception as e:
            logger.error(f"Failed to encode data with optimized format: {e}")
            raise
        
        # Binary first (atomically), then metadata: the worker's staleness check
        # reads the metadata, so it must never claim data the artifact lacks.
        try:
            atomic_write_bytes(self.web_file, encoded_data)
            
            file_size = self.web_file.stat().st_size
            logger.info(f"✅ Updated web file: {self.web_file.name}")
            logger.info(f"  File size: {file_size:,} bytes")
            logger.info(f"  Average bytes per record: {file_size / len(unique_records):.1f}")
            
            covered_dates = list({ts.date() for ts, _ in unique_records})
            analysis = {
                "total_records": len(unique_records),
                "first_timestamp": unique_records[0][0],
                "last_timestamp": unique_records[-1][0],
            }
            
            # Update backend metadata (stored in data directory, not public)
            self.metadata.update_from_binary_analysis(analysis, covered_dates)
            self.metadata.save()
            
            logger.info(f"Backend metadata saved to: {self.metadata.metadata_file}")
            
            return unique_records
            
        except Exception as e:
            logger.error(f"Failed to save merged data: {e}")
            raise
    
    def create_status_report(self, before_analysis: dict, after_analysis: dict) -> None:
        """Create a status report showing what changed."""
        logger.info("\n" + "=" * 60)
        logger.info("SMART BATCH DOWNLOAD REPORT")
        logger.info("=" * 60)
        
        logger.info(f"Before: {before_analysis.get('total_records', 0):,} records")
        logger.info(f"After:  {after_analysis.get('total_records', 0):,} records")
        logger.info(f"Added:  {after_analysis.get('total_records', 0) - before_analysis.get('total_records', 0):,} records")
        
        logger.info(f"\nDate coverage:")
        logger.info(f"Before: {before_analysis.get('date_range', 'No data')}")
        logger.info(f"After:  {after_analysis.get('date_range', 'No data')}")
        
        logger.info(f"\nFile size:")
        before_size = before_analysis.get('analysis', {}).get('file_size', 0)
        after_size = after_analysis.get('analysis', {}).get('file_size', 0)
        logger.info(f"Before: {before_size:,} bytes")
        logger.info(f"After:  {after_size:,} bytes")
        logger.info(f"Growth: {after_size - before_size:,} bytes")
        
        logger.info("\n✅ Smart batch download completed successfully!")
        logger.info("=" * 60)
    
    def close(self):
        """Clean up resources."""
        self.downloader.close()

def parse_date(date_str: str) -> date:
    """Parse date string in YYYY-MM-DD format."""
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD")

USAGE = """Usage: python smart_batch_downloader.py [country_code] [start_date] [end_date] [--rebuild]
Examples:
  python smart_batch_downloader.py
  python smart_batch_downloader.py 2025-07-01 2025-10-31
  python smart_batch_downloader.py AT 2025-07-01 2025-10-31
  python smart_batch_downloader.py AT 2018-09-30 2026-05-07 --rebuild
If no arguments provided, downloads Austria data from July 1, 2025 to today"""


def main(argv: Optional[List[str]] = None) -> int:
    """Main entry point. Returns the process exit code."""
    args, rebuild = parse_rebuild_flag(sys.argv[1:] if argv is None else argv)
    country_code = "AT"  # Default to Austria
    
    try:
        if len(args) == 0:
            start_date = date(2025, 7, 1)
            end_date = date.today()
            logger.info(f"Using defaults: {country_code}, {start_date} to {end_date}")
        elif len(args) == 2:
            start_date = parse_date(args[0])
            end_date = parse_date(args[1])
        elif len(args) == 3:
            country_code = args[0].upper()
            start_date = parse_date(args[1])
            end_date = parse_date(args[2])
        else:
            print(USAGE)
            return 1
    except ValueError as e:
        logger.error(f"Date parsing error: {e}")
        return 1
    
    if start_date > end_date:
        logger.error("Start date must be before or equal to end date")
        return 1
    
    logger.info(f"Country: {country_code}, Date range: {start_date} to {end_date}")
    smart_downloader = SmartBatchDownloader(country_code)
    
    try:
        if rebuild:
            logger.warning(
                f"{REBUILD_FLAG}: ignoring the existing {smart_downloader.web_file.name} "
                "and rebuilding it from the fetch window"
            )
            existing_records = []
            existing_count = 0
        else:
            try:
                existing_records = load_existing_records(smart_downloader.web_file)
            except CorruptArtifactError as e:
                logger.error(
                    f"Refusing to update {smart_downloader.web_file.name}: {e}. "
                    f"Pass {REBUILD_FLAG} to rebuild it from the fetch window."
                )
                return 2
            # The metadata count catches a truncated artifact that still decodes.
            existing_count = max(len(existing_records), metadata_record_count(smart_downloader.metadata.metadata_file))

        before_analysis = smart_downloader.analyze_records(existing_records)

        new_records = smart_downloader.download_window(start_date, end_date)
        if new_records is None:
            # Upstream failed (rate limiting, outage). Exit non-zero so the caller
            # retries instead of recording a successful refresh that fetched nothing.
            logger.error(f"Failed to download {start_date} to {end_date} for {country_code}")
            return 1

        # Nothing published yet (day-ahead not out) or nothing that changes the
        # artifact. Same as the interval builder: exit 0 and let the worker's
        # staleness check report the country as pending.
        if not new_records or series_equal(merge_records(existing_records, new_records), existing_records):
            logger.info(f"No new data yet for {country_code}; artifact unchanged")
            return 0

        saved_records = smart_downloader.merge_and_save_data(existing_records, new_records, existing_count)
        after_analysis = smart_downloader.analyze_records(saved_records)
        smart_downloader.create_status_report(before_analysis, after_analysis)
        return 0

    except KeyboardInterrupt:
        logger.info("\nSmart download interrupted by user")
        return 130
    except Exception as e:
        logger.error(f"Smart batch download failed: {e}")
        return 1
    finally:
        smart_downloader.close()

if __name__ == "__main__":
    sys.exit(main())
