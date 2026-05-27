# Renegades Scores Widget

## What This Is

Embeddable score widget for American Flag Football teams, served via GitHub Pages. Reads a daily pre-built `snapshot.json` and renders a team's schedule, results, and standings inside an iframe. Being extended from a single-view schedule widget to a multi-view widget supporting Spielplan (enhanced), Tabelle (standings), and Live (future).

## Core Value

Existing embeds on external sites must never break — backwards compatibility is non-negotiable.

## Requirements

### Validated

- ✓ Embeddable iframe widget (`widget.html`) with URL params (`t`, `color`, `past`, `future`, `show_past`, `show_future`, `title`, `compact`) — existing
- ✓ Daily snapshot generation via `_gen_snapshot.js` + GitHub Actions (3 AM UTC) — existing
- ✓ Play-by-play game logs fetched server-side and stored in snapshot — existing
- ✓ LocalStorage caching (CACHE_VERSION=3, 7-day discovery TTL) — existing
- ✓ Multi-team support via repeatable `&t=` params — existing
- ✓ Score display for past/active/future games with visual states — existing
- ✓ `postMessage` height reporting to parent iframe — existing
- ✓ Admin generator tool (`generator.html`) for embed code creation — existing
- ✓ XSS protection via `escapeHtml()` before all innerHTML insertions — existing
- ✓ Test suite (unit, security, snapshot tests) — existing

### Active

- [ ] `view=` URL parameter added to `parseConfigFromSearch()` (default: `spielplan`)
- [ ] `view=spielplan` enhanced: "Weitere laden" pagination (3 past gamedays per click), next-game highlight card
- [ ] `view=table`: league standings per phase with phase selector (tabs/dropdown); current team row highlighted
- [ ] `league-config.json`: manually maintained file mapping gameday IDs to phase names per league+season
- [ ] `snapshot.json` extended with `standings` block per team (computed from game results by `_gen_snapshot.js`)
- [ ] `_gen_snapshot.js` extended to compute standings and tag gamedays with phases from `league-config.json`
- [ ] `generator.html` updated with `view=` selector
- [ ] DKB DFFL and FF BL (Flag Football Bayern-Liga) supported as first-class leagues in standings

### Out of Scope

- `view=live` — live polling ticker — deferred to v2; live standings only available during active gamedays (API endpoint unverified), complex polling logic
- External backend or server-side rendering — GitHub Pages is static-only
- Build step, frameworks, npm dependencies — vanilla JS/HTML constraint

## Context

**League structure:**
- DFFL = Deutsche Flag Football Ligen. Each Spieltag is a tournament day where teams play 2–5 games of ~60 min.
- DKB DFFL: top-tier national men's league (Final8 playoff format)
- FF BL: Flag Football Bayern-Liga (Bavarian state league)
- DFFL Süd-Ost: regional league (feeds into DFFL2 via promotion playoffs)
- Season phases: Gruppenphase → Playoffs (exact phase names vary per league, e.g. "Vorrunde", "Finale")
- Nürnberg Renegades = team ID 159, Renegades II = team ID 287

**Standings computation:**
- Standings for completed games are derived from existing game results in `snapshot.json` — no new API endpoint needed
- Live/in-progress standings (during an active gameday) require API verification — out of scope for v1
- Tables differ by season and league, so `league-config.json` maps gameday IDs to phases per `"{league} / {year}"` key

**Codebase:**
- `widget.html`: self-contained HTML+CSS+JS (708 lines), renders inside iframe
- `_gen_snapshot.js`: Node.js CLI, fetches and normalizes all LeagueSphere data
- Play-by-play HTML has no CORS header — must remain server-side only
- `snapshot.json` is ~2.9 MB raw / ~560 KB gzipped via GitHub Pages

## Constraints

- **Stack**: Pure vanilla HTML/CSS/JS — no build step, no frameworks, no npm production deps
- **Hosting**: GitHub Pages static only — no server-side logic
- **CORS**: Play-by-play HTML must be fetched in `_gen_snapshot.js`, never in browser
- **Backwards compat**: All existing `?t=159&...` embeds must continue working without changes
- **Security**: `escapeHtml()` before all innerHTML; `.matchAll()` not `.exec()` in `_gen_snapshot.js`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `view=` defaults to `spielplan` | Backwards compatible with all existing embeds | — Pending |
| Standings computed from game results in snapshot | No verified standings API endpoint; game data already present | — Pending |
| `league-config.json` is manually maintained | Phase boundaries differ per league/year; no machine-readable source | — Pending |
| `view=live` deferred to v2 | Live API only available on gameday, endpoint unverified, high complexity | — Pending |
| DKB DFFL + FF BL as priority leagues | These are the leagues the Renegades actively compete in | — Pending |

---
*Last updated: 2026-05-27 after initialization*
