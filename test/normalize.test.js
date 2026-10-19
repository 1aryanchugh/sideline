// Run with: npm test
// Fixtures are trimmed copies of real responses from each feed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEspn, normalizeApiFootball, normalizeSquiggle } from '../src/normalize.js';

const final = { type: { state: 'post', shortDetail: 'Final', completed: true } };
const live = (d) => ({ type: { state: 'in', shortDetail: d } });

test('team sport (NRL shape): home side first, scores and winner kept', () => {
  const json = { events: [{
    id: '603434', name: 'Storm vs Panthers', date: '2026-08-20T09:50Z',
    competitions: [{ date: '2026-08-20T09:50Z', status: final, competitors: [
      { id: '289199', homeAway: 'away', winner: true, score: '22', team: { displayName: 'Panthers', abbreviation: 'PEN' } },
      { id: '289208', homeAway: 'home', winner: false, score: '14', team: { displayName: 'Storm', abbreviation: 'MEL' } },
    ] }],
  }] };
  const [ev] = normalizeEspn(json, 'nrl');
  assert.equal(ev.state, 'post');
  assert.equal(ev.competitors[0].name, 'Storm');
  assert.equal(ev.competitors[1].winner, true);
  assert.equal(ev.competitors[1].score, '22');
});

test('F1: each session becomes its own field, sorted by running order', () => {
  const json = { events: [{ id: '600060990', name: 'Malaysian GP', shortName: 'Malaysia GP', competitions: [
    { id: '401901648', date: '2026-10-03T04:30Z', type: { abbreviation: 'FP3' }, status: live('In Progress'), competitors: [
      { id: '4665', order: 2, athlete: { displayName: 'Max Verstappen' } },
      { id: '5829', order: 1, athlete: { displayName: 'Kimi Antonelli' } },
    ] },
    { id: '401901650', date: '2026-10-04T07:00Z', type: { abbreviation: 'Race' }, status: { type: { state: 'pre' } } },
  ] }] };
  const out = normalizeEspn(json, 'f1', 'sessions');
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'Malaysia GP · FP3');
  assert.equal(out[0].state, 'in');
  assert.equal(out[0].competitors[0].name, 'Kimi Antonelli');
  assert.equal(out[0].competitors[0].pos, '1');
  assert.equal(out[1].competitors.length, 0);
});

test('cricket scorepanel: series becomes group, summary becomes detail', () => {
  const json = { scores: [{ leagues: [{ name: 'County Championship Division Two' }], events: [{
    id: '1513437', name: 'Kent v Worcestershire', date: '2026-09-02T10:00Z',
    competitions: [{ status: { type: { state: 'in', detail: 'Live' }, summary: 'Worcs trail by 158 runs' }, competitors: [
      { id: '1', homeAway: 'home', score: '238', team: { displayName: 'Kent' } },
      { id: '2', homeAway: 'away', score: '80/2 (20.5 ov)', team: { displayName: 'Worcestershire' } },
    ] }],
  }] }] };
  const [ev] = normalizeEspn(json, 'cricket', 'cricket');
  assert.equal(ev.group, 'County Championship Division Two');
  assert.equal(ev.detail, 'Worcs trail by 158 runs');
  assert.equal(ev.competitors[1].score, '80/2 (20.5 ov)');
});

test('cricket series id: group, league, or the event uid as a last resort', async () => {
  const { cricketSeries } = await import('../src/normalize.js');
  assert.equal(cricketSeries({ leagueId: 8204 }, {}), '8204');
  assert.equal(cricketSeries({ leagues: [{ id: '24694' }] }, {}), '24694');
  assert.equal(cricketSeries({}, { uid: 's:200~l:23180~e:1501234' }), '23180');
  assert.equal(cricketSeries({}, { competitions: [{ uid: 's:200~l:777~e:1~c:1' }] }), '777');
  assert.equal(cricketSeries({}, {}), undefined);
});

test('UFC: every bout on a card is followable', () => {
  const json = { events: [{ id: 'card1', name: 'UFC 320', date: '2026-10-18T02:00Z', competitions: [
    { id: 'b1', status: final, competitors: [
      { id: 'a', winner: true, athlete: { displayName: 'Fighter A' } },
      { id: 'b', winner: false, athlete: { displayName: 'Fighter B' } },
    ] },
    { id: 'b2', status: { type: { state: 'pre' } }, competitors: [{ id: 'c', athlete: { displayName: 'Solo' } }] },
  ] }] };
  const out = normalizeEspn(json, 'ufc', 'bouts');
  assert.equal(out.length, 1, 'bouts without two fighters are skipped');
  assert.equal(out[0].name, 'Fighter A vs Fighter B');
  assert.equal(out[0].group, 'UFC 320');
});

test('golf: tied positions and to-par scores survive', () => {
  const json = { events: [{ id: 'g1', name: 'The Open', date: '2026-07-16', competitions: [{ status: live('Round 3'), competitors: [
    { id: 'p2', order: 2, score: '-9', status: { position: { displayName: 'T2' } }, athlete: { displayName: 'Player Two' } },
    { id: 'p1', order: 1, score: '-12', athlete: { displayName: 'Player One' } },
  ] }] }] };
  const [ev] = normalizeEspn(json, 'golf', 'field');
  assert.equal(ev.kind, 'field');
  assert.equal(ev.competitors[0].name, 'Player One');
  assert.equal(ev.competitors[1].pos, 'T2');
});

test('API-Football backup maps live minute and goals', () => {
  const json = { response: [{
    fixture: { id: 99, date: '2026-10-12T14:00:00+00:00', status: { short: '2H', long: 'Second Half', elapsed: 67 } },
    teams: { home: { id: 1, name: 'Arsenal' }, away: { id: 2, name: 'Chelsea' } },
    goals: { home: 2, away: 1 },
  }] };
  const [ev] = normalizeApiFootball(json, 'epl');
  assert.equal(ev.state, 'in');
  assert.equal(ev.detail, "67'");
  assert.equal(ev.competitors[0].score, '2');
});

test('Squiggle Event API game shows goals.behinds (total)', () => {
  const teams = { 10: { name: 'Richmond', abbrev: 'RIC' }, 7: { name: 'Geelong', abbrev: 'GEE' } };
  const g = { id: 8706, round: 5, hteam: 10, ateam: 7, date: '2022-04-18T05:20:00.000Z', complete: 64, winner: null,
    hscore: 64, ascore: 62, hgoals: 10, hbehinds: 4, agoals: 9, abehinds: 8, timestr: 'Q3 17:49' };
  const ev = normalizeSquiggle(g, teams);
  assert.equal(ev.state, 'in');
  assert.equal(ev.name, 'Richmond vs Geelong');
  assert.equal(ev.competitors[0].score, '10.4 (64)');
  assert.equal(ev.detail, 'Q3 17:49');
});

test('Squiggle Standard API fixture uses unixtime and hides 0-0 before the bounce', () => {
  const future = Math.floor(Date.now() / 1000) + 86400;
  const g = { id: 1, hteam: 1, ateam: 2, hteamname: 'Adelaide', ateamname: 'Carlton', date: '2027-03-05 19:30:00',
    unixtime: future, complete: 0, hscore: 0, ascore: 0 };
  const ev = normalizeSquiggle(g, {});
  assert.equal(ev.state, 'pre');
  assert.equal(ev.competitors[0].score, null);
  assert.equal(ev.start, new Date(future * 1000).toISOString());
});

test('cricketPause reads breaks in play from the status', async () => {
  const { cricketPause } = await import('../src/normalize.js');
  assert.equal(cricketPause({ type: { name: 'STATUS_STUMPS', state: 'in', description: 'Stumps' } }), 'Stumps');
  assert.equal(cricketPause({ type: { state: 'in', description: 'In Progress', detail: 'Day 3 - Stumps' } }), 'Stumps');
  assert.equal(cricketPause({ type: { name: 'STATUS_LUNCH', description: 'Lunch' } }), 'Lunch');
  assert.equal(cricketPause({ type: { name: 'STATUS_TEA', description: 'Tea' } }), 'Tea');
  assert.equal(cricketPause({ type: { name: 'STATUS_RAIN_DELAY', description: 'Rain Delay' } }), 'Rain delay');
  assert.equal(cricketPause({ type: { name: 'STATUS_IN_PROGRESS', description: 'In Progress', detail: 'Live' } }), null);
  assert.equal(cricketPause({ type: { name: 'STATUS_IN_PROGRESS', description: 'In Progress' } }), null);
});

test('cricket events carry the break and day', async () => {
  const { normalizeEspn } = await import('../src/normalize.js');
  const [ev] = normalizeEspn({ scores: [{ leagues: [{ id: '1', name: 'Bangladesh tour of UAE' }], events: [{
    id: '9', name: 'AFG v BAN', date: '2026-10-10T06:00Z',
    competitions: [{ status: { dayNumber: 4, summary: 'Afghanistan require 347 runs', type: { name: 'STATUS_STUMPS', state: 'in', description: 'Stumps' } }, competitors: [] }],
  }] }] }, 'cricket', 'cricket');
  assert.equal(ev.state, 'in');
  assert.equal(ev.pause, 'Stumps');
  assert.equal(ev.day, 4);
  assert.equal(ev.detail, 'Afghanistan require 347 runs');
});
