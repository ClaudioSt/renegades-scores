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

**League hierarchy (men's, Bavaria):**
```
FF BL (Flag Football Bayern-Liga — Oberliga / Bayernliga level, ~14 teams)
  ↓ promotion via Aufstiegsrelegation
RL Bayern (Regionalliga Bayern — 8 teams in 2026)
  ↓ promotion via Aufstiegsrelegation
DFFL2 (Deutsche Flag Football Liga 2 — national, 20 teams)
  ↓ top 3 of Final6
DKB DFFL (Deutsche Flag Football Liga — national top tier, 16 teams, Final8)
```
Note: Ligaordnung groups "RL Bayern + Bayernliga (FF BL)" together for promotion slot allocation.
- Each Spieltag is a tournament day where teams play 2–5 games of ~60 min
- Nürnberg Renegades = team ID 159 (DKB DFFL), Renegades II = team ID 287 (FF BL)

**FF BL 2026 — confirmed data (researched 2026-05-27):**
- 14 teams, 5 gameday events (IDs: 832, 834, 842, 844, 845)
- Teams: Bamberg Phantoms (29), Ingolstadt Guardians (152), Ramsenthal RedWings (221), AFC Königsbrunn Ants (223), Munich Spatzen 4 (254), Nürnberg Renegades II (287), Rödental Racoons (391), Ingolstadt Guardians 2 (392), Erlangen Sharks 2 (393), Erding Bulls II (492), Neumarkt Wolves (500), Ramsenthal RedWings II (501), Neustadt Falcons (502), Regensburg Phoenix III (505)
- Promotion-blocked teams (parent club has team in RL Bayern, per §28.3 Ligaordnung):
  - Munich Spatzen 4 (254) — Spatz3 (66) is in RL Bayern
  - Erding Bulls II (492) — Erding Bulls (160) is in RL Bayern
  - Regensburg Phoenix III (505) — Regen2 (288) is in RL Bayern
- NOT blocked: Nürn2 (287) — Nürn1 (159) skips RL and is in DKB DFFL directly
- NOT blocked: Erlangen2, Ingol2, Ramsenthal2 — no sibling in RL Bayern

**Standings formula (Ligaordnung 2026, confirmed):**
- Metric: **Wertungspunktequotient (SQ)** = (2×W + 1×D) / (2×Sp)
- Columns: SQ (win quotient), EP (points scored), GP (opponent points), PD (point diff), S (wins), U (draws), N (losses), Sp (games played)
- Promotion restriction rule (§28.3): a team is ineligible for the Aufstiegsrelegation if another team from the same Verein is already qualified for the next higher league
- For DFFL2 Final6 (§25.3): teams with "II" suffix can participate but are not aufstiegsberechtigt
- `league-config.json` must store `promotion_restricted` team IDs per season (manually maintained, cannot be derived automatically)

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
