# Design: Widget Restructure — DataStore + Three Views

**Date:** 2026-05-31
**Status:** Approved

---

## Overview

Restructures `widget.html` around a shared `DataStore` singleton that owns all polling. The three views (`spielplan`, `table`, `live`) become pure subscribers that react to DataStore events rather than each managing their own data fetching. Eliminates the entire localStorage discovery/cache layer (~400 lines removed, ~80 added).

---

## 1. Architecture: DataStore Singleton

A single vanilla-JS object added to the top of `widget.html`. All polling logic lives here; views only subscribe.

### State

```js
var DataStore = {
  snapshot: null,                  // full snapshot.json once loaded
  liveScores: {},                  // gameId → { home, away } — ticker-derived
  ticks: {},                       // gameId → Tick[] (oldest-first)
  _mode: 'watching',               // 'watching' | 'live'
  _interval: null,
  _subscribers: {},                // event → [fn, ...]
  _watchedGameIds: new Set(),      // game IDs for the selected teams
};
```

### Polling State Machine

```
WATCHING (30 min poll)
  → ticks found for any watched game → switch to LIVE

LIVE (5 s poll)
  → "Spiel beendet" tick + no more live games → switch back to WATCHING
```

- In **WATCHING** mode: poll fires, no ticks found → emit nothing, stay in WATCHING.
- In **LIVE** mode: emit `game-score-update` + `ticks-update` on every cycle.
- Transition between modes clears the old interval and starts a new one immediately.

### API

```js
DataStore.init(cfg)              // load snapshot, discover watched game IDs, start WATCHING poll
DataStore.subscribe(event, fn)   // register listener
DataStore.emit(event, data)      // internal — fires all listeners for event
```

### Events

| Event | Payload | When |
|---|---|---|
| `'snapshot-loaded'` | snapshot object | once, on init |
| `'game-score-update'` | `{ gameId, homeScore, awayScore }` | LIVE mode, each 5 s cycle when score changed |
| `'ticks-update'` | `{ gameId, newTicks[] }` | LIVE mode, each 5 s cycle when new ticks arrived |
| `'game-finished'` | `{ gameId }` | "Spiel beendet" tick detected |

### Key rules

- **30 min poll is for detection only** — when no game is live, poll checks if ticks appear. Nothing is emitted until a game goes live.
- **`game-score-update` is ticker-derived** — score accumulated from tick events, never from the gameday API. Liveticker always wins.
- **No separate gameday API poll** — `/api/gamedays/{id}/games/` is eliminated from the browser. Snapshot covers historical data; ticker covers live data.
- **`watchedGameIds`** populated from `DataStore.snapshot.gamedays` on init — all `game.id` values where `results[].team_id` matches a watched team and `classifyGameday()` returns `'active'`.

---

## 2. Snapshot Schema

No new fields. Minimal generator change only.

### Game object by status

| Field | `Beendet` | `live` | `scheduled` (new) |
|---|---|---|---|
| `id` | ✓ | ✓ | ✓ |
| `status` | `'Beendet'` | `'live'` | `'scheduled'` |
| `scheduled` | `"10:00"` | `"10:00"` | `"10:00"` |
| `field` | `"Feld 1"` | `"Feld 1"` | `"Feld 1"` or `""` |
| `final_score` | `"14:7"` | `null` / partial | `null` |
| `halftime_score` | `"7:0"` | `null` / partial | `null` |
| `results[].pa` | points scored | stale / 0 | `0` |
| `log` | `{ l, r, ev[] }` | partial / absent | absent |

### Changes to `_gen_snapshot.js`

1. **Include all gamedays** — write all gamedays from the API to output regardless of game status. Currently future gamedays may be dropped if they have no completed games.
2. **Skip log scrape for non-finished games** — explicit guard: only fetch play-by-play HTML when `game.status === 'Beendet'`. Avoids fetching empty HTML for scheduled/live games.
3. **Future game `results[]`** — the API returns team info for scheduled games. Ensure `results[]` is written with `team_id`, `team_name`, `isHome`, `pa: 0`. No `log` field.

### Table grouping (no config needed)

Leagues are auto-detected from `league_display` + year extracted from `gameday.date`. Phase names still come from the `phase` field (tagged by `league-config.json` as today). Basic table works without `league-config.json`; phase sub-tabs appear only when `phase` is set.

---

## 3. The Three Views

### Event → reaction matrix

| Event | Spielplan | Table | Live |
|---|---|---|---|
| `snapshot-loaded` | Full initial render (past + future sections) | Full initial render (standings + fixtures) | Store only — no render |
| `game-score-update` | Update `#score-{gameId}` in-place | Recompute `#row-{teamId}`, toggle ⚡ badge | — (score shown via ticks) |
| `ticks-update` | — | — | First tick → create game card. Subsequent → prepend tick rows to `#lt-game-{gameId}` |
| `game-finished` | Freeze score, remove LIVE badge | Freeze standings row, remove ⚡ | Remove game card from DOM |

### Spielplan (`?view=spielplan`)

- **Past:** Collapsed behind "Weitere laden" — unchanged.
- **Today's gameday games:** Games on today's active gameday branch on `game.status`:
  - `'scheduled'` → render time + teams only, no score cell
  - `'live'` → stable `id="score-{gameId}"` on score cell, LIVE badge; score updated via `game-score-update`
  - `'Beendet'` → final score shown, no LIVE badge
- **Upcoming scheduled (future dates):** Render time + teams; no score box.
- **Next-game highlight card:** Unchanged (existing).
- **No separate "🔴 Live jetzt" section** — live state shown inline within the normal game row. `renderLiveBanner()` and `els.live` DOM section removed.

### Table (`?view=table`)

- **League tabs:** Auto-built from `Set` of `league_display` values across all watched team's gamedays for the current year. One tab per unique `league_display`. Phase sub-tabs appear inside a tab when `phase` is set.
- **Standings computation:** `W/L/D/SQ/EP/GP` computed client-side from `results[].pa` for `Beendet` games. For `live` games: overlay `DataStore.liveScores[gameId]` when present (updated every 5 s).
- **Row IDs:** Each team row gets `id="row-{teamId}"` for targeted recomputation on `game-score-update`.
- **⚡ live badge:** Added to team name cell when a `game-score-update` arrives for that team. Removed on `game-finished`.
- **Watched team highlight:** Unchanged (existing).
- **Scheduled fixtures:** Shown below the standings table as upcoming rows (not counted in standings).

### Live (`?view=live`)

- **On load:** No initial card render. DataStore stores snapshot data but does not render game cards. Displays a simple empty state: `"Kein Live-Spiel gerade."` — no upcoming fixture card (that belongs in Spielplan).
- **First `ticks-update`:** Create game card from tick data. Replace empty state.
- **Subsequent `ticks-update`:** Prepend new tick rows, newest at top. Score accumulated from ticks (existing `buildTickRows` logic).
- **`game-finished`:** Remove game card from DOM. If no more live games, restore empty state.
- **Polling:** Entirely managed by DataStore. `renderLiveView` only calls `DataStore.subscribe()`.

---

## 4. Dead Code Removed from `widget.html`

~400 lines removed. DataStore absorbs the entire discovery/caching layer.

### Discovery & caching layer (~280 lines)

| Symbol | Lines | Reason |
|---|---|---|
| `loadTeam()` | ~143 | Replaced by DataStore.init() + subscriptions |
| `quickRenderFromSnap()` | ~25 | DataStore.snapshot is source of truth |
| `quickRenderFutureFromSnap()` | ~12 | Same |
| `discoverNewGamedays()` | ~45 | Snapshot includes all gamedays — no discovery |
| `fetchNewGamedays()` + `_newGamedaysPromise` | ~22 | Called only by discoverNewGamedays |
| `loadCache / saveCache / clearCache / cacheKey` | ~25 | localStorage discovery cache removed |
| `needsDiscovery()` | ~6 | No discovery step |
| `DISCOVERY_TTL_MS / CACHE_VERSION / BATCH_SIZE` | 3 | Constants for removed systems |

### API helpers made redundant (~27 lines)

| Symbol | Reason |
|---|---|
| `fetchGames()` | Only called by discoverNewGamedays / loadTeam |
| `fetchGamedayDetail()` | Same |
| `batchedAll()` | Only used by discoverNewGamedays |
| `fingerprintGames()` | Change-detection for discovery, now redundant |
| `splitTodayGames()` | Only used in loadTeam |

### Live polling variables (moved into DataStore)

`_liveInterval`, `_liveGames`, `_liveFailCount`, `_watchedGameIds`, `_liveTeamNames`, `_liveSnap`, `_spielplanPollInterval`, `_spielplanLiveIds`, `_futureCache`, `_pastCache` (pagination now reads `DataStore.snapshot` directly)

### UI helpers removed (~65 lines)

| Symbol | Reason |
|---|---|
| `startSpielplanPolling()` + `startLivePolling()` | Replaced by DataStore._poll() |
| `renderLiveBanner()` | Spielplan shows live scores inline; no banner section |
| `renderUpcomingFallback()` | Live view shows empty state only |
| `LIVETICKER_BASE` / `liveUrl` URL param | Only used by renderLiveBanner |

### Note: `classifyGameday()`

Still needed for Spielplan and Table initial render (past/future classification from snapshot). Keep it.

---

## 5. Files Touched

| File | Change |
|---|---|
| `widget.html` | Major: add DataStore (~80 ln), update 3 view renderers, remove ~400 ln dead code |
| `_gen_snapshot.js` | Medium: include future gamedays, guard log scrape on status |
| `league-config.json` | No change |
| `tests/unit.test.js` | Add DataStore state machine tests, _deriveScore, league tab grouping; remove discovery cache tests |
| `tests/standings.test.js` | Add live score overlay recomputation |
| `tests/snapshot.test.js` | Add: future games present with correct null fields |

---

## Out of Scope

- `generator.html` — no changes needed (view selector already added in Phase 6)
- Multiple simultaneous views in one embed — each iframe URL is one view
- Server-side logic — remains GitHub Pages static only
- Play-by-play for live games in Spielplan/Table — only the score updates; full log remains in the completed game's collapsible detail
