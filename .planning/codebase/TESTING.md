# Testing Patterns

**Analysis Date:** 2026-05-27

## Test Framework

**Runner:**
- Node.js native `node:test` module (no external test framework)
- Config: test script in `package.json` (`node --test "tests/*.test.js"`)

**Assertion Library:**
- `node:assert/strict` — strict equality mode throughout
- Matchers used: `assert.ok()`, `assert.equal()`, `assert.deepEqual()`, `assert.match()`
- Descriptive error messages on assertions: `assert.ok(x, 'generated field must be a string')`

**Run Commands:**
```bash
npm test                          # Run all tests (node --test "tests/*.test.js")
node --test tests/unit.test.js    # Single file
node --test tests/security.test.js
node --test tests/snapshot.test.js
```

## Test File Organization

**Location:**
- Separate `tests/` directory (not co-located with source)
- Source files are HTML/inline JS — not importable directly

**Files:**
- `tests/unit.test.js` — Pure function tests (602 lines)
- `tests/security.test.js` — XSS/HTML escaping tests (611 lines)
- `tests/snapshot.test.js` — snapshot.json schema validation (308 lines)
- `tests/helpers.js` — VM context loader and DOM stubs (81 lines)

**Structure:**
```
tests/
  helpers.js            # Shared VM loader, localStorage mock
  unit.test.js          # parseConfigFromSearch, formatDate, classifyGameday, etc.
  security.test.js      # escapeHtml, renderGameRow, renderGamedayCard XSS tests
  snapshot.test.js      # snapshot.json structure, team presence, data integrity
```

## Test Structure

**Suite Organization:**
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('escapeHtml', () => {
  it('escapes & < > " \' characters', () => {
    const ctx = freshContext();
    assert.equal(ctx.escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapes & before < to avoid double-escaping', () => {
    const ctx = freshContext();
    assert.equal(ctx.escapeHtml('&lt;'), '&amp;lt;');
  });
});
```

**Patterns:**
- One `describe()` block per function/feature
- `freshContext()` helper for test isolation (independent localStorage + VM state)
- Arrange/assert pattern (no explicit `act` step needed for pure functions)
- Multiple related assertions within one `it()` block when testing one concept

## The VM Context Pattern

Widget functions cannot be imported (inline HTML `<script>` block). Tests use a VM sandbox:

```javascript
// tests/helpers.js
const vm = require('vm');

function loadWidgetContext(overrides = {}) {
  // Read widget.html, strip async IIFE wrapper
  // Inject mocked globals: URLSearchParams, localStorage, fetch (throws if called)
  // Run in vm.runInNewContext()
  return context;  // All declared functions/vars accessible
}

function freshContext(overrides = {}) {
  return loadWidgetContext(overrides);  // Fresh isolated state per test
}
```

**Functions accessible in test context:**
- `parseConfigFromSearch`, `formatDate`, `getResultClass`
- `renderGameRow`, `renderGamedayCard`, `renderGameLogEvents`
- `loadCache`, `saveCache`, `clearCache`
- `escapeHtml`, `resolveTeamName`

## Mocking

**Mock strategy:**
- localStorage: backed by plain `_store` object (`getItem`/`setItem`/`removeItem`)
- fetch: throws Error if called (prevents accidental network calls in tests)
- DOM: minimal stubs — `document.getElementById` returns null, `createElement` returns mock
- ResizeObserver: empty class (widget initializes but doesn't execute)

**What is NOT mocked:**
- LeagueSphere API (no integration tests that hit the network)
- snapshot.json loading (snapshot tests read the actual file from disk)

## Fixtures and Factories

**Snapshot tests** use the real `snapshot.json` from disk:
```javascript
const snap = JSON.parse(fs.readFileSync('snapshot.json', 'utf-8'));
```

**Unit tests** use inline test data:
```javascript
const ctx = freshContext();
const result = ctx.parseConfigFromSearch('?t=159&t=287&color=ff4500&past=3');
assert.deepEqual(result.teams, [159, 287]);
```

**No shared fixture files** — test data is inline within each test.

## Coverage

**Requirements:**
- No enforced coverage target
- Focus on: security (XSS), data integrity (snapshot schema), core logic (config parsing)

**What is tested:**
- `escapeHtml()` — 8+ XSS payload tests, entity encoding order
- `parseConfigFromSearch()` — 15+ URL parameter combinations
- `formatDate()` — German locale formatting
- `classifyGameday()` / game status — past/active/future classification
- `renderGameRow()`, `renderGamedayCard()` — XSS safety of rendered HTML
- `snapshot.json` — Schema structure, team 159/287 presence, game result linkage

**What is NOT tested:**
- `generator.html` (no test infrastructure exists)
- Live network calls / snapshot fetching
- `_gen_snapshot.js` generation logic
- DOM rendering in real browser (iframe sandbox, CSP headers)
- `discoverNewGamedays()` API discovery flow

## Common Patterns

**XSS payload testing:**
```javascript
const payloads = ['<script>alert(1)</script>', 'onerror=alert(1)', '"><svg onload=alert(1)>'];
for (const payload of payloads) {
  const html = ctx.renderGameRow({ ...game, teamName: payload });
  assert.ok(!html.includes('<script>'), 'XSS payload must not appear unescaped');
}
```

**Config parsing tests:**
```javascript
const ctx = freshContext();
const config = ctx.parseConfigFromSearch('?t=159&color=ff4500&past=3&compact=1');
assert.equal(config.past, 3);
assert.equal(config.compact, true);
assert.deepEqual(config.teams, [159]);
```

**Snapshot integrity tests:**
```javascript
assert.ok(Array.isArray(snap.teams), 'teams must be array');
const team159 = snap.teams.find(t => t.id === 159);
assert.ok(team159, 'Nürnberg Renegades (159) must be present');
assert.ok(team159.gamedays.length > 20, 'team 159 must have gameday history');
```

---

*Testing analysis: 2026-05-27*
*Update when test patterns change*
