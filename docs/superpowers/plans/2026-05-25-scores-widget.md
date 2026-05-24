# Scores Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `renegades_scores.html` with a configurable `widget.html` (iframe embed) and `generator.html` (admin tool), where teams are configured via URL params and gamedays auto-discovered from the LeagueSphere API with smart localStorage caching.

**Architecture:** `widget.html` is a fully self-contained static file (inline CSS + JS, no dependencies) hosted on GitHub Pages. It reads `?t=159&t=287&color=ff4500` from the URL, fetches all 734 gamedays in one request, then games in batches of 50, and caches past results permanently. `generator.html` is a standalone admin tool that validates team IDs and outputs a ready-to-paste `<iframe>` tag.

**Tech Stack:** Vanilla HTML5, CSS3, ES2020 JavaScript — no build step, no npm, no frameworks.

**Security note:** All API string data inserted via `innerHTML` MUST go through `escapeHtml()` to prevent XSS. The `escapeHtml` function is defined in Task 3 and used in every render function.

---

## File Structure

| File | Responsibility |
|---|---|
| `widget.html` | Self-contained embeddable widget — all CSS + JS inline |
| `generator.html` | Admin tool: enter team IDs, get iframe embed code |
| `test.html` | Browser-based unit tests for all pure functions |

The existing `renegades_scores.html` is kept as reference; `widget.html` replaces it.

---

## Task 1: Test harness

**Files:**
- Create: `test.html`

- [ ] **Create `test.html` with inline test runner**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Widget Tests</title>
  <style>
    body { font-family: monospace; background: #111; color: #eee; padding: 20px; }
    .pass { color: #4caf50; }
    .fail { color: #f44336; }
    #summary { margin-top: 20px; font-size: 1.2rem; font-weight: bold; }
  </style>
</head>
<body>
<h1>Widget Unit Tests</h1>
<div id="results"></div>
<div id="summary"></div>
<script>
let passed = 0, failed = 0;
const out = document.getElementById('results');

function test(name, fn) {
  try {
    fn();
    out.insertAdjacentHTML('beforeend', '<div class="pass">OK ' + name + '</div>');
    passed++;
  } catch (e) {
    out.insertAdjacentHTML('beforeend', '<div class="fail">FAIL ' + name + ': ' + e.message + '</div>');
    failed++;
  }
}
function assertEqual(a, b, msg) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(msg || 'Expected ' + bs + ', got ' + as);
}
function assertTrue(val, msg)  { if (!val) throw new Error(msg || 'Expected truthy, got ' + JSON.stringify(val)); }
function assertFalse(val, msg) { if (val)  throw new Error(msg || 'Expected falsy, got ' + JSON.stringify(val)); }

// ── PURE FUNCTIONS UNDER TEST (paste from widget.html after each task) ──

// ── TESTS ──

document.getElementById('summary').textContent = passed + ' passed, ' + failed + ' failed';
</script>
</body>
</html>
```

- [ ] **Open `test.html` in browser — verify "0 passed, 0 failed" appears**

---

## Task 2: URL param parser

**Files:**
- Modify: `test.html` (add function + tests)

- [ ] **Add `parseConfigFromSearch` in the PURE FUNCTIONS section of `test.html`**

```js
function parseConfigFromSearch(search) {
  const params  = new URLSearchParams(search);
  const teams   = params.getAll('t').map(Number).filter(n => Number.isInteger(n) && n > 0);
  const color   = (params.get('color') || 'ff4500').replace(/^#/, '');
  const refresh = params.has('refresh');
  return { teams, color, refresh };
}
```

- [ ] **Add tests in the TESTS section**

```js
test('parseConfigFromSearch: two teams', () => {
  const r = parseConfigFromSearch('?t=159&t=287&color=ff4500');
  assertEqual(r.teams, [159, 287]);
  assertEqual(r.color, 'ff4500');
  assertFalse(r.refresh);
});
test('parseConfigFromSearch: default color', () => {
  assertEqual(parseConfigFromSearch('?t=42').color, 'ff4500');
});
test('parseConfigFromSearch: strips # from color', () => {
  assertEqual(parseConfigFromSearch('?t=1&color=%23ff0000').color, 'ff0000');
});
test('parseConfigFromSearch: refresh flag', () => {
  assertTrue(parseConfigFromSearch('?t=1&refresh=1').refresh);
});
test('parseConfigFromSearch: ignores invalid team IDs', () => {
  assertEqual(parseConfigFromSearch('?t=abc&t=0&t=159').teams, [159]);
});
test('parseConfigFromSearch: empty returns no teams', () => {
  assertEqual(parseConfigFromSearch('').teams, []);
});
```

- [ ] **Reload browser — verify 6 pass, 0 fail**

---

## Task 3: Pure utility functions (escapeHtml, formatDate, getResultClass, resolveTeamName)

**Files:**
- Modify: `test.html`

- [ ] **Add these functions to the PURE FUNCTIONS section**

```js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(dateStr) {
  // Append T00:00:00 to force local midnight, avoiding UTC timezone shift
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function getResultClass(teamId, results) {
  const me    = results.find(r => r.team_id === teamId);
  const other = results.find(r => r.team_id !== teamId);
  if (!me || !other || me.pa == null) return '';
  if (me.pa > other.pa) return 'win';
  if (me.pa < other.pa) return 'loss';
  return 'draw';
}

const NAME_MAP = {
  'Nürn': 'Nürnberg Renegades', 'Nürn2': 'Nürnberg Renegades II',
  'Spatz': 'München Spatzen', 'Würz': 'Würzburg',
  'Lions': 'Erlangen Lions', 'LLions': 'Landsberg Lions',
  'Kelk': 'Kelkheim Lizzards', 'Werra': 'Werratal',
  'Bamb': 'Bamberg', 'Regen': 'Regensburg', 'Regen2': 'Regensburg 2',
  'Ingol': 'Ingolstadt', 'Ingol2': 'Ingolstadt II',
  'Erlangen2': 'Erlangen 2', 'Ramsenthal': 'Ramsenthal',
  'Ramsenthal2': 'Ramsenthal II', 'Rodental': 'Rödental', 'Erding2': 'Erding II',
};
function resolveTeamName(abbrev) { return NAME_MAP[abbrev] || abbrev; }
```

- [ ] **Add tests**

```js
test('escapeHtml: escapes < > & " characters', () => {
  assertEqual(escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});
test('escapeHtml: leaves normal strings unchanged', () => {
  assertEqual(escapeHtml('Nürnberg Renegades'), 'Nürnberg Renegades');
});
test('formatDate: formats 2026-05-09 containing year and day', () => {
  const r = formatDate('2026-05-09');
  assertTrue(r.includes('2026'), 'got: ' + r);
  assertTrue(r.includes('09'), 'got: ' + r);
});
test('getResultClass: win', () => {
  assertEqual(getResultClass(159, [{team_id:159,pa:34},{team_id:99,pa:20}]), 'win');
});
test('getResultClass: loss', () => {
  assertEqual(getResultClass(159, [{team_id:159,pa:14},{team_id:99,pa:28}]), 'loss');
});
test('getResultClass: draw', () => {
  assertEqual(getResultClass(159, [{team_id:159,pa:20},{team_id:99,pa:20}]), 'draw');
});
test('getResultClass: null pa returns empty', () => {
  assertEqual(getResultClass(159, [{team_id:159,pa:null},{team_id:99,pa:null}]), '');
});
test('resolveTeamName: known abbreviation', () => {
  assertEqual(resolveTeamName('Nürn'), 'Nürnberg Renegades');
});
test('resolveTeamName: unknown returns as-is', () => {
  assertEqual(resolveTeamName('UnknownTeam'), 'UnknownTeam');
});
```

- [ ] **Reload browser — verify 15 pass, 0 fail**

---

## Task 4: Cache module

**Files:**
- Modify: `test.html`

- [ ] **Add cache functions to PURE FUNCTIONS section**

```js
const CACHE_VERSION = 1;

function cacheKey(teamId) { return 'lsw_' + teamId; }

function loadCache(teamId, storage) {
  const store = storage || localStorage;
  try {
    const raw = store.getItem(cacheKey(teamId));
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return null;
    return cache;
  } catch { return null; }
}

function saveCache(teamId, data, storage) {
  const store = storage || localStorage;
  try {
    store.setItem(cacheKey(teamId), JSON.stringify(Object.assign({}, data, { version: CACHE_VERSION })));
    return true;
  } catch { return false; }
}

function clearCache(teamId, storage) {
  const store = storage || localStorage;
  try { store.removeItem(cacheKey(teamId)); } catch {}
}

function needsDiscovery(cache) {
  if (!cache) return true;
  return new Date(cache.next_discovery) <= new Date();
}
```

- [ ] **Add a `makeStorage()` test helper and tests**

```js
function makeStorage() {
  const store = {};
  return {
    getItem:    function(k)    { return k in store ? store[k] : null; },
    setItem:    function(k, v) { store[k] = v; },
    removeItem: function(k)    { delete store[k]; },
  };
}

test('loadCache: returns null when empty', () => {
  assertEqual(loadCache(999, makeStorage()), null);
});
test('saveCache + loadCache: round-trip', () => {
  const s = makeStorage();
  saveCache(999, { past: [], active_ids: [1,2], scanned_at: 'x', next_discovery: '2099-01-01T00:00:00Z' }, s);
  const c = loadCache(999, s);
  assertEqual(c.active_ids, [1, 2]);
  assertEqual(c.version, 1);
});
test('loadCache: ignores wrong cache version', () => {
  const s = makeStorage();
  s.setItem('lsw_999', JSON.stringify({ version: 99, past: [] }));
  assertEqual(loadCache(999, s), null);
});
test('loadCache: returns null on corrupt JSON', () => {
  const s = makeStorage();
  s.setItem('lsw_999', 'not-json');
  assertEqual(loadCache(999, s), null);
});
test('needsDiscovery: true when cache is null', () => {
  assertTrue(needsDiscovery(null));
});
test('needsDiscovery: true when next_discovery is in the past', () => {
  assertTrue(needsDiscovery({ next_discovery: '2020-01-01T00:00:00Z' }));
});
test('needsDiscovery: false when next_discovery is in the future', () => {
  assertFalse(needsDiscovery({ next_discovery: '2099-01-01T00:00:00Z' }));
});
```

- [ ] **Reload browser — verify 22 pass, 0 fail**

---

## Task 5: Concurrency utility

**Files:**
- Modify: `test.html`

- [ ] **Add `batchedAll` to PURE FUNCTIONS section**

```js
async function batchedAll(items, asyncFn, batchSize, onBatchDone) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch       = items.slice(i, i + batchSize);
    const batchResult = await Promise.all(batch.map(asyncFn));
    results.push.apply(results, batchResult);
    if (onBatchDone) onBatchDone(results.length, items.length);
  }
  return results;
}
```

- [ ] **Replace the synchronous summary line at the bottom of the script with an async IIFE that runs after sync tests, then prints the summary**

```js
// Remove the existing summary line and replace with:
(async function() {
  // async test: maps all items
  try {
    const r = await batchedAll([1,2,3,4,5], async function(x) { return x * 2; }, 2);
    assertEqual(r, [2,4,6,8,10]);
    out.insertAdjacentHTML('beforeend', '<div class="pass">OK batchedAll: maps all items in batches of 2</div>');
    passed++;
  } catch(e) {
    out.insertAdjacentHTML('beforeend', '<div class="fail">FAIL batchedAll: ' + e.message + '</div>');
    failed++;
  }

  // async test: respects batch size concurrency
  try {
    let concurrent = 0, maxConcurrent = 0;
    await batchedAll([1,2,3,4,5,6], async function(x) {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(function(r) { setTimeout(r, 5); });
      concurrent--;
    }, 3);
    assertTrue(maxConcurrent <= 3, 'max concurrent was ' + maxConcurrent + ', expected <= 3');
    out.insertAdjacentHTML('beforeend', '<div class="pass">OK batchedAll: concurrency capped at batchSize (max=' + maxConcurrent + ')</div>');
    passed++;
  } catch(e) {
    out.insertAdjacentHTML('beforeend', '<div class="fail">FAIL batchedAll concurrency: ' + e.message + '</div>');
    failed++;
  }

  document.getElementById('summary').textContent = passed + ' passed, ' + failed + ' failed';
})();
```

- [ ] **Reload browser — verify 24 pass, 0 fail**

---

## Task 6: Game classification logic

**Files:**
- Modify: `test.html`

- [ ] **Add `classifyGameday` to PURE FUNCTIONS section**

```js
// Returns 'past' | 'active' | null
// null  = team not present in this gameday
// past  = all team games beendet AND date <= today
// active = anything else (future, today with open games, live)
function classifyGameday(gd, games, teamId, today) {
  const t = today || new Date().toISOString().slice(0, 10);
  const teamGames = games.filter(function(g) {
    return g.results.some(function(r) { return r.team_id === teamId; });
  });
  if (teamGames.length === 0) return null;
  const allDone = teamGames.every(function(g) { return g.status === 'beendet'; });
  if (gd.date <= t && allDone) return 'past';
  return 'active';
}
```

- [ ] **Add tests (sync, before the async IIFE)**

```js
const TODAY = '2026-05-25';
function makeGame(teamId, status) {
  return {
    status: status,
    results: [
      { team_id: teamId, pa: 20, isHome: true },
      { team_id: 99,     pa: 14, isHome: false }
    ]
  };
}

test('classifyGameday: past when date before today and all beendet', () => {
  assertEqual(classifyGameday({date:'2026-01-01'}, [makeGame(159,'beendet')], 159, TODAY), 'past');
});
test('classifyGameday: past when date equals today and all beendet', () => {
  assertEqual(classifyGameday({date:TODAY}, [makeGame(159,'beendet')], 159, TODAY), 'past');
});
test('classifyGameday: active when date in future', () => {
  assertEqual(classifyGameday({date:'2099-01-01'}, [makeGame(159,'Geplant')], 159, TODAY), 'active');
});
test('classifyGameday: active when old date but game still live', () => {
  assertEqual(classifyGameday({date:'2026-01-01'}, [makeGame(159,'live')], 159, TODAY), 'active');
});
test('classifyGameday: null when team not in gameday', () => {
  assertEqual(classifyGameday({date:'2026-01-01'}, [makeGame(999,'beendet')], 159, TODAY), null);
});
test('classifyGameday: null when no games at all', () => {
  assertEqual(classifyGameday({date:'2026-01-01'}, [], 159, TODAY), null);
});
```

- [ ] **Reload browser — verify 30 pass, 0 fail**

---

## Task 7: HTML skeleton + CSS for widget.html

**Files:**
- Create: `widget.html`

- [ ] **Create `widget.html` with CSS (adapted from `renegades_scores.html`) and an empty script block**

The CSS uses `--accent` CSS variable for the team color. All API text content will be inserted via `escapeHtml()` in Task 10.

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spielplan Widget</title>
  <style>
    :root { --accent: #ff4500; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d0d0d; color: #f0f0f0; padding: 20px; }
    .widget-wrapper { max-width: 900px; margin: 0 auto; }
    .team-block { margin-bottom: 48px; }
    .team-title {
      font-size: 1.6rem; font-weight: 800; color: var(--accent);
      text-transform: uppercase; letter-spacing: 2px;
      margin-bottom: 24px; padding-bottom: 8px; border-bottom: 2px solid var(--accent);
    }
    .section-title {
      font-size: 0.85rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 3px; color: #888; margin: 24px 0 12px 0;
    }
    .progress-wrap { margin: 12px 0; }
    .progress-bar-bg { background: #222; border-radius: 4px; height: 6px; overflow: hidden; }
    .progress-bar-fg { background: var(--accent); height: 6px; border-radius: 4px; transition: width 0.2s ease; }
    .progress-label { font-size: 0.75rem; color: #666; margin-top: 6px; }
    .live-banner {
      background: #ff0000; color: #fff; border-radius: 8px;
      padding: 16px 20px; margin-bottom: 12px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
    }
    .live-banner .live-badge {
      background: #fff; color: #ff0000; font-weight: 900;
      font-size: 0.7rem; letter-spacing: 2px; padding: 3px 8px;
      border-radius: 4px; animation: blink 1s infinite;
    }
    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .live-banner .live-info { flex: 1; font-size: 1rem; font-weight: 600; }
    .live-banner .live-score { font-size: 1.4rem; font-weight: 900; }
    .live-banner a {
      background: #fff; color: #ff0000; text-decoration: none;
      font-weight: 700; font-size: 0.8rem; padding: 8px 14px;
      border-radius: 6px; white-space: nowrap;
    }
    .gameday-card {
      background: #1a1a1a; border: 1px solid #2a2a2a;
      border-radius: 10px; margin-bottom: 16px; overflow: hidden;
    }
    .gameday-header {
      background: #222; padding: 12px 18px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; border-bottom: 1px solid #333;
    }
    .gameday-header .gd-name { font-weight: 700; font-size: 1rem; color: #fff; }
    .gameday-header .gd-meta { font-size: 0.75rem; color: #888; display: flex; gap: 12px; }
    .gameday-header .gd-league {
      background: #333; color: #ccc; padding: 2px 8px;
      border-radius: 4px; font-size: 0.7rem; font-weight: 600;
    }
    .game-row {
      padding: 14px 18px; display: grid;
      grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 12px; border-bottom: 1px solid #222;
    }
    .game-row:last-child { border-bottom: none; }
    .game-row .team-home { text-align: right; font-weight: 600; font-size: 0.95rem; }
    .game-row .team-away { text-align: left;  font-weight: 600; font-size: 0.95rem; }
    .team-home.highlight, .team-away.highlight { color: var(--accent); }
    .game-row .score-box { text-align: center; min-width: 90px; }
    .score-box .time { font-size: 0.75rem; color: #888; }
    .score-box .score { font-size: 1.2rem; font-weight: 900; color: #fff; }
    .score-box .score.win  { color: #4caf50; }
    .score-box .score.loss { color: #f44336; }
    .score-box .score.draw { color: #ff9800; }
    .score-box .stage-label { font-size: 0.65rem; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .score-box .upcoming-time { font-size: 0.85rem; font-weight: 700; color: #aaa; }
    .no-data { color: #555; font-style: italic; font-size: 0.9rem; padding: 16px 0; }
    .loading  { color: #555; font-size: 0.85rem; padding: 20px 0; text-align: center; }
    .error-banner {
      background: #2a1010; border: 1px solid #5a2020;
      border-radius: 8px; padding: 12px 16px;
      color: #f44336; font-size: 0.85rem; margin-bottom: 12px;
    }
    @media (max-width: 600px) {
      .game-row { gap: 6px; padding: 12px; }
      .game-row .team-home, .game-row .team-away { font-size: 0.8rem; }
      .score-box .score { font-size: 1rem; }
    }
  </style>
</head>
<body>
<div class="widget-wrapper" id="root"></div>
<script>
// JS added in Tasks 8-12
</script>
</body>
</html>
```

- [ ] **Open `widget.html` in browser — verify black empty page with no console errors**

---

## Task 8: Constants + utility functions in widget.html

**Files:**
- Modify: `widget.html` (replace `// JS added` comment with actual content)

- [ ] **Replace the script comment with the constants and pure functions block**

```js
// ── CONSTANTS ────────────────────────────────────────────────────────────────
var API_BASE          = 'https://leaguesphere.app/api';
var LIVETICKER_BASE   = 'https://leaguesphere.app/liveticker/';
var BATCH_SIZE        = 50;
var DISCOVERY_TTL_MS  = 7 * 24 * 60 * 60 * 1000;
var CACHE_VERSION     = 1;

// ── URL PARAMS ───────────────────────────────────────────────────────────────
function parseConfigFromSearch(search) {
  var params  = new URLSearchParams(search);
  var teams   = params.getAll('t').map(Number).filter(function(n) { return Number.isInteger(n) && n > 0; });
  var color   = (params.get('color') || 'ff4500').replace(/^#/, '');
  var refresh = params.has('refresh');
  return { teams: teams, color: color, refresh: refresh };
}
function parseConfig() { return parseConfigFromSearch(window.location.search); }

// ── SECURITY ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── UTILS ────────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
}

function getResultClass(teamId, results) {
  var me    = results.find(function(r) { return r.team_id === teamId; });
  var other = results.find(function(r) { return r.team_id !== teamId; });
  if (!me || !other || me.pa == null) return '';
  if (me.pa > other.pa) return 'win';
  if (me.pa < other.pa) return 'loss';
  return 'draw';
}

var NAME_MAP = {
  'Nürn': 'Nürnberg Renegades', 'Nürn2': 'Nürnberg Renegades II',
  'Spatz': 'München Spatzen', 'Würz': 'Würzburg',
  'Lions': 'Erlangen Lions', 'LLions': 'Landsberg Lions',
  'Kelk': 'Kelkheim Lizzards', 'Werra': 'Werratal',
  'Bamb': 'Bamberg', 'Regen': 'Regensburg', 'Regen2': 'Regensburg 2',
  'Ingol': 'Ingolstadt', 'Ingol2': 'Ingolstadt II',
  'Erlangen2': 'Erlangen 2', 'Ramsenthal': 'Ramsenthal',
  'Ramsenthal2': 'Ramsenthal II', 'Rodental': 'Rödental', 'Erding2': 'Erding II',
};
function resolveTeamName(abbrev) { return NAME_MAP[abbrev] || abbrev; }

// ── CACHE ────────────────────────────────────────────────────────────────────
function cacheKey(teamId) { return 'lsw_' + teamId; }

function loadCache(teamId, storage) {
  var store = storage || localStorage;
  try {
    var raw = store.getItem(cacheKey(teamId));
    if (!raw) return null;
    var cache = JSON.parse(raw);
    if (cache.version !== CACHE_VERSION) return null;
    return cache;
  } catch(e) { return null; }
}

function saveCache(teamId, data, storage) {
  var store = storage || localStorage;
  try {
    store.setItem(cacheKey(teamId), JSON.stringify(Object.assign({}, data, { version: CACHE_VERSION })));
    return true;
  } catch(e) { return false; }
}

function clearCache(teamId, storage) {
  var store = storage || localStorage;
  try { store.removeItem(cacheKey(teamId)); } catch(e) {}
}

function needsDiscovery(cache) {
  if (!cache) return true;
  return new Date(cache.next_discovery) <= new Date();
}

// ── CONCURRENCY ──────────────────────────────────────────────────────────────
async function batchedAll(items, asyncFn, batchSize, onBatchDone) {
  var results = [];
  for (var i = 0; i < items.length; i += batchSize) {
    var batch       = items.slice(i, i + batchSize);
    var batchResult = await Promise.all(batch.map(asyncFn));
    results.push.apply(results, batchResult);
    if (onBatchDone) onBatchDone(results.length, items.length);
  }
  return results;
}

// ── CLASSIFICATION ───────────────────────────────────────────────────────────
function classifyGameday(gd, games, teamId, today) {
  var t = today || new Date().toISOString().slice(0, 10);
  var teamGames = games.filter(function(g) {
    return g.results.some(function(r) { return r.team_id === teamId; });
  });
  if (teamGames.length === 0) return null;
  var allDone = teamGames.every(function(g) { return g.status === 'beendet'; });
  if (gd.date <= t && allDone) return 'past';
  return 'active';
}
```

- [ ] **Reload `widget.html` — verify no console errors**

---

## Task 9: API module + discovery in widget.html

**Files:**
- Modify: `widget.html` (append to script block)

- [ ] **Append API and discovery functions after the classification function**

```js
// ── API ──────────────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' - ' + url);
  return res.json();
}

async function fetchAllGamedays() {
  var data = await fetchJSON(API_BASE + '/gamedays/?format=json&page_size=1000');
  return data.results;
}

async function fetchGames(gamedayId) {
  return fetchJSON(API_BASE + '/gamedays/' + gamedayId + '/games/?format=json');
}

async function fetchGamedayDetail(gamedayId) {
  return fetchJSON(API_BASE + '/gamedays/' + gamedayId + '/?format=json');
}

// ── DISCOVERY ────────────────────────────────────────────────────────────────
async function discoverNewGamedays(teamId, knownIds, onProgress) {
  var allGamedays = await fetchAllGamedays();
  var newGamedays = allGamedays.filter(function(gd) { return !knownIds.has(gd.id); });
  if (newGamedays.length === 0) return [];

  var entries = await batchedAll(newGamedays, async function(gd) {
    try {
      var games = await fetchGames(gd.id);
      return { gd: gd, games: games };
    } catch(e) { return null; }
  }, BATCH_SIZE, onProgress);

  return entries
    .filter(function(e) { return e !== null; })
    .filter(function(e) {
      return e.games.some(function(g) {
        return g.results.some(function(r) { return r.team_id === teamId; });
      });
    });
}
```

- [ ] **Smoke-test in browser DevTools console:**

```js
// paste and run:
fetchAllGamedays().then(function(r) { console.log('Total:', r.length); });
// Expected output: Total: 734

fetchGames(645).then(function(g) { console.log('Games in 645:', g.length); });
// Expected output: Games in 645: (some positive number)
```

---

## Task 10: Render functions in widget.html

**Files:**
- Modify: `widget.html` (append to script block)

All API string values go through `escapeHtml()` before being placed in HTML.

- [ ] **Append render functions**

```js
// ── RENDER ───────────────────────────────────────────────────────────────────
function renderProgress(done, total) {
  var pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return '<div class="progress-wrap">'
    + '<div class="progress-bar-bg"><div class="progress-bar-fg" style="width:' + pct + '%"></div></div>'
    + '<div class="progress-label">Erkenne Spieltage… ' + done + ' / ' + total + '</div>'
    + '</div>';
}

function renderLiveBanner(game, gd, teamId) {
  var home = game.results.find(function(r) { return r.isHome; });
  var away = game.results.find(function(r) { return !r.isHome; });
  if (!home || !away) return '';
  var homeName  = escapeHtml(resolveTeamName(home.team_name));
  var awayName  = escapeHtml(resolveTeamName(away.team_name));
  var gdName    = escapeHtml(gd.name);
  var league    = escapeHtml(gd.league_display || '');
  var tickerUrl = LIVETICKER_BASE + '?gameday=' + encodeURIComponent(gd.id);
  return '<div class="live-banner">'
    + '<span class="live-badge">● LIVE</span>'
    + '<div class="live-info">' + homeName + ' vs. ' + awayName + '<br><small>' + gdName + ' · ' + league + '</small></div>'
    + '<div class="live-score">' + game.halftime_score.home + ' : ' + game.halftime_score.away + '</div>'
    + '<a href="' + tickerUrl + '" target="_blank">🔴 Liveticker</a>'
    + '</div>';
}

function renderGameRow(game, teamId, showScore) {
  var home = game.results.find(function(r) { return r.isHome; });
  var away = game.results.find(function(r) { return !r.isHome; });
  if (!home || !away) return '';

  var homeName = escapeHtml(resolveTeamName(home.team_name));
  var awayName = escapeHtml(resolveTeamName(away.team_name));
  var homeHL   = home.team_id === teamId ? ' highlight' : '';
  var awayHL   = away.team_id === teamId ? ' highlight' : '';
  var stage    = escapeHtml(game.stage || '');
  var standing = game.standing ? ' · ' + escapeHtml(game.standing) : '';
  var time     = escapeHtml(game.scheduled.slice(0, 5));
  var field    = escapeHtml(String(game.field));

  var scoreHTML;
  if (!showScore) {
    scoreHTML = '<div class="upcoming-time">' + time + ' Uhr</div>';
  } else {
    var cls = getResultClass(teamId, game.results);
    var hs  = game.halftime_score;
    var fs  = game.final_score;
    scoreHTML = '<div class="score ' + cls + '">' + fs.home + ' : ' + fs.away + '</div>'
      + '<div class="stage-label">HZ: ' + hs.home + ':' + hs.away + '</div>';
  }

  return '<div class="game-row">'
    + '<div class="team-home' + homeHL + '">' + homeName + '</div>'
    + '<div class="score-box">'
    +   '<div class="time">' + time + ' Uhr · Feld ' + field + '</div>'
    +   scoreHTML
    +   '<div class="stage-label">' + stage + standing + '</div>'
    + '</div>'
    + '<div class="team-away' + awayHL + '">' + awayName + '</div>'
    + '</div>';
}

function renderGamedayCard(gd, games, teamId, showScore) {
  var teamGames = games.filter(function(g) {
    return g.results.some(function(r) { return r.team_id === teamId; });
  });
  if (teamGames.length === 0) return '';

  var rows   = teamGames.map(function(g) { return renderGameRow(g, teamId, showScore); }).join('');
  var name   = escapeHtml(gd.name);
  var date   = escapeHtml(formatDate(gd.date));
  var start  = escapeHtml(gd.start);
  var league = escapeHtml(gd.league_display || '');
  var addrRaw = (gd.address || '').trim();
  var skipAddr = ['tba','tbd','','adresse folgt'].some(function(s) { return addrRaw.toLowerCase().startsWith(s); });
  var addr   = skipAddr ? '' : '<span>📍 ' + escapeHtml(addrRaw.split(',')[0]) + '</span>';

  return '<div class="gameday-card">'
    + '<div class="gameday-header">'
    +   '<div><div class="gd-name">' + name + '</div>'
    +   '<div class="gd-meta"><span>📅 ' + date + '</span><span>🕙 ' + start + ' Uhr</span>' + addr + '</div></div>'
    +   '<div class="gd-league">' + league + '</div>'
    + '</div>'
    + rows
    + '</div>';
}

function resolveTeamAbbrev(teamId, entries) {
  for (var i = 0; i < entries.length; i++) {
    var games = entries[i].games;
    for (var j = 0; j < games.length; j++) {
      var r = games[j].results.find(function(r) { return r.team_id === teamId; });
      if (r) return r.team_name;
    }
  }
  return String(teamId);
}
```

---

## Task 11: Main orchestration + init in widget.html

**Files:**
- Modify: `widget.html` (append to script block)

- [ ] **Append `loadTeam` and the init IIFE**

```js
// ── LOAD TEAM ────────────────────────────────────────────────────────────────
async function loadTeam(teamId, els) {
  var today = new Date().toISOString().slice(0, 10);
  var cache = loadCache(teamId);

  // Show cached past data immediately (instant)
  if (cache && cache.past && cache.past.length) {
    var sorted = cache.past.slice().sort(function(a,b) { return b.gd.date.localeCompare(a.gd.date); });
    els.past.innerHTML = sorted.map(function(e) { return renderGamedayCard(e.gd, e.games, teamId, true); }).join('');
  }

  // Discover new gamedays if cache expired or missing
  if (needsDiscovery(cache)) {
    var knownIds = new Set(
      (cache && cache.past ? cache.past.map(function(p) { return p.id; }) : [])
      .concat(cache && cache.active_ids ? cache.active_ids : [])
    );

    els.future.innerHTML = renderProgress(0, 1);

    var newEntries = await discoverNewGamedays(teamId, knownIds, function(done, total) {
      els.future.innerHTML = renderProgress(done, total);
    });

    if (!cache) cache = { past: [], active_ids: [] };

    newEntries.forEach(function(e) {
      var cls = classifyGameday(e.gd, e.games, teamId, today);
      if (cls === 'past' && !cache.past.some(function(p) { return p.id === e.gd.id; })) {
        cache.past.push({ id: e.gd.id, gd: e.gd, games: e.games });
      } else if (cls === 'active' && cache.active_ids.indexOf(e.gd.id) === -1) {
        cache.active_ids.push(e.gd.id);
      }
    });

    cache.next_discovery = new Date(Date.now() + DISCOVERY_TTL_MS).toISOString();
    cache.scanned_at     = new Date().toISOString();
  }

  // Always re-fetch active gamedays for current scores/status
  var activeEntries = (await Promise.all(
    (cache.active_ids || []).map(async function(id) {
      try {
        var results = await Promise.all([fetchGamedayDetail(id), fetchGames(id)]);
        var gd    = results[0];
        var games = results[1];
        gd.league_display = gd.league_display || '';
        return { id: id, gd: gd, games: games };
      } catch(e) { return null; }
    })
  )).filter(Boolean);

  // Promote completed active gamedays to permanent past cache
  var newActiveIds = [];
  activeEntries.forEach(function(e) {
    var cls = classifyGameday(e.gd, e.games, teamId, today);
    if (cls === 'past') {
      if (!cache.past.some(function(p) { return p.id === e.id; }))
        cache.past.push({ id: e.id, gd: e.gd, games: e.games });
    } else {
      newActiveIds.push(e.id);
    }
  });
  cache.active_ids = newActiveIds;
  saveCache(teamId, cache);

  // Resolve display name from first matching game result
  var allEntries = cache.past.concat(activeEntries);
  var abbrev      = resolveTeamAbbrev(teamId, allEntries);
  els.title.textContent = '🏈 ' + resolveTeamName(abbrev);

  // Live section
  var liveItems = [];
  activeEntries.forEach(function(e) {
    e.games.forEach(function(g) {
      if (g.status === 'live' && g.results.some(function(r) { return r.team_id === teamId; }))
        liveItems.push({ game: g, gd: e.gd });
    });
  });
  if (liveItems.length) {
    els.live.innerHTML = '<div class="section-title">🔴 Live jetzt</div>'
      + liveItems.map(function(x) { return renderLiveBanner(x.game, x.gd, teamId); }).join('');
  } else {
    els.live.innerHTML = '';
  }

  // Past section
  var pastSorted = cache.past.slice().sort(function(a,b) { return b.gd.date.localeCompare(a.gd.date); });
  els.past.innerHTML = pastSorted.length
    ? pastSorted.map(function(e) { return renderGamedayCard(e.gd, e.games, teamId, true); }).join('')
    : '<div class="no-data">Keine vergangenen Spieltage gefunden.</div>';

  // Future/active section
  var futureEntries = activeEntries
    .filter(function(e) { return classifyGameday(e.gd, e.games, teamId, today) === 'active'; })
    .sort(function(a,b) { return a.gd.date.localeCompare(b.gd.date); });
  els.future.innerHTML = futureEntries.length
    ? futureEntries.map(function(e) { return renderGamedayCard(e.gd, e.games, teamId, false); }).join('')
    : '<div class="no-data">Keine kommenden Spieltage geplant.</div>';
}

// ── INIT ─────────────────────────────────────────────────────────────────────
(async function() {
  var cfg = parseConfig();
  document.documentElement.style.setProperty('--accent', '#' + cfg.color);

  if (cfg.teams.length === 0) {
    document.getElementById('root').innerHTML =
      '<div class="error-banner">Kein Team konfiguriert. Bitte ?t=&lt;team_id&gt; in der URL angeben.</div>';
    return;
  }

  if (cfg.refresh) cfg.teams.forEach(function(id) { clearCache(id); });

  var root   = document.getElementById('root');
  var elMap  = {};

  cfg.teams.forEach(function(teamId) {
    var block = document.createElement('div');
    block.className = 'team-block';
    block.innerHTML = '<div class="team-title" id="t-title-' + teamId + '">🏈 Team ' + teamId + '</div>'
      + '<div id="t-live-'   + teamId + '"></div>'
      + '<div class="section-title">▼ Vergangene Spieltage</div>'
      + '<div id="t-past-'   + teamId + '"><div class="loading">Lade Daten…</div></div>'
      + '<div class="section-title">▲ Kommende Spieltage</div>'
      + '<div id="t-future-' + teamId + '"><div class="loading">Lade Daten…</div></div>';
    root.appendChild(block);
    elMap[teamId] = {
      title:  document.getElementById('t-title-'  + teamId),
      live:   document.getElementById('t-live-'   + teamId),
      past:   document.getElementById('t-past-'   + teamId),
      future: document.getElementById('t-future-' + teamId),
    };
  });

  await Promise.all(cfg.teams.map(async function(teamId) {
    try {
      await loadTeam(teamId, elMap[teamId]);
    } catch(err) {
      console.error('Widget error (team ' + teamId + '):', err);
      elMap[teamId].future.innerHTML =
        '<div class="error-banner">Fehler beim Laden: ' + escapeHtml(err.message) + '</div>';
    }
  }));
})();
```

- [ ] **Open `widget.html?t=159&t=287` in browser — verify:**
  - Both team blocks appear: "Team 159" / "Team 287" initially
  - Progress bar appears and updates during scan (~28s first load)
  - After scan: team names resolve (e.g. "Nürnberg Renegades")
  - Past results shown with scores, W/L coloring
  - Upcoming games shown with times
  - No console errors

- [ ] **Reload the same URL — verify instant load (no progress bar, < 3s)**

- [ ] **Open `widget.html?t=159&refresh=1` — verify full rescan runs again (progress bar appears)**

---

## Task 12: Error handling verification

**Files:**
- `widget.html` (already handled — manual verification only)

- [ ] **Test: invalid team ID**

Open `widget.html?t=99999` — expected:
- Progress bar runs through full scan
- "Keine vergangenen Spieltage gefunden." and "Keine kommenden Spieltage geplant."
- Title stays "Team 99999" (no game data to resolve name)
- No console errors

- [ ] **Test: no team param**

Open `widget.html` — expected: error banner "Kein Team konfiguriert…" appears

- [ ] **Test: color override**

Open `widget.html?t=159&color=1e90ff` — expected: title, highlight, and progress bar are all blue

- [ ] **Test: mobile layout**

Resize browser to 375px — verify game rows are readable with no horizontal scroll

---

## Task 13: generator.html

**Files:**
- Create: `generator.html`

- [ ] **Create `generator.html`**

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Generator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0d0d0d; color: #f0f0f0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 1.4rem; color: #ff4500; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 0.9rem; margin-bottom: 32px; }
    label { display: block; font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; margin-top: 20px; }
    input[type=number] {
      background: #1a1a1a; border: 1px solid #333; color: #f0f0f0;
      border-radius: 6px; padding: 10px 14px; font-size: 1rem; width: 100%;
    }
    input[type=color] {
      background: #1a1a1a; border: 1px solid #333; border-radius: 6px;
      height: 44px; padding: 4px; cursor: pointer; width: 100%;
    }
    .team-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
    .team-row input { flex: 1; }
    .team-status { font-size: 0.8rem; color: #888; min-width: 180px; }
    .team-status.ok  { color: #4caf50; }
    .team-status.err { color: #f44336; }
    button {
      background: #ff4500; color: #fff; border: none; border-radius: 6px;
      padding: 10px 20px; font-size: 0.9rem; cursor: pointer; font-weight: 700; margin-top: 8px;
    }
    button:hover { background: #e03d00; }
    button.secondary { background: #222; border: 1px solid #333; color: #f0f0f0; }
    button.secondary:hover { background: #2a2a2a; }
    #output-section { margin-top: 32px; display: none; }
    #output-section h2 { font-size: 1rem; margin-bottom: 12px; color: #ccc; }
    textarea {
      width: 100%; background: #1a1a1a; border: 1px solid #333; color: #4caf50;
      border-radius: 6px; padding: 14px; font-family: monospace;
      font-size: 0.85rem; resize: vertical; min-height: 100px;
    }
    .copy-row { display: flex; gap: 10px; margin-top: 10px; align-items: center; }
    .copy-confirm { font-size: 0.8rem; color: #4caf50; opacity: 0; transition: opacity 0.3s; }
    .copy-confirm.show { opacity: 1; }
    .preview-link { margin-top: 12px; }
    .preview-link a { color: #ff4500; font-size: 0.85rem; }
  </style>
</head>
<body>
<div class="container">
  <h1>Widget Generator</h1>
  <p class="subtitle">Team-IDs eingeben, Farbe wählen, Embed-Code kopieren.</p>

  <label>Teams (team_id aus LeagueSphere)</label>
  <div id="teams-container">
    <div class="team-row">
      <input type="number" placeholder="z.B. 159" min="1" class="team-id-input">
      <span class="team-status">-</span>
    </div>
  </div>
  <button class="secondary" id="add-team-btn" type="button">+ Team hinzufügen</button>

  <label>Akzentfarbe</label>
  <input type="color" id="color-input" value="#ff4500">

  <div style="margin-top:24px">
    <button id="generate-btn" type="button">Embed-Code generieren</button>
  </div>

  <div id="output-section">
    <h2>Embed-Code</h2>
    <textarea id="embed-output" readonly></textarea>
    <div class="copy-row">
      <button class="secondary" id="copy-btn" type="button">Kopieren</button>
      <span class="copy-confirm" id="copy-confirm">Kopiert!</span>
    </div>
    <div class="preview-link">
      <a id="preview-link" href="#" target="_blank">Vorschau öffnen</a>
    </div>
  </div>
</div>

<script>
var API_BASE = 'https://leaguesphere.app/api';

document.getElementById('add-team-btn').addEventListener('click', function() {
  var row = document.createElement('div');
  row.className = 'team-row';
  row.innerHTML = '<input type="number" placeholder="z.B. 287" min="1" class="team-id-input"><span class="team-status">-</span>';
  document.getElementById('teams-container').appendChild(row);
});

async function findTeamAbbrev(teamId) {
  try {
    var data  = await fetch(API_BASE + '/gamedays/?format=json&page_size=20').then(function(r) { return r.json(); });
    for (var i = 0; i < data.results.length; i++) {
      var games = await fetch(API_BASE + '/gamedays/' + data.results[i].id + '/games/?format=json').then(function(r) { return r.json(); });
      for (var j = 0; j < games.length; j++) {
        var found = games[j].results.find(function(r) { return r.team_id === teamId; });
        if (found) return found.team_name;
      }
    }
    return null;
  } catch(e) { return null; }
}

document.getElementById('generate-btn').addEventListener('click', async function() {
  var inputs  = document.querySelectorAll('.team-id-input');
  var teams   = [];
  var hasErr  = false;

  for (var i = 0; i < inputs.length; i++) {
    var input    = inputs[i];
    var id       = parseInt(input.value, 10);
    var statusEl = input.parentElement.querySelector('.team-status');

    if (!id || id <= 0) {
      statusEl.textContent = 'Ungültige ID';
      statusEl.className   = 'team-status err';
      hasErr = true;
      continue;
    }

    statusEl.textContent = 'Prüfe...';
    statusEl.className   = 'team-status';
    var abbrev = await findTeamAbbrev(id);

    if (abbrev) {
      statusEl.textContent = 'Gefunden: ' + abbrev;
      statusEl.className   = 'team-status ok';
    } else {
      statusEl.textContent = 'Nicht in letzten 20 Spieltagen, wird trotzdem hinzugefügt';
      statusEl.className   = 'team-status';
    }
    teams.push(id);
  }

  if (hasErr || teams.length === 0) return;

  var color  = document.getElementById('color-input').value.replace('#', '');
  var base   = window.location.href.replace('generator.html', 'widget.html');
  var params = teams.map(function(t) { return 't=' + t; }).join('&') + '&color=' + color;
  var src    = base + '?' + params;

  var embedCode = '<iframe\n  src="' + src + '"\n  width="100%"\n  height="800"\n  frameborder="0"\n  style="border:none;"\n></iframe>';

  document.getElementById('embed-output').value = embedCode;
  document.getElementById('preview-link').href  = src;
  document.getElementById('output-section').style.display = 'block';
});

document.getElementById('copy-btn').addEventListener('click', function() {
  navigator.clipboard.writeText(document.getElementById('embed-output').value).catch(function() {
    document.getElementById('embed-output').select();
    document.execCommand('copy');
  });
  var confirm = document.getElementById('copy-confirm');
  confirm.classList.add('show');
  setTimeout(function() { confirm.classList.remove('show'); }, 2000);
});
</script>
</body>
</html>
```

- [ ] **Open `generator.html` and test manually:**
  1. Enter `159` → click "Embed-Code generieren" → status shows "Gefunden: Nürn"
  2. Click "+ Team hinzufügen" → enter `287` → generate again → both teams in output
  3. Click "Kopieren" → "Kopiert!" flash appears
  4. Click "Vorschau öffnen" → `widget.html` opens with both teams

---

## Task 14: End-to-end verification

- [ ] **Cold cache test — clear localStorage, open `widget.html?t=159&t=287`**

In DevTools → Application → Local Storage → delete keys `lsw_159` and `lsw_287`, then reload:
- Progress bar appears and advances
- After ~28s: both teams show correct names, scores, upcoming games

- [ ] **Warm cache test — reload immediately**
- No progress bar for past section
- Page content in < 3s

- [ ] **Full flow via generator — open `generator.html`, enter 159 + 287, click generate, click "Vorschau öffnen"**
- `widget.html` opens with correct data for both teams

- [ ] **Commit the finished files**

```
git add widget.html generator.html test.html
git commit -m "feat: configurable scores widget with auto-discovery and localStorage cache"
```
