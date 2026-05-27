---
phase: 01-url-routing-view-dispatch
plan: 01
subsystem: config-parsing
provides: [cfg.view field in parseConfigFromSearch return]
affects: [01-02]
key-files: [widget.html, tests/unit.test.js]
key-decisions: [view defaults to spielplan for backwards compat, pass-through for unknown values]
tech-stack:
  added: []
  patterns: [TDD red-green for config param addition]
---

# Phase 1 Plan 01: view param in parseConfigFromSearch — Summary

**`parseConfigFromSearch()` now returns `view` field defaulting to `'spielplan'`; 5 new tests confirm backwards-compat and routing behaviour.**

## RED

What test was written:
- `describe('parseConfigFromSearch — view param')` block in tests/unit.test.js with 5 `it()` cases
- Tests checked `config.view` for absent/default/explicit values
- All failed because `parseConfigFromSearch` returned no `view` field (`undefined !== 'spielplan'`)

Commit: `1b82d66` — test(01-01): add failing tests for view param in parseConfigFromSearch

## GREEN

What implementation made them pass:
- Added `var view = params.get('view') || 'spielplan';` in parseConfigFromSearch()
- Added `view: view` to the return object
- All 5 new tests passed, all existing tests unchanged (203 total, 0 failures)

Commit: `471748d` — feat(01-01): add view param to parseConfigFromSearch with spielplan default

## REFACTOR

None needed.

## Commits

- `1b82d66` `test(01-01): add failing tests for view param in parseConfigFromSearch`
- `471748d` `feat(01-01): add view param to parseConfigFromSearch with spielplan default`
