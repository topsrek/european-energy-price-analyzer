# European Energy Price Analyzer

European Energy Price Analyzer is a country-based electricity price calculator and explorer. The first supported country route is Austria at `/at`, titled `Strompreisrechner Österreich - EEPA-AT`.

The long-term shape is one international application with localized country analyzers:

- `/` lists available countries and suggests one from saved preference, optional GeoIP, browser locale, or timezone.
- `/at` loads the Austrian analyzer and stores Austria as the selected country.
- Future country routes can be added in `src/config/regions.ts`.

## Current Status

This repo contains the frontend plus the recovered Austrian downloader/custom binary data pipeline. The frontend loads country-specific binary price files such as `public/at_electricity_prices.bin`; it does not generate fallback price data when a country artifact is missing.

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

- One app container, `eepa-app`, serves the built frontend and the data API.
- The same app runs the daily dataset updater.
- The updater writes versioned country artifacts such as `data/at/manifest.json` and the efficient price data file.
- Frontend fetches only the selected country dataset through same-origin `/api/...` paths.
- Smart meter files stay client-side and are never uploaded.

## Deployment

The included Dockerfile builds the Vite app, copies the static build into the Python app image, and serves the frontend, API, and daily updater from one Coolify application on port `49173`. It is suitable for Coolify deployment at `eepa.topsrek.top`.

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
GET http://coolify1:8000/api/v1/deploy?uuid=<application-uuid>&force=false
```

Build locally:

```sh
docker build -t european-energy-price-analyzer .
docker run --rm -p 49173:49173 european-energy-price-analyzer
```

## Branding Note

`EEPA` is a working name for "European Energy Price Analyzer". A legal trademark clearance is still required before public branding is treated as final.
