// Fetches all gameday metadata + games and writes snapshot.json
// Full run:    node _gen_snapshot.js           (~5 min for 734 gamedays, batch 5 + 100ms delay)
// Rebuild:     node _gen_snapshot.js --rebuild  (re-index teams only, re-uses existing gameday data)

const API_BASE   = 'https://leaguesphere.app/api';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 100;  // pause between batches to avoid rate-limiting
const TODAY      = new Date().toISOString().slice(0, 10);

const NAME_MAP = {
  'Nürn': 'Nürnberg Renegades',   'Nürn2': 'Nürnberg Renegades II',
  'Spatz': 'München Spatzen',      'Würz': 'Würzburg',
  'Lions': 'Erlangen Lions',       'LLions': 'Landsberg Lions',
  'Kelk': 'Kelkheim Lizzards',     'Werra': 'Werratal',
  'Bamb': 'Bamberg',               'Regen': 'Regensburg',
  'Regen2': 'Regensburg II',       'Ingol': 'Ingolstadt',
  'Ingol2': 'Ingolstadt II',       'Erlangen2': 'Erlangen 2',
  'Ramsenthal': 'Ramsenthal',      'Ramsenthal2': 'Ramsenthal II',
  'Rodental': 'Rödental',          'Erding2': 'Erding II',
};

// Bracket slots and group placeholders — not real clubs
const PLACEHOLDER_RE = /^(Gewinner|Verlierer|[A-Z]\d{1,2}$|[PGQ]\d+\s*(Gruppe|HF|VF|GW|SF)|\d+\.\s*Platz)/i;

// Gameday names that look like event/round names rather than club names
const EVENT_NAME_RE  = /^\d+\.?\s*(Spieltag|Spielrunde)|Spieltag\s*\d+|Turnier|Cup\b|Finale|Pokal|Meisterschaft|Halbfinale|Viertelfinale|Relegation|Aufstieg|Abstieg/i;
function looksLikeTeamName(name) { return !!name && !EVENT_NAME_RE.test(name); }

async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
  }
}

async function fetchHTML(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(res => setTimeout(res, 500 * attempt));
    }
  }
}

async function fetchTeamNameMap() {
  const html = await fetchHTML('https://leaguesphere.app/passcheck/team/all/list/');
  const map  = {};
  for (const m of html.matchAll(/href="\/passcheck\/team\/(\d+)\/list">([^<]+)<\/a>/g)) {
    map[Number(m[1])] = m[2].trim();
  }
  return map;
}

async function batchedAll(items, fn, batchSize, delayMs) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res   = await Promise.all(batch.map(fn));
    results.push(...res);
    process.stdout.write('\r  ' + results.length + ' / ' + items.length + '  ');
    if (delayMs && i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  process.stdout.write('\n');
  return results;
}

function slimGameday(gd) {
  return {
    id:             gd.id,
    date:           gd.date,
    name:           gd.name           || '',
    start:          gd.start          || '',
    league_display: gd.league_display || '',
    address:        gd.address        || '',
  };
}

function slimGame(g) {
  return {
    status:         g.status,
    stage:          g.stage           || null,
    standing:       g.standing        || null,
    scheduled:      g.scheduled ? g.scheduled.slice(0, 5) : null,
    field:          g.field           != null ? g.field : null,
    final_score:    g.final_score     || null,
    halftime_score: g.halftime_score  || null,
    results: (g.results || []).map(r => ({
      team_id: r.team_id, team_name: r.team_name, pa: r.pa, isHome: r.isHome,
    })),
  };
}

// A team hosts a gameday when ALL their games there have isHome=true.
// Among all host-gameday names, the most frequent becomes the team's full name.
function inferName(abbrev, teamId, gamedayRefs, gamedayMap, teamNameMap) {
  if (teamNameMap[teamId])  return teamNameMap[teamId];
  if (NAME_MAP[abbrev])     return NAME_MAP[abbrev];

  const nameCounts = {};
  for (const ref of gamedayRefs) {
    const gd   = gamedayMap[ref.id];
    if (!gd || !gd.games.length) continue;
    const mine = gd.games.filter(g => g.results.some(r => r.team_id === teamId));
    if (!mine.length) continue;
    const allHome = mine.every(g => g.results.some(r => r.team_id === teamId && r.isHome));
    if (allHome && looksLikeTeamName(gd.name)) nameCounts[gd.name] = (nameCounts[gd.name] || 0) + 1;
  }

  const entries = Object.entries(nameCounts);
  if (entries.length) return entries.sort((a, b) => b[1] - a[1])[0][0];
  return abbrev;
}

function buildTeams(withGames, teamNameMap) {
  const gamedayMap = {};
  withGames.forEach(gd => { gamedayMap[gd.id] = gd; });

  const teamMap = {};
  for (const gd of withGames) {
    const seen = new Set();
    for (const g of gd.games) {
      for (const r of g.results) {
        if (seen.has(r.team_id)) continue;
        seen.add(r.team_id);
        if (!teamMap[r.team_id]) teamMap[r.team_id] = { abbrev: r.team_name, gdRefs: [] };
        teamMap[r.team_id].gdRefs.push({
          id:     gd.id,
          date:   gd.date,
          name:   gd.name,
          league: gd.league_display,
        });
      }
    }
  }

  return Object.entries(teamMap)
    .filter(([, t]) => !PLACEHOLDER_RE.test(t.abbrev))   // drop bracket placeholders
    .map(([id, t]) => ({
      id:       Number(id),
      abbrev:   t.abbrev,
      name:     inferName(t.abbrev, Number(id), t.gdRefs, gamedayMap, teamNameMap),
      gamedays: t.gdRefs.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

(async () => {
  const rebuild = process.argv.includes('--rebuild');
  let withGames;

  if (rebuild) {
    console.log('Rebuild mode: loading existing snapshot…');
    const existing = JSON.parse(require('fs').readFileSync('snapshot.json', 'utf8'));
    withGames = existing.gamedays;
    console.log('  ' + withGames.length + ' gamedays loaded');
  } else {
    console.log('Fetching gameday list…');
    const data     = await fetchJSON(API_BASE + '/gamedays/?format=json&page_size=1000');
    const gamedays = data.results.map(slimGameday);
    console.log('  ' + gamedays.length + ' gamedays found');

    console.log('Fetching games for each gameday…');
    let failed = 0;
    withGames = await batchedAll(gamedays, async gd => {
      try {
        const games = await fetchJSON(API_BASE + '/gamedays/' + gd.id + '/games/?format=json');
        return Object.assign({}, gd, { games: games.map(slimGame) });
      } catch(e) {
        failed++;
        return Object.assign({}, gd, { games: [] });
      }
    }, BATCH_SIZE, BATCH_DELAY_MS);
    if (failed) console.warn('  WARNING: ' + failed + ' gamedays failed to fetch — will retry');
  }

  // Retry pass: sequentially re-fetch any gameday that came back empty
  const emptyGds = withGames.filter(gd => gd.games.length === 0);
  if (emptyGds.length) {
    console.log('Retry pass: ' + emptyGds.length + ' empty gamedays…');
    let recovered = 0;
    for (let i = 0; i < emptyGds.length; i++) {
      const gd = emptyGds[i];
      try {
        const games = await fetchJSON(API_BASE + '/gamedays/' + gd.id + '/games/?format=json');
        if (games.length > 0) { gd.games = games.map(slimGame); recovered++; }
      } catch(e) {}
      process.stdout.write('\r  ' + (i + 1) + ' / ' + emptyGds.length + '  recovered: ' + recovered + '  ');
      if (i + 1 < emptyGds.length) await new Promise(r => setTimeout(r, 1500));
    }
    process.stdout.write('\n');
    console.log('  ' + recovered + ' / ' + emptyGds.length + ' recovered');
  }

  console.log('Fetching team names…');
  const teamNameMap = await fetchTeamNameMap();
  console.log('  ' + Object.keys(teamNameMap).length + ' team names indexed');

  console.log('Building team index…');
  const teams = buildTeams(withGames, teamNameMap);

  // Add passcheck teams not found in any game data (fetch failures leave gaps)
  const knownIds = new Set(teams.map(t => t.id));
  const extraTeams = Object.entries(teamNameMap)
    .filter(([id]) => !knownIds.has(Number(id)))
    .map(([id, name]) => ({ id: Number(id), abbrev: name, name, gamedays: [] }));
  const allTeams = teams.concat(extraTeams).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  console.log('  ' + allTeams.length + ' teams indexed (' + extraTeams.length + ' from passcheck only)');

  const snapshot = { generated: TODAY, teams: allTeams, gamedays: withGames };
  const json     = JSON.stringify(snapshot);
  require('fs').writeFileSync('snapshot.json', json, 'utf8');
  const kb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
  console.log('Written snapshot.json (' + kb + ' KB)');
})().catch(e => { console.error(e); process.exit(1); });
