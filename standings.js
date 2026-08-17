'use strict';

const { selectSeasonGamedays } = require('./league-config.js');

const BEST7_COUNT = 7;

/**
 * computeStandings(leagueConfig, gamedays)
 *
 * Gamedays are derived from the snapshot per league season (league_display +
 * season year, minus exclude_gameday_ids), so a newly published gameday
 * counts towards the table on the next snapshot run without any config
 * change. Depending on cfg.standings_mode, the season is scored either as a
 * "sq" table (all gamedays) or "best7" (only the best 7 gamedays count).
 *
 * @param {object} leagueConfig - validated league config (from loadLeagueConfig)
 * @param {Array}  gamedays     - array of gameday objects (from snapshot.json)
 * @returns {{ [leagueKey]: { [season]: { name, rows, promotion_restricted, standings_mode? } } }}
 */
function computeStandings(leagueConfig, gamedays) {
  const result = {};

  for (const leagueKey of Object.keys(leagueConfig)) {
    result[leagueKey] = {};

    for (const season of Object.keys(leagueConfig[leagueKey])) {
      const cfg = leagueConfig[leagueKey][season];
      const seasonGamedays = selectSeasonGamedays(cfg, season, gamedays);
      const gamedayIdSet = new Set(seasonGamedays.map(gd => gd.id));
      const mode = cfg.standings_mode || 'sq';

      if (mode === 'best7') {
        result[leagueKey][season] = computeBest7Season(cfg, gamedayIdSet, gamedays);
      } else {
        result[leagueKey][season] = computeSqSeason(cfg, gamedayIdSet, gamedays);
      }
    }
  }

  return result;
}

function computeSqSeason(cfg, gamedayIdSet, gamedays) {
  // teamStats: Map<team_id, { team_name, Sp, S, U, N, EP, GP }>
  const teamStats = new Map();

  for (const gd of gamedays) {
    if (!gamedayIdSet.has(gd.id)) continue;
    processGames(gd.games, teamStats, null);
  }

  const rows = [];
  for (const [team_id, stats] of teamStats) {
    const PD = stats.EP - stats.GP;
    const SQ = parseFloat(((2 * stats.S + stats.U) / (2 * stats.Sp)).toFixed(4));
    rows.push({ team_id, team_name: stats.team_name, Sp: stats.Sp, S: stats.S, U: stats.U, N: stats.N, EP: stats.EP, GP: stats.GP, PD, SQ });
  }

  rows.sort((a, b) => {
    if (b.SQ !== a.SQ) return b.SQ - a.SQ;
    if (b.PD !== a.PD) return b.PD - a.PD;
    return b.EP - a.EP;
  });

  return { name: cfg.name, rows, promotion_restricted: cfg.promotion_restricted };
}

function computeBest7Season(cfg, gamedayIdSet, gamedays) {
  // perGd: Map<team_id, { team_name, gdStats: Map<gameday_id, { Sp, S, U, N, EP, GP }> }>
  const perGd = new Map();

  for (const gd of gamedays) {
    if (!gamedayIdSet.has(gd.id)) continue;

    // Accumulate per-team stats for this gameday
    const gdTeamStats = new Map();
    processGames(gd.games, gdTeamStats, null);

    for (const [team_id, stats] of gdTeamStats) {
      if (!perGd.has(team_id)) {
        perGd.set(team_id, { team_name: stats.team_name, gdStats: new Map() });
      }
      perGd.get(team_id).gdStats.set(gd.id, {
        Sp: stats.Sp, S: stats.S, U: stats.U, N: stats.N, EP: stats.EP, GP: stats.GP,
      });
    }
  }

  const rows = [];
  for (const [team_id, { team_name, gdStats }] of perGd) {
    const gdArray = Array.from(gdStats.values());
    // Sort gamedays: wins desc, then EP desc (best gamedays first)
    gdArray.sort((a, b) => {
      if (b.S !== a.S) return b.S - a.S;
      return b.EP - a.EP;
    });
    const top = gdArray.slice(0, BEST7_COUNT);
    let Sp = 0, S = 0, U = 0, N = 0, EP = 0, GP = 0;
    for (const gd of top) {
      Sp += gd.Sp;
      S += gd.S;
      U += gd.U;
      N += gd.N;
      EP += gd.EP;
      GP += gd.GP;
    }
    const PD = EP - GP;
    rows.push({ team_id, team_name, Sp, S, U, N, EP, GP, PD });
  }

  // Sort: wins desc → EP desc
  rows.sort((a, b) => {
    if (b.S !== a.S) return b.S - a.S;
    return b.EP - a.EP;
  });

  return { name: cfg.name, rows, promotion_restricted: cfg.promotion_restricted, standings_mode: 'best7' };
}

// Accumulates game results into statsMap: Map<team_id, { team_name, Sp, S, U, N, EP, GP }>
function processGames(games, statsMap) {
  for (const game of (games || [])) {
    if (game.final_score == null) continue;
    const results = game.results;
    if (!results || results.length < 2) continue;
    const rA = results[0];
    const rB = results[1];
    if (rA.pa == null || rB.pa == null) continue;

    let aWins, bWins, isDraw;
    if (rA.pa < rB.pa) {
      aWins = true; bWins = false; isDraw = false;
    } else if (rB.pa < rA.pa) {
      aWins = false; bWins = true; isDraw = false;
    } else {
      aWins = false; bWins = false; isDraw = true;
    }

    const pairs = [
      { self: rA, opp: rB, wins: aWins, draws: isDraw },
      { self: rB, opp: rA, wins: bWins, draws: isDraw },
    ];

    for (const { self, opp, wins, draws } of pairs) {
      if (!statsMap.has(self.team_id)) {
        statsMap.set(self.team_id, { team_name: self.team_name, Sp: 0, S: 0, U: 0, N: 0, EP: 0, GP: 0 });
      }
      const stats = statsMap.get(self.team_id);
      stats.Sp += 1;
      stats.EP += opp.pa;
      stats.GP += self.pa;
      if (wins) stats.S += 1;
      else if (draws) stats.U += 1;
      else stats.N += 1;
    }
  }
}

module.exports = { computeStandings };
