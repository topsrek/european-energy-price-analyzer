# Binary Energy Price Encoding Format

## Overview
Custom binary encoding for efficient storage of hourly energy price data from Austrian energy markets.

## Bit Layout

Each price record is encoded in either 36 or 42 bits depending on price range:

```
Bits 0-6:   Year (7 bits, supports years 0-127, representing 2000-2127)
Bits 7-10:  Month (4 bits, 1-12)
Bits 11-15: Day (5 bits, 1-31) 
Bits 16-20: Hour (5 bits, 0-23)
Bit 21:     Encoding mode (0 = short form, 1 = long form)
Bits 22-35: Price value (14 bits for Mode 0)
Bits 22-40: Price value (19 bits for Mode 1)  
Bit 41:     Sign bit for Mode 1 only
```

## Encoding Modes

### Mode 0 (Short Form) - Bit 21 = 0
- **Price Range**: 0 to 163.83 EUR/MWh (positive values only)
- **Storage**: 14 bits (0-16383)
- **Unit**: Cents (price * 100)
- **Total Record Size**: 36 bits

### Mode 1 (Long Form) - Bit 21 = 1  
- **Price Range**: 164+ EUR/MWh or negative values
- **Storage**: 19 bits + 1 sign bit = 20 bits
- **Unit**: Cents (price * 100)
- **Total Record Size**: 42 bits

## Year Encoding
- Base year: 2000
- Encoded year = actual_year - 2000
- Range: 2000-2127 (covers foreseeable future)

## Data Storage
- Records are packed sequentially in binary files
- No padding between records
- Big-endian bit ordering
- Files named: `energy_prices_YYYYMMDD.bin`

## Example
For price 89.45 EUR/MWh on 2025-08-18 14:00:
```
Year: 2025 - 2000 = 25 → 0011001 (7 bits)
Month: 8 → 1000 (4 bits)
Day: 18 → 10010 (5 bits)
Hour: 14 → 01110 (5 bits)
Mode: 0 (short form, 89.45 < 164)
Price: 8945 cents → 10001011110001 (14 bits)

Total: 0011001 1000 10010 01110 0 10001011110001 (36 bits)
```
