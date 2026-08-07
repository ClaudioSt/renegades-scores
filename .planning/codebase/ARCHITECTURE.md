# Architecture

**Analysis Date:** 2026-05-27

## Pattern Overview

**Overall:** Static Site + Embeddable Widget (Snapshot-based)

**Key Characteristics:**
- No backend server — GitHub Pages serves all static files
- Data is pre-fetched daily (not real-time) and stored as a single JSON snapshot
- Widget runs entirely client-side inside an iframe
- CORS constraint forces all HTML scraping to server-side snapshot generation

## Layers

**Data Generation Layer:**
- Purpose: Fetch and normalize LeagueSphere API data into snapshot.json
- Contains: API fetching, HTML scraping, play-by-play parsing, data normalization
- Location: `_gen_snapshot.js`
- Runs on: GitHub Actions (daily) or locally via `node _gen_snapshot.js`

**Storage Layer:**
- Purpose: Pre-built immutable data cache
- Contains: 464+ teams, 734+ gamedays, nested games and play-by-play logs
- Location: `snapshot.json` (~2.9 MB raw, ~560 KB gzipped)
- Updated by: `_gen_snapshot.js`, committed via GitHub Actions

**Widget Layer:**
- Purpose: Read snapshot, render team score timeline in iframe
- Contains: Config parsing, snapshot loading, caching, classification, rendering
- Location: `widget.html` (self-contained HTML+CSS+JS, 708 lines)
- Depends on: snapshot.json, localStorage, LeagueSphere API (fallback discovery only)

**Admin Layer:**
- Purpose: UI for finding teams and generating iframe embed code
- Contains: Team search, config form, embed code generator
- Location: `generator.html` (401 lines)
- No persistence: client-side only, reads snapshot for team search

## Data Flow

**Snapshot Generation (daily, CI):**

1. GitHub Actions triggers `node _gen_snapshot.js` at 3 AM UTC
2. Fetch all gameday metadata from `/api/gamedays/?format=json&page_size=1000`
3. For each gameday, fetch games from `/api/gamedays/{id}/games/`
4. For each completed game, scrape play-by-play from `/gamedays/gameday/{id}/game/{game_id}` (no CORS — server-side only)
5. Scrape all team names from `/passcheck/team/all/list/` HTML
6. Write normalized `snapshot.json` and commit if changed

**Widget Render (per page load):**

1. User embeds `<iframe src="widget.html?t=159&color=ff4500&..."></iframe>`
2. Widget parses URL params via `parseConfigFromSearch()`
3. Fetch snapshot.json once (or use localStorage cache if fresh)
4. For each team: classify gamedays as past/active/future
5. `quickRenderFromSnap()` renders immediately from snapshot
6. `discoverNewGamedays()` polls API for gamedays newer than snapshot (if TTL expired)
7. `ResizeObserver` reports iframe height to parent via `postMessage`

**State Management:**
- 3-tier cache: snapshot.json (server) → localStorage `lsw_{teamId}` (client, version-aware) → 7-day discovery TTL
- No server-side session state; all state is in URL params + localStorage

## Key Abstractions

**Snapshot:**
- Purpose: Normalized, pre-built data contract between generator and widget
- Pattern: Immutable daily snapshot, versioned via `CACHE_VERSION`
- Schema: `{ generated, teams[], gamedays[] }` — games nested inside gamedays

**batchedAll():**
- Purpose: Rate-limit API calls to avoid hitting LeagueSphere limits
- Pattern: Processes items in batches with configurable delay
- Used in: `_gen_snapshot.js` (batch=5, 100ms delay), `widget.html` (batch=50)

**escapeHtml():**
- Purpose: XSS prevention — must be called before all innerHTML insertions
- Pattern: Escapes `& < > " '` in correct order (& first)
- Location: `widget.html`, tested extensively in `tests/security.test.js`

**parseConfigFromSearch():**
- Purpose: Extract widget configuration from URL parameters
- Returns: `{ teams, color, past, future, showPast, showFuture, showTitle, compact }`
- Tested in: `tests/unit.test.js`

## Entry Points

**Widget (iframe):**
- Location: `widget.html`
- Triggers: Loaded via `<iframe src="widget.html?t=...">` by embedding site
- Responsibilities: Parse config, load data, render scores, report height

**Admin UI:**
- Location: `generator.html`
- Triggers: Opened directly in browser by site admin
- Responsibilities: Team search, embed code configuration, copy-to-clipboard

**Snapshot Generator (CLI):**
- Location: `_gen_snapshot.js`
- Triggers: `node _gen_snapshot.js` (or `--rebuild` flag)
- Responsibilities: Fetch all API data, write snapshot.json

## Error Handling

**Strategy:** Graceful degradation — widget renders what it can, silently skips failures

**Patterns:**
- `fetchJSON()` in widget has no retry (3-attempt retry only in `_gen_snapshot.js`)
- Failed gameday discovery silently drops errored IDs
- Missing team names fall back to abbreviation via `inferName()`
- Invalid localStorage cache cleared and re-fetched

## Cross-Cutting Concerns

**Security:**
- `escapeHtml()` applied before all `innerHTML` insertions
- `.matchAll()` enforced over `.exec()` via security hook in `_gen_snapshot.js`
- `postMessage` uses `'*'` targetOrigin (payload is non-sensitive height only)

**Caching:**
- localStorage key `lsw_{teamId}` with `CACHE_VERSION=3`
- Discovery TTL: `DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000` (7 days)
- Version bump required in `widget.html` when localStorage schema changes

**Rendering:**
- Build HTML strings, inject once via innerHTML (never append to live DOM iteratively)
- Event delegation via single `_openDetail` state for play-by-play toggles

---

*Architecture analysis: 2026-05-27*
*Update when major patterns change*
