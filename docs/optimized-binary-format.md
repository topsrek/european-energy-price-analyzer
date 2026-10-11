# Optimized Binary Price Format

Compact encoding used for every price artifact (`public/{country}_electricity_prices.bin`
and `public/{country}_electricity_prices_15min.bin`). The date range is stored once in a
header, followed by consecutive prices; timestamps are implied by position.

Writer: `OptimizedEnergyPriceEncoder` in `scripts/smart_batch_downloader.py` (used by both
pipeline scripts). Readers: `OptimizedPriceDecoder` / `IntervalPriceDecoder` in the Python
scripts and `OptimizedBinaryPriceDecoder` in `src/utils/optimized-binary-decoder.ts`.

Bits are packed MSB-first with no padding between fields or records. The last byte is
zero-padded; since a record is at least 15 bits, fewer than 15 remaining bits mark the end.

## Header (32 bits)

```
Bits 0-6:   Start year - 2000 (7 bits, 2000-2127)
Bits 7-10:  Start month (4 bits, 1-12)
Bits 11-15: Start day (5 bits, 1-31)
Bits 16-22: End year - 2000 (7 bits)
Bits 23-26: End month (4 bits)
Bits 27-31: End day (5 bits)
```

Both dates are UTC dates: the start date is the date of the first record, the end date
the date of the last record. The last day is often partial (e.g. ending at 21:45Z), so the
end date is a bound, not a record count.

## Price records (15 or 21 bits)

Prices are EUR/MWh stored as integer cents, `round(price * 100)`.

**Mode 0, short form, 15 bits** - non-negative prices whose cents fit in 14 bits
(0.00 to 163.83 EUR/MWh):
```
Bit 0:     0
Bits 1-14: cents (0-16383)
```

**Mode 1, long form, 21 bits** - negative prices and anything from 163.84 EUR/MWh up:
```
Bit 0:     1
Bits 1-19: absolute value in cents (0-524287, i.e. up to 5242.87 EUR/MWh; larger values are clamped)
Bit 20:    sign (1 = negative)
```

The mode is chosen from the rounded cents value, not from the raw price: 163.835 to
163.839 round to 16384 cents and therefore use the long form.

## Timestamps

Record `i` has the timestamp

```
start_date 00:00 UTC + i * intervalMinutes
```

with `intervalMinutes = 60` for the hourly artifacts and `15` for the `_15min` artifacts
(the TypeScript decoder takes it as an option; the Python decoders are per-resolution).
Decoding stops when the data runs out or a timestamp would fall after the end date.

Consequences the writers enforce, because the format cannot express them:

- **The series must start exactly at UTC midnight** of the start date
  (`trim_to_utc_midnight_start`).
- **The series must be gapless.** A missing record does not read back as a hole; it
  shifts every later timestamp earlier. The scripts refuse to write a series with gaps.
- Everything is UTC. DST needs no special handling because UTC has no DST; local-time
  presentation is done in the frontend.

There is no record count or checksum in the file. Truncation is detected by the readers
(a record cut off mid-way is an error in the TypeScript decoder) and by the pipeline
comparing against `total_records` in the backend metadata (`scripts/data/*_metadata.json`,
or `$DATA_DIR/metadata/` in production).

## Example

May 1-3, 2025, 72 hourly prices:

```
Header:   2025-05-01 -> 0011001 0101 00001
          2025-05-03 -> 0011001 0101 00011
Record 0 (May 1, 00:00Z):  99.97 -> mode 0, 9997 cents  -> 0 10011100001101
Record 1 (May 1, 01:00Z):  -5.00 -> mode 1, 500 cents, negative -> 1 0000000000111110100 1
...
Size: 32 + 72 * 15 = 1112 bits = 139 bytes when every price is in the short range.
```
