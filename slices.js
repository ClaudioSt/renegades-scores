'use strict';

// Builds the per-team / per-league API slices from a full snapshot.
//
// The widget only ever renders one team's own games (renderGamedayCard filters
// to them) plus the precomputed table of the leagues that team plays in. Serving
// the whole 3.8 MB snapshot for that is wasteful, so we cut it into small files
// that can be served as-is — from GitHub Pages today, from nginx later.
//
// Deliberately NO `generated` timestamp in the team/standings slices: a
// timestamp would rewrite every file on every run and blow up git history.
// Data age lives in health.json alone, so a slice only changes when its data
// actually changed.

const path = require('path');
const fs   = require('fs');

const API_VERSION = 'v1';

function teamPlaysIn(game, teamId) {
  return (game.results || []).some(r => r.team_id === teamId);
}

/**
 * buildTeamSlice(snapshot, teamId)
 * Everything the widget needs to render one team, and nothing else.
 */
function buildTeamSlice(snapshot, teamId) {
  const gamedays = [];
  const phases   = new Set();
  const nameIds  = new Set([teamId]);

  for (const gd of snapshot.gamedays || []) {
    const games = (gd.games || []).filter(g => teamPlaysIn(g, teamId));
    if (!games.length) continue;

    for (const g of games) {
      for (const r of (g.results || [])) nameIds.add(r.team_id);
    }
    if (gd.phase) phases.add(gd.phase);

    const slim = {
      id:             gd.id,
      date:           gd.date,
      name:           gd.name,
      start:          gd.start,
      league_display: gd.league_display,
      address:        gd.address,
      games,
    };
    if (gd.phase) slim.phase = gd.phase;
    gamedays.push(slim);
  }

  // Opponent names, so the widget can resolve abbrevs without the full index
  const teams = (snapshot.teams || [])
    .filter(t => nameIds.has(t.id))
    .map(t => ({ id: t.id, abbrev: t.abbrev, name: t.name }));

  // Only the tables belonging to leagues this team appears in
  const standings = {};
  for (const [leagueKey, seasons] of Object.entries(snapshot.standings || {})) {
    for (const [year, entry] of Object.entries(seasons)) {
      if (!phases.has(entry.name)) continue;
      if (!standings[leagueKey]) standings[leagueKey] = {};
      standings[leagueKey][year] = entry;
    }
  }

  const self = teams.find(t => t.id === teamId) || { id: teamId, abbrev: String(teamId), name: String(teamId) };
  return { team: self, teams, gamedays, standings };
}

/**
 * buildTeamIndex(snapshot)
 * Slim id→name list for the embed generator's team search.
 */
function buildTeamIndex(snapshot) {
  return (snapshot.teams || [])
    .map(t => ({ id: t.id, name: t.name, gamedays: (t.gamedays || []).length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function buildHealth(snapshot) {
  const leagues = [];
  for (const [leagueKey, seasons] of Object.entries(snapshot.standings || {})) {
    for (const year of Object.keys(seasons)) leagues.push(leagueKey + '/' + year);
  }
  return {
    generated: snapshot.generated,
    teams:     (snapshot.teams || []).length,
    gamedays:  (snapshot.gamedays || []).length,
    standings: leagues.sort(),
  };
}

// Write only when the content actually differs — keeps mtimes and git history
// quiet for the ~90 % of teams whose data does not change on a given day.
function writeIfChanged(filePath, json) {
  try {
    if (fs.readFileSync(filePath, 'utf8') === json) return false;
  } catch (e) { /* missing file → write */ }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, json, 'utf8');
  return true;
}

/**
 * writeSlices(snapshot, outDir)
 * Emits <outDir>/v1/{teams.json,health.json,teams/<id>.json,standings/<league>/<year>.json}
 */
function writeSlices(snapshot, outDir) {
  const base  = path.join(outDir, API_VERSION);
  const stats = { written: 0, unchanged: 0, removed: 0, teams: 0, bytes: 0 };

  const emit = (relPath, data) => {
    const json = JSON.stringify(data);
    stats.bytes += Buffer.byteLength(json, 'utf8');
    if (writeIfChanged(path.join(base, relPath), json)) stats.written++;
    else stats.unchanged++;
  };

  // Teams that actually appear in game data — teams known only from the
  // passcheck list have nothing to render and get no slice.
  const active = new Set();
  for (const gd of snapshot.gamedays || []) {
    for (const g of (gd.games || [])) {
      for (const r of (g.results || [])) active.add(r.team_id);
    }
  }

  const keep = new Set();
  for (const teamId of active) {
    emit(path.join('teams', teamId + '.json'), buildTeamSlice(snapshot, teamId));
    keep.add(teamId + '.json');
    stats.teams++;
  }

  for (const [leagueKey, seasons] of Object.entries(snapshot.standings || {})) {
    for (const [year, entry] of Object.entries(seasons)) {
      emit(path.join('standings', leagueKey, year + '.json'), entry);
    }
  }

  emit('teams.json',  buildTeamIndex(snapshot));
  emit('health.json', buildHealth(snapshot));

  // Drop slices of teams that vanished from the data, so stale files are not
  // served forever.
  const teamDir = path.join(base, 'teams');
  if (fs.existsSync(teamDir)) {
    for (const f of fs.readdirSync(teamDir)) {
      if (f.endsWith('.json') && !keep.has(f)) {
        fs.unlinkSync(path.join(teamDir, f));
        stats.removed++;
      }
    }
  }

  return stats;
}

module.exports = { buildTeamSlice, buildTeamIndex, buildHealth, writeSlices, API_VERSION };
