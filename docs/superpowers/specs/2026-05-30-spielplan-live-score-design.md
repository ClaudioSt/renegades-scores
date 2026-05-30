# Design: Spielplan Live Score + Clickable Live Row

**Date:** 2026-05-30
**Status:** Approved

---

## Overview

Three related enhancements to the existing `?view=spielplan` (default) widget:

1. **Live game banner as link** — when `?live_url=` is set, the live game rectangle becomes a clickable link to the configured URL (e.g. the team's live-ticker embed page).
2. **30-second score polling** — while any watched team has a live game, poll `/api/liveticker/` every 30s and update the displayed score in-place.
3. **Today's gameday splitting** — games on today's gameday are rendered by individual status: finished games appear in the past section with score, upcoming games appear in the future section with time only, live games appear in the live banner.

---

## URL Parameter

| Param | Default | Effect |
|---|---|---|
| `live_url` | absent | Base URL for live game links. When absent, no link behavior. |

**Validation:** Only `http://` and `https://` URLs are accepted. Any other value (including `javascript:`, empty string, relative paths) is silently ignored.

**Example:**
```
widget.html?t=159&live_url=https%3A%2F%2Frenegades.de%2Flive
```

Added to `parseConfigFromSearch` as `liveUrl: ''` (default empty string).

---

## Architecture & Data Flow

```
loadTeam(teamId, els, cfg)
  │
  ├─ fetch activeEntries (fetchGamedayDetail + fetchGames per active id)
  │
  ├─ today's gameday? → split games by status per teamId:
  │     live     → renderLiveBanner()  →  els.live
  │     beendet  → prepend to past section (with score)
  │     other    → future section (time only, no score)
  │
  ├─ non-today active entries → future section (unchanged)
  │
  └─ any live games found?
       YES → startSpielplanPolling(liveGameIds)
       NO  → nothing
```

**Today detection:** `e.gd.date === today` where `today = new Date().toISOString().slice(0,10)`.

---

## Components

### `parseConfigFromSearch` change

Add:
```js
var liveUrl = params.get('live_url') || '';
if (liveUrl && !/^https?:\/\//.test(liveUrl)) liveUrl = '';
return { ..., liveUrl: liveUrl };
```

---

### `renderLiveBanner(game, gd, teamId, liveUrl)` — modified

**Score element gets an ID** so polling can update it in-place:
```
id="sp-live-score-<game.id>"
```

**When `liveUrl` is set:**
- The outer `<div class="live-banner">` becomes `<a class="live-banner" href="<liveUrl>" target="_blank" rel="noopener noreferrer">`
- CSS adds hover style: `cursor: pointer; box-shadow: inset 3px 0 0 var(--accent); background: rgba(255,69,0,0.08)`
- No visible button text — the rectangle is the link

**When `liveUrl` is absent:**
- Renders exactly as today (no change to markup or behaviour)

---

### `loadTeam` — today's gameday splitting

After building `activeEntries`, before rendering:

```
for each e in activeEntries where e.gd.date === today:
  forTeam = e.games filtered to teamId's games

  liveGames     = forTeam where status === 'live'
  finishedGames = forTeam where status === 'beendet'
  upcomingGames = forTeam where status !== 'live' && !== 'beendet'

  liveGames     → renderLiveBanner (existing path)
  finishedGames → rendered via renderGamedayCard(e.gd, finishedGames, teamId, true)
                  prepended to pastSorted before rendering past section
  upcomingGames → included in futureEntries as { gd: e.gd, games: upcomingGames }
                  (replaces the full e.games for this entry in the future section)
```

**Caching behaviour:**
- Today's gameday stays in `cache.active_ids` until ALL its games are `beendet`
- Once fully finished it is promoted to `cache.past` on the next load (existing logic unchanged)
- Today's finished games are not permanently cached mid-day — they are re-fetched fresh each page load via `fetchGames(id)`

---

### `startSpielplanPolling(newGameIds)` — new function

```js
var _spielplanPollInterval = null;
var _spielplanLiveIds = new Set();   // shared across all team loadTeam calls

function startSpielplanPolling(newGameIds) {
  // newGameIds: Set or Array of game IDs (numbers)
  // Called once per team — merges IDs into shared set, starts interval only once
  newGameIds.forEach(function(id) { _spielplanLiveIds.add(id); });
  if (_spielplanPollInterval) return;   // already running, IDs added above

  function poll() {
    fetchJSON(LIVETICKER_API).then(function(data) {
      data.forEach(function(game) {
        if (!_spielplanLiveIds.has(game.gameId)) return;
        var el = document.getElementById('sp-live-score-' + game.gameId);
        if (el) el.textContent = game.home.score + ' : ' + game.away.score;
        if (game.status === 'Beendet') _spielplanLiveIds.delete(game.gameId);
      });
      if (_spielplanLiveIds.size === 0) {
        clearInterval(_spielplanPollInterval);
        _spielplanPollInterval = null;
      }
    }).catch(function() { /* silent — retry next tick */ });
  }

  _spielplanPollInterval = setInterval(poll, 30000);
}
```

**No immediate first call** — score at page load already comes from fresh `fetchGames`. Polling only updates deltas.

**Multi-team safety:** `loadTeam` is called in parallel for each team. Each call invokes `startSpielplanPolling` with its own live game IDs. The shared `_spielplanLiveIds` Set accumulates all IDs; the interval starts only once.

---

## CSS additions

```css
/* live-banner as link */
a.live-banner {
  display: flex;
  text-decoration: none;
  color: inherit;
}
a.live-banner:hover {
  cursor: pointer;
  box-shadow: inset 3px 0 0 var(--accent);
  background: rgba(255, 69, 0, 0.08);
  transition: background 0.15s;
}
```

---

## State

New module-level variables:
```js
var _spielplanPollInterval = null;   // setInterval handle for spielplan live polling
var _spielplanLiveIds      = new Set(); // game IDs currently being polled (shared across teams)
```

Existing `_liveInterval` and `_watchedGameIds` (used by `?view=live`) are unaffected.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `live_url` fails validation | Silently ignored; no link behaviour |
| Poll request fails | Silent — retry on next 30s tick |
| Game ID disappears from liveticker mid-poll | Ignored (no DOM update, no error) |
| Today's gameday has no team games | No change — existing path handles this |

No error banner for poll failures in spielplan (unlike `?view=live`) — the score just stops updating. The widget still shows the last known score.

---

## Security

- `live_url`: regex-validated `^https?:\/\/` before any use as href. Value inserted as a DOM attribute via `escapeHtml()`.
- All team names, game names, scores from API: already through `escapeHtml()` in existing render functions.
- `rel="noopener noreferrer"` on all `target="_blank"` links.

---

## Testing

New test cases in `tests/spielplan-live.test.js`:

| Test | What it checks |
|---|---|
| `live_url` with `javascript:` → ignored | No `href` set on banner |
| `live_url` with `http://` → accepted | `<a>` wrapper with correct `href` |
| `live_url` absent → no link | Banner renders as `<div>`, not `<a>` |
| `renderLiveBanner` with liveUrl | Outer element is `<a>`, has `rel`, `target` |
| `renderLiveBanner` without liveUrl | Outer element is `<div>` |
| Today's beendet game → past section | `showScore=true`, final score visible |
| Today's upcoming game → future section | `showScore=false`, time visible |
| Today's live game → live banner | Separate from past/future |
| Same gameday: mixed statuses split correctly | Each game in correct section |
| `startSpielplanPolling` updates score element | DOM element updated on poll tick |
| `startSpielplanPolling` stops when all beendet | `clearInterval` called |
| Double-start guard | Second call to `startSpielplanPolling` does not start a second interval |
| Multi-team merge | Two calls with different game ID sets → both IDs polled by single interval |

---

## Out of Scope

- Tick-by-tick play-by-play in spielplan view — that is `?view=live`
- Score flash animation on update — YAGNI for 30s polling cadence
- New-game-mid-session detection in spielplan — only `?view=live` handles this
- Persisting today's finished game data in localStorage — re-fetched fresh each load
