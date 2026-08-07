# Codebase Concerns

**Analysis Date:** 2026-05-27

## Tech Debt

**Triplicated NAME_MAP:**
- Issue: Identical hardcoded team name mapping exists in 3 places
- Files: `widget.html` (lines 11–21), `generator.html` (lines 150–159), `_gen_snapshot.js` (lines 11–21)
- Impact: Team name changes require updating 3 files — easy to miss one
- Fix approach: Single source of truth in snapshot.json or a shared JS file; remove duplicates

**Long `loadTeam()` function:**
- Issue: 120-line function in `widget.html` handles cache loading, discovery, fetching, classification, and rendering
- File: `widget.html` (approx. lines 519–639)
- Impact: Hard to test, hard to modify one concern without breaking others
- Fix approach: Extract into `loadFromCache()`, `runDiscovery()`, `fetchAndRender()` sub-functions

**`var` usage in widget:**
- Issue: `widget.html` uses `var` throughout (ES5 style), while `_gen_snapshot.js` uses `const`/`let`
- Files: `widget.html` (lines 132–151)
- Impact: No block scoping, accidental global leaks possible
- Fix approach: Migrate to `const`/`let` — low risk, incremental

**`generator.html` is completely untested:**
- Issue: ~250 lines of event handlers, team search logic, and embed code generation with no tests
- File: `generator.html` (lines 149–398)
- Impact: Regressions in admin UI go undetected
- Fix approach: Extract pure functions (generateEmbedCode, validateColor) and test them

## Known Bugs

**No retry in widget fetch:**
- Symptoms: Widget shows no data if GitHub Pages request fails transiently
- Trigger: Any transient network error or GitHub Pages hiccup
- Files: `widget.html` (fetchJSON — no retry logic)
- Workaround: Reload page
- Root cause: Inconsistency — `_gen_snapshot.js` has 3-attempt retry; `widget.html` does not
- Fix: Add same retry logic to `fetchJSON()` in `widget.html`

**Loose equality null check:**
- Symptoms: Potential truthy/falsy misclassification
- File: `widget.html` (line 172–177: `getResultClass()` uses `==` not `===`)
- Impact: Low — mostly theoretical, but inconsistent with strict mode best practices
- Fix: Change `me.pa == null` to `me.pa === null || me.pa === undefined`

**Team name resolution silent fallback:**
- Symptoms: Abbreviated name (e.g., "Nürn") displayed instead of full name
- File: `_gen_snapshot.js` (lines 141–157 `inferName()`)
- Trigger: All 3 lookup strategies fail for a team
- Workaround: None (silent fallback)
- Fix: Log a warning when falling back to abbreviation

## Security Considerations

**XSS mitigation: Excellent** ✓
- `escapeHtml()` comprehensively escapes `& < > " '` in correct order
- Applied to all user-facing data before `innerHTML` insertions
- 8+ XSS payloads tested in `tests/security.test.js`
- Known documented exception: `final_score` / `halftime_score` not escaped (expected to be integers)

**postMessage targetOrigin:**
- Risk: `postMessage(data, '*')` sends to any origin
- File: `widget.html` (lines 696–699)
- Current mitigation: Payload is non-sensitive (`{type: 'resize', height: N}` only)
- Severity: Low — no credentials or user data in payload
- Recommendation: Use specific parent origin if origin can be known at config time

**No input validation on URL parameters:**
- Risk: Malformed `color`, `past`, `future` params could produce unexpected rendering
- File: `widget.html` (`parseConfigFromSearch()`)
- Current mitigation: `parseInt()` / hex regex provides implicit validation
- Severity: Low — no server-side impact, client-side rendering only

## Performance Bottlenecks

**Large snapshot initial load:**
- Problem: 2.9 MB JSON (560 KB gzipped) fetched on every cold start
- File: `widget.html` (`loadSnapshot()`)
- Current mitigation: localStorage cache prevents repeat fetches after first load
- Issue: No timeout on fetch — widget blocks indefinitely if GitHub Pages is slow
- Fix: Add `AbortController` timeout (e.g., 10 seconds) to snapshot fetch

**`quickRenderFromSnap()` no lazy rendering:**
- Problem: Renders all gameday cards upfront, even historical ones collapsed by default
- File: `widget.html` (lines 490–516)
- Impact: Low for typical use (3 past, all future shown), but noticeable with `past=999`
- Fix: Only render visible gamedays on load; lazy-render collapsed ones

## Fragile Areas

**localStorage cache version:**
- Why fragile: `CACHE_VERSION = 3` must be manually bumped when schema changes; no automated check
- File: `widget.html` (line 136)
- Common failure: Forget to bump → stale cached data with wrong schema causes silent rendering errors
- Safe modification: Always bump `CACHE_VERSION` when any field in the localStorage schema changes

**snapshot.json schema assumptions in widget:**
- Why fragile: `quickRenderFromSnap()` assumes `gd.games` always exists; no defensive check
- File: `widget.html` (lines 489–516)
- Common failure: Malformed snapshot → uncaught TypeError
- Safe modification: Add `if (!gd.games) continue;` guard

**Game result count assumption:**
- Why fragile: `renderGameRow()` assumes exactly 2 results (home + away) per game
- File: `widget.html` (lines 393–395)
- Common failure: Bye week, forfeit, or API anomaly with 1 or 3+ results → rendering breaks
- Safe modification: Add guard `if (results.length !== 2) return '';`

## Scaling Limits

**GitHub Pages bandwidth:**
- Snapshot is 560 KB gzipped per cold visitor (localStorage prevents repeats)
- At scale: 1000 cold visitors/day = ~560 MB bandwidth
- GitHub Pages free tier: 100 GB/month — not a practical concern at current scale

**LeagueSphere API rate limits:**
- Discovery calls: 1 API call per visitor per team per 7 days (TTL-gated)
- Snapshot generation: ~5 minutes for full rebuild, ~15 minutes for --rebuild
- No documented rate limits from LeagueSphere; current batch strategy (5 at a time, 100ms delay) is conservative

## Missing Critical Features

**No snapshot validation before deploy:**
- Problem: Malformed snapshot.json is committed and served immediately
- Current workaround: None — bad snapshot would be served until next good run
- Blocks: Reliability of the widget for all embedders
- Implementation: Add `node --test tests/snapshot.test.js` step to GitHub Actions before commit

**No failure notification in CI:**
- Problem: If snapshot generation fails, the GitHub Action succeeds silently (no alert)
- File: `.github/workflows/update-snapshot.yml`
- Blocks: Knowing when the daily refresh is broken
- Implementation: Add GitHub Actions failure notification (email or status check)

## Test Coverage Gaps

**`generator.html` logic untested:**
- What's not tested: Embed code generation, team search, color validation, parameter defaults
- Risk: Regressions in admin UI undetected
- Priority: Medium
- Difficulty: Moderate — requires similar VM context approach as widget tests

**`_gen_snapshot.js` untested:**
- What's not tested: API fetching, HTML parsing, play-by-play log parsing, snapshot schema output
- Risk: Snapshot generation bugs only discovered after commit
- Priority: Medium
- Difficulty: High — requires mocking LeagueSphere API responses

**Widget discovery flow untested:**
- What's not tested: `discoverNewGamedays()`, `fetchNewGamedays()`, API fallback behavior
- Risk: Discovery regressions go undetected (affects users embedded on live sites)
- Priority: Medium
- Difficulty: Moderate — requires mocking fetch in test context

## Obsolete Files

**Safe to delete (per CLAUDE.md):**
- `_snapshot.js` — Old prototype snapshot generator (225 KB, not imported anywhere)
- `renegades_scores.html` — Old widget prototype (replaced by `widget.html`)
- `test.html` — Old manual test page (replaced by `tests/*.test.js`)

---

*Concerns audit: 2026-05-27*
*Update as issues are fixed or new ones discovered*
