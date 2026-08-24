# TUFF Stats MVP

A UX-first replacement for the 2026 TUFF stats table, built with React, TypeScript and Node/Express.

## What it does

- Responsive player cards instead of a 20-column table
- Search players instantly
- Sort by receptions, receiving TDs, interceptions, sacks, passing TDs, total points, or games
- Quick-leaders panel
- Player detail drawer with grouped offense / defense / conversions
- Small Node API that normalizes TUFF's stat abbreviations
- Change-detection cache (memory + disk) that only re-fetches when SportsPress list data changes
- No API key required for the current public source

## Data strategy

The API adapter attempts SportsPress REST first. If the list endpoint is unavailable or doesn't expose usable stat rows, it falls back to parsing the public 2026 stats HTML table. The React app only consumes our normalized API, so the upstream implementation can change without infecting the UI.

Heavy season payloads are cached under `server/.cache/` and reused until a lightweight SportsPress `_fields` / `modified_gmt` check shows the source lists changed. If the source is temporarily down, the last good snapshot is served. Force re-fetch is admin-only (`POST /api/admin/refresh` with `ADMIN_TOKEN`).

On startup the API warms every season into that cache in the background. Player career profiles then read those warm snapshots directly (no per-season revalidation chatter).

Default source:

`https://www.playtuff.ca/list/2026-tuff-stats/`

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
TUFF_STATS_URL=https://www.playtuff.ca/list/2026-tuff-stats/
TUFF_LIST_SLUG=2026-tuff-stats
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

## Production note

The UI shows when season data was last fetched. Visitors always use the shared cache; they cannot force a source re-scrape.
