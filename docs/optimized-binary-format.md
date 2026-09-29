# Optimized Binary Energy Price Encoding Format v2.0

## Overview
Ultra-efficient binary encoding that stores date range once in header, followed by consecutive hourly prices.

## File Structure

### Header (32 bits)
```
Bits 0-6:   Start Year (7 bits, 2000-2127)
Bits 7-10:  Start Month (4 bits, 1-12)
Bits 11-15: Start Day (5 bits, 1-31)
Bits 16-22: End Year (7 bits, 2000-2127) 
Bits 23-26: End Month (4 bits, 1-12)
Bits 27-31: End Day (5 bits, 1-31)
```

### Price Records (15-21 bits each)
Consecutive hourly prices from start date 00:00 to end date 23:00:

**Mode 0 (Short Form) - 15 bits:**
```
Bit 0:     Mode (0 = short form)
Bits 1-14: Price in cents (14 bits, 0-163.83 EUR/MWh, positive only)
```

**Mode 1 (Long Form) - 21 bits:**
```
Bit 0:     Mode (1 = long form)  
Bits 1-19: Price in cents (19 bits, absolute value)
Bit 20:    Sign bit (0 = positive, 1 = negative)
```

## Key Advantages

1. **Space Efficiency**: 15-21 bits per record (was 36-42 bits) = ~50% additional compression
2. **No Redundant Timestamps**: Date calculated from position + start date
3. **Timezone Aware**: Proper handling of DST transitions and leap years
4. **Validation**: File length validates against expected hour count

## Timestamp Calculation

For record at position `i`:
```
timestamp = start_date + timedelta(hours=i)
```

With proper timezone handling for:
- **Daylight Saving Time** transitions (March/October in Europe)
- **Leap years** (February 29th)
- **Month boundaries** (28/29/30/31 days)

## Validation

File integrity is validated by:
```
expected_hours = total_hours_between(start_date, end_date + 1_day)
actual_records = (file_size_bits - 32) / average_bits_per_record
assert abs(expected_hours - actual_records) <= tolerance
```

## Example

For May 1-3, 2025 data (72 hours):
```
Header (32 bits):
Start: 2025-05-01 → 25,5,1 → 0011001 0101 00001
End:   2025-05-03 → 25,5,3 → 0011001 0101 00011

Price Records (72 consecutive hourly values):
Hour 0 (May 1, 00:00): 99.97 EUR → Mode 0 → 0 + 9997 cents → 0 10011100001101
Hour 1 (May 1, 01:00): 94.21 EUR → Mode 0 → 0 + 9421 cents → 0 10010011001101
...
Hour 71 (May 3, 23:00): 87.45 EUR → Mode 0 → 0 + 8745 cents → 0 10001000101001

Total: 32 + (72 × 15) = 1,112 bits = 139 bytes
vs Old Format: 72 × 36 = 2,592 bits = 324 bytes
Improvement: 57% smaller!
```

## Timezone Handling (CRITICAL)

**🚨 UTC ONLY STORAGE:**
- **API provides Unix timestamps in UTC** - we store exactly as received
- **NO local timezone conversion** in backend/storage
- **NO DST gap filling** - missing hours during spring forward are natural
- **NO placeholder data** - only store actual market data from API

**Frontend Conversion:**
- Storage: UTC timestamps from API
- Display: Convert UTC to local timezone in web app only
- Benefits: No data corruption, proper DST handling, exact API fidelity

**Why this matters:**
- Energy markets operate on real time - missing hours during DST transitions are correct
- Artificial placeholder data (0.0 EUR/MWh) would corrupt price analysis
- UTC storage ensures data integrity across all timezones
