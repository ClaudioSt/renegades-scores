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

