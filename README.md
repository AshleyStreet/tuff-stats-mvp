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

Heavy season payloads are cached under `server/.cache/` and reused until a lightweight SportsPress `_fields` / `modified_gmt` check shows the source lists changed. Pass `?refresh=1` to force a full re-fetch. If the source is temporarily down, the last good snapshot is served.

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
```

## Host on Render

Production serves the built React app and API from one Express process.

1. Push this repo to GitHub
2. In [Render](https://render.com), create a new **Blueprint** from the repo (uses `render.yaml`), or a **Web Service** with:
   - **Build:** `npm install --include=dev && npm run install:all && npm run build`
   - **Start:** `npm start`
   - **Health check:** `/api/health`
3. Deploy — your app will be at `https://<service>.onrender.com`

Local production smoke test:

```bash
npm run build
npm start
```

Then open http://localhost:4000

Season selector covers available TUFF/TGFL stats lists (currently 2019–2026). Teams for each season come from that year’s roster lists.

## Production note

This is intentionally an MVP. Before making it a public production service, confirm TUFF is happy with the data being republished and add stronger caching / persistence if traffic grows.

Free Render services spin down after idle time; the first request after that can take ~30–60s.
