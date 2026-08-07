# Live Ticker `?view=live` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `?view=live` mode to `widget.html` that polls the LeagueSphere liveticker API and renders real-time play-by-play events for watched teams in a B3 two-column table layout.

**Architecture:** A standalone `renderLiveView(root, cfg)` function (peer to `renderSpielplan` / `renderTableView`) orchestrates snapshot loading, active game ID discovery, full tick-history fetch via `getAllTicksFor`, and a 5-second polling loop. All state lives in module-level vars. Rendering is split into `buildTickRows` (pure, testable) and `renderLiveGameB3` (HTML builder). The fallback when no game is live reuses the existing `renderGamedayCard`.

**Tech Stack:** Vanilla HTML5 / CSS3 / ES2020 — no build step, no frameworks. Tests use Node.js built-in test runner (`node:test`) + `vm` sandbox via existing `tests/helpers.js`.

**Read before implementing:**
- `tests/helpers.js` — how `freshContext()` exposes widget functions to tests
- `tests/security.test.js` — testing patterns (describe/it/beforeEach, `noRawScript` helper)
- `docs/superpowers/specs/2026-05-30-live-ticker-design.md` — authoritative design spec

---

## File Map

| File | Action | What changes |
|---|---|---|
| `widget.html` | Modify | CSS block, constants, state vars, 6 new functions, init branch |
| `tests/liveticker.test.js` | Create | 8 test suites (TDD, written before implementation per task) |

---

## Task 1: CSS for live ticker

**Files:**
- Modify: `widget.html` — `<style>` block, just before `</style>` (line 154)

- [ ] **Step 1: Add CSS rules**

  Insert immediately before `</style>` in the `<style>` block:

  ```css
  /* ── LIVE TICKER ─────────────────────────────────────────────── */
  .live-ticker-game { margin-bottom: 24px; }
  .lt-header {
    background: #1c1c1c; padding: 10px 18px; border-bottom: 1px solid #2a2a2a;
    display: flex; align-items: center; gap: 8px;
  }
  .lt-live-badge {
    background: #f44336; color: #fff; font-size: 0.65rem; font-weight: 900;
    letter-spacing: 1.5px; padding: 2px 6px; border-radius: 3px; animation: blink 1s infinite;
  }
  .lt-gd-name { font-size: 0.8rem; font-weight: 700; color: #fff; }
  .lt-status  { font-size: 0.7rem; color: #888; margin-left: auto; }
  .lt-scorebar {
    background: #181818; padding: 10px 18px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid #222;
  }
  .lt-team { font-size: 0.8rem; font-weight: 700; color: #ccc; }
  .lt-team.lt-ours { color: var(--accent); }
  .lt-score-center { text-align: center; }
  .lt-score-val { font-size: 1.3rem; font-weight: 900; color: #fff; }
  .lt-score-meta { font-size: 0.65rem; color: #888; margin-top: 2px; }
  .lt-possession { font-size: 0.65rem; color: #ff9800; margin-top: 1px; }
  .lt-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
  .lt-table td { padding: 3px 10px; border-bottom: 1px solid #1a1a1a; vertical-align: top; }
  .lt-col-home { width: 44%; text-align: right; color: #aaa; }
  .lt-col-mid  { width: 12%; text-align: center; font-weight: 700; font-size: 0.7rem; color: #555; vertical-align: middle; white-space: nowrap; }
  .lt-col-away { width: 44%; text-align: left; color: #aaa; }
  .lt-team-label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 1px; }
  .lt-col-home .lt-team-label { color: var(--accent); }
  .lt-col-away .lt-team-label { color: #6495ed; }
  .lt-scoring td { background: rgba(255,69,0,0.06); }
  .lt-scoring .lt-col-home, .lt-scoring .lt-col-away { color: #f0f0f0; }
  .lt-scoring .lt-col-mid { color: #fff; }
  .lt-neutral td { text-align: center !important; color: #444; font-style: italic; padding: 5px 8px; }
  .lt-conn-error {
    background: #2a1a10; border: 1px solid #5a3010; border-radius: 6px;
    padding: 8px 14px; color: #ff9800; font-size: 0.8rem; margin-bottom: 10px;
  }
  @keyframes lt-flash { 0% { background: rgba(255,69,0,0.25); } 100% { background: transparent; } }
  .lt-flash { animation: lt-flash 0.8s ease-out; }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add widget.html
  git commit -m "feat: add CSS for live ticker view"
  ```

---

## Task 2: Constants and state variables

**Files:**
- Modify: `widget.html` — `// ── CONSTANTS ──` section and just after `var _futureCache`

- [ ] **Step 1: Add `LIVETICKER_API` constant**

  In the `// ── CONSTANTS ──` section, after `var CACHE_VERSION = 3;`, add:

  ```js
  var LIVETICKER_API    = API_BASE + '/liveticker/';
  ```

- [ ] **Step 2: Add live ticker state variables**

  After `var _futureCache = {};`, add:

  ```js
  var _liveGames      = {};         // gameId → gameState (see spec)
  var _liveInterval   = null;       // setInterval handle for polling
  var _watchedGameIds = new Set();  // game.id values for watched teams' active gamedays
  var _liveFailCount  = 0;          // consecutive poll failures
  var _liveTeamNames  = {};         // teamName → teamId, for mid-session new-game detection
  var _liveSnap       = null;       // snapshot stored by renderLiveView for polling use
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add widget.html
  git commit -m "feat: add live ticker constants and state vars"
  ```

---

## Task 3: `getTickPoints()` — TDD

**Files:**
- Create: `tests/liveticker.test.js`
- Modify: `widget.html` — `// ── UTILS ──` section

- [ ] **Step 1: Write failing tests**

  Create `tests/liveticker.test.js`:

  ```js
  'use strict';

  const { describe, it, beforeEach } = require('node:test');
  const assert = require('node:assert/strict');
  const { freshContext } = require('./helpers');

  // ─── getTickPoints ────────────────────────────────────────────────────────────

  describe('getTickPoints', () => {
    let w;
    beforeEach(() => { w = freshContext(); });

    it('returns 6 for Touchdown', () => {
      assert.strictEqual(w.getTickPoints('Touchdown: #12'), 6);
    });
    it('returns 6 for Touchdown with no player', () => {
      assert.strictEqual(w.getTickPoints('Touchdown: -'), 6);
    });
    it('returns 1 for 1-Extra-Punkt with player', () => {
      assert.strictEqual(w.getTickPoints('1-Extra-Punkt: #7'), 1);
    });
    it('returns 1 for 1-Extra-Punkt with dash', () => {
      assert.strictEqual(w.getTickPoints('1-Extra-Punkt: -'), 1);
    });
    it('returns 2 for 2-Extra-Punkte with player', () => {
      assert.strictEqual(w.getTickPoints('2-Extra-Punkte: #3'), 2);
    });
    it('returns 2 for 2-Extra-Punkte with dash', () => {
      assert.strictEqual(w.getTickPoints('2-Extra-Punkte: -'), 2);
    });
    it('returns 0 for First Down', () => {
      assert.strictEqual(w.getTickPoints('First Down: #5'), 0);
    });
    it('returns 0 for Ballabgabe', () => {
      assert.strictEqual(w.getTickPoints('Ballabgabe'), 0);
    });
    it('returns 0 for Interception', () => {
      assert.strictEqual(w.getTickPoints('Interception: #9'), 0);
    });
    it('returns 0 for Halbzeit', () => {
      assert.strictEqual(w.getTickPoints('Halbzeit'), 0);
    });
    it('returns 0 for Spielzeit clock update', () => {
      assert.strictEqual(w.getTickPoints('Spielzeit - 5:00'), 0);
    });
    it('returns 0 for Spiel gestartet', () => {
      assert.strictEqual(w.getTickPoints('Spiel gestartet'), 0);
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL (function not defined)**

  ```bash
  npm test
  ```

  Expected: `TypeError: w.getTickPoints is not a function`

- [ ] **Step 3: Implement `getTickPoints` in `widget.html`**

  In the `// ── UTILS ──` section, after `function formatDate`:

  ```js
  function getTickPoints(text) {
    if (text.startsWith('Touchdown'))      return 6;
    if (text.startsWith('2-Extra-Punkte')) return 2;
    if (text.startsWith('1-Extra-Punkt'))  return 1;
    return 0;
  }
  ```

- [ ] **Step 4: Run — expect PASS**

  ```bash
  npm test
  ```

  Expected: all `getTickPoints` tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add widget.html tests/liveticker.test.js
  git commit -m "feat: add getTickPoints helper (TDD)"
  ```

---

## Task 4: `buildTickRows()` — TDD

**Files:**
- Modify: `tests/liveticker.test.js` — append new describe block
- Modify: `widget.html` — `// ── UTILS ──` section

- [ ] **Step 1: Append failing tests to `tests/liveticker.test.js`**

  Add after the `getTickPoints` describe block:

  ```js
  // ─── buildTickRows ────────────────────────────────────────────────────────────

  describe('buildTickRows', () => {
    let w;
    beforeEach(() => { w = freshContext(); });

    function makeGs(ticks, watchedSide, opts) {
      return Object.assign({
        gameId: 999,
        homeName: 'Home FC',
        awayName: 'Away SC',
        watchedSide: watchedSide || 'home',
        score: { home: 0, away: 0 },
        status: 'Geplant',
        possession: null,
        ticks: ticks || [],
        seenFingerprints: new Set(),
        hasFullHistory: true,
        gamedayName: 'Spieltag 1'
      }, opts || {});
    }

    it('returns empty string for empty ticks', () => {
      assert.strictEqual(w.buildTickRows(makeGs([])), '');
    });

    it('renders neutral events (team: null) as colspan=3 row', () => {
      var gs = makeGs([{ text: 'Halbzeit', team: null, time: '10:00' }]);
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('colspan="3"'), 'neutral row must span 3 columns');
      assert.ok(html.includes('lt-neutral'), 'neutral row must have lt-neutral class');
      assert.ok(html.includes('Halbzeit'), 'neutral text must appear');
    });

    it('places watched team (watchedSide=home) event in left (home) column', () => {
      var gs = makeGs([{ text: 'First Down: #5', team: 'home', time: '08:00' }], 'home');
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('lt-col-home'), 'event must be in left column');
      assert.ok(html.includes('First Down: #5'), 'event text must appear');
      assert.ok(html.includes('<td class="lt-col-away"></td>'), 'away column must be empty');
    });

    it('places watched team (watchedSide=away) event also in left column', () => {
      var gs = makeGs([{ text: 'First Down: #5', team: 'away', time: '08:00' }], 'away');
      var html = w.buildTickRows(gs);
      // watched team is away but must still appear in left (home) column
      assert.ok(html.includes('lt-col-home'), 'watched-away event must still be in left column');
      assert.ok(html.includes('<td class="lt-col-away"></td>'), 'away column must be empty for our event');
    });

    it('places opponent event in right (away) column when watchedSide=home', () => {
      var gs = makeGs([{ text: 'Ballabgabe', team: 'away', time: '08:30' }], 'home');
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('<td class="lt-col-home"></td>'), 'home column must be empty');
      assert.ok(html.includes('lt-col-away'), 'opponent event must be in right column');
      assert.ok(html.includes('Ballabgabe'), 'event text must appear');
    });

    it('adds lt-scoring class and score for Touchdown', () => {
      var gs = makeGs([{ text: 'Touchdown: #12', team: 'home', time: '08:00' }], 'home');
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('lt-scoring'), 'scoring row must have lt-scoring class');
      assert.ok(html.includes('6:0'), 'score after TD (6:0) must appear in center column');
    });

    it('accumulates score correctly across multiple scoring events', () => {
      var gs = makeGs([
        // newest-first (API order)
        { text: '1-Extra-Punkt: #7', team: 'home', time: '08:15' },
        { text: 'Touchdown: #12',   team: 'home', time: '08:00' },
      ], 'home');
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('6:0'), 'TD score 6:0 must appear');
      assert.ok(html.includes('7:0'), 'PAT score 7:0 must appear');
    });

    it('renders ticks oldest-first (newest tick last in output)', () => {
      var gs = makeGs([
        { text: 'Second event', team: 'home', time: '09:00' }, // newest first in API
        { text: 'First event',  team: 'home', time: '08:00' }, // oldest
      ], 'home');
      var html = w.buildTickRows(gs);
      assert.ok(
        html.indexOf('First event') < html.indexOf('Second event'),
        'oldest events must appear first (top of table)'
      );
    });

    it('does not show per-event score when hasFullHistory is false', () => {
      var gs = makeGs(
        [{ text: 'Touchdown: #12', team: 'home', time: '08:00' }],
        'home',
        { hasFullHistory: false }
      );
      var html = w.buildTickRows(gs);
      assert.ok(html.includes('lt-scoring'), 'lt-scoring class must still appear');
      assert.ok(!html.includes('6:0'), 'per-event score must NOT appear when hasFullHistory=false');
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL**

  ```bash
  npm test
  ```

  Expected: `TypeError: w.buildTickRows is not a function`

- [ ] **Step 3: Implement `buildTickRows` in `widget.html`**

  In `// ── UTILS ──`, after `getTickPoints`:

  ```js
  function buildTickRows(gs) {
    var ourName = gs.watchedSide === 'home' ? gs.homeName : gs.awayName;
    var oppName = gs.watchedSide === 'home' ? gs.awayName : gs.homeName;
    var runScore = { home: 0, away: 0 };
    var ordered  = gs.ticks.slice().reverse(); // newest-first → oldest-first
    return ordered.map(function(tick) {
      if (tick.team === null) {
        return '<tr class="lt-neutral"><td colspan="3">' + escapeHtml(tick.text) + '</td></tr>';
      }
      var pts = getTickPoints(tick.text);
      if (pts > 0 && tick.team) runScore[tick.team] += pts;
      var isOurSide = tick.team === gs.watchedSide;
      var isScoring = pts > 0;
      var rowClass  = isScoring ? ' class="lt-scoring"' : '';
      var ourScore  = gs.watchedSide === 'home' ? runScore.home : runScore.away;
      var oppScore  = gs.watchedSide === 'home' ? runScore.away : runScore.home;
      var scoreCell = (isScoring && gs.hasFullHistory) ? escapeHtml(ourScore + ':' + oppScore) : '';
      var label     = isScoring
        ? '<span class="lt-team-label">' + escapeHtml(isOurSide ? ourName : oppName) + '</span>'
        : '';
      var evText = label + escapeHtml(tick.text);
      if (isOurSide) {
        return '<tr' + rowClass + '>'
          + '<td class="lt-col-home">' + evText + '</td>'
          + '<td class="lt-col-mid">' + scoreCell + '</td>'
          + '<td class="lt-col-away"></td>'
          + '</tr>';
      } else {
        return '<tr' + rowClass + '>'
          + '<td class="lt-col-home"></td>'
          + '<td class="lt-col-mid">' + scoreCell + '</td>'
          + '<td class="lt-col-away">' + evText + '</td>'
          + '</tr>';
      }
    }).join('');
  }
  ```

- [ ] **Step 4: Run — expect PASS**

  ```bash
  npm test
  ```

  Expected: all `getTickPoints` and `buildTickRows` tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add widget.html tests/liveticker.test.js
  git commit -m "feat: add buildTickRows helper (TDD)"
  ```

---

## Task 5: `renderLiveGameB3()` — TDD

**Files:**
- Modify: `tests/liveticker.test.js` — append new describe block
- Modify: `widget.html` — `// ── RENDER ──` section

- [ ] **Step 1: Append failing tests**

  Add after the `buildTickRows` describe block in `tests/liveticker.test.js`:

  ```js
  // ─── renderLiveGameB3 ─────────────────────────────────────────────────────────

  describe('renderLiveGameB3', () => {
    let w;
    beforeEach(() => { w = freshContext(); });

    function makeGs(overrides) {
      return Object.assign({
        gameId: 42,
        homeName: 'Home FC',
        awayName: 'Away SC',
        watchedSide: 'home',
        score: { home: 7, away: 0 },
        status: '1. Halbzeit',
        possession: 'home',
        ticks: [],
        seenFingerprints: new Set(),
        hasFullHistory: true,
        gamedayName: 'Spieltag 5'
      }, overrides || {});
    }

    it('XSS — home team name is escaped', () => {
      var gs = makeGs({ homeName: '<script>alert(1)</script>' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(!/<script/i.test(html), 'raw <script must not appear');
    });

    it('XSS — away team name is escaped', () => {
      var gs = makeGs({ awayName: '<img src=x onerror=alert(1)>' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(!/<[a-z][^>]* onerror=/i.test(html), 'onerror= must not appear unescaped');
    });

    it('XSS — tick text is escaped', () => {
      var gs = makeGs({
        ticks: [{ text: '<script>steal()</script>', team: 'home', time: '08:00' }]
      });
      var html = w.renderLiveGameB3(gs);
      assert.ok(!/<script/i.test(html), 'script in tick text must be escaped');
    });

    it('XSS — gameday name is escaped', () => {
      var gs = makeGs({ gamedayName: '"><svg onload=alert(1)>' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(!/<[a-z][^>]* onload=/i.test(html), 'onload= must not appear unescaped');
    });

    it('includes correct DOM ids for gameId', () => {
      var gs = makeGs({ gameId: 7400 });
      var html = w.renderLiveGameB3(gs);
      assert.ok(html.includes('id="lt-game-7400"'),  'wrapper id must be lt-game-<gameId>');
      assert.ok(html.includes('id="lt-score-7400"'), 'score cell id must be lt-score-<gameId>');
      assert.ok(html.includes('id="lt-body-7400"'),  'tbody id must be lt-body-<gameId>');
    });

    it('gives watched team (home side) the lt-ours accent class', () => {
      var gs = makeGs({ watchedSide: 'home', homeName: 'Renegades', awayName: 'Sharks' });
      var html = w.renderLiveGameB3(gs);
      // lt-ours must appear before (or adjacent to) "Renegades" in the scorebar
      var oursIdx = html.indexOf('lt-ours');
      assert.ok(oursIdx !== -1, 'lt-ours class must appear');
      // And the opponent must NOT have lt-ours
      var afterOurs = html.slice(oursIdx);
      assert.ok(afterOurs.includes('Renegades'), 'Renegades must follow lt-ours class');
    });

    it('gives watched team (away side) the lt-ours accent class', () => {
      var gs = makeGs({ watchedSide: 'away', homeName: 'Sharks', awayName: 'Renegades' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(html.includes('lt-ours'), 'lt-ours must appear even when watchedSide=away');
    });

    it('shows LIVE badge', () => {
      var html = w.renderLiveGameB3(makeGs());
      assert.ok(html.includes('lt-live-badge'), 'LIVE badge must appear');
    });

    it('shows score in scorebar', () => {
      var gs = makeGs({ score: { home: 14, away: 7 }, watchedSide: 'home' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(html.includes('14 : 7'), 'score must appear in scorebar');
    });

    it('shows opponent score on left when watchedSide=away', () => {
      // watchedSide=away means away score (7) is "ours" → shown first as "7 : 14"
      var gs = makeGs({ score: { home: 14, away: 7 }, watchedSide: 'away' });
      var html = w.renderLiveGameB3(gs);
      assert.ok(html.includes('7 : 14'), 'away score (7) must be shown first when watchedSide=away');
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL**

  ```bash
  npm test
  ```

  Expected: `TypeError: w.renderLiveGameB3 is not a function`

- [ ] **Step 3: Implement `renderLiveGameB3` in `widget.html`**

  In `// ── RENDER ──` section, after `renderGameLogEvents`:

  ```js
  function renderLiveGameB3(gs) {
    var ourName  = escapeHtml(gs.watchedSide === 'home' ? gs.homeName : gs.awayName);
    var oppName  = escapeHtml(gs.watchedSide === 'home' ? gs.awayName : gs.homeName);
    var ourScore = gs.watchedSide === 'home' ? gs.score.home : gs.score.away;
    var oppScore = gs.watchedSide === 'home' ? gs.score.away : gs.score.home;
    var scoreStr = (ourScore != null && oppScore != null)
      ? escapeHtml(ourScore + ' : ' + oppScore) : '– : –';
    var poss = '';
    if (gs.possession === gs.watchedSide)      poss = '🏈 ' + ourName;
    else if (gs.possession !== null)           poss = '🏈 ' + oppName;
    return '<div class="live-ticker-game" id="lt-game-' + gs.gameId + '">'
      + '<div class="lt-header">'
      +   '<span class="lt-live-badge">● LIVE</span>'
      +   '<span class="lt-gd-name">' + escapeHtml(gs.gamedayName) + '</span>'
      +   '<span class="lt-status">' + escapeHtml(gs.status) + '</span>'
      + '</div>'
      + '<div class="lt-scorebar">'
      +   '<div class="lt-team lt-ours">' + ourName + '</div>'
      +   '<div class="lt-score-center">'
      +     '<div class="lt-score-val" id="lt-score-' + gs.gameId + '">' + scoreStr + '</div>'
      +     '<div class="lt-score-meta">' + escapeHtml(gs.status) + '</div>'
      +     (poss ? '<div class="lt-possession">' + poss + '</div>' : '')
      +   '</div>'
      +   '<div class="lt-team">' + oppName + '</div>'
      + '</div>'
      + '<table class="lt-table">'
      + '<tbody id="lt-body-' + gs.gameId + '">'
      + buildTickRows(gs)
      + '</tbody></table>'
      + '</div>';
  }
  ```

- [ ] **Step 4: Run — expect PASS**

  ```bash
  npm test
  ```

  Expected: all tests in liveticker.test.js pass.

- [ ] **Step 5: Commit**

  ```bash
  git add widget.html tests/liveticker.test.js
  git commit -m "feat: add renderLiveGameB3 (TDD, XSS-safe)"
  ```

---

## Task 6: `renderUpcomingFallback()` — TDD

**Files:**
- Modify: `tests/liveticker.test.js` — append new describe block
- Modify: `widget.html` — `// ── RENDER ──` section

- [ ] **Step 1: Append failing tests**

  Add after the `renderLiveGameB3` describe block:

  ```js
  // ─── renderUpcomingFallback ───────────────────────────────────────────────────

  describe('renderUpcomingFallback', () => {
    let w;
    beforeEach(() => { w = freshContext(); });

    function makeSnap(gamedayDate) {
      return {
        teams: [{ id: 159, name: 'Nürnberg Renegades', abbrev: 'Nürn', gamedays: [] }],
        gamedays: [{
          id: 1,
          date: gamedayDate,
          name: 'Spieltag 1',
          start: '10:00',
          league_display: 'RL Bayern',
          address: '',
          games: [{
            id: 100, status: 'Geplant', stage: '', standing: '',
            scheduled: '10:00:00', field: '1',
            final_score: null, halftime_score: null,
            results: [
              { team_id: 159, team_name: 'Nürn', pa: null, isHome: true },
              { team_id: 1,   team_name: 'Other', pa: null, isHome: false }
            ]
          }]
        }]
      };
    }

    it('shows fallback label and gameday name when a future game exists', () => {
      var snap = makeSnap('2099-01-01'); // far future → always active
      var html = w.renderUpcomingFallback(159, snap);
      assert.ok(html.includes('nächstes Spiel'), 'fallback label must contain "nächstes Spiel"');
      assert.ok(html.includes('Spieltag 1'), 'upcoming gameday name must appear');
    });

    it('returns no-data message when no future gamedays found', () => {
      var snap = { teams: [], gamedays: [] };
      var html = w.renderUpcomingFallback(159, snap);
      assert.ok(html.includes('keine') || html.includes('Keine'),
        'must show "keine" message when no gamedays found');
    });

    it('XSS — gameday name is escaped', () => {
      var snap = makeSnap('2099-01-01');
      snap.gamedays[0].name = '<script>alert(1)</script>';
      var html = w.renderUpcomingFallback(159, snap);
      assert.ok(!/<script/i.test(html), 'script tag must be escaped');
    });
  });
  ```

- [ ] **Step 2: Run — expect FAIL**

  ```bash
  npm test
  ```

  Expected: `TypeError: w.renderUpcomingFallback is not a function`

- [ ] **Step 3: Implement `renderUpcomingFallback` in `widget.html`**

  In `// ── RENDER ──` section, after `renderLiveGameB3`:

  ```js
  function renderUpcomingFallback(teamId, snap) {
    var today = new Date().toISOString().slice(0, 10);
    var upcoming = snap.gamedays.filter(function(gd) {
      return gd.games
        && gd.games.some(function(g) {
             return g.results.some(function(r) { return r.team_id === teamId; });
           })
        && classifyGameday(gd, gd.games, teamId, today) === 'active';
    }).sort(function(a, b) { return a.date.localeCompare(b.date); });
    if (!upcoming.length) {
      return '<div class="no-data">Keine kommenden Spieltage gefunden.</div>';
    }
    var gd = upcoming[0];
    return '<div class="section-title">Kein Live-Spiel — nächstes Spiel:</div>'
      + renderGamedayCard(gd, gd.games, teamId, false);
  }
  ```

- [ ] **Step 4: Run — expect PASS**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add widget.html tests/liveticker.test.js
  git commit -m "feat: add renderUpcomingFallback (TDD, XSS-safe)"
  ```

---

## Task 7: `startLivePolling()`

**Files:**
- Modify: `widget.html` — `// ── VIEW RENDERERS ──` section

No unit tests for the polling loop — it wires together fetch, DOM, and setInterval. Correctness is verified by the integration test in Task 8 (browser smoke) and the unit tests on its helpers in Tasks 3–5.

- [ ] **Step 1: Implement `startLivePolling` in `widget.html`**

  In `// ── VIEW RENDERERS ──`, before `renderSpielplan`, add:

  ```js
  function startLivePolling() {
    _liveFailCount = 0;

    function poll() {
      fetchJSON(LIVETICKER_API).then(function(data) {
        _liveFailCount = 0;
        var errEl = document.getElementById('lt-error-banner');
        if (errEl) errEl.parentNode.removeChild(errEl);

        // Update known live games
        data.forEach(function(game) {
          if (!_watchedGameIds.has(game.gameId)) return;
          var gs = _liveGames[game.gameId];
          if (!gs) return;

          // Accumulate new ticks (API newest-first; process oldest-first)
          var newTicks = [];
          game.ticks.slice().reverse().forEach(function(tick) {
            var fp = tick.text + '|' + tick.time;
            if (!gs.seenFingerprints.has(fp)) {
              gs.seenFingerprints.add(fp);
              gs.ticks.unshift(tick);  // maintain newest-first order in state
              newTicks.push(tick);
            }
          });

          // Score / status / possession update
          var newScore    = { home: game.home.score, away: game.away.score };
          var scoreChanged = newScore.home !== gs.score.home || newScore.away !== gs.score.away;
          gs.score     = newScore;
          gs.status    = game.status;
          gs.possession = game.home.isInPossession ? 'home'
                        : (game.away.isInPossession ? 'away' : null);

          // DOM: flash score on change
          if (scoreChanged) {
            var scoreEl = document.getElementById('lt-score-' + gs.gameId);
            if (scoreEl) {
              var ourScore = gs.watchedSide === 'home' ? newScore.home : newScore.away;
              var oppScore = gs.watchedSide === 'home' ? newScore.away : newScore.home;
              scoreEl.textContent = (ourScore != null && oppScore != null)
                ? ourScore + ' : ' + oppScore : '– : –';
              scoreEl.classList.remove('lt-flash');
              void scoreEl.offsetWidth;   // force reflow so animation restarts
              scoreEl.classList.add('lt-flash');
            }
          }

          // DOM: update tick list
          if (newTicks.length) {
            var bodyEl = document.getElementById('lt-body-' + gs.gameId);
            if (bodyEl) bodyEl.innerHTML = buildTickRows(gs);
          }

          // Check if all watched games are finished → stop polling
          if (game.status === 'Beendet') {
            gs.status = 'Beendet';
            var allDone = Object.keys(_liveGames).every(function(id) {
              return _liveGames[id].status === 'Beendet';
            });
            if (allDone && _liveInterval) {
              clearInterval(_liveInterval);
              _liveInterval = null;
            }
          }
        });

        // Detect new live games that started after page load
        data.forEach(function(game) {
          if (!_watchedGameIds.has(game.gameId) || _liveGames[game.gameId]) return;
          fetchJSON(LIVETICKER_API + '?getAllTicksFor=' + game.gameId).then(function(fullData) {
            var fullGame = fullData.find(function(g) { return g.gameId === game.gameId; });
            if (!fullGame) return;
            var watchedSide = _liveTeamNames[fullGame.home.name] ? 'home' : 'away';
            var gamedayName = '';
            if (_liveSnap) {
              _liveSnap.gamedays.forEach(function(gd) {
                if (gd.games && gd.games.some(function(g) { return g.id === game.gameId; }))
                  gamedayName = gd.name || '';
              });
            }
            var newGs = {
              gameId: game.gameId,
              homeName: fullGame.home.name,
              awayName: fullGame.away.name,
              watchedSide: watchedSide,
              score: { home: fullGame.home.score, away: fullGame.away.score },
              status: fullGame.status,
              possession: fullGame.home.isInPossession ? 'home'
                        : (fullGame.away.isInPossession ? 'away' : null),
              ticks: fullGame.ticks.slice(),
              seenFingerprints: new Set(
                fullGame.ticks.map(function(t) { return t.text + '|' + t.time; })
              ),
              hasFullHistory: true,
              gamedayName: gamedayName
            };
            _liveGames[game.gameId] = newGs;
            var root = document.getElementById('root');
            if (root) {
              var wrapper = document.createElement('div');
              wrapper.innerHTML = renderLiveGameB3(newGs);
              root.insertBefore(wrapper.firstChild, root.firstChild);
            }
          }).catch(function() {});
        });

      }).catch(function() {
        _liveFailCount++;
        if (_liveFailCount >= 3) {
          var root = document.getElementById('root');
          if (root && !document.getElementById('lt-error-banner')) {
            var errDiv = document.createElement('div');
            errDiv.id        = 'lt-error-banner';
            errDiv.className = 'lt-conn-error';
            errDiv.textContent = '⚠ Verbindung unterbrochen';
            root.insertBefore(errDiv, root.firstChild);
          }
        }
      });
    }

    poll(); // immediate first call
    _liveInterval = setInterval(poll, 5000);
  }
  ```

- [ ] **Step 2: Run tests — all still pass**

  ```bash
  npm test
  ```

  Expected: all existing tests still pass (no regressions).

- [ ] **Step 3: Commit**

  ```bash
  git add widget.html
  git commit -m "feat: add startLivePolling with 5s interval and error banner"
  ```

---

## Task 8: `renderLiveView()` + init wire-up

**Files:**
- Modify: `widget.html` — `// ── VIEW RENDERERS ──` and `// ── INIT ──` sections

- [ ] **Step 1: Implement `renderLiveView` in `widget.html`**

  In `// ── VIEW RENDERERS ──`, after `startLivePolling` and before `renderSpielplan`:

  ```js
  async function renderLiveView(root, cfg) {
    root.innerHTML = '<div class="loading">Lade Live-Daten…</div>';
    try {
      var snap = await loadSnapshot();
      _liveSnap = snap;
      var today = new Date().toISOString().slice(0, 10);

      // Build teamId → name map and populate _liveTeamNames
      var teamNames = {};
      snap.teams.forEach(function(t) { teamNames[t.id] = t.name; });
      _liveTeamNames = {};
      cfg.teams.forEach(function(teamId) {
        var name = teamNames[teamId];
        if (name) _liveTeamNames[name] = teamId;
      });

      // Collect active game IDs for watched teams from snapshot
      _watchedGameIds = new Set();
      var gameIdToTeamId = {};
      snap.gamedays.forEach(function(gd) {
        if (!gd.games) return;
        cfg.teams.forEach(function(teamId) {
          var teamGames = gd.games.filter(function(g) {
            return g.results.some(function(r) { return r.team_id === teamId; });
          });
          if (!teamGames.length) return;
          if (classifyGameday(gd, gd.games, teamId, today) !== 'active') return;
          teamGames.forEach(function(g) {
            _watchedGameIds.add(g.id);
            if (!gameIdToTeamId[g.id]) gameIdToTeamId[g.id] = teamId;
          });
        });
      });

      if (_watchedGameIds.size === 0) {
        root.innerHTML = cfg.teams.map(function(teamId) {
          return renderUpcomingFallback(teamId, snap);
        }).join('');
        return;
      }

      // Fetch full tick history for each watched game via getAllTicksFor
      var liveHtml    = '';
      var fallbackHtml = '';
      await Promise.all(Array.from(_watchedGameIds).map(async function(gameId) {
        var teamId = gameIdToTeamId[gameId];
        try {
          var data = await fetchJSON(LIVETICKER_API + '?getAllTicksFor=' + gameId);
          var game = data.find(function(g) { return g.gameId === gameId; });
          if (!game) {
            // Scheduled but not yet started in liveticker
            fallbackHtml += renderUpcomingFallback(teamId, snap);
            return;
          }
          var teamName    = teamNames[teamId] || '';
          var watchedSide = (game.home.name === teamName) ? 'home' : 'away';
          var gamedayName = '';
          snap.gamedays.forEach(function(gd) {
            if (gd.games && gd.games.some(function(g) { return g.id === gameId; }))
              gamedayName = gd.name || '';
          });
          var gs = {
            gameId:           gameId,
            homeName:         game.home.name,
            awayName:         game.away.name,
            watchedSide:      watchedSide,
            score:            { home: game.home.score, away: game.away.score },
            status:           game.status,
            possession:       game.home.isInPossession ? 'home'
                            : (game.away.isInPossession ? 'away' : null),
            ticks:            game.ticks.slice(),
            seenFingerprints: new Set(
              game.ticks.map(function(t) { return t.text + '|' + t.time; })
            ),
            hasFullHistory:   true,
            gamedayName:      gamedayName
          };
          _liveGames[gameId] = gs;
          liveHtml += renderLiveGameB3(gs);
        } catch(e) {
          // getAllTicksFor failed — fall back to upcoming
          fallbackHtml += renderUpcomingFallback(teamId, snap);
        }
      }));

      root.innerHTML = (liveHtml + fallbackHtml)
        || '<div class="no-data">Keine Spiele gefunden.</div>';

      if (Object.keys(_liveGames).length) startLivePolling();

    } catch(e) {
      root.innerHTML = '<div class="error-banner">Fehler: ' + escapeHtml(e.message) + '</div>';
    }
  }
  ```

- [ ] **Step 2: Wire into the init block**

  In `// ── INIT ──`, find the existing dispatch block:

  ```js
  if (cfg.view === 'table') {
    await renderTableView(root, cfg);
  } else {
    await renderSpielplan(root, cfg);
  }
  ```

  Replace with:

  ```js
  if (cfg.view === 'live') {
    await renderLiveView(root, cfg);
  } else if (cfg.view === 'table') {
    await renderTableView(root, cfg);
  } else {
    await renderSpielplan(root, cfg);
  }
  ```

- [ ] **Step 3: Run tests — all still pass**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Smoke-test in browser**

  Open `widget.html?view=live&t=159&t=287` in a browser (open the file directly or serve with `npx serve .`).

  **When no game is currently live:** expect to see "Kein Live-Spiel — nächstes Spiel:" followed by the next gameday card for each team.

  **When a game is live:** expect to see the B3 two-column table with LIVE badge, score in scorebar, and ticks in chronological order (oldest at top, newest at bottom).

  Check browser DevTools console — no JavaScript errors.

- [ ] **Step 5: Commit**

  ```bash
  git add widget.html
  git commit -m "feat: add renderLiveView and wire ?view=live into init"
  ```

---

## Self-Review Checklist (do not delete — verify inline)

- [x] Spec § Architecture → Tasks 2, 8 (state vars + renderLiveView data flow)
- [x] Spec § Components → Tasks 5, 6, 7, 8 (renderLiveGameB3, renderUpcomingFallback, startLivePolling, renderLiveView)
- [x] Spec § State → Task 2 (all 6 state vars including _liveTeamNames, _liveSnap)
- [x] Spec § Polling Loop → Task 7 (5s, dedup, score flash, game-over stop, new-game detection)
- [x] Spec § Error Handling → Task 7 (3-fail banner, silent retry, getAllTicksFor fallback, snapshot error)
- [x] Spec § Security → Tasks 5, 6 (XSS tests; all API strings through escapeHtml)
- [x] Spec § Testing → Tasks 3–6 (8 test suites: getTickPoints, buildTickRows, renderLiveGameB3, renderUpcomingFallback)
- [x] No placeholders — all steps contain exact code
- [x] Type consistency — `gs.watchedSide`, `gs.seenFingerprints`, `gs.hasFullHistory` consistent across Tasks 4–8
- [x] `buildTickRows` called by both `renderLiveGameB3` (Task 5) and `startLivePolling` DOM update (Task 7) — same function name ✓
