#!/usr/bin/env python3
"""
Binary Price Data Reader

Python implementation to read and decode our custom binary format.
This allows us to check what data already exists before downloading.
"""

import struct
from datetime import datetime, date
from typing import List, Tuple, Set, Optional
from pathlib import Path

class BinaryPriceReader:
    """Reads and decodes custom binary price format."""
    
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
    
    def peek_encoding_mode(self) -> int:
        """Peek at encoding mode without advancing position."""
        saved_position = self.bit_position
        try:
            # Skip to mode bit (position 21)
            self.bit_position += 21
            mode = self.read_bits(1)
            self.bit_position = saved_position
            return mode
        except:
            self.bit_position = saved_position
            return 0  # Default to short form
    
    def has_next_record(self) -> bool:
        """Check if there are enough bits for another record."""
        return self.bit_position + 22 <= len(self.data) * 8
    
    def decode_record(self) -> Tuple[datetime, float]:
        """Decode a single price record."""
        # Read date/time components
        year = self.read_bits(7) + self.BASE_YEAR
        month = self.read_bits(4)
        day = self.read_bits(5)
        hour = self.read_bits(5)
        
        # Validate components
        if not (1 <= month <= 12):
            raise ValueError(f"Invalid month: {month}")
        if not (1 <= day <= 31):
            raise ValueError(f"Invalid day: {day}")
        if not (0 <= hour <= 23):
            # Skip invalid records but don't crash
            return None, None
        
        # Read encoding mode
        encoding_mode = self.read_bits(1)
        
        if encoding_mode == 0:
            # Mode 0: Short form - positive values only
            price_cents = self.read_bits(14)
            price = price_cents / 100.0
        else:
            # Mode 1: Long form - with sign bit
            price_cents = self.read_bits(19)
            is_negative = self.read_bits(1) == 1
            
            price = price_cents / 100.0
            if is_negative:
                price = -price
        
        # Create timestamp
        timestamp = datetime(year, month, day, hour, 0, 0)
        return timestamp, price
    
    def decode_all(self) -> List[Tuple[datetime, float]]:
        """Decode all price records from the data."""
        records = []
        
        try:
            while self.has_next_record():
                # Check if we have enough bits for the current record type
                mode = self.peek_encoding_mode()
                bits_needed = 36 if mode == 0 else 42
                
                if self.bit_position + bits_needed > len(self.data) * 8:
                    break
                
                record = self.decode_record()
                if record[0] is not None:  # Skip invalid records
                    records.append(record)
                
        except Exception as e:
            print(f"Warning: Decoding stopped due to error: {e}. Decoded {len(records)} records.")
        
        return records

def read_binary_file(filepath: Path) -> List[Tuple[datetime, float]]:
    """Read and decode a binary price file."""
    if not filepath.exists():
        return []
    
    try:
        with open(filepath, 'rb') as f:
            data = f.read()
        
        if not data:
            return []
        
        reader = BinaryPriceReader(data)
        return reader.decode_all()
        
    except Exception as e:
        print(f"Error reading binary file {filepath}: {e}")
        return []

def get_existing_timestamps(filepath: Path) -> Set[datetime]:
    """Get set of all timestamps that exist in a binary file."""
    records = read_binary_file(filepath)
    return {timestamp for timestamp, _ in records}

def get_missing_dates(existing_timestamps: Set[datetime], start_date: date, end_date: date) -> Set[date]:
    """Find which dates are completely missing from existing data."""
    from datetime import timedelta
    
    existing_dates = {ts.date() for ts in existing_timestamps}
    
    missing_dates = set()
    current_date = start_date
    
    while current_date <= end_date:
        if current_date not in existing_dates:
            missing_dates.add(current_date)
        current_date += timedelta(days=1)
    
    return missing_dates

def analyze_binary_file(filepath: Path) -> dict:
    """Analyze a binary file and return statistics."""
    records = read_binary_file(filepath)
    
    if not records:
        return {
            "total_records": 0,
            "date_range": "No data",
            "file_size": filepath.stat().st_size if filepath.exists() else 0
        }
    
    timestamps = [ts for ts, _ in records]
    prices = [price for _, price in records]
    
    min_date = min(timestamps).date()
    max_date = max(timestamps).date()
    
    return {
        "total_records": len(records),
        "date_range": f"{min_date} to {max_date}",
        "min_price": min(prices),
        "max_price": max(prices),
        "avg_price": sum(prices) / len(prices),
        "file_size": filepath.stat().st_size if filepath.exists() else 0,
        "days_covered": len({ts.date() for ts in timestamps}),
        "first_timestamp": min(timestamps),
        "last_timestamp": max(timestamps)
    }
