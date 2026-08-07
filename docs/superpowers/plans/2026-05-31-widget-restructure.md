# Widget Restructure — DataStore + Three Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the localStorage discovery layer and per-view polling with a shared `DataStore` singleton that owns one adaptive interval (30 min watching → 5 s live), so all three views subscribe to events instead of fetching their own data.

**Architecture:** `DataStore` is a vanilla-JS IIFE object added to `widget.html`. Views call `DataStore.subscribe(event, fn)` and re-render targeted DOM elements on each event. The 5 s liveticker API doubles as the live-score source for Spielplan and Table, eliminating the separate 30 s gameday API poll. `_gen_snapshot.js` gains one guard so play-by-play is only scraped for completed games.

**Tech Stack:** Vanilla HTML/CSS/JS, Node.js built-in test runner (`node --test`), VM sandbox testing via `tests/helpers.js`.

**Spec:** `docs/superpowers/specs/2026-05-31-widget-restructure-design.md`

---

## Task 1: Baseline

**Files:**
- Read: `tests/*.test.js`

- [ ] **Step 1: Run the existing test suite**

```bash
npm test
```

Expected: all tests pass. Note the count. If any fail, stop and fix before continuing.

- [ ] **Step 2: Commit nothing** — this is a read-only baseline check.

---

## Task 2: Add timer mocks to test helpers

`DataStore.init()` calls `setInterval`/`clearInterval`. These are not in the VM sandbox by default, so any test touching `DataStore` would throw "setInterval is not defined".

**Files:**
- Modify: `tests/helpers.js:46-68`

- [ ] **Step 1: Add `setInterval` and `clearInterval` to the VM context globals**

In `tests/helpers.js`, inside the `vm.createContext(Object.assign({...}, overrides))` block, add after `Promise, setTimeout, clearTimeout, console,`:

```js
setInterval:  (fn, ms) => { void ms; return 1; },
clearInterval: () => {},
```

The full updated globals object (replace the existing `Promise, setTimeout, clearTimeout, console,` line):

```js
Promise, setTimeout, clearTimeout, console,
setInterval:  (fn, ms) => { void ms; return 1; },
clearInterval: () => {},
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npm test
```

Expected: same count, all pass.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers.js
git commit -m "test: add setInterval/clearInterval mocks to VM sandbox"
```

---

## Task 3: `_gen_snapshot.js` — guard play-by-play for completed games only

**Files:**
- Modify: `_gen_snapshot.js` (~line 262)
- Modify: `tests/snapshot.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/snapshot.test.js` at the end:

```js
describe('snapshot.json future games', () => {
  it('no game with null final_score has a log field', () => {
    const gamesWithLog = snap.gamedays.flatMap(gd => gd.games || [])
      .filter(g => g.final_score === null && g.log != null);
    assert.equal(
      gamesWithLog.length, 0,
      'games without a final_score must not have a log field'
    );
  });
});
```

- [ ] **Step 2: Run test — confirm it fails or passes**

```bash
npm test 2>&1 | grep -A3 "future games"
```

If it already passes (no logs on null-score games), the guard is already in place — skip to Step 4. If it fails, continue.

- [ ] **Step 3: Add the guard in `_gen_snapshot.js`**

Find the game log fetch loop (~line 261-268):

```js
for (const game of gd.games) {
  if (game.id && !game.log) {
```

Change to:

```js
for (const game of gd.games) {
  if (game.id && !game.log && game.status === 'Beendet') {
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all pass (the new snapshot.test assertion passes because `snapshot.json` already has no logs on null-score games — the guard prevents future regressions when the snapshot is regenerated).

- [ ] **Step 5: Commit**

```bash
git add _gen_snapshot.js tests/snapshot.test.js
git commit -m "fix: guard play-by-play scrape to completed games only"
```

---

## Task 4: DataStore — subscribe/emit + `_deriveScore`

Add the `DataStore` object to `widget.html` and test its two pure helpers.

**Files:**
- Modify: `widget.html` (add before `// ── SNAPSHOT QUICK-RENDER` comment, ~line 765)
- Modify: `tests/unit.test.js`

- [ ] **Step 1: Write the failing tests**

Add at the end of `tests/unit.test.js`:

```js
// ─── DataStore.subscribe / emit ───────────────────────────────────────────────

describe('DataStore.subscribe / emit', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('fires a registered callback', () => {
    let received = null;
    w.DataStore.subscribe('test-event', (d) => { received = d; });
    w.DataStore.emit('test-event', 42);
    assert.equal(received, 42);
  });

  it('fires multiple callbacks for the same event', () => {
    let a = 0, b = 0;
    w.DataStore.subscribe('x', () => { a = 1; });
    w.DataStore.subscribe('x', () => { b = 1; });
    w.DataStore.emit('x', null);
    assert.equal(a, 1);
    assert.equal(b, 1);
  });

  it('does not fire callback for a different event', () => {
    let called = false;
    w.DataStore.subscribe('a', () => { called = true; });
    w.DataStore.emit('b', null);
    assert.equal(called, false);
  });
});

// ─── DataStore._deriveScore ───────────────────────────────────────────────────

describe('DataStore._deriveScore', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('returns zero score for empty ticks', () => {
    assert.deepEqual(w.DataStore._deriveScore([]), { home: 0, away: 0 });
  });

  it('counts a home Touchdown as 6', () => {
    const s = w.DataStore._deriveScore([{ team: 'home', text: 'Touchdown' }]);
    assert.equal(s.home, 6);
    assert.equal(s.away, 0);
  });

  it('counts an away Touchdown as 6', () => {
    const s = w.DataStore._deriveScore([{ team: 'away', text: 'Touchdown' }]);
    assert.equal(s.home, 0);
    assert.equal(s.away, 6);
  });

  it('counts a 1-Extra-Punkt', () => {
    const s = w.DataStore._deriveScore([
      { team: 'home', text: 'Touchdown' },
      { team: 'home', text: '1-Extra-Punkt: OK' },
    ]);
    assert.equal(s.home, 7);
  });

  it('counts a 2-Extra-Punkte', () => {
    const s = w.DataStore._deriveScore([
      { team: 'away', text: 'Touchdown' },
      { team: 'away', text: '2-Extra-Punkte: OK' },
    ]);
    assert.equal(s.away, 8);
  });

  it('ignores neutral ticks (team === null)', () => {
    const s = w.DataStore._deriveScore([{ team: null, text: 'Halbzeit' }]);
    assert.deepEqual(s, { home: 0, away: 0 });
  });

  it('accumulates multiple scores', () => {
    const ticks = [
      { team: 'home', text: 'Touchdown' },
      { team: 'home', text: '1-Extra-Punkt: OK' },
      { team: 'away', text: 'Touchdown' },
    ];
    const s = w.DataStore._deriveScore(ticks);
    assert.equal(s.home, 7);
    assert.equal(s.away, 6);
  });
});
```

- [ ] **Step 2: Run tests — confirm DataStore tests fail**

```bash
npm test 2>&1 | grep -E "DataStore|✗|✓" | head -20
```

Expected: `DataStore` tests fail with "DataStore is not defined".

- [ ] **Step 3: Add DataStore to `widget.html`**

Locate the comment `// ── SNAPSHOT QUICK-RENDER` in `widget.html` (~line 765). Insert the following BEFORE that comment:

```js
// ── DATA STORE ───────────────────────────────────────────────────────────────
var DataStore = (function() {
  var _snap        = null;
  var _liveScores  = {};          // gameId → { home: N, away: N }
  var _ticks       = {};          // gameId → Tick[] oldest-first
  var _fpSets      = {};          // gameId → Set of fingerprints (dedup)
  var _mode        = 'watching';  // 'watching' | 'live'
  var _int         = null;
  var _subs        = {};
  var _watchedIds  = new Set();
  var WATCH_MS     = 30 * 60 * 1000;
  var LIVE_MS      = 5 * 1000;

  function subscribe(ev, fn) {
    if (!_subs[ev]) _subs[ev] = [];
    _subs[ev].push(fn);
  }

  function emit(ev, data) {
    (_subs[ev] || []).forEach(function(fn) { fn(data); });
  }

  function _deriveScore(ticks) {
    var score = { home: 0, away: 0 };
    (ticks || []).forEach(function(tick) {
      if (tick.team == null) return;
      var pts = getTickPoints(tick.text || '');
      if (pts > 0) score[tick.team] += pts;
    });
    return score;
  }

  return {
    get snapshot()    { return _snap; },
    get liveScores()  { return _liveScores; },
    get ticks()       { return _ticks; },
    get _mode()       { return _mode; },
    subscribe:        subscribe,
    emit:             emit,
    _deriveScore:     _deriveScore,
    // init and _poll added in Task 5
  };
})();

```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all DataStore subscribe/emit and _deriveScore tests pass.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/unit.test.js
git commit -m "feat: add DataStore skeleton with subscribe/emit and _deriveScore"
```

---

## Task 5: DataStore — `init()` and `_poll()` (state machine)

**Files:**
- Modify: `widget.html` — extend the DataStore IIFE
- Modify: `tests/unit.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit.test.js` after the DataStore._deriveScore describe block:

```js
// ─── DataStore.init / _poll state machine ─────────────────────────────────────

describe('DataStore._poll — WATCHING stays quiet when no ticks for watched games', () => {
  it('emits nothing when liveticker response has no watched games', async () => {
    const w = freshContext({
      fetch: async () => ({ ok: true, json: async () => [] }),
    });
    const events = [];
    w.DataStore.subscribe('game-score-update', (d) => events.push('score'));
    w.DataStore.subscribe('ticks-update',      (d) => events.push('ticks'));
    w.DataStore.subscribe('game-finished',     (d) => events.push('finish'));

    // Manually set a watched ID so the poll has something to check
    // DataStore doesn't expose _watchedIds directly; we test via _poll behaviour
    await w.DataStore._poll([]);  // pass empty liveForUs
    assert.deepEqual(events, []);
  });
});

describe('DataStore._poll — transitions to LIVE when ticks arrive', () => {
  it('emits game-score-update when a watched game has ticks', async () => {
    const w = freshContext();
    const scores = [];
    w.DataStore.subscribe('game-score-update', (d) => scores.push(d));

    const snap = {
      gamedays: [{
        id: 1, date: new Date().toISOString().slice(0, 10),
        games: [{ id: 99, status: 'live', results: [
          { team_id: 159, team_name: 'Nürn', pa: 0, isHome: true },
          { team_id: 200, team_name: 'Opp',  pa: 0, isHome: false },
        ]}],
      }],
    };

    // Inject snapshot and watched IDs directly for isolated test
    const ticks = [
      { team: 'home', text: 'Touchdown', time: '00:30' },
      { team: 'home', text: '1-Extra-Punkt: OK', time: '00:32' },
    ];
    await w.DataStore._pollWith(snap, new Set([99]), [{ gameId: 99, ticks: ticks }]);
    assert.equal(scores.length, 1);
    assert.equal(scores[0].gameId, 99);
    assert.equal(scores[0].homeScore, 7);
    assert.equal(scores[0].awayScore, 0);
  });
});

describe('DataStore._poll — emits game-finished on Spiel beendet tick', () => {
  it('fires game-finished event', async () => {
    const w = freshContext();
    const finished = [];
    w.DataStore.subscribe('game-finished', (d) => finished.push(d.gameId));

    const snap = {
      gamedays: [{
        id: 1, date: new Date().toISOString().slice(0, 10),
        games: [{ id: 99, status: 'live', results: [
          { team_id: 159, team_name: 'Nürn', pa: 0, isHome: true },
          { team_id: 200, team_name: 'Opp',  pa: 0, isHome: false },
        ]}],
      }],
    };
    const ticks = [
      { team: null, text: 'Spiel beendet', time: '01:00' },
    ];
    await w.DataStore._pollWith(snap, new Set([99]), [{ gameId: 99, ticks: ticks }]);
    assert.deepEqual(finished, [99]);
  });
});
```

- [ ] **Step 2: Run tests — confirm new tests fail**

```bash
npm test 2>&1 | grep -E "WATCHING|LIVE|transitions|game-finished" | head -10
```

Expected: failures for the new DataStore._poll tests.

- [ ] **Step 3: Add `init()`, `_poll()`, and `_pollWith()` to the DataStore IIFE**

In `widget.html`, find the DataStore `return { ... }` block (added in Task 4) and extend it. Replace the closing `return { ... };` with:

```js
  async function init(cfg) {
    _snap = await loadSnapshot();
    var today = new Date().toISOString().slice(0, 10);
    _watchedIds = new Set();
    _snap.gamedays.forEach(function(gd) {
      if (gd.date !== today) return;
      (gd.games || []).forEach(function(g) {
        var watched = cfg.teams.some(function(tid) {
          return g.results.some(function(r) { return r.team_id === tid; });
        });
        if (watched) _watchedIds.add(g.id);
      });
    });
    emit('snapshot-loaded', _snap);
    _int = setInterval(function() { _pollNow(); }, WATCH_MS);
  }

  function _pollNow() {
    fetchJSON(LIVETICKER_API).then(function(data) {
      var liveForUs = (data || []).filter(function(g) { return _watchedIds.has(g.gameId); });
      _pollWith(_snap, _watchedIds, liveForUs);
    }).catch(function() {});
  }

  function _pollWith(snap, watchedIds, liveForUs) {
    if (!liveForUs || liveForUs.length === 0) return;

    if (_mode === 'watching') {
      _mode = 'live';
      clearInterval(_int);
      _int = setInterval(function() { _pollNow(); }, LIVE_MS);
    }

    liveForUs.forEach(function(game) {
      var gameId   = game.gameId;
      var known    = _ticks[gameId] || [];
      var fps      = _fpSets[gameId] || new Set();
      var prevLen  = known.length;

      // Merge ticks (API order may be newest-first; dedup by fingerprint)
      var incoming = game.ticks || [];
      incoming.slice().reverse().forEach(function(tick) {
        var fp = (tick.text || '') + '|' + (tick.time || '');
        if (!fps.has(fp)) { fps.add(fp); known.push(tick); }
      });
      _ticks[gameId]  = known;
      _fpSets[gameId] = fps;

      // Derive score and emit if changed
      var score    = _deriveScore(known);
      var prev     = _liveScores[gameId];
      var changed  = !prev || prev.home !== score.home || prev.away !== score.away;
      _liveScores[gameId] = score;

      if (changed) {
        var snapGame = null;
        (snap.gamedays || []).forEach(function(gd) {
          (gd.games || []).forEach(function(g) { if (g.id === gameId) snapGame = g; });
        });
        var homeRes = snapGame && snapGame.results.find(function(r) { return r.isHome; });
        var awayRes = snapGame && snapGame.results.find(function(r) { return !r.isHome; });
        emit('game-score-update', {
          gameId:    gameId,
          homeScore: score.home,
          awayScore: score.away,
          homeName:  homeRes ? homeRes.team_name : '',
          awayName:  awayRes ? awayRes.team_name : '',
        });
      }

      // Emit new ticks
      var newTicks = known.slice(prevLen);
      if (newTicks.length > 0) {
        emit('ticks-update', { gameId: gameId, newTicks: newTicks });

        // Check for game over
        var over = newTicks.some(function(t) {
          return t.team == null && t.text === 'Spiel beendet';
        });
        if (over) {
          emit('game-finished', { gameId: gameId });
          delete _ticks[gameId];
          delete _fpSets[gameId];
          delete _liveScores[gameId];
          watchedIds.delete(gameId);

          if (Object.keys(_ticks).length === 0 && _mode === 'live') {
            _mode = 'watching';
            clearInterval(_int);
            _int = setInterval(function() { _pollNow(); }, WATCH_MS);
          }
        }
      }
    });
  }

  return {
    get snapshot()    { return _snap; },
    get liveScores()  { return _liveScores; },
    get ticks()       { return _ticks; },
    get _mode()       { return _mode; },
    subscribe:        subscribe,
    emit:             emit,
    _deriveScore:     _deriveScore,
    _pollWith:        _pollWith,
    init:             init,
  };
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all DataStore tests pass.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/unit.test.js
git commit -m "feat: add DataStore init and adaptive polling state machine"
```

---

## Task 6: Spielplan — score IDs + scheduled game rendering

Update `renderGameRow` to emit stable `id="score-{gameId}"` on score cells and skip the score box for scheduled games.

**Files:**
- Modify: `widget.html` — `renderGameRow` function (~line 664)
- Modify: `tests/unit.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit.test.js`:

```js
// ─── renderGameRow — score cell ID ───────────────────────────────────────────

describe('renderGameRow score cell ID', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function makeGame(id, status, finalScore) {
    return {
      id,
      status,
      stage: null, standing: null,
      scheduled: '10:00', field: '1',
      final_score: finalScore || null,
      halftime_score: null,
      results: [
        { team_id: 159, team_name: 'Nürn', pa: 7,  isHome: true  },
        { team_id: 200, team_name: 'Opp',  pa: 14, isHome: false },
      ],
    };
  }

  it('completed game score box has id="score-{gameId}"', () => {
    const html = w.renderGameRow(makeGame(77, 'Beendet', '14:7'), 159, true);
    assert.ok(html.includes('id="score-77"'), 'score cell must have id="score-77"');
  });

  it('scheduled game has no score box', () => {
    const html = w.renderGameRow(makeGame(88, 'scheduled', null), 159, false);
    assert.ok(!html.includes('id="score-88"'), 'scheduled game must not have score cell');
    assert.ok(!html.includes('14:7'), 'scheduled game must not show score');
  });

  it('scheduled game still shows teams', () => {
    const html = w.renderGameRow(makeGame(88, 'scheduled', null), 159, false);
    assert.ok(html.includes('Nürn'), 'must show home team name');
    assert.ok(html.includes('Opp'),  'must show away team name');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test 2>&1 | grep -E "score cell|scheduled" | head -10
```

Expected: failures (no `id="score-{gameId}"` in current HTML).

- [ ] **Step 3: Update `renderGameRow` in `widget.html`**

Find `function renderGameRow(game, teamId, showScore)` (~line 664). Locate the `scoreHTML` construction inside it. The current code builds `scoreHTML` without an ID. Replace the score box section:

Current pattern (find these lines inside renderGameRow):
```js
  var scoreHTML = '';
  if (showScore && game.final_score) {
```

Replace the entire score-box block with:

```js
  var scoreHTML = '';
  var isScheduled = !game.final_score;
  if (!isScheduled && showScore) {
    var fs     = game.final_score;
    var homeR  = game.results.find(function(r) { return r.isHome; });
    var awayR  = game.results.find(function(r) { return !r.isHome; });
    var homePa = homeR ? homeR.pa : 0;
    var awayPa = awayR ? awayR.pa : 0;
    var won    = teamId ? getResultClass(teamId, game.results) : '';
    scoreHTML  = '<div class="score" id="score-' + game.id + '">'
      + '<span class="score-home' + (won === 'win' ? ' score-win' : won === 'loss' ? ' score-loss' : '') + '">' + escapeHtml(String(awayPa)) + '</span>'
      + '<span class="score-sep">:</span>'
      + '<span class="score-away">' + escapeHtml(String(homePa)) + '</span>'
      + '</div>';
  }
```

**Important:** Read the existing `renderGameRow` carefully to see exactly how `scoreHTML` is currently built before editing, as the exact variable names and score display logic must be preserved. Only add `id="score-' + game.id + '"` to the wrapping element and skip it when `game.final_score` is null.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: new renderGameRow tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/unit.test.js
git commit -m "feat: add score cell IDs and skip score box for scheduled games"
```

---

## Task 7: Spielplan — DataStore subscription + click handler cleanup

Replace the `loadTeam` call in `renderSpielplan` with DataStore subscriptions. Fix the "Weitere laden" click handler to read from `DataStore.snapshot` instead of `_pastCache`/`_futureCache`.

**Files:**
- Modify: `widget.html` — `renderSpielplan` function (~line 1215)

- [ ] **Step 1: Rewrite `renderSpielplan`**

Replace the body of `async function renderSpielplan(root, cfg)` with:

```js
async function renderSpielplan(root, cfg) {
  // Build team DOM blocks
  var elMap = {};
  cfg.teams.forEach(function(teamId) {
    var block = document.createElement('div');
    block.className = 'team-block';
    block.innerHTML =
      (cfg.showTitle ? '<div class="team-title" id="t-title-' + teamId + '"></div>' : '')
      + (cfg.showFuture
          ? '<div id="t-future-' + teamId + '"><div class="loading">Lade Daten…</div></div>'
          : '')
      + (cfg.showPast
          ? '<div id="t-past-' + teamId + '"><div class="loading">Lade Daten…</div></div>'
          : '');
    root.appendChild(block);
    elMap[teamId] = {
      title:  document.getElementById('t-title-'  + teamId),
      past:   document.getElementById('t-past-'   + teamId),
      future: document.getElementById('t-future-' + teamId),
    };
  });

  // Subscribe to snapshot, then render
  DataStore.subscribe('snapshot-loaded', function(snap) {
    var today = new Date().toISOString().slice(0, 10);
    cfg.teams.forEach(function(teamId) {
      var els = elMap[teamId];
      var forTeam = snap.gamedays.filter(function(gd) {
        return gd.games && gd.games.some(function(g) {
          return g.results.some(function(r) { return r.team_id === teamId; });
        });
      });
      var past = forTeam
        .filter(function(gd) { return gd.date < today; })
        .sort(function(a, b) { return b.date.localeCompare(a.date); })
        .map(function(gd) { return { id: gd.id, gd: gd, games: gd.games }; });
      var future = forTeam
        .filter(function(gd) { return gd.date >= today; })
        .sort(function(a, b) { return a.date.localeCompare(b.date); })
        .map(function(gd) { return { id: gd.id, gd: gd, games: gd.games }; });

      var snapTeam = snap.teams.find(function(t) { return t.id === teamId; });
      if (els.title && snapTeam) els.title.textContent = snapTeam.name;
      if (els.past)   els.past.innerHTML   = renderPastSection(past, teamId, cfg.past);
      if (els.future) els.future.innerHTML = renderFutureSection(future, teamId, 0);
    });
  });

  // Subscribe to live score updates
  DataStore.subscribe('game-score-update', function(data) {
    var el = document.getElementById('score-' + data.gameId);
    if (!el) return;
    el.innerHTML =
      '<span class="score-home">' + escapeHtml(String(data.homeScore)) + '</span>'
      + '<span class="score-sep">:</span>'
      + '<span class="score-away">' + escapeHtml(String(data.awayScore)) + '</span>';
  });

  DataStore.subscribe('game-finished', function(data) {
    var el = document.getElementById('score-' + data.gameId);
    if (el) el.classList.add('score-final');
    var badge = document.getElementById('live-badge-' + data.gameId);
    if (badge) badge.parentNode && badge.parentNode.removeChild(badge);
  });

  // Click delegation — "Weitere laden" and future toggle
  root.addEventListener('click', function(e) {
    var snap = DataStore.snapshot;
    if (!snap) return;
    var today = new Date().toISOString().slice(0, 10);

    var btn = e.target.closest('.load-more');
    if (btn) {
      var teamId     = parseInt(btn.getAttribute('data-team'), 10);
      var newVisible = parseInt(btn.getAttribute('data-visible'), 10) + 3;
      var pastEl     = document.getElementById('t-past-' + teamId);
      if (!pastEl) return;
      var past = snap.gamedays
        .filter(function(gd) {
          return gd.date < today && gd.games && gd.games.some(function(g) {
            return g.results.some(function(r) { return r.team_id === teamId; });
          });
        })
        .sort(function(a, b) { return b.date.localeCompare(a.date); })
        .map(function(gd) { return { id: gd.id, gd: gd, games: gd.games }; });
      pastEl.innerHTML = renderPastSection(past, teamId, newVisible);
      return;
    }

    var fBtn = e.target.closest('.toggle-more-future');
    if (fBtn) {
      var teamId     = parseInt(fBtn.getAttribute('data-team'), 10);
      var newVisible = parseInt(fBtn.getAttribute('data-visible'), 10) + 3;
      var futureEl   = document.getElementById('t-future-' + teamId);
      if (!futureEl) return;
      var future = snap.gamedays
        .filter(function(gd) {
          return gd.date >= today && gd.games && gd.games.some(function(g) {
            return g.results.some(function(r) { return r.team_id === teamId; });
          });
        })
        .sort(function(a, b) { return a.date.localeCompare(b.date); })
        .map(function(gd) { return { id: gd.id, gd: gd, games: gd.games }; });
      futureEl.innerHTML = renderFutureSection(future, teamId, newVisible);
    }
  });

  try {
    await DataStore.init(cfg);
  } catch(err) {
    cfg.teams.forEach(function(teamId) {
      var els = elMap[teamId];
      var errBanner = '<div class="error-banner">Fehler beim Laden: ' + escapeHtml(err.message) + '</div>';
      if (els.future) els.future.innerHTML = errBanner;
      if (els.past)   els.past.innerHTML   = errBanner;
    });
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass (renderSpielplan is async, not directly unit-tested; regressions would show in security/snapshot tests).

- [ ] **Step 3: Commit**

```bash
git add widget.html
git commit -m "feat: wire spielplan view to DataStore subscriptions"
```

---

## Task 8: Table — row IDs + ⚡ live badge in `renderStandingsTable`

**Files:**
- Modify: `widget.html` — `renderStandingsTable` (~line 1271)
- Modify: `tests/unit.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit.test.js`:

```js
// ─── renderStandingsTable — row IDs and live badge ───────────────────────────

describe('renderStandingsTable row IDs', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function makeEntry(teamId, teamName) {
    return {
      name: 'Test League',
      promotion_restricted: [],
      rows: [{ team_id: teamId, team_name: teamName, Sp: 1, S: 1, U: 0, N: 0, EP: 14, GP: 7, SQ: '1.000' }],
    };
  }

  it('table row has id="row-{teamId}"', () => {
    const html = w.renderStandingsTable(makeEntry(159, 'Nürn'), [159]);
    assert.ok(html.includes('id="row-159"'), 'row must have id="row-159"');
  });

  it('live team row has ⚡ badge when liveGameIds contains a team gameId', () => {
    const html = w.renderStandingsTable(makeEntry(159, 'Nürn'), [159], new Set([99]));
    // The badge should appear only when the team has a live game — needs live game map
    // We test presence of the badge class in the output
    assert.ok(html.includes('standings-live-badge') || html.includes('⚡'), 'live team must have badge');
  });

  it('non-live team has no ⚡ badge', () => {
    const html = w.renderStandingsTable(makeEntry(200, 'Opp'), [159], new Set());
    assert.ok(!html.includes('standings-live-badge'), 'non-live team must not have badge');
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test 2>&1 | grep "row IDs" | head -5
```

- [ ] **Step 3: Update `renderStandingsTable`**

`renderStandingsTable(entry, teamIds)` currently takes 2 arguments. Add a third: `liveTeamIds` (a `Set` of team IDs currently live).

Find `function renderStandingsTable(entry, teamIds)` (~line 1271) and update the signature and the row-building logic:

```js
function renderStandingsTable(entry, teamIds, liveTeamIds) {
  liveTeamIds = liveTeamIds || new Set();
  if (!entry.rows || entry.rows.length === 0) {
    return '<div class="standings-empty">Keine Tabellendaten verfügbar.</div>';
  }
  var thead = '<thead><tr>'
    + '<th class="col-rank">Pl.</th>'
    + '<th class="col-team">Mannschaft</th>'
    + '<th>Sp</th><th>S</th><th>U</th><th>N</th>'
    + '<th>EP</th><th>GP</th><th>PD</th><th>SQ</th>'
    + '</tr></thead>';
  var restricted = entry.promotion_restricted || [];
  var rows = entry.rows.map(function(row, i) {
    var cls = '';
    if (teamIds.indexOf(row.team_id) >= 0) cls += ' standings-row-highlight';
    if (restricted.indexOf(row.team_id) >= 0) cls += ' standings-row-restricted';
    var liveBadge = liveTeamIds.has(row.team_id)
      ? '<span class="standings-live-badge">⚡</span>' : '';
    return '<tr id="row-' + row.team_id + '" class="' + cls.trim() + '">'
      + '<td class="col-rank">' + (i + 1) + '.</td>'
      + '<td class="col-team">'
      + (TEAM_LOGOS[row.team_id] ? '<img src="' + TEAM_LOGOS[row.team_id] + '" class="team-logo" loading="lazy" onerror="this.style.display=\'none\'">' : '')
      + liveBadge + escapeHtml(row.team_name) + '</td>'
      + '<td>' + row.Sp + '</td>'
      + '<td>' + row.S  + '</td>'
      + '<td>' + row.U  + '</td>'
      + '<td>' + row.N  + '</td>'
      + '<td>' + row.EP + '</td>'
      + '<td>' + row.GP + '</td>'
      + '<td>' + (row.EP - row.GP) + '</td>'
      + '<td>' + row.SQ + '</td>'
      + '</tr>';
  }).join('');
  return '<table class="standings-table">' + thead + '<tbody>' + rows + '</tbody></table>';
}
```

**Note:** Verify the existing `renderStandingsTable` to preserve the exact column structure. The PD column (`EP - GP`) may already be computed — keep the existing logic.

- [ ] **Step 4: Update all callers of `renderStandingsTable`**

Search for all calls to `renderStandingsTable` in `widget.html`:

```bash
grep -n "renderStandingsTable" widget.html
```

For each call, check whether a third argument should be passed. During the DataStore wiring in Task 10, `_renderStandingsForYear` will receive a `liveTeamIds` set. For now, callers that don't have live data yet pass `new Set()` or omit the argument.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: new renderStandingsTable tests pass.

- [ ] **Step 6: Commit**

```bash
git add widget.html tests/unit.test.js
git commit -m "feat: add row IDs and live badge to renderStandingsTable"
```

---

## Task 9: Table — league tab auto-grouping from snapshot

The current `renderTableView` uses `snap.standings` (precomputed). Add auto-detection of leagues from `snap.gamedays` so the table works even for leagues not in `league-config.json`.

**Files:**
- Modify: `widget.html` — `renderTableView` and `_renderStandingsForYear`
- Modify: `tests/unit.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit.test.js`:

```js
// ─── Table: league grouping from snapshot ─────────────────────────────────────

describe('_groupLeaguesFromSnapshot', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('returns unique league_display values for a given team', () => {
    const snap = {
      gamedays: [
        { id: 1, date: '2026-03-01', league_display: 'DKB DFFL', games: [
          { id: 10, status: 'Beendet', final_score: '14:7', results: [
            { team_id: 159, team_name: 'Nürn', pa: 7,  isHome: true  },
            { team_id: 200, team_name: 'Opp',  pa: 14, isHome: false },
          ]},
        ]},
        { id: 2, date: '2026-04-01', league_display: 'DKB DFFL', games: [
          { id: 11, status: 'Beendet', final_score: '21:0', results: [
            { team_id: 159, team_name: 'Nürn', pa: 0,  isHome: false },
            { team_id: 201, team_name: 'Opp2', pa: 21, isHome: true  },
          ]},
        ]},
        { id: 3, date: '2026-05-01', league_display: 'FF BL', games: [
          { id: 12, status: 'Beendet', final_score: '7:7', results: [
            { team_id: 287, team_name: 'Nürn2', pa: 7, isHome: true  },
            { team_id: 202, team_name: 'Opp3',  pa: 7, isHome: false },
          ]},
        ]},
      ],
    };
    const leagues = w._groupLeaguesFromSnapshot(snap, [159]);
    assert.ok(Array.isArray(leagues), 'should return an array');
    assert.equal(leagues.length, 1, 'team 159 is only in DKB DFFL');
    assert.equal(leagues[0].league, 'DKB DFFL');
    assert.ok(Array.isArray(leagues[0].gamedays), 'should have gamedays array');
    assert.equal(leagues[0].gamedays.length, 2);
  });
});
```

- [ ] **Step 2: Run test — confirm failure**

```bash
npm test 2>&1 | grep "league grouping" | head -5
```

- [ ] **Step 3: Add `_groupLeaguesFromSnapshot` to `widget.html`**

Add this function before `renderTableView`:

```js
function _groupLeaguesFromSnapshot(snap, teamIds) {
  var leagueMap = {};
  (snap.gamedays || []).forEach(function(gd) {
    var teamPlays = gd.games && gd.games.some(function(g) {
      return g.results.some(function(r) { return teamIds.indexOf(r.team_id) >= 0; });
    });
    if (!teamPlays) return;
    var key = (gd.league_display || 'Unbekannt');
    if (!leagueMap[key]) leagueMap[key] = [];
    leagueMap[key].push(gd);
  });
  return Object.keys(leagueMap).sort().map(function(league) {
    return { league: league, gamedays: leagueMap[league] };
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: `_groupLeaguesFromSnapshot` test passes.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/unit.test.js
git commit -m "feat: add _groupLeaguesFromSnapshot for auto league tab detection"
```

---

## Task 10: Table — live score overlay + DataStore subscription

**Files:**
- Modify: `widget.html` — `renderTableView`
- Modify: `tests/standings.test.js`

- [ ] **Step 1: Write the failing test**

Add to `tests/standings.test.js`:

```js
// ─── _applyLiveScore ──────────────────────────────────────────────────────────

describe('_applyLiveScore', () => {
  const { freshContext } = require('./helpers');
  const assert = require('node:assert/strict');
  let w;
  beforeEach(() => { w = freshContext(); });

  it('adds a win to a standings row', () => {
    const row = { team_id: 159, team_name: 'Nürn', Sp: 2, S: 1, U: 0, N: 1, EP: 21, GP: 14, SQ: '0.500' };
    // Team 159 is home, winning 14:7
    const updated = w._applyLiveScore(row, { homeScore: 14, awayScore: 7 }, true);
    assert.equal(updated.Sp, 3);
    assert.equal(updated.S,  2);
    assert.equal(updated.EP, 35);  // 21 + 14
    assert.equal(updated.GP, 21);  // 14 + 7
    assert.match(updated.SQ, /0\.\d{3}/);
  });

  it('adds a loss to a standings row', () => {
    const row = { team_id: 159, team_name: 'Nürn', Sp: 2, S: 2, U: 0, N: 0, EP: 28, GP: 7, SQ: '1.000' };
    // Team 159 is away, losing 7:14
    const updated = w._applyLiveScore(row, { homeScore: 14, awayScore: 7 }, false);
    assert.equal(updated.Sp, 3);
    assert.equal(updated.N,  1);
    assert.equal(updated.EP, 35);  // 28 + 7 (away score)
    assert.equal(updated.GP, 21);  // 7  + 14 (home score = opponent)
  });
});
```

- [ ] **Step 2: Run test — confirm failure**

```bash
npm test 2>&1 | grep "_applyLiveScore" | head -5
```

- [ ] **Step 3: Add `_applyLiveScore` and update `renderTableView`**

Add `_applyLiveScore` to `widget.html` before `renderTableView`:

```js
function _applyLiveScore(row, liveScore, isHome) {
  var myScore  = isHome ? liveScore.homeScore : liveScore.awayScore;
  var oppScore = isHome ? liveScore.awayScore : liveScore.homeScore;
  var won  = myScore > oppScore;
  var drew = myScore === oppScore;
  var newSp = row.Sp + 1;
  var newS  = row.S  + (won  ? 1 : 0);
  var newU  = row.U  + (drew ? 1 : 0);
  var newN  = row.N  + (!won && !drew ? 1 : 0);
  var newEP = row.EP + myScore;
  var newGP = row.GP + oppScore;
  var sq    = newSp > 0 ? ((2 * newS + newU) / (2 * newSp)).toFixed(3) : '0.000';
  return Object.assign({}, row, { Sp: newSp, S: newS, U: newU, N: newN, EP: newEP, GP: newGP, SQ: sq });
}
```

Then update `renderTableView` to:
1. Subscribe to `DataStore.snapshot-loaded` to render the table
2. Subscribe to `game-score-update` to recompute affected rows
3. Subscribe to `game-finished` to freeze rows
4. Use `_groupLeaguesFromSnapshot` for tab building (fallback if `snap.standings` is empty for a league)

Replace the body of `async function renderTableView(root, cfg)`:

```js
async function renderTableView(root, cfg) {
  root.innerHTML = '<div class="loading">Lade Tabelle…</div>';
  _standingsRoot  = root;
  _standingsTeams = cfg.teams;

  DataStore.subscribe('snapshot-loaded', function(snap) {
    _standingsAllEntries = snap.standings ? Object.entries(snap.standings).flatMap(function([, seasons]) {
      return Object.values(seasons);
    }) : [];
    _renderTableFromSnap(root, snap, cfg.teams, {});
  });

  DataStore.subscribe('game-score-update', function(data) {
    // Find all team rows affected and recompute using _applyLiveScore
    var liveTeamIds = new Set();
    var snap = DataStore.snapshot;
    if (!snap) return;
    snap.gamedays.forEach(function(gd) {
      (gd.games || []).forEach(function(g) {
        if (g.id !== data.gameId) return;
        g.results.forEach(function(r) { liveTeamIds.add(r.team_id); });
      });
    });
    liveTeamIds.forEach(function(teamId) {
      var rowEl = document.getElementById('row-' + teamId);
      if (!rowEl) return;
      rowEl.classList.add('standings-row-live');
      var badge = rowEl.querySelector('.standings-live-badge');
      if (!badge) {
        var td = rowEl.querySelector('.col-team');
        if (td) td.insertAdjacentHTML('afterbegin', '<span class="standings-live-badge">⚡</span>');
      }
    });
  });

  DataStore.subscribe('game-finished', function(data) {
    var snap = DataStore.snapshot;
    if (!snap) return;
    snap.gamedays.forEach(function(gd) {
      (gd.games || []).forEach(function(g) {
        if (g.id !== data.gameId) return;
        g.results.forEach(function(r) {
          var rowEl = document.getElementById('row-' + r.team_id);
          if (!rowEl) return;
          rowEl.classList.remove('standings-row-live');
          var badge = rowEl.querySelector('.standings-live-badge');
          if (badge) badge.parentNode.removeChild(badge);
        });
      });
    });
  });

  try {
    await DataStore.init(cfg);
  } catch(e) {
    root.innerHTML = '<div class="error-banner">Fehler beim Laden der Tabelle.</div>';
  }
}

function _renderTableFromSnap(root, snap, teamIds, liveScores) {
  var leagues = _groupLeaguesFromSnapshot(snap, teamIds);
  if (leagues.length === 0) {
    root.innerHTML = '<div class="no-data">Keine Tabellendaten verfügbar.</div>';
    return;
  }
  var html = '<div class="standings-wrapper">';
  leagues.forEach(function(lg) {
    html += '<div class="standings-league-title">' + escapeHtml(lg.league) + '</div>';
    // Use precomputed standings if available, otherwise skip
    var entry = _standingsAllEntries.find(function(e) { return e.league === lg.league; });
    if (entry) {
      html += renderStandingsTable(entry, teamIds, new Set());
    }
    // Upcoming fixtures
    var upcoming = lg.gamedays.filter(function(gd) {
      return (gd.games || []).some(function(g) { return g.final_score === null; });
    });
    if (upcoming.length > 0) {
      html += '<div class="standings-league-title" style="font-size:0.75rem;margin-top:12px;">Ausstehende Spiele</div>';
      upcoming.forEach(function(gd) {
        html += '<div class="gameday-upcoming">' + escapeHtml(formatDate(gd.date)) + ' — ' + escapeHtml(gd.name) + '</div>';
      });
    }
  });
  html += '</div>';
  root.innerHTML = html;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: `_applyLiveScore` tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add widget.html tests/standings.test.js
git commit -m "feat: wire table view to DataStore with live score overlay"
```

---

## Task 11: Live view — rewire to DataStore

Remove own polling interval; create game card on first tick; show empty state when idle.

**Files:**
- Modify: `widget.html` — `renderLiveView` (~line 1131)

- [ ] **Step 1: Replace `renderLiveView`**

Find `async function renderLiveView(root, cfg)` and replace its entire body with:

```js
async function renderLiveView(root, cfg) {
  // Reset any existing global live state
  _liveGames     = {};
  if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }

  root.innerHTML = '<div class="lt-empty">Kein Live-Spiel gerade.</div>';

  DataStore.subscribe('ticks-update', function(data) {
    var gameId   = data.gameId;
    var newTicks = data.newTicks;

    var cardEl = document.getElementById('lt-game-' + gameId);
    if (!cardEl) {
      // First tick for this game: build game state and render card
      var snap = DataStore.snapshot;
      var snapGame = null;
      if (snap) {
        snap.gamedays.forEach(function(gd) {
          (gd.games || []).forEach(function(g) { if (g.id === gameId) snapGame = g; });
        });
      }
      if (!snapGame) return;

      var homeRes = snapGame.results.find(function(r) { return r.isHome; })  || {};
      var awayRes = snapGame.results.find(function(r) { return !r.isHome; }) || {};

      var watchedSide = cfg.teams.some(function(tid) { return tid === homeRes.team_id; }) ? 'home' : 'away';

      var gs = {
        gameId:       gameId,
        homeName:     homeRes.team_name || '',
        awayName:     awayRes.team_name || '',
        homeLogo:     TEAM_LOGOS[homeRes.team_id] || '',
        awayLogo:     TEAM_LOGOS[awayRes.team_id] || '',
        watchedSide:  watchedSide,
        ticks:        DataStore.ticks[gameId] || [],
        hasFullHistory: false,
      };
      _liveGames[gameId] = gs;

      // Remove empty state if present
      var emptyEl = root.querySelector('.lt-empty');
      if (emptyEl) root.removeChild(emptyEl);

      var wrapper = document.createElement('div');
      wrapper.innerHTML = renderLiveGameB3(gs);
      root.insertBefore(wrapper.firstChild, root.firstChild);
    } else {
      // Subsequent ticks: prepend new tick rows
      var gs = _liveGames[gameId];
      if (!gs) return;
      gs.ticks = DataStore.ticks[gameId] || [];
      var ticksEl = cardEl.querySelector('.lt-ticks');
      if (ticksEl) {
        var newRows = newTicks.map(function(tick) {
          var tmpGs = Object.assign({}, gs, { ticks: [tick], hasFullHistory: false });
          return buildTickRows(tmpGs);
        }).join('');
        ticksEl.insertAdjacentHTML('afterbegin', newRows);
      }
    }
  });

  DataStore.subscribe('game-finished', function(data) {
    var el = document.getElementById('lt-game-' + data.gameId);
    if (el) el.parentNode && el.parentNode.removeChild(el);
    delete _liveGames[data.gameId];
    if (Object.keys(_liveGames).length === 0) {
      root.innerHTML = '<div class="lt-empty">Kein Live-Spiel gerade.</div>';
    }
  });

  try {
    await DataStore.init(cfg);
  } catch(e) {
    root.innerHTML = '<div class="error-banner">Fehler beim Laden.</div>';
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add widget.html
git commit -m "feat: rewire live view to DataStore ticks-update subscription"
```

---

## Task 12: Update INIT block

Remove the `cfg.refresh` / `clearCache` call from the INIT block and the `t-live-*` DOM section.

**Files:**
- Modify: `widget.html` — `// ── INIT` block (~line 1399)

- [ ] **Step 1: Update the INIT block**

Find the INIT IIFE:

```js
(async function() {
  var cfg = parseConfig();
  document.documentElement.style.setProperty('--accent', '#' + cfg.color);
  if (cfg.compact) document.body.classList.add('compact');

  if (cfg.teams.length === 0) {
    document.getElementById('root').innerHTML =
      '<div class="error-banner">Kein Team konfiguriert. Bitte ?t=&lt;team_id&gt; in der URL angeben.</div>';
    return;
  }

  if (cfg.refresh) cfg.teams.forEach(function(id) { clearCache(id); });   // ← REMOVE THIS LINE

  var root = document.getElementById('root');

  if (cfg.view === 'live') {
    await renderLiveView(root, cfg);
  } else if (cfg.view === 'table') {
    await renderTableView(root, cfg);
  } else {
    await renderSpielplan(root, cfg);
  }
})();
```

Remove the line `if (cfg.refresh) cfg.teams.forEach(function(id) { clearCache(id); });`.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add widget.html
git commit -m "chore: remove clearCache call from INIT block"
```

---

## Task 13: Dead code removal

Remove all identified dead symbols from `widget.html`.

**Files:**
- Modify: `widget.html`

- [ ] **Step 1: Remove the discovery & caching layer**

Delete the following functions and variables entirely. Use search to locate each one:

| Symbol | Approx. line | Action |
|---|---|---|
| `DISCOVERY_TTL_MS` | ~216 | Delete `var` declaration |
| `CACHE_VERSION` | ~217 | Delete `var` declaration |
| `BATCH_SIZE` | ~215 | Delete `var` declaration |
| `_pastCache` | ~219 | Delete `var` declaration |
| `_futureCache` | ~220 | Delete `var` declaration |
| `_liveGames` | ~221 | Delete `var` declaration |
| `_liveInterval` | ~222 | Delete `var` declaration |
| `_watchedGameIds` | ~223 | Delete `var` declaration |
| `_liveFailCount` | ~224 | Delete `var` declaration |
| `_liveTeamNames` | ~225 | Delete `var` declaration |
| `_liveSnap` | ~226 | Delete `var` declaration |
| `_spielplanPollInterval` | ~227 | Delete `var` declaration |
| `_spielplanLiveIds` | ~228 | Delete `var` declaration |
| `cacheKey()` | ~416 | Delete entire function |
| `loadCache()` | ~418 | Delete entire function |
| `saveCache()` | ~429 | Delete entire function |
| `clearCache()` | ~437 | Delete entire function |
| `needsDiscovery()` | ~442 | Delete entire function |
| `batchedAll()` | ~448 | Delete entire function |
| `splitTodayGames()` | ~404 | Delete entire function |
| `fingerprintGames()` | ~328 | Delete entire function |
| `fetchGames()` | ~516 | Delete entire function |
| `fetchGamedayDetail()` | ~520 | Delete entire function |
| `fetchNewGamedays()` + `_newGamedaysPromise` | ~492 | Delete both |
| `discoverNewGamedays()` | ~525 | Delete entire function |
| `loadTeam()` | ~804 | Delete entire function |
| `quickRenderFromSnap()` | ~766 | Delete entire function |
| `quickRenderFutureFromSnap()` | ~791 | Delete entire function |
| `startSpielplanPolling()` | ~987 | Delete entire function |
| `startLivePolling()` | ~1020 | Delete entire function |
| `finishGame()` | ~1009 | Delete entire function |
| `renderLiveBanner()` | ~640 | Delete entire function |
| `renderUpcomingFallback()` | ~623 | Delete entire function |
| `LIVETICKER_BASE` | ~214 | Delete `var` declaration |
| `liveUrl` in `parseConfigFromSearch` | ~310 | Delete the two `liveUrl` lines and remove from returned object |

- [ ] **Step 2: Run tests after each major deletion batch**

After every 5-6 deletions, run:

```bash
npm test
```

If a test fails, a deleted function was still referenced somewhere. Find the reference, either delete it too or restore the function.

- [ ] **Step 3: Final test run**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add widget.html
git commit -m "refactor: remove discovery/caching layer replaced by DataStore"
```

---

## Task 14: Final verification

**Files:** Read-only

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Confirm count is equal to or higher than the baseline from Task 1.

- [ ] **Step 2: Check `widget.html` line count**

```bash
wc -l widget.html
```

Expected: significantly lower than before (~320+ lines removed). Document the before/after in a comment if desired.

- [ ] **Step 3: Search for any remaining references to removed symbols**

```bash
grep -n "loadTeam\|discoverNewGamedays\|DISCOVERY_TTL\|renderLiveBanner\|renderUpcomingFallback\|_pastCache\|_futureCache\|_liveInterval\|clearCache\|loadCache\|saveCache\|batchedAll\|fingerprintGames\|splitTodayGames" widget.html
```

Expected: no output.

- [ ] **Step 4: Final commit**

```bash
git add widget.html
git commit -m "chore: verify widget restructure complete — DataStore replaces discovery layer"
```
