# Crest House Access Control System

Household access tracking for contractors and family vehicles, with multi-admin login support.

## Stack

- Next.js 16 (App Router)
- SQLite (`better-sqlite3`)
- Tailwind CSS
- Docker / Docker Compose

## Local Development

1. Install dependencies:
   - `npm ci`
2. Configure environment:
   - Set `JWT_SECRET` to a value with 16+ characters.
   - Optionally set `DATABASE_PATH` (default: `data/crest-house-access.db`).
3. Start dev server:
   - `npm run dev`
4. Open:
   - `http://localhost:3000`

On first run, create the first admin user via `/setup`.

## Production (Docker Compose)

1. Ensure `.env` contains required values (`JWT_SECRET`, optional `DATABASE_PATH`, `HOST_PORT`).
2. Start:
   - `docker compose up -d --build`
3. App endpoint:
   - `http://localhost:${HOST_PORT:-4826}`

The container runs SQL migrations on startup (`scripts/migrate.mjs`) against
`/app/data/crest-house-access.db` by default.

## Auth Model

- `admin_users` stores all login-capable users.
- All admin users are full-access (no role tiers in v1).
- Contractors and family vehicles are records only and cannot log in.

## Home Assistant via HACS

This repo now includes a HACS-installable custom integration under
`custom_components/crest_house_access`.

## Versioning

This repository ships two separate deliverables and they are versioned
independently:

- Main app version: `package.json`
- Home Assistant integration version: `custom_components/crest_house_access/manifest.json`

Current baseline:

- App: `0.1.0`
- HA integration: `0.3.6`

Versioning rules:

- Bump the app version when the web app, admin UI, API, or database-facing app
  behavior changes.
- Bump the HA integration version when the Home Assistant integration changes.
- Bump both when a change affects both deliverables.

Git tag convention:

- App releases use tags like `app-v0.1.0`
- HA integration releases use tags like `ha-v0.3.6`

This keeps release history readable even though both artifacts live in the same
repository.

### What it exposes

- `sensor.on_site`
- `binary_sensor.site_occupied`
- `sensor.contractors`
- `sensor.flagged_today`

The `on_site` sensor and `site_occupied` binary sensor include the live
`open_sessions` list as attributes for automations and dashboards.

### Install with HACS

1. In Home Assistant, open HACS.
2. Add this repository as a custom repository with type `Integration`.
3. Search for `Crest House Access Control` and install it.
4. Restart Home Assistant.
5. In this app, go to `Integrations` and create an API key.
6. In Home Assistant, add the `Crest House Access` integration and provide:
   - Base URL, for example `http://your-host:4826`
   - API key
   - Polling interval in minutes

### Current API contract

The integration polls `GET /api/v1/status` with a bearer token:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:4826/api/v1/status
```
