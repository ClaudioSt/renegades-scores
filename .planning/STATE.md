# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-27)

**Core value:** Existing embeds on external sites must never break — backwards compatibility is non-negotiable.
**Current focus:** Phase 4 complete — ready for Phase 5 (Table View)

## Current Position

Phase: 4 of 7 (Snapshot Extension)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-05-28 — Completed 04-03-PLAN.md

Progress: ███████░░░ 79% (11/14 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: ~2 min/plan
- Total execution time: ~10 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 | 2 | ~4 min | ~2 min |
| Phase 2 | 4 | ~4 min | ~1 min |
| Phase 3 | 2 | ~3 min | ~1.5 min |
| Phase 4 | 3 | ~30 min | ~10 min (incl. rebuild) |

**Recent Trend:**
- Last 4 plans: 02-03 (TDD), 02-04 (execute), 03-01 (execute), 03-02 (TDD)
- Trend: fast parallel sequential execution

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01-01 | `view` defaults to `'spielplan'` | Backwards compat — all existing embeds work unchanged |
| 01-01 | Unknown view values passed through | Dispatch falls back to spielplan for unknown values |
| 01-02 | `renderTableView` is empty stub | Phase 5 implements it; no placeholder text avoids confusion |
| 01-02 | Dispatch uses `if/else` not `switch` | Unknown views fall back to spielplan (safe default) |
| 01-02 | Both renderers are top-level functions | Accessible from test VM context for future test plans |
| 02-02 | `_pastCache` module-level map for click handler | Click handler needs pastSorted at click time; closure via map is clean |
| 02-02 | Shape-mapping in quickRenderFromSnap | Snapshot objects are `{id,date,...,games:[]}` not `{gd,games}` — mapped before cache |

### Deferred Issues

None yet.

### Blockers/Concerns

Phase 2 human-verify checkpoints (02-02, 02-04) were skipped due to skip_checkpoints=true.
User should manually verify in browser:
- "Weitere laden" button works (widget.html?t=159&past=2)
- Next-game highlight card appears (widget.html?t=159)

## Session Continuity

Last session: 2026-05-28
Stopped at: Completed 04-03-PLAN.md (Phase 4 complete)
Resume file: None
