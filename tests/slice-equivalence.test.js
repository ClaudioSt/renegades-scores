'use strict';

// Guards the migration from snapshot.json to the per-team API slices:
// whatever the widget renders from the full snapshot it must render byte-for-byte
// identically from the merged slices. If a slice ever drops a field a renderer
// needs, these tests fail rather than the embedded widget on the club's site.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');

const { freshContext } = require('./helpers');
const { buildTeamSlice } = require('../slices.js');

const SNAP_PATH = path.join(__dirname, '..', 'snapshot.json');
const snap = fs.existsSync(SNAP_PATH) ? JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8')) : null;
const TEAMS = [159, 287];

// Mirrors the widget's own gameday selection (DataStore 'snapshot-loaded' handler)
function sectionsFor(w, source, teamId, today) {
  const forTeam = source.gamedays.filter(gd =>
    gd.games && gd.games.some(g => g.results.some(r => r.team_id === teamId)));
  const past = forTeam
    .filter(gd => w.classifyGameday(gd, gd.games, teamId, today) === 'past')
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(gd => ({ id: gd.id, gd, games: gd.games }));
  const future = forTeam
    .filter(gd => w.classifyGameday(gd, gd.games, teamId, today) !== 'past')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(gd => ({ id: gd.id, gd, games: gd.games }));
  return { past, future };
}

describe('slice/snapshot rendering equivalence', { skip: !snap }, () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  // loadSnapshot() fills the abbrev→name index from snap.teams before anything
  // renders. Tests must do the same, otherwise resolveTeamName() falls back to
  // the raw abbrev on both sides and name regressions stay invisible.
  function primeNames(source) {
    Object.keys(w._teamNameByAbbrev).forEach(k => { delete w._teamNameByAbbrev[k]; });
    (source.teams || []).forEach(t => { w._teamNameByAbbrev[t.abbrev] = t.name; });
    return source;
  }

  function merged(teamIds) {
    return primeNames(w.mergeTeamSlices(teamIds.map(id => buildTeamSlice(snap, id))));
  }

  function full() { return primeNames(snap); }

  const today = '2026-08-06';

  for (const teamId of TEAMS) {
    // Each side must be rendered while its own name index is primed, so the
    // render calls are interleaved with primeNames rather than batched.
    it('team ' + teamId + ': past section HTML is identical', () => {
      const a = w.renderPastSection(sectionsFor(w, full(),            teamId, today).past, teamId, 999);
      const b = w.renderPastSection(sectionsFor(w, merged([teamId]), teamId, today).past, teamId, 999);
      assert.equal(b, a);
    });

    it('team ' + teamId + ': future section HTML is identical', () => {
      const a = w.renderFutureSection(sectionsFor(w, full(),            teamId, today).future, teamId, 999, today);
      const b = w.renderFutureSection(sectionsFor(w, merged([teamId]), teamId, today).future, teamId, 999, today);
      assert.equal(b, a);
    });

    it('team ' + teamId + ': standings table HTML is identical', () => {
      const rootA = { innerHTML: '' };
      w._renderTableFromSnap(rootA, full(), [teamId]);
      const a = rootA.innerHTML;
      const rootB = { innerHTML: '' };
      w._renderTableFromSnap(rootB, merged([teamId]), [teamId]);
      assert.equal(rootB.innerHTML, a);
      assert.ok(a.indexOf('standings-table') >= 0, 'a table must actually be rendered');
    });

    it('team ' + teamId + ': every club in its tables has a resolvable name', () => {
      const slice = buildTeamSlice(snap, teamId);
      const known = new Set(slice.teams.map(t => t.id));
      let checked = 0;
      Object.values(slice.standings).forEach(seasons => {
        Object.values(seasons).forEach(entry => {
          entry.rows.forEach(row => {
            assert.ok(known.has(row.team_id),
              'table row ' + row.team_id + ' (' + row.team_name + ') has no name entry');
            checked++;
          });
        });
      });
      assert.ok(checked > 10, 'expected a populated table to check against');
    });

    it('team ' + teamId + ': past section is not trivially empty', () => {
      const { past } = sectionsFor(w, merged([teamId]), teamId, today);
      assert.ok(past.length > 0, 'fixture would not prove anything with no gamedays');
      assert.ok(w.renderPastSection(past, teamId, 999).length > 500);
    });

    it('team ' + teamId + ': league grouping is identical', () => {
      const a = w._groupLeaguesFromSnapshot(full(),           [teamId]);
      const b = w._groupLeaguesFromSnapshot(merged([teamId]), [teamId]);
      assert.deepEqual(b.map(x => x.league), a.map(x => x.league));
      assert.deepEqual(
        b.map(x => x.gamedays.map(g => g.id)),
        a.map(x => x.gamedays.map(g => g.id)),
        'gameday order must survive the merge');
    });
  }

  it('both teams together: rendering matches the full snapshot', () => {
    const both = merged(TEAMS);
    for (const teamId of TEAMS) {
      const a = w.renderPastSection(sectionsFor(w, full(), teamId, today).past, teamId, 999);
      primeNames(both);
      const b = w.renderPastSection(sectionsFor(w, both, teamId, today).past, teamId, 999);
      assert.equal(b, a, 'team ' + teamId + ' must render the same when both slices are merged');
    }
  });

  it('both teams together: table view HTML is identical', () => {
    const root = { innerHTML: '' };
    w._renderTableFromSnap(root, full(), TEAMS);
    const fromSnapshot = root.innerHTML;
    root.innerHTML = '';
    w._renderTableFromSnap(root, merged(TEAMS), TEAMS);
    assert.equal(root.innerHTML, fromSnapshot);
    assert.ok(fromSnapshot.indexOf('standings-table') >= 0, 'a table must actually be rendered');
  });

  it('opponent names resolve identically', () => {
    const both = merged(TEAMS);
    const fromSnap = {};
    snap.teams.forEach(t => { fromSnap[t.abbrev] = t.name; });
    both.teams.forEach(t => {
      assert.equal(t.name, fromSnap[t.abbrev],
        'name for ' + t.abbrev + ' must match the full index');
    });
  });

  it('team titles resolve from the merged teams list', () => {
    const both = merged(TEAMS);
    for (const teamId of TEAMS) {
      const fromSlice = both.teams.find(t => t.id === teamId);
      const fromFull  = snap.teams.find(t => t.id === teamId);
      assert.ok(fromSlice, 'team ' + teamId + ' must be present for the title');
      assert.equal(fromSlice.name, fromFull.name);
    }
  });

  it('live-ticker game lookup finds the same games', () => {
    const both = merged(TEAMS);
    const idsIn = src => {
      const out = [];
      src.gamedays.forEach(gd => (gd.games || []).forEach(g => {
        if (g.results.some(r => TEAMS.indexOf(r.team_id) >= 0)) out.push(g.id);
      }));
      return out.sort((a, b) => a - b);
    };
    assert.deepEqual(idsIn(both), idsIn(snap),
      'every game the ticker may watch must exist in the merged slices');
  });
});

// ─── mergeTeamSlices unit behaviour ──────────────────────────────────────────

describe('mergeTeamSlices', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  const sliceA = {
    team: { id: 1, abbrev: 'A', name: 'Team A' },
    teams: [{ id: 1, abbrev: 'A', name: 'Team A' }, { id: 2, abbrev: 'B', name: 'Team B' }],
    gamedays: [{ id: 10, date: '2026-05-01', league_display: 'L1', phase: 'L1 2026',
                 games: [{ id: 100, results: [{ team_id: 1 }, { team_id: 2 }] }] }],
    standings: { l1: { 2026: { name: 'L1 2026', rows: [] } } },
  };
  const sliceB = {
    team: { id: 3, abbrev: 'C', name: 'Team C' },
    teams: [{ id: 3, abbrev: 'C', name: 'Team C' }, { id: 2, abbrev: 'B', name: 'Team B' }],
    gamedays: [{ id: 10, date: '2026-05-01', league_display: 'L1',
                 games: [{ id: 101, results: [{ team_id: 3 }, { team_id: 2 }] }] }],
    standings: { l2: { 2026: { name: 'L2 2026', rows: [] } } },
  };

  it('merges games of a shared gameday instead of dropping one', () => {
    const m = w.mergeTeamSlices([sliceA, sliceB]);
    assert.equal(m.gamedays.length, 1);
    assert.deepEqual(m.gamedays[0].games.map(g => g.id), [100, 101]);
  });

  it('dedupes a game present in both slices', () => {
    const m = w.mergeTeamSlices([sliceA, sliceA]);
    assert.deepEqual(m.gamedays[0].games.map(g => g.id), [100]);
  });

  it('dedupes teams by id', () => {
    const m = w.mergeTeamSlices([sliceA, sliceB]);
    // spread into a host-realm array — objects built inside the VM context
    // carry a different Array prototype and would fail the identity check
    assert.deepEqual([...m.teams].map(t => t.id).sort(), [1, 2, 3]);
  });

  it('keeps a phase contributed by only one slice', () => {
    const m = w.mergeTeamSlices([sliceB, sliceA]);
    assert.equal(m.gamedays[0].phase, 'L1 2026');
  });

  it('unions standings across slices', () => {
    const m = w.mergeTeamSlices([sliceA, sliceB]);
    assert.deepEqual(Object.keys(m.standings).sort(), ['l1', 'l2']);
  });

  it('does not mutate the input slices', () => {
    const before = JSON.stringify(sliceA);
    w.mergeTeamSlices([sliceA, sliceB]);
    assert.equal(JSON.stringify(sliceA), before);
  });

  it('tolerates null entries from 404s', () => {
    const m = w.mergeTeamSlices([sliceA, null]);
    assert.equal(m.gamedays.length, 1);
  });

  it('returns an empty shape for no slices', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(w.mergeTeamSlices([]))),
      { teams: [], gamedays: [], standings: {} });
  });
});

// ─── config + api base ───────────────────────────────────────────────────────

describe('api config', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  it('defaults to the slices next to the widget', () => {
    assert.equal(w.parseConfigFromSearch('?t=159').api, 'api/v1/');
  });

  it('api=0 disables slices and keeps snapshot.json', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&api=0').api, null);
  });

  it('accepts an absolute base for another host', () => {
    assert.equal(w.parseConfigFromSearch('?t=159&api=https://api.example.org/v1/').api,
      'https://api.example.org/v1/');
  });

  it('leaves every other parameter untouched', () => {
    const c = w.parseConfigFromSearch('?t=159&t=287&color=ffab00&past=5&compact=1&view=tabelle');
    assert.deepEqual(c.teams, [159, 287]);
    assert.equal(c.color, 'ffab00');
    assert.equal(c.past, 5);
    assert.equal(c.compact, true);
    assert.equal(c.view, 'tabelle');
  });

  it('resolves a relative base against the page', () => {
    assert.equal(w.resolveApiBase('api/v1/', 'https://x.org/w/'), 'https://x.org/w/api/v1/');
  });

  it('appends a missing trailing slash', () => {
    assert.equal(w.resolveApiBase('api/v1', 'https://x.org/w/'), 'https://x.org/w/api/v1/');
  });

  it('keeps an absolute base as-is', () => {
    assert.equal(w.resolveApiBase('https://api.example.org/v1/', 'https://x.org/w/'),
      'https://api.example.org/v1/');
  });

  it('strips the filename from the page URL', () => {
    assert.equal(w.pageBaseFrom('https://x.org/w/widget.html'), 'https://x.org/w/');
  });

  it('strips the query before cutting the filename', () => {
    assert.equal(w.pageBaseFrom('https://x.org/w/widget.html?t=159'), 'https://x.org/w/');
  });

  it('survives a parameter value containing slashes', () => {
    // regression: the query used to end up inside the base URL, so snapshot.json
    // was resolved against widget.html and came back as HTML
    assert.equal(
      w.pageBaseFrom('https://x.org/w/widget.html?t=159&api=http://other.org/v1/'),
      'https://x.org/w/');
  });

  it('strips a hash fragment', () => {
    assert.equal(w.pageBaseFrom('https://x.org/w/widget.html#top'), 'https://x.org/w/');
  });
});
