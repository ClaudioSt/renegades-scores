# Spielplan Live Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live score polling (30s) and a configurable `?live_url=` parameter to the spielplan view — live game banners become clickable links, and today's gameday games are split and rendered by status (live → banner, finished → past section with score, upcoming → future section with time).

**Architecture:** All changes are in `widget.html`. A new `startSpielplanPolling()` function does lightweight 30s polling via the liveticker API, updating only score DOM elements. `renderLiveBanner` gains a `liveUrl` param that turns the outer `<div>` into an `<a>` when set. `loadTeam` gains today-aware game splitting using a new `splitTodayGames` helper.

**Tech Stack:** Vanilla JS, no build step. Tests use Node.js `node:test` runner with a VM-context test harness (`tests/helpers.js`).

---

## File Map

| File | Change |
|---|---|
| `widget.html` | All JS and CSS changes |
| `tests/spielplan-live.test.js` | New test file for this feature |

---

### Task 1: `parseConfigFromSearch` — add `liveUrl` param

**Files:**
- Create: `tests/spielplan-live.test.js`
- Modify: `widget.html` (line ~297, inside `parseConfigFromSearch`)

- [ ] **Step 1: Create the test file with `liveUrl` tests**

Create `tests/spielplan-live.test.js`:

```js
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshContext } = require('./helpers');

// ─── parseConfigFromSearch — liveUrl ─────────────────────────────────────────

describe('parseConfigFromSearch – liveUrl', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('defaults to empty string when live_url is absent', () => {
    assert.strictEqual(w.parseConfigFromSearch('?t=159').liveUrl, '');
  });

  it('accepts an https:// URL', () => {
    var url = 'https://renegades.de/live';
    assert.strictEqual(
      w.parseConfigFromSearch('?t=159&live_url=' + encodeURIComponent(url)).liveUrl,
      url
    );
  });

  it('accepts an http:// URL', () => {
    var url = 'http://example.com/live';
    assert.strictEqual(
      w.parseConfigFromSearch('?t=159&live_url=' + encodeURIComponent(url)).liveUrl,
      url
    );
  });

  it('rejects a javascript: URL (returns empty string)', () => {
    assert.strictEqual(
      w.parseConfigFromSearch('?t=159&live_url=' + encodeURIComponent('javascript:alert(1)')).liveUrl,
      ''
    );
  });

  it('rejects a relative path (returns empty string)', () => {
    assert.strictEqual(
      w.parseConfigFromSearch('?t=159&live_url=' + encodeURIComponent('/some/path')).liveUrl,
      ''
    );
  });

  it('rejects an empty string value (returns empty string)', () => {
    assert.strictEqual(
      w.parseConfigFromSearch('?t=159&live_url=').liveUrl,
      ''
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```
node --test "tests/spielplan-live.test.js"
```

Expected: all `liveUrl` tests fail with `TypeError: w.parseConfigFromSearch(...).liveUrl is undefined` or similar.

- [ ] **Step 3: Implement `liveUrl` in `parseConfigFromSearch`**

In `widget.html`, find `parseConfigFromSearch`. The function currently ends with:
```js
  var view        = params.get('view') || 'spielplan';
  return { teams: teams, color: color, refresh: refresh, past: past, future: future,
           showPast: showPast, showFuture: showFuture, showTitle: showTitle, compact: compact, view: view };
```

Replace with:
```js
  var view        = params.get('view') || 'spielplan';
  var liveUrl     = params.get('live_url') || '';
  if (liveUrl && !/^https?:\/\//.test(liveUrl)) liveUrl = '';
  return { teams: teams, color: color, refresh: refresh, past: past, future: future,
           showPast: showPast, showFuture: showFuture, showTitle: showTitle, compact: compact,
           view: view, liveUrl: liveUrl };
```

- [ ] **Step 4: Run the tests to verify they pass**

```
node --test "tests/spielplan-live.test.js"
```

Expected: all 6 `parseConfigFromSearch – liveUrl` tests pass.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/spielplan-live.test.js
git commit -m "feat: add liveUrl param to parseConfigFromSearch"
```

---

### Task 2: CSS hover styles for `a.live-banner`

**Files:**
- Modify: `widget.html` (inside `<style>` block, after existing live-ticker styles)

- [ ] **Step 1: Add CSS at the end of the `<style>` block**

In `widget.html`, find the closing `</style>` tag (line ~195). Just before it, insert:

```css
    /* live-banner as clickable link */
    a.live-banner {
      display: flex;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
    }
    a.live-banner:hover {
      background: rgba(255, 69, 0, 0.08);
      box-shadow: inset 3px 0 0 var(--accent);
      transition: background 0.15s;
    }
```

- [ ] **Step 2: Commit**

```bash
git add widget.html
git commit -m "feat: add hover style for a.live-banner"
```

---

### Task 3: `renderLiveBanner` — score ID, liveUrl param, conditional `<a>` wrapper

**Files:**
- Modify: `widget.html` (`renderLiveBanner` function, currently lines ~615–630)
- Modify: `tests/spielplan-live.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/spielplan-live.test.js`:

```js
// ─── renderLiveBanner ─────────────────────────────────────────────────────────

describe('renderLiveBanner', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function makeGame(id) {
    return {
      id: id || 100,
      status: 'live',
      halftime_score: { home: 14, away: 7 },
      final_score: null,
      results: [
        { team_id: 159, team_name: 'Nürn', isHome: true,  pa: 7  },
        { team_id: 200, team_name: 'Other', isHome: false, pa: 14 }
      ]
    };
  }

  function makeGd() {
    return { id: 77, name: 'Spieltag 7', league_display: 'RL Bayern' };
  }

  it('includes sp-live-score-<id> on score element', () => {
    var html = w.renderLiveBanner(makeGame(100), makeGd(), 159, '');
    assert.ok(html.includes('sp-live-score-100'), 'score element must have id sp-live-score-100');
  });

  it('renders as <div> when liveUrl is empty', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, '');
    assert.ok(html.startsWith('<div class="live-banner"'), 'outer element must be div when no liveUrl');
  });

  it('renders as <a> when liveUrl is set', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, 'https://renegades.de/live');
    assert.ok(html.startsWith('<a class="live-banner"'), 'outer element must be <a> when liveUrl set');
  });

  it('<a> banner has correct href, target, rel', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, 'https://renegades.de/live');
    assert.ok(html.includes('href="https://renegades.de/live"'), 'href must be set');
    assert.ok(html.includes('target="_blank"'), 'must open in new tab');
    assert.ok(html.includes('rel="noopener noreferrer"'), 'must have rel for security');
  });

  it('no inner <a> button when liveUrl is set', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, 'https://renegades.de/live');
    // The only <a> must be the outer wrapper — no nested <a href=...> button
    var firstClose = html.indexOf('</a>');
    assert.ok(html.lastIndexOf('<a ') <= 0 || html.indexOf('<a ') === 0,
      'must not have a nested <a> button inside the link banner');
  });

  it('preserves inner Liveticker button when liveUrl is absent', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, '');
    assert.ok(html.includes('Liveticker') || html.includes('href='), 'inner button must remain when no liveUrl');
  });

  it('shows halftime score in banner', () => {
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, '');
    assert.ok(html.includes('14 : 7') || html.includes('14:7'), 'halftime score must appear');
  });

  it('shows – : – when halftime_score is null', () => {
    var game = makeGame();
    game.halftime_score = null;
    var html = w.renderLiveBanner(game, makeGd(), 159, '');
    assert.ok(html.includes('– : –'), 'must show – : – when no score available');
  });

  it('escapes liveUrl special chars in href attribute', () => {
    var url = 'https://example.com/live?a=1&b=2';
    var html = w.renderLiveBanner(makeGame(), makeGd(), 159, url);
    // & in href must be escaped as &amp; for valid HTML
    assert.ok(html.includes('&amp;') || html.includes('a=1'), 'url must appear in href');
    assert.ok(!/<script/i.test(html), 'no script injection');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```
node --test "tests/spielplan-live.test.js"
```

Expected: the `renderLiveBanner` tests fail (score element has no ID, liveUrl param ignored).

- [ ] **Step 3: Rewrite `renderLiveBanner` in `widget.html`**

Find the current `renderLiveBanner` function (starts with `function renderLiveBanner(game, gd, teamId)`). Replace the entire function:

```js
function renderLiveBanner(game, gd, teamId, liveUrl) {
  var home = game.results.find(function(r) { return r.isHome; });
  var away = game.results.find(function(r) { return !r.isHome; });
  if (!home || !away) return '';
  var homeName = escapeHtml(resolveTeamName(home.team_name));
  var awayName = escapeHtml(resolveTeamName(away.team_name));
  var gdName   = escapeHtml(gd.name);
  var league   = escapeHtml(gd.league_display || '');
  var hs       = game.halftime_score;
  var scoreStr = (hs && hs.home != null && hs.away != null) ? hs.home + ' : ' + hs.away : '– : –';
  var inner = '<span class="live-badge">● LIVE</span>'
    + '<div class="live-info">' + homeName + ' vs. ' + awayName
    + '<br><small>' + gdName + ' · ' + league + '</small></div>'
    + '<div id="sp-live-score-' + game.id + '" class="live-score">' + scoreStr + '</div>';
  if (liveUrl) {
    return '<a class="live-banner" href="' + escapeHtml(liveUrl) + '"'
      + ' target="_blank" rel="noopener noreferrer">' + inner + '</a>';
  }
  var tickerUrl = LIVETICKER_BASE + '?gameday=' + encodeURIComponent(gd.id);
  return '<div class="live-banner">' + inner
    + '<a href="' + tickerUrl + '" target="_blank">🔴 Liveticker</a>'
    + '</div>';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
node --test "tests/spielplan-live.test.js"
```

Expected: all `renderLiveBanner` tests pass.

- [ ] **Step 5: Run the full test suite to check for regressions**

```
node --test "tests/*.test.js"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add widget.html tests/spielplan-live.test.js
git commit -m "feat: update renderLiveBanner with score ID and liveUrl link support"
```

---

### Task 4: New state vars + `splitTodayGames` helper + tests

**Files:**
- Modify: `widget.html` (var block ~line 210, new helper function in UTILS section)
- Modify: `tests/spielplan-live.test.js`

- [ ] **Step 1: Write failing tests for `splitTodayGames`**

Append to `tests/spielplan-live.test.js`:

```js
// ─── splitTodayGames ─────────────────────────────────────────────────────────

describe('splitTodayGames', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function makeGame(id, status) {
    return {
      id: id, status: status,
      results: [
        { team_id: 159, team_name: 'Nürn', isHome: true,  pa: 7 },
        { team_id: 200, team_name: 'Other', isHome: false, pa: 14 }
      ],
      scheduled: '10:00:00', field: '1', stage: '', standing: '',
      final_score: status === 'beendet' ? { home: 21, away: 14 } : null,
      halftime_score: null
    };
  }

  it('puts live games in live bucket', () => {
    var result = w.splitTodayGames([makeGame(1, 'live')], 159);
    assert.strictEqual(result.live.length, 1);
    assert.strictEqual(result.finished.length, 0);
    assert.strictEqual(result.upcoming.length, 0);
  });

  it('puts beendet games in finished bucket', () => {
    var result = w.splitTodayGames([makeGame(2, 'beendet')], 159);
    assert.strictEqual(result.finished.length, 1);
    assert.strictEqual(result.live.length, 0);
    assert.strictEqual(result.upcoming.length, 0);
  });

  it('puts scheduled games in upcoming bucket', () => {
    var result = w.splitTodayGames([makeGame(3, 'Geplant')], 159);
    assert.strictEqual(result.upcoming.length, 1);
    assert.strictEqual(result.live.length, 0);
    assert.strictEqual(result.finished.length, 0);
  });

  it('splits a mixed-status gameday correctly', () => {
    var games = [
      makeGame(10, 'live'),
      makeGame(11, 'beendet'),
      makeGame(12, 'Geplant'),
    ];
    var result = w.splitTodayGames(games, 159);
    assert.strictEqual(result.live.length,     1);
    assert.strictEqual(result.finished.length, 1);
    assert.strictEqual(result.upcoming.length, 1);
  });

  it('excludes games not involving the watched teamId', () => {
    var otherGame = {
      id: 99, status: 'live',
      results: [
        { team_id: 1, team_name: 'A', isHome: true,  pa: 0 },
        { team_id: 2, team_name: 'B', isHome: false, pa: 0 }
      ],
      scheduled: '10:00:00', field: '1', stage: '', standing: '',
      final_score: null, halftime_score: null
    };
    var result = w.splitTodayGames([otherGame], 159);
    assert.strictEqual(result.live.length, 0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```
node --test "tests/spielplan-live.test.js"
```

Expected: `splitTodayGames` tests fail with `TypeError: w.splitTodayGames is not a function`.

- [ ] **Step 3: Add module-level state vars to `widget.html`**

In `widget.html`, find the var block near the top of the `<script>` (around line 210, where `_liveGames`, `_liveInterval`, etc. are declared). Add after `_liveSnap`:

```js
var _spielplanPollInterval = null;  // setInterval handle for spielplan live polling
var _spielplanLiveIds      = new Set(); // game IDs being polled across all teams
```

- [ ] **Step 4: Add `splitTodayGames` helper to `widget.html`**

In `widget.html`, find the `// ── UTILS` section (around line 318). Add the helper after `_toggleGameDetail`:

```js
function splitTodayGames(games, teamId) {
  var forTeam = games.filter(function(g) {
    return g.results.some(function(r) { return r.team_id === teamId; });
  });
  return {
    live:     forTeam.filter(function(g) { return g.status === 'live'; }),
    finished: forTeam.filter(function(g) { return g.status === 'beendet'; }),
    upcoming: forTeam.filter(function(g) { return g.status !== 'live' && g.status !== 'beendet'; }),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```
node --test "tests/spielplan-live.test.js"
```

Expected: all `splitTodayGames` tests pass.

- [ ] **Step 6: Run full suite**

```
node --test "tests/*.test.js"
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add widget.html tests/spielplan-live.test.js
git commit -m "feat: add splitTodayGames helper and spielplan poll state vars"
```

---

### Task 5: `startSpielplanPolling` + tests

**Files:**
- Modify: `widget.html` (add `startSpielplanPolling` in VIEW RENDERERS section)
- Modify: `tests/spielplan-live.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/spielplan-live.test.js`:

```js
// ─── startSpielplanPolling ───────────────────────────────────────────────────

describe('startSpielplanPolling', () => {
  function makeContext(fetchData, captureInterval) {
    var captured = { fn: null, cleared: false, intervalId: 1 };
    var w = freshContext({
      setInterval: function(fn, ms) {
        captured.fn = fn;
        captureInterval && captureInterval(captured);
        return captured.intervalId;
      },
      clearInterval: function() { captured.cleared = true; },
      fetch: async function() {
        return { ok: true, json: async function() { return fetchData; } };
      },
      document: {
        getElementById: function() { return null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){}, remove: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    return { w: w, captured: captured };
  }

  it('adds game IDs to _spielplanLiveIds', () => {
    var { w } = makeContext([]);
    w.startSpielplanPolling([101, 202]);
    assert.ok(w._spielplanLiveIds.has(101), '101 must be in the set');
    assert.ok(w._spielplanLiveIds.has(202), '202 must be in the set');
  });

  it('merges IDs from multiple calls into shared set', () => {
    var { w } = makeContext([]);
    w.startSpielplanPolling([101]);
    w.startSpielplanPolling([202]);
    assert.ok(w._spielplanLiveIds.has(101), '101 must be in the set');
    assert.ok(w._spielplanLiveIds.has(202), '202 must be in the set');
  });

  it('does not start a second interval when called twice', () => {
    var intervalCount = 0;
    var w = freshContext({
      setInterval: function() { intervalCount++; return intervalCount; },
      clearInterval: function() {},
      fetch: async function() { return { ok: true, json: async function() { return []; } }; },
      document: {
        getElementById: function() { return null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    w.startSpielplanPolling([101]);
    w.startSpielplanPolling([202]);
    assert.strictEqual(intervalCount, 1, 'setInterval must only be called once');
  });

  it('updates score element textContent on poll tick', async () => {
    var scoreEl = { textContent: '' };
    var pollFn;
    var w = freshContext({
      setInterval: function(fn) { pollFn = fn; return 1; },
      clearInterval: function() {},
      fetch: async function() {
        return { ok: true, json: async function() {
          return [{ gameId: 100, status: 'live', home: { score: 14 }, away: { score: 7 } }];
        }};
      },
      document: {
        getElementById: function(id) { return id === 'sp-live-score-100' ? scoreEl : null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    w.startSpielplanPolling([100]);
    pollFn();
    await new Promise(function(r) { setTimeout(r, 20); });
    assert.strictEqual(scoreEl.textContent, '14 : 7', 'score element must be updated');
  });

  it('removes game ID and clears interval when status is Beendet', async () => {
    var cleared = false;
    var pollFn;
    var w = freshContext({
      setInterval: function(fn) { pollFn = fn; return 1; },
      clearInterval: function() { cleared = true; },
      fetch: async function() {
        return { ok: true, json: async function() {
          return [{ gameId: 100, status: 'Beendet', home: { score: 21 }, away: { score: 14 } }];
        }};
      },
      document: {
        getElementById: function() { return null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    w.startSpielplanPolling([100]);
    pollFn();
    await new Promise(function(r) { setTimeout(r, 20); });
    assert.ok(!w._spielplanLiveIds.has(100), 'finished game ID must be removed');
    assert.ok(cleared, 'interval must be cleared when all games finished');
  });

  it('does not throw when score element is not in DOM', async () => {
    var pollFn;
    var w = freshContext({
      setInterval: function(fn) { pollFn = fn; return 1; },
      clearInterval: function() {},
      fetch: async function() {
        return { ok: true, json: async function() {
          return [{ gameId: 999, status: 'live', home: { score: 7 }, away: { score: 0 } }];
        }};
      },
      document: {
        getElementById: function() { return null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    w.startSpielplanPolling([999]);
    await assert.doesNotReject(async function() {
      pollFn();
      await new Promise(function(r) { setTimeout(r, 20); });
    });
  });

  it('silently ignores poll fetch errors', async () => {
    var pollFn;
    var w = freshContext({
      setInterval: function(fn) { pollFn = fn; return 1; },
      clearInterval: function() {},
      fetch: async function() { throw new Error('network error'); },
      document: {
        getElementById: function() { return null; },
        createElement:   function(tag) { return { tagName: tag, className: '', innerHTML: '', appendChild: function(){} }; },
        documentElement: { style: { setProperty: function(){} } },
        body:            { classList: { add: function(){} }, getBoundingClientRect: function(){ return { height: 0 }; } },
      },
    });
    w.startSpielplanPolling([100]);
    await assert.doesNotReject(async function() {
      pollFn();
      await new Promise(function(r) { setTimeout(r, 20); });
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```
node --test "tests/spielplan-live.test.js"
```

Expected: `startSpielplanPolling` tests fail with `TypeError: w.startSpielplanPolling is not a function`.

- [ ] **Step 3: Add `startSpielplanPolling` to `widget.html`**

In `widget.html`, find the `// ── VIEW RENDERERS` section (around line 930, just before `startLivePolling`). Add the new function directly before `startLivePolling`:

```js
function startSpielplanPolling(newGameIds) {
  newGameIds.forEach(function(id) { _spielplanLiveIds.add(id); });
  if (_spielplanPollInterval) return;

  function poll() {
    fetchJSON(LIVETICKER_API).then(function(data) {
      data.forEach(function(game) {
        if (!_spielplanLiveIds.has(game.gameId)) return;
        var el = document.getElementById('sp-live-score-' + game.gameId);
        if (el) el.textContent = game.home.score + ' : ' + game.away.score;
        if (game.status === 'Beendet') _spielplanLiveIds.delete(game.gameId);
      });
      if (_spielplanLiveIds.size === 0) {
        clearInterval(_spielplanPollInterval);
        _spielplanPollInterval = null;
      }
    }).catch(function() { /* silent — retry next tick */ });
  }

  _spielplanPollInterval = setInterval(poll, 30000);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
node --test "tests/spielplan-live.test.js"
```

Expected: all `startSpielplanPolling` tests pass.

- [ ] **Step 5: Run full suite**

```
node --test "tests/*.test.js"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add widget.html tests/spielplan-live.test.js
git commit -m "feat: add startSpielplanPolling (30s live score updates in spielplan)"
```

---

### Task 6: Wire everything into `loadTeam`

**Files:**
- Modify: `widget.html` (`loadTeam` function, live section + future section rendering)

This task has no new tests — the behaviour is covered by the unit tests above. The integration is verified by running the full suite.

- [ ] **Step 1: Pass `cfg.liveUrl` to `renderLiveBanner` and call `startSpielplanPolling`**

In `widget.html`, find the live section in `loadTeam` (around line 855):

```js
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
```

Replace with:

```js
  // Live section — only from today's active entries (not future gamedays)
  var liveItems = [];
  activeEntries.forEach(function(e) {
    if (e.gd.date !== today) return;
    e.games.forEach(function(g) {
      if (g.status === 'live' && g.results.some(function(r) { return r.team_id === teamId; }))
        liveItems.push({ game: g, gd: e.gd });
    });
  });
  if (liveItems.length) {
    els.live.innerHTML = '<div class="section-title">🔴 Live jetzt</div>'
      + liveItems.map(function(x) { return renderLiveBanner(x.game, x.gd, teamId, cfg.liveUrl); }).join('');
    startSpielplanPolling(liveItems.map(function(x) { return x.game.id; }));
  } else {
    els.live.innerHTML = '';
  }
```

- [ ] **Step 2: Collect today's finished games from active entries**

Directly after the live section block (still inside `loadTeam`), add:

```js
  // Today's finished games — rendered in past section with score
  var todayFinishedByGd = {};
  activeEntries.forEach(function(e) {
    if (e.gd.date !== today) return;
    var split = splitTodayGames(e.games, teamId);
    if (split.finished.length) {
      todayFinishedByGd[e.gd.id] = { gd: e.gd, games: split.finished };
    }
  });
```

- [ ] **Step 3: Prepend today's finished games to the past section**

Find the existing past section rendering block in `loadTeam` (around line 868):

```js
  // Past section — only re-render if a gameday was newly promoted from active
  if (els.past && pastChanged) {
    var pastSorted = cache.past.slice().sort(function(a,b) { return b.gd.date.localeCompare(a.gd.date); });
    if (!pastSorted.length) {
      els.past.innerHTML = '<div class="no-data">Keine vergangenen Spieltage gefunden.</div>';
    } else {
      _pastCache[teamId] = pastSorted;
      els.past.innerHTML = renderPastSection(pastSorted, teamId, cfg.past);
    }
  }
```

Replace with:

```js
  // Past section — re-render if a gameday promoted from active OR today has finished games
  var hasTodayFinished = Object.keys(todayFinishedByGd).length > 0;
  if (els.past && (pastChanged || hasTodayFinished)) {
    var pastSorted = cache.past.slice().sort(function(a,b) { return b.gd.date.localeCompare(a.gd.date); });
    _pastCache[teamId] = pastSorted;
    var todayFinishedHtml = Object.keys(todayFinishedByGd).map(function(gdId) {
      var entry = todayFinishedByGd[gdId];
      return renderGamedayCard(entry.gd, entry.games, teamId, true);
    }).join('');
    var pastBody = pastSorted.length
      ? renderPastSection(pastSorted, teamId, cfg.past)
      : '<div class="no-data">Keine vergangenen Spieltage gefunden.</div>';
    els.past.innerHTML = todayFinishedHtml + pastBody;
  }
```

- [ ] **Step 4: Filter today's finished and live games out of the future section**

Find the future section rendering in `loadTeam` (around line 879):

```js
  // Future/active section — only re-render if scores/status changed vs. snapshot
  if (els.future) {
    var futureEntries = activeEntries
      .filter(function(e) { return classifyGameday(e.gd, e.games, teamId, today) === 'active'; })
      .sort(function(a,b) { return a.gd.date.localeCompare(b.gd.date); });
```

Replace the `futureEntries` build (the two lines above, up to but not including `if (cfg.future > 0)`) with:

```js
  // Future/active section — only re-render if scores/status changed vs. snapshot
  if (els.future) {
    var futureEntries = activeEntries
      .filter(function(e) { return classifyGameday(e.gd, e.games, teamId, today) === 'active'; })
      .sort(function(a,b) { return a.gd.date.localeCompare(b.gd.date); })
      .map(function(e) {
        if (e.gd.date !== today) return e;
        // For today's gameday, only show upcoming games (not live or finished)
        var split = splitTodayGames(e.games, teamId);
        return { id: e.id, gd: e.gd, games: split.upcoming };
      })
      .filter(function(e) { return e.games.length > 0; });
```

- [ ] **Step 5: Run full suite to verify no regressions**

```
node --test "tests/*.test.js"
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add widget.html
git commit -m "feat: wire spielplan live score polling and today-gameday splitting into loadTeam"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `live_url` param, https?:// validation, default empty | Task 1 |
| `a.live-banner` hover CSS | Task 2 |
| `renderLiveBanner` score element ID `sp-live-score-<id>` | Task 3 |
| Outer `<a>` with href/target/rel when liveUrl set | Task 3 |
| No inner button when liveUrl set | Task 3 |
| `_spielplanPollInterval` and `_spielplanLiveIds` module vars | Task 4 |
| `splitTodayGames` helper | Task 4 |
| `startSpielplanPolling` — ID accumulation across teams | Task 5 |
| Double-start guard | Task 5 |
| Score DOM update on poll tick | Task 5 |
| `clearInterval` when all games Beendet | Task 5 |
| Silent error handling for poll failures | Task 5 |
| `loadTeam` passes `cfg.liveUrl` to `renderLiveBanner` | Task 6 |
| `startSpielplanPolling` called when live games found | Task 6 |
| Today's finished games → past section with score | Task 6 |
| Today's upcoming games → future section without score | Task 6 |
| Today's live games → live banner only | Task 6 (via liveItems filter to today only) |
| Non-today active entries unchanged | Task 6 (filter unchanged) |

**No placeholders found.**

**Type consistency:**
- `splitTodayGames(games, teamId)` → `{ live: [], finished: [], upcoming: [] }` — used identically in Task 4 (definition), Task 5 (tests not used), Task 6 (wiring).
- `startSpielplanPolling(ids)` — `ids` is an Array in Task 6 call site (`liveItems.map(...)`) and used as iterable with `.forEach` inside the function. ✓
- `_spielplanLiveIds` is a `Set`, `_spielplanPollInterval` is `null`/number — consistent throughout. ✓
- `renderLiveBanner(game, gd, teamId, liveUrl)` — 4-arg signature used in Task 3 (definition/tests) and Task 6 (call site). ✓
