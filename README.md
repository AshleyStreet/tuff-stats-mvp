# Afterwhistle

A white-label stats platform for amateur sports leagues, built with React, TypeScript and Node/Express. One codebase serves many leagues ("tenants"); each tenant gets its own branding, data source, and stat presentation without a code fork.

**TUFF** (Toronto United Flag Football) is Afterwhistle's founding tenant — the UX-first replacement for its 2026 stats table that the platform grew out of.

## What it does

- Responsive player cards instead of a 20-column table
- Search players instantly
- Sort by receptions, receiving TDs, interceptions, sacks, passing TDs, total points, or games
- Quick-leaders panel
- Player detail drawer with grouped offense / defense / conversions
- Small Node API that normalizes each tenant's stat abbreviations into one canonical player model
- Change-detection cache (memory + disk, isolated per tenant) that only re-fetches when source data changes
- No API key required for the current public sources

## Multi-tenant architecture

Each tenant is a `League` (see `server/src/leagues/types.ts`): branding, copy, sport, franchise team names, and a data-source config. Built-in tenants are defined in code under `server/src/leagues/` (`tuff.ts`, `harbor.ts`, `bush.ts`, `passion.ts`); additional tenants can be created and edited through the `/admin` dashboard, which persists them as JSON overlay files under `server/.tenants/` (see `server/src/leagues/store.ts`).

A tenant is served by one of three data adapters (`server/src/adapters/`), picked by `league.adapter`:

- `tuff` — TUFF's bespoke SportsPress-REST-first, HTML-scrape-fallback adapter
- `sportspress` — a generic, config-driven adapter for any SportsPress-powered league site
- `fixture` — static JSON data, used for demo tenants

All three normalize their raw source fields into the same canonical `Player`/`Stats` shape (`server/src/domain/types.ts`) via a shared stat-abbreviation map that a tenant can extend or override per its own source fields (`LeagueSourceConfig.statMap`) — onboarding a league with different raw stat names is a config change, not a code change.

**Tenant resolution** is hostname-based: in production, the request's `Host` header is matched against each tenant's configured `hostnames[]` (e.g. `stats.playtuff.ca` → TUFF). In development only, a `?league=<slug>` query param or `LEAGUE_SLUG` env var can override this for local testing. An unrecognized host safely falls back to the default tenant rather than erroring.

Each tenant's disk and in-memory caches are keyed by tenant id, so one tenant's data can never be read from or overwritten by another's cache.

## Data strategy

Adapters attempt each source's REST API first. If that's unavailable or doesn't expose usable rows, the `tuff` adapter falls back to parsing the public stats HTML table. The React app only consumes Afterwhistle's normalized API, so an upstream site's implementation can change without infecting the UI.

Heavy season payloads are cached under `server/.cache/<tenant>/` and reused until a lightweight change-detection check (e.g. SportsPress `_fields` / `modified_gmt`) shows the source data changed. If a source is temporarily down, the last good snapshot is served. Force re-fetch requires admin credentials (see [Admin tokens](#admin-tokens) below).

On startup the API warms every season into that cache in the background for the default tenant. Player career profiles then read those warm snapshots directly (no per-season revalidation chatter).

## Run it

Requires Node 20+.

```bash
npm install
npm run install:all
npm run dev
```

Then open:

- Web: http://localhost:5173
- API: http://localhost:4000/api/players
- Health: http://localhost:4000/api/health

## Environment variables

Copy `server/.env.example` to `server/.env` if you want to override defaults.

```env
PORT=4000
# Optional. Overrides TUFF's configured source URL (server/src/leagues/tuff.ts).
TUFF_STATS_URL=https://www.playtuff.ca/list/2026-tuff-stats/
ADMIN_TOKEN=
```

Set `ADMIN_TOKEN` on the server to enable force refresh. Only you should know that token — never put it in the client build.

```bash
curl -X POST https://<your-app>/api/admin/refresh \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"season\":\"2026\"}"
```

Useful endpoints:

- `GET /api/health` — lightweight liveness + warm summary
- `GET /api/status` — cache/warm detail
- `POST /api/admin/refresh` — force re-fetch (requires `ADMIN_TOKEN`)

Local production smoke test:

```bash
npm run build
npm start
```

Then open http://localhost:4000

## Host on Lightsail

Use a Lightsail instance plus a domain of your own (e.g. `stats.playtuff.ca` for TUFF) if you do not want an `.onrender.com` URL. Step-by-step: [deploy/lightsail/README.md](deploy/lightsail/README.md).

## Production note

The UI shows when season data was last fetched. Visitors always use the shared cache; they cannot force a source re-scrape.
