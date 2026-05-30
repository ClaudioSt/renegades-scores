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
