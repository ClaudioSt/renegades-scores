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
