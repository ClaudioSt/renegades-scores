'use strict';

const SEASON_RE = /^\d{4}$/;

function validateLeagueConfig(config) {
  if (config === null || typeof config !== 'object') {
    throw new Error('league-config: config must be a non-null object');
  }
  if (Object.keys(config).length === 0) {
    throw new Error('league-config: no leagues defined');
  }
  for (const league of Object.keys(config)) {
    for (const season of Object.keys(config[league])) {
      const entry = config[league][season];
      const prefix = 'league-config: ' + league + '/' + season;
      if (!SEASON_RE.test(season)) {
        throw new Error(prefix + ' season key must be a 4-digit year');
      }
      if (typeof entry.name !== 'string') {
        throw new Error(prefix + " missing field 'name'");
      }
      if (typeof entry.league_display !== 'string' || entry.league_display === '') {
        throw new Error(prefix + " missing field 'league_display'");
      }
      if (entry.exclude_gameday_ids !== undefined) {
        if (!Array.isArray(entry.exclude_gameday_ids)) {
          throw new Error(prefix + ' exclude_gameday_ids must be an array');
        }
        if (!entry.exclude_gameday_ids.every(Number.isInteger)) {
          throw new Error(prefix + ' exclude_gameday_ids must contain only integers');
        }
      }
      if (!Array.isArray(entry.promotion_restricted)) {
        throw new Error(prefix + ' promotion_restricted must be an array');
      }
      if (!entry.promotion_restricted.every(Number.isInteger)) {
        throw new Error(prefix + ' promotion_restricted must contain only integers');
      }
    }
  }
  return config;
}

/**
 * selectSeasonGamedays(cfg, season, gamedays)
 *
 * Derives the gamedays of one league season straight from the snapshot: every
 * gameday whose `league_display` matches the config and whose date falls in the
 * season year, minus anything listed in `exclude_gameday_ids` (playoff days that
 * must not count towards the regular-season table).
 *
 * @param {object} cfg      - a single season entry from the league config
 * @param {string} season   - season key (4-digit year)
 * @param {Array}  gamedays - array of gameday objects (from snapshot.json)
 * @returns {Array} matching gameday objects
 */
function selectSeasonGamedays(cfg, season, gamedays) {
  const excluded = new Set(cfg.exclude_gameday_ids || []);
  const year     = String(season);
  return (gamedays || []).filter(gd =>
    gd
    && gd.league_display === cfg.league_display
    && typeof gd.date === 'string'
    && gd.date.slice(0, 4) === year
    && !excluded.has(gd.id)
  );
}

function loadLeagueConfig(filePath) {
  const raw    = require('fs').readFileSync(filePath, 'utf8');
  const config = JSON.parse(raw);
  return validateLeagueConfig(config);
}

module.exports = { validateLeagueConfig, loadLeagueConfig, selectSeasonGamedays };
