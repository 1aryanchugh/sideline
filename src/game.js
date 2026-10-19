// Full game detail from an ESPN summary: box score tables, team stats,
// scores by period, and scoring plays / key events. Every section is
// optional; each sport fills in whatever ESPN publishes for it.
//
// Output:
// {
//   teams:     [{ id, abbr, name, color }],
//   periods:   { labels: ['Q1', ...], rows: [{ abbr, values: [], total }] } | null,
//   tables:    [{ title, team, kind, columns: [{ key, abbr, label }], rows: [{ id, name, values: [] }] }],
//   teamStats: { teams: [abbrA, abbrB], rows: [{ label, values: [a, b] }] } | null,
//   events:    [{ when, team, text, score, kind }],
//   players:   [...extractPlayers output]
// }

import { extractPlayers } from './players.js';

const hex = (v) => (v && /^[0-9a-f]{6}$/i.test(v) ? `#${v}` : null);

function humanize(name) {
  return String(name).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

function headerTeams(summary) {
  const comps = summary?.header?.competitions?.[0]?.competitors || [];
  return comps
    .slice()
    .sort((a, b) => (a.homeAway === 'home' ? -1 : 1) - (b.homeAway === 'home' ? -1 : 1))
    .map((c) => ({
      id: String(c.team?.id ?? c.id ?? ''),
      abbr: c.team?.abbreviation || c.team?.shortDisplayName || '',
      name: c.team?.displayName || c.team?.name || '',
      color: hex(c.team?.color),
      linescores: c.linescores || [],
      score: c.score,
    }));
}

const PERIOD_LABELS = {
  nfl: (i) => (i < 4 ? `Q${i + 1}` : 'OT'),
  nba: (i) => (i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`),
  nrl: (i) => (i < 2 ? ['1st', '2nd'][i] : 'GP'),
  epl: (i) => (i < 2 ? ['1st', '2nd'][i] : `ET${i - 1}`),
};

function periods(teams, league) {
  const label = PERIOD_LABELS[league];
  if (!label) return null; // cricket's linescores are innings; shown in the scorecard instead
  const count = Math.max(0, ...teams.map((t) => t.linescores.length));
  if (!count) return null;
  return {
    labels: Array.from({ length: count }, (_, i) => label(i)),
    rows: teams.map((t) => ({
      abbr: t.abbr,
      values: Array.from({ length: count }, (_, i) => {
        const l = t.linescores[i];
        return l ? String(l.displayValue ?? l.value ?? '') : '';
      }),
      total: t.score != null ? String(t.score) : '',
    })),
  };
}

// Team stats come flat ({ name, label, displayValue }) for NFL/NBA/soccer, or
// nested ({ name: 'general', stats: [...] }) for NRL.
function teamStats(summary, teams) {
  const blocks = summary?.boxscore?.teams || [];
  if (blocks.length < 2) return null;
  const order = teams.map((t) => t.id);
  const sorted = blocks.slice().sort((a, b) => order.indexOf(String(a.team?.id)) - order.indexOf(String(b.team?.id)));
  const byName = new Map();
  sorted.forEach((block, side) => {
    const list = (block.statistics || []).flatMap((s) => (Array.isArray(s.stats) ? s.stats : [s]));
    for (const s of list) {
      if (!s?.name) continue;
      const value = s.displayValue ?? (s.value != null ? String(s.value) : null);
      if (value == null) continue;
      if (!byName.has(s.name)) byName.set(s.name, { label: s.label || s.displayName || humanize(s.name), values: ['', ''] });
      byName.get(s.name).values[side] = String(value);
    }
  });
  // Drop rows that are empty or zero for both sides (ESPN pads rugby league
  // with rugby union stats like lineouts and mauls).
  const isZero = (v) => v === '' || /^-?0+(\.0+)?%?$/.test(v) || v === '-' || v === '0-0';
  const rows = [...byName.values()].filter((r) => !(isZero(r.values[0]) && isZero(r.values[1])));
  if (!rows.length) return null;
  return { teams: sorted.map((b) => b.team?.abbreviation || ''), rows };
}

// Scoring plays (NFL/NBA), key events (soccer) or match details (NRL), mapped
// to { when, team, type, kind, text, scorer, assist, flag, score }.
// type: 'goal' | 'try' | 'kick' | 'yellow' | 'red' | 'score' | 'other'
export function classify(text = '', d = {}) {
  const t = String(text).toLowerCase();
  if (d.redCard || /red card/.test(t)) return 'red';
  if (d.yellowCard || /yellow card|sin bin/.test(t)) return 'yellow';
  if (/^try|\btry\b/.test(t)) return 'try';
  if (/conversion|penalty goal|drop goal|field goal/.test(t)) return 'kick';
  if (/goal|penalty - scored|own goal/.test(t) || d.scoringPlay) return 'goal';
  if (/substitut|kickoff|half|start|end|begins|ends/.test(t)) return 'skip';
  return 'other';
}

function events(summary, league, teams) {
  const abbrFor = (team) => {
    if (!team) return '';
    if (team.abbreviation) return team.abbreviation;
    const byId = teams.find((t) => t.id && String(t.id) === String(team.id));
    const byName = teams.find((t) => t.name && t.name === team.displayName);
    return (byId || byName)?.abbr || team.displayName || '';
  };
  const periodLabel = (period) => (PERIOD_LABELS[league] && period ? PERIOD_LABELS[league](Number(period) - 1) : '');

  // NFL / NBA: scoring plays with a running score.
  if (summary?.scoringPlays?.length) {
    return summary.scoringPlays.map((p) => ({
      when: [periodLabel(p.period?.number ?? p.period), p.clock?.displayValue].filter(Boolean).join(' '),
      team: abbrFor(p.team),
      type: 'score',
      kind: p.scoringType?.displayName || p.type?.text || '',
      text: p.text || '',
      score: p.awayScore != null && p.homeScore != null ? `${p.homeScore}–${p.awayScore}` : '',
    })).filter((e) => e.text);
  }

  // Soccer key events carry participants: scorer first, then the assist.
  const key = (summary?.keyEvents || []).map((e) => {
    const type = classify(e.type?.text, e);
    const people = (e.participants || []).map((x) => x.athlete?.displayName).filter(Boolean);
    const assistText = /assisted by ([^.]+)/i.exec(e.text || '')?.[1];
    const tt = (e.type?.text || '').toLowerCase();
    return {
      when: e.clock?.displayValue || periodLabel(e.period?.number),
      team: abbrFor(e.team),
      type,
      kind: e.type?.text || '',
      text: e.text || e.shortText || '',
      scorer: people[0] || '',
      assist: type === 'goal' ? (people[1] || assistText || '') : '',
      flag: /own goal/.test(tt) ? 'OG' : /penalty/.test(tt) && type === 'goal' ? 'Pen' : '',
    };
  });
  if (key.some((e) => e.type !== 'skip' && e.type !== 'other')) return key.filter((e) => e.type !== 'skip' && e.type !== 'other');

  // Match details (NRL tries and goals, soccer goals and cards without assists).
  const details = summary?.header?.competitions?.[0]?.details || [];
  return details.map((d) => detailEvent(d, abbrFor)).filter((e) => e.type !== 'skip' && e.type !== 'other');
}

export function detailEvent(d, abbrFor = (t) => t?.abbreviation || '') {
  const type = classify(d.type?.text, d);
  const people = (d.athletesInvolved || []).map((a) => a.displayName || a.shortName).filter(Boolean);
  return {
    when: d.clock?.displayValue || '',
    team: abbrFor(d.team),
    teamId: d.team?.id != null ? String(d.team.id) : '',
    type,
    kind: d.type?.text || '',
    text: '',
    scorer: people[0] || '',
    assist: '',
    flag: d.ownGoal ? 'OG' : d.penaltyKick && type === 'goal' ? 'Pen' : '',
  };
}

// Box score tables built from the players, one per team and stat group.
function tablesFromPlayers(players, teams, league, summary) {
  if (league === 'cricket') return [];
  const tables = new Map();
  const teamOrder = teams.map((t) => t.abbr);
  for (const p of players) {
    for (const g of p.groups) {
      const id = `${p.team}|${g.group}`;
      if (!tables.has(id)) {
        tables.set(id, { title: g.label === 'Match' || g.label === 'Stats' ? 'Players' : g.label, team: p.team, kind: g.group, columns: [], rows: [] });
      }
      const t = tables.get(id);
      for (const s of g.stats) {
        if (!t.columns.some((c) => c.key === s.key)) t.columns.push({ key: s.key, abbr: s.abbr, label: s.label });
      }
      t.rows.push({ id: p.id, name: p.name, starter: p.starter, stats: Object.fromEntries(g.stats.map((s) => [s.key, s.value])) });
    }
  }
  // Team totals row, where ESPN supplies one (NFL, NBA).
  const totalsFor = (team, group) => {
    const block = (summary?.boxscore?.players || []).find((b) => (b.team?.abbreviation || '') === team);
    const grp = (block?.statistics || []).find((x) => (x.name || 'general') === group);
    if (!Array.isArray(grp?.totals) || !grp.totals.some((v) => v !== '' && v != null)) return null;
    const keys = grp.keys || grp.labels || [];
    return (col) => {
      const i = keys.indexOf(col.key.split('.').slice(1).join('.'));
      return i >= 0 ? String(grp.totals[i] ?? '') : '';
    };
  };
  return [...tables.values()]
    .map((t) => {
      // Starters first, then the bench, keeping ESPN's order within each.
      const hasStarters = t.rows.some((r) => r.starter === true) && t.rows.some((r) => r.starter === false);
      const rows = hasStarters ? [...t.rows.filter((r) => r.starter), ...t.rows.filter((r) => !r.starter)] : t.rows;
      const total = totalsFor(t.team, t.kind);
      return {
        ...t,
        rows: rows.map((r) => ({
          id: r.id, name: r.name, values: t.columns.map((c) => r.stats[c.key] ?? ''),
          ...(hasStarters ? { bench: !r.starter } : {}),
        })),
        totals: total ? t.columns.map(total) : null,
      };
    })
    .sort((a, b) => teamOrder.indexOf(a.team) - teamOrder.indexOf(b.team));
}

// Cricket: a structured scorecard per innings, labelled by team ("AUS 1st").
// Batting and bowling come from the players; innings totals (runs, wickets,
// overs) from ESPN's live feed, passed in as ctx.teams.
const ORD = ['', '1st', '2nd', '3rd', '4th'];

function ballsOf(overs) {
  const [o, b] = String(overs ?? '0').split('.');
  return (Number(o) || 0) * 6 + (Number(b) || 0);
}
function oversOf(balls) {
  return `${Math.floor(balls / 6)}${balls % 6 ? `.${balls % 6}` : ''}`;
}
const n = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;

function cricketInnings(players, teams, state) {
  const byInn = new Map();
  const teamOf = new Map(players.map((p) => [p.id, p.team]));
  for (const p of players) {
    for (const g of p.groups) {
      const m = /^inn(\d+)-(batting|bowling)$/.exec(g.group);
      if (!m) continue;
      const num = Number(m[1]);
      if (!byInn.has(num)) byInn.set(num, { n: num, team: null, bowlTeam: null, bat: [], bowl: [] });
      const inn = byInn.get(num);
      const v = Object.fromEntries(g.stats.map((s) => [s.key.split('.').pop(), s.value]));
      if (m[2] === 'batting') {
        inn.team = p.team;
        inn.bat.push({
          id: p.id, name: p.name, order: g.order ?? 99,
          howOut: v.howOut || 'not out', notOut: !v.howOut || v.howOut === 'not out',
          runs: v.runs ?? '', balls: v.ballsFaced ?? '', fours: v.fours ?? '', sixes: v.sixes ?? '', sr: v.strikeRate ?? '',
        });
      } else {
        inn.bowlTeam = p.team;
        inn.bowl.push({
          id: p.id, name: p.name, order: g.order ?? 99,
          o: v.overs ?? '', m: v.maidens ?? '', r: v.conceded ?? '', w: v.wickets ?? '',
          econ: v.economyRate ?? '', wd: v.wides ?? '0', nb: v.noballs ?? '0',
        });
      }
    }
  }

  const abbrs = teams.map((t) => t.abbr);
  const counts = {};
  const out = [];
  for (const num of [...byInn.keys()].sort((a, b) => a - b)) {
    const inn = byInn.get(num);
    // Each side has one entry per match innings; the batting side's is
    // flagged isBatting. Fall back to the side whose players batted.
    const byFlag = teams.find((t) => (t.innings || []).some((l) => l.period === num && l.isBatting));
    const team = byFlag?.abbr || inn.team || abbrs.find((a) => a && a !== inn.bowlTeam) || '';
    const k = (counts[team] = (counts[team] || 0) + 1);
    const t = teams.find((x) => x.abbr === team) || { abbr: team, name: team, innings: [], score: '' };
    const line = (t.innings || []).find((l) => l.period === num)
      || (t.innings || []).filter((l) => l.isBatting || n(l.runs) > 0).sort((a, b) => a.period - b.period)[k - 1];
    const scorePart = String(t.score || '').split('&')[k - 1] || '';

    const bat = inn.bat.sort((a, b) => a.order - b.order);
    const bowl = inn.bowl.sort((a, b) => a.order - b.order);
    const batRuns = bat.reduce((s, b) => s + n(b.runs), 0);
    const bowlBalls = bowl.reduce((s, b) => s + ballsOf(b.o), 0);
    const outs = bat.filter((b) => !b.notOut).length;

    const runs = line?.runs != null ? n(line.runs) : batRuns + 0;
    const wickets = line?.wickets != null ? n(line.wickets) : outs;
    const balls = line?.overs != null ? ballsOf(line.overs) : bowlBalls;
    const declared = /declared/i.test(line?.description || '') || /\d\s*d\b|dec/i.test(scorePart);
    const live = state === 'in' && !!line?.isCurrent;

    const wd = bowl.reduce((s, b) => s + n(b.wd), 0);
    const nb = bowl.reduce((s, b) => s + n(b.nb), 0);
    const total = line?.runs != null ? Math.max(0, runs - batRuns) : wd + nb;
    const other = Math.max(0, total - wd - nb); // byes + leg byes (not split in the feed)

    const battedIds = new Set(bat.map((b) => b.id));
    const squad = players.filter((p) => teamOf.get(p.id) === team && !battedIds.has(p.id)).map((p) => p.name);

    out.push({
      n: num,
      team,
      teamName: t.name || team,
      ordinal: ORD[k] || `${k}th`,
      label: `${team} ${ORD[k] || `${k}th`}`,
      score: wickets >= 10 ? `${runs}` : `${runs}/${wickets}${declared ? 'd' : ''}`,
      overs: balls ? oversOf(balls) : '',
      runRate: balls ? (runs / (balls / 6)).toFixed(2) : '',
      live,
      batting: bat,
      extras: { total, wd, nb, other },
      bowling: bowl,
      // Before or during an innings these batters are "yet to bat"; after it, "did not bat".
      notBatted: wickets >= 10 ? [] : squad,
      notBattedLabel: live ? 'Yet to bat' : 'Did not bat',
    });
  }
  return out;
}

// ---------- extra game detail ----------

const nameOf = (x) => x?.displayName || x?.fullName || x?.shortName || x?.name || '';

// Venue, attendance, officials, broadcasts, weather and notes (toss, result).
function gameInfo(summary) {
  const gi = summary?.gameInfo || {};
  const venue = gi.venue || summary?.header?.competitions?.[0]?.venue || {};
  const addr = venue.address || {};
  const officials = (gi.officials || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((o) => ({ name: nameOf(o), role: o.position?.displayName || o.position?.name || '' }))
    .filter((o) => o.name);
  const broadcasts = [...new Set((summary?.broadcasts || [])
    .map((b) => b.media?.shortName || b.media?.name || b.names?.[0] || '')
    .filter(Boolean))];

  // Weather only when ESPN gives real values (it sometimes sends blanks).
  const w = gi.weather || {};
  const temp = Number(w.temperature);
  const rain = Number(w.precipitation);
  const weather = [
    String(w.displayValue || '').trim(),
    w.temperature !== '' && w.temperature != null && Number.isFinite(temp) ? `${temp}°` : '',
    Number.isFinite(rain) && rain > 0 ? `${rain}% chance of rain` : '',
  ].filter(Boolean).join(', ');

  // "Kingsmead, Durban" + "Durban, South Africa" -> "Kingsmead, Durban, South Africa".
  const name = venue.fullName || venue.name || '';
  const place = [];
  for (const part of [...name.split(','), addr.city, addr.state || addr.country]) {
    const p = String(part || '').trim();
    if (p && !place.some((x) => x.toLowerCase() === p.toLowerCase())) place.push(p);
  }

  // Cricket notes are a running log (reviews, drinks, milestones). Keep only
  // the toss and the hours of play.
  const texts = (summary?.notes || [])
    .map((n) => (typeof n === 'string' ? n : n?.text || n?.headline || ''))
    .map((t) => String(t).replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const toss = texts.find((t) => /elected to (bat|bowl|field)|won the toss/i.test(t)) || '';
  const hours = texts.find((t) => /\bstart\b.*\b(lunch|tea|close|interval)\b/i.test(t)) || '';

  const info = {
    venue: place.join(', '),
    capacity: venue.capacity || null,
    attendance: gi.attendance || null,
    officials, broadcasts, weather, toss, hours,
  };
  const any = info.venue || info.attendance || officials.length || broadcasts.length || weather || toss || hours;
  return any ? info : null;
}

// Before kick-off ESPN fills "leaders" with season totals
// ("99/162, 1,189 YDS, 6 TD, 6 INT"). Turn that into per-game averages:
// "61.1% completions, 237.8 yds, 1.2 TD, 1.2 INT".
const UNIT = { YDS: 'yds', CAR: 'carries', REC: 'rec', TD: 'TD', INT: 'INT', ATT: 'att', TGTS: 'targets', SACK: 'sacks', SACKS: 'sacks' };
export function perGame(display, games) {
  if (!games) return '';
  const avg = (n) => (Math.round((n / games) * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return String(display).split(/,\s+/).map((part) => {
    const frac = /^(\d[\d,]*)\/(\d[\d,]*)$/.exec(part.trim());
    if (frac) {
      const made = Number(frac[1].replace(/,/g, '')), att = Number(frac[2].replace(/,/g, ''));
      return att ? `${(made / att * 100).toFixed(1)}% completions` : '';
    }
    const m = /^(-?[\d,.]+)\s*([A-Za-z]*)$/.exec(part.trim());
    if (!m) return part.trim();
    const unit = UNIT[m[2].toUpperCase()] ?? m[2].toLowerCase();
    return `${avg(Number(m[1].replace(/,/g, '')))}${unit ? ` ${unit}` : ''}`;
  }).filter(Boolean).join(', ');
}

function gamesPlayed(summary) {
  const out = {};
  for (const c of summary?.header?.competitions?.[0]?.competitors || []) {
    const rec = (c.record || c.records || []).find((r) => !r.type || r.type === 'total') || (c.record || c.records || [])[0];
    const nums = String(rec?.summary || rec?.displayValue || '').split('-').map(Number).filter(Number.isFinite);
    if (nums.length) out[c.team?.abbreviation || ''] = nums.reduce((a, b) => a + b, 0);
  }
  return out;
}

// Each team's top performers: this game's once it starts; season leaders
// (as per-game averages where ESPN gives totals) before kick-off.
function gameLeaders(summary, league) {
  const state = summary?.header?.competitions?.[0]?.status?.type?.state;
  const season = state === 'pre';
  const played = season ? gamesPlayed(summary) : {};
  return (summary?.leaders || [])
    .map((t) => {
      const team = t.team?.abbreviation || '';
      return {
        team,
        scope: season ? 'season' : 'game',
        categories: (t.leaders || [])
          .map((c) => {
            const top = (c.leaders || [])[0];
            if (!top) return null;
            const raw = top.displayValue || '';
            // NFL season leaders are totals; other sports already send averages.
            const value = season && league === 'nfl' && played[team] ? perGame(raw, played[team]) : raw;
            return { label: c.displayName || c.name || '', value, name: nameOf(top.athlete), id: top.athlete?.id != null ? String(top.athlete.id) : '' };
          })
          .filter((c) => c && c.name),
      };
    })
    .filter((t) => t.categories.length);
}

function injuries(summary) {
  return (summary?.injuries || [])
    .map((t) => ({
      team: t.team?.abbreviation || '',
      list: (t.injuries || []).map((i) => ({
        name: nameOf(i.athlete),
        position: i.athlete?.position?.abbreviation || '',
        status: i.status || i.type?.description || '',
        detail: [i.details?.type, i.details?.detail].filter(Boolean).join(', ') || i.type?.description || '',
      })).filter((i) => i.name),
    }))
    .filter((t) => t.list.length);
}

// ESPN's win probability: live (last play) or the pre-game projection.
function winProbability(summary) {
  const live = (summary?.winprobability || []).at?.(-1);
  if (live && Number.isFinite(Number(live.homeWinPercentage))) {
    const home = Math.round(Number(live.homeWinPercentage) * 1000) / 10;
    return { home, away: Math.round((100 - home) * 10) / 10, live: true };
  }
  const p = summary?.predictor;
  const h = Number(p?.homeTeam?.gameProjection ?? p?.homeTeam?.teamChanceLoss);
  if (Number.isFinite(h) && p?.homeTeam?.gameProjection != null) {
    return { home: h, away: Math.round((100 - h) * 10) / 10, live: false };
  }
  return null;
}

function seasonSeries(summary) {
  const s = (summary?.seasonseries || [])[0];
  return s?.summary || s?.description || '';
}

// Soccer: formation, starting XI with shirt numbers, and the bench.
function lineups(summary) {
  return (summary?.rosters || [])
    .map((t) => {
      const people = (t.roster || []).map((r) => ({
        id: r.athlete?.id != null ? String(r.athlete.id) : '',
        name: nameOf(r.athlete),
        jersey: r.jersey || r.athlete?.jersey || '',
        position: r.position?.abbreviation || r.position?.name || '',
        starter: r.starter === true,
        subbedIn: !!r.subbedIn,
        subbedOut: !!r.subbedOut,
      })).filter((p) => p.name);
      return {
        team: t.team?.abbreviation || '',
        formation: t.formation || '',
        starters: people.filter((p) => p.starter),
        bench: people.filter((p) => !p.starter),
      };
    })
    .filter((t) => t.starters.length);
}

// ctx.teams: for cricket, each team's innings totals from the live feed
// ([{ abbr, name, score, innings: [{ period, runs, wickets, overs, isBatting }] }]).
export function extractGame(summary, league, ctx = {}) {
  let teams = headerTeams(summary);
  if (!teams.length && ctx.teams?.length) teams = ctx.teams.map((t) => ({ ...t, linescores: [] }));
  const players = extractPlayers(summary, league);
  return {
    teams: teams.map(({ linescores, score, innings, ...t }) => t),
    periods: periods(teams, league),
    tables: tablesFromPlayers(players, teams, league, summary),
    innings: league === 'cricket' ? cricketInnings(players, ctx.teams?.length ? ctx.teams : teams, ctx.state) : [],
    teamStats: teamStats(summary, teams),
    events: events(summary, league, teams),
    info: gameInfo(summary),
    leaders: gameLeaders(summary, league),
    injuries: injuries(summary),
    winProb: winProbability(summary),
    series: seasonSeries(summary),
    lineups: league === 'epl' ? lineups(summary) : [],
    players,
  };
}
