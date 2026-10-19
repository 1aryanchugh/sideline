// Every source is mapped onto one small shape so the app never has to know
// where a score came from:
//
//   { id, league, kind, name, group, start, state, detail, competitors[] }
//
//   kind   'match' (two sides) or 'field' (a ranked list: golf, F1)
//   state  'pre' | 'in' | 'post'
//   competitor { id, name, short, score, winner, home, pos, logo }

import { detailEvent } from './game.js';

const STATES = new Set(['pre', 'in', 'post']);

function state(s) {
  const v = s?.type?.state;
  return STATES.has(v) ? v : 'pre';
}

function detail(s) {
  return s?.type?.shortDetail || s?.type?.detail || s?.type?.description || '';
}

const hex = (v) => (v && /^[0-9a-f]{6}$/i.test(v) ? `#${v}` : null);

function teamCompetitor(c) {
  const t = c.team || {};
  return {
    id: String(c.id ?? t.id ?? ''),
    name: t.displayName || t.name || 'TBD',
    short: t.abbreviation || t.shortDisplayName || '',
    score: c.score ?? null,
    winner: c.winner === true,
    home: c.homeAway === 'home',
    logo: t.logo || null,
    color: hex(t.color),
  };
}

// Squiggle doesn't send club colours, so the 18 AFL clubs' primaries live here.
const AFL_COLOURS = {
  ADE: '#002B5C', BRI: '#A30046', CAR: '#0E1E2D', COL: '#1A1A1A', ESS: '#CC2031', FRE: '#2A0D54',
  GCS: '#D93E39', GEE: '#002B5C', GWS: '#F15C22', HAW: '#4D2004', MEL: '#0F1131', NTH: '#013B9F',
  PTA: '#008AAB', RIC: '#FED102', STK: '#ED0F05', SYD: '#ED171F', WCE: '#062EE2', WBD: '#014896',
};

function athleteCompetitor(c, i) {
  const a = c.athlete || {};
  const rawScore = typeof c.score === 'object' ? c.score?.displayValue : c.score;
  return {
    id: String(c.id ?? a.id ?? i),
    name: a.displayName || a.fullName || 'Unknown',
    short: a.shortName || '',
    score: rawScore ?? null,
    winner: c.winner === true,
    pos: c.status?.position?.displayName || (c.order != null ? String(c.order) : null),
  };
}

// NFL, NBA, NRL, Premier League: one competition per event, two teams.
function espnMatches(json, league) {
  return (json.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const status = comp.status || ev.status;
    const competitors = (comp.competitors || []).map(teamCompetitor)
      .sort((a, b) => Number(b.home) - Number(a.home)); // home first
    // Tries, goals and cards with who scored (NRL, soccer), when ESPN lists them.
    const abbr = (t) => competitors.find((c) => c.id === String(t?.id))?.short || '';
    const timeline = (comp.details || [])
      .map((d) => detailEvent(d, abbr))
      .filter((e) => e.type !== 'skip' && e.type !== 'other');
    return {
      id: String(ev.id),
      league,
      kind: 'match',
      name: ev.name || competitors.map((c) => c.name).join(' vs '),
      start: comp.date || ev.date,
      state: state(status),
      detail: detail(status),
      competitors,
      ...(timeline.length ? { timeline } : {}),
    };
  });
}

// UFC: an event is a fight card; every bout is its own followable item.
function espnBouts(json, league) {
  const out = [];
  for (const ev of json.events || []) {
    for (const comp of ev.competitions || []) {
      const competitors = (comp.competitors || []).map(athleteCompetitor);
      if (competitors.length < 2) continue;
      out.push({
        id: String(comp.id),
        league,
        kind: 'match',
        name: competitors.map((c) => c.name).join(' vs '),
        group: ev.name,
        summaryId: String(ev.id), // player stats live on the whole card's summary
        start: comp.date || ev.date,
        state: state(comp.status),
        detail: detail(comp.status),
        competitors,
      });
    }
  }
  return out;
}

// Golf: one tournament, a ranked field of players.
function espnField(json, league) {
  return (json.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const competitors = (comp.competitors || []).map(athleteCompetitor)
      .sort((a, b) => (parseInt(a.pos) || 999) - (parseInt(b.pos) || 999));
    const status = comp.status || ev.status;
    return {
      id: String(ev.id),
      league,
      kind: 'field',
      name: ev.name,
      start: ev.date,
      state: state(status),
      detail: detail(status),
      competitors,
    };
  });
}

// F1: a race weekend holds several sessions (FP1, Qual, Sprint, Race),
// each with its own running order.
function espnSessions(json, league) {
  const out = [];
  for (const ev of json.events || []) {
    for (const comp of ev.competitions || []) {
      const session = comp.type?.abbreviation || 'Session';
      const competitors = (comp.competitors || []).map(athleteCompetitor)
        .sort((a, b) => (parseInt(a.pos) || 999) - (parseInt(b.pos) || 999));
      out.push({
        id: String(comp.id),
        league,
        kind: 'field',
        name: `${ev.shortName || ev.name} · ${session}`,
        group: ev.name,
        start: comp.date,
        state: state(comp.status),
        detail: detail(comp.status),
        competitors,
      });
    }
  }
  return out;
}

// The series id lives in different places depending on the match, so try
// each: the group, its league, then the event's uid ("s:200~l:8204~e:1513437").
export function cricketSeries(group, ev) {
  const direct = group?.leagueId ?? group?.leagues?.[0]?.id;
  if (direct != null && /^\d+$/.test(String(direct))) return String(direct);
  const m = /~l:(\d+)/.exec(ev?.uid || ev?.competitions?.[0]?.uid || '');
  return m ? m[1] : undefined;
}

// A break in play while a match is still "in progress": stumps overnight in a
// Test, lunch, tea, rain. ESPN keeps the state as "in", so the reason has to
// be read from the status text. Returns a short label, or null while playing.
const PAUSES = [
  [/stumps|close of play|end of day/i, 'Stumps'],
  [/lunch/i, 'Lunch'],
  [/\btea\b/i, 'Tea'],
  [/dinner/i, 'Dinner'],
  [/innings break/i, 'Innings break'],
  [/drinks/i, 'Drinks'],
  [/rain/i, 'Rain delay'],
  [/bad light/i, 'Bad light'],
  [/wet outfield/i, 'Wet outfield'],
  [/delay|suspend|interrupt/i, 'Play delayed'],
];
export function cricketPause(status) {
  const t = status?.type || {};
  const text = [t.name, t.description, t.detail, t.shortDetail, status?.session, status?.summary].filter(Boolean).join(' ').replace(/_/g, ' ');
  if (!text || /in progress|live/i.test(t.description || '') && !/stumps|lunch|tea|dinner|break|rain|delay/i.test(text)) return null;
  for (const [re, label] of PAUSES) if (re.test(text)) return label;
  return null;
}

// Cricket: the scorepanel groups matches by series. Scores arrive as text
// ("238/6 (42 ov)"), and the status summary ("Kent lead by 80 runs") is the
// most useful one-liner, so it becomes the detail.
function espnCricket(json, league) {
  const out = [];
  for (const group of json.scores || []) {
    const series = group.leagues?.[0]?.name;
    for (const ev of group.events || []) {
      const comp = ev.competitions?.[0] || {};
      const status = comp.status || ev.status;
      // Keep each side's innings totals for the scorecard ("AUS 1st 390").
      const competitors = (comp.competitors || []).map((c) => ({
        ...teamCompetitor(c),
        innings: (c.linescores || []).map((l) => ({
          period: Number(l.period) || 0, runs: l.runs, wickets: l.wickets, overs: l.overs, isBatting: !!l.isBatting,
        })),
      })).sort((a, b) => Number(b.home) - Number(a.home));
      out.push({
        id: String(ev.id),
        league,
        kind: 'match',
        name: ev.name || competitors.map((c) => c.name).join(' v '),
        group: series,
        series: cricketSeries(group, ev), // needed for the scorecard URL
        start: ev.date,
        state: state(status),
        detail: status?.summary || detail(status),
        ...(state(status) === 'in' && cricketPause(status) ? { pause: cricketPause(status) } : {}),
        ...(Number(status?.dayNumber) > 0 ? { day: Number(status.dayNumber) } : {}),
        competitors,
      });
    }
  }
  return out;
}

export function normalizeEspn(json, league, kind) {
  if (kind === 'cricket') return espnCricket(json, league);
  if (kind === 'bouts') return espnBouts(json, league);
  if (kind === 'field') return espnField(json, league);
  if (kind === 'sessions') return espnSessions(json, league);
  return espnMatches(json, league);
}

// API-Football (Premier League backup).
const AF_LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const AF_DONE = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'CANC', 'ABD']);

export function normalizeApiFootball(json, league) {
  return (json.response || []).map((f) => {
    const s = f.fixture?.status || {};
    const st = AF_LIVE.has(s.short) ? 'in' : AF_DONE.has(s.short) ? 'post' : 'pre';
    const side = (t, goals, home) => ({
      id: String(t?.id ?? ''),
      name: t?.name || 'TBD',
      short: '',
      score: goals == null ? null : String(goals),
      winner: t?.winner === true,
      home,
      logo: t?.logo || null,
    });
    return {
      id: `af-${f.fixture?.id}`,
      league,
      kind: 'match',
      name: `${f.teams?.home?.name} vs ${f.teams?.away?.name}`,
      start: f.fixture?.date,
      state: st,
      detail: st === 'in' && s.elapsed ? `${s.elapsed}'` : s.long || '',
      competitors: [
        side(f.teams?.home, f.goals?.home, true),
        side(f.teams?.away, f.goals?.away, false),
      ],
    };
  });
}

// Squiggle (AFL). Scores are shown as goals.behinds (total).
export function normalizeSquiggle(g, teams) {
  const pct = Number(g.complete) || 0;
  // The Standard API's `date` is venue-local with no zone; `unixtime` is exact.
  // The Event API sends an ISO timestamp in `date` instead.
  const startMs = g.unixtime ? g.unixtime * 1000 : Date.parse(g.date);
  const started = startMs <= Date.now();
  const st = pct >= 100 ? 'post' : pct > 0 || (started && g.timestr) ? 'in' : 'pre';
  const side = (id, name, goals, behinds, score, home) => ({
    id: String(id ?? ''),
    name: name || teams[id]?.name || 'TBD',
    short: teams[id]?.abbrev || '',
    score: score == null || st === 'pre' ? null : `${goals ?? 0}.${behinds ?? 0} (${score})`,
    winner: g.winner != null && String(g.winner) === String(id),
    home,
    logo: teams[id]?.logo ? `https://squiggle.com.au${teams[id].logo}` : null,
    color: AFL_COLOURS[teams[id]?.abbrev] || null,
  });
  return {
    id: `sq-${g.id}`,
    league: 'afl',
    kind: 'match',
    name: `${g.hteamname || teams[g.hteam]?.name || 'TBD'} vs ${g.ateamname || teams[g.ateam]?.name || 'TBD'}`,
    group: g.round != null ? `Round ${g.round}` : undefined,
    start: Number.isFinite(startMs) ? new Date(startMs).toISOString() : null,
    state: st,
    detail: st === 'post' ? 'Full Time' : st === 'in' ? g.timestr || `${pct}% played` : '',
    competitors: [
      side(g.hteam, g.hteamname, g.hgoals, g.hbehinds, g.hscore, true),
      side(g.ateam, g.ateamname, g.agoals, g.abehinds, g.ascore, false),
    ],
  };
}
