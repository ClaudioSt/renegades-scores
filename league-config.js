'use strict';

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
      if (typeof entry.name !== 'string') {
        throw new Error(prefix + " missing field 'name'");
      }
      if (!Array.isArray(entry.gameday_ids)) {
        throw new Error(prefix + ' gameday_ids must be an array');
      }
      if (!entry.gameday_ids.every(Number.isInteger)) {
        throw new Error(prefix + ' gameday_ids must contain only integers');
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

function loadLeagueConfig(filePath) {
  const raw    = require('fs').readFileSync(filePath, 'utf8');
  const config = JSON.parse(raw);
  return validateLeagueConfig(config);
}

module.exports = { validateLeagueConfig, loadLeagueConfig };
