'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

const { validateLeagueConfig, loadLeagueConfig } = require('../league-config.js');

// ─── validateLeagueConfig ─────────────────────────────────────────────────────

describe('validateLeagueConfig', () => {
  it('throws for null input', () => {
    assert.throws(
      () => validateLeagueConfig(null),
      { message: 'league-config: config must be a non-null object' }
    );
  });

  it('throws for non-object input (string)', () => {
    assert.throws(
      () => validateLeagueConfig('not-an-object'),
      { message: 'league-config: config must be a non-null object' }
    );
  });

  it('throws for empty object', () => {
    assert.throws(
      () => validateLeagueConfig({}),
      { message: 'league-config: no leagues defined' }
    );
  });

  it('throws when season entry is missing name field', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { gameday_ids: [], promotion_restricted: [] } } }),
      { message: "league-config: ff-bl/2026 missing field 'name'" }
    );
  });

  it('throws when gameday_ids is not an array', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', gameday_ids: 123, promotion_restricted: [] } } }),
      { message: 'league-config: ff-bl/2026 gameday_ids must be an array' }
    );
  });

  it('throws when gameday_ids contains a non-integer', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', gameday_ids: [1, 'abc'], promotion_restricted: [] } } }),
      { message: 'league-config: ff-bl/2026 gameday_ids must contain only integers' }
    );
  });

  it('throws when promotion_restricted contains a non-integer', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', gameday_ids: [], promotion_restricted: [1.5] } } }),
      { message: 'league-config: ff-bl/2026 promotion_restricted must contain only integers' }
    );
  });

  it('returns the same config object for a fully valid config (no mutation)', () => {
    const config = {
      'ff-bl': {
        '2026': {
          name: 'FF BL 2026',
          gameday_ids: [832, 834],
          promotion_restricted: [254, 492],
        },
      },
    };
    const result = validateLeagueConfig(config);
    assert.strictEqual(result, config);
  });
});

// ─── loadLeagueConfig ─────────────────────────────────────────────────────────

describe('loadLeagueConfig', () => {
  it('loads and validates the real league-config.json — returns object with ff-bl, rl-bayern, dkb-dffl keys', () => {
    const filePath = path.join(__dirname, '..', 'league-config.json');
    const config = loadLeagueConfig(filePath);
    assert.ok(typeof config === 'object' && config !== null);
    assert.deepEqual(Object.keys(config).sort(), ['dkb-dffl', 'ff-bl', 'rl-bayern'].sort());
  });
});
