// Fetches all gameday metadata + games and writes _snapshot.js
// Run with: node _gen_snapshot.js
// Takes ~30s for 734 gamedays in batches of 50

const API_BASE   = 'https://leaguesphere.app/api';
const BATCH_SIZE = 50;
const TODAY      = new Date().toISOString().slice(0, 10);

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}

async function batchedAll(items, fn, batchSize) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res   = await Promise.all(batch.map(fn));
    results.push(...res);
    process.stdout.write('\r  ' + results.length + ' / ' + items.length + '  ');
  }
  process.stdout.write('\n');
  return results;
}

// Keep only gameday fields used by renderGamedayCard
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

// Keep only game fields the widget actually uses
function slimGame(g) {
  return {
    status:         g.status,
    stage:          g.stage           || null,
    standing:       g.standing        || null,
    scheduled:      g.scheduled ? g.scheduled.slice(0, 5) : null,
    field:          g.field           != null ? g.field : null,
    final_score:    g.final_score     || null,
    halftime_score: g.halftime_score  || null,
    results: (g.results || []).map(function(r) {
      return { team_id: r.team_id, team_name: r.team_name, pa: r.pa, isHome: r.isHome };
    }),
  };
}

(async () => {
  console.log('Fetching gameday list…');
  const data     = await fetchJSON(API_BASE + '/gamedays/?format=json&page_size=1000');
  const gamedays = data.results.map(slimGameday);
  console.log('  ' + gamedays.length + ' gamedays found');

  console.log('Fetching games for each gameday…');
  const withGames = await batchedAll(gamedays, async function(gd) {
    try {
      const games = await fetchJSON(API_BASE + '/gamedays/' + gd.id + '/games/?format=json');
      return Object.assign({}, gd, { games: games.map(slimGame) });
    } catch(e) {
      return Object.assign({}, gd, { games: [] });
    }
  }, BATCH_SIZE);

  const snapshot = { generated: TODAY, gamedays: withGames };
  const js       = 'var GAMEDAY_SNAPSHOT = ' + JSON.stringify(snapshot) + ';';

  require('fs').writeFileSync('_snapshot.js', js, 'utf8');
  const kb = (Buffer.byteLength(js, 'utf8') / 1024).toFixed(1);
  console.log('Written _snapshot.js (' + kb + ' KB)');
})().catch(e => { console.error(e); process.exit(1); });
