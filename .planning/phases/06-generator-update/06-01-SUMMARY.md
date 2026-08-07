# Phase 6 Plan 01: Add view= dropdown to config panel — Summary

**Added a dark-themed `<select id="view-input">` control to the generator config panel, positioned between the options checkboxes and the generate button, with two options: Spielplan (Standard) and Tabelle.**

## Accomplishments

- Added `select` and `select:focus` CSS rules in the `<style>` block, immediately after `input[type=number]:focus`, matching the dark-theme styling of all other form inputs
- Added `<label>Ansicht</label>` and `<select id="view-input">` in the HTML between the `.options-grid` div and the generate button div
- `spielplan` is the first (default-selected) option; `table` is the second option
- No JS wiring added (deferred to 06-02)

## Files Created/Modified

- `generator.html` — Added `select`/`select:focus` CSS rules and the Ansicht label + select element in the config panel

## Decisions Made

None

## Issues Encountered

None

## Next Step

Ready for 06-02-PLAN.md
