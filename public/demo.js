// Sample board for /?demo — used for previews and screenshots.
// Scores and stats here are illustrative, not real results.

const min = 60_000;
const now = Date.now();
const at = (offsetMin) => new Date(now + offsetMin * min).toISOString();

const g = (group, label, rows) => ({
  group, label,
  stats: rows.map(([key, lbl, abbr, value]) => ({ key: `${group}.${key}`, label: lbl, abbr, value })),
});
const player = (id, name, team, position, groups) => ({ id, name, team, position, groups });

const allen = player('3918298', 'Josh Allen', 'BUF', 'QB', [
  g('passing', 'Passing', [['completions/passingAttempts', 'Completions/Attempts', 'C/ATT', '18/27'], ['passingYards', 'Passing Yards', 'YDS', '214'], ['passingTouchdowns', 'Passing Touchdowns', 'TD', '2'], ['interceptions', 'Interceptions', 'INT', '0'], ['sacks', 'Sacks', 'SACKS', '1-7'], ['QBRating', 'Passer Rating', 'RTG', '112.4']]),
  g('rushing', 'Rushing', [['rushingAttempts', 'Rushing Attempts', 'CAR', '6'], ['rushingYards', 'Rushing Yards', 'YDS', '38'], ['rushingTouchdowns', 'Rushing Touchdowns', 'TD', '0'], ['longRushing', 'Long Rush', 'LONG', '14']]),
]);
const nacua = player('4426515', 'Puka Nacua', 'LAR', 'WR', [
  g('receiving', 'Receiving', [['receptions', 'Receptions', 'REC', '7'], ['receivingYards', 'Receiving Yards', 'YDS', '96'], ['yardsPerReception', 'Yards Per Reception', 'AVG', '13.7'], ['receivingTouchdowns', 'Receiving Touchdowns', 'TD', '1'], ['longReception', 'Long Reception', 'LONG', '31'], ['receivingTargets', 'Targets', 'TGTS', '9']]),
]);
const stafford = player('12483', 'Matthew Stafford', 'LAR', 'QB', [
  g('passing', 'Passing', [['completions/passingAttempts', 'Completions/Attempts', 'C/ATT', '21/29'], ['passingYards', 'Passing Yards', 'YDS', '248'], ['passingTouchdowns', 'Passing Touchdowns', 'TD', '2'], ['interceptions', 'Interceptions', 'INT', '1']]),
]);
const cook = player('4379399', 'James Cook', 'BUF', 'RB', [
  g('rushing', 'Rushing', [['rushingAttempts', 'Rushing Attempts', 'CAR', '13'], ['rushingYards', 'Rushing Yards', 'YDS', '61'], ['rushingTouchdowns', 'Rushing Touchdowns', 'TD', '1']]),
  g('receiving', 'Receiving', [['receptions', 'Receptions', 'REC', '2'], ['receivingYards', 'Receiving Yards', 'YDS', '17']]),
]);

const patterson = player('5001', 'Kurtis Patterson', 'NSW', 'Batter', [
  g('batting', 'Batting', [['runs', 'Runs', 'Runs', '64'], ['ballsFaced', 'Balls Faced', 'Balls', '71'], ['fours', 'Fours', '4s', '6'], ['sixes', 'Sixes', '6s', '1'], ['strikeRate', 'Strike Rate', 'SR', '90.14']]),
]);

const adams = player('16800', 'Davante Adams', 'LAR', 'WR', [
  g('receiving', 'Receiving', [['receptions', 'Receptions', 'REC', '4'], ['receivingYards', 'Receiving Yards', 'YDS', '51'], ['yardsPerReception', 'Yards Per Reception', 'AVG', '12.8'], ['receivingTouchdowns', 'Receiving Touchdowns', 'TD', '1'], ['longReception', 'Long Reception', 'LONG', '22'], ['receivingTargets', 'Targets', 'TGTS', '6']]),
]);
const shakir = player('4373678', 'Khalil Shakir', 'BUF', 'WR', [
  g('receiving', 'Receiving', [['receptions', 'Receptions', 'REC', '6'], ['receivingYards', 'Receiving Yards', 'YDS', '88'], ['yardsPerReception', 'Yards Per Reception', 'AVG', '14.7'], ['receivingTouchdowns', 'Receiving Touchdowns', 'TD', '1'], ['longReception', 'Long Reception', 'LONG', '27'], ['receivingTargets', 'Targets', 'TGTS', '8']]),
]);

// Box-score tables in the same shape the server sends (one per team and group).
function tablesFrom(players, teamOrder) {
  const tables = new Map();
  for (const p of players) {
    for (const grp of p.groups) {
      const id = `${p.team}|${grp.group}`;
      if (!tables.has(id)) tables.set(id, { title: grp.label, team: p.team, kind: grp.group, columns: [], rows: [] });
      const t = tables.get(id);
      for (const st of grp.stats) if (!t.columns.some((c) => c.key === st.key)) t.columns.push({ key: st.key, abbr: st.abbr, label: st.label });
      t.rows.push({ id: p.id, name: p.name, map: Object.fromEntries(grp.stats.map((x) => [x.key, x.value])) });
    }
  }
  return [...tables.values()]
    .map((t) => ({ ...t, rows: t.rows.map((r) => ({ id: r.id, name: r.name, values: t.columns.map((c) => r.map[c.key] ?? '') })) }))
    .sort((a, b) => teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team));
}

// Sample form and game logs (illustrative numbers, like the rest of the demo).
const day = (d) => new Date(now - d * 86_400_000).toISOString();
const res = (d, home, opp, oppName, us, them) => ({ date: day(d), home, opp, oppName, us: String(us), them: String(them), result: us > them ? 'W' : us < them ? 'L' : 'D' });
const nflForm = [
  { id: '14', abbr: 'LAR', name: 'Los Angeles Rams', record: '4-1', results: [
    res(8, false, 'SF', 'San Francisco 49ers', 27, 24), res(15, true, 'SEA', 'Seattle Seahawks', 31, 20), res(22, false, 'ARI', 'Arizona Cardinals', 17, 23),
    res(29, true, 'NO', 'New Orleans Saints', 34, 13), res(36, false, 'DET', 'Detroit Lions', 26, 24)],
    next: { date: day(-6), home: true, opp: 'ARI', oppName: 'Arizona Cardinals' } },
  { id: '2', abbr: 'BUF', name: 'Buffalo Bills', record: '3-2', results: [
    res(8, false, 'KC', 'Kansas City Chiefs', 30, 27), res(15, true, 'NE', 'New England Patriots', 26, 29), res(22, true, 'NE', 'New England Patriots', 21, 21),
    res(29, false, 'MIA', 'Miami Dolphins', 20, 23), res(36, true, 'NYJ', 'New York Jets', 24, 17)],
    next: { date: day(-6), home: false, opp: 'LV', oppName: 'Las Vegas Raiders' } },
];
const passCols = [['completions', 'CMP', 'Completions'], ['passingAttempts', 'ATT', 'Attempts'], ['passingYards', 'YDS', 'Passing Yards'], ['passingTouchdowns', 'TD', 'Passing TDs'], ['interceptions', 'INT', 'Interceptions'], ['QBRating', 'RTG', 'Passer Rating'], ['rushingAttempts', 'CAR', 'Rushes'], ['rushingYards', 'YDS', 'Rushing Yards'], ['rushingTouchdowns', 'TD', 'Rushing TDs']];
const gl = (d, atVs, opp, result, score, values) => ({ id: `g${d}`, date: day(d), atVs, opp, result, score, values: values.map(String) });
const allenLog = {
  season: '2026 Regular Season',
  columns: passCols.map(([key, abbr, label]) => ({ key, abbr, label })),
  groups: [{ label: 'Passing', span: 6 }, { label: 'Rushing', span: 3 }],
  games: [
    gl(8, '@', 'KC', 'W', '30-27', [24, 35, 287, 2, 0, 108.9, 7, 41, 1]), gl(15, 'vs', 'NE', 'L', '26-29', [23, 33, 253, 1, 1, 89.6, 5, 4, 1]),
    gl(22, 'vs', 'NE', 'T', '21-21', [19, 31, 212, 2, 1, 86.2, 6, 33, 0]), gl(29, '@', 'MIA', 'L', '20-23', [21, 34, 224, 1, 0, 88.5, 8, 52, 0]),
    gl(36, 'vs', 'NYJ', 'W', '24-17', [19, 27, 241, 3, 0, 125.3, 6, 40, 1]),
  ],
  summary: [{ label: 'Totals', values: ['106', '160', '1,217', '9', '2', '99.5', '32', '170', '3'] }],
};
const recCols = [['receptions', 'REC', 'Receptions'], ['receivingTargets', 'TGTS', 'Targets'], ['receivingYards', 'YDS', 'Receiving Yards'], ['yardsPerReception', 'AVG', 'Yards per Catch'], ['receivingTouchdowns', 'TD', 'Receiving TDs'], ['longReception', 'LNG', 'Long']];
const nacuaLog = {
  season: '2026 Regular Season',
  columns: recCols.map(([key, abbr, label]) => ({ key, abbr, label })),
  groups: [{ label: 'Receiving', span: 6 }],
  games: [
    gl(8, '@', 'SF', 'W', '27-24', [9, 12, 118, 13.1, 1, 34]), gl(15, 'vs', 'SEA', 'W', '31-20', [7, 9, 102, 14.6, 1, 41]),
    gl(22, '@', 'ARI', 'L', '17-23', [5, 10, 61, 12.2, 0, 22]), gl(29, 'vs', 'NO', 'W', '34-13', [8, 9, 131, 16.4, 2, 48]),
    gl(36, '@', 'DET', 'W', '26-24', [10, 13, 109, 10.9, 0, 27]),
  ],
  summary: [{ label: 'Totals', values: ['39', '53', '521', '13.4', '4', '48'] }],
};

const nflPlayers = [stafford, nacua, adams, allen, cook, shakir];
const nflGame = {
  teams: [{ abbr: 'LAR', name: 'Los Angeles Rams', color: '#003594' }, { abbr: 'BUF', name: 'Buffalo Bills', color: '#00338D' }],
  periods: { labels: ['Q1', 'Q2', 'Q3'], rows: [{ abbr: 'LAR', values: ['7', '10', '7'], total: '24' }, { abbr: 'BUF', values: ['3', '7', '7'], total: '17' }] },
  tables: tablesFrom(nflPlayers, ['LAR', 'BUF']),
  teamStats: { teams: ['LAR', 'BUF'], rows: [
    { label: 'Total yards', values: ['355', '301'] }, { label: 'Passing', values: ['248', '214'] },
    { label: 'Rushing', values: ['107', '87'] }, { label: 'First downs', values: ['19', '16'] },
    { label: 'Third down efficiency', values: ['5-9', '4-10'] }, { label: 'Turnovers', values: ['1', '0'] },
    { label: 'Possession', values: ['17:42', '15:16'] },
  ] },
  events: [
    { when: 'Q1 9:12', team: 'LAR', kind: 'Touchdown', score: '7–0', text: 'Puka Nacua 31 yd pass from Matthew Stafford (Joshua Karty kick)' },
    { when: 'Q1 2:40', team: 'BUF', kind: 'Field goal', score: '7–3', text: 'Tyler Bass 44 yd field goal' },
    { when: 'Q2 11:05', team: 'BUF', kind: 'Touchdown', score: '7–10', text: 'Khalil Shakir 27 yd pass from Josh Allen (Tyler Bass kick)' },
    { when: 'Q2 4:18', team: 'LAR', kind: 'Touchdown', score: '14–10', text: 'Davante Adams 9 yd pass from Matthew Stafford (Joshua Karty kick)' },
    { when: 'Q2 0:03', team: 'LAR', kind: 'Field goal', score: '17–10', text: 'Joshua Karty 51 yd field goal' },
    { when: 'Q3 10:21', team: 'BUF', kind: 'Touchdown', score: '17–17', text: 'James Cook 4 yd run (Tyler Bass kick)' },
    { when: 'Q3 8:42', team: 'LAR', kind: 'Touchdown', score: '24–17', text: 'Kyren Williams 12 yd run (Joshua Karty kick)' },
  ],
  players: nflPlayers,
  source: 'boxscore',
  info: {
    venue: 'SoFi Stadium, Inglewood, CA', capacity: 70240, attendance: 73104,
    officials: [{ name: 'Shawn Hochuli', role: 'Referee' }, { name: 'Bryan Neale', role: 'Umpire' }, { name: 'Jerod Phillips', role: 'Down Judge' }],
    broadcasts: ['ESPN', 'ABC'], weather: '', toss: '', hours: '',
  },
  leaders: [
    { team: 'LAR', scope: 'game', categories: [
      { label: 'Passing Yards', value: '21/29, 248 YDS, 2 TD, 1 INT', name: 'Matthew Stafford', id: '12483' },
      { label: 'Rushing Yards', value: '14 CAR, 66 YDS, 1 TD', name: 'Kyren Williams', id: '' },
      { label: 'Receiving Yards', value: '7 REC, 96 YDS, 1 TD', name: 'Puka Nacua', id: '4426515' }] },
    { team: 'BUF', scope: 'game', categories: [
      { label: 'Passing Yards', value: '18/27, 214 YDS, 2 TD', name: 'Josh Allen', id: '3918298' },
      { label: 'Rushing Yards', value: '13 CAR, 61 YDS, 1 TD', name: 'James Cook', id: '4379399' },
      { label: 'Receiving Yards', value: '6 REC, 88 YDS, 1 TD', name: 'Khalil Shakir', id: '4373678' }] },
  ],
  injuries: [
    { team: 'LAR', list: [{ name: 'Cooper Kupp', position: 'WR', status: 'Out', detail: 'Ankle' }] },
    { team: 'BUF', list: [{ name: 'Dalton Kincaid', position: 'TE', status: 'Questionable', detail: 'Knee' }] },
  ],
  winProb: { home: 68.4, away: 31.6, live: true },
  series: '',
  lineups: [],
};

const bat = (id, name, howOut, runs, balls, fours, sixes) => ({
  id, name, howOut, notOut: howOut === 'not out', runs: String(runs), balls: String(balls), fours: String(fours), sixes: String(sixes),
  sr: balls ? (runs / balls * 100).toFixed(2) : '0',
});
const bowl = (id, name, o, m, r, w, wd = 0, nb = 0) => ({
  id, name, o: String(o), m: String(m), r: String(r), w: String(w), wd: String(wd), nb: String(nb),
  econ: (r / ((Math.floor(o) * 6 + Math.round((o % 1) * 10)) / 6)).toFixed(2),
});
const cricketGame = {
  teams: [{ abbr: 'NSW', name: 'New South Wales', color: '#5BC2E7' }, { abbr: 'TAS', name: 'Tasmania', color: '#00573F' }],
  periods: null,
  tables: [],
  innings: [
    { n: 1, team: 'TAS', teamName: 'Tasmania', ordinal: '1st', label: 'TAS 1st', score: '287/9', overs: '50', runRate: '5.74', live: false,
      batting: [
        bat('7001', 'Caleb Jewell', 'c Gilkes b Abbott', 44, 51, 6, 1), bat('7002', 'Jake Weatherald', 'c Henriques b Edwards', 12, 17, 2, 0),
        bat('7003', 'Jordan Silk', 'b Abbott', 71, 83, 6, 0), bat('7004', 'Beau Webster', 'c Patterson b Sangha', 58, 49, 4, 3),
        bat('7005', 'Mac Wright', 'run out (Konstas)', 23, 26, 2, 0), bat('7006', 'Matthew Wade', 'lbw b Sangha', 31, 22, 3, 1),
        bat('7007', 'Bradley Hope', 'c Davies b Edwards', 9, 12, 1, 0), bat('7008', 'Nathan Ellis', 'b Abbott', 11, 8, 1, 1),
        bat('6002', 'Gabe Bell', 'c Gilkes b Edwards', 6, 9, 0, 0), bat('6001', 'Riley Meredith', 'not out', 4, 5, 0, 0),
      ],
      extras: { total: 18, wd: 9, nb: 2, other: 7 },
      bowling: [
        bowl('8001', 'Sean Abbott', 10, 1, 52, 3, 3, 1), bowl('5007', 'Jack Edwards', 10, 0, 61, 3, 2, 0),
        bowl('8002', 'Chris Tremain', 10, 0, 58, 0, 2, 1), bowl('8003', 'Tanveer Sangha', 10, 0, 49, 2, 1, 0), bowl('5005', 'Moises Henriques', 10, 0, 60, 0, 1, 0),
      ],
      notBatted: ['Sam Rainbird'], notBattedLabel: 'Did not bat' },
    { n: 2, team: 'NSW', teamName: 'New South Wales', ordinal: '1st', label: 'NSW 1st', score: '198/4', overs: '36.2', runRate: '5.45', live: true,
      batting: [
        bat('5003', 'Sam Konstas', 'c Wade b Meredith', 31, 38, 4, 1), bat('5004', 'Matthew Gilkes', 'lbw b Rainbird', 18, 27, 2, 0),
        bat('5001', 'Kurtis Patterson', 'not out', 64, 71, 6, 1), bat('5005', 'Moises Henriques', 'b Meredith', 42, 48, 3, 2),
        bat('5006', 'Ollie Davies', 'c Silk b Webster', 9, 12, 1, 0), bat('5007', 'Jack Edwards', 'not out', 22, 24, 2, 1),
      ],
      extras: { total: 12, wd: 7, nb: 1, other: 4 },
      bowling: [
        bowl('6001', 'Riley Meredith', 8, 0, 41, 2, 2, 0), bowl('6002', 'Gabe Bell', 7.2, 1, 38, 0, 1, 1),
        bowl('6003', 'Sam Rainbird', 8, 0, 44, 1, 2, 0), bowl('7004', 'Beau Webster', 7, 0, 36, 1, 1, 0), bowl('7008', 'Nathan Ellis', 6, 0, 37, 0, 1, 0),
      ],
      notBatted: ['Sean Abbott', 'Chris Tremain', 'Tanveer Sangha', 'Ryan Hadley', 'Jackson Bird'], notBattedLabel: 'Yet to bat' },
  ],
  teamStats: null,
  events: [],
  players: [patterson],
  source: 'boxscore',
};

// Storm v Panthers, Round 25: tries, goals and sin bins as ESPN listed them.
const ev = (when, type, team, scorer, kind) => ({ when, type, team, scorer, kind: kind || '', assist: '', flag: '', text: '' });
const nrlTimeline = [
  ev("3'", 'try', 'PEN', "Brian To'o"), ev("5'", 'kick', 'PEN', 'Nathan Cleary', 'conversion'),
  ev("20'", 'try', 'PEN', 'Liam Henry'), ev("22'", 'kick', 'PEN', 'Nathan Cleary', 'conversion'),
  ev("24'", 'try', 'PEN', "Brian To'o"), ev("25'", 'kick', 'PEN', 'Nathan Cleary', 'conversion'),
  ev("26'", 'yellow', 'MEL', 'Oryn Keeley'), ev("30'", 'try', 'PEN', "Brian To'o"),
  ev("37'", 'yellow', 'PEN', 'Liam Martin'), ev("43'", 'yellow', 'PEN', 'Lindsay Smith'),
  ev("44'", 'try', 'MEL', 'Tyran Wishart'), ev("45'", 'kick', 'MEL', 'Nick Meaney', 'conversion'),
  ev("56'", 'try', 'MEL', 'Jack Howarth'), ev("61'", 'yellow', 'PEN', 'Jack Cogger'),
  ev("62'", 'try', 'MEL', 'Siulagi Tuimalatu-Brown'),
];

const too = player('296003', "Brian To'o", 'PEN', 'Wing', [
  g('general', 'Match', [['tries', 'Tries', 'T', '3'], ['metres', 'Run Metres', 'MR', '212'], ['runs', 'Runs', 'R', '19'], ['cleanBreaks', 'Clean Breaks', 'CB', '2'], ['tackles', 'Tackles', 'TK', '6'], ['missedTackles', 'Missed Tackles', 'MT', '1'], ['offload', 'Offloads', 'OFF', '1']]),
]);

// ---------- sample play-by-play and chart data ----------

// Deterministic "random" so the demo looks the same every time.
function seeded(seed) {
  let x = seed;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

// Overs that add up to a given total and wicket count.
function makeOvers(inn, team, count, total, wickets, seed, partial = 0) {
  const rnd = seeded(seed);
  const overs = [];
  const n = Math.ceil(count);
  const raw = Array.from({ length: n }, (_, i) => 2 + rnd() * 7 + (i > n - 10 ? 3 : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  let running = 0;
  const wk = new Set();
  while (wk.size < wickets) wk.add(1 + Math.floor(rnd() * (n - 1)));
  raw.forEach((r, i) => {
    let runs = Math.round((r / sum) * total);
    if (i === n - 1) runs = total - running;
    running += runs;
    overs.push({ inn, team, n: i + 1, runs, wickets: wk.has(i + 1) ? 1 : 0, total: running });
  });
  return overs;
}

const tasOvers = makeOvers(1, 'TAS', 50, 287, 9, 7);
const nswOvers = makeOvers(2, 'NSW', 36.33, 198, 4, 11);
const cricketCurrent = {
  inn: 2, team: 'NSW', score: '198/4', overs: '36.2', overNumber: 37,
  thisOver: ['4', '•'],
  crease: [{ id: patterson.id, name: 'Kurtis Patterson', runs: 64, balls: 71 }, { id: 'je', name: 'Jack Edwards', runs: 22, balls: 24 }],
  striker: 'je',
  bowler: { id: 'rm', name: 'Riley Meredith', overs: '8.2', maidens: 0, conceded: 45, wickets: 2 },
  runRate: '5.45', need: 90, remaining: 82, rrr: '6.59', limited: true, maxOvers: 50,
  lastWicket: 'Moises Henriques b Meredith 42',
};
const cricketBalls = [
  ['36.2', '•', 'Meredith to Edwards, no run'], ['36.1', '4', 'Meredith to Edwards, FOUR, drilled through cover'],
  ['35.6', '1', 'Ellis to Patterson, 1 run'], ['35.5', '•', 'Ellis to Patterson, no run'], ['35.4', '6', 'Ellis to Patterson, SIX, over long-on'],
  ['35.3', '1', 'Ellis to Edwards, 1 run'], ['35.2', 'wd', 'Ellis to Edwards, wide'], ['35.2', '2', 'Ellis to Edwards, 2 runs'],
  ['35.1', '•', 'Ellis to Edwards, no run'],
  ['34.6', 'W', 'Meredith to Henriques, OUT', 'Moises Henriques b Meredith 42 (48b 3x4 2x6)'], ['34.5', '1', 'Meredith to Patterson, 1 run'],
  ['34.4', '4', 'Meredith to Henriques, FOUR'], ['34.3', '•', 'Meredith to Henriques, no run'], ['34.2', '1lb', 'Meredith to Patterson, 1 leg bye'], ['34.1', '1', 'Meredith to Henriques, 1 run'],
].map(([ov, token, text, detail], i) => ({
  id: String(100 - i), inn: 2, team: 'NSW', over: Math.floor(Number(ov)) + 1, overs: ov, token, text, detail: detail || '', wicket: token === 'W',
}));
const demoCricketPlays = { kind: 'cricket', complete: true, current: cricketCurrent, overs: [...tasOvers, ...nswOvers],
  innings: [{ inn: 1, team: 'TAS' }, { inn: 2, team: 'NSW' }], recent: cricketBalls };

// NFL: win probability after each play, the lead, and recent drives.
const wpRnd = seeded(3);
const winProb = [];
let wp = 55;
for (let i = 0; i < 110; i++) {
  wp += (wpRnd() - 0.48) * 6;
  if (i === 30) wp -= 14; if (i === 62) wp += 18; if (i === 90) wp += 9;
  wp = Math.max(4, Math.min(96, wp));
  winProb.push(Math.round(wp * 10) / 10);
}
winProb[winProb.length - 1] = 68.4;
const demoNflPlays = {
  kind: 'plays', home: 'LAR', away: 'BUF', winProb, length: 3600,
  margin: [{ t: 0, d: 0 }, { t: 410, d: -3 }, { t: 860, d: 4 }, { t: 1150, d: -3 }, { t: 1520, d: 4 }, { t: 1760, d: 7 }, { t: 1795, d: 0 }, { t: 2050, d: 3 }, { t: 2290, d: 7 }],
  items: [
    { id: 'd9', header: true, team: 'LAR', text: 'In progress, 5 plays, 38 yards', scoring: false },
    { id: 'p95', when: 'Q3 8:42', down: '2nd & 4 at BUF 39', text: 'K.Williams up the middle to BUF 36 for 3 yards (T.Bernard).', team: 'LAR' },
    { id: 'p94', when: 'Q3 9:20', down: '1st & 10 at BUF 45', text: 'M.Stafford pass short right to P.Nacua to BUF 39 for 6 yards.', team: 'LAR' },
    { id: 'p93', when: 'Q3 10:02', down: '3rd & 2 at LAR 47', text: 'K.Williams right tackle to BUF 45 for 8 yards.', team: 'LAR' },
    { id: 'd8', header: true, team: 'BUF', text: 'Punt, 6 plays, 22 yards, 3:05', scoring: false },
    { id: 'p88', when: 'Q3 13:12', down: '4th & 7 at BUF 41', text: 'S.Martin punts 47 yards to LAR 12, fair catch by X.Smith.', team: 'BUF' },
    { id: 'p87', when: 'Q3 13:18', down: '3rd & 7 at BUF 41', text: 'J.Allen pass incomplete deep left to K.Shakir.', team: 'BUF' },
    { id: 'd7', header: true, team: 'LAR', text: 'Touchdown, 8 plays, 75 yards, 4:12', scoring: true },
    { id: 'p80', when: 'Q2 0:28', down: '1st & 10 at BUF 22', text: 'M.Stafford pass deep right to P.Nacua for 22 yards, TOUCHDOWN.', team: 'LAR', score: '17–24', scoring: true, tag: 'TD' },
    { id: 'p79', when: 'Q2 0:51', down: '2nd & 3 at BUF 37', text: 'K.Williams left end to BUF 22 for 15 yards.', team: 'LAR' },
  ],
};

export const DEMO_FOLLOWS = [
  {
    key: 'nfl:demo1', league: 'nfl', id: 'demo1', seenAt: now - 8_000,
    snap: {
      id: 'demo1', league: 'nfl', kind: 'match', name: 'Buffalo Bills at Los Angeles Rams',
      group: 'Monday Night Football', start: at(-95), state: 'in', detail: 'Q3 8:42',
      competitors: [
        { id: '14', name: 'Los Angeles Rams', short: 'LAR', score: '24', home: true, color: '#003594' },
        { id: '2', name: 'Buffalo Bills', short: 'BUF', score: '17', home: false, color: '#00338D' },
      ],
    },
    tracked: [
      { id: allen.id, name: allen.name, team: 'BUF', mode: 'chosen', pins: ['passing.passingYards', 'passing.passingTouchdowns'],
        targets: { 'rushing.rushingYards': { value: 25, dir: 'atLeast', label: 'Rushing yards', hit: true }, 'passing.interceptions': { value: 0, dir: 'atMost', label: 'Interceptions' } } },
      { id: nacua.id, name: nacua.name, team: 'LAR', mode: 'all', pins: [],
        targets: { 'receiving.receivingYards': { value: 100, dir: 'atLeast', label: 'Receiving yards' } } },
    ],
    stats: { [allen.id]: allen.groups, [nacua.id]: nacua.groups },
    demoPlayers: nflPlayers,
    demoGame: nflGame,
    demoForm: nflForm,
    demoHistory: { [allen.id]: allenLog, [nacua.id]: nacuaLog },
    demoPlays: demoNflPlays,
  },
  {
    key: 'cricket:demo2', league: 'cricket', id: 'demo2', seenAt: now - 15_000,
    snap: {
      id: 'demo2', league: 'cricket', kind: 'match', name: 'New South Wales v Tasmania',
      group: 'One-Day Cup', start: at(-210), state: 'in', detail: 'NSW need 90 runs from 82 balls',
      competitors: [
        { id: 'nsw', name: 'New South Wales', short: 'NSW', score: '198/4 (36.2 ov)', home: true, color: '#5BC2E7' },
        { id: 'tas', name: 'Tasmania', short: 'TAS', score: '287/9 (50 ov)', home: false, color: '#00573F' },
      ],
    },
    tracked: [{ id: patterson.id, name: patterson.name, team: 'NSW', mode: 'chosen', pins: [],
      targets: { 'batting.runs': { value: 50, dir: 'atLeast', label: 'Runs', hit: true } } }],
    stats: { [patterson.id]: patterson.groups },
    demoPlayers: [patterson],
    demoGame: cricketGame,
    demoPlays: demoCricketPlays,
    live: cricketCurrent,
  },
  {
    key: 'f1:demo3', league: 'f1', id: 'demo3', seenAt: now - 5_000, focus: '5752', focusName: 'Oscar Piastri',
    snap: {
      id: 'demo3', league: 'f1', kind: 'field', name: 'United States GP · Qual', group: 'United States Grand Prix',
      start: at(-20), state: 'in', detail: 'Q2',
      competitors: [
        { id: '5579', name: 'Lando Norris', pos: '1', score: null },
        { id: '5752', name: 'Oscar Piastri', pos: '2', score: null },
        { id: '4665', name: 'Max Verstappen', pos: '3', score: null },
        { id: '5498', name: 'Charles Leclerc', pos: '4', score: null },
      ],
    },
  },
  {
    key: 'epl:demo4', league: 'epl', id: 'demo4',
    snap: {
      id: 'demo4', league: 'epl', kind: 'match', name: 'Arsenal v Chelsea', group: 'Premier League',
      start: at(60 * 26 + 40), state: 'pre', detail: '',
      competitors: [
        { id: '359', name: 'Arsenal', short: 'ARS', score: null, home: true, color: '#EF0107' },
        { id: '363', name: 'Chelsea', short: 'CHE', score: null, home: false, color: '#034694' },
      ],
    },
  },
  {
    key: 'nrl:demo5', league: 'nrl', id: 'demo5', seenAt: now - 3 * 3_600_000, finalStats: true,
    snap: {
      id: 'demo5', league: 'nrl', kind: 'match', name: 'Storm vs Panthers', group: 'Round 25',
      start: at(-60 * 5), state: 'post', detail: 'Final',
      competitors: [
        { id: '289208', name: 'Storm', short: 'MEL', score: '14', home: true, winner: false, color: '#632390' },
        { id: '289199', name: 'Panthers', short: 'PEN', score: '22', home: false, winner: true, color: '#231F20' },
      ],
      timeline: nrlTimeline,
    },
    tracked: [{ id: too.id, name: too.name, team: 'PEN', pins: ['general.tries', 'general.metres', 'general.cleanBreaks'] }],
    stats: { [too.id]: too.groups },
    demoPlayers: [too],
    demoForm: [
      { id: '289208', abbr: 'MEL', name: 'Storm', record: '15-10', results: [
        res(0.2, true, 'PEN', 'Panthers', 14, 22), res(7, false, 'SYD', 'Roosters', 30, 18), res(14, true, 'CRO', 'Sharks', 24, 26),
        res(21, false, 'BRI', 'Broncos', 36, 12), res(28, true, 'NQL', 'Cowboys', 22, 20)], next: null },
      { id: '289199', abbr: 'PEN', name: 'Panthers', record: '17-8', results: [
        res(0.2, false, 'MEL', 'Storm', 22, 14), res(7, true, 'CAN', 'Raiders', 28, 10), res(14, false, 'PAR', 'Eels', 18, 20),
        res(21, true, 'MAN', 'Sea Eagles', 32, 6), res(28, false, 'WST', 'Wests Tigers', 26, 16)], next: null },
    ],
    demoGame: {
      teams: [{ abbr: 'MEL', name: 'Storm', color: '#632390' }, { abbr: 'PEN', name: 'Panthers', color: '#231F20' }],
      periods: { labels: ['1st', '2nd'], rows: [{ abbr: 'MEL', values: ['0', '14'], total: '14' }, { abbr: 'PEN', values: ['22', '0'], total: '22' }] },
      tables: [], innings: [],
      teamStats: { teams: ['MEL', 'PEN'], rows: [
        { label: 'Run metres', values: ['1277', '1198'] }, { label: 'Tackles', values: ['321', '378'] },
        { label: 'Missed tackles', values: ['30', '40'] }, { label: 'Clean breaks', values: ['5', '5'] },
        { label: 'Offloads', values: ['19', '8'] }, { label: 'Handling errors', values: ['10', '9'] },
        { label: 'Penalties conceded', values: ['4', '10'] },
      ] },
      events: [], players: [too], source: 'boxscore',
    },
  },
];
