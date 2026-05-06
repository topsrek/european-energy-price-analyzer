#!/usr/bin/env python3
"""
Smart Batch Energy Price Downloader

Intelligent downloader that:
1. Checks existing binary data 
2. Only downloads missing dates
3. Merges with existing data without duplicates
4. Updates the web-ready file

Usage: python smart_batch_downloader.py [start_date] [end_date]
If no dates provided, downloads from July 1, 2025 to today.
"""

import sys
import logging
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import List, Tuple, Set
import json

# Add current directory to path for imports  
sys.path.insert(0, str(Path(__file__).parent))

from price_downloader import EnergyPriceDownloader
from binary_reader import read_binary_file, get_existing_timestamps, get_missing_dates, analyze_binary_file
from metadata_manager import MetadataManager, CountryMetadata
from datetime import timezone

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
        price_abs = abs(price)
        
        # Choose encoding mode
        if price_abs < 163.84 and not is_negative:  # Mode 0: short form (positive only)
            self.write_bits(0, 1)  # Mode bit
            
            price_cents = int(round(price_abs * 100))
            if price_cents > self.MAX_CENTS_PRICE:
                price_cents = self.MAX_CENTS_PRICE
            self.write_bits(price_cents, 14)
            
        else:  # Mode 1: long form (for high prices or negative values)
            self.write_bits(1, 1)  # Mode bit
            
            price_cents = int(round(price_abs * 100))
            
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
    """Intelligent batch downloader that merges with existing data."""
    
    def __init__(self, country_code: str = "AT", public_dir: str = None):
        self.country_code = country_code.upper()
        self.public_dir = Path(public_dir) if public_dir else Path(__file__).resolve().parents[1] / "public"
        self.public_dir.mkdir(parents=True, exist_ok=True)
        
        # Country-specific files  
        self.web_file = self.public_dir / f"{country_code.lower()}_electricity_prices.bin"
        
        # Metadata stored in data directory (backend only, not public)
        self.metadata_dir = Path(__file__).parent / "data"
        self.metadata_dir.mkdir(exist_ok=True)
        self.metadata = CountryMetadata(country_code, str(self.metadata_dir))
        
        self.downloader = EnergyPriceDownloader(country_code=self.country_code)  # No longer needs data_dir since we don't save daily files
    
    def analyze_existing_data(self) -> dict:
        """Analyze what data already exists in the web file."""
        logger.info("Analyzing existing data...")
        
        if not self.web_file.exists():
            logger.info("No existing web file found - will create new one")
            return {
                "total_records": 0,
                "existing_timestamps": set(),
                "date_range": "No data"
            }
        
        # Read optimized format
        try:
            with open(self.web_file, 'rb') as f:
                data = f.read()
            
            decoder = OptimizedPriceDecoder(data)
            records = decoder.decode_all()
            
            if not records:
                return {
                    "total_records": 0,
                    "existing_timestamps": set(),
                    "date_range": "No data"
                }
            
            timestamps = [ts for ts, _ in records]
            prices = [price for _, price in records]
            existing_timestamps = set(timestamps)
            
            min_date = min(timestamps).date()
            max_date = max(timestamps).date()
            
            analysis = {
                "total_records": len(records),
                "date_range": f"{min_date} to {max_date}",
                "min_price": min(prices),
                "max_price": max(prices),
                "file_size": len(data),
                "days_covered": len({ts.date() for ts in timestamps}),
                "first_timestamp": min(timestamps),
                "last_timestamp": max(timestamps)
            }
            
            logger.info(f"Existing data analysis:")
            logger.info(f"  Records: {analysis['total_records']:,}")
            logger.info(f"  Date range: {analysis['date_range']}")
            logger.info(f"  Days covered: {analysis.get('days_covered', 0)}")
            logger.info(f"  File size: {analysis['file_size']:,} bytes")
            logger.info(f"  Price range: {analysis['min_price']:.2f} - {analysis['max_price']:.2f} EUR/MWh")
            
            return {
                "total_records": analysis['total_records'],
                "existing_timestamps": existing_timestamps,
                "date_range": analysis['date_range'],
                "analysis": analysis
            }
            
        except Exception as e:
            logger.error(f"Failed to analyze existing optimized data: {e}")
            return {
                "total_records": 0,
                "existing_timestamps": set(),
                "date_range": "No data"
            }
    
    def find_missing_dates(self, start_date: date, end_date: date, existing_timestamps: Set[datetime]) -> Set[date]:
        """Find which dates need to be downloaded."""
        metadata_missing_dates = self.metadata.find_missing_dates(start_date, end_date)
        existing_dates = {ts.date() for ts in existing_timestamps}

        binary_missing_dates = set()
        current_date = start_date
        while current_date <= end_date:
            if current_date not in existing_dates:
                binary_missing_dates.add(current_date)
            current_date += timedelta(days=1)

        missing_dates = metadata_missing_dates | binary_missing_dates
        
        logger.info(f"Date range analysis ({start_date} to {end_date}):")
        logger.info(f"  Total days requested: {(end_date - start_date).days + 1}")
        logger.info(f"  Days already in binary file: {len({ts.date() for ts in existing_timestamps if start_date <= ts.date() <= end_date})}")
        logger.info(f"  Days missing in metadata: {len(metadata_missing_dates)}")
        logger.info(f"  Days missing in binary file: {len(binary_missing_dates)}")
        logger.info(f"  Missing days to download: {len(missing_dates)}")
        
        if missing_dates:
            logger.info(f"  Missing dates: {sorted(list(missing_dates))[:5]}{'...' if len(missing_dates) > 5 else ''}")
        
        return missing_dates
    
    def download_missing_dates(self, missing_dates: Set[date]) -> List[Tuple[datetime, float]]:
        """Download data for missing dates using efficient date range downloads."""
        if not missing_dates:
            logger.info("No missing dates - all data is up to date!")
            return []
        
        sorted_dates = sorted(missing_dates)
        logger.info(f"Downloading {len(missing_dates)} missing days using optimized range downloads...")
        
        # Group consecutive dates into ranges for efficient downloading
        date_ranges = []
        current_start = sorted_dates[0]
        current_end = sorted_dates[0]
        
        for i in range(1, len(sorted_dates)):
            if sorted_dates[i] == current_end + timedelta(days=1):
                # Consecutive date, extend current range
                current_end = sorted_dates[i]
            else:
                # Gap found, finish current range and start new one
                date_ranges.append((current_start, current_end))
                current_start = sorted_dates[i]
                current_end = sorted_dates[i]
        
        # Add the final range
        date_ranges.append((current_start, current_end))
        
        logger.info(f"Optimized to {len(date_ranges)} date range(s) instead of {len(missing_dates)} individual downloads")
        
        new_records = []
        successful_ranges = 0
        failed_ranges = 0
        
        for i, (start_date, end_date) in enumerate(date_ranges, 1):
            days_in_range = (end_date - start_date).days + 1
            
            if days_in_range == 1:
                logger.info(f"Downloading range {i}/{len(date_ranges)}: {start_date} (1 day)")
            else:
                logger.info(f"Downloading range {i}/{len(date_ranges)}: {start_date} to {end_date} ({days_in_range} days)")
            
            try:
                # Use optimized range download
                result = self.downloader.download_date_range_data(start_date, end_date)
                if result:
                    timestamps, prices = result
                    successful_ranges += 1
                    range_records = 0
                    skipped_subhourly_records = 0
                    
                    # Convert to our record format (keep UTC from API)
                    for timestamp, price in zip(timestamps, prices):
                        # API provides Unix timestamps in UTC - keep as UTC
                        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)

                        # The optimized browser format stores consecutive hourly values.
                        # Some API responses now include sub-hourly settlement intervals.
                        if dt.minute != 0 or dt.second != 0 or dt.microsecond != 0:
                            skipped_subhourly_records += 1
                            continue
                        
                        # Validate price data
                        if price is None:
                            logger.warning(f"Null price at {dt} - skipping this record")
                            continue
                            
                        new_records.append((dt, price))
                        range_records += 1
                    
                    logger.info(f"✓ Downloaded {range_records} hourly records from range ({days_in_range} days)")
                    if skipped_subhourly_records:
                        logger.info(f"  Skipped {skipped_subhourly_records} sub-hourly records not supported by the current web format")
                else:
                    failed_ranges += 1
                    logger.error(f"✗ Failed to download range {start_date} to {end_date}")
                    
            except Exception as e:
                failed_ranges += 1
                logger.error(f"✗ Error downloading range {start_date} to {end_date}: {e}")
        
        logger.info(f"Range download summary:")
        logger.info(f"  Successful ranges: {successful_ranges}/{len(date_ranges)}")
        logger.info(f"  Failed ranges: {failed_ranges}/{len(date_ranges)}")
        logger.info(f"  Total records obtained: {len(new_records)}")
        
        return new_records
    
    def merge_and_save_data(self, existing_records: List[Tuple[datetime, float]], 
                           new_records: List[Tuple[datetime, float]]) -> str:
        """Merge existing and new data, remove duplicates, and save."""
        from datetime import timezone
        
        logger.info("Merging and saving data...")
        
        # All records should already be in UTC from the API
        # No timezone conversion needed - just combine and deduplicate
        all_records = existing_records + new_records
        
        # Remove duplicates by timestamp (keep first occurrence)
        seen_timestamps = set()
        unique_records = []
        duplicates_removed = 0
        
        for timestamp, price in all_records:
            if timestamp not in seen_timestamps:
                seen_timestamps.add(timestamp)
                unique_records.append((timestamp, price))
            else:
                duplicates_removed += 1
        
        # Sort by timestamp
        unique_records.sort(key=lambda x: x[0])
        
        logger.info(f"Data merge summary:")
        logger.info(f"  Existing records: {len(existing_records):,}")
        logger.info(f"  New records: {len(new_records):,}")
        logger.info(f"  Duplicates removed: {duplicates_removed}")
        logger.info(f"  Final unique records: {len(unique_records):,}")
        
        if unique_records:
            date_range = f"{unique_records[0][0].date()} to {unique_records[-1][0].date()}"
            logger.info(f"  Final date range: {date_range}")
        
        # Encode the merged data using optimized format
        encoder = OptimizedEnergyPriceEncoder()
        
        try:
            encoded_data = encoder.encode_price_data(unique_records)
        except Exception as e:
            logger.error(f"Failed to encode data with optimized format: {e}")
            raise
        
        # Save to web file
        try:
            with open(self.web_file, 'wb') as f:
                f.write(encoded_data)
            
            file_size = self.web_file.stat().st_size
            logger.info(f"✅ Updated web file: {self.web_file.name}")
            logger.info(f"  File size: {file_size:,} bytes")
            logger.info(f"  Average bytes per record: {file_size / len(unique_records):.1f}")
            
            # Update metadata (only stored in scripts directory for backend use)
            covered_dates = list({ts.date() for ts, _ in unique_records})
            analysis = {
                "total_records": len(unique_records),
                "first_timestamp": unique_records[0][0] if unique_records else None,
                "last_timestamp": unique_records[-1][0] if unique_records else None,
            }
            
            # Update backend metadata (stored in data directory, not public)
            self.metadata.update_from_binary_analysis(analysis, covered_dates)
            self.metadata.save()
            
            logger.info(f"Backend metadata saved to: {self.metadata_dir / f'{self.country_code.lower()}_electricity_prices_metadata.json'}")
            
            return str(self.web_file.absolute())
            
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
        logger.info("Your web app will now load the updated real data.")
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

def main():
    """Main entry point."""
    # Parse command line arguments
    country_code = "AT"  # Default to Austria
    
    if len(sys.argv) == 1:
        # Default: July 1, 2025 to today for Austria
        start_date = date(2025, 7, 1)
        end_date = date.today()
        logger.info(f"Using defaults: {country_code}, {start_date} to {end_date}")
    elif len(sys.argv) == 3:
        try:
            start_date = parse_date(sys.argv[1])
            end_date = parse_date(sys.argv[2])
        except ValueError as e:
            logger.error(f"Date parsing error: {e}")
            sys.exit(1)
    elif len(sys.argv) == 4:
        try:
            country_code = sys.argv[1].upper()
            start_date = parse_date(sys.argv[2])
            end_date = parse_date(sys.argv[3])
        except ValueError as e:
            logger.error(f"Date parsing error: {e}")
            sys.exit(1)
    else:
        print("Usage: python smart_batch_downloader.py [country_code] [start_date] [end_date]")
        print("Examples:")
        print("  python smart_batch_downloader.py")
        print("  python smart_batch_downloader.py 2025-07-01 2025-10-31")
        print("  python smart_batch_downloader.py AT 2025-07-01 2025-10-31")
        print("If no arguments provided, downloads Austria data from July 1, 2025 to today")
        sys.exit(1)
    
    if start_date > end_date:
        logger.error("Start date must be before or equal to end date")
        sys.exit(1)
    
    logger.info(f"Country: {country_code}, Date range: {start_date} to {end_date}")
    smart_downloader = SmartBatchDownloader(country_code)
    
    try:
        # Analyze what we already have
        before_analysis = smart_downloader.analyze_existing_data()
        
        # Read existing data using optimized decoder
        if smart_downloader.web_file.exists():
            try:
                with open(smart_downloader.web_file, 'rb') as f:
                    data = f.read()
                decoder = OptimizedPriceDecoder(data)
                existing_records = decoder.decode_all()
            except Exception as e:
                logger.warning(f"Failed to read existing optimized data: {e}")
                existing_records = []
        else:
            existing_records = []
        
        # Find what's missing
        missing_dates = smart_downloader.find_missing_dates(
            start_date, end_date, before_analysis['existing_timestamps']
        )
        
        # Download missing data
        new_records = smart_downloader.download_missing_dates(missing_dates)
        
        # Merge and save
        if new_records or not existing_records:  # Update if we have new data or no existing file
            smart_downloader.merge_and_save_data(existing_records, new_records)
            after_analysis = smart_downloader.analyze_existing_data()
            smart_downloader.create_status_report(before_analysis, after_analysis)
        else:
            logger.info("\n✅ All data is already up to date - no changes needed!")
            
    except KeyboardInterrupt:
        logger.info("\nSmart download interrupted by user")
    except Exception as e:
        logger.error(f"Smart batch download failed: {e}")
        sys.exit(1)
    finally:
        smart_downloader.close()

if __name__ == "__main__":
    main()
