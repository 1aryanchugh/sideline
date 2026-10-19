// Fixtures are trimmed copies of real ESPN summary responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlayers, rosterToPlayers, teamsFromSummary } from '../src/players.js';

const stat = (players, id, key) =>
  players.find((p) => p.id === id)?.groups.flatMap((g) => g.stats).find((s) => s.key === key)?.value;

test('NFL: every stat group, one player merged across groups', () => {
  const summary = { boxscore: { players: [{
    team: { abbreviation: 'TB' },
    statistics: [
      { name: 'passing', labels: ['C/ATT', 'YDS', 'TD'], keys: ['completions/passingAttempts', 'passingYards', 'passingTouchdowns'],
        descriptions: ['Completions/Attempts', 'Passing Yards', 'Passing Touchdowns'],
        athletes: [{ athlete: { id: '1', displayName: 'QB One' }, stats: ['9/10', '52', '1'] }] },
      { name: 'rushing', labels: ['CAR', 'YDS'], keys: ['rushingAttempts', 'rushingYards'], descriptions: ['Rushing Attempts', 'Rushing Yards'],
        athletes: [{ athlete: { id: '1', displayName: 'QB One' }, stats: ['3', '14'] }] },
      { name: 'receiving', labels: ['REC', 'YDS', 'TGTS'], keys: ['receptions', 'receivingYards', 'receivingTargets'], descriptions: ['Receptions', 'Receiving Yards', 'Targets'],
        athletes: [{ athlete: { id: '2', displayName: 'Chris Godwin Jr.' }, stats: ['2', '18', '2'] }] },
      { name: 'fumbles', labels: ['FUM'], athletes: [] },
    ],
  }] } };
  const players = extractPlayers(summary, 'nfl');
  assert.equal(players.length, 2);
  const qb = players.find((p) => p.id === '1');
  assert.deepEqual(qb.groups.map((g) => g.label), ['Passing', 'Rushing']);
  assert.equal(stat(players, '1', 'passing.passingYards'), '52');
  assert.equal(stat(players, '1', 'rushing.rushingYards'), '14');
  assert.equal(stat(players, '2', 'receiving.receivingYards'), '18');
  assert.equal(qb.groups[0].stats[1].label, 'Passing Yards');
  assert.equal(qb.team, 'TB');
});

test('NBA: single unnamed group, DNP rows with no stats are dropped', () => {
  const summary = { boxscore: { players: [{
    team: { abbreviation: 'CHI' },
    statistics: [{ labels: ['MIN', 'PTS', 'REB', 'AST', '3PT'], keys: ['minutes', 'points', 'rebounds', 'assists', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'],
      athletes: [
        { athlete: { id: '10', displayName: 'Guard' }, stats: ['34', '27', '5', '8', '4-9'] },
        { athlete: { id: '11', displayName: 'Bench' }, stats: [], didNotPlay: true },
      ] }],
  }] } };
  const players = extractPlayers(summary, 'nba');
  assert.equal(players.length, 1);
  assert.equal(stat(players, '10', 'general.points'), '27');
  assert.equal(stat(players, '10', 'general.threePointFieldGoalsMade-threePointFieldGoalsAttempted'), '4-9');
});

test('NRL: nested stat objects under athletes[k].statistics[0].stats', () => {
  const summary = { boxscore: { players: [{
    team: { abbreviation: 'PEN' },
    statistics: [{ name: 'general', athletes: [{
      athlete: { id: '296003', displayName: "Brian To'o" },
      statistics: [{ stats: [
        { name: 'tries', displayName: 'Tries', abbreviation: 'T', displayValue: '3' },
        { name: 'metres', displayName: 'Meters Run', abbreviation: 'MR', displayValue: '212' },
        { name: 'tackles', displayName: 'Tackles', abbreviation: 'TK', displayValue: '6' },
      ] }],
    }] }],
  }] } };
  const players = extractPlayers(summary, 'nrl');
  assert.equal(stat(players, '296003', 'general.tries'), '3');
  assert.equal(stat(players, '296003', 'general.metres'), '212');
  assert.equal(players[0].groups[0].stats[1].label, 'Meters Run');
});

test('Cricket: this match per innings (newest first), never the career totals', () => {
  const inn = (period, stats, outText) => ({ period, linescores: [{
    statistics: { categories: [{ stats: Object.entries(stats).map(([name, v]) => ({ name, value: v, displayValue: String(v) })) }] },
    ...(outText ? { batting: { outDetails: { shortText: outText } } } : {}),
  }] });
  const summary = { rosters: [{
    team: { abbreviation: 'AUS' },
    roster: [
      { athlete: { id: '8', displayName: 'Pat Cummins' },
        // Career totals at the top level must be ignored.
        statistics: { categories: [{ stats: [{ name: 'runs', displayValue: '1659' }, { name: 'wickets', displayValue: '322' }] }] },
        linescores: [
          inn(1, { batted: 1, runs: 22, ballsFaced: 31, fours: 2, sixes: 1, strikeRate: 70.97, battingPosition: 9, overs: 0 }, 'c Verreynne b Rabada'),
          inn(2, { overs: 18, maidens: 4, conceded: 51, wickets: 3, economyRate: 2.83, ballsFaced: 0, caught: 1 }),
          inn(3, { batted: 0, ballsFaced: 0, overs: 0 }),
        ] },
      { athlete: { id: '9', displayName: 'Twelfth Man' }, linescores: [] },
    ],
  }] };
  const players = extractPlayers(summary, 'cricket');
  const p = players.find((x) => x.id === '8');
  assert.deepEqual(p.groups.map((g) => g.label), ['Bowling, 2nd innings', 'Fielding, 2nd innings', 'Batting, 1st innings']);
  assert.equal(stat(players, '8', 'inn2-bowling.wickets'), '3');
  assert.equal(stat(players, '8', 'inn2-bowling.conceded'), '51');
  assert.equal(stat(players, '8', 'inn1-batting.runs'), '22');
  assert.equal(stat(players, '8', 'inn1-batting.howOut'), 'c Verreynne b Rabada');
  assert.equal(stat(players, '8', 'inn1-batting.battingPosition'), undefined);
  assert.equal(p.groups.flatMap((g) => g.stats).some((s) => s.value === '1659'), false, 'career runs must not appear');
  assert.equal(p.groups[0].stats.find((s) => s.key === 'inn2-bowling.economyRate').label, 'Economy');
  // In the XI but hasn't batted or bowled: still listed, so they can be tracked.
  assert.deepEqual(players.find((x) => x.id === '9').groups, []);
});

test('Soccer: roster entries with flat stats arrays', () => {
  const summary = { rosters: [{
    team: { abbreviation: 'ARS' },
    roster: [{ athlete: { id: '5', displayName: 'Striker' }, position: { abbreviation: 'F' }, stats: [
      { name: 'totalGoals', displayName: 'Goals', abbreviation: 'G', displayValue: '1' },
      { name: 'shotsOnTarget', displayName: 'Shots on Target', abbreviation: 'SOT', displayValue: '3' },
    ] }],
  }] };
  const [p] = extractPlayers(summary, 'epl');
  assert.equal(p.position, 'F');
  assert.equal(stat([p], '5', 'general.shotsOnTarget'), '3');
});

test('No player data at all returns an empty list', () => {
  assert.deepEqual(extractPlayers({ boxscore: { teams: [] } }, 'afl'), []);
});

test('Rosters: NFL grouped by unit and NBA flat both work; header gives team ids', () => {
  const nfl = { athletes: [{ position: 'offense', items: [{ id: '1', displayName: 'QB', position: { abbreviation: 'QB' } }] }, { position: 'defense', items: [{ id: '2', displayName: 'LB' }] }] };
  const nba = { athletes: [{ id: '10', displayName: 'Guard', position: { abbreviation: 'G' } }] };
  assert.deepEqual(rosterToPlayers(nfl, { abbreviation: 'DAL' }).map((p) => `${p.team}:${p.name}`), ['DAL:QB', 'DAL:LB']);
  assert.equal(rosterToPlayers(nba, {})[0].position, 'G');
  const teams = teamsFromSummary({ header: { competitions: [{ competitors: [{ id: '6', team: { id: '6', abbreviation: 'DAL' } }, { id: '27', team: { id: '27' } }] }] } });
  assert.deepEqual(teams.map((t) => t.id), ['6', '27']);
});

test('positionName makes ESPN role codes readable and drops unknowns', async () => {
  const { positionName } = await import('../src/players.js');
  assert.equal(positionName({ abbreviation: 'WK' }), 'Wicketkeeper');
  assert.equal(positionName('BL'), 'Bowler');
  assert.equal(positionName({ abbreviation: 'AR' }), 'All-rounder');
  assert.equal(positionName({ abbreviation: 'UKN' }), '');
  assert.equal(positionName({ abbreviation: 'WR' }), 'WR');
  assert.equal(positionName(undefined), '');
});
