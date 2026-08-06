# Renegades Scores — Project Context

## What this is
Embeddable score widget for American Flag Football teams, served via GitHub Pages at
`https://claudiost.github.io/renegades-scores/`. Data comes from the LeagueSphere API,
pre-fetched daily into `snapshot.json` to avoid CORS and performance issues.

## Key files

| File | Role |
|------|------|
| `widget.html` | Embeddable iframe — reads snapshot, renders past/active/future gamedays |
| `generator.html` | Admin tool — team search + config → generates iframe embed code |
| `snapshot.json` | Pre-built data cache (2.9 MB, gzipped ~560 KB by GitHub Pages) |
| `_gen_snapshot.js` | Node.js script that builds snapshot.json — run locally or via GitHub Actions |
| `league-config.json` | Which leagues/seasons get a standings table (`league_display` + season year) |
| `standings.js` | Computes the tables from the snapshot; result stored as `snapshot.standings` |
| `slices.js` | Cuts the snapshot into small per-team / per-league API files under `api/v1/` |
| `.github/workflows/update-snapshot.yml` | Daily full refresh at 3 AM UTC (5 AM CEST) |
| `.github/workflows/update-snapshot-live.yml` | Every 5 min, refetches only today's gamedays (6-20 Uhr Berlin time, gated in-script) |

Old/prototype files not in active use: `renegades_scores.html`, `test.html`, `_snapshot.js`.

## Data architecture

```
LeagueSphere API (public, no auth)
  └─ /api/gamedays/?format=json&page_size=1000   → 734+ gamedays
  └─ /api/gamedays/{id}/games/?format=json        → games per day
  └─ /passcheck/team/all/list/                    → 464 team names (HTML scrape)
  └─ /gamedays/gameday/{id}/game/{game_id}        → play-by-play HTML (no CORS!)
          ↓ _gen_snapshot.js (node, ~5 min full / ~15 min rebuild)
      snapshot.json  { generated, teams[], gamedays[] }
          ↓ GitHub Pages serves (gzip)
      widget.html fetches snapshot once, caches in localStorage (CACHE_VERSION=3)
```

Play-by-play HTML has no CORS header — must be fetched server-side in `_gen_snapshot.js`,
stored as `game.log = { l, r, ev[] }` in snapshot. Never fetch from client.

## snapshot.json structure

```js
{
  generated: "2026-05-26",
  teams: [{ id, abbrev, name, gamedays: [{id, date, name, league}] }],
  gamedays: [{
    id, date, name, start, league_display, address,
    phase?,           // only set for gamedays matched by league-config.json
    games: [{
      id, status, stage, standing, scheduled, field,
      final_score, halftime_score,
      results: [{ team_id, team_name, pa, isHome }],
      log?: { l, r, ev: [{b?} | {l?, lx?, r?, rx?, s?}] }
    }]
  }],
  standings: { [leagueKey]: { [year]: { name, promotion_restricted, rows: [
    { team_id, team_name, Sp, S, U, N, EP, GP, PD, SQ }   // sorted SQ → PD → EP
  ]}}}
}
```

`pa` = **points against** (what the opponent scored). Win = `me.pa < other.pa`.

## API slices (`api/v1/`)

`slices.js` cuts the snapshot into per-request files, written by every generator mode.
A team page needs ~40 KB instead of the full 3.8 MB snapshot.

```
api/v1/teams.json                    id/name index for generator.html      (~24 KB)
api/v1/teams/<id>.json               that team's gamedays, games, tables   (~24 KB avg)
api/v1/standings/<league>/<year>.json one table                            (~2 KB)
api/v1/health.json                   { generated, teams, gamedays, standings[] }
```

A team slice holds **only that team's own games** — `renderGamedayCard()` filters to them
anyway — plus the opponents' names and the tables of the leagues the team appears in.

Two rules keep git history from exploding, both covered by tests:
- **No timestamp in team/standings slices.** Data age lives in `health.json` alone, so a
  slice stays byte-identical when nothing changed.
- **`writeIfChanged()`**: files are only rewritten when their content differs. A rerun over
  unchanged data writes zero files.

Teams that appear only in the passcheck list (no games) get no slice; slices of teams that
vanish from the data are deleted. Both workflows stage `api/` alongside `snapshot.json`.

## Standings tables (`league-config.json`)

A league only gets a table if it is listed here. Spieltage are **derived** from the
snapshot — every gameday whose `league_display` matches and whose date falls in the
season year — so new gamedays enter the table automatically on the next snapshot run.

```json
"ff-bl": {
  "2026": {
    "name": "FF BL 2026",              // phase label; must match for widget lookup
    "league_display": "FF BL",         // matched against gameday.league_display
    "exclude_gameday_ids": [],         // optional: playoff days kept out of the table
    "promotion_restricted": [254]      // teams shown greyed (not eligible to promote)
  }
}
```

Only touch this file to **add a league/season**, to fix a `league_display` rename, or to
exclude playoff gamedays (e.g. DKB DFFL Final 8 = 887, 888). Never list regular Spieltage
by hand — that was the old `gameday_ids` design and it silently froze the table whenever
a new Spieltag appeared.

The widget matches a league's table via `gameday.phase === entry.name` (`widget.html:1173`),
so `name` must stay stable while a season is running.

## Widget URL parameters

| Param | Default | Effect |
|-------|---------|--------|
| `t` | — | Team ID (repeatable: `&t=159&t=287`) |
| `color` | `ff4500` | Accent color (hex, no #) |
| `past` | `3` | Visible past gamedays before collapse |
| `future` | all | Max upcoming gamedays shown |
| `show_past` | `1` | `0` hides past section entirely |
| `show_future` | `1` | `0` hides future section entirely |
| `title` | `1` | `0` hides team title |
| `compact` | `0` | `1` enables compact layout |

Example: `widget.html?t=159&color=ffab00&past=5&compact=1`

Known team IDs: Nürnberg Renegades = **159**, Nürnberg Renegades II = **287**

## Regenerating snapshot.json

```bash
# Full rebuild (~5 min): fetches all 734 gamedays fresh
node _gen_snapshot.js

# Rebuild mode (~15 min): keeps existing gameday data, re-fetches play-by-play + team names
node _gen_snapshot.js --rebuild

# Live mode (seconds): refetches only today's gamedays' games + logs; no-op if no
# gameday today or outside 6-20 Uhr Berlin time (run by update-snapshot-live.yml every 5 min)
node _gen_snapshot.js --today

# Manual catch-up: refetch gamedays from the last N days (ignores the time-of-day gate)
node _gen_snapshot.js --today --days=3

# Offline (instant): re-tag phases + recompute standings from the existing snapshot,
# no network. Use after editing league-config.json.
node _gen_snapshot.js --recompute
```

`--rebuild` is used when the play-by-play parsing logic changes or new past games need logs added.
Full run is used when new gamedays appear (normally done by GitHub Actions daily).
`--today` is used for live score polling during active gamedays (done by GitHub Actions every 5 min).

## Coding rules
- Pure vanilla HTML/CSS/JS — no build step, no frameworks, no npm
- Security: always use `escapeHtml()` before inserting user/API data into innerHTML
- Regex in `_gen_snapshot.js`: use `.matchAll()` not `.exec()` — a security hook blocks exec calls
- `CACHE_VERSION` in widget.html: bump when localStorage schema changes (currently `3`)