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

- [x] **Phase 1: URL Routing & View Dispatch** - Add `view=` param, wire dispatch to spielplan/table render paths, keep backwards compat
- [x] **Phase 2: Spielplan Enhancements** - "Weitere laden" pagination (3 past gamedays/click) and next-game highlight card
- [x] **Phase 3: League Config** - Create `league-config.json` mapping gameday IDs to phase names per league+season
- [x] **Phase 4: Snapshot Extension** - Extend `_gen_snapshot.js` to compute standings blocks and tag gamedays with phases
- [x] **Phase 5: Table View** - `view=table` rendering: standings per phase, phase selector, current team highlighted
- [x] **Phase 6: Generator Update** - Add `view=` selector to `generator.html` embed code tool
- [ ] **Phase 7: Polish & Hardening** - Security audit on new code paths, test coverage for new views, cross-browser check

## Phase Details

### Phase 1: URL Routing & View Dispatch
**Goal**: `view=` param parsed and defaulted to `spielplan`; widget dispatches to correct render function; all existing embeds unchanged
**Depends on**: Nothing (first phase)
**Research**: Unlikely (extending existing `parseConfigFromSearch()` and render pipeline)
**Plans**: TBD

Plans:
- [x] 01-01: Add `view` to `parseConfigFromSearch()` with `spielplan` default
- [x] 01-02: Add render dispatch — call spielplan or table renderer based on `view`

### Phase 2: Spielplan Enhancements
**Goal**: Past gamedays collapsed behind "Weitere laden" button (3 per click); next upcoming game shows highlight card
**Depends on**: Phase 1
**Research**: Unlikely (modifying existing render logic, internal UI patterns)
**Plans**: TBD

Plans:
- [x] 02-01: renderPastSection TDD — pure render function with "Weitere laden" button
- [x] 02-02: Wire renderPastSection into loadTeam/quickRenderFromSnap, add click delegation
- [x] 02-03: findNextGame TDD — pure function identifying nearest upcoming game
- [x] 02-04: renderNextGameCard — accent highlight card integrated into loadTeam future section

### Phase 3: League Config
**Goal**: `league-config.json` created with DKB DFFL and FF BL phase mappings; `_gen_snapshot.js` reads and validates it
**Depends on**: Nothing (data file, can proceed in parallel with Phase 1-2 in principle)
**Research**: Unlikely (manually maintained JSON, straightforward data structure)
**Plans**: TBD

Plans:
- [x] 03-01: Define `league-config.json` schema and create initial file for DKB DFFL + FF BL seasons
- [x] 03-02: Add config loader + validator in `_gen_snapshot.js`

### Phase 4: Snapshot Extension
**Goal**: `snapshot.json` includes `standings` block per team per phase; gamedays tagged with phase name
**Depends on**: Phase 3 (needs league-config.json)
**Research**: Unlikely (extending existing Node.js script, standings math from existing game results)
**Plans**: TBD

Plans:
- [x] 04-01: Extend `_gen_snapshot.js` to tag each gameday with its phase name from league-config
- [x] 04-02: Compute standings (W/L/PF/PA) per phase per league from game results; add `standings` block to snapshot
- [x] 04-03: Tests for standings computation correctness and schema validation

### Phase 5: Table View
**Goal**: `view=table` renders league standings table with phase selector; current team row highlighted
**Depends on**: Phase 1 (dispatch), Phase 4 (snapshot standings data)
**Research**: Unlikely (internal UI using snapshot data, same patterns as existing views)
**Plans**: TBD

Plans:
- [x] 05-01: Core table renderer — `renderStandingsTable` + async `renderTableView` with CSS
- [x] 05-02: Year selector — interactive year tabs, click delegation, content swap without snapshot reload
- [x] 05-03: TDD — 12 tests for `renderStandingsTable` (highlights, XSS, SQ formatting, empty state)

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
| 1. URL Routing & View Dispatch | 2/2 | Complete | 2026-05-27 |
| 2. Spielplan Enhancements | 4/4 | Complete | 2026-05-27 |
| 3. League Config | 2/2 | Complete | 2026-05-27 |
| 4. Snapshot Extension | 3/3 | Complete | 2026-05-28 |
| 5. Table View | 3/3 | Complete | 2026-05-28 |
| 6. Generator Update | 2/2 | Complete | 2026-05-28 |
| 7. Polish & Hardening | 0/TBD | Not started | - |
