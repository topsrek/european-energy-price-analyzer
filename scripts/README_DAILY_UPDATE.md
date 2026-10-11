# Daily Price Updates

The price artifacts (hourly and 15-minute, per country) are refreshed once a day after
the day-ahead auction results are published. Countries: AT, DE-LU and FR by default.

## In production: the worker

`worker/server.py` (built by `worker/Dockerfile`, which is what Coolify deploys) runs the
refresh itself; no cron job is needed.

- Every 5 minutes it checks whether any country's data is behind the expected date
  (tomorrow once `UPDATE_HOUR_LOCAL:UPDATE_MINUTE_LOCAL` in `UPDATE_TIMEZONE` has passed,
  default 13:07 Europe/Vienna). If so it runs `smart_batch_downloader.py` and
  `build_interval_dataset.py` for each country in `COUNTRIES`.
- The window starts one day before the older of the two artifacts ends, so the usually
  partial last day is completed, upstream corrections land, and a missed run catches up.
- If upstream has not published yet, the run ends as `pending` and is retried with
  back-off (about 12 min shortly after the scheduled time, then 30 min, then 2 h).
- After each 15-minute refresh the builder compares the hourly artifact with the mean of
  the four quarter-hours and logs a warning for every hour that differs by more than half
  a cent.

Monitor `/api/health`: it always returns HTTP 200 while the process is serving, with
`"ok": false` and `stale_countries` when data is behind, plus the last update state.

### Persistent storage (Coolify)

Without a volume every redeploy starts again from the artifacts committed to the repo,
and anything the worker fetched since the last commit has to be downloaded again.

The image sets `DATA_DIR=/app/storage`. The worker keeps the live artifacts in
`$DATA_DIR/public/`, their metadata in `$DATA_DIR/metadata/` and its state in
`$DATA_DIR/worker-state.json`. On startup it seeds that directory from the copies baked
into the image: an artifact is copied when the directory lacks it or holds data that ends
earlier than the image copy (by `last_timestamp` in the metadata). Newer data in the
directory is never overwritten. If the directory is not writable the worker logs an error
and falls back to the image copies, i.e. it behaves exactly as without a volume.

To make the data survive redeploys, add one mount in Coolify:

1. Application `eepa-app` -> **Configuration** -> **Persistent Storage** -> **+ Add**.
2. Choose **Volume Mount**.
   - Name: `eepa-data` (any name; Coolify prefixes it with the application UUID)
   - Source Path: leave empty (a Docker named volume)
   - Destination Path: `/app/storage`
3. Save and redeploy. No environment variable is needed; `DATA_DIR` already points there.

On the first start the logs show `Seeded ... into /app/storage` for each of the six
artifacts. A new named volume inherits the ownership of `/app/storage` in the image
(uid/gid 10001, the non-root `eepa` user). If you use a host directory (bind mount)
instead, `chown -R 10001:10001` it on the host first.

To discard the volume data and start again from the image, stop the app, delete the
volume (or its contents) and redeploy.

## Manual runs

From the repository root (writes `public/` and `scripts/data/`, or `$DATA_DIR` if set):

```bash
pip install -r scripts/requirements.txt

# Same steps as the worker, for COUNTRIES or the countries given (default AT,DE-LU,FR)
python3 scripts/daily_update.py
python3 scripts/daily_update.py AT DE-LU

# A specific window for one country
python3 scripts/smart_batch_downloader.py FR 2025-11-11 2025-11-13
python3 scripts/build_interval_dataset.py FR 2025-11-11 2025-11-13

# Smoke check: a real daily update (downloads and rewrites artifacts)
python3 scripts/smoke_daily_update.py
```

`daily_update.py` logs to the console and to `daily_update.log` in the working directory.

Both scripts re-download the whole requested window, let fresh values win over stored
ones, and refuse to write when the result would be shorter than what is stored, contains
a gap, or the existing artifact cannot be decoded. `--rebuild` deliberately replaces an
artifact with just the fetched window.

The API (`api.energy-charts.info`) is shared public infrastructure and rate-limits with
HTTP 429; the scripts honour `Retry-After`. Keep manual windows reasonably small.

## Data integrity

- Timestamps are stored in UTC; the frontend converts to market or viewer time.
- Only real market data is stored, never placeholders.
- Since the 15-minute MTU switch (2025-10-01) an hourly price is the mean of its four
  quarter-hours; hours with fewer quarters are left out and re-fetched later.
- See `docs/optimized-binary-format.md` for the file format and its invariants.
