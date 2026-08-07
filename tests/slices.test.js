'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const { buildTeamSlice, buildTeamIndex, buildHealth, writeSlices } = require('../slices.js');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function game(id, a, b) {
  return {
    id,
    status: 'beendet',
    final_score: { home: b.pa, away: a.pa },
    results: [
      { team_id: a.id, team_name: a.abbrev, pa: a.pa, isHome: true },
      { team_id: b.id, team_name: b.abbrev, pa: b.pa, isHome: false },
    ],
  };
}

const A = { id: 1, abbrev: 'AAA', pa: 7 };
const B = { id: 2, abbrev: 'BBB', pa: 14 };
const C = { id: 3, abbrev: 'CCC', pa: 21 };

function snapshot() {
  return {
    generated: '2026-08-06',
    teams: [
      { id: 1, abbrev: 'AAA', name: 'Team A', gamedays: [{ id: 10 }] },
      { id: 2, abbrev: 'BBB', name: 'Team B', gamedays: [{ id: 10 }] },
      { id: 3, abbrev: 'CCC', name: 'Team C', gamedays: [{ id: 11 }] },
      { id: 9, abbrev: 'ZZZ', name: 'Team Z', gamedays: [] },   // passcheck-only
    ],
    gamedays: [
      { id: 10, date: '2026-05-01', name: 'GD10', start: '10:00', league_display: 'L1',
        address: 'Somewhere', phase: 'L1 2026', games: [game(100, A, B), game(101, B, C)] },
      { id: 11, date: '2026-05-08', name: 'GD11', start: '11:00', league_display: 'L2',
        address: '', games: [game(102, B, C)] },
    ],
    standings: {
      l1: { 2026: { name: 'L1 2026', promotion_restricted: [], rows: [{ team_id: 1 }] } },
      l2: { 2026: { name: 'L2 2026', promotion_restricted: [], rows: [{ team_id: 3 }] } },
    },
  };
}

// ─── buildTeamSlice ───────────────────────────────────────────────────────────

describe('buildTeamSlice', () => {
  it('includes only gamedays the team plays in', () => {
    const s = buildTeamSlice(snapshot(), 1);
    assert.deepEqual(s.gamedays.map(g => g.id), [10]);
  });

  it('includes only the team\'s own games within a gameday', () => {
    const s = buildTeamSlice(snapshot(), 1);
    assert.deepEqual(s.gamedays[0].games.map(g => g.id), [100],
      'game 101 (B vs C) must not leak into A\'s slice');
  });

  it('keeps every game when the team plays several on one day', () => {
    const s = buildTeamSlice(snapshot(), 2);
    assert.deepEqual(s.gamedays.find(g => g.id === 10).games.map(g => g.id), [100, 101]);
  });

  it('carries the gameday fields the widget renders', () => {
    const gd = buildTeamSlice(snapshot(), 1).gamedays[0];
    for (const k of ['id', 'date', 'name', 'start', 'league_display', 'address']) {
      assert.ok(k in gd, 'gameday slice must keep field ' + k);
    }
  });

  it('keeps phase when present and omits it when absent', () => {
    const s = buildTeamSlice(snapshot(), 2);
    assert.equal(s.gamedays.find(g => g.id === 10).phase, 'L1 2026');
    assert.ok(!('phase' in s.gamedays.find(g => g.id === 11)));
  });

  it('includes the team itself plus every opponent for name resolution', () => {
    const s = buildTeamSlice(snapshot(), 2);
    assert.deepEqual(s.teams.map(t => t.id).sort(), [1, 2, 3]);
  });

  it('does not include unrelated teams', () => {
    const s = buildTeamSlice(snapshot(), 1);
    assert.deepEqual(s.teams.map(t => t.id).sort(), [1, 2]);
  });

  it('sets team to the requested team', () => {
    const s = buildTeamSlice(snapshot(), 3);
    assert.equal(s.team.id, 3);
    assert.equal(s.team.name, 'Team C');
  });

  it('falls back to a synthetic team when the index has no entry', () => {
    const snap = snapshot();
    snap.teams = [];
    const s = buildTeamSlice(snap, 1);
    assert.equal(s.team.id, 1);
    assert.equal(typeof s.team.name, 'string');
  });

  it('includes only standings for leagues the team appears in', () => {
    const s = buildTeamSlice(snapshot(), 1);
    assert.deepEqual(Object.keys(s.standings), ['l1']);
  });

  it('includes both leagues when the team plays in both', () => {
    const snap = snapshot();
    snap.gamedays[1].phase = 'L2 2026';
    const s = buildTeamSlice(snap, 3);   // team 3 plays GD10 (game 101) and GD11
    assert.deepEqual(Object.keys(s.standings).sort(), ['l1', 'l2']);
  });

  it('includes no standings when no gameday of the team is phased', () => {
    const snap = snapshot();
    delete snap.gamedays[0].phase;
    const s = buildTeamSlice(snap, 3);
    assert.deepEqual(s.standings, {});
  });

  it('returns empty gamedays for an unknown team id', () => {
    const s = buildTeamSlice(snapshot(), 4711);
    assert.deepEqual(s.gamedays, []);
  });

  it('carries no timestamp — a timestamp would rewrite every slice daily', () => {
    const s = buildTeamSlice(snapshot(), 1);
    assert.ok(!('generated' in s), 'team slices must stay byte-stable when data is unchanged');
  });
});

// ─── buildTeamIndex / buildHealth ─────────────────────────────────────────────

describe('buildTeamIndex', () => {
  it('lists every team including passcheck-only ones', () => {
    assert.equal(buildTeamIndex(snapshot()).length, 4);
  });

  it('is sorted by name', () => {
    const names = buildTeamIndex(snapshot()).map(t => t.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'de')));
  });

  it('exposes id, name and gameday count', () => {
    const row = buildTeamIndex(snapshot()).find(t => t.id === 1);
    assert.deepEqual(row, { id: 1, name: 'Team A', gamedays: 1 });
  });
});

describe('buildHealth', () => {
  it('reports generated date and counts', () => {
    const h = buildHealth(snapshot());
    assert.equal(h.generated, '2026-08-06');
    assert.equal(h.teams, 4);
    assert.equal(h.gamedays, 2);
    assert.deepEqual(h.standings, ['l1/2026', 'l2/2026']);
  });
});

// ─── writeSlices ──────────────────────────────────────────────────────────────

describe('writeSlices', () => {
  function tmpdir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'slices-test-'));
  }

  it('writes one file per team that appears in game data', () => {
    const dir = tmpdir();
    const stats = writeSlices(snapshot(), dir);
    const files = fs.readdirSync(path.join(dir, 'v1', 'teams')).sort();
    assert.deepEqual(files, ['1.json', '2.json', '3.json'],
      'team 9 has no games and must get no slice');
    assert.equal(stats.teams, 3);
  });

  it('writes standings per league and season', () => {
    const dir = tmpdir();
    writeSlices(snapshot(), dir);
    const p = path.join(dir, 'v1', 'standings', 'l1', '2026.json');
    assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).name, 'L1 2026');
  });

  it('writes teams.json and health.json', () => {
    const dir = tmpdir();
    writeSlices(snapshot(), dir);
    assert.ok(fs.existsSync(path.join(dir, 'v1', 'teams.json')));
    assert.ok(fs.existsSync(path.join(dir, 'v1', 'health.json')));
  });

  it('rewrites nothing on an unchanged second run', () => {
    const dir = tmpdir();
    writeSlices(snapshot(), dir);
    const second = writeSlices(snapshot(), dir);
    assert.equal(second.written, 0);
    assert.ok(second.unchanged > 0);
  });

  it('rewrites only the slices whose data changed', () => {
    const dir = tmpdir();
    writeSlices(snapshot(), dir);
    const snap = snapshot();
    snap.gamedays[1].games[0].results[0].pa = 99;   // changes teams 2 and 3
    const second = writeSlices(snap, dir);
    assert.equal(second.written, 2, 'only the two affected team slices');
  });

  it('removes slices of teams that vanished from the data', () => {
    const dir = tmpdir();
    writeSlices(snapshot(), dir);
    const snap = snapshot();
    snap.gamedays = snap.gamedays.filter(gd => gd.id === 11);   // team 1 disappears
    const second = writeSlices(snap, dir);
    assert.equal(second.removed, 1);
    assert.ok(!fs.existsSync(path.join(dir, 'v1', 'teams', '1.json')));
  });
});

// ─── Integration against the real snapshot ────────────────────────────────────

describe('slices against the real snapshot.json', () => {
  const snapPath = path.join(__dirname, '..', 'snapshot.json');
  const snap = fs.existsSync(snapPath) ? JSON.parse(fs.readFileSync(snapPath, 'utf8')) : null;

  // Mirrors the widget's own filter (widget.html renderGamedayCard + forTeam)
  function widgetGamedays(snapshot, teamId) {
    return (snapshot.gamedays || []).filter(gd =>
      (gd.games || []).some(g => (g.results || []).some(r => r.team_id === teamId)));
  }

  for (const teamId of [159, 287]) {
    it('team ' + teamId + ': slice has exactly the gamedays the widget would show', { skip: !snap }, () => {
      const expected = widgetGamedays(snap, teamId).map(g => g.id).sort((a, b) => a - b);
      const actual   = buildTeamSlice(snap, teamId).gamedays.map(g => g.id).sort((a, b) => a - b);
      assert.deepEqual(actual, expected);
    });

    it('team ' + teamId + ': every game in the slice involves the team', { skip: !snap }, () => {
      for (const gd of buildTeamSlice(snap, teamId).gamedays) {
        for (const g of gd.games) {
          assert.ok(g.results.some(r => r.team_id === teamId),
            'gameday ' + gd.id + ' game ' + g.id + ' does not involve team ' + teamId);
        }
      }
    });

    it('team ' + teamId + ': every rendered opponent name is resolvable', { skip: !snap }, () => {
      const slice = buildTeamSlice(snap, teamId);
      const known = new Set(slice.teams.map(t => t.id));
      for (const gd of slice.gamedays) {
        for (const g of gd.games) {
          for (const r of g.results) assert.ok(known.has(r.team_id), 'missing name for ' + r.team_id);
        }
      }
    });

    it('team ' + teamId + ': slice is far smaller than the full snapshot', { skip: !snap }, () => {
      const sliceBytes = Buffer.byteLength(JSON.stringify(buildTeamSlice(snap, teamId)), 'utf8');
      const fullBytes  = fs.statSync(snapPath).size;
      assert.ok(sliceBytes * 10 < fullBytes,
        'slice ' + sliceBytes + ' B vs snapshot ' + fullBytes + ' B — expected at least 10x smaller');
    });
  }

  it('team 287 gets its FF BL table with all 23 teams', { skip: !snap }, () => {
    const s = buildTeamSlice(snap, 287);
    const entry = s.standings['ff-bl'] && s.standings['ff-bl']['2026'];
    assert.ok(entry, 'FF BL 2026 must be present in the slice');
    assert.equal(entry.rows.length, 23);
  });
});
