# Design: Live Ticker View (`?view=live`)

**Date:** 2026-05-30
**Status:** Approved

---

## Overview

A new `?view=live` mode added to the existing `widget.html`. When embedded with this parameter, the widget shows real-time play-by-play events for watched teams' active games, polled live from the LeagueSphere liveticker API. When no watched team is currently live, it falls back to showing the next upcoming game.

---

## URL Parameters

No new parameters. Uses the same `?t=` (team IDs) and `?color=` (accent) as the existing spielplan view.

```
widget.html?view=live&t=159&t=287&color=ff4500
```

---

## Architecture & Data Flow

```
widget.html?view=live&t=159&t=287
  │
  ├─ loadSnapshot()           (singleton — same promise as spielplan)
  │    └─ teams[].name        → build teamId→name map for side identification
  │    └─ gamedays[active]    → collect game IDs for watched teams
  │
  ├─ Active game IDs found?
  │    YES → fetch full history: GET /api/liveticker/?getAllTicksFor=<gameId>
  │           (one call per watched game currently in progress)
  │    NO  → render upcoming fallback via renderUpcomingFallback()
  │
  └─ startLivePolling()   (setInterval, 5 s)
       └─ GET https://leaguesphere.app/api/liveticker/   (no filter params)
            └─ filter: game.gameId ∈ watched game IDs
            └─ diff ticks with fingerprint set (text + '|' + time)
            └─ append new ticks, update score/status cells in DOM
```

**Active game ID discovery:** `loadSnapshot()` → filter `snap.gamedays` to those containing games where `results[].team_id` matches a watched team ID and `classifyGameday()` returns `'active'`. Collect all `game.id` values from those gamedays.

**Team-side identification:** `snap.teams.find(t => t.id === teamId).name` compared against `game.home.name` and `game.away.name` (exact string match). The watched team always renders in the **left column** regardless of actual home/away status; the opponent goes in the right column.

---

## Components

### `renderLiveView(root, cfg)`
Top-level orchestrator, called from the existing `init` block when `cfg.view === 'live'`. Responsibilities:
1. Load snapshot, build active game ID set for watched teams
2. If no active games: call `renderUpcomingFallback()` and return
3. For each active game: fetch full tick history via `getAllTicksFor`, populate `_liveGames`
4. Render initial B3 layout for each game (stacked, top-to-bottom)
5. Call `startLivePolling()`

### `renderLiveGameB3(gameState)`
Renders a single live game as a two-column table. Called on first load and when ticks or score change.

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ● LIVE   Spieltag 12 · RL Bayern   1. HZ   │
├──────────────┬──────────┬───────────────────┤
│ Nürnberg     │  14 : 7  │    Erlangen       │
│ Renegades    │ 1. HZ    │    Sharks         │
│ (orange)     │ 🏈 REN   │    (neutral)      │
├──────────────┼──────────┼───────────────────┤
│ 🏈 TD: #12  │  14:7    │                   │  ← scoring row (highlight bg)
│ +1: #7      │          │                   │
├──────────────┴──────────┴───────────────────┤
│          ── Halbzeit ──                     │  ← neutral center row
├──────────────┬──────────┬───────────────────┤
│              │   7:7    │ 🏈 TD: #5         │  ← opponent scoring
│              │          │ First Down: #23   │
└──────────────┴──────────┴───────────────────┘
```

- Left column: watched team events (text-align right), accent color label
- Center column: score-at-event (for scoring rows), blank otherwise
- Right column: opponent events (text-align left), neutral color label
- Neutral game events (`Halbzeit`, `Spiel gestartet`, `Spielzeit - M:SS`, `Auszeit - M:SS`): full-width center-spanning row, muted italic style
- Scoring events (`Touchdown`, `Extra-Punkt`, `Extra-Punkte`): subtle background highlight
- All event types shown (no filtering)

### `renderUpcomingFallback(teamId, snap)`
Shown when no live games detected for a watched team. Finds the earliest active gameday from snapshot for that team and renders it via the existing `renderGamedayCard(gd, games, teamId, false)`. Topped by a small label: `"Kein Live-Spiel — nächstes Spiel:"`.

---

## State

```js
var _liveGames = {};     // gameId → gameState
var _liveInterval = null;

// gameState shape:
{
  gameId,
  homeName, awayName,      // strings from liveticker API
  watchedSide,             // 'home' | 'away'
  score: { home, away },
  status,                  // e.g. "1. Halbzeit"
  possession,              // 'home' | 'away' | null
  ticks: [],               // all ticks, newest-first
  seenFingerprints: Set    // composite key: text + '|' + time
}
```

---

## Polling Loop

- **Interval:** 5 seconds (`setInterval`)
- **Endpoint:** `GET https://leaguesphere.app/api/liveticker/` (no params)
- **Filter:** `game.gameId` must be in `_watchedGameIds` (Set built during init)
- **Tick deduplication:**
  - Primary: fingerprint `text + '|' + time` checked against `seenFingerprints`
  - Guard: if API returns more ticks than `seenFingerprints.size`, extras appended in order (handles identical-fingerprint events, e.g. two First Downs same minute)
- **DOM updates:** targeted — only score cell and ticks `<tbody>` replaced on change; score cell gets a brief CSS flash animation on score change
- **New game mid-session:** if poll returns a `gameId` not in `_liveGames`, fetch full history via `getAllTicksFor`, add to state, append new game block to DOM
- **Game over:** when `status === 'Beendet'` for all watched games, `clearInterval(_liveInterval)` and do a final static render

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Poll request fails (transient) | Silent — retry next interval |
| 3 consecutive poll failures | Show `"⚠ Verbindung unterbrochen"` banner above ticker; clear on next success |
| `getAllTicksFor` fetch fails | Fall through to incremental-only mode (last 5 ticks from first regular poll) |
| Snapshot load fails | Standard `error-banner` (same as spielplan) |
| No watched team in active gamedays | Render upcoming fallback immediately |
| All watched games finish | Clear interval, final static render of completed scores |

---

## Security

All strings sourced from the liveticker API (`team.name`, `tick.text`, `tick.time`, `game.status`) pass through `escapeHtml()` before any `innerHTML` insertion. No exceptions.

---

## Testing

New file: `tests/liveticker.test.js`

| Test | What it checks |
|---|---|
| XSS — team name | `<script>` in team name does not appear unescaped in `renderLiveGameB3` output |
| XSS — tick text | `<img onerror=...>` in tick text does not execute |
| Deduplication | Same fingerprint tick not added twice |
| Dedup guard | Two events with identical fingerprint both appear when array length increases |
| Team-side (home) | Watched team on home side → appears in left column |
| Team-side (away) | Watched team on away side → appears in left column |
| Fallback render | `renderUpcomingFallback` produces output when no live games |
| Game-over cleanup | Interval cleared when all games reach `'Beendet'` |

---

## Out of Scope

- League slug URL param (`?league=`) — not needed; client-side filtering by game ID is sufficient
- Push notifications or WebSocket — polling is adequate given the API's polling-friendly design
- Persisting tick history in localStorage — in-memory only; reload fetches fresh history
- Score change push to parent frame — beyond current postMessage height reporting
