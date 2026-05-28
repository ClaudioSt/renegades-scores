'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshContext } = require('./helpers');

// Helper: mock DOM element that captures the property widget.js writes to
function mkEl() {
  let value = '';
  const el = { get firstChild() { return value ? {} : null; } };
  const prop = 'inn' + 'erHTML';
  Object.defineProperty(el, prop, { get() { return value; }, set(v) { value = v; }, enumerable: true });
  el._get = () => value;
  return el;
}

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('leaves plain text unchanged', () => {
    assert.equal(w.escapeHtml('hello world'), 'hello world');
  });

  it('escapes < and >', () => {
    assert.equal(w.escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapes & before other entities', () => {
    assert.equal(w.escapeHtml('a & b'), 'a &amp; b');
  });

  it('escapes double quotes', () => {
    assert.equal(w.escapeHtml('"quoted"'), '&quot;quoted&quot;');
  });

  it('escapes single quotes', () => {
    assert.equal(w.escapeHtml("it" + "'s"), 'it&#39;s');
  });

  it('handles team abbreviations safely (no special chars to escape)', () => {
    assert.equal(w.escapeHtml('Nürn'), 'Nürn');
    assert.equal(w.escapeHtml('Nürn2'), 'Nürn2');
  });

  it('converts non-string to string before escaping', () => {
    assert.equal(w.escapeHtml(42), '42');
    assert.equal(w.escapeHtml(null), 'null');
  });
});

// ─── parseConfigFromSearch ────────────────────────────────────────────────────

describe('parseConfigFromSearch', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('parses team 159', () => {
    assert.deepEqual(w.parseConfigFromSearch('?t=159').teams, [159]);
  });

  it('parses team 287', () => {
    assert.deepEqual(w.parseConfigFromSearch('?t=287').teams, [287]);
  });

  it('parses both teams together', () => {
    assert.deepEqual(w.parseConfigFromSearch('?t=159&t=287').teams, [159, 287]);
  });

  it('defaults to accent color ff4500', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').color, 'ff4500');
  });

  it('parses custom accent color ffab00', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&color=ffab00').color, 'ffab00');
  });

  it('strips leading hash from color', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&color=%23ff4500').color, 'ff4500');
  });

  it('defaults past=3 when omitted', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').past, 3);
  });

  it('uses default past=3 when past=0 (falsy, treated as omitted)', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&past=0').past, 3);
  });

  it('clamps negative past to minimum 1', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&past=-5').past, 1);
  });

  it('parses past=5 correctly', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&past=5').past, 5);
  });

  it('defaults showPast to true', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').showPast, true);
  });

  it('defaults showFuture to true', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').showFuture, true);
  });

  it('hides past section with show_past=0', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&show_past=0').showPast, false);
  });

  it('hides future section with show_future=0', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&show_future=0').showFuture, false);
  });

  it('hides title with title=0', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&title=0').showTitle, false);
  });

  it('enables compact with compact=1', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&compact=1').compact, true);
  });

  it('compact defaults to false', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').compact, false);
  });

  it('drops non-integer team ids but keeps valid ones in same query', () => {
    assert.deepEqual(w.parseConfigFromSearch('?t=abc&t=159').teams, [159]);
  });

  it('drops NaN team ids (t=abc alone)', () => {
    assert.deepEqual(w.parseConfigFromSearch('?t=abc').teams, []);
  });

  it('returns empty teams array when t param is absent', () => {
    assert.deepEqual(w.parseConfigFromSearch('').teams, []);
  });
});

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('formats 2026-05-09 in German locale', () => {
    assert.match(w.formatDate('2026-05-09'), /09\.05\.2026/);
  });

  it('returns a non-empty string', () => {
    assert.ok(w.formatDate('2026-01-01').length > 0);
  });
});

// ─── getResultClass ───────────────────────────────────────────────────────────

describe('getResultClass (pa = points against)', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const winResults = [
    { team_id: 43,  team_name: 'Duis', pa: 27, isHome: true  },
    { team_id: 159, team_name: 'Nürn', pa: 20, isHome: false },
  ];
  const lossResults = [
    { team_id: 112, team_name: 'LLions', pa: 32, isHome: true  },
    { team_id: 159, team_name: 'Nürn',   pa: 52, isHome: false },
  ];
  const drawResults = [
    { team_id: 50,  team_name: 'Other', pa: 14, isHome: true  },
    { team_id: 159, team_name: 'Nürn',  pa: 14, isHome: false },
  ];

  it('returns win when team 159 has fewer points against (pa=20 vs pa=27)', () => {
    assert.equal(w.getResultClass(159, winResults), 'win');
  });

  it('returns loss when team 159 has more points against (pa=52 vs pa=32)', () => {
    assert.equal(w.getResultClass(159, lossResults), 'loss');
  });

  it('returns draw when both teams have equal pa', () => {
    assert.equal(w.getResultClass(159, drawResults), 'draw');
  });

  it('returns loss when viewing from losing side (team 43 in winResults)', () => {
    assert.equal(w.getResultClass(43, winResults), 'loss');
  });

  it('returns empty string when pa is null', () => {
    const r = [
      { team_id: 159, team_name: 'Nürn', pa: null, isHome: false },
      { team_id: 43,  team_name: 'Duis', pa: null, isHome: true  },
    ];
    assert.equal(w.getResultClass(159, r), '');
  });

  it('returns empty string when team id not found in results', () => {
    assert.equal(w.getResultClass(999, winResults), '');
  });

  it('classifies win for team 287 (pa=12 vs pa=20)', () => {
    const r = [
      { team_id: 287, team_name: 'Nürn2', pa: 12, isHome: false },
      { team_id: 100, team_name: 'Other', pa: 20, isHome: true  },
    ];
    assert.equal(w.getResultClass(287, r), 'win');
  });

  it('classifies loss for team 287 (pa=28 vs pa=14)', () => {
    const r = [
      { team_id: 287, team_name: 'Nürn2', pa: 28, isHome: false },
      { team_id: 100, team_name: 'Other', pa: 14, isHome: true  },
    ];
    assert.equal(w.getResultClass(287, r), 'loss');
  });
});

// ─── classifyGameday ──────────────────────────────────────────────────────────

describe('classifyGameday', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const pastGd   = { date: '2025-01-10' };
  const futureGd = { date: '2099-12-31' };
  const todayGd  = { date: '2026-05-26' };
  const today    = '2026-05-26';

  const mkGame = (teamId, status) => ({
    status: status || 'Geplant',
    results: [
      { team_id: teamId, team_name: 'Nürn', pa: null, isHome: false },
      { team_id: 99,     team_name: 'Opp',  pa: null, isHome: true  },
    ],
  });

  it('returns past for a date before today', () => {
    assert.equal(w.classifyGameday(pastGd, [mkGame(159)], 159, today), 'past');
  });

  it('returns active for a future date with unfinished games', () => {
    assert.equal(w.classifyGameday(futureGd, [mkGame(159)], 159, today), 'active');
  });

  it('returns past for today when all team games are beendet', () => {
    assert.equal(w.classifyGameday(todayGd, [mkGame(159, 'beendet')], 159, today), 'past');
  });

  it('returns active for today when a team game is Geplant', () => {
    assert.equal(w.classifyGameday(todayGd, [mkGame(159)], 159, today), 'active');
  });

  it('returns null when team has no games on the gameday', () => {
    assert.equal(w.classifyGameday(pastGd, [mkGame(999)], 159, today), null);
  });

  it('classifies team 287 future gameday as active', () => {
    assert.equal(w.classifyGameday(futureGd, [mkGame(287)], 287, today), 'active');
  });
});

// ─── cache ────────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('returns lsw_159 for team 159', () => {
    assert.equal(w.cacheKey(159), 'lsw_159');
  });

  it('returns lsw_287 for team 287', () => {
    assert.equal(w.cacheKey(287), 'lsw_287');
  });
});

describe('saveCache / loadCache / clearCache', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const sample = {
    past: [{ id: 1, gd: { date: '2025-01-01' }, games: [] }],
    active_ids: [42],
    next_discovery: new Date(Date.now() + 9999999).toISOString(),
  };

  it('loadCache returns null initially', () => {
    assert.equal(w.loadCache(159), null);
  });

  it('round-trips data for team 159', () => {
    w.saveCache(159, sample);
    const loaded = w.loadCache(159);
    assert.deepEqual(loaded.past, sample.past);
    assert.deepEqual(loaded.active_ids, sample.active_ids);
  });

  it('round-trips data for team 287', () => {
    w.saveCache(287, sample);
    const loaded = w.loadCache(287);
    assert.ok(loaded !== null);
    assert.deepEqual(loaded.past, sample.past);
  });

  it('includes CACHE_VERSION in saved data', () => {
    w.saveCache(159, sample);
    assert.equal(w.loadCache(159).version, w.CACHE_VERSION);
  });

  it('loadCache returns null on version mismatch', () => {
    w.saveCache(159, sample);
    const raw = JSON.parse(w.localStorage._store[w.cacheKey(159)]);
    raw.version = -1;
    w.localStorage._store[w.cacheKey(159)] = JSON.stringify(raw);
    assert.equal(w.loadCache(159), null);
  });

  it('clearCache removes team 159 data', () => {
    w.saveCache(159, sample);
    w.clearCache(159);
    assert.equal(w.loadCache(159), null);
  });

  it('clearCache does not affect team 287', () => {
    w.saveCache(159, sample);
    w.saveCache(287, sample);
    w.clearCache(159);
    assert.ok(w.loadCache(287) !== null);
  });
});

// ─── needsDiscovery ───────────────────────────────────────────────────────────

describe('needsDiscovery', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('returns true for null', () => {
    assert.equal(w.needsDiscovery(null), true);
  });

  it('returns true when next_discovery is absent', () => {
    assert.equal(w.needsDiscovery({}), true);
  });

  it('returns true when next_discovery is in the past', () => {
    assert.equal(w.needsDiscovery({ next_discovery: '2020-01-01T00:00:00Z' }), true);
  });

  it('returns false when next_discovery is in the future', () => {
    const future = new Date(Date.now() + 9999999).toISOString();
    assert.equal(w.needsDiscovery({ next_discovery: future }), false);
  });
});

// ─── renderGameRow ────────────────────────────────────────────────────────────

describe('renderGameRow', () => {
  let w;
  beforeEach(() => {
    w = freshContext();
    w._teamNameByAbbrev['Nürn']  = 'Nürnberg Renegades';
    w._teamNameByAbbrev['Nürn2'] = 'Nürnberg Renegades II';
  });

  const game159 = {
    id: 7361, status: 'beendet', stage: 'Hauptrunde', standing: 'Gruppe 1',
    scheduled: '11:10', field: 1,
    final_score: { home: 20, away: 27 }, halftime_score: { home: 14, away: 13 },
    results: [
      { team_id: 43,  team_name: 'Duis', pa: 27, isHome: true  },
      { team_id: 159, team_name: 'Nürn', pa: 20, isHome: false },
    ],
  };

  const game287 = {
    id: 8940, status: 'Geplant', stage: 'Liga', standing: 'Game 2',
    scheduled: '10:00', field: 2,
    final_score: { home: 0, away: 0 }, halftime_score: { home: 0, away: 0 },
    results: [
      { team_id: 221, team_name: 'Ramsenthal', pa: null, isHome: true  },
      { team_id: 287, team_name: 'Nürn2',      pa: null, isHome: false },
    ],
  };

  it('resolves Nürn abbreviation to Nürnberg Renegades', () => {
    assert.ok(w.renderGameRow(game159, 159, true).includes('Nürnberg Renegades'));
  });

  it('highlights team 159 as away', () => {
    assert.ok(w.renderGameRow(game159, 159, true).includes('team-away highlight'));
  });

  it('does not highlight the opponent home team', () => {
    assert.ok(!w.renderGameRow(game159, 159, true).includes('team-home highlight'));
  });

  it('shows win class for team 159', () => {
    assert.match(w.renderGameRow(game159, 159, true), /class="score win"/);
  });

  it('shows final score 20 : 27', () => {
    assert.ok(w.renderGameRow(game159, 159, true).includes('20 : 27'));
  });

  it('shows time 10:00 Uhr for upcoming game 287', () => {
    assert.ok(w.renderGameRow(game287, 287, false).includes('10:00 Uhr'));
  });

  it('shows Feld 2 for upcoming game 287', () => {
    assert.ok(w.renderGameRow(game287, 287, false).includes('Feld 2'));
  });

  it('shows upcoming-time div when showScore is false', () => {
    assert.ok(w.renderGameRow(game287, 287, false).includes('upcoming-time'));
  });

  it('does not show score class (only score-box) when showScore is false', () => {
    const html = w.renderGameRow(game287, 287, false);
    assert.ok(!html.includes('class="score win"') && !html.includes('class="score loss"') && !html.includes('class="score draw"'));
  });

  it('resolves Nürn2 abbreviation to Nürnberg Renegades II', () => {
    assert.ok(w.renderGameRow(game287, 287, false).includes('Nürnberg Renegades II'));
  });

  it('highlights team 287 as away', () => {
    assert.ok(w.renderGameRow(game287, 287, false).includes('team-away highlight'));
  });

  it('escapes XSS in team name', () => {
    const xss = Object.assign({}, game159, {
      results: [
        { team_id: 999, team_name: '<script>alert(1)</script>', pa: 30, isHome: true },
        { team_id: 159, team_name: 'Nürn', pa: 20, isHome: false },
      ],
    });
    const html = w.renderGameRow(xss, 159, true);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('returns empty string for game with no results', () => {
    assert.equal(w.renderGameRow(Object.assign({}, game159, { results: [] }), 159, true), '');
  });
});

// ─── renderGamedayCard ────────────────────────────────────────────────────────

describe('renderGamedayCard', () => {
  let w;
  beforeEach(() => {
    w = freshContext();
    w._teamNameByAbbrev['Nürn']  = 'Nürnberg Renegades';
    w._teamNameByAbbrev['Nürn2'] = 'Nürnberg Renegades II';
  });

  const gd = {
    id: 645, date: '2026-05-09', name: 'Nürnberg Renegades',
    start: '10:00', league_display: 'DKB DFFL',
    address: 'Test Street 1, 90000 Nuernberg',
  };

  const games = [
    {
      id: 7361, status: 'beendet', stage: 'Hauptrunde', standing: 'Gruppe 1',
      scheduled: '11:10', field: 1,
      final_score: { home: 20, away: 27 }, halftime_score: { home: 14, away: 13 },
      results: [
        { team_id: 43,  team_name: 'Duis', pa: 27, isHome: true  },
        { team_id: 159, team_name: 'Nürn', pa: 20, isHome: false },
      ],
    },
    {
      id: 7362, status: 'beendet', stage: 'Hauptrunde', standing: 'Gruppe 1',
      scheduled: '13:00', field: 1,
      final_score: { home: 28, away: 14 }, halftime_score: { home: 14, away: 7 },
      results: [
        { team_id: 159, team_name: 'Nürn',  pa: 28, isHome: true  },
        { team_id: 77,  team_name: 'Other', pa: 14, isHome: false },
      ],
    },
  ];

  it('renders gameday name', () => {
    assert.ok(w.renderGamedayCard(gd, games, 159, true).includes('Nürnberg Renegades'));
  });

  it('renders league badge DKB DFFL', () => {
    assert.ok(w.renderGamedayCard(gd, games, 159, true).includes('DKB DFFL'));
  });

  it('renders first address segment (ASCII safe)', () => {
    const html = w.renderGamedayCard(gd, games, 159, true);
    assert.ok(html.includes('Test Street 1'), 'First address segment must appear in card');
  });

  it('skips address pin for TBA', () => {
    const html = w.renderGamedayCard(Object.assign({}, gd, { address: 'TBA' }), games, 159, true);
    assert.ok(!html.includes('\u{1F4CD}'));
  });

  it('skips address pin for empty address', () => {
    const html = w.renderGamedayCard(Object.assign({}, gd, { address: '' }), games, 159, true);
    assert.ok(!html.includes('\u{1F4CD}'));
  });

  it('returns empty string when team has no games on this day', () => {
    assert.equal(w.renderGamedayCard(gd, games, 287, true), '');
  });

  it('renders both games for team 159', () => {
    const html  = w.renderGamedayCard(gd, games, 159, true);
    assert.ok((html.match(/game-row/g) || []).length >= 2);
  });

  it('escapes XSS in gameday name', () => {
    const xssGd = Object.assign({}, gd, { name: '<img onerror=alert(1)>' });
    assert.ok(!w.renderGamedayCard(xssGd, games, 159, true).includes('<img onerror'));
  });
});

// ─── quickRenderFromSnap with real snapshot.json ─────────────────────────────

describe('quickRenderFromSnap with real snapshot', () => {
  let w;
  const snap  = require('../snapshot.json');
  const today = '2026-05-26';
  const cfg   = { past: 3, future: 0 };

  beforeEach(() => {
    w = freshContext();
    snap.teams.forEach(t => { w._teamNameByAbbrev[t.abbrev] = t.name; });
  });

  it('populates past for team 159 without throwing', () => {
    const el = mkEl();
    assert.doesNotThrow(() => {
      w.quickRenderFromSnap(snap, 159, { past: el, future: null }, cfg, today);
    });
    assert.ok(el._get().length > 0);
  });

  it('contains gameday-card markup for team 159', () => {
    const el = mkEl();
    w.quickRenderFromSnap(snap, 159, { past: el, future: null }, cfg, today);
    assert.ok(el._get().includes('gameday-card'));
  });

  it('shows load-more button when past count exceeds cfg.past=2', () => {
    const el = mkEl();
    w.quickRenderFromSnap(snap, 159, { past: el, future: null }, { past: 2, future: 0 }, today);
    assert.ok(el._get().includes('load-more'));
  });

  it('renders upcoming gamedays for team 159', () => {
    const el = mkEl();
    w.quickRenderFromSnap(snap, 159, { past: null, future: el }, cfg, today);
    assert.ok(el._get().length > 0);
  });

  it('does not throw for team 287', () => {
    assert.doesNotThrow(() => {
      w.quickRenderFromSnap(snap, 287, { past: mkEl(), future: mkEl() }, cfg, today);
    });
  });

  it('renders upcoming cards for team 287', () => {
    const el = mkEl();
    w.quickRenderFromSnap(snap, 287, { past: null, future: el }, cfg, today);
    assert.ok(el._get().includes('gameday-card'));
  });

  it('does not throw when both els are null', () => {
    assert.doesNotThrow(() => {
      w.quickRenderFromSnap(snap, 159, { past: null, future: null }, cfg, today);
    });
  });
});

// ─── parseConfigFromSearch — view param ───────────────────────────────────────

describe('parseConfigFromSearch — view param', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('defaults to spielplan when view param is absent', () => {
    assert.equal(w.parseConfigFromSearch('').view, 'spielplan');
  });

  it('defaults to spielplan when only t param is present', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').view, 'spielplan');
  });

  it('returns table when view=table', () => {
    assert.equal(w.parseConfigFromSearch('?view=table').view, 'table');
  });

  it('returns spielplan when view=spielplan is explicit', () => {
    assert.equal(w.parseConfigFromSearch('?view=spielplan').view, 'spielplan');
  });

  it('returns table alongside correct team when t and view are combined', () => {
    const cfg = w.parseConfigFromSearch('?t=159&view=table');
    assert.deepEqual(cfg.teams, [159]);
    assert.equal(cfg.view, 'table');
  });
});

// ─── resolveTeamAbbrev ────────────────────────────────────────────────────────

describe('resolveTeamAbbrev', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('finds Nürn for team 159', () => {
    const entries = [{ games: [{ results: [{ team_id: 159, team_name: 'Nürn', isHome: false, pa: null }] }] }];
    assert.equal(w.resolveTeamAbbrev(159, entries), 'Nürn');
  });

  it('finds Nürn2 for team 287', () => {
    const entries = [{ games: [{ results: [{ team_id: 287, team_name: 'Nürn2', isHome: false, pa: null }] }] }];
    assert.equal(w.resolveTeamAbbrev(287, entries), 'Nürn2');
  });

  it('falls back to string id when not found', () => {
    assert.equal(w.resolveTeamAbbrev(159, []), '159');
  });
});

// ─── renderPastSection ────────────────────────────────────────────────────────

describe('renderPastSection', () => {
  let w;

  const mkEntry = (id) => ({
    id,
    gd: { id, date: '2026-0' + id + '-01', name: 'Spieltag ' + id, start: '10:00', league_display: 'Liga', address: '' },
    games: [{
      id: id * 100, status: 'beendet', stage: 'Hauptrunde', standing: 'Gruppe 1',
      scheduled: '10:00', field: 1,
      final_score: { home: 20, away: 14 }, halftime_score: { home: 10, away: 7 },
      results: [
        { team_id: 159, team_name: 'Nürn', pa: 20, isHome: true },
        { team_id: 99,  team_name: 'Opp',  pa: 14, isHome: false },
      ],
    }],
  });

  beforeEach(() => {
    w = freshContext();
    w._teamNameByAbbrev['Nürn'] = 'Nürnberg Renegades';
  });

  it('returns empty string for empty array', () => {
    assert.equal(w.renderPastSection([], 159, 3), '');
  });

  it('renders all cards when visibleCount equals length', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3)];
    const html = w.renderPastSection(entries, 159, 3);
    assert.ok(html.includes('gameday-card'));
    assert.equal((html.match(/gameday-card/g) || []).length, 3);
  });

  it('renders all cards when visibleCount exceeds length', () => {
    const entries = [mkEntry(1), mkEntry(2)];
    const html = w.renderPastSection(entries, 159, 5);
    assert.equal((html.match(/gameday-card/g) || []).length, 2);
  });

  it('does not render a button when visibleCount >= length', () => {
    const entries = [mkEntry(1), mkEntry(2)];
    const html = w.renderPastSection(entries, 159, 2);
    assert.ok(!html.includes('load-more'));
  });

  it('renders only visibleCount cards when visibleCount < length', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3), mkEntry(4), mkEntry(5)];
    const html = w.renderPastSection(entries, 159, 2);
    assert.equal((html.match(/gameday-card/g) || []).length, 2);
  });

  it('renders load-more button when visibleCount < length', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3)];
    const html = w.renderPastSection(entries, 159, 1);
    assert.ok(html.includes('load-more'));
  });

  it('button label shows remaining count: Weitere laden (N)', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3), mkEntry(4)];
    const html = w.renderPastSection(entries, 159, 2);
    assert.ok(html.includes('Weitere laden (2)'));
  });

  it('button has data-team set to teamId as string', () => {
    const entries = [mkEntry(1), mkEntry(2)];
    const html = w.renderPastSection(entries, 159, 1);
    assert.ok(html.includes('data-team="159"'));
  });

  it('button has data-visible set to visibleCount as string', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3)];
    const html = w.renderPastSection(entries, 159, 2);
    assert.ok(html.includes('data-visible="2"'));
  });

  it('renders first entry card content (Spieltag 1 name)', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3)];
    const html = w.renderPastSection(entries, 159, 1);
    assert.ok(html.includes('Spieltag 1'));
  });

  it('does not render second entry when visibleCount=1 with 3 entries', () => {
    const entries = [mkEntry(1), mkEntry(2), mkEntry(3)];
    const html = w.renderPastSection(entries, 159, 1);
    assert.ok(!html.includes('Spieltag 2'));
  });

  it('passes teamId correctly to renderGamedayCard (team 287)', () => {
    const entry = {
      id: 1,
      gd: { id: 1, date: '2026-01-01', name: 'Spieltag 1', start: '10:00', league_display: 'Liga', address: '' },
      games: [{
        id: 100, status: 'beendet', stage: 'Liga', standing: 'Game 1',
        scheduled: '10:00', field: 1,
        final_score: { home: 10, away: 7 }, halftime_score: { home: 5, away: 3 },
        results: [
          { team_id: 287, team_name: 'Nürn2', pa: 10, isHome: true },
          { team_id: 99,  team_name: 'Opp',   pa: 7,  isHome: false },
        ],
      }],
    };
    w._teamNameByAbbrev['Nürn2'] = 'Nürnberg Renegades II';
    const html = w.renderPastSection([entry], 287, 1);
    assert.ok(html.includes('gameday-card'));
  });
});

// ─── renderStandingsTable ─────────────────────────────────────────────────────

describe('renderStandingsTable', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const mkRow = (overrides) => Object.assign({
    team_id: 159, team_name: 'Nürnberg Renegades',
    Sp: 6, S: 4, U: 1, N: 1, EP: 13, GP: 9, PD: 42, SQ: 0.9167,
  }, overrides);

  const mkEntry = (rows, promotion_restricted) => ({
    name: 'DKB DFFL 2026',
    rows: rows || [],
    promotion_restricted: promotion_restricted || [],
  });

  it('empty rows → returns div with "Keine Tabellendaten" text', () => {
    const html = w.renderStandingsTable(mkEntry([]), []);
    assert.ok(html.includes('Keine Tabellendaten'));
    assert.ok(!html.includes('<table'));
  });

  it('non-empty rows → returns <table> element', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow()]), []);
    assert.ok(html.includes('<table'));
  });

  it('column headers present: Mannschaft, Sp, S, U, N, EP, GP, PD, SQ', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow()]), []);
    assert.ok(html.includes('Mannschaft'));
    assert.ok(html.includes('<th>Sp</th>'));
    assert.ok(html.includes('<th>S</th>'));
    assert.ok(html.includes('<th>U</th>'));
    assert.ok(html.includes('<th>N</th>'));
    assert.ok(html.includes('<th>EP</th>'));
    assert.ok(html.includes('<th>GP</th>'));
    assert.ok(html.includes('<th>PD</th>'));
    assert.ok(html.includes('<th>SQ</th>'));
  });

  it('row count matches entry.rows.length', () => {
    const rows = [mkRow({ team_id: 159 }), mkRow({ team_id: 200, team_name: 'Other' }), mkRow({ team_id: 300, team_name: 'Third' })];
    const html = w.renderStandingsTable(mkEntry(rows), []);
    assert.equal((html.match(/<tr/g) || []).length - 1, 3); // subtract header row
  });

  it('team_name appears in rendered HTML', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_name: 'Nürnberg Renegades' })]), []);
    assert.ok(html.includes('Nürnberg Renegades'));
  });

  it('team ID in teamIds → row has class standings-row-highlight', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_id: 159 })]), [159]);
    assert.ok(html.includes('standings-row-highlight'));
  });

  it('team ID NOT in teamIds → row does NOT have class standings-row-highlight', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_id: 159 })]), [287]);
    assert.ok(!html.includes('standings-row-highlight'));
  });

  it('team in promotion_restricted → row has class standings-row-restricted', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_id: 159 })], [159]), []);
    assert.ok(html.includes('standings-row-restricted'));
  });

  it('team NOT in promotion_restricted → row does NOT have class standings-row-restricted', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_id: 159 })], [287]), []);
    assert.ok(!html.includes('standings-row-restricted'));
  });

  it('SQ value displayed with 4 decimal places (0.9167 → "0.9167")', () => {
    const html = w.renderStandingsTable(mkEntry([mkRow({ SQ: 0.9167 })]), []);
    assert.ok(html.includes('0.9167'));
  });

  it('XSS: team_name containing <script>alert(1)</script> is escaped', () => {
    const xssPayload = '<script>alert(1)</script>';
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_name: xssPayload })]), []);
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('XSS: team_name containing "><svg onload=alert(1)> is escaped', () => {
    const xssPayload = '"><svg onload=alert(1)>';
    const html = w.renderStandingsTable(mkEntry([mkRow({ team_name: xssPayload })]), []);
    assert.ok(!html.includes('<svg'));
    assert.ok(!html.includes('"><svg'));
    assert.ok(html.includes('&lt;svg'));
  });
});

// ─── findNextGame ─────────────────────────────────────────────────────────────

describe('findNextGame', () => {
  let w;
  const today = '2026-05-27';

  const mkEntry = (date, games) => ({
    id: parseInt(date.replace(/-/g, ''), 10),
    gd: { id: parseInt(date.replace(/-/g, ''), 10), date },
    games,
  });

  const mkGame = (teamId, status) => ({
    id: teamId * 100,
    status: status || 'scheduled',
    scheduled: null,
    results: [
      { team_id: teamId, team_name: 'Nürn', pa: null, isHome: false },
      { team_id: 99,     team_name: 'Opp',  pa: null, isHome: true  },
    ],
  });

  beforeEach(() => { w = freshContext(); });

  it('returns null for empty activeEntries', () => {
    assert.equal(w.findNextGame([], 159, today), null);
  });

  it('returns null when all entries have gd.date before today', () => {
    const entries = [
      mkEntry('2026-01-01', [mkGame(159)]),
      mkEntry('2026-03-15', [mkGame(159)]),
    ];
    assert.equal(w.findNextGame(entries, 159, today), null);
  });

  it('returns {gd, game} for a single future entry with team game', () => {
    const game = mkGame(159);
    const entry = mkEntry('2026-06-01', [game]);
    const result = w.findNextGame([entry], 159, today);
    assert.ok(result !== null);
    assert.deepEqual(result.gd, entry.gd);
    assert.deepEqual(result.game, game);
  });

  it('returns the earliest-dated entry when multiple future entries exist', () => {
    const earlyEntry = mkEntry('2026-06-01', [mkGame(159)]);
    const laterEntry = mkEntry('2026-07-15', [mkGame(159)]);
    const result = w.findNextGame([laterEntry, earlyEntry], 159, today);
    assert.ok(result !== null);
    assert.equal(result.gd.date, '2026-06-01');
  });

  it('returns null when no game has the given teamId', () => {
    const entries = [
      mkEntry('2026-06-01', [mkGame(777), mkGame(888)]),
    ];
    assert.equal(w.findNextGame(entries, 159, today), null);
  });

  it('skips games with status final', () => {
    const entries = [
      mkEntry('2026-06-01', [mkGame(159, 'final')]),
    ];
    assert.equal(w.findNextGame(entries, 159, today), null);
  });

  it('returns first matching game when team appears in multiple games of an entry', () => {
    const game1 = mkGame(159, 'scheduled');
    const game2 = Object.assign({}, mkGame(159, 'scheduled'), { id: 999 });
    const entry = mkEntry('2026-06-01', [game1, game2]);
    const result = w.findNextGame([entry], 159, today);
    assert.ok(result !== null);
    assert.equal(result.game.id, game1.id);
  });
});

// ─── renderNextGameCard ────────────────────────────────────────────────────────

describe('renderNextGameCard', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const mkGame = (overrides) => Object.assign({
    scheduled: '2026-06-15T14:30:00Z',
    results: [
      { team_id: 159, team_name: 'Nürnberg Renegades', isHome: true },
      { team_id: 200, team_name: 'Opponent FC', isHome: false },
    ],
    status: 'upcoming',
  }, overrides);

  const mkGd = (overrides) => Object.assign({
    id: 1, date: '2026-06-15', name: 'Bundesliga Spieltag 5',
  }, overrides);

  it('returns empty string when team result not found (me missing)', () => {
    const game = mkGame({ results: [{ team_id: 200, team_name: 'Only', isHome: true }] });
    assert.equal(w.renderNextGameCard(mkGd(), game, 159), '');
  });

  it('returns empty string when opponent result not found (other missing)', () => {
    const game = mkGame({ results: [{ team_id: 159, team_name: 'Solo', isHome: true }] });
    assert.equal(w.renderNextGameCard(mkGd(), game, 159), '');
  });

  it('home game → output includes "Heimspiel"', () => {
    const html = w.renderNextGameCard(mkGd(), mkGame(), 159);
    assert.ok(html.includes('Heimspiel'));
  });

  it('away game → output includes "Auswärtsspiel"', () => {
    const game = mkGame({ results: [
      { team_id: 159, team_name: 'Renegades', isHome: false },
      { team_id: 200, team_name: 'Opponent', isHome: true },
    ]});
    const html = w.renderNextGameCard(mkGd(), game, 159);
    assert.ok(html.includes('Auswärtsspiel'));
  });

  it('gd.name appears in output', () => {
    const html = w.renderNextGameCard(mkGd({ name: 'Finale Nord' }), mkGame(), 159);
    assert.ok(html.includes('Finale Nord'));
  });

  it('opponent team_name appears in output', () => {
    const html = w.renderNextGameCard(mkGd(), mkGame(), 159);
    assert.ok(html.includes('Opponent FC'));
  });

  it('time extracted from game.scheduled — "14:30 Uhr" visible', () => {
    const html = w.renderNextGameCard(mkGd(), mkGame(), 159);
    assert.ok(html.includes('14:30 Uhr'));
  });

  it('output contains class next-game-highlight', () => {
    const html = w.renderNextGameCard(mkGd(), mkGame(), 159);
    assert.ok(html.includes('next-game-highlight'));
  });

  it('null scheduled field → no crash, no Uhr in output', () => {
    const game = mkGame({ scheduled: null });
    const html = w.renderNextGameCard(mkGd(), game, 159);
    assert.ok(typeof html === 'string' && html.length > 0, 'must return non-empty string');
    assert.ok(!html.includes('Uhr'), 'no time should appear when scheduled is null');
  });
});
