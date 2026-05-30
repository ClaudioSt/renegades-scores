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
