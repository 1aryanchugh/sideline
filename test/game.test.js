// Shapes follow real ESPN summary responses (trimmed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGame } from '../src/game.js';

const header = (home, away) => ({ competitions: [{ competitors: [
  { homeAway: 'away', score: away.score, team: { id: away.id, abbreviation: away.abbr, displayName: away.name, color: '00338d' }, linescores: away.ls.map((v) => ({ displayValue: String(v) })) },
  { homeAway: 'home', score: home.score, team: { id: home.id, abbreviation: home.abbr, displayName: home.name }, linescores: home.ls.map((v) => ({ displayValue: String(v) })) },
] }] });

test('NFL: periods, per-team box score tables, team stats, scoring plays', () => {
  const summary = {
    header: header({ id: '14', abbr: 'LAR', name: 'Los Angeles Rams', score: '24', ls: [7, 10, 7] },
                   { id: '2', abbr: 'BUF', name: 'Buffalo Bills', score: '17', ls: [3, 7, 7] }),
    boxscore: {
      teams: [
        { team: { id: '2', abbreviation: 'BUF' }, statistics: [{ name: 'totalYards', label: 'Total Yards', displayValue: '301' }, { name: 'turnovers', label: 'Turnovers', displayValue: '0' }] },
        { team: { id: '14', abbreviation: 'LAR' }, statistics: [{ name: 'totalYards', label: 'Total Yards', displayValue: '355' }, { name: 'turnovers', label: 'Turnovers', displayValue: '1' }] },
      ],
      players: [
        { team: { abbreviation: 'BUF' }, statistics: [{ name: 'passing', labels: ['C/ATT', 'YDS'], keys: ['ca', 'passingYards'], descriptions: ['Comp/Att', 'Passing Yards'],
          athletes: [{ athlete: { id: '1', displayName: 'Josh Allen' }, stats: ['18/27', '214'] }] }] },
        { team: { abbreviation: 'LAR' }, statistics: [{ name: 'receiving', labels: ['REC', 'YDS'], keys: ['receptions', 'receivingYards'],
          athletes: [{ athlete: { id: '2', displayName: 'Puka Nacua' }, stats: ['7', '96'] }, { athlete: { id: '3', displayName: 'Davante Adams' }, stats: ['4', '51'] }] }] },
      ],
    },
    scoringPlays: [{ period: { number: 1 }, clock: { displayValue: '9:12' }, team: { abbreviation: 'LAR' }, text: 'Puka Nacua 31 Yd pass from Matthew Stafford', scoringType: { displayName: 'Touchdown' }, homeScore: 7, awayScore: 0 }],
  };
  const g = extractGame(summary, 'nfl');
  assert.deepEqual(g.teams.map((t) => t.abbr), ['LAR', 'BUF'], 'home team first');
  assert.equal(g.teams[1].color, '#00338d');
  assert.deepEqual(g.periods.labels, ['Q1', 'Q2', 'Q3']);
  assert.deepEqual(g.periods.rows[0], { abbr: 'LAR', values: ['7', '10', '7'], total: '24' });
  assert.deepEqual(g.tables.map((t) => `${t.team} ${t.title}`), ['LAR Receiving', 'BUF Passing']);
  assert.deepEqual(g.tables[0].columns.map((c) => c.abbr), ['REC', 'YDS']);
  assert.deepEqual(g.tables[0].rows[1], { id: '3', name: 'Davante Adams', values: ['4', '51'] });
  assert.deepEqual(g.teamStats.teams, ['LAR', 'BUF']);
  assert.deepEqual(g.teamStats.rows.find((r) => r.label === 'Total Yards').values, ['355', '301']);
  assert.ok(g.teamStats.rows.find((r) => r.label === 'Turnovers'), 'kept because one side is non-zero');
  assert.deepEqual(g.events[0], { when: 'Q1 9:12', team: 'LAR', type: 'score', text: 'Puka Nacua 31 Yd pass from Matthew Stafford', kind: 'Touchdown', score: '7–0' });
});

test('NRL: nested team stats, all-zero rugby union rows dropped', () => {
  const s = (name, v) => ({ name, displayValue: String(v) });
  const summary = {
    header: header({ id: 'h', abbr: 'MEL', name: 'Storm', score: '14', ls: [0, 14] }, { id: 'a', abbr: 'PEN', name: 'Panthers', score: '22', ls: [22, 0] }),
    boxscore: { teams: [
      { team: { id: 'a', abbreviation: 'PEN' }, statistics: [{ name: 'general', stats: [s('metres', 1198), s('lineoutsWon', 0), s('tackles', 378)] }] },
      { team: { id: 'h', abbreviation: 'MEL' }, statistics: [{ name: 'general', stats: [s('metres', 1277), s('lineoutsWon', 0), s('tackles', 321)] }] },
    ] },
  };
  const g = extractGame(summary, 'nrl');
  assert.deepEqual(g.periods.labels, ['1st', '2nd']);
  assert.deepEqual(g.teamStats.rows.map((r) => r.label), ['Metres', 'Tackles']);
  assert.deepEqual(g.teamStats.rows[0].values, ['1277', '1198']);
});

test('Cricket: innings labelled by team, with totals, extras, run rate and who did not bat', () => {
  const inn = (period, stats, outText) => ({ period, linescores: [{
    statistics: { categories: [{ stats: Object.entries(stats).map(([name, v]) => ({ name, value: v, displayValue: String(v) })) }] },
    ...(outText ? { batting: { outDetails: { shortText: outText } } } : {}),
  }] });
  const summary = {
    rosters: [
      { team: { abbreviation: 'AUS' }, roster: [
        { athlete: { id: 'h', displayName: 'Travis Head' }, linescores: [
          inn(1, { batted: 1, battingPosition: 2, runs: 9, ballsFaced: 19, fours: 2, sixes: 0, strikeRate: 47.37 }, 'c Verreynne b Mulder'),
          inn(3, { batted: 1, battingPosition: 1, runs: 150, ballsFaced: 160, fours: 15, sixes: 3, strikeRate: 93.75 })] },
        { athlete: { id: 'k', displayName: 'Nic Maddinson' }, linescores: [
          inn(1, { batted: 1, battingPosition: 1, runs: 0, ballsFaced: 33, fours: 0, sixes: 0, strikeRate: 0 }, 'b Jansen')] },
        { athlete: { id: 'l', displayName: 'Nathan Lyon' }, linescores: [
          inn(2, { overs: 20.2, maidens: 3, conceded: 70, wickets: 4, economyRate: 3.44, wides: 0, noballs: 0, bowlingPosition: 1 })] },
      ] },
      { team: { abbreviation: 'SA' }, roster: [
        { athlete: { id: 'j', displayName: 'Marco Jansen' }, linescores: [
          inn(1, { overs: 31, maidens: 9, conceded: 68, wickets: 3, economyRate: 2.19, wides: 1, noballs: 3, bowlingPosition: 1 }),
          inn(2, { batted: 1, battingPosition: 7, runs: 40, ballsFaced: 50, fours: 5, sixes: 1, strikeRate: 80 }, 'c Carey b Lyon')] },
        { athlete: { id: 'm', displayName: 'Wiaan Mulder' }, linescores: [
          inn(1, { overs: 27, maidens: 6, conceded: 68, wickets: 4, economyRate: 2.52, wides: 1, noballs: 5, bowlingPosition: 2 })] },
      ] },
    ],
  };
  // As ESPN sends it: each side has an entry for every match innings, flagged
  // isBatting for the side batting in it, isCurrent for the one in progress.
  const L = (period, runs, wickets, overs, isBatting, extra = {}) => ({ period, runs, wickets, overs, isBatting, isCurrent: false, description: '', ...extra });
  const teams = [
    { abbr: 'SA', name: 'South Africa', score: '284 & 1/7', innings: [
      L(1, 0, 0, 137.2, false), L(2, 284, 10, 98.4, true, { description: 'all out' }), L(3, 0, 0, 58, false), L(4, 7, 1, 4, true, { isCurrent: true })] },
    { abbr: 'AUS', name: 'Australia', score: '390 & 314/6d', innings: [
      L(1, 390, 10, 137.2, true, { description: 'all out' }), L(2, 0, 0, 98.4, false), L(3, 314, 6, 58, true, { description: 'declared' }), L(4, 0, 0, 4, false, { isCurrent: true })] },
  ];
  const g = extractGame(summary, 'cricket', { teams, state: 'in' });
  assert.equal(g.periods, null);
  assert.deepEqual(g.innings.map((i) => `${i.label} ${i.score}`), ['AUS 1st 390', 'SA 1st 284', 'AUS 2nd 314/6d']);
  assert.deepEqual(g.innings.map((i) => i.live), [false, false, false], 'only the innings in progress is live');
  const aus1 = g.innings[0];
  assert.equal(aus1.teamName, 'Australia');
  assert.deepEqual(aus1.batting.map((b) => b.name), ['Nic Maddinson', 'Travis Head'], 'batting order');
  assert.equal(aus1.batting[1].howOut, 'c Verreynne b Mulder');
  assert.equal(aus1.overs, '137.2');
  assert.equal(aus1.runRate, '2.84');
  // Extras = 390 - 9 batting runs; wides and no-balls from the bowlers.
  assert.deepEqual(aus1.extras, { total: 381, wd: 2, nb: 8, other: 371 });
  assert.deepEqual(aus1.bowling.map((b) => `${b.name} ${b.o}-${b.m}-${b.r}-${b.w}`), ['Marco Jansen 31-9-68-3', 'Wiaan Mulder 27-6-68-4']);
  assert.deepEqual(aus1.notBatted, [], 'all out, so nobody is listed as not batting');
  const aus2 = g.innings[2];
  assert.equal(aus2.ordinal, '2nd');
  assert.deepEqual(aus2.notBatted, ['Nic Maddinson', 'Nathan Lyon'], 'declared: the rest did not bat');
  assert.equal(aus2.notBattedLabel, 'Did not bat');
  assert.equal(aus2.batting[0].notOut, true);
});

test('NBA: starters first, bench flagged, team totals row', () => {
  const summary = { boxscore: { players: [{ team: { abbreviation: 'BOS' }, statistics: [{
    labels: ['MIN', 'PTS'], keys: ['minutes', 'points'], totals: ['240', '112'],
    athletes: [
      { athlete: { id: '1', displayName: 'Bench Guy' }, starter: false, stats: ['12', '4'] },
      { athlete: { id: '2', displayName: 'Jayson Tatum' }, starter: true, stats: ['38', '31'] },
    ] }] }] } };
  const g = extractGame(summary, 'nba');
  const t = g.tables[0];
  assert.deepEqual(t.rows.map((r) => `${r.name}${r.bench ? ' (bench)' : ''}`), ['Jayson Tatum', 'Bench Guy (bench)']);
  assert.deepEqual(t.totals, ['240', '112']);
});

test('Soccer key events: goals and cards with match minute', () => {
  const summary = {
    header: header({ id: '1', abbr: 'ARS', name: 'Arsenal', score: '2', ls: [1, 1] }, { id: '2', abbr: 'CHE', name: 'Chelsea', score: '1', ls: [0, 1] }),
    keyEvents: [
      { type: { text: 'Goal' }, scoringPlay: true, clock: { displayValue: "23'" }, period: { number: 1 }, team: { displayName: 'Arsenal' }, text: 'Goal! Arsenal 1, Chelsea 0. Bukayo Saka' },
      { type: { text: 'Kickoff' }, clock: { displayValue: "0'" }, text: 'First half begins' },
      { type: { text: 'Yellow Card' }, clock: { displayValue: "41'" }, team: { displayName: 'Chelsea' }, text: 'Moisés Caicedo is shown the yellow card' },
    ],
  };
  summary.keyEvents[0].participants = [{ athlete: { displayName: 'Bukayo Saka' } }, { athlete: { displayName: 'Martin Ødegaard' } }];
  summary.keyEvents.push({ type: { text: 'Penalty - Scored' }, scoringPlay: true, clock: { displayValue: "78'" }, team: { displayName: 'Chelsea' }, text: 'Goal! Cole Palmer converts the penalty', participants: [{ athlete: { displayName: 'Cole Palmer' } }] });
  summary.keyEvents.push({ type: { text: 'Substitution' }, clock: { displayValue: "60'" }, text: 'Substitution, Arsenal.' });
  const g = extractGame(summary, 'epl');
  assert.deepEqual(g.events.map((e) => `${e.when} ${e.type} ${e.team} ${e.scorer}${e.assist ? ` (${e.assist})` : ''}${e.flag ? ` ${e.flag}` : ''}`),
    ["23' goal ARS Bukayo Saka (Martin Ødegaard)", "41' yellow CHE ", "78' goal CHE Cole Palmer Pen"]);
});

test('NRL from match details: tries, kicks and cards with names; subs dropped', async () => {
  const { detailEvent } = await import('../src/game.js');
  const abbr = (t) => ({ '289199': 'PEN', '289208': 'MEL' })[t?.id];
  const list = [
    { type: { text: 'try' }, clock: { displayValue: "3'" }, team: { id: '289199' }, athletesInvolved: [{ displayName: "Brian To'o" }] },
    { type: { text: 'conversion' }, clock: { displayValue: "5'" }, team: { id: '289199' }, athletesInvolved: [{ displayName: 'Nathan Cleary' }] },
    { type: { text: 'player substituted' }, clock: { displayValue: "23'" }, team: { id: '289199' }, athletesInvolved: [{ displayName: 'Moses Leota' }] },
    { type: { text: 'yellow card' }, clock: { displayValue: "26'" }, team: { id: '289208' }, athletesInvolved: [{ displayName: 'Oryn Keeley' }] },
  ].map((d) => detailEvent(d, abbr)).filter((e) => e.type !== 'skip');
  assert.deepEqual(list.map((e) => `${e.when} ${e.type} ${e.team} ${e.scorer}`), ["3' try PEN Brian To'o", "5' kick PEN Nathan Cleary", "26' yellow MEL Oryn Keeley"]);
});

test('Cricket dismissals: outs counter decides, text built from parts when missing', async () => {
  const { dismissalText } = await import('../src/players.js');
  const fielder = (n) => ({ displayName: n });
  assert.equal(dismissalText({ batting: { outDetails: { shortText: 'lbw b Nayeem Hasan' } } }), 'lbw b Nayeem Hasan');
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'c', bowler: fielder('Wiaan Mulder'), fielders: [fielder('Kyle Verreynne')] } } }), 'c Kyle Verreynne b Wiaan Mulder');
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'c', bowler: fielder('Keshav Maharaj'), fielders: [fielder('Keshav Maharaj')] } } }), 'c & b Keshav Maharaj');
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'b', bowler: fielder('Marco Jansen') } } }), 'b Marco Jansen');
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'run out', fielders: [fielder('Aiden Markram')] } } }), 'run out (Aiden Markram)');
  assert.equal(dismissalText({}, { dismissalCard: { displayValue: 'lbw' } }), 'lbw');
  // Names missing: say how, never a half-sentence.
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'c', bowler: {}, fielders: [{}] } } }), 'caught');
  // Only ids: looked up from the match roster.
  const names = new Map([['10', 'Alex Carey'], ['20', 'Josh Hazlewood']]);
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'c', bowler: { athlete: { id: '20' } }, fielders: [{ athlete: { $ref: 'http://x/athletes/10?lang=en' } }] } } }, {}, names), 'c Alex Carey b Josh Hazlewood');
  assert.equal(dismissalText({ batting: { outDetails: { dismissalCard: 'lbw', bowler: { athlete: { id: '20' } } } } }, {}, names), 'lbw b Josh Hazlewood');

  const inn = (period, stats, batting) => ({ period, linescores: [{
    statistics: { categories: [{ stats: Object.entries(stats).map(([name, v]) => ({ name, value: v, displayValue: String(v) })) }] },
    ...(batting ? { batting } : {}),
  }] });
  const summary = { rosters: [
    { team: { abbreviation: 'AUS' }, roster: [
      // Out, but ESPN sent no shortText: built from the parts.
      { athlete: { id: 'h', displayName: 'Travis Head' }, linescores: [inn(1, { batted: 1, outs: 1, notouts: 0, runs: 9, ballsFaced: 19 },
        { outDetails: { dismissalCard: 'c', bowler: { displayName: 'Wiaan Mulder' }, fielders: [{ displayName: 'Kyle Verreynne' }] } })] },
      // Out with no detail at all: still "out", never "not out".
      { athlete: { id: 's', displayName: 'Steve Smith' }, linescores: [inn(1, { batted: 1, outs: 1, runs: 25, ballsFaced: 53 })] },
      { athlete: { id: 'z', displayName: 'Josh Hazlewood' }, linescores: [inn(1, { batted: 1, outs: 0, notouts: 1, runs: 5, ballsFaced: 11 })] },
      { athlete: { id: 'l', displayName: 'Nathan Lyon' }, linescores: [inn(2, { overs: 20, conceded: 70, wickets: 4 })] },
    ] },
    { team: { abbreviation: 'SA' }, roster: [
      { athlete: { id: 'm', displayName: 'Aiden Markram' }, linescores: [inn(2, { batted: 1, outs: 1, runs: 37, ballsFaced: 67 }, { outDetails: { shortText: 'c Carey b Lyon' } })] },
    ] },
  ] };
  const ps = extractGame(summary, 'cricket', { teams: [] }).players;
  const howOut = (id) => ps.find((p) => p.id === id).groups[0].stats.find((x) => x.key.endsWith('howOut')).value;
  assert.equal(howOut('h'), 'c Kyle Verreynne b Wiaan Mulder');
  assert.equal(howOut('s'), 'out');
  assert.equal(howOut('z'), 'not out');
  assert.equal(ps.find((p) => p.id === 'l').groups[0].label, 'Bowling, SA 1st innings', 'labelled by the batting side, not match innings 2');
  assert.equal(ps.find((p) => p.id === 'm').groups[0].label, 'Batting, 1st innings', "SA's first innings, though it's match innings 2");
});

test('extra detail: venue, officials, broadcasts, leaders, injuries, win probability, series', () => {
  const summary = {
    gameInfo: {
      venue: { fullName: 'SoFi Stadium', address: { city: 'Inglewood', state: 'CA' }, capacity: 70240 },
      attendance: 73104,
      officials: [{ displayName: 'Shawn Hochuli', position: { displayName: 'Referee' }, order: 1 }, { displayName: 'Ref Two', position: { displayName: 'Umpire' }, order: 2 }],
      weather: { displayValue: 'Clear', temperature: 72 },
    },
    broadcasts: [{ media: { shortName: 'ESPN' } }, { media: { shortName: 'ABC' } }, { media: { shortName: 'ESPN' } }],
    leaders: [{ team: { abbreviation: 'BUF' }, leaders: [
      { displayName: 'Passing Yards', leaders: [{ displayValue: '18/27, 214 YDS, 2 TD', athlete: { id: 3918298, displayName: 'Josh Allen' } }] },
      { displayName: 'Sacks', leaders: [] },
    ] }],
    injuries: [{ team: { abbreviation: 'LAR' }, injuries: [{ status: 'Questionable', athlete: { displayName: 'Cooper Kupp', position: { abbreviation: 'WR' } }, details: { type: 'Ankle' } }] }],
    winprobability: [{ homeWinPercentage: 0.5 }, { homeWinPercentage: 0.684 }],
    seasonseries: [{ summary: 'Series tied 1-1' }],
  };
  const g = extractGame(summary, 'nfl');
  assert.deepEqual(g.info, {
    venue: 'SoFi Stadium, Inglewood, CA', capacity: 70240, attendance: 73104,
    officials: [{ name: 'Shawn Hochuli', role: 'Referee' }, { name: 'Ref Two', role: 'Umpire' }],
    broadcasts: ['ESPN', 'ABC'], weather: 'Clear, 72°', toss: '', hours: '',
  });
  assert.deepEqual(g.leaders, [{ team: 'BUF', scope: 'game', categories: [{ label: 'Passing Yards', value: '18/27, 214 YDS, 2 TD', name: 'Josh Allen', id: '3918298' }] }]);
  assert.deepEqual(g.injuries, [{ team: 'LAR', list: [{ name: 'Cooper Kupp', position: 'WR', status: 'Questionable', detail: 'Ankle' }] }]);
  assert.deepEqual(g.winProb, { home: 68.4, away: 31.6, live: true });
  assert.equal(g.series, 'Series tied 1-1');
  assert.deepEqual(g.lineups, [], 'line-ups are soccer only');
});

test('pre-game projection, cricket notes, and nothing invented when sections are missing', () => {
  assert.deepEqual(extractGame({ predictor: { homeTeam: { gameProjection: '57.3' } } }, 'nba').winProb, { home: 57.3, away: 42.7, live: false });
  const c = extractGame({
    gameInfo: { venue: { fullName: 'Kingsmead, Durban', address: { city: 'Durban', country: 'South Africa' } }, weather: { temperature: '' } },
    notes: ['Test no. 2637', '09.30 start, Lunch 11.45-12.25, Tea 14.40-15.00, Close 17.00', 'Australia , elected to bat first',
      'Over 7.5: Review by South Africa (Bowling), Decision Challenged - Wicket', 'Drinks: Australia - 28/2 in 12.0 overs'],
  }, 'cricket');
  assert.equal(c.info.venue, 'Kingsmead, Durban, South Africa', 'no repeated place names');
  assert.equal(c.info.weather, '', 'a blank temperature is not shown as a lone degree sign');
  assert.equal(c.info.toss, 'Australia, elected to bat first');
  assert.equal(c.info.hours, '09.30 start, Lunch 11.45-12.25, Tea 14.40-15.00, Close 17.00');
  assert.equal('notes' in c.info, false, 'the running log is dropped');
  const empty = extractGame({}, 'nrl');
  assert.equal(empty.info, null);
  assert.deepEqual([empty.leaders, empty.injuries, empty.winProb, empty.series], [[], [], null, '']);
});

test('soccer line-ups: formation, starters with numbers, bench with subs', () => {
  const summary = { rosters: [{ team: { abbreviation: 'ARS' }, formation: '4-3-3', roster: [
    { starter: true, jersey: '7', athlete: { id: 1, displayName: 'Bukayo Saka' }, position: { abbreviation: 'RW' }, subbedOut: true },
    { starter: true, jersey: '8', athlete: { id: 2, displayName: 'Martin Ødegaard' }, position: { abbreviation: 'AM' } },
    { starter: false, jersey: '11', athlete: { id: 3, displayName: 'Gabriel Martinelli' }, position: { abbreviation: 'LW' }, subbedIn: true },
  ] }] };
  const [t] = extractGame(summary, 'epl').lineups;
  assert.equal(t.formation, '4-3-3');
  assert.deepEqual(t.starters.map((p) => `${p.jersey} ${p.name} ${p.position}${p.subbedOut ? ' off' : ''}`), ['7 Bukayo Saka RW off', '8 Martin Ødegaard AM']);
  assert.deepEqual(t.bench.map((p) => `${p.jersey} ${p.name}${p.subbedIn ? ' on' : ''}`), ['11 Gabriel Martinelli on']);
});

test('pre-game NFL leaders become per-game season averages', async () => {
  const { perGame } = await import('../src/game.js');
  assert.equal(perGame('99/162, 1,189 YDS, 6 TD, 6 INT', 5), '61.1% completions, 237.8 yds, 1.2 TD, 1.2 INT');
  assert.equal(perGame('54 CAR, 294 YDS, 3 TD', 5), '10.8 carries, 58.8 yds, 0.6 TD');
  assert.equal(perGame('3.5', 5), '0.7');
  const summary = {
    header: { competitions: [{ status: { type: { state: 'pre' } }, competitors: [
      { homeAway: 'home', team: { id: '14', abbreviation: 'LAR' }, record: [{ type: 'total', summary: '4-1' }] },
      { homeAway: 'away', team: { id: '2', abbreviation: 'BUF' }, record: [{ type: 'total', summary: '3-1-1' }] }] }] },
    leaders: [{ team: { abbreviation: 'LAR' }, leaders: [{ displayName: 'Passing Yards', leaders: [{ displayValue: '99/162, 1,189 YDS, 6 TD, 6 INT', athlete: { id: 1, displayName: 'Matthew Stafford' } }] }] }],
  };
  const [lar] = extractGame(summary, 'nfl').leaders;
  assert.equal(lar.scope, 'season');
  assert.equal(lar.categories[0].value, '61.1% completions, 237.8 yds, 1.2 TD, 1.2 INT');
});
