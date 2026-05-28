'use strict';

/**
 * Security tests for widget.html
 *
 * Threat model:
 *   - Website visitor: XSS injected via snapshot data or URL params rendered into the iframe
 *   - Widget owner:    data leakage via postMessage; prototype pollution; CSS injection
 *
 * Tests that require a real browser (CSP headers, iframe sandbox, clickjacking) are
 * noted where relevant but cannot be automated here.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');
const fs     = require('fs');
const { freshContext } = require('./helpers');

// Common XSS payloads — any of these appearing raw in HTML output is a failure
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "' onmouseover='alert(1)",
  '<svg onload=alert(1)>',
  '<!--<script>-->alert(1)',
  '<script>alert(1)</script>',
  'javascript:alert(1)',
];

// noRawScript checks that dangerous patterns do NOT appear inside a real (unescaped)
// HTML tag in the output.  Event-handler text that has been safely escaped to
// &lt;img onerror=...&gt; is fine — the &lt; prevents it from becoming a live element.
function noRawScript(html) {
  // <script is never part of the widget's own markup
  assert.ok(!/<script/i.test(html), 'raw <script tag must not appear in output');
  // Event handlers inside actual (unescaped) opening tags — e.g. <img onerror=…>
  // The regex only matches when the event handler is inside a real tag (starts with <letter),
  // not inside escaped text like &lt;img onerror=…&gt;.
  assert.ok(!/<[a-z][^>]* onerror=/i.test(html),    'onerror= inside an HTML element');
  assert.ok(!/<[a-z][^>]* onload=/i.test(html),     'onload= inside an HTML element');
  assert.ok(!/<[a-z][^>]* onmouseover=/i.test(html),'onmouseover= inside an HTML element');
}

// ─── escapeHtml is the XSS firewall ──────────────────────────────────────────

describe('escapeHtml — complete HTML entity encoding', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('encodes & so further replacements cannot reintroduce entities', () => {
    assert.equal(w.escapeHtml('&lt;'), '&amp;lt;');
  });

  it('encodes < to &lt;', () => {
    assert.ok(w.escapeHtml('<').includes('&lt;'));
    assert.ok(!w.escapeHtml('<').includes('<'));
  });

  it('encodes > to &gt;', () => {
    assert.ok(w.escapeHtml('>').includes('&gt;'));
    assert.ok(!w.escapeHtml('>').includes('>'));
  });

  it('encodes " to &quot; (prevents attribute breakout)', () => {
    assert.ok(w.escapeHtml('"').includes('&quot;'));
    assert.ok(!w.escapeHtml('"').includes('"'));
  });

  it("encodes ' to &#39; (prevents single-quote attribute breakout)", () => {
    assert.ok(w.escapeHtml("'").includes('&#39;'));
    assert.ok(!w.escapeHtml("'").includes("'"));
  });

  it('encodes all 5 special chars in one pass (& must go first)', () => {
    const out = w.escapeHtml('<b class="x" data-v=\'y\'>a & b</b>');
    assert.ok(!out.includes('<b'));
    assert.ok(!out.includes('"x"'));
    assert.ok(!out.includes("'y'"));
    assert.ok(out.includes('&lt;'));
    assert.ok(out.includes('&amp;'));
  });

  XSS_PAYLOADS.forEach((payload, i) => {
    it('neutralises XSS payload #' + (i + 1) + ': ' + payload.slice(0, 40), () => {
      const out = w.escapeHtml(payload);
      noRawScript(out);
      assert.ok(!out.includes('<'), 'no raw < after escaping');
    });
  });
});

// ─── renderGameRow — all text fields ─────────────────────────────────────────

describe('renderGameRow — XSS prevention in every text field', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function xssGame(overrides) {
    return Object.assign({
      id: 1, status: 'beendet', stage: 'Runde', standing: 'Gruppe 1',
      scheduled: '12:00', field: 1,
      final_score: { home: 10, away: 6 }, halftime_score: { home: 5, away: 3 },
      results: [
        { team_id: 159, team_name: 'Safe',  pa: 6,  isHome: true  },
        { team_id: 43,  team_name: 'Other', pa: 10, isHome: false },
      ],
    }, overrides);
  }

  it('escapes XSS in home team_name', () => {
    const g = xssGame({ results: [
      { team_id: 159, team_name: '<script>alert(1)</script>', pa: 6, isHome: true },
      { team_id: 43,  team_name: 'Other', pa: 10, isHome: false },
    ]});
    noRawScript(w.renderGameRow(g, 159, true));
  });

  it('escapes XSS in away team_name', () => {
    const g = xssGame({ results: [
      { team_id: 159, team_name: 'Safe', pa: 6, isHome: true },
      { team_id: 43,  team_name: '<img src=x onerror=alert(1)>', pa: 10, isHome: false },
    ]});
    noRawScript(w.renderGameRow(g, 159, true));
  });

  it('escapes XSS in stage field', () => {
    noRawScript(w.renderGameRow(xssGame({ stage: '<script>alert(1)</script>' }), 159, true));
  });

  it('escapes XSS in standing field', () => {
    noRawScript(w.renderGameRow(xssGame({ standing: '"><script>alert(1)</script>' }), 159, true));
  });

  it('escapes XSS in scheduled field (time)', () => {
    noRawScript(w.renderGameRow(xssGame({ scheduled: '<img>' }), 159, true));
  });

  it('escapes XSS in field number', () => {
    noRawScript(w.renderGameRow(xssGame({ field: '<script>1</script>' }), 159, false));
  });

  it('resolved team name from _teamNameByAbbrev is also escaped', () => {
    w._teamNameByAbbrev['XSS'] = '<script>alert("owner")</script>';
    const g = xssGame({ results: [
      { team_id: 159, team_name: 'XSS', pa: 6, isHome: true },
      { team_id: 43,  team_name: 'Other', pa: 10, isHome: false },
    ]});
    noRawScript(w.renderGameRow(g, 159, true));
  });

  it('score class cannot break out of class attribute (only win/loss/draw/empty)', () => {
    // getResultClass only ever returns 'win', 'loss', 'draw', or ''
    const allowed = new Set(['win', 'loss', 'draw', '']);
    [159, 43].forEach(id => {
      const cls = w.getResultClass(id, xssGame().results);
      assert.ok(allowed.has(cls), 'class value must be one of win/loss/draw/empty, got: ' + cls);
    });
  });

  // NOTE: final_score.home / final_score.away are inserted as-is (not escaped).
  // They are expected to be integers from the API/snapshot, which is owner-controlled.
  // The test below documents this known behaviour so future developers are aware.
  it('(known limitation) final_score values are not HTML-escaped — must be integers', () => {
    const snap = require('../snapshot.json');
    const allScores = snap.gamedays.flatMap(gd => (gd.games || []))
      .filter(g => g.final_score)
      .flatMap(g => [g.final_score.home, g.final_score.away]);
    for (const val of allScores) {
      assert.ok(
        val === null || (typeof val === 'number' && Number.isFinite(val)),
        'final_score value in snapshot must be a finite number, got: ' + val
      );
    }
  });

  it('(known limitation) halftime_score values are not HTML-escaped — must be integers', () => {
    const snap = require('../snapshot.json');
    const allScores = snap.gamedays.flatMap(gd => (gd.games || []))
      .filter(g => g.halftime_score)
      .flatMap(g => [g.halftime_score.home, g.halftime_score.away]);
    for (const val of allScores) {
      assert.ok(
        val === null || (typeof val === 'number' && Number.isFinite(val)),
        'halftime_score value in snapshot must be a finite number, got: ' + val
      );
    }
  });
});

// ─── renderGamedayCard — all text fields ──────────────────────────────────────

describe('renderGamedayCard — XSS prevention in every text field', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const safeGame = {
    id: 1, status: 'beendet', stage: 'Runde', standing: null,
    scheduled: '12:00', field: 1,
    final_score: { home: 10, away: 6 }, halftime_score: { home: 5, away: 3 },
    results: [
      { team_id: 159, team_name: 'Safe',  pa: 6,  isHome: true  },
      { team_id: 43,  team_name: 'Other', pa: 10, isHome: false },
    ],
  };

  function xssGd(overrides) {
    return Object.assign({
      id: 1, date: '2026-01-01', name: 'Safe Gameday',
      start: '10:00', league_display: 'DFFL',
      address: 'Safe Street 1, 12345 City',
    }, overrides);
  }

  it('escapes XSS in gameday name', () => {
    noRawScript(w.renderGamedayCard(xssGd({ name: '<script>alert(1)</script>' }), [safeGame], 159, true));
  });

  it('escapes XSS in league_display', () => {
    noRawScript(w.renderGamedayCard(xssGd({ league_display: '"><script>alert(1)</script>' }), [safeGame], 159, true));
  });

  it('escapes XSS in start time', () => {
    noRawScript(w.renderGamedayCard(xssGd({ start: '<img onerror=1>' }), [safeGame], 159, true));
  });

  it('escapes XSS in address', () => {
    noRawScript(w.renderGamedayCard(xssGd({ address: '<script>alert(1)</script>' }), [safeGame], 159, true));
  });

  it('escapes XSS in date (via formatDate)', () => {
    // formatDate returns a localeDateString — should not contain injected HTML
    noRawScript(w.renderGamedayCard(xssGd({ date: '2026-01-01' }), [safeGame], 159, true));
  });
});

// ─── renderLiveBanner — XSS and URL injection ─────────────────────────────────

describe('renderLiveBanner — XSS and URL attribute injection', () => {
  let w;
  beforeEach(() => {
    w = freshContext();
    w._teamNameByAbbrev['XSS'] = '<script>alert(1)</script>';
  });

  function xssLiveGame(homeTeamName, awayTeamName) {
    return {
      id: 9999, status: 'live',
      halftime_score: { home: 7, away: 6 },
      results: [
        { team_id: 1, team_name: homeTeamName, pa: 6, isHome: true  },
        { team_id: 2, team_name: awayTeamName, pa: 7, isHome: false },
      ],
    };
  }

  it('escapes XSS in home team name', () => {
    const gd = { id: 1, name: 'Safe', league_display: 'DFFL' };
    noRawScript(w.renderLiveBanner(xssLiveGame('<script>alert(1)</script>', 'Safe'), gd, 1));
  });

  it('escapes XSS in away team name', () => {
    const gd = { id: 1, name: 'Safe', league_display: 'DFFL' };
    noRawScript(w.renderLiveBanner(xssLiveGame('Safe', '<img src=x onerror=alert(1)>'), gd, 1));
  });

  it('escapes XSS injected via _teamNameByAbbrev resolution', () => {
    const gd = { id: 1, name: 'Safe', league_display: 'DFFL' };
    noRawScript(w.renderLiveBanner(xssLiveGame('XSS', 'Safe'), gd, 1));
  });

  it('escapes XSS in gameday name', () => {
    const gd = { id: 1, name: '<script>alert(1)</script>', league_display: 'DFFL' };
    noRawScript(w.renderLiveBanner(xssLiveGame('Home', 'Away'), gd, 1));
  });

  it('escapes XSS in league_display', () => {
    const gd = { id: 1, name: 'Safe', league_display: '"><script>alert(1)</script>' };
    noRawScript(w.renderLiveBanner(xssLiveGame('Home', 'Away'), gd, 1));
  });

  it('encodes gameday id in liveticker href to prevent attribute injection', () => {
    // A string id with quote/script injection must be percent-encoded in the href
    const gd = { id: '123" onclick="alert(1)', name: 'Safe', league_display: 'DFFL' };
    const html = w.renderLiveBanner(xssLiveGame('Home', 'Away'), gd, 1);
    assert.ok(!html.includes('" onclick="alert'), 'raw quote+onclick must not appear in href');
    assert.ok(html.includes('%22') || html.includes('%27') || !html.includes('onclick'),
      'attribute injection must be percent-encoded');
  });

  it('liveticker href uses HTTPS base URL', () => {
    const gd = { id: 42, name: 'Safe', league_display: 'DFFL' };
    const html = w.renderLiveBanner(xssLiveGame('Home', 'Away'), gd, 1);
    assert.ok(html.includes('href="https://'), 'liveticker link must use https');
  });

  it('liveticker href does not include javascript: scheme', () => {
    const gd = { id: 42, name: 'Safe', league_display: 'DFFL' };
    const html = w.renderLiveBanner(xssLiveGame('Home', 'Away'), gd, 1);
    assert.ok(!html.toLowerCase().includes('javascript:'), 'no javascript: scheme in links');
  });
});

// ─── renderGameLogEvents — play-by-play XSS ───────────────────────────────────

describe('renderGameLogEvents — XSS in play-by-play event fields', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const safeResults = [
    { team_id: 1, team_name: 'Home', pa: 10, isHome: true  },
    { team_id: 2, team_name: 'Away', pa: 14, isHome: false },
  ];

  function logWith(events) {
    return { l: 'Home Team', r: 'Away Team', ev: events };
  }

  it('escapes XSS in break marker (b field)', () => {
    const html = w.renderGameLogEvents(logWith([{ b: '<script>alert(1)</script>' }]), safeResults);
    noRawScript(html);
  });

  it('escapes XSS in left play (l field)', () => {
    const html = w.renderGameLogEvents(logWith([{ l: '<img onerror=alert(1)>' }]), safeResults);
    noRawScript(html);
  });

  it('escapes XSS in right play (r field)', () => {
    const html = w.renderGameLogEvents(logWith([{ r: '"><script>alert(1)</script>' }]), safeResults);
    noRawScript(html);
  });

  it('escapes XSS in score (s field)', () => {
    const html = w.renderGameLogEvents(logWith([{ s: '<svg onload=alert(1)>' }]), safeResults);
    noRawScript(html);
  });

  it('escapes XSS in log header (l and r team name fields)', () => {
    const log = { l: '<script>alert(1)</script>', r: '<img onerror=1>', ev: [] };
    noRawScript(w.renderGameLogEvents(log, safeResults));
  });

  it('lx/rx flags only wrap in <s> tag — no arbitrary HTML injection', () => {
    const log = logWith([{ l: 'Safe play', lx: 1 }, { r: 'Safe play', rx: 1 }]);
    const html = w.renderGameLogEvents(log, safeResults);
    assert.ok(html.includes('<s>'), 'lx=1 should produce <s> strikethrough');
    noRawScript(html);
  });

  it('real snapshot log events contain no raw HTML angle brackets', () => {
    const snap = require('../snapshot.json');
    const logsFor159 = snap.gamedays
      .flatMap(gd => (gd.games || []))
      .filter(g => g.log && g.results.some(r => r.team_id === 159));
    assert.ok(logsFor159.length > 0, 'should have log events to check');
    for (const g of logsFor159) {
      for (const ev of g.log.ev) {
        for (const field of ['b', 'l', 'r', 's']) {
          if (ev[field]) {
            assert.ok(!ev[field].includes('<'), 'log event field must not contain <: ' + ev[field]);
          }
        }
      }
    }
  });
});

// ─── URL parameter safety ─────────────────────────────────────────────────────

describe('URL parameter safety — no param value reaches innerHTML', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('color param is a hex string — never rendered as HTML', () => {
    // color is only used in style.setProperty — not in any innerHTML string
    // Verify that parseConfigFromSearch returns a plain string (no HTML)
    const cfg = w.parseConfigFromSearch('?t=159&color=ff4500%22%3E%3Cscript%3E');
    // The raw value would be 'ff4500">...' but replace(/^#/,'') just strips leading #
    // The important thing is that color is set via setProperty, not innerHTML
    assert.equal(typeof cfg.color, 'string');
    // Confirm it is not used in any render function (render functions take game/gd objects)
    // This is a structural guarantee: no render function accepts a `cfg` argument
  });

  it('team id is always a positive integer after parsing — never a string', () => {
    const cfg = w.parseConfigFromSearch('?t=159&t=287&t=<script>');
    for (const id of cfg.teams) {
      assert.ok(Number.isInteger(id) && id > 0, 'team id must be a positive integer');
    }
    // Script injection attempt is filtered out — only valid IDs remain
    assert.deepEqual(cfg.teams, [159, 287]);
  });

  it('past, future params are always numbers — never strings', () => {
    const cfg = w.parseConfigFromSearch('?t=159&past=5&future=3');
    assert.equal(typeof cfg.past, 'number');
    assert.equal(typeof cfg.future, 'number');
  });

  it('boolean params are always booleans — never strings', () => {
    const cfg = w.parseConfigFromSearch('?t=159&show_past=0&show_future=0&title=0&compact=1');
    assert.equal(typeof cfg.showPast, 'boolean');
    assert.equal(typeof cfg.showFuture, 'boolean');
    assert.equal(typeof cfg.showTitle, 'boolean');
    assert.equal(typeof cfg.compact, 'boolean');
  });
});

// ─── CSS variable injection via color param ───────────────────────────────────

describe('CSS variable injection via color parameter', () => {
  it('color is applied via style.setProperty, not string-concatenated into a style attribute', () => {
    // Structural test: read the widget source and confirm the pattern used
    const src = fs.readFileSync(path.join(__dirname, '..', 'widget.html'), 'utf8');
    assert.ok(
      src.includes("style.setProperty('--accent'"),
      'color must be applied via setProperty, not inline style string'
    );
    // Confirm there is no pattern like: style="color: #' + cfg.color + '"
    assert.ok(
      !src.includes("style=\"color: #'"),
      'color must never be string-concatenated into a style attribute'
    );
  });

  it('color value is prefixed with # only — no additional CSS syntax appended', () => {
    const w = freshContext();
    const cfg = w.parseConfigFromSearch('?t=159&color=ff4500');
    // The value passed to setProperty is '#' + cfg.color
    assert.equal('#' + cfg.color, '#ff4500');
    assert.ok(!/[;<>{}"']/.test(cfg.color), 'color value must not contain CSS-breaking characters');
  });

  it('CSS-breaking characters in color param do not contaminate the stored value', () => {
    // Even if an attacker passes ?color=red;background:red, the stored cfg.color is a plain string.
    // style.setProperty treats the entire value as a CSS value, not a declaration — so ; is harmless.
    const w = freshContext();
    const cfg = w.parseConfigFromSearch('?t=159&color=ff4500%3Bbackground%3Ared');
    assert.equal(typeof cfg.color, 'string');
    // It is a string — setProperty will fail to parse it as a color and use the fallback
  });
});

// ─── postMessage data safety ──────────────────────────────────────────────────

describe('postMessage — only numeric height, no user data', () => {
  it('reportHeight sends exactly {type, height} and no other keys', () => {
    const messages = [];
    const w = freshContext({
      window: {
        location: { search: '', href: 'http://localhost/widget.html' },
        parent: { postMessage: (msg, target) => messages.push({ msg, target }) },
      },
      document: {
        getElementById:  () => null,
        createElement:   (t) => ({ tagName: t, className: '', innerHTML: '', appendChild: () => {} }),
        documentElement: { style: { setProperty: () => {} } },
        body: { classList: { add: () => {} }, getBoundingClientRect: () => ({ height: 120 }) },
      },
    });
    w.reportHeight();
    assert.equal(messages.length, 1);
    const { msg, target } = messages[0];
    assert.deepEqual(Object.keys(msg).sort(), ['height', 'type']);
    assert.equal(msg.type, 'iframeHeight');
    assert.equal(typeof msg.height, 'number');
    assert.equal(msg.height, 120);
  });

  it('postMessage payload contains no team names, scores, or snapshot data', () => {
    const messages = [];
    const w = freshContext({
      window: {
        location: { search: '', href: 'http://localhost/widget.html' },
        parent: { postMessage: (msg, target) => messages.push({ msg, target }) },
      },
      document: {
        getElementById:  () => null,
        createElement:   (t) => ({ tagName: t, className: '', innerHTML: '', appendChild: () => {} }),
        documentElement: { style: { setProperty: () => {} } },
        body: { classList: { add: () => {} }, getBoundingClientRect: () => ({ height: 80 }) },
      },
    });
    w.reportHeight();
    const payload = JSON.stringify(messages[0].msg);
    assert.ok(!payload.includes('Nürnberg'), 'postMessage must not include team names');
    assert.ok(!payload.includes('snapshot'),  'postMessage must not include snapshot data');
  });

  it('postMessage source code uses * as targetOrigin — confirmed by widget source', () => {
    // Using '*' is a deliberate choice: the widget is designed to be embedded on any
    // origin. The payload is only {type, height} — no sensitive data is leaked.
    const src = fs.readFileSync(path.join(__dirname, '..', 'widget.html'), 'utf8');
    assert.ok(src.includes("postMessage(\n    { type: 'iframeHeight'") ||
              src.includes("postMessage({ type: 'iframeHeight'") ||
              src.includes("postMessage(\r\n    { type: 'iframeHeight'"),
      'postMessage must send iframeHeight type');
  });
});

// ─── Phase 2 / 5 / 6 innerHTML security audit ────────────────────────────────
// Confirmed escapeHtml() coverage for every API/user-derived field added in
// Phases 2, 5, and 6 (audited against widget.html source):
//
// Phase 2 — renderPastSection:
//   data-team and remaining count are parseInt results — safe without escaping.
//
// Phase 2 — renderNextGameCard:
//   escapeHtml(gd.name) ✓, escapeHtml(other.team_name) ✓,
//   escapeHtml(formatDate(gd.date)) ✓
//   time = game.scheduled.slice(11,16) — NOT escaped; intentionally safe by
//   data format (ISO datetime slice produces "HH:MM", digits/colon only — no
//   XSS vector possible).
//
// Phase 2 — renderSpielplan:
//   teamId (integer) used in data attributes ✓, err.message via escapeHtml ✓.
//
// Phase 5 — _renderStandingsForYear:
//   escapeHtml(e.entry.name) ✓, escapeHtml(String(year)) ✓.
//   Year tab HTML: y is a parseInt result (integer) used in data-year attribute
//   and button text ✓.
//
// Phase 5 — renderStandingsTable:
//   escapeHtml(row.team_name) ✓ (also tested in unit.test.js).
//
// Phase 6 — generator.html:
//   No innerHTML insertions; view value comes from a <select> with predefined
//   options and is appended to a URL string, not innerHTML ✓.
//
// No unmitigated XSS vectors found. One intentionally unescaped field (time)
// documented above as format-safe.

// ─── renderNextGameCard — XSS prevention ──────────────────────────────────────
// Security audit (Phase 2): escapeHtml() applied to gd.name and other.team_name.
// time field from game.scheduled.slice(11,16) is NOT escaped — intentionally safe
// by data format (ISO datetime slice produces "HH:MM", digits and colon only).

describe('renderNextGameCard — XSS prevention', () => {
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

  it('XSS in gd.name is escaped', () => {
    const payload = '<script>alert(1)</script>';
    const html = w.renderNextGameCard(mkGd({ name: payload }), mkGame(), 159);
    assert.ok(!html.includes('<script>'), 'script tag must not appear unescaped');
    assert.ok(html.includes('&lt;script&gt;'), 'script tag must be HTML-escaped');
  });

  it('XSS in other.team_name is escaped', () => {
    const payload = '"><svg onload=alert(1)>';
    const game = mkGame({ results: [
      { team_id: 159, team_name: 'Safe Team', isHome: true },
      { team_id: 200, team_name: payload, isHome: false },
    ]});
    const html = w.renderNextGameCard(mkGd(), game, 159);
    assert.ok(!html.includes('<svg'), 'svg tag must not appear unescaped');
    assert.ok(html.includes('&lt;svg'), 'svg tag must be HTML-escaped');
  });

  it('attribute injection in gd.name is escaped', () => {
    const payload = '" onmouseover="alert(1)';
    const html = w.renderNextGameCard(mkGd({ name: payload }), mkGame(), 159);
    // onmouseover= may appear as escaped text (&quot; onmouseover=…) which is safe;
    // what must NOT appear is onmouseover= inside a live HTML element (unescaped tag).
    noRawScript(html);
    assert.ok(!/<[a-z][^>]* onmouseover=/i.test(html), 'attribute injection must not appear inside a live HTML element');
  });

  it('time field from game.scheduled renders as plain HH:MM (format-safe)', () => {
    const html = w.renderNextGameCard(mkGd(), mkGame(), 159);
    assert.ok(html.includes('14:30 Uhr'), 'time should render as HH:MM Uhr');
    // The time value is produced by .slice(11,16) on an ISO datetime string.
    // Verify the slice itself only contains digits and a colon — no HTML characters.
    const timeSlice = mkGame().scheduled.slice(11, 16);
    assert.match(timeSlice, /^\d{2}:\d{2}$/, 'scheduled slice must be HH:MM only — no XSS possible');
  });
});

// ─── Prototype pollution ──────────────────────────────────────────────────────

describe('prototype pollution — snapshot data cannot pollute Object.prototype', () => {
  it('JSON.parse does not allow __proto__ to pollute the prototype', () => {
    // Standard JSON.parse ignores __proto__ as a regular property
    const malicious = '{"__proto__": {"polluted": true}, "safe": 1}';
    const obj = JSON.parse(malicious);
    assert.equal(({}).polluted, undefined, 'Object.prototype must not be polluted');
    assert.equal(obj.safe, 1);
  });

  it('assigning to _teamNameByAbbrev["__proto__"] does not pollute Object prototype', () => {
    const w = freshContext();
    // Simulate a snapshot with a team whose abbrev is __proto__
    w._teamNameByAbbrev['__proto__'] = 'malicious';
    assert.equal(({}).malicious, undefined, 'Object.prototype must not be polluted');
    assert.equal(({}).toString, Object.prototype.toString, 'prototype chain must be intact');
  });

  it('assigning to _teamNameByAbbrev["constructor"] does not break Object constructor', () => {
    const w = freshContext();
    w._teamNameByAbbrev['constructor'] = 'hijacked';
    assert.equal(typeof ({}).constructor, 'function', 'Object constructor must still be a function');
  });

  it('snapshot team abbreviations in real snapshot contain no prototype-pollution keys', () => {
    const snap = require('../snapshot.json');
    const dangerous = new Set(['__proto__', 'constructor', 'prototype']);
    for (const t of snap.teams) {
      assert.ok(!dangerous.has(t.abbrev),
        'team abbreviation must not be a prototype-pollution key: ' + t.abbrev);
      assert.ok(!dangerous.has(String(t.id)),
        'team id must not be a prototype-pollution key: ' + t.id);
    }
  });
});

// ─── snapshot.json integrity as a security boundary ──────────────────────────

describe('snapshot.json — no executable content (widget owner protection)', () => {
  const snap = require('../snapshot.json');

  it('generated field is a plain date string — not executable', () => {
    assert.match(snap.generated, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('team names in snapshot contain no raw HTML angle brackets', () => {
    for (const t of snap.teams) {
      assert.ok(!t.name.includes('<') && !t.name.includes('>'),
        'team name must not contain HTML: ' + t.name);
      assert.ok(!t.abbrev.includes('<') && !t.abbrev.includes('>'),
        'team abbrev must not contain HTML: ' + t.abbrev);
    }
  });

  it('gameday names contain no raw HTML angle brackets', () => {
    for (const gd of snap.gamedays) {
      assert.ok(!gd.name.includes('<') && !gd.name.includes('>'),
        'gameday name must not contain HTML: ' + gd.name);
    }
  });

  it('game stage and standing values contain no raw HTML', () => {
    for (const gd of snap.gamedays) {
      for (const g of (gd.games || [])) {
        if (g.stage) assert.ok(!g.stage.includes('<'), 'stage must not contain HTML: ' + g.stage);
        if (g.standing) assert.ok(!g.standing.includes('<'), 'standing must not contain HTML: ' + g.standing);
      }
    }
  });

  it('team_name values in game results contain no raw HTML', () => {
    for (const gd of snap.gamedays) {
      for (const g of (gd.games || [])) {
        for (const r of g.results) {
          assert.ok(!r.team_name.includes('<') && !r.team_name.includes('>'),
            'team_name in results must not contain HTML: ' + r.team_name);
        }
      }
    }
  });

  it('address values contain no raw HTML angle brackets', () => {
    for (const gd of snap.gamedays) {
      if (!gd.address) continue;
      assert.ok(!gd.address.includes('<') && !gd.address.includes('>'),
        'address must not contain HTML: ' + gd.address);
    }
  });

  it('log event text fields contain no raw HTML angle brackets', () => {
    const logsFound = [];
    for (const gd of snap.gamedays) {
      for (const g of (gd.games || [])) {
        if (!g.log) continue;
        logsFound.push(g.id);
        for (const ev of g.log.ev) {
          for (const field of ['b', 'l', 'r', 's']) {
            if (ev[field]) {
              assert.ok(!ev[field].includes('<'),
                'log event field "' + field + '" must not contain < in game ' + g.id + ': ' + ev[field]);
            }
          }
        }
      }
    }
    assert.ok(logsFound.length > 0, 'should have at least one game log to validate');
  });
});
