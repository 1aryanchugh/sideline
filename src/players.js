// Per-player stats from ESPN game summaries.
//
// ESPN uses several different shapes depending on the sport, so this reads
// all of them into one list and shows every stat the feed provides, instead
// of hard-coding a stat list per sport:
//
//   A. NFL / NBA   boxscore.players[t].statistics[g] = { name, labels[], descriptions[], keys[],
//                                                       athletes[{ athlete, stats: ["9/10", "52", ...] }] }
//   B. NRL         boxscore.players[t].statistics[g].athletes[k].statistics[0].stats[{ name, displayName, displayValue }]
//   C. Cricket     rosters[t].roster[k].statistics.categories[c].stats[{ name, displayValue }]
//   D. Soccer      rosters[t].roster[k].stats[{ name, displayName, displayValue }]
//
// Output:
//   { id, name, team, position, groups: [{ group, label, stats: [{ key, label, abbr, value }] }] }

const GROUP_LABELS = {
  passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', fumbles: 'Fumbles',
  defensive: 'Defence', interceptions: 'Interceptions', kickReturns: 'Kick returns',
  puntReturns: 'Punt returns', kicking: 'Kicking', punting: 'Punting',
  batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding', general: 'Match',
};

// Bookkeeping fields in ESPN's cricket data that aren't statistics.
const SKIP = new Set(['battingPosition', 'bowlingPosition', 'inningsNumber', 'batted', 'dismissalCard', 'order', 'bpo']);

// ESPN's cricket stats arrive without display names, so name them here.
const CRICKET_LABELS = {
  runs: ['Runs', 'R'], ballsFaced: ['Balls faced', 'B'], fours: ['Fours', '4s'], sixes: ['Sixes', '6s'],
  strikeRate: ['Strike rate', 'SR'], minutes: ['Minutes batted', 'Min'],
  overs: ['Overs', 'O'], maidens: ['Maidens', 'M'], conceded: ['Runs conceded', 'R'], wickets: ['Wickets', 'W'],
  economyRate: ['Economy', 'Econ'], dots: ['Dot balls', 'Dots'], wides: ['Wides', 'Wd'], noballs: ['No balls', 'Nb'],
  caught: ['Catches', 'Ct'], caughtKeeper: ['Catches as keeper', 'Ct (wk)'], stumped: ['Stumpings', 'St'],
};

// ESPN's position codes, made readable. Cricket uses its own short codes,
// and unknown roles ("UKN", "NA") are dropped rather than shown.
const ROLE_NAMES = {
  WK: 'Wicketkeeper', WKB: 'Wicketkeeper', 'WK-BAT': 'Wicketkeeper', KEEPER: 'Wicketkeeper',
  BT: 'Batter', BAT: 'Batter', BATTER: 'Batter', BATSMAN: 'Batter',
  BL: 'Bowler', BOWL: 'Bowler', BOWLER: 'Bowler',
  AR: 'All-rounder', ALLROUNDER: 'All-rounder', 'ALL-ROUNDER': 'All-rounder',
};
const NO_ROLE = new Set(['UKN', 'UNK', 'UNKNOWN', 'NA', 'N/A', '-', '--', '?']);

export function positionName(pos) {
  const raw = (typeof pos === 'string' ? pos : pos?.abbreviation || pos?.displayName || pos?.name || '').trim();
  if (!raw || NO_ROLE.has(raw.toUpperCase())) return '';
  return ROLE_NAMES[raw.toUpperCase()] || raw;
}

function humanize(name) {
  return String(name)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function statFromObject(s) {
  if (!s || s.name == null || SKIP.has(s.name)) return null;
  const value = s.displayValue ?? (s.value != null ? String(s.value) : null);
  if (value == null || value === '') return null;
  return {
    key: s.name,
    label: s.displayName || s.description || humanize(s.name),
    abbr: s.abbreviation || s.shortDisplayName || s.displayName || humanize(s.name),
    value: String(value),
  };
}

class Collector {
  constructor() { this.byId = new Map(); }

  player(athlete, team) {
    const id = String(athlete?.id ?? athlete?.displayName ?? '');
    if (!id) return null;
    if (!this.byId.has(id)) {
      this.byId.set(id, {
        id,
        name: athlete.displayName || athlete.fullName || 'Unknown',
        team: team?.abbreviation || team?.shortDisplayName || team?.displayName || '',
        position: positionName(athlete.position),
        groups: [],
      });
    }
    return this.byId.get(id);
  }

  add(player, group, stats, label) {
    const clean = stats.filter(Boolean);
    if (!player || !clean.length) return;
    let g = player.groups.find((x) => x.group === group);
    if (!g) {
      g = { group, label: label || GROUP_LABELS[group] || humanize(group || 'Stats'), stats: [] };
      player.groups.push(g);
    }
    for (const s of clean) {
      const key = `${group}.${s.key}`;
      if (!g.stats.some((x) => x.key === key)) g.stats.push({ ...s, key });
    }
    return g;
  }

  list() { return [...this.byId.values()]; }
}

// Shapes A and B: boxscore.players
function fromBoxscore(players, out) {
  for (const teamBlock of players || []) {
    for (const grp of teamBlock.statistics || []) {
      const groupName = grp.name || 'general';
      for (const a of grp.athletes || []) {
        const p = out.player(a.athlete, teamBlock.team);
        if (p && typeof a.starter === 'boolean') p.starter = a.starter; // NBA: starters vs bench
        if (Array.isArray(a.stats) && a.stats.length && typeof a.stats[0] !== 'object') {
          // Shape A: parallel string arrays.
          const stats = a.stats.map((value, i) => {
            const abbr = grp.labels?.[i] || grp.keys?.[i] || `Stat ${i + 1}`;
            if (value == null || value === '' || value === '--') return null;
            return { key: grp.keys?.[i] || abbr, label: grp.descriptions?.[i] || abbr, abbr, value: String(value) };
          });
          out.add(p, groupName, stats);
        } else {
          // Shape B: nested stat objects.
          const objs = [
            ...(Array.isArray(a.stats) ? a.stats : []),
            ...(a.statistics || []).flatMap((s) => s.stats || []),
          ];
          out.add(p, groupName, objs.map(statFromObject));
        }
      }
    }
  }
}

// Shapes C and D: rosters
function fromRosters(rosters, league, out) {
  // Cricket: which match innings each side batted in, so labels can say
  // "2nd innings" for a team's second innings (match innings 3 or 4).
  const ord = new Map();
  if (league === 'cricket') {
    for (const tb of rosters || []) {
      const periods = new Set();
      for (const e of tb.roster || []) for (const x of inningsOf(e)) if (batted(x)) periods.add(x.period);
      ord.set(tb, new Map([...periods].sort((a, b) => a - b).map((pd, i) => [pd, i + 1])));
    }
  }
  // Everyone in the match, so dismissals that only carry an id still get a name.
  const names = new Map();
  for (const tb of rosters || []) {
    for (const e of tb.roster || []) {
      const a = e.athlete || {};
      if (a.id != null && (a.displayName || a.fullName)) names.set(String(a.id), a.displayName || a.fullName);
    }
  }
  for (const teamBlock of rosters || []) {
    for (const entry of teamBlock.roster || []) {
      const athlete = { ...entry.athlete, position: entry.position || entry.athlete?.position };
      const p = out.player(athlete, teamBlock.team);
      if (league === 'cricket') {
        const other = (rosters || []).find((tb) => tb !== teamBlock);
        fromCricketInnings(entry, p, out, {
          opp: other?.team?.abbreviation || '',
          ownOrd: ord.get(teamBlock),
          oppOrd: ord.get(other),
          names,
        });
        continue;
      }
      const objs = [
        ...(Array.isArray(entry.stats) ? entry.stats : []),
        ...(entry.statistics?.categories || []).flatMap((c) => c.stats || []),
        ...(Array.isArray(entry.statistics) ? entry.statistics.flatMap((s) => s.stats || []) : []),
      ];
      out.add(p, 'general', objs.map(statFromObject));
    }
  }
}

// Cricket: a player's entry carries their career/season totals at the top
// level (not this match), and this match's figures per innings under
// linescores[j].linescores[0]. Only the per-innings figures are used, newest
// innings first, each split into batting / bowling / fielding.
const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];
const BAT = ['runs', 'ballsFaced', 'fours', 'sixes', 'strikeRate', 'minutes'];
const BOWL = ['overs', 'maidens', 'conceded', 'wickets', 'economyRate', 'dots', 'wides', 'noballs'];
const FIELD = ['caught', 'caughtKeeper', 'stumped'];

function inningsOf(entry) {
  return (entry.linescores || [])
    .map((ls) => ({ period: Number(ls.period) || 0, inner: ls.linescores?.[0] }))
    .filter((x) => x.inner)
    .map((x) => {
      const raw = {};
      for (const c of x.inner.statistics?.categories || []) {
        for (const s of c.stats || []) if (s?.name) raw[s.name] = s;
      }
      return { ...x, raw, num: (k) => Number(raw[k]?.value ?? raw[k]?.displayValue) || 0 };
    });
}

// The dismissal as a scorecard reads it: "c Verreynne b Mulder", "lbw b Jansen".
// ESPN usually sends this text; when it doesn't, build it from the parts.
// `names` maps athlete id -> name for when ESPN only sends the bowler's or
// fielder's id (or a $ref link) instead of their name.
export function dismissalText(inner, raw = {}, names) {
  return buildDismissal(inner, raw, names).replace(/\s+/g, ' ').trim();
}

function personName(x, names) {
  if (!x) return '';
  const a = x.athlete || x;
  const direct = a.displayName || a.fullName || a.name || a.shortName || x.displayName || x.shortName
    || [a.firstName, a.lastName].filter(Boolean).join(' ');
  if (direct) return String(direct);
  const id = a.id ?? x.id ?? /athletes\/(\d+)/.exec(a.$ref || x.$ref || '')?.[1];
  return (id != null && names?.get(String(id))) || '';
}

function buildDismissal(inner, raw, names) {
  const od = inner?.batting?.outDetails || inner?.outDetails || {};
  const text = od.shortText || od.text || od.details?.shortText || od.dismissalText?.short;
  if (text) return String(text).trim();
  const bowler = personName(od.bowler, names);
  const fielder = personName((od.fielders || [])[0], names);
  const card = String(od.dismissalCard || raw.dismissalCard?.displayValue || '').toLowerCase().trim();
  if (!card) return '';
  // Without names, say how they got out rather than printing a half-sentence like "c & b".
  if (card === 'c' || card === 'caught') {
    if (!bowler) return fielder ? `c ${fielder}` : 'caught';
    return fielder && fielder !== bowler ? `c ${fielder} b ${bowler}` : `c & b ${bowler}`;
  }
  if (card === 'b' || card === 'bowled') return bowler ? `b ${bowler}` : 'bowled';
  if (card === 'lbw') return bowler ? `lbw b ${bowler}` : 'lbw';
  if (card === 'st' || card === 'stumped') return bowler ? `st ${fielder || ''} b ${bowler}` : 'stumped';
  if (card === 'ro' || card.startsWith('run')) return fielder ? `run out (${fielder})` : 'run out';
  if (card === 'hw' || card.startsWith('hit')) return bowler ? `hit wicket b ${bowler}` : 'hit wicket';
  return [card, bowler && `b ${bowler}`].filter(Boolean).join(' ');
}

// Strike rate and economy worked out from the figures, rounded properly
// (ESPN's own values are sometimes cut off: 2 off 12 shows as 16.66).
function oversToBalls(o) {
  const [whole, part = '0'] = String(o).split('.');
  return Number(whole) * 6 + Number(part);
}
function fixRates(stats) {
  const val = (k) => stats.find((s) => s?.key === k)?.value;
  const runs = Number(val('runs')), balls = Number(val('ballsFaced'));
  const conceded = Number(val('conceded')), overBalls = val('overs') != null ? oversToBalls(val('overs')) : NaN;
  for (const s of stats) {
    if (!s) continue;
    if (s.key === 'strikeRate' && Number.isFinite(runs) && balls > 0) s.value = (runs / balls * 100).toFixed(2);
    if (s.key === 'economyRate' && Number.isFinite(conceded) && overBalls > 0) s.value = (conceded / (overBalls / 6)).toFixed(2);
  }
  return stats;
}

function batted(x) {
  return x.num('ballsFaced') > 0 || x.num('batted') > 0 || x.num('outs') > 0 || !!dismissalText(x.inner, x.raw);
}

// ctx: { opp, ownOrd: Map(period -> 1|2), oppOrd } so labels read
// "Batting, 2nd innings" and "Bowling, SA 1st innings" rather than match innings numbers.
function fromCricketInnings(entry, p, out, ctx = {}) {
  const innings = inningsOf(entry).sort((a, b) => b.period - a.period);
  for (const x of innings) {
    const { period, inner, raw, num } = x;
    const pick = (keys) => keys.map((k) => {
      const s = raw[k] && statFromObject(raw[k]);
      if (s && CRICKET_LABELS[k]) [s.label, s.abbr] = CRICKET_LABELS[k];
      return s;
    });
    const own = ORDINAL[ctx.ownOrd?.get(period)] || ORDINAL[period] || '';
    const opp = [ctx.opp, ORDINAL[ctx.oppOrd?.get(period)] || ORDINAL[period] || ''].filter(Boolean).join(' ');

    if (batted(x)) {
      const text = dismissalText(inner, raw, ctx.names);
      // `outs` is the reliable signal; the text can be missing.
      const isOut = num('outs') > 0 || (num('notouts') === 0 && !!text && !/not out/i.test(text));
      const stats = fixRates(pick(BAT));
      stats.push({ key: 'howOut', label: 'How out', abbr: 'Out', value: isOut ? (text || 'out') : 'not out' });
      const g = out.add(p, `inn${period}-batting`, stats, `Batting, ${own} innings`);
      if (g) g.order = num('battingPosition') || Number(inner.order) || 99; // for the scorecard
    }
    if (num('overs') > 0 || num('balls') > 0) {
      const g = out.add(p, `inn${period}-bowling`, fixRates(pick(BOWL)), `Bowling, ${opp} innings`);
      if (g) g.order = num('bowlingPosition') || 99;
    }
    if (FIELD.some((k) => num(k) > 0)) {
      out.add(p, `inn${period}-fielding`, pick(FIELD).filter((s) => s && Number(s.value) > 0), `Fielding, ${opp} innings`);
    }
  }
  // Players in the XI who haven't batted or bowled yet still appear, so they
  // can be tracked before they come in.
  if (!p.groups.length) p.inXI = true;
}

export function extractPlayers(summary, league) {
  const out = new Collector();
  fromBoxscore(summary?.boxscore?.players, out);
  if (!out.byId.size) fromRosters(summary?.rosters, league, out);
  return out.list()
    .filter((p) => p.groups.length || p.inXI)
    .map(({ inXI, ...p }) => p);
}

// Before a game starts there's no box score yet. Team rosters let people pick
// players in advance; ids match the box score that appears at kick-off.
export function rosterToPlayers(json, team) {
  const raw = json?.athletes || [];
  const flat = raw.flatMap((x) => (Array.isArray(x.items) ? x.items : [x]));
  return flat
    .filter((a) => a && a.id)
    .map((a) => ({
      id: String(a.id),
      name: a.displayName || a.fullName || 'Unknown',
      team: team?.abbreviation || json?.team?.abbreviation || '',
      position: positionName(a.position),
      groups: [],
    }));
}

// Team ids from a summary's header, for the roster fallback.
export function teamsFromSummary(summary) {
  return (summary?.header?.competitions?.[0]?.competitors || [])
    .map((c) => ({ id: String(c.team?.id ?? c.id ?? ''), abbreviation: c.team?.abbreviation }))
    .filter((t) => t.id);
}
