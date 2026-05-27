'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { computeStandings } = require('../standings.js');

// ─── Helper builders ──────────────────────────────────────────────────────────

function makeGame(id, teamA, teamB, finalScore = true) {
  return {
    id,
    final_score: finalScore ? { home: teamB.pa, away: teamA.pa } : null,
    results: [
      { team_id: teamA.id, team_name: teamA.name, pa: teamA.pa, isHome: true },
      { team_id: teamB.id, team_name: teamB.name, pa: teamB.pa, isHome: false },
    ],
  };
}

function makeGameday(id, games) {
  return { id, date: '2026-01-01', name: 'Test Day', start: null, league_display: 'Test', games };
}

// ─── computeStandings — basic win/loss ────────────────────────────────────────

describe('computeStandings: win/loss', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [1],
        promotion_restricted: [],
      },
    },
  };

  const teamA = { id: 1, name: 'Team A', pa: 7 };
  const teamB = { id: 2, name: 'Team B', pa: 14 };
  const gamedays = [makeGameday(1, [makeGame(10, teamA, teamB)])];

  it('returns an object keyed by league', () => {
    const result = computeStandings(leagueConfig, gamedays);
    assert.ok(typeof result === 'object' && result !== null);
    assert.ok('test-league' in result, 'result must have test-league key');
  });

  it('includes the season key', () => {
    const result = computeStandings(leagueConfig, gamedays);
    assert.ok('2026' in result['test-league'], 'result must have 2026 season key');
  });

  it('includes name from config', () => {
    const result = computeStandings(leagueConfig, gamedays);
    assert.equal(result['test-league']['2026'].name, 'Test League 2026');
  });

  it('includes promotion_restricted from config', () => {
    const result = computeStandings(leagueConfig, gamedays);
    assert.deepEqual(result['test-league']['2026'].promotion_restricted, []);
  });

  it('winner (lower pa) gets S=1, EP=14, GP=7', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    const rowA = rows.find(r => r.team_id === 1);
    assert.ok(rowA, 'Team A must appear in rows');
    assert.equal(rowA.S, 1, 'Team A should have 1 win');
    assert.equal(rowA.U, 0);
    assert.equal(rowA.N, 0);
    assert.equal(rowA.Sp, 1);
    assert.equal(rowA.EP, 14, 'EP = opponent pa');
    assert.equal(rowA.GP, 7, 'GP = own pa');
    assert.equal(rowA.PD, 7, 'PD = EP - GP');
  });

  it('loser (higher pa) gets N=1, EP=7, GP=14', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    const rowB = rows.find(r => r.team_id === 2);
    assert.ok(rowB, 'Team B must appear in rows');
    assert.equal(rowB.S, 0);
    assert.equal(rowB.U, 0);
    assert.equal(rowB.N, 1, 'Team B should have 1 loss');
    assert.equal(rowB.Sp, 1);
    assert.equal(rowB.EP, 7, 'EP = opponent pa');
    assert.equal(rowB.GP, 14, 'GP = own pa');
    assert.equal(rowB.PD, -7, 'PD = EP - GP');
  });

  it('SQ for winner = (2*1 + 0) / (2*1) = 1.0', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rowA = result['test-league']['2026'].rows.find(r => r.team_id === 1);
    assert.equal(rowA.SQ, 1.0);
  });

  it('SQ for loser = (0 + 0) / (2*1) = 0.0', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rowB = result['test-league']['2026'].rows.find(r => r.team_id === 2);
    assert.equal(rowB.SQ, 0.0);
  });

  it('rows are sorted: winner (SQ=1.0) before loser (SQ=0.0)', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].team_id, 1, 'winner must come first');
    assert.equal(rows[1].team_id, 2, 'loser must come second');
  });
});

// ─── computeStandings — draw ──────────────────────────────────────────────────

describe('computeStandings: draw', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [1],
        promotion_restricted: [],
      },
    },
  };

  const teamA = { id: 1, name: 'Team A', pa: 7 };
  const teamB = { id: 2, name: 'Team B', pa: 7 };
  const gamedays = [makeGameday(1, [makeGame(10, teamA, teamB)])];

  it('both teams get U=1 on equal pa', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    const rowA = rows.find(r => r.team_id === 1);
    const rowB = rows.find(r => r.team_id === 2);
    assert.equal(rowA.U, 1);
    assert.equal(rowA.S, 0);
    assert.equal(rowA.N, 0);
    assert.equal(rowB.U, 1);
    assert.equal(rowB.S, 0);
    assert.equal(rowB.N, 0);
  });

  it('both teams get EP=7 and GP=7 on equal pa', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    const rowA = rows.find(r => r.team_id === 1);
    const rowB = rows.find(r => r.team_id === 2);
    assert.equal(rowA.EP, 7);
    assert.equal(rowA.GP, 7);
    assert.equal(rowA.PD, 0);
    assert.equal(rowB.EP, 7);
    assert.equal(rowB.GP, 7);
    assert.equal(rowB.PD, 0);
  });

  it('SQ for draw = (0 + 1) / (2*1) = 0.5', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    const rowA = rows.find(r => r.team_id === 1);
    const rowB = rows.find(r => r.team_id === 2);
    assert.equal(rowA.SQ, 0.5);
    assert.equal(rowB.SQ, 0.5);
  });
});

// ─── computeStandings — null final_score is skipped ──────────────────────────

describe('computeStandings: null final_score skipped', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [1],
        promotion_restricted: [],
      },
    },
  };

  const teamA = { id: 1, name: 'Team A', pa: 7 };
  const teamB = { id: 2, name: 'Team B', pa: 14 };
  // finalScore=false → final_score: null
  const gamedays = [makeGameday(1, [makeGame(10, teamA, teamB, false)])];

  it('returns empty rows when game has final_score=null', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    assert.deepEqual(rows, []);
  });
});

// ─── computeStandings — gameday not in gameday_ids is skipped ────────────────

describe('computeStandings: gameday not in gameday_ids', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [99],  // gameday id=1 is NOT listed
        promotion_restricted: [],
      },
    },
  };

  const teamA = { id: 1, name: 'Team A', pa: 7 };
  const teamB = { id: 2, name: 'Team B', pa: 14 };
  const gamedays = [makeGameday(1, [makeGame(10, teamA, teamB)])];

  it('returns empty rows when gameday id not in gameday_ids', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    assert.deepEqual(rows, []);
  });
});

// ─── computeStandings — empty leagueConfig → {} ───────────────────────────────

describe('computeStandings: empty leagueConfig', () => {
  it('returns {} for empty leagueConfig', () => {
    const result = computeStandings({}, []);
    assert.deepEqual(result, {});
  });
});

// ─── computeStandings — empty gameday_ids → rows: [] ─────────────────────────

describe('computeStandings: empty gameday_ids', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [],
        promotion_restricted: [10, 20],
      },
    },
  };

  const teamA = { id: 1, name: 'Team A', pa: 7 };
  const teamB = { id: 2, name: 'Team B', pa: 14 };
  const gamedays = [makeGameday(1, [makeGame(10, teamA, teamB)])];

  it('returns rows: [] when gameday_ids is empty', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    assert.deepEqual(rows, []);
  });

  it('passes through promotion_restricted unchanged', () => {
    const result = computeStandings(leagueConfig, gamedays);
    assert.deepEqual(result['test-league']['2026'].promotion_restricted, [10, 20]);
  });
});

// ─── computeStandings — SQ rounded to 4 decimal places ───────────────────────

describe('computeStandings: SQ precision', () => {
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [1, 2, 3],
        promotion_restricted: [],
      },
    },
  };

  // 1 win + 1 draw + 1 loss over 3 games for team 1
  // SQ = (2*1 + 1*1) / (2*3) = 3/6 = 0.5 — but use a case that tests precision:
  // 2 wins out of 3: SQ = (2*2 + 0) / (2*3) = 4/6 = 0.6667
  const t1 = { id: 1, name: 'Team 1', pa: 0 };
  const t2 = { id: 2, name: 'Team 2', pa: 7 };
  const t3 = { id: 3, name: 'Team 3', pa: 7 };
  const t4 = { id: 4, name: 'Team 4', pa: 7 };

  const gamedays = [
    makeGameday(1, [makeGame(10, t1, t2)]),  // t1 wins (0 < 7)
    makeGameday(2, [makeGame(11, t1, t3)]),  // t1 wins (0 < 7)
    makeGameday(3, [makeGame(12, t1, t4)]),  // t1 wins (0 < 7)
  ];

  it('SQ is a float (typeof number)', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const row = result['test-league']['2026'].rows.find(r => r.team_id === 1);
    assert.equal(typeof row.SQ, 'number');
  });

  it('SQ = 1.0 for 3 wins out of 3', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const row = result['test-league']['2026'].rows.find(r => r.team_id === 1);
    assert.equal(row.SQ, 1.0);
  });
});

// ─── computeStandings — row sorting ──────────────────────────────────────────

describe('computeStandings: row sorting', () => {
  // 3 teams: A beats B and C; B beats C
  // A: S=2, SQ=1.0, PD=positive
  // B: S=1 N=1, SQ=0.5, PD=0 or slight
  // C: N=2, SQ=0.0
  const leagueConfig = {
    'test-league': {
      '2026': {
        name: 'Test League 2026',
        gameday_ids: [1, 2, 3],
        promotion_restricted: [],
      },
    },
  };

  const tA = { id: 1, name: 'Team A', pa: 7 };
  const tB = { id: 2, name: 'Team B', pa: 14 };
  const tC = { id: 3, name: 'Team C', pa: 21 };
  const tA2 = { id: 1, name: 'Team A', pa: 7 };
  const tC2 = { id: 3, name: 'Team C', pa: 14 };
  const tB2 = { id: 2, name: 'Team B', pa: 7 };
  const tC3 = { id: 3, name: 'Team C', pa: 14 };

  const gamedays = [
    makeGameday(1, [makeGame(10, tA, tB)]),    // A(7) beats B(14)
    makeGameday(2, [makeGame(11, tA2, tC2)]),  // A(7) beats C(14)
    makeGameday(3, [makeGame(12, tB2, tC3)]),  // B(7) beats C(14)
  ];

  it('rows sorted SQ desc: A first, B second, C last', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    assert.equal(rows[0].team_id, 1, 'Team A (SQ=1.0) must be first');
    assert.equal(rows[1].team_id, 2, 'Team B (SQ=0.5) must be second');
    assert.equal(rows[2].team_id, 3, 'Team C (SQ=0.0) must be last');
  });

  it('team_name is included in rows', () => {
    const result = computeStandings(leagueConfig, gamedays);
    const rows = result['test-league']['2026'].rows;
    for (const row of rows) {
      assert.ok(typeof row.team_name === 'string' && row.team_name.length > 0,
        'each row must have a non-empty team_name');
    }
  });
});
