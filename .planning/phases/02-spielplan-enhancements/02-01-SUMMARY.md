# Phase 2 Plan 01: renderPastSection — Summary

**Extracted and TDD-verified renderPastSection — a pure function that renders past gameday cards with a "Weitere laden (N)" load-more button when visibleCount < total entries.**

## RED

Added 12 tests in `tests/unit.test.js` covering: empty array returns `''`, all-visible (exact and over-count) produces N cards and no button, under-count produces only visibleCount cards plus a `load-more` button, button label is `Weitere laden (N)` with correct remaining count, `data-team` and `data-visible` attributes carry correct string-coerced values, first entry content renders while later entries are suppressed, and teamId passes through correctly to `renderGamedayCard` for team 287. All 12 tests failed with `TypeError: w.renderPastSection is not a function`.

## GREEN

Added `renderPastSection(pastSorted, teamId, visibleCount)` to `widget.html` immediately before the `// ── VIEW RENDERERS` section (line 642). Implementation: guard for empty array, slice visible entries, map each through `renderGamedayCard(e.gd, e.games, teamId, true)`, append button with class `load-more`, `data-team`, `data-visible`, and label `Weitere laden (N)` when `remaining > 0`. All 104 tests pass (92 pre-existing + 12 new).

## REFACTOR

None — implementation was clean and minimal on first pass.

## Commits

- `3d34c34` test(02-01): add failing tests for renderPastSection
- `767ee96` feat(02-01): implement renderPastSection
