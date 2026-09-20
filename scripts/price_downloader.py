#!/usr/bin/env python3
"""
EEPA Energy Price Downloader and Binary Encoder

Downloads daily energy prices from energy-charts.info API and encodes them
into a custom binary format for efficient storage and fast decoding.

Usage: python price_downloader.py [YYYY-MM-DD]
If no date provided, downloads today's data.
"""

import sys
import time
import struct
import requests
from datetime import datetime, date, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import List, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# The upstream limiter answers 429 with Retry-After (typically ~7s). Cap it so a
# hostile or malformed value cannot park a refresh for hours.
MAX_RETRY_AFTER_SECONDS = 300


def retry_delay_from_response(response, fallback_seconds):
    """Seconds to wait before retrying, honouring Retry-After when present.

    The API rate limits aggressively and says exactly how long to wait. Ignoring
    that meant either retrying too early (another 429) or backing off far longer
    than asked, which pushed refreshes towards the command timeout.
    """
    if response is None:
        return fallback_seconds

    raw = response.headers.get('Retry-After')
    if not raw:
        return fallback_seconds

    raw = raw.strip()
    try:
        seconds = float(raw)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(raw)
        except (TypeError, ValueError):
            return fallback_seconds

        if retry_at is None:
            return fallback_seconds
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()

    if seconds != seconds or seconds < 0:  # NaN or negative
        return fallback_seconds

    return min(seconds, MAX_RETRY_AFTER_SECONDS)

class EnergyPriceEncoder:
    """Encodes energy price data into custom binary format."""
    
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
    
    def encode_price_record(self, timestamp: int, price: float) -> None:
        """Encode a single price record."""
        # Parse timestamp
        dt = datetime.fromtimestamp(timestamp)
        
        # Encode date/time components
        year = dt.year - self.BASE_YEAR
        month = dt.month  
        day = dt.day
        hour = dt.hour
        
        # Validate ranges
        if not (0 <= year <= 127):
            raise ValueError(f"Year {dt.year} out of range (2000-2127)")
        if not (1 <= month <= 12):
            raise ValueError(f"Month {month} out of range")
        if not (1 <= day <= 31):
            raise ValueError(f"Day {day} out of range")
        if not (0 <= hour <= 23):
            raise ValueError(f"Hour {hour} out of range")
        
        # Write date/time bits
        self.write_bits(year, 7)
        self.write_bits(month, 4)
        self.write_bits(day, 5)
        self.write_bits(hour, 5)
        
        # Handle negative prices
        is_negative = price < 0
        price_abs = abs(price)
        
        # Choose encoding mode based on price range and sign
        if price_abs < 163.84 and not is_negative:  # Mode 0: short form (positive only)
            self.write_bits(0, 1)  # Mode 0: short form (bit 21)
            
            price_cents = int(round(price_abs * 100))
            if price_cents > self.MAX_CENTS_PRICE:
                price_cents = self.MAX_CENTS_PRICE
            self.write_bits(price_cents, 14)
            
        else:  # Mode 1: long form (for high prices or negative values)
            self.write_bits(1, 1)  # Mode 1: long form (bit 21)
            
            price_cents = int(round(price_abs * 100))  # Store in cents
            
            # Clamp to 19-bit range
            if price_cents > (1 << 19) - 1:
                price_cents = (1 << 19) - 1
                
            self.write_bits(price_cents, 19)
            self.write_bits(1 if is_negative else 0, 1)  # Sign bit for mode 1 (bit 41)
    
    def get_buffer(self) -> bytes:
        """Get the encoded binary data."""
        return bytes(self.buffer)


class EnergyPriceDownloader:
    """Downloads and processes energy price data from energy-charts.info."""
    
    BASE_URL = "https://api.energy-charts.info/price"
    INITIAL_RETRY_DELAY = 61  # seconds
    MAX_RETRIES = 5
    
    def __init__(self, country_code: str = "AT", data_dir: str = None):
        # data_dir is optional - only used if saving daily files
        self.country_code = country_code.upper()
        self.data_dir = Path(data_dir) if data_dir else None
        if self.data_dir:
            self.data_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            'accept': 'application/json',
            'User-Agent': 'European-Energy-Price-Analyzer/0.1'
        })
    
    def download_date_range_data(self, start_date: date, end_date: date) -> Optional[Tuple[List[int], List[float]]]:
        """Download price data for a date range with exponential retry."""
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
        url = f"{self.BASE_URL}?bzn={self.country_code}&start={start_str}&end={end_str}"
        
        retry_delay = self.INITIAL_RETRY_DELAY

        for attempt in range(self.MAX_RETRIES):
            response = None
            try:
                logger.info(f"Downloading data for {start_str} to {end_str} (attempt {attempt + 1}/{self.MAX_RETRIES})")

                response = self.session.get(url, timeout=30)
                response.raise_for_status()

                data = response.json()
                
                # Validate response structure
                if 'unix_seconds' not in data or 'price' not in data:
                    raise ValueError("Invalid response format - missing required fields")
                
                if data.get('deprecated', False):
                    logger.warning(f"API endpoint is deprecated for {start_str} to {end_str}")
                
                timestamps = data['unix_seconds']
                prices = data['price']
                
                if len(timestamps) != len(prices):
                    raise ValueError("Timestamp and price arrays have different lengths")
                
                logger.info(f"Successfully downloaded {len(timestamps)} price records for {start_str} to {end_str}")
                return timestamps, prices
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Request failed (attempt {attempt + 1}): {e}")
            except ValueError as e:
                logger.error(f"Data validation failed (attempt {attempt + 1}): {e}")
            except Exception as e:
                logger.error(f"Unexpected error (attempt {attempt + 1}): {e}")
            
            if attempt < self.MAX_RETRIES - 1:
                wait_seconds = retry_delay_from_response(response, retry_delay)
                logger.info(f"Retrying in {wait_seconds:.0f} seconds...")
                time.sleep(wait_seconds)
                retry_delay = min(retry_delay * 2, 1800)  # Cap at 30 minutes

        logger.error(f"Failed to download data for {start_str} to {end_str} after {self.MAX_RETRIES} attempts")
        return None

    def download_day_data(self, target_date: date) -> Optional[Tuple[List[int], List[float]]]:
        """Download price data for a specific date with exponential retry."""
        date_str = target_date.strftime("%Y-%m-%d")
        url = f"{self.BASE_URL}?bzn={self.country_code}&start={date_str}&end={date_str}"
        
        retry_delay = self.INITIAL_RETRY_DELAY
        
        for attempt in range(self.MAX_RETRIES):
            response = None
            try:
                logger.info(f"Downloading data for {date_str} (attempt {attempt + 1}/{self.MAX_RETRIES})")

                response = self.session.get(url, timeout=30)
                response.raise_for_status()

                data = response.json()
                
                # Validate response structure
                if 'unix_seconds' not in data or 'price' not in data:
                    raise ValueError("Invalid response format - missing required fields")
                
                if data.get('deprecated', False):
                    logger.warning(f"API endpoint is deprecated for {date_str}")
                
                timestamps = data['unix_seconds']
                prices = data['price']
                
                if len(timestamps) != len(prices):
                    raise ValueError("Timestamp and price arrays have different lengths")
                
                logger.info(f"Successfully downloaded {len(timestamps)} price records for {date_str}")
                return timestamps, prices
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Request failed (attempt {attempt + 1}): {e}")
            except ValueError as e:
                logger.error(f"Data validation failed (attempt {attempt + 1}): {e}")
            except Exception as e:
                logger.error(f"Unexpected error (attempt {attempt + 1}): {e}")
            
            if attempt < self.MAX_RETRIES - 1:
                wait_seconds = retry_delay_from_response(response, retry_delay)
                logger.info(f"Retrying in {wait_seconds:.0f} seconds...")
                time.sleep(wait_seconds)
                retry_delay = min(retry_delay * 2, 1800)  # Cap at 30 minutes

        logger.error(f"Failed to download data for {date_str} after {self.MAX_RETRIES} attempts")
        return None
    
    def process_and_save_day(self, target_date: date) -> bool:
        """Download, encode, and save price data for a specific date."""
        if not self.data_dir:
            logger.warning("No data directory specified - skipping file save")
            return False
            
        # Check if file already exists
        filename = f"energy_prices_{target_date.strftime('%Y%m%d')}.bin"
        filepath = self.data_dir / filename
        
        if filepath.exists():
            logger.info(f"Data file {filename} already exists, skipping download")
            return True
        
        # Download data
        result = self.download_day_data(target_date)
        if result is None:
            return False
        
        timestamps, prices = result
        
        # Encode to binary format
        encoder = EnergyPriceEncoder()
        
        for timestamp, price in zip(timestamps, prices):
            try:
                encoder.encode_price_record(timestamp, price)
            except ValueError as e:
                logger.error(f"Failed to encode record {timestamp}, {price}: {e}")
                return False
        
        # Save to file
        try:
            with open(filepath, 'wb') as f:
                f.write(encoder.get_buffer())
            
            logger.info(f"Saved {len(timestamps)} records to {filename} ({len(encoder.get_buffer())} bytes)")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save file {filename}: {e}")
            return False
    
    def close(self):
        """Clean up resources."""
        self.session.close()


def main():
    """Main entry point."""
    # Parse command line arguments
    if len(sys.argv) > 1:
        try:
            target_date = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
        except ValueError:
            logger.error("Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)
    else:
        target_date = date.today()
    
    logger.info(f"Starting price download for {target_date}")
    
    downloader = EnergyPriceDownloader()
    
    try:
        success = downloader.process_and_save_day(target_date)
        if success:
            logger.info("Download completed successfully")
        else:
            logger.error("Download failed")
            sys.exit(1)
    finally:
        downloader.close()


if __name__ == "__main__":
    main()
