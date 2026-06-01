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

The recommended Coolify deployment architecture is:

- One app container that serves the built frontend and the data API.
- Worker downloads country datasets daily.
- Worker writes versioned country artifacts such as `data/at/manifest.json` and the efficient price data file.
- Frontend fetches only the selected country dataset through same-origin `/api/...` paths.
- Smart meter files stay client-side and are never uploaded.

## Deployment

The included Dockerfile builds the Vite app, copies the static build into the Python worker image, and serves both the frontend and API on port `49173`. It is suitable for Coolify deployment at `eepa.topsrek.top`.

For the current LXC layout:

- Coolify/app LXC: `192.168.1.21`
- Coolify service URL for Nginx Proxy Manager: `http://192.168.1.21:49173`
- Coolify/NPM LXC: `192.168.1.20`

Leave `VITE_DATA_BASE_URL` unset for this deployment so the browser uses same-origin `/api/...` requests through the public domain. Only set it if the API is intentionally hosted on a different public origin.

Build locally:

```sh
docker build -t european-energy-price-analyzer .
docker run --rm -p 49173:49173 european-energy-price-analyzer
```

## Branding Note

`EEPA` is a working name for "European Energy Price Analyzer". A legal trademark clearance is still required before public branding is treated as final.
