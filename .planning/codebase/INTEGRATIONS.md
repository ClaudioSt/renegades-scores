# External Integrations

**Analysis Date:** 2026-05-27

## APIs & External Services

**LeagueSphere API (primary data source):**
- Base URL: `https://leaguesphere.app/api` — `_gen_snapshot.js` (line 5)
- Public API, no authentication required
- Endpoints used:
  - `GET /api/gamedays/?format=json&page_size=1000` — all gameday metadata (734+ entries) — `_gen_snapshot.js`
  - `GET /api/gamedays/{id}/games/?format=json` — games per gameday — `_gen_snapshot.js`
  - `GET /passcheck/team/all/list/` — HTML page scrape for team names (no JSON endpoint) — `_gen_snapshot.js`
  - `GET /gamedays/gameday/{id}/game/{game_id}` — play-by-play HTML (no CORS header — server-side only) — `_gen_snapshot.js`
- Widget client-side discovery (fallback only): `GET /api/gamedays/` with date filter — `widget.html`

**Rate limiting strategy:**
- `_gen_snapshot.js`: batch size 5, 100ms delay between batches, 3-attempt retry with 500ms × attempt backoff
- Widget: batch size 50, minimal delay

## Data Storage

**snapshot.json (static file cache):**
- Pre-built data cache served via GitHub Pages
- ~2.9 MB raw, ~560 KB gzipped by GitHub Pages automatically
- Updated daily, committed to repo
- Schema: `{ generated, teams[], gamedays[{ id, date, name, games[...] }] }`
- Client consumption: fetched once, cached in localStorage (key: `lsw_{teamId}`)

**localStorage (client-side cache):**
- Key format: `lsw_{teamId}` (e.g., `lsw_159`)
- Schema: `{ version: 3, snapshot: {...}, next_discovery: timestamp }`
- Version controlled: `CACHE_VERSION = 3` in `widget.html` — must be bumped on schema changes
- No expiry (snapshot data is historical — never invalidates)
- Discovery TTL: 7 days (`DISCOVERY_TTL_MS`) before re-checking for new gamedays

**Databases:**
- Not applicable — no database, no backend

## Authentication & Identity

- Not applicable — no user accounts, no auth
- LeagueSphere API is fully public, no API keys required

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry, no error reporting service

**Analytics:**
- Not detected — no analytics scripts in widget or generator

**Logs:**
- GitHub Actions: stdout logs from `node _gen_snapshot.js` (progress output, batch counts)
- Widget: silent (no console output by design)

## CI/CD & Deployment

**Hosting:**
- GitHub Pages — serves all static files at `https://claudiost.github.io/renegades-scores/`
- Deployment: automatic — any push to master deploys immediately
- Compression: GitHub Pages applies gzip automatically (snapshot.json: 2.9 MB → 560 KB)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/update-snapshot.yml`
- Schedule: daily at 3 AM UTC (5 AM CEST)
- Also: manual `workflow_dispatch` trigger
- Steps: checkout → setup Node 20 → `node _gen_snapshot.js` → commit if changed → push

**No secrets required:**
- All API endpoints are public
- GitHub Actions uses default `GITHUB_TOKEN` for commit/push

## Embedding (PostMessage API)

**Widget → Parent communication:**
- Protocol: `window.parent.postMessage({ type: 'resize', height: N }, '*')`
- Purpose: Auto-resize iframe height to fit content
- Trigger: `ResizeObserver` on widget root element
- Parent side: must implement `window.addEventListener('message', ...)` to receive — documented in `README.md`
- Security: `'*'` targetOrigin (acceptable — payload contains only `{type, height}`, no sensitive data)

## Environment Configuration

**Development:**
- No environment variables required
- Run tests: `npm test`
- Rebuild snapshot: `node _gen_snapshot.js`
- No local server needed — open HTML files directly or use any static file server

**Production:**
- No configuration needed — everything is hardcoded or URL-parameter driven
- API base URL hardcoded: `https://leaguesphere.app/api` in `_gen_snapshot.js` and `widget.html`

---

*Integration audit: 2026-05-27*
*Update when adding/removing external services*
