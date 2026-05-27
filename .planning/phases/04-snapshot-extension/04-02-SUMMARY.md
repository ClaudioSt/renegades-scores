# Phase 4 Plan 02: TDD — computeStandings() — Summary

**`standings.js` shipped: pure CommonJS function computing SQ-sorted league standings from snapshot gamedays.**

## RED

Tests written in `tests/standings.test.js` (21 tests across 8 describe blocks):
- win/loss: winner gets S=1, EP=opponent.pa, GP=own.pa; loser gets N=1
- draw: both teams get U=1, EP=GP, PD=0, SQ=0.5
- null final_score → game skipped → rows: []
- gameday.id not in gameday_ids → game skipped → rows: []
- empty leagueConfig → returns {}
- empty gameday_ids → rows: []
- SQ precision: float rounded to 4 decimal places
- row sorting: SQ desc → PD desc → EP desc

Failed with: `require('../standings.js')` throwing `MODULE_NOT_FOUND` (file did not exist).
`npm test`: 231 pass, 1 fail (standings.test.js suite error).

## GREEN

Created `standings.js` as a CommonJS module:
- Iterates leagueConfig entries → seasons → builds a Set of valid gameday IDs
- Filters gamedays by Set membership; skips games with `final_score == null` or `results.length < 2`
- Uses a `Map<team_id, stats>` to accumulate Sp/S/U/N/EP/GP per team
- EP = opponent's `pa`; GP = own `pa`; win if own.pa < opp.pa; draw if equal
- Builds rows with PD = EP − GP, SQ = parseFloat(((2*S + U) / (2*Sp)).toFixed(4))
- Sorts rows: SQ desc → PD desc → EP desc

`npm test`: 252 pass, 0 fail (231 existing + 21 new standings tests).

## REFACTOR

None — implementation was clean on first pass.

## Commits

- ec21e64 test(04-02): add failing tests for computeStandings
- 6afc33e feat(04-02): implement computeStandings

## Next Step

Ready for 04-03-PLAN.md
