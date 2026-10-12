# EEPA Energy Price Data System

## Overview

Country-based day-ahead electricity prices for the European Energy Price Analyzer,
stored in a compact positional binary format and loaded lazily per country.

- Countries: Austria (AT), Germany-Luxembourg (DE-LU), France (FR).
- Per country an hourly artifact and a 15-minute artifact (15-minute data starts
  2025-10-01, when day-ahead markets switched to a 15-minute MTU).
- Since that switch the hourly price is the mean of the four quarter-hours; the pipeline
  warns if the two artifacts ever disagree.
- Missing country files produce a no-data state; the app never generates mock prices.
- Coverage and record counts change daily; the backend metadata
  (`scripts/data/*_metadata.json`, `$DATA_DIR/metadata/` in production) is authoritative.

## File structure

```
public/
├── {at,de-lu,fr}_electricity_prices.bin        # hourly
└── {at,de-lu,fr}_electricity_prices_15min.bin  # 15-minute

scripts/                                        # download/encode pipeline, see scripts/README.md
worker/server.py                                # web server, API and daily scheduler
src/utils/optimized-binary-decoder.ts           # browser decoder
docs/optimized-binary-format.md                 # format specification
```

## Serving

The worker serves the artifacts at `/api/{cc}_electricity_prices[_15min].bin` from the
live data directory (never from the copies Vite places in `dist/`), plus:

- `/api/health` - liveness and data staleness (always HTTP 200 while serving; per-country
  details and update state only for loopback clients)
- `/api/data-freshness` (POST) - whether a client's cached data is current
- `/api/geoip` - country from edge headers or an optional provider
- `/api/data-manifest` - `data/manifest.json`

## Binary format (summary)

32-bit header with the UTC start and end dates, then one record per interval:
15 bits for 0.00-163.83 EUR/MWh, 21 bits for negative or higher prices. Timestamps are
`start date 00:00Z + index * interval`, so the series must be gapless and start at UTC
midnight. Details: `docs/optimized-binary-format.md`.

## Usage

```bash
pip install -r scripts/requirements.txt
python3 scripts/daily_update.py                                   # AT, DE-LU, FR
python3 scripts/smart_batch_downloader.py DE-LU 2026-10-01 2026-10-12
python3 scripts/build_interval_dataset.py DE-LU 2026-10-01 2026-10-12
```

Other Energy Charts bidding zones work the same way; a new country also needs a route
in `src/config/regions.ts` and an entry in `COUNTRIES`.

## Production notes

- No metadata files are served to browsers.
- Retry logic stays conservative because the upstream source is shared public
  infrastructure (only 429/5xx/connection errors are retried, honouring `Retry-After`).
- Data persists across redeploys only with a volume at `/app/storage`; see
  `scripts/README_DAILY_UPDATE.md`.
- Source and license: Energy Charts API (energy-charts.info), CC BY 4.0 from
  Bundesnetzagentur | SMARD.de.
