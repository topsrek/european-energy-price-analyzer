# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/1ef1dc04-ae7a-4852-b31a-6f62891dbf10

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/1ef1dc04-ae7a-4852-b31a-6f62891dbf10) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/1ef1dc04-ae7a-4852-b31a-6f62891dbf10) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Power‑user and LLM access to on‑screen data

### Goals

- Provide the exact data the UI is showing, in a machine‑readable and human‑skimmable form
- Make exporting frictionless (one click to copy/download)
- Keep the UI unobtrusive for casual users

### UI pattern

- Add a collapsed "Data & Exports" accordion near each chart/table or in a global utility panel.
- Inside the accordion:
  - **Summary recap**: data source(s), time range, active filters, granularity, units, row/series counts.
  - **Downloads**:
    - JSON (LLM‑ready) — canonical, lossless export of the current view model
    - CSV — tidy format; consistent column order and locale‑independent number/date formats
    - "Copy JSON" to clipboard (for pasting into prompts)
  - **Programmatic**:
    - Copy cURL for the exact API call producing the view
    - Link to API endpoint/docs (if public)
    - "Share this view" link (encodes state; see URL section below)
  - **Preview**: first N rows rendered in a small table; toggle to reveal full JSON

### Serializable view model (LLM‑ready JSON)

Export the currently visible state as a compact, documented JSON object. Suggested shape:

```json
{
  "version": 1,
  "view": "Electricity price by hour",
  "timeRange": { "startIso": "2025-01-01T00:00:00Z", "endIso": "2025-01-07T23:59:59Z", "timezone": "Europe/Vienna" },
  "filters": { "region": ["AT"], "market": "DayAhead" },
  "aggregation": { "grain": "hour", "method": "average" },
  "schema": [
    { "name": "timestamp", "type": "datetime", "unit": "UTC", "description": "Hour start" },
    { "name": "price_eur_mwh", "type": "number", "unit": "EUR/MWh", "description": "Average day‑ahead price" }
  ],
  "data": [
    ["2025-01-01T00:00:00Z", 88.12]
    // ... more rows not shown
  ],
  "metadata": { "source": "APG", "retrievedIso": "2025-01-08T10:00:00Z", "rows": 168 }
}
```

Notes:

- Prefer arrays of rows for compactness; use `schema` to label columns.
- Use ISO‑8601 UTC for datetimes; include `timezone` separately for display context.
- Include `version` to allow non‑breaking evolution.
- Optional: add `llmMarkdown` (1‑2 sentence plain description) to seed prompts.

### CSV export guidelines

- Column order mirrors `schema`. Use `,` as delimiter, `.` as decimal separator, newline `\n`.
- Dates as ISO‑8601 strings. Units reflected in header names when helpful (e.g., `price_eur_mwh`).
- Quote only when needed; always include a header row.

### Implementation sketch (React + shadcn‑ui)

- Create `useExportableViewModel()` that derives the JSON export and CSV string from current UI state.
- Build `ExportPanel` using `Accordion` and action buttons: Copy JSON, Download JSON, Download CSV, Copy cURL, Share link.
- Generate downloads via `Blob` + `URL.createObjectURL`; use `navigator.clipboard.writeText` for copy.
- Guardrails: omit/obfuscate any sensitive fields before export; cap preview rows; stream large CSVs if needed.

## Full state in the URL — pros and cons

### Pros

- **Shareable deep links**: reproduce exactly what the sharer sees
- **Stateless clients**: works on static hosting/CDNs; fewer server dependencies
- **Great UX**: back/forward navigation restores state; easy bookmarking and E2E testing
- **Cache‑friendliness**: distinct URLs for distinct states

### Cons

- **URL length limits**: practical ceilings range ~2–8 KB across environments; very long URLs break email, proxies, some apps
- **Privacy & leakage**: query strings end up in logs, analytics, referrers; risk of exposing filters or IDs
- **Versioning/migrations**: evolving state schemas must be migrated on load
- **SEO noise**: crawlable parameter permutations can explode index surface
- **Complexity**: encoding/decoding, compression, and error handling add code paths

### Recommendations

- **Hybrid approach**:
  - Keep small, semantic params in the query string (e.g., `?region=AT&grain=hour`).
  - For large/complex state, compress to the hash fragment (not sent to servers): LZ‑string (UTF‑16) → Base64URL (`#s=...`).
  - Offer a "Short link" that persists state server‑side and returns a tiny ID (e.g., `?id=abc123`).
- **Security & privacy**:
  - Never include PII/secrets. Scrub identifiers; prefer opaque IDs.
  - Hash fragment by default; use query params only for minimal, non‑sensitive keys.
- **Resilience**:
  - Include `stateVersion` and perform migrations on load.
  - Detect oversize states and fall back to short‑link storage automatically.
- **UX**:
  - Provide both "Share live" (recomputes from filters) and "Share snapshot" (frozen data export).
  - Make the share action visible in the same "Data & Exports" accordion.

With this setup, power users and LLMs get trustworthy, reproducible data, while typical users keep a clean UI. The hybrid URL strategy balances shareability, privacy, and robustness.
