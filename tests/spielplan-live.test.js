'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { freshContext } = require('./helpers');

// Regression: a team's gameday that is happening *today* (not yet fully
// finished, so classifyGameday buckets it into "future") must still get a
// score box with id="score-{gameId}" so DataStore's live-ticker updates have
// an element to write into. Without this, a live game silently shows no
// score at all — see renderFutureSection's showScore argument.
describe('renderFutureSection — today\'s active gameday shows live score boxes', () => {
  let w;
  beforeEach(() => { w = freshContext(); });

  function makeGameday(id, date, games) {
    return { id, date, name: 'Test Spieltag', start: '10:00', league_display: 'Liga', address: '' };
  }

  function makeGame(id, teamId, oppId, scheduled) {
    return {
      id, status: 'Geplant', stage: 'Liga', standing: 'Game 1',
      scheduled: scheduled, field: 1,
      final_score: { home: 0, away: 0 }, halftime_score: { home: 0, away: 0 },
      results: [
        { team_id: teamId, team_name: 'Nürn2', pa: null, isHome: true  },
        { team_id: oppId,  team_name: 'Opp',   pa: null, isHome: false },
      ],
    };
  }

  it('renders a score box (with id) for a gameday happening today', () => {
    const today = '2026-07-05';
    const gd    = makeGameday(872, today);
    const game  = makeGame(9168, 287, 392, '10:00');
    const entries = [{ id: gd.id, gd: gd, games: [game] }];

    const html = w.renderFutureSection(entries, 287, 0, today);
    assert.ok(html.includes('id="score-9168"'), 'today\'s live game must have a score element');
  });

  it('still shows only the upcoming time (no score box) for a genuinely future gameday', () => {
    const today = '2026-07-05';
    const gd    = makeGameday(900, '2026-07-12');
    const game  = makeGame(9300, 287, 392, '10:00');
    const entries = [{ id: gd.id, gd: gd, games: [game] }];

    const html = w.renderFutureSection(entries, 287, 0, today);
    assert.ok(!html.includes('id="score-9300"'), 'future game must not have a score element yet');
    assert.ok(html.includes('upcoming-time'), 'future game must show the scheduled time instead');
  });
});
