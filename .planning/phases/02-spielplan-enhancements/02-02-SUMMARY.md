# Phase 2 Plan 02: Wire "Weitere laden" Pagination — Summary

**Wired `renderPastSection` into both `loadTeam` and `quickRenderFromSnap`, replacing the `<details>` collapse pattern, and added delegated click handling so "Weitere laden" reveals +3 past gameday cards per click.**

## Accomplishments
- Removed all `<details class="more-gamedays">` usage from widget.html (both `loadTeam` and `quickRenderFromSnap`)
- Added `var _pastCache = {}` module-level map to store sorted past entries per teamId
- `quickRenderFromSnap` now wraps raw snapshot gameday objects into `{gd, games}` shape before storing in `_pastCache` and passing to `renderPastSection` (required for shape consistency with cache format)
- Replaced `.more-gamedays` CSS rules with `.load-more` button styles using `--accent` color
- Added single delegated click listener on `root` in `renderSpielplan` — reads `data-team` and `data-visible`, increments by 3, re-renders the past container
- Updated stale test assertion (`more-gamedays` → `load-more`) in `tests/unit.test.js`
- All 104 unit tests pass

## Files Created/Modified
- `widget.html` — removed `<details>` collapse, added `_pastCache`, `.load-more` CSS, click delegation in `renderSpielplan`
- `tests/unit.test.js` — updated `quickRenderFromSnap` collapse test to check for `load-more` instead of `more-gamedays`

## Decisions Made
- Shape normalization in `quickRenderFromSnap`: raw snapshot gamedays are wrapped into `{gd, games}` before being passed to `renderPastSection`, so the function has a single uniform entry shape regardless of code path
- The delegated listener is placed after `await Promise.all(...)` so it is registered once per `renderSpielplan` call, not per team

## Issues Encountered
- Initial run failed: `quickRenderFromSnap` passed raw snapshot `gd` objects directly to `renderPastSection`, which expected `{gd, games}` wrapper shape. Fixed by mapping `past` to `pastWrapped` before caching and rendering.
- One test asserted `<details class="more-gamedays">` presence — updated to assert `load-more` button presence instead.

## Skipped Checkpoint (human-verify — Task 3)
The plan included a blocking human-verify checkpoint. Per execution instructions, it was skipped. The user should manually verify:
1. Open `widget.html?t=159&past=2` in browser (file:// is fine)
2. Confirm exactly 2 past gameday cards visible initially
3. Confirm "Weitere laden (N)" button visible below cards (N = remaining count)
4. Click button — 3 more cards appear, button label updates or disappears
5. Keep clicking until all shown — button gone
6. Refresh — initial state restored (past=2 shown)
7. Open `widget.html?t=159` (default past=3) — confirm 3 initial + button
8. No `<details>` element visible anywhere in the DOM

## Next Step
Ready for 02-03-PLAN.md
