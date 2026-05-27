'use strict';

/**
 * computeStandings(leagueConfig, gamedays)
 *
 * @param {object} leagueConfig - validated league config (from loadLeagueConfig)
 * @param {Array}  gamedays     - array of gameday objects (from snapshot.json)
 * @returns {{ [leagueKey]: { [season]: { name, rows, promotion_restricted } } }}
 */
function computeStandings(leagueConfig, gamedays) {
  const result = {};

  for (const leagueKey of Object.keys(leagueConfig)) {
    result[leagueKey] = {};

    for (const season of Object.keys(leagueConfig[leagueKey])) {
      const cfg = leagueConfig[leagueKey][season];
      const gamedayIdSet = new Set(cfg.gameday_ids);

      // teamStats: Map<team_id, { team_name, Sp, S, U, N, EP, GP }>
      const teamStats = new Map();

      for (const gd of gamedays) {
        if (!gamedayIdSet.has(gd.id)) continue;

        for (const game of (gd.games || [])) {
          if (game.final_score == null) continue;

          const results = game.results;
          if (!results || results.length < 2) continue;

          const rA = results[0];
          const rB = results[1];

          if (rA.pa == null || rB.pa == null) continue;

          // Determine outcome
          let aWins, bWins, isDraw;
          if (rA.pa < rB.pa) {
            aWins = true; bWins = false; isDraw = false;
          } else if (rB.pa < rA.pa) {
            aWins = false; bWins = true; isDraw = false;
          } else {
            aWins = false; bWins = false; isDraw = true;
          }

          // Update stats for both participants
          const pairs = [
            { self: rA, opp: rB, wins: aWins, draws: isDraw },
            { self: rB, opp: rA, wins: bWins, draws: isDraw },
          ];

          for (const { self, opp, wins, draws } of pairs) {
            if (!teamStats.has(self.team_id)) {
              teamStats.set(self.team_id, {
                team_name: self.team_name,
                Sp: 0, S: 0, U: 0, N: 0, EP: 0, GP: 0,
              });
            }
            const stats = teamStats.get(self.team_id);
            stats.Sp += 1;
            stats.EP += opp.pa;  // EP = points scored by self = opponent's points against
            stats.GP += self.pa; // GP = points conceded by self = own points against
            if (wins) {
              stats.S += 1;
            } else if (draws) {
              stats.U += 1;
            } else {
              stats.N += 1;
            }
          }
        }
      }

      // Build rows
      const rows = [];
      for (const [team_id, stats] of teamStats) {
        const PD = stats.EP - stats.GP;
        const SQ = parseFloat(((2 * stats.S + stats.U) / (2 * stats.Sp)).toFixed(4));
        rows.push({
          team_id,
          team_name: stats.team_name,
          Sp: stats.Sp,
          S: stats.S,
          U: stats.U,
          N: stats.N,
          EP: stats.EP,
          GP: stats.GP,
          PD,
          SQ,
        });
      }

      // Sort: SQ desc → PD desc → EP desc
      rows.sort((a, b) => {
        if (b.SQ !== a.SQ) return b.SQ - a.SQ;
        if (b.PD !== a.PD) return b.PD - a.PD;
        return b.EP - a.EP;
      });

      result[leagueKey][season] = {
        name: cfg.name,
        rows,
        promotion_restricted: cfg.promotion_restricted,
      };
    }
  }

  return result;
}

module.exports = { computeStandings };
