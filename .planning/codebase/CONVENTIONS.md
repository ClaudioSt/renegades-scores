# Coding Conventions

**Analysis Date:** 2026-05-27

## Naming Patterns

**Files:**
- kebab-case for workflows/docs: `update-snapshot.yml`
- Lowercase for HTML pages: `widget.html`, `generator.html`
- Underscore prefix for Node.js CLI scripts: `_gen_snapshot.js`
- UPPERCASE for project docs: `README.md`, `CLAUDE.md`
- `*.test.js` for test files: `tests/unit.test.js`

**Functions:**
- camelCase for all functions: `parseConfigFromSearch`, `escapeHtml`, `batchedAll`
- `_underscore` prefix for private/internal globals: `_snapshotPromise`, `_openDetail`, `_teamNameByAbbrev`
- Short descriptive names for callbacks: `slimGame()`, `parseGameLog()`

**Variables:**
- camelCase for variables: `teamId`, `gameday`, `isHome`
- `UPPER_SNAKE_CASE` for module-level constants: `API_BASE`, `CACHE_VERSION`, `DISCOVERY_TTL_MS`, `BATCH_SIZE`
- Short abbreviations in tight loops: `gd` (gameday), `g` (game), `r` (result), `el` (element)

**Types / DOM:**
- CSS classes: kebab-case (`.game-row`, `.gameday-card`, `.team-block`)
- CSS IDs: camelCase (`#root`)
- localStorage keys: `lsw_` prefix (`lsw_{teamId}`)

## Code Style

**Formatting:**
- 2-space indentation throughout (`widget.html`, `generator.html`, `_gen_snapshot.js`)
- Single quotes for JavaScript strings: `const API_BASE = 'https://...'`
- Double quotes for HTML attributes: `class="team-row"`
- Semicolons present in JavaScript code

**JavaScript dialect:**
- `var` used in `widget.html` (broad scope, ES5-compatible style for browser)
- `const`/`let` used in Node.js scripts (`_gen_snapshot.js`, `tests/*.js`)
- Async/await in `_gen_snapshot.js`; promise chains in `widget.html`

**Section organization:**
- ASCII separators for section headers: `// ── CONSTANTS ────────────────────────`
- Groups: CONSTANTS → UTILITIES → DATA LOADING → RENDERING → INIT

**Linting:**
- No ESLint or Prettier configured
- Security hook enforces `.matchAll()` over `.exec()` in `_gen_snapshot.js`

## Import Organization

**widget.html / generator.html:**
- No imports — all code is inline in `<script>` blocks
- External resources: only the snapshot.json fetch

**_gen_snapshot.js:**
- Node.js built-ins first: `const fs = require('fs')`, `const vm = require('vm')`
- No npm imports

**tests/*.js:**
- `require('node:test')`, `require('node:assert/strict')` first
- Local helpers: `require('./helpers')`

## Error Handling

**Patterns:**
- Graceful degradation: widget silently skips failed operations, renders partial data
- Retry with exponential backoff in `_gen_snapshot.js` (3 attempts, 500ms × attempt delay)
- No retry in `widget.html` — fetch failures cause silent data gaps
- Try/catch around JSON parse: `try { JSON.parse(cached) } catch { clearCache() }`

**Null safety:**
- Null checks before field access: `me && other && me.pa != null`
- Fallback chains: `team.name || inferName(abbrev) || abbrev`
- Loose equality `==` for null/undefined checks (e.g., `me.pa == null`) — see CONCERNS.md

## Logging

**Pattern:**
- `console.log()` for progress in `_gen_snapshot.js` (batch progress, team count)
- No structured logging, no log levels
- No console output in `widget.html` (silent widget)

## Comments

**When to comment:**
- Explain non-obvious constraints: CORS rationale, rate-limiting strategy, security notes
- Mark security-critical code: `// escapeHtml() MUST be called before innerHTML`
- Warn about ordering requirements: `// & must be replaced first`
- German language appears in regex comments (German sport terms: `Gewinner`, `Platzhalter`)

**Avoid:**
- No docstrings or JSDoc on internal functions
- No comments explaining obvious code

## Function Design

**Size:**
- Short utility functions: `escapeHtml()`, `formatDate()`, `getResultClass()` (5–15 lines)
- Larger orchestration functions: `loadTeam()` (~120 lines) — known tech debt, see CONCERNS.md

**Parameters:**
- Simple primitives or objects
- No destructuring in parameters (ES5 style in widget.html)
- Short param names for data iteration: `(gd, i)`, `(g, idx)`

**Return values:**
- Return early for guard clauses
- Return `null` for "not found" / parse failures
- Return HTML strings from render functions

## Module Design

**Encapsulation:**
- `widget.html`: entire JS in one `<script>` block, globals intentionally avoided via closure
- `_gen_snapshot.js`: CommonJS module, no exports (CLI script)
- Tests access widget internals via VM context extraction in `tests/helpers.js`

**Render pattern:**
- Build complete HTML strings, inject via `innerHTML` once
- Never append to DOM incrementally (avoids reflow)
- All user/API data escaped via `escapeHtml()` before insertion

---

*Convention analysis: 2026-05-27*
*Update when patterns change*
