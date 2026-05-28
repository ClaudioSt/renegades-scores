# Phase 6 Plan 02: Wire view param to embed URL + verify — Summary

**Wired the `view-input` select value into the generated embed URL: Tabelle appends `&view=table`, Spielplan omits the param entirely (backwards compat preserved).**

## Accomplishments

- Added `var view = document.getElementById('view-input').value;` after the `compact` variable read in the `generate-btn` click handler
- Added `if (view !== 'spielplan') params += '&view=' + view;` after the `compact` conditional and before `var src = base + '?' + params;`
- Human-verify checkpoint was **skipped** (skip_checkpoints=true) — manual browser verification required: confirm Spielplan produces no `view=` param and Tabelle produces `&view=table` in the embed URL

## Files Created/Modified

- `generator.html` — Two lines added in the `generate-btn` click handler to read `view-input` and conditionally append `&view=<value>` to the embed URL params

## Decisions Made

None

## Issues Encountered

None

## Next Step

Phase 6 complete, ready for Phase 7 (Polish & Hardening)
