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
| `.github/workflows/update-snapshot.yml` | Daily refresh at 3 AM UTC (5 AM CEST) |

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
    games: [{
      id, status, stage, standing, scheduled, field,
      final_score, halftime_score,
      results: [{ team_id, team_name, pa, isHome }],
      log?: { l, r, ev: [{b?} | {l?, lx?, r?, rx?, s?}] }
    }]
  }]
}
```

`pa` = **points against** (what the opponent scored). Win = `me.pa < other.pa`.

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
```

`--rebuild` is used when the play-by-play parsing logic changes or new past games need logs added.
Full run is used when new gamedays appear (normally done by GitHub Actions daily).

## Coding rules
- Pure vanilla HTML/CSS/JS — no build step, no frameworks, no npm
- Security: always use `escapeHtml()` before inserting user/API data into innerHTML
- Regex in `_gen_snapshot.js`: use `.matchAll()` not `.exec()` — a security hook blocks exec calls
- `CACHE_VERSION` in widget.html: bump when localStorage schema changes (currently `3`)