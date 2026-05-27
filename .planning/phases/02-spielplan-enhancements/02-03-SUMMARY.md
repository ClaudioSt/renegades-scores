# Phase 2 Plan 03: findNextGame — Summary

Pure `findNextGame` function with 7 edge-case tests covering date filtering, final-status exclusion, and multi-entry date-sorted selection.

## RED

Wrote 7 tests in `tests/unit.test.js` under `describe('findNextGame', ...)`:
1. Empty activeEntries → null
2. All entries have gd.date before today → null
3. Single future entry with team game → returns {gd, game}
4. Multiple future entries → returns earliest-dated one
5. No game has given teamId → null
6. Game with status 'final' → skipped (returns null)
7. Team appears in multiple games of one entry → returns first match

All 7 failed with `TypeError: w.findNextGame is not a function` because the function did not yet exist in widget.html.

## GREEN

Added `var findNextGame = function(activeEntries, teamId, today) { ... }` in widget.html just before `// ── VIEW RENDERERS`, using:
- `Array.filter` to keep entries with `gd.date >= today`
- `Array.sort` by `gd.date` ascending (string comparison works for ISO dates)
- Nested loop over entries then games, skipping `status === 'final'` and games lacking teamId in results
- Returns `{ gd: entry.gd, game }` on first match, `null` if exhausted

All 111 tests pass after implementation (7 new + 104 prior).

## REFACTOR

None — implementation was clean and minimal on first pass.

## Commits

- `702d068` test(02-03): add failing tests for findNextGame
- `36e69d9` feat(02-03): implement findNextGame
