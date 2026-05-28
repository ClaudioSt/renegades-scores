'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

const snap = require(path.join(__dirname, '..', 'snapshot.json'));

// ─── Snapshot structure ───────────────────────────────────────────────────────

describe('snapshot.json structure', () => {
  it('has a generated date string', () => {
    assert.ok(typeof snap.generated === 'string', 'generated field must be a string');
    assert.match(snap.generated, /^\d{4}-\d{2}-\d{2}$/, 'generated must be YYYY-MM-DD');
  });

  it('has a teams array', () => {
    assert.ok(Array.isArray(snap.teams), 'teams must be an array');
    assert.ok(snap.teams.length > 0, 'teams array must not be empty');
  });

  it('has a gamedays array', () => {
    assert.ok(Array.isArray(snap.gamedays), 'gamedays must be an array');
    assert.ok(snap.gamedays.length > 0, 'gamedays must not be empty');
  });

  it('contains at least 464 teams', () => {
    assert.ok(snap.teams.length >= 464, `expected >= 464 teams, got ${snap.teams.length}`);
  });

  it('contains at least 700 gamedays', () => {
    assert.ok(snap.gamedays.length >= 700, `expected >= 700 gamedays, got ${snap.gamedays.length}`);
  });
});

// ─── Team 159 — Nürnberg Renegades ───────────────────────────────────────────

describe('team 159 (Nürnberg Renegades) in snapshot', () => {
  const team = snap.teams.find(t => t.id === 159);

  it('exists in teams array', () => {
    assert.ok(team, 'Team with id=159 must exist');
  });

  it('has the correct name', () => {
    assert.equal(team.name, 'Nürnberg Renegades');
  });

  it('has abbreviation Nürn', () => {
    assert.equal(team.abbrev, 'Nürn');
  });

  it('has a gamedays array', () => {
    assert.ok(Array.isArray(team.gamedays), 'team.gamedays must be an array');
    assert.ok(team.gamedays.length > 0, 'team 159 must have at least one gameday reference');
  });

  it('has at least one gameday with games in top-level gamedays', () => {
    const gdWithGames = snap.gamedays.filter(gd =>
      gd.games && gd.games.some(g => g.results.some(r => r.team_id === 159))
    );
    assert.ok(gdWithGames.length > 0, 'team 159 must appear in at least one gameday');
  });

  it('has at least 10 gamedays with games', () => {
    const count = snap.gamedays.filter(gd =>
      gd.games && gd.games.some(g => g.results.some(r => r.team_id === 159))
    ).length;
    assert.ok(count >= 10, `expected >= 10, got ${count}`);
  });

  it('has at least one finished game', () => {
    const finished = snap.gamedays
      .flatMap(gd => gd.games || [])
      .filter(g => g.status === 'beendet' && g.results.some(r => r.team_id === 159));
    assert.ok(finished.length > 0, 'team 159 must have at least one beendet game');
  });

  it('has at least one win', () => {
    const wins = snap.gamedays
      .flatMap(gd => gd.games || [])
      .filter(g => {
        const me    = g.results.find(r => r.team_id === 159);
        const other = g.results.find(r => r.team_id !== 159);
        return me && other && me.pa != null && other.pa != null && me.pa < other.pa;
      });
    assert.ok(wins.length > 0, 'team 159 must have at least one win');
  });

  it('has at least one loss', () => {
    const losses = snap.gamedays
      .flatMap(gd => gd.games || [])
      .filter(g => {
        const me    = g.results.find(r => r.team_id === 159);
        const other = g.results.find(r => r.team_id !== 159);
        return me && other && me.pa != null && other.pa != null && me.pa > other.pa;
      });
    assert.ok(losses.length > 0, 'team 159 must have at least one loss');
  });
});

// ─── Team 287 — Nürnberg Renegades II ────────────────────────────────────────

describe('team 287 (Nürnberg Renegades II) in snapshot', () => {
  const team = snap.teams.find(t => t.id === 287);

  it('exists in teams array', () => {
    assert.ok(team, 'Team with id=287 must exist');
  });

  it('has the correct name', () => {
    assert.equal(team.name, 'Nürnberg Renegades II');
  });

  it('has abbreviation Nürn2', () => {
    assert.equal(team.abbrev, 'Nürn2');
  });

  it('has a gamedays array', () => {
    assert.ok(Array.isArray(team.gamedays), 'team.gamedays must be an array');
    assert.ok(team.gamedays.length > 0, 'team 287 must have at least one gameday reference');
  });

  it('appears in top-level gamedays', () => {
    const gdWithGames = snap.gamedays.filter(gd =>
      gd.games && gd.games.some(g => g.results.some(r => r.team_id === 287))
    );
    assert.ok(gdWithGames.length > 0, 'team 287 must appear in at least one gameday');
  });

  it('has upcoming games (status != beendet)', () => {
    const upcoming = snap.gamedays
      .flatMap(gd => gd.games || [])
      .filter(g => g.status !== 'beendet' && g.results.some(r => r.team_id === 287));
    assert.ok(upcoming.length > 0, 'team 287 must have at least one upcoming game');
  });
});

// ─── Game result data integrity ───────────────────────────────────────────────

describe('game result integrity for teams 159 and 287', () => {
  const teams = [159, 287];

  teams.forEach(teamId => {
    const teamGames = snap.gamedays
      .flatMap(gd => (gd.games || []).map(g => ({ gd, game: g })))
      .filter(({ game }) => game.results.some(r => r.team_id === teamId));

    it(`team ${teamId}: every game has exactly 2 results`, () => {
      for (const { game } of teamGames) {
        assert.equal(
          game.results.length, 2,
          `game ${game.id} for team ${teamId} must have exactly 2 results, got ${game.results.length}`
        );
      }
    });

    it(`team ${teamId}: every game has exactly one home and one away result`, () => {
      for (const { game } of teamGames) {
        const homeCount = game.results.filter(r => r.isHome).length;
        const awayCount = game.results.filter(r => !r.isHome).length;
        assert.equal(homeCount, 1, `game ${game.id}: must have exactly 1 home result`);
        assert.equal(awayCount, 1, `game ${game.id}: must have exactly 1 away result`);
      }
    });

    it(`team ${teamId}: pa is a number or null in all results`, () => {
      for (const { game } of teamGames) {
        for (const r of game.results) {
          assert.ok(
            r.pa === null || typeof r.pa === 'number',
            `game ${game.id}, team ${r.team_id}: pa must be number or null, got ${typeof r.pa}`
          );
        }
      }
    });

    it(`team ${teamId}: finished games have consistent final_score and pa`, () => {
      for (const { game } of teamGames) {
        if (game.status !== 'beendet') continue;
        const fs = game.final_score;
        if (!fs || fs.home == null || fs.away == null) continue;
        const home = game.results.find(r => r.isHome);
        const away = game.results.find(r => !r.isHome);
        if (!home || !away || home.pa == null || away.pa == null) continue;
        // home.pa = points scored against home = away's score = final_score.away
        assert.equal(home.pa, fs.away,
          `game ${game.id}: home.pa (${home.pa}) must equal final_score.away (${fs.away})`);
        assert.equal(away.pa, fs.home,
          `game ${game.id}: away.pa (${away.pa}) must equal final_score.home (${fs.home})`);
      }
    });

    it(`team ${teamId}: team_id appears in results of every reported game`, () => {
      for (const { game } of teamGames) {
        const found = game.results.some(r => r.team_id === teamId);
        assert.ok(found, `game ${game.id} should contain team_id ${teamId} in results`);
      }
    });

    it(`team ${teamId}: team_name is a non-empty string in all results`, () => {
      for (const { game } of teamGames) {
        for (const r of game.results) {
          assert.ok(
            typeof r.team_name === 'string' && r.team_name.length > 0,
            `game ${game.id}, team ${r.team_id}: team_name must be a non-empty string`
          );
        }
      }
    });
  });
});

// ─── Gameday structure for both teams ────────────────────────────────────────

describe('gameday structure for teams 159 and 287', () => {
  const REQUIRED_FIELDS = ['id', 'date', 'name', 'start', 'league_display', 'games'];
  const teams = [159, 287];

  teams.forEach(teamId => {
    const gamedays = snap.gamedays.filter(gd =>
      gd.games && gd.games.some(g => g.results.some(r => r.team_id === teamId))
    );

    it(`team ${teamId}: all gamedays have required fields`, () => {
      for (const gd of gamedays) {
        for (const field of REQUIRED_FIELDS) {
          assert.ok(
            Object.prototype.hasOwnProperty.call(gd, field),
            `gameday ${gd.id} is missing field "${field}"`
          );
        }
      }
    });

    it(`team ${teamId}: all gameday dates are valid YYYY-MM-DD`, () => {
      for (const gd of gamedays) {
        assert.match(gd.date, /^\d{4}-\d{2}-\d{2}$/,
          `gameday ${gd.id} date "${gd.date}" is not YYYY-MM-DD`);
      }
    });

    it(`team ${teamId}: all gameday ids are positive integers`, () => {
      for (const gd of gamedays) {
        assert.ok(Number.isInteger(gd.id) && gd.id > 0,
          `gameday id must be a positive integer, got ${gd.id}`);
      }
    });
  });
});

// ─── No XSS vectors in team/gameday names ────────────────────────────────────

describe('no raw HTML in team names or gameday names for teams 159 and 287', () => {
  const teams = [159, 287];

  teams.forEach(teamId => {
    const gamedays = snap.gamedays.filter(gd =>
      gd.games && gd.games.some(g => g.results.some(r => r.team_id === teamId))
    );

    it(`team ${teamId}: gameday names contain no raw HTML angle brackets`, () => {
      for (const gd of gamedays) {
        assert.ok(!gd.name.includes('<') && !gd.name.includes('>'),
          `gameday "${gd.name}" contains raw HTML`);
      }
    });

    it(`team ${teamId}: team_name values in results contain no raw HTML`, () => {
      for (const gd of gamedays) {
        for (const game of gd.games) {
          for (const r of game.results) {
            assert.ok(!r.team_name.includes('<') && !r.team_name.includes('>'),
              `team_name "${r.team_name}" in game ${game.id} contains raw HTML`);
          }
        }
      }
    });
  });
});

// ─── Team registry lookup ─────────────────────────────────────────────────────

describe('team registry: abbreviation lookup', () => {
  it('maps abbrev Nürn to id 159', () => {
    const t = snap.teams.find(t => t.abbrev === 'Nürn');
    assert.ok(t, 'abbreviation Nürn must exist');
    assert.equal(t.id, 159);
  });

  it('maps abbrev Nürn2 to id 287', () => {
    const t = snap.teams.find(t => t.abbrev === 'Nürn2');
    assert.ok(t, 'abbreviation Nürn2 must exist');
    assert.equal(t.id, 287);
  });

  it('all teams have unique ids', () => {
    const ids = snap.teams.map(t => t.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, 'all team ids must be unique');
  });

  it('all teams have unique abbreviations', () => {
    const abbrevs = snap.teams.map(t => t.abbrev);
    const unique  = new Set(abbrevs);
    assert.equal(unique.size, abbrevs.length, 'all team abbreviations must be unique');
  });
});

// ─── Standings block ──────────────────────────────────────────────────────────

describe('snapshot.json standings', () => {
  it('has a standings object (not null, not array)', () => {
    assert.ok(
      typeof snap.standings === 'object' && snap.standings !== null && !Array.isArray(snap.standings),
      'standings must be a non-null, non-array object'
    );
  });

  it("has standings['ff-bl'] as an object", () => {
    assert.ok(
      snap.standings['ff-bl'] !== undefined &&
      typeof snap.standings['ff-bl'] === 'object' &&
      snap.standings['ff-bl'] !== null,
      "standings['ff-bl'] must exist and be an object"
    );
  });

  it("standings['ff-bl']['2026'] has keys name, rows, promotion_restricted", () => {
    const season = snap.standings['ff-bl']['2026'];
    assert.ok(season !== undefined && typeof season === 'object', "standings['ff-bl']['2026'] must exist");
    assert.ok('name' in season, "standings['ff-bl']['2026'] must have 'name'");
    assert.ok('rows' in season, "standings['ff-bl']['2026'] must have 'rows'");
    assert.ok('promotion_restricted' in season, "standings['ff-bl']['2026'] must have 'promotion_restricted'");
  });

  it("standings['ff-bl']['2026'].name equals 'FF BL 2026'", () => {
    assert.equal(snap.standings['ff-bl']['2026'].name, 'FF BL 2026');
  });

  it("standings['ff-bl']['2026'].rows is an array", () => {
    assert.ok(Array.isArray(snap.standings['ff-bl']['2026'].rows), 'rows must be an array');
  });

  it("standings['ff-bl']['2026'].promotion_restricted deep-equals [254, 492, 505]", () => {
    assert.deepEqual(snap.standings['ff-bl']['2026'].promotion_restricted, [254, 492, 505]);
  });

  it('each row has all required fields with correct types', () => {
    const rows = snap.standings['ff-bl']['2026'].rows;
    for (const row of rows) {
      assert.ok(typeof row.team_id === 'number', `row.team_id must be a number, got ${typeof row.team_id}`);
      assert.ok(typeof row.team_name === 'string', `row.team_name must be a string, got ${typeof row.team_name}`);
      for (const field of ['Sp', 'S', 'U', 'N', 'EP', 'GP', 'PD']) {
        assert.ok(typeof row[field] === 'number', `row.${field} must be a number, got ${typeof row[field]}`);
      }
      assert.ok(
        typeof row.SQ === 'number' && row.SQ >= 0 && row.SQ <= 1,
        `row.SQ must be a number between 0 and 1, got ${row.SQ}`
      );
    }
  });
});
