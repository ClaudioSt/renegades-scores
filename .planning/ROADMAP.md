# Roadmap: Renegades Scores Widget

## Overview

Extending the single-view schedule widget to a multi-view widget supporting `view=spielplan` (enhanced), `view=table` (standings), and a future `view=live`. Work flows from routing infrastructure through data pipeline changes to new UI views, finishing with polish. Existing embeds are never broken.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: URL Routing & View Dispatch** - Add `view=` param, wire dispatch to spielplan/table render paths, keep backwards compat
- [ ] **Phase 2: Spielplan Enhancements** - "Weitere laden" pagination (3 past gamedays/click) and next-game highlight card
- [ ] **Phase 3: League Config** - Create `league-config.json` mapping gameday IDs to phase names per league+season
- [ ] **Phase 4: Snapshot Extension** - Extend `_gen_snapshot.js` to compute standings blocks and tag gamedays with phases
- [ ] **Phase 5: Table View** - `view=table` rendering: standings per phase, phase selector, current team highlighted
- [ ] **Phase 6: Generator Update** - Add `view=` selector to `generator.html` embed code tool
- [ ] **Phase 7: Polish & Hardening** - Security audit on new code paths, test coverage for new views, cross-browser check

## Phase Details

### Phase 1: URL Routing & View Dispatch
**Goal**: `view=` param parsed and defaulted to `spielplan`; widget dispatches to correct render function; all existing embeds unchanged
**Depends on**: Nothing (first phase)
**Research**: Unlikely (extending existing `parseConfigFromSearch()` and render pipeline)
**Plans**: TBD

Plans:
- [ ] 01-01: Add `view` to `parseConfigFromSearch()` with `spielplan` default
- [ ] 01-02: Add render dispatch — call spielplan or table renderer based on `view`
- [ ] 01-03: Tests for backwards compat (`view` absent → spielplan) and explicit values

### Phase 2: Spielplan Enhancements
**Goal**: Past gamedays collapsed behind "Weitere laden" button (3 per click); next upcoming game shows highlight card
**Depends on**: Phase 1
**Research**: Unlikely (modifying existing render logic, internal UI patterns)
**Plans**: TBD

Plans:
- [ ] 02-01: Implement "Weitere laden" pagination — initial render shows `past` count, button loads +3 each click
- [ ] 02-02: Next-game highlight card — identify next upcoming game across all team gamedays and render accent card
- [ ] 02-03: Tests for pagination state and next-game detection edge cases

### Phase 3: League Config
**Goal**: `league-config.json` created with DKB DFFL and FF BL phase mappings; `_gen_snapshot.js` reads and validates it
**Depends on**: Nothing (data file, can proceed in parallel with Phase 1-2 in principle)
**Research**: Unlikely (manually maintained JSON, straightforward data structure)
**Plans**: TBD

Plans:
- [ ] 03-01: Define `league-config.json` schema and create initial file for DKB DFFL + FF BL seasons
- [ ] 03-02: Add config loader + validator in `_gen_snapshot.js`

### Phase 4: Snapshot Extension
**Goal**: `snapshot.json` includes `standings` block per team per phase; gamedays tagged with phase name
**Depends on**: Phase 3 (needs league-config.json)
**Research**: Unlikely (extending existing Node.js script, standings math from existing game results)
**Plans**: TBD

Plans:
- [ ] 04-01: Extend `_gen_snapshot.js` to tag each gameday with its phase name from league-config
- [ ] 04-02: Compute standings (W/L/PF/PA) per phase per league from game results; add `standings` block to snapshot
- [ ] 04-03: Tests for standings computation correctness and schema validation

### Phase 5: Table View
**Goal**: `view=table` renders league standings table with phase selector; current team row highlighted
**Depends on**: Phase 1 (dispatch), Phase 4 (snapshot standings data)
**Research**: Unlikely (internal UI using snapshot data, same patterns as existing views)
**Plans**: TBD

Plans:
- [ ] 05-01: Table view renderer — standings table layout with W/L/PF/PA columns
- [ ] 05-02: Phase selector (tabs or dropdown) — filter standings to selected phase
- [ ] 05-03: Highlight current team row; handle multi-team param (highlight all matching teams)
- [ ] 05-04: Tests for table rendering, phase filtering, team highlighting

### Phase 6: Generator Update
**Goal**: `generator.html` embed code builder exposes `view=` selector; generated embed URLs include view param
**Depends on**: Phase 1 (view param is now meaningful)
**Research**: Unlikely (adding UI control to existing admin tool, internal patterns)
**Plans**: TBD

Plans:
- [ ] 06-01: Add `view=` dropdown to generator.html config panel
- [ ] 06-02: Wire to embed code output; test that generated URLs are correct

### Phase 7: Polish & Hardening
**Goal**: All new code paths pass security audit; new views covered by test suite; cross-browser verified
**Depends on**: Phases 2, 5, 6 (all feature work complete)
**Research**: Unlikely (internal review and testing work)
**Plans**: TBD

Plans:
- [ ] 07-01: Security audit — escapeHtml() on all new innerHTML insertions, no new XSS vectors
- [ ] 07-02: Complete test coverage for Phase 2 and Phase 5 UI logic
- [ ] 07-03: Cross-browser manual smoke test; verify postMessage height reporting with new views

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. URL Routing & View Dispatch | 0/TBD | Not started | - |
| 2. Spielplan Enhancements | 0/TBD | Not started | - |
| 3. League Config | 0/TBD | Not started | - |
| 4. Snapshot Extension | 0/TBD | Not started | - |
| 5. Table View | 0/TBD | Not started | - |
| 6. Generator Update | 0/TBD | Not started | - |
| 7. Polish & Hardening | 0/TBD | Not started | - |
