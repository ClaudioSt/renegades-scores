# Live Ticker: Newest-First Ordering + Cleanup

**Date:** 2026-05-30

## Summary

Three changes to the live ticker widget (`renderLiveView` / `buildTickRows`):

1. Display plays newest-first (most recent at top)
2. Remove the gameday name from the ticker header
3. Treat a "Spiel beendet" tick as equivalent to `status === 'Beendet'` — remove the game from the DOM immediately

---

## 1. Tick State: Oldest-First (Option B)

### Current state

`gs.ticks` is stored **newest-first** (API order preserved). `buildTickRows` reverses it to oldest-first for score accumulation, then renders oldest→newest (oldest play at top).

### Change

Store `gs.ticks` **oldest-first** so `buildTickRows` can iterate directly for score accumulation, then reverse the rendered rows for newest-at-top display.

**Two initialization sites** — both return `game.ticks.slice()` which is newest-first (API order). Change to:

```js
ticks: game.ticks.slice().reverse()   // now oldest-first
```

Locations:
- `renderLiveView` (~line 1210): initial load via `getAllTicksFor`
- Mid-session new-game detection (~line 1102): same pattern

**Poll insertion** (~line 1033) — change `unshift` to `push`:

```js
gs.ticks.push(tick);   // append to end, maintaining oldest-first order
```

**`buildTickRows`** (~line 348):

```js
function buildTickRows(gs) {
  var ourName  = gs.watchedSide === 'home' ? gs.homeName : gs.awayName;
  var oppName  = gs.watchedSide === 'home' ? gs.awayName : gs.homeName;
  var runScore = { home: 0, away: 0 };
  // gs.ticks is now oldest-first — iterate directly for correct score accumulation
  return (gs.ticks || []).map(function(tick) {
    // ... same row-building logic unchanged ...
  }).reverse().join('');   // reverse result: newest row at top
}
```

The `ordered` variable and its `.reverse()` call are removed. The final `.reverse()` flips the display order without affecting score accumulation.

---

## 2. Remove Gameday Name from Header

In `renderLiveGameB3`, remove the `lt-gd-name` span from the `lt-header`:

```js
// Remove this line:
+   '<span class="lt-gd-name">' + escapeHtml(gs.gamedayName) + '</span>'
```

Also remove the `.lt-gd-name` CSS rule (unused after this change).

The `gamedayName` field on `gs` can stay — removing it would require touching all initialization sites for no benefit.

---

## 3. "Spiel beendet" Tick = Game Over + DOM Removal

### Current behavior

`status === 'Beendet'` (from API) stops the polling interval but leaves the game card in the DOM.

### Change

Extract a `finishGame(gs)` helper that:

1. Removes `#lt-game-{gameId}` from the DOM
2. `delete _liveGames[gs.gameId]`
3. Checks if `Object.keys(_liveGames).length === 0` → clears `_liveInterval`

This helper is called from two trigger paths in the poll loop:

**Path A — API status:**
```js
if (game.status === 'Beendet') {
  finishGame(gs);
}
```

**Path B — "Spiel beendet" tick (new):**
After accumulating new ticks, check:
```js
if (gs.ticks.some(function(t) { return t.team == null && t.text === 'Spiel beendet'; })) {
  finishGame(gs);
}
```

Both paths short-circuit (no further DOM update for this game after `finishGame`).

### `finishGame` implementation sketch

```js
function finishGame(gs) {
  var el = document.getElementById('lt-game-' + gs.gameId);
  if (el) el.parentNode.removeChild(el);
  delete _liveGames[gs.gameId];
  if (Object.keys(_liveGames).length === 0 && _liveInterval) {
    clearInterval(_liveInterval);
    _liveInterval = null;
  }
}
```

---

## Affected Code Locations

| Location | Change |
|---|---|
| `buildTickRows` ~L348 | Remove `ordered`/`.reverse()`, add `.reverse()` on result |
| `renderLiveView` ~L1210 | `game.ticks.slice()` → `.slice().reverse()` |
| Mid-session new-game ~L1102 | same |
| Poll loop tick insertion ~L1033 | `unshift` → `push` |
| Poll loop finish check ~L1067 | Replace inline logic with `finishGame(gs)` |
| Poll loop (new) | Check "Spiel beendet" tick after accumulation |
| `renderLiveGameB3` ~L607 | Remove `lt-gd-name` span |
| CSS ~L164 | Remove `.lt-gd-name` rule |

---

## Out of Scope

- Static play-by-play log (`.game-log` in collapsible detail view) — not a live ticker, order unchanged
- Spielplan live banner section — not affected
