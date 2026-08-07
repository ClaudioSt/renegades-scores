# Phase 3 Plan 02: league-config validator — Summary

**Implemented `league-config.js` CommonJS module with `validateLeagueConfig` and `loadLeagueConfig`, wired into `_gen_snapshot.js` so the snapshot generator validates its config at startup and catches schema errors before any network calls.**

## RED

Created `tests/league-config.test.js` with 9 tests covering all validation error cases (null input, empty object, missing `name` field, non-array `gameday_ids`, non-integer elements in `gameday_ids` and `promotion_restricted`) plus one integration test loading the real `league-config.json`. Tests failed with `Cannot find module '../league-config.js'` because the module did not exist yet.

## GREEN

Created `league-config.js` at project root implementing:
- `validateLeagueConfig(config)`: guards for null/non-object, empty object, then iterates leagues and seasons checking `name` (string), `gameday_ids` (array of integers), `promotion_restricted` (array of integers); returns config identity on success.
- `loadLeagueConfig(filePath)`: reads file with `fs.readFileSync`, parses JSON, delegates to `validateLeagueConfig`.

Wired into `_gen_snapshot.js`: added `require('./league-config.js')` after constant declarations and `loadLeagueConfig('./league-config.json')` as first statement inside the async IIFE with a console.log. All 231 tests pass (222 prior + 9 new).

## REFACTOR

None needed. The implementation is minimal and matches the spec exactly with no duplication.

## Commits

- `eab65af` test(03-02): add failing tests for league-config validator
- `180fb1d` feat(03-02): implement league-config validator and loader

## Next Step

Phase 3 complete, ready for Phase 4 (Snapshot Extension)
