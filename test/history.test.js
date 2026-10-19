// Shapes follow ESPN's team schedule and athlete gamelog responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseForm, parseGamelog } from '../src/history.js';

const game = (id, date, us, them, { home = true, state = 'post', usWin, themWin } = {}) => ({
  id, date,
  competitions: [{
    status: { type: { state, completed: state === 'post' } },
    competitors: [
      { id: '2', homeAway: home ? 'home' : 'away', winner: usWin, team: { id: '2', abbreviation: 'BUF' }, score: us == null ? undefined : { value: us, displayValue: String(us) } },
      { id: '9', homeAway: home ? 'away' : 'home', winner: themWin, team: { id: '9', abbreviation: them.abbr, displayName: them.name, color: 'c60c30' }, score: them.score == null ? undefined : { value: them.score, displayValue: String(them.score) } },
    ],
  }],
});

test('form: newest five results, W/L/D, plus the next game; schedules merged without duplicates', () => {
  const pre = { ...game('p0', '2026-08-22T17:00Z', 30, { abbr: 'CHI', score: 3 }, { usWin: true }), seasonType: { type: 1, abbreviation: 'pre' } };
  const preseason = { team: { abbreviation: 'BUF', displayName: 'Buffalo Bills', recordSummary: '3-1' }, events: [
    game('p1', '2026-08-15T17:00Z', 31, { abbr: 'CLE', name: 'Cleveland Browns', score: 7 }, { home: false, usWin: true, themWin: false }),
    pre, // preseason: excluded
  ] };
  const regular = { events: [
    game('r1', '2026-09-13T17:00Z', 24, { abbr: 'NYJ', score: 17 }, { usWin: true }),
    game('r2', '2026-09-20T17:00Z', 20, { abbr: 'MIA', score: 23 }, { home: false, themWin: true }),
    game('r3', '2026-09-27T17:00Z', 21, { abbr: 'NE', score: 21 }), // draw, no winner flags
    game('r4', '2026-10-04T17:00Z', 26, { abbr: 'NE', score: 29 }, { themWin: true }),
    game('r5', '2026-10-11T17:00Z', 30, { abbr: 'KC', score: 27 }, { home: false, usWin: true }),
    game('r6', '2099-10-18T17:00Z', null, { abbr: 'LAR', name: 'Los Angeles Rams', score: null }, { state: 'pre' }),
    game('p1', '2026-08-15T17:00Z', 31, { abbr: 'CLE', score: 7 }, { home: false, usWin: true }), // duplicate
  ] };
  const f = parseForm([preseason, regular], '2');
  assert.equal(f.name, 'Buffalo Bills');
  assert.equal(f.record, '3-1');
  assert.deepEqual(f.results.map((r) => `${r.result} ${r.home ? 'v' : '@'} ${r.opp} ${r.us}-${r.them}`),
    ['W @ KC 30-27', 'L v NE 26-29', 'D v NE 21-21', 'L @ MIA 20-23', 'W v NYJ 24-17']);
  assert.deepEqual(f.next, { date: '2099-10-18T17:00Z', opp: 'LAR', oppName: 'Los Angeles Rams', home: true });
});

test('gamelog: one row per game newest first, with opponent, result, columns and season totals', () => {
  const json = {
    labels: ['CMP', 'ATT', 'YDS', 'TD', 'CAR', 'YDS'],
    names: ['completions', 'passingAttempts', 'passingYards', 'passingTouchdowns', 'rushingAttempts', 'rushingYards'],
    displayNames: ['Completions', 'Passing Attempts', 'Passing Yards', 'Passing Touchdowns', 'Rushing Attempts', 'Rushing Yards'],
    categories: [{ name: 'passing', displayName: 'Passing', count: 4 }, { name: 'rushing', displayName: 'Rushing', count: 2 }],
    events: {
      401872971: { gameDate: '2026-10-04T17:00:00.000+00:00', atVs: 'vs', score: '29-26', gameResult: 'L', opponent: { abbreviation: 'NE', displayName: 'New England Patriots' } },
      401872953: { gameDate: '2026-09-27T17:00:00.000+00:00', atVs: '@', score: '31-20', gameResult: 'W', opponent: { abbreviation: 'MIA' } },
    },
    seasonTypes: [{
      displayName: '2026 Regular Season',
      categories: [{ type: 'event', events: [
        { eventId: '401872953', stats: ['19', '27', '241', '3', '6', '40'] },
        { eventId: '401872971', stats: ['23', '33', '253', '1', '5', '4'] },
      ], totals: ['42', '60', '494', '4', '11', '44'] }],
      summary: { stats: [{ displayName: 'Totals', type: 'total', stats: ['42', '60', '494', '4', '11', '44'] }] },
    }],
  };
  const g = parseGamelog(json);
  assert.equal(g.season, '2026 Regular Season');
  assert.deepEqual(g.groups, [{ label: 'Passing', span: 4 }, { label: 'Rushing', span: 2 }]);
  assert.equal(g.columns[2].label, 'Passing Yards');
  assert.deepEqual(g.games.map((x) => `${x.atVs} ${x.opp} ${x.result} ${x.score} ${x.values[2]}`),
    ['vs NE L 29-26 253', '@ MIA W 31-20 241']);
  assert.deepEqual(g.summary, [{ label: 'Totals', values: ['42', '60', '494', '4', '11', '44'] }]);
});

test('gamelog with no data returns empty sections', () => {
  assert.deepEqual(parseGamelog({}), { columns: [], groups: [], games: [], summary: [], season: '' });
});
