# EEPA Energy Price Data System

## System Overview

Ultra-efficient country-based electricity price download and binary encoding system for European Energy Price Analyzer.

### Current State
- Austria is active.
- The committed hourly artifact contains 66,550 real hourly records through 2026-05-03.
- The browser loads country-specific files such as `public/at_electricity_prices.bin`.
- Missing country files produce a no-data state; the app does not generate mock prices.
- Country-ready architecture can expand to DE and other Energy Charts bidding zones.

## File Structure

### Frontend (User-Facing)
```
public/
└── at_electricity_prices.bin     # Austria hourly price data
```

### Backend (Download System)
```
scripts/
├── smart_batch_downloader.py     # Main intelligent downloader
├── price_downloader.py           # Core API client
├── binary_reader.py              # Legacy format reader
├── metadata_manager.py           # Metadata tracking
├── daily_update.py               # Daily automation
├── requirements.txt              # Python deps
└── README.md                     # Documentation
```

### Frontend Integration
```
src/utils/
├── optimized-binary-decoder.ts   # Decoder v2.0
└── binary-decoder.ts             # Legacy decoder v1.0

src/pages/
└── Index.tsx                     # Country route analyzer
```

## Binary Format v2.0

### Header (32 bits - stores date range once)
```
Bits 0-15:  Start Date (year/month/day)
Bits 16-31: End Date (year/month/day)
```

### Price Records (15-21 bits each)
```
Mode 0: 1 + 14 bits (positive prices < 163.84 EUR/MWh)
Mode 1: 1 + 19 + 1 bits (negative or high prices)
```

### Space Efficiency Comparison
```
JSON Format:      ~2,400 bytes
Binary v1.0:        324 bytes  (7.4x compression)
Binary v2.0:        143 bytes  (16.8x compression)
```

## Usage Examples

### Download Austria Data
```bash
cd scripts

# Download all missing data for Austria
python smart_batch_downloader.py

# Download specific date range 
python smart_batch_downloader.py 2025-09-01 2025-10-31

# Daily maintenance
python daily_update.py
```

### Future: Other Countries
```bash
# Add Germany support
python smart_batch_downloader.py DE 2025-05-01 2025-08-20

# Add Switzerland support  
python smart_batch_downloader.py CH 2025-05-01 2025-08-20
```

## Current Data Statistics

- **Source**: Energy Charts API (energy-charts.info)
- **License**: CC BY 4.0 from Bundesnetzagentur | SMARD.de
- **Coverage**: Austria hourly market data from 2018-09-30 through 2026-05-03
- **Records**: 66,550 hourly price points
- **File Size**: 133,446 bytes

## Production Notes

- No metadata files are served from the public directory.
- Individual daily files are consolidated into country artifacts.
- Smart deduplication handles overlapping downloads.
- The current web format stores hourly records. Sub-hourly data should use a separate lazy-loaded artifact.
- Retry logic must stay conservative because the upstream data source is shared public infrastructure.

## Performance Highlights

- **Download Speed**: ~1-2 seconds per day via API
- **Encoding Speed**: ~1000 records/second
- **Decoding Speed**: ~2000+ records/second (JavaScript)
- **Memory Usage**: <5MB for annual data
- **Network Transfer**: compact binary artifacts suitable for lazy country loading
