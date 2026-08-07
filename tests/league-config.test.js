'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

const { validateLeagueConfig, loadLeagueConfig, selectSeasonGamedays } = require('../league-config.js');

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

  it('throws when the season key is not a 4-digit year', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { 'saison-26': { name: 'FF BL', league_display: 'FF BL', promotion_restricted: [] } } }),
      { message: 'league-config: ff-bl/saison-26 season key must be a 4-digit year' }
    );
  });

  it('throws when season entry is missing name field', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { league_display: 'FF BL', promotion_restricted: [] } } }),
      { message: "league-config: ff-bl/2026 missing field 'name'" }
    );
  });

  it('throws when league_display is missing', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', promotion_restricted: [] } } }),
      { message: "league-config: ff-bl/2026 missing field 'league_display'" }
    );
  });

  it('throws when league_display is an empty string', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', league_display: '', promotion_restricted: [] } } }),
      { message: "league-config: ff-bl/2026 missing field 'league_display'" }
    );
  });

  it('throws when exclude_gameday_ids is not an array', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', league_display: 'FF BL', exclude_gameday_ids: 123, promotion_restricted: [] } } }),
      { message: 'league-config: ff-bl/2026 exclude_gameday_ids must be an array' }
    );
  });

  it('throws when exclude_gameday_ids contains a non-integer', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', league_display: 'FF BL', exclude_gameday_ids: [1, 'abc'], promotion_restricted: [] } } }),
      { message: 'league-config: ff-bl/2026 exclude_gameday_ids must contain only integers' }
    );
  });

  it('accepts a config without exclude_gameday_ids (field is optional)', () => {
    const config = { 'ff-bl': { '2026': { name: 'FF BL 2026', league_display: 'FF BL', promotion_restricted: [] } } };
    assert.strictEqual(validateLeagueConfig(config), config);
  });

  it('throws when promotion_restricted contains a non-integer', () => {
    assert.throws(
      () => validateLeagueConfig({ 'ff-bl': { '2026': { name: 'FF BL 2026', league_display: 'FF BL', promotion_restricted: [1.5] } } }),
      { message: 'league-config: ff-bl/2026 promotion_restricted must contain only integers' }
    );
  });

  it('returns the same config object for a fully valid config (no mutation)', () => {
    const config = {
      'ff-bl': {
        '2026': {
          name: 'FF BL 2026',
          league_display: 'FF BL',
          exclude_gameday_ids: [],
          promotion_restricted: [254, 492],
        },
      },
    };
    const result = validateLeagueConfig(config);
    assert.strictEqual(result, config);
  });
});

// ─── selectSeasonGamedays ─────────────────────────────────────────────────────

describe('selectSeasonGamedays', () => {
  const cfg = { name: 'FF BL 2026', league_display: 'FF BL', exclude_gameday_ids: [877], promotion_restricted: [] };
  const gamedays = [
    { id: 832, date: '2026-04-25', league_display: 'FF BL' },
    { id: 877, date: '2026-08-02', league_display: 'FF BL' },   // excluded
    { id: 878, date: '2026-08-30', league_display: 'FF BL' },
    { id: 700, date: '2026-05-01', league_display: 'RL Bayern' }, // other league
    { id: 701, date: '2025-08-30', league_display: 'FF BL' },     // other season
  ];

  it('returns the gamedays of the matching league and season', () => {
    const ids = selectSeasonGamedays(cfg, '2026', gamedays).map(g => g.id);
    assert.deepEqual(ids, [832, 878]);
  });

  it('treats the season argument as a string or number alike', () => {
    const ids = selectSeasonGamedays(cfg, 2026, gamedays).map(g => g.id);
    assert.deepEqual(ids, [832, 878]);
  });

  it('returns [] for an empty gamedays list', () => {
    assert.deepEqual(selectSeasonGamedays(cfg, '2026', []), []);
  });

  it('returns [] when gamedays is undefined', () => {
    assert.deepEqual(selectSeasonGamedays(cfg, '2026', undefined), []);
  });

  it('skips gamedays without a usable date', () => {
    const odd = [{ id: 1, league_display: 'FF BL' }, { id: 2, date: null, league_display: 'FF BL' }];
    assert.deepEqual(selectSeasonGamedays(cfg, '2026', odd), []);
  });
});

// ─── loadLeagueConfig ─────────────────────────────────────────────────────────

describe('loadLeagueConfig', () => {
  it('loads and validates the real league-config.json — returns object with expected league keys', () => {
    const filePath = path.join(__dirname, '..', 'league-config.json');
    const config = loadLeagueConfig(filePath);
    assert.ok(typeof config === 'object' && config !== null);
    const keys = Object.keys(config).sort();
    ['dkb-dffl', 'dffl2', 'ff-bl', 'rl-bayern'].forEach(k => {
      assert.ok(keys.includes(k), `league-config.json missing expected key: ${k}`);
    });
  });
});
