# European Energy Price Analyzer

European Energy Price Analyzer is a country-based electricity price calculator and explorer for day-ahead spot prices in Austria (AT), Germany-Luxembourg (DE-LU) and France (FR).

Routes:

- `/` lists available countries and suggests one from saved preference, optional GeoIP, browser locale, or timezone.
- `/at`, `/de-lu`, `/fr` load a country analyzer (hourly and 15-minute prices) and store it as the selected country.
- `/compare` compares the countries side by side.
- Country routes are configured in `src/config/regions.ts`.

## Current Status

This repo contains the React frontend, the Python download/encoding pipeline (`scripts/`) and the worker that serves both (`worker/`). The frontend loads country-specific binary price files such as `/api/at_electricity_prices.bin` and `/api/at_electricity_prices_15min.bin`; it does not generate fallback price data when a country artifact is missing.

Smart-meter upload is live: CSV or JSON files with timestamps as `yyyy-MM-dd HH:mm` or `dd.MM.yyyy HH:mm` (interpreted in the market's local time) or ISO 8601 with an offset. Files are parsed in the browser and never uploaded.

## Local Development

```sh
npm ci
npm run dev
```

Useful checks:

```sh
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:tz    # unit tests under several viewer time zones
npm run test:e2e   # Playwright
python3 -m unittest discover -s tests -p 'test_*.py'
(cd worker && python3 -m unittest test_server)
```

## Region Selection

Selection order on `/`:

1. `localStorage` key `eepa.selectedRegion`
2. Optional GeoIP endpoint from `VITE_GEOIP_ENDPOINT`
3. Browser language country code
4. Browser timezone
5. Default region, currently Austria

The GeoIP endpoint must return one of these fields: `country_code`, `countryCode`, or `country`.

## Data Architecture

The Coolify deployment architecture is:

- One app container, `eepa-app`, serves the built frontend and the data API (`worker/server.py`).
- The same process runs the daily dataset updater for `COUNTRIES` (default `AT,DE-LU,FR`).
- The updater rewrites the per-country hourly and 15-minute binary artifacts and their backend metadata; see `scripts/README.md` and `docs/optimized-binary-format.md`.
- Frontend fetches only the selected country dataset through same-origin `/api/...` paths.
- Smart meter files stay client-side and are never uploaded.

## Deployment

`worker/Dockerfile` (the only Dockerfile; Coolify builds it with the repo root as context) builds the Vite app, copies the static build into a Python image, and serves the frontend, API, and daily updater from one Coolify application on port `49173`, running as a non-root user. It is deployed at `eepa.topsrek.top`. The worker sends a Content-Security-Policy whose script hashes are computed from `dist/index.html` at runtime; HSTS is left to the TLS proxy.

Downloaded data is kept in `DATA_DIR=/app/storage`. Mount a persistent volume there so it survives redeploys; see `scripts/README_DAILY_UPDATE.md` for the exact Coolify setting. Without a volume each deploy starts from the committed artifacts.

For the current LXC layout:

- Coolify/app LXC: `192.168.1.21`
- Coolify service URL for Nginx Proxy Manager: `http://192.168.1.21:49173`
- Coolify/NPM LXC: `192.168.1.20`

Leave `VITE_DATA_BASE_URL` unset for this deployment so the browser uses same-origin `/api/...` requests through the public domain. Only set it if the API is intentionally hosted on a different public origin.

### Private Coolify Redeploy

Coolify is not exposed publicly on port `8000`, so GitHub webhooks cannot reach it directly. For this project, trigger redeploys from a Tailscale-connected machine after the Git push succeeds.

Create the system-wide secret file for the Tailscale Coolify host:

```sh
mkdir -p ~/.secrets
chmod 700 ~/.secrets
install -m 600 /dev/null ~/.secrets/coolify1.env
```

Add these values:

```sh
COOLIFY_BASE_URL=http://coolify1:8000
COOLIFY_API_TOKEN=replace-with-coolify-api-token
```

Coolify API tokens should include permission to list applications and deploy resources. The script uses Coolify's Bearer-token API authentication and keeps the token outside this repository.

If the token can deploy but cannot list applications, set the UUID explicitly:

```sh
COOLIFY_RESOURCE_UUID=nmu27zox7uqup1wngzgf0ie9
```

Trigger a redeploy:

```sh
scripts/coolify-redeploy.sh
```

The script defaults to the `eepa-app` Coolify UUID. If the default is removed, it discovers this application's Coolify UUID by calling:

```text
GET http://coolify1:8000/api/v1/applications
```

It matches the current GitHub repository and branch, then calls:

```text
POST http://coolify1:8000/api/v1/deploy?uuid=<application-uuid>&force=false
```

Build locally:

```sh
docker build -f worker/Dockerfile -t european-energy-price-analyzer .
docker run --rm -p 49173:49173 -e RUN_SCHEDULER=false european-energy-price-analyzer
```

Or without Docker, after `npm run build`: `RUN_SCHEDULER=false PORT=49173 python3 worker/server.py`.

## Branding Note

`EEPA` is a working name for "European Energy Price Analyzer". A legal trademark clearance is still required before public branding is treated as final.
