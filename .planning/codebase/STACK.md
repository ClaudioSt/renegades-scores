# Technology Stack

**Analysis Date:** 2026-05-27

## Languages

**Primary:**
- HTML5 — `widget.html`, `generator.html` (client-side widget and admin UI)
- JavaScript (vanilla ES2020+) — `_gen_snapshot.js`, `tests/*.test.js` (Node.js scripts and tests)

**Secondary:**
- JSON — `snapshot.json`, `package.json`
- YAML — `.github/workflows/update-snapshot.yml`

## Runtime

**Environment:**
- Node.js 20.x (LTS) — specified in `.github/workflows/update-snapshot.yml`
- Browser — widget targets modern browsers with ES2020+ (async/await, fetch, ResizeObserver)

**Package Manager:**
- npm — declared in `package.json`
- No lockfile present (minimal dependency footprint — no production npm deps)

## Frameworks

**Core:**
- None — pure vanilla HTML/CSS/JavaScript, no build step, no transpilation

**Testing:**
- Node.js native `node:test` module — `tests/unit.test.js`, `tests/security.test.js`, `tests/snapshot.test.js`
- Node.js native `node:assert/strict` for assertions — `tests/helpers.js`
- Node.js `vm` module for sandboxed widget function extraction — `tests/helpers.js`

**Build/Dev:**
- None — GitHub Pages serves files as-is (gzip compression applied automatically)

## Key Dependencies

**Critical:**
- Node.js built-ins only: `fs`, `vm`, `path` — used in test harness (`tests/helpers.js`)
- No npm production dependencies — `_gen_snapshot.js` uses global `fetch` (Node 18+)

**Infrastructure:**
- GitHub Pages — static hosting at `https://claudiost.github.io/renegades-scores/`
- GitHub Actions — daily snapshot refresh via `.github/workflows/update-snapshot.yml`

## Configuration

**Environment:**
- No environment variables required
- Configuration via URL parameters only (widget: `?t=159&color=ff4500&past=5`)
- API base URL hardcoded in source: `_gen_snapshot.js` (line 5), `widget.html`

**Build:**
- `package.json` — minimal (only test script: `node --test "tests/*.test.js"`)
- No tsconfig, no vite.config, no webpack — zero build infrastructure

## Platform Requirements

**Development:**
- Node.js 18+ required (uses native `fetch`)
- Any platform (macOS/Linux/Windows)
- No external services needed for local development

**Production:**
- GitHub Pages for static hosting
- GitHub Actions for daily snapshot refresh (ubuntu-latest, Node 20)
- Widget works offline (after initial snapshot load) via localStorage cache

---

*Stack analysis: 2026-05-27*
*Update after major dependency changes*
