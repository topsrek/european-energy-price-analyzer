# Price Data Pipeline

Downloads day-ahead electricity prices from the Energy Charts API and maintains the
compact binary artifacts the frontend loads. Countries (bidding zones): AT, DE-LU, FR.

## Artifacts

Per country `{cc}` (`at`, `de-lu`, `fr`):

| File | Content |
| --- | --- |
| `public/{cc}_electricity_prices.bin` | hourly prices (UTC); since 2025-10-01 the mean of the four quarter-hours |
| `public/{cc}_electricity_prices_15min.bin` | 15-minute prices from 2025-10-01 (start of the 15-minute day-ahead MTU) |
| `scripts/data/{cc}_electricity_prices[_15min]_metadata.json` | backend metadata: record count, first/last timestamp, covered dates |

The metadata is not served to browsers. The worker reads `last_timestamp` from it to
decide whether data is stale. In production both live under `$DATA_DIR` instead (see
`README_DAILY_UPDATE.md`). Coverage and record counts change daily; read them from the
metadata rather than from documentation.

The file format is described in `../docs/optimized-binary-format.md`.

## Scripts

```
scripts/
├── smart_batch_downloader.py  # hourly artifact: fetch window, aggregate quarters, merge, write
├── build_interval_dataset.py  # 15-minute artifact: fetch window, merge, write, check vs hourly
├── price_downloader.py        # API client with retry / Retry-After handling
├── metadata_manager.py        # metadata, atomic writes, DATA_DIR-aware paths
├── daily_update.py            # runs both scripts for each country (same as the worker)
├── smoke_daily_update.py      # manual smoke check (real download)
├── coolify-redeploy.sh        # triggers a Coolify redeploy over Tailscale
├── test-tz.mjs                # frontend unit tests under several time zones (npm run test:tz)
└── requirements.txt
```

## Usage

From the repository root:

```bash
pip install -r scripts/requirements.txt

python3 scripts/smart_batch_downloader.py AT 2026-10-01 2026-10-12
python3 scripts/build_interval_dataset.py AT 2026-10-01 2026-10-12
python3 scripts/daily_update.py            # all configured countries
```

Arguments are `COUNTRY START END` (inclusive dates, YYYY-MM-DD). Without arguments the
hourly script refreshes AT from 2025-07-01 and the interval script AT from 2025-10-01,
both through today/tomorrow.

`--rebuild` ignores the existing artifact and writes only the fetched window. Without it
the scripts:

- exit non-zero without writing if the existing artifact cannot be decoded,
- never shrink an artifact (compared with the larger of the decoded and the metadata count),
- refuse to write a series with gaps or one that does not start at UTC midnight
  (the positional format would shift every later timestamp),
- write the binary first and the metadata second, each atomically (temp file, fsync, rename).

Fresh values always win over stored ones, so re-running a window applies upstream
corrections. A run that finds nothing new exits 0 without touching the files.

## API

- `https://api.energy-charts.info/price?bzn=AT&start=YYYY-MM-DD&end=YYYY-MM-DD`
- JSON with `unix_seconds` and `price` (EUR/MWh); days are market-local (CET/CEST).
- Only HTTP 429, 5xx and connection errors are retried (5/15/30/60 s, honouring `Retry-After`).
- License: CC BY 4.0, Bundesnetzagentur | SMARD.de.

## Tests

```bash
python3 -m unittest discover -s tests -p 'test_*.py'   # pipeline (no network)
(cd worker && python3 -m unittest test_server)         # worker HTTP handler and scheduler helpers
```
