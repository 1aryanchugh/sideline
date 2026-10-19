import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCricketBalls, parsePlays, ballToken } from '../src/plays.js';

// Shaped like ESPN's cricket playbyplay items.
const ball = (seq, overNo, ballNo, runs, extra = {}) => ({
  sequence: seq, period: 2, periodText: '2nd innings',
  team: { abbreviation: 'SA' },
  playType: { description: extra.type || (runs === 0 ? 'no run' : `${runs} run`) },
  scoreValue: runs,
  shortText: `Hazlewood to Markram, ${runs} run`,
  over: { number: overNo, ball: ballNo, overs: `${overNo - 1}.${ballNo}`, complete: ballNo === 6, wide: extra.wide ? 1 : 0 },
  dismissal: { dismissal: !!extra.out, text: extra.out || '' },
  batsman: { athlete: { id: '1', displayName: 'Aiden Markram' }, totalRuns: 31, faced: 79 },
  otherBatsman: { athlete: { id: '2', displayName: 'Temba Bavuma' }, totalRuns: 1, faced: 9 },
  bowler: { athlete: { id: '9', displayName: 'Josh Hazlewood' }, overs: 9, maidens: 3, conceded: 27, wickets: 1 },
  innings: { runs: extra.total ?? 80, wickets: extra.wkts ?? 2, runRate: 2.93, target: 421, remainingBalls: 0, ballLimit: 0 },
});

test('ballToken reads each kind of delivery', () => {
  assert.equal(ballToken({ scoreValue: 0, playType: { description: 'no run' } }), '•');
  assert.equal(ballToken({ scoreValue: 4, playType: { description: 'four' } }), '4');
  assert.equal(ballToken({ scoreValue: 1, over: { wide: 1 }, playType: {} }), 'wd');
  assert.equal(ballToken({ scoreValue: 2, playType: { description: 'leg bye' } }), '2lb');
  assert.equal(ballToken({ scoreValue: 0, dismissal: { dismissal: true } }), 'W');
});

test('parseCricketBalls: this over, crease, bowler, overs for charts', () => {
  const items = [
    ball(1, 27, 1, 1, { total: 76 }), ball(2, 27, 2, 0, { total: 76 }), ball(3, 27, 3, 4, { total: 80 }),
    ball(4, 28, 1, 0, { total: 80 }), ball(5, 28, 2, 1, { wide: true, total: 81 }),
  ];
  const r = parseCricketBalls(items.reverse()); // any order in
  assert.deepEqual(r.current.thisOver, ['•', 'wd']);
  assert.equal(r.current.score, '81/2');
  assert.deepEqual(r.current.crease.map((b) => `${b.name} ${b.runs} (${b.balls})`), ['Aiden Markram 31 (79)', 'Temba Bavuma 1 (9)']);
  assert.equal(r.current.bowler.name, 'Josh Hazlewood');
  assert.equal(r.current.need, 340);
  assert.equal(r.current.rrr, null); // Test match: no ball limit
  assert.deepEqual(r.overs.map((o) => [o.n, o.runs, o.total]), [[27, 5, 80], [28, 1, 81]]);
  assert.equal(r.recent[0].token, 'wd'); // newest first
});

test('parseCricketBalls: after a wicket only the survivor is at the crease', () => {
  const r = parseCricketBalls([ball(1, 5, 3, 0, { out: 'Markram c Carey b Hazlewood 31' })]);
  assert.deepEqual(r.current.crease.map((b) => b.name), ['Temba Bavuma']);
  assert.equal(r.current.lastWicket, 'Markram c Carey b Hazlewood 31');
});

test('parsePlays: NBA plays, lead chart and win probability', () => {
  const summary = {
    header: { competitions: [{ competitors: [
      { homeAway: 'home', team: { id: '13', abbreviation: 'LAL' } },
      { homeAway: 'away', team: { id: '2', abbreviation: 'BOS' } }] }] },
    plays: [
      { id: 'a', period: { number: 1 }, clock: { displayValue: '11:40' }, text: 'Tatum makes 3-pt jumper', team: { id: '2' }, homeScore: 0, awayScore: 3, scoringPlay: true, scoreValue: 3 },
      { id: 'b', period: { number: 1 }, clock: { displayValue: '11:10' }, text: 'James misses layup', team: { id: '13' }, homeScore: 0, awayScore: 3 },
      { id: 'c', period: { number: 2 }, clock: { displayValue: '6:00' }, text: 'Davis dunk', team: { id: '13' }, homeScore: 30, awayScore: 28, scoringPlay: true, scoreValue: 2 },
    ],
    winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: 0.4123 }],
  };
  const r = parsePlays(summary, 'nba');
  assert.equal(r.kind, 'plays');
  assert.equal(r.items[0].text, 'Davis dunk');
  assert.equal(r.items[0].team, 'LAL');
  assert.equal(r.items[0].when, 'Q2 6:00');
  assert.equal(r.items[0].score, '28–30');
  assert.deepEqual(r.margin.map((m) => m.d), [-3, 2]);
  assert.equal(r.margin[1].t, 720 + 360);
  assert.deepEqual(r.winProb, [50, 41.2]);
});

test('parsePlays: NFL drives stay grouped, newest first', () => {
  const summary = {
    header: { competitions: [{ competitors: [
      { homeAway: 'home', team: { id: '14', abbreviation: 'LAR' } },
      { homeAway: 'away', team: { id: '2', abbreviation: 'BUF' } }] }] },
    drives: { previous: [
      { id: '1', team: { abbreviation: 'BUF' }, displayResult: 'Field Goal', description: '9 plays, 52 yards, 4:31', isScore: true,
        plays: [{ id: 'p1', period: { number: 1 }, clock: { displayValue: '10:00' }, text: 'Allen pass to Shakir for 12', homeScore: 0, awayScore: 0, start: { shortDownDistanceText: '1st & 10' } },
          { id: 'p2', period: { number: 1 }, clock: { displayValue: '9:10' }, text: 'Bass 41 yard field goal is GOOD', homeScore: 0, awayScore: 3, scoringPlay: true, type: { abbreviation: 'FG' } }] },
      { id: '2', team: { abbreviation: 'LAR' }, displayResult: 'Punt', description: '3 plays, 4 yards',
        plays: [{ id: 'p3', period: { number: 1 }, clock: { displayValue: '7:00' }, text: 'Stafford pass incomplete', homeScore: 0, awayScore: 3 }] },
    ] },
  };
  const r = parsePlays(summary, 'nfl');
  assert.deepEqual(r.items.map((i) => i.header ? `[${i.team} ${i.text}]` : i.id),
    ['[LAR Punt, 3 plays, 4 yards]', 'p3', '[BUF Field Goal, 9 plays, 52 yards, 4:31]', 'p2', 'p1']);
  assert.equal(r.items.find((i) => i.id === 'p2').tag, 'FG');
  assert.deepEqual(r.margin.map((m) => m.d), [0, -3]);
});

test('parsePlays: soccer commentary newest first', () => {
  const r = parsePlays({ commentary: [
    { sequence: 1, time: { displayValue: "1'" }, text: 'First half begins.' },
    { sequence: 2, time: { displayValue: "23'" }, text: 'Goal! Arsenal 1, Chelsea 0. Bukayo Saka (Arsenal) left footed shot.' },
  ] }, 'epl');
  assert.equal(r.kind, 'commentary');
  assert.equal(r.items[0].tag, 'Goal');
  assert.equal(r.items[1].when, "1'");
});

test('parseCricketBalls ignores non-delivery notes (end of day, drinks)', () => {
  const note = { sequence: 99, period: 2, shortText: 'End of day 3', over: {}, innings: { runs: 0, wickets: 0 } };
  const r = parseCricketBalls([ball(1, 27, 1, 1, { total: 76 }), note]);
  assert.equal(r.current.score, '76/2');
  assert.deepEqual(r.current.crease.map((b) => b.runs), [31, 1]);
});
