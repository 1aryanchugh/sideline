import { LEAGUES, TTL } from './leagues.js';
import { normalizeEspn, normalizeApiFootball, cricketSeries } from './normalize.js';
import { extractPlayers, rosterToPlayers, teamsFromSummary } from './players.js';
import { extractGame } from './game.js';
import { parseForm, parseGamelog } from './history.js';
import { parseCricketBalls, parsePlays } from './plays.js';
import { OPENF1, parseF1Timing } from './f1.js';
export { AflStream, DailyQuota } from './afl-stream.js';

// Routes
//   GET /api/leagues               -> list of supported leagues
//   GET /api/scores?league=nba     -> normalized events for one league
//   GET /api/players?league=nfl&event=401872980[&series=8204]
//                                  -> every player's full stat line for one game
//   GET /api/game?league=nfl&event=401872980[&series=8204]
//                                  -> box score / scorecard, team stats, period scores, scoring plays
//   GET /api/form?league=nfl&teams=2,14
//                                  -> each team's last 5 results and next game
//   GET /api/history?league=nba&athlete=4065648
//                                  -> a player's recent games and season totals
//   GET /api/teams?league=nfl        -> every team in a league, for picking favourites
//   GET /api/f1?start=2026-10-11T12:00:00Z
//                                  -> OpenF1 timing for the session starting then (once it's finished)
//   GET /api/plays?league=cricket&event=…&series=…[&full=1]
//                                  -> ball by ball / play by play, plus momentum chart data
//   GET /api/health                -> 200 if ESPN is reachable (for an uptime monitor)
// Everything else is the static app in /public (served by Workers Static Assets).

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors);

    // About page: fill in absolute links so LinkedIn and others show the preview card.
    if (url.pathname === '/about' || url.pathname === '/about/') return aboutPage(request, env, url);

    if (url.pathname === '/api/health') return health(cors);

    // Generous per-device limit: only a stuck device or a bot ever reaches it.
    if (await overLimit(request, env)) {
      return json({ error: 'Too many requests. Slowing down for a few seconds.', retryAfter: 10 }, 429,
        { ...cors, 'Retry-After': '10', 'Cache-Control': 'no-store' });
    }

    try {
      if (url.pathname === '/api/leagues') {
        const list = Object.entries(LEAGUES).map(([id, l]) => ({ id, label: l.label }));
        return json({ leagues: list }, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' });
      }

      if (url.pathname === '/api/scores') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        if (!league) return json({ error: `Unknown league "${id}"` }, 400, cors);

        // ?past=1: finished games from the last 7 days, for following after the fact.
        const past = url.searchParams.get('past') === '1';
        // ?date=YYYYMMDD: one day's games, for followed games that fell out of the main feed.
        const date = url.searchParams.get('date') || '';
        if (date && !/^\d{8}$/.test(date)) return json({ error: 'Bad date' }, 400, cors);
        const { events, source } = date ? await dayFor(id, league, date)
          : past ? await resultsFor(id, league, env) : await scoresFor(id, league, env);
        const anyLive = events.some((e) => e.state === 'in');
        return json(
          { league: id, source, updated: new Date().toISOString(), events },
          200,
          { ...cors, 'Cache-Control': `public, max-age=${past ? 600 : anyLive ? 15 : 60}` },
        );
      }

      if (url.pathname === '/api/players' || url.pathname === '/api/game') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        const event = url.searchParams.get('event') || '';
        const series = url.searchParams.get('series') || '';
        if (!league?.players) return json({ error: `No game detail for "${id}"` }, 400, cors);
        if (!/^\d+$/.test(event) || (series && !/^\d+$/.test(series))) {
          return json({ error: 'Bad event id' }, 400, cors);
        }
        const result = url.pathname === '/api/game'
          ? await gameFor(id, league, event, series)
          : await playersFor(id, league, event, series);
        return json(
          { league: id, event, updated: new Date().toISOString(), ...result },
          200,
          { ...cors, 'Cache-Control': 'public, max-age=15' },
        );
      }

      if (url.pathname === '/api/teams') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        if (!league) return json({ error: `Unknown league "${id}"` }, 400, cors);
        const teams = await teamsFor(id, league, env);
        return json({ league: id, teams }, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' });
      }

      if (url.pathname === '/api/f1') {
        const start = Date.parse(url.searchParams.get('start') || '');
        if (!Number.isFinite(start)) return json({ error: 'Bad start time' }, 400, cors);
        const timing = await f1TimingFor(start);
        return json(timing, 200, { ...cors, 'Cache-Control': `public, max-age=${timing.rows?.length ? 3600 : 300}` });
      }

      if (url.pathname === '/api/plays') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        const event = url.searchParams.get('event') || '';
        const series = url.searchParams.get('series') || '';
        if (!league?.players) return json({ error: `No play-by-play for "${id}"` }, 400, cors);
        if (!/^\d+$/.test(event) || (series && !/^\d+$/.test(series))) return json({ error: 'Bad event id' }, 400, cors);
        const full = url.searchParams.get('full') === '1';
        const plays = await playsFor(id, league, event, series, full);
        return json({ league: id, event, ...plays }, 200, { ...cors, 'Cache-Control': 'public, max-age=15' });
      }

      if (url.pathname === '/api/form') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        const teams = (url.searchParams.get('teams') || '').split(',').filter(Boolean);
        if (!league?.form) return json({ error: `No team form for "${id}"` }, 400, cors);
        if (!teams.length || teams.length > 2 || !teams.every((x) => /^\d+$/.test(x))) return json({ error: 'Bad team ids' }, 400, cors);
        const form = await Promise.all(teams.map((tid) => formFor(league, tid).catch((e) => ({ id: tid, error: e.message, results: [] }))));
        return json({ league: id, teams: form }, 200, { ...cors, 'Cache-Control': 'public, max-age=600' });
      }

      if (url.pathname === '/api/history') {
        const id = url.searchParams.get('league');
        const league = LEAGUES[id];
        const athlete = url.searchParams.get('athlete') || '';
        if (!league?.gamelog) return json({ error: `No game logs for "${id}"` }, 400, cors);
        if (!/^\d+$/.test(athlete)) return json({ error: 'Bad athlete id' }, 400, cors);
        const log = await gamelogFor(league, athlete);
        return json({ league: id, athlete, ...log }, 200, { ...cors, 'Cache-Control': 'public, max-age=600' });
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      // Shows up in Cloudflare's Workers Logs (Observability), searchable by route.
      console.error(JSON.stringify({ route: url.pathname, query: url.search, error: String(err.message || err) }));
      return json({ error: String(err.message || err) }, 502, cors);
    }
  },
};

async function scoresFor(id, league, env) {
  if (league.source === 'squiggle') {
    const stub = env.AFL.get(env.AFL.idFromName('afl'));
    return { events: await stub.snapshot(), source: 'Squiggle' };
  }

  try {
    const events = normalizeEspn(await fetchEspn(league), id, league.kind);
    return { events, source: 'ESPN' };
  } catch (err) {
    if (league.backup === 'apiFootball' && env.API_FOOTBALL_KEY) {
      return { events: await fetchApiFootball(id, env), source: 'API-Football' };
    }
    throw err;
  }
}

// Finished games from the last week. Results don't change, so they're cached
// for 15 minutes at the edge and cost ESPN almost nothing.
const PAST_DAYS = 7;
async function resultsFor(id, league, env) {
  if (league.source === 'squiggle') {
    const stub = env.AFL.get(env.AFL.idFromName('afl'));
    return { events: await stub.recent(PAST_DAYS), source: 'Squiggle' };
  }
  const json = await fetchEspnPast(league);
  const since = Date.now() - PAST_DAYS * 86_400_000;
  const events = normalizeEspn(json, id, league.kind)
    .filter((e) => e.state === 'post' && (!e.start || Date.parse(e.start) >= since))
    .sort((a, b) => Date.parse(b.start || 0) - Date.parse(a.start || 0));
  return { events, source: 'ESPN' };
}

// A day's games plus the day before: ESPN files games under US dates, so an
// evening game in America sits on the previous day.
async function dayFor(id, league, date) {
  if (league.source !== 'espn') return { events: [], source: league.source };
  const base = league.url || `${ESPN}/${league.path}/scoreboard`;
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8)));
  const prev = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
  const results = await Promise.allSettled([date, prev].map((x) => getJson(`${base}?dates=${x}`)));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('ESPN didn’t return that day’s games');
  return { events: normalizeEspn(mergeEvents(ok), id, league.kind), source: 'ESPN' };
}

async function fetchEspnPast(league) {
  const base = league.url || `${ESPN}/${league.path}/scoreboard`;
  const ttl = 900;
  try {
    return await getJson(`${base}?dates=${ymd(-PAST_DAYS)}-${ymd(1)}`, ttl);
  } catch (err) {
    if (err.status && err.status >= 500) throw err;
  }
  // Range rejected: one request per day, merged (each is cached separately).
  const days = [];
  for (let d = -PAST_DAYS; d <= 1; d++) days.push(ymd(d));
  const results = await Promise.allSettled(days.map((d) => getJson(`${base}?dates=${d}`, ttl)));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw new Error('ESPN didn’t return past results');
  return mergeEvents(ok);
}

// Merge several scoreboard responses, skipping duplicate events. Cricket's
// scorepanel nests events in `scores[]` groups, so those are merged too.
function mergeEvents(list) {
  const seen = new Set();
  const keep = (ev) => (seen.has(ev.id) ? false : (seen.add(ev.id), true));
  if (list.some((j) => Array.isArray(j.scores))) {
    const groups = [];
    for (const j of list) {
      for (const g of j.scores || []) {
        const events = (g.events || []).filter(keep);
        if (events.length) groups.push({ ...g, events });
      }
    }
    return { ...list[0], scores: groups };
  }
  const events = [];
  for (const j of list) for (const ev of j.events || []) if (keep(ev)) events.push(ev);
  return { ...list[0], events };
}

// One game's full ESPN summary (edge-cached ~20s, shared by both routes).
async function fetchSummary(id, league, event, series) {
  if (id === 'cricket' && !series) series = await findCricketSeries(league, event);
  if (id === 'cricket' && !series) {
    throw new Error('This match isn’t in ESPN’s live cricket feed any more, so its scorecard can’t be found');
  }
  const base = id === 'cricket'
    ? `${ESPN}/cricket/${series}/summary`
    : `${ESPN}/${league.path}/summary`;
  const res = await fetch(`${base}?event=${event}`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: TTL.live, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`ESPN summary ${res.status}`);
  return res.json();
}

// Box score, team stats, scores by period and scoring plays for one game.
async function gameFor(id, league, event, series) {
  const [summary, cricket] = await Promise.all([
    fetchSummary(id, league, event, series),
    id === 'cricket' ? cricketTeams(league, event) : null,
  ]);
  const game = extractGame(summary, id, cricket || {});
  // The box score only lists players who've done something, so add the rest
  // of each squad from the team rosters (cached for hours, so it's cheap).
  const roster = await rosterPlayers(league, summary).catch(() => []);
  if (!game.players.length) {
    if (roster.length) return { ...game, players: roster, source: 'roster' };
    return { ...game, source: 'none' };
  }
  return { ...game, players: mergeRoster(game.players, roster), source: 'boxscore' };
}

// Teams for the favourites picker: ESPN's team list, Squiggle's for AFL, and
// for cricket every side playing this week (there's no single list).
async function teamsFor(id, league, env) {
  const tidy = (list) => [...new Map(list.filter((t) => t.id && t.name).map((t) => [t.id, t])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));
  if (league.source === 'squiggle') {
    const stub = env.AFL.get(env.AFL.idFromName('afl'));
    const events = await stub.recent(365);
    return tidy(events.flatMap((e) => e.competitors).map((c) => ({ id: c.id, abbr: c.short, name: c.name, color: c.color })));
  }
  if (id === 'cricket') {
    const [live, past] = await Promise.allSettled([fetchEspn(league), fetchEspnPast(league)]);
    const events = [live, past].flatMap((r) => (r.status === 'fulfilled' ? normalizeEspn(r.value, id, league.kind) : []));
    return tidy(events.flatMap((e) => e.competitors || []).map((c) => ({ id: c.id, abbr: c.short, name: c.name, color: c.color })));
  }
  if (['field', 'sessions', 'bouts'].includes(league.kind)) return [];
  const data = await getCached(`${ESPN}/${league.path}/teams?limit=200`, 86_400);
  const raw = data?.sports?.[0]?.leagues?.[0]?.teams || [];
  return tidy(raw.map(({ team: t = {} }) => ({
    id: String(t.id ?? ''), abbr: t.abbreviation || '', name: t.displayName || t.name || '',
    color: /^[0-9a-f]{6}$/i.test(t.color || '') ? `#${t.color}` : null,
  })));
}

// ---------- protection and monitoring ----------

// Two limits, both far above what the app itself ever sends (about 50 requests
// a minute at most, with several live games and tracked players):
//   300 a minute per device (a random id the app keeps on the phone), and
//   1,200 a minute per network address (so a school or office wifi full of
//   users is fine). If the limiter isn't available, requests just go through.
export async function overLimit(request, env) {
  try {
    const device = request.headers.get('X-Sideline-Device') || '';
    if (env.DEVICE_LIMIT && /^[A-Za-z0-9-]{8,64}$/.test(device)) {
      const { success } = await env.DEVICE_LIMIT.limit({ key: device });
      if (!success) return true;
    }
    const ip = request.headers.get('CF-Connecting-IP');
    if (env.IP_LIMIT && ip) {
      const { success } = await env.IP_LIMIT.limit({ key: ip });
      if (!success) return true;
    }
  } catch { /* limiter unavailable */ }
  return false;
}

// For a free uptime monitor: 200 when ESPN answers, 503 when it doesn't.
async function health(cors) {
  const started = Date.now();
  try {
    await getJson(`${ESPN}/basketball/nba/scoreboard`);
    return json({ ok: true, espn: 'up', ms: Date.now() - started }, 200, { ...cors, 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error(JSON.stringify({ route: '/api/health', error: String(err.message || err) }));
    return json({ ok: false, espn: String(err.message || err) }, 503, { ...cors, 'Cache-Control': 'no-store' });
  }
}

// The about page with absolute URLs for link previews (og:image must be absolute).
async function aboutPage(request, env, url) {
  if (!env.ASSETS) return Response.redirect(`${url.origin}/about.html`, 302);
  // Static assets serve about.html at /about (and redirect /about.html there).
  let res = await env.ASSETS.fetch(new Request(`${url.origin}/about`));
  if (res.status >= 300 && res.status < 400) res = await env.ASSETS.fetch(new Request(`${url.origin}/about.html`));
  const html = (await res.text()).replaceAll('{{ORIGIN}}', url.origin);
  return new Response(html, { status: res.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

// The OpenF1 session that starts closest to ESPN's start time, then its
// drivers, results, laps, tyre stints and pit stops in one go.
async function f1TimingFor(start) {
  const iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  const sessions = await getCached(`${OPENF1}/sessions?date_start>=${iso(start - 3 * 3600_000)}&date_start<=${iso(start + 3 * 3600_000)}`, 3600)
    .catch(() => []);
  const session = (Array.isArray(sessions) ? sessions : [])
    .sort((a, b) => Math.abs(Date.parse(a.date_start) - start) - Math.abs(Date.parse(b.date_start) - start))[0];
  if (!session) return { available: false, reason: 'OpenF1 doesn’t have this session.' };
  if (Date.parse(session.date_end) > Date.now()) {
    return { available: false, reason: 'Timing appears here once the session has finished.', session: { name: session.session_name } };
  }
  const k = session.session_key;
  // Fresh sessions are re-read every 5 minutes while OpenF1 finishes processing them.
  const ttl = Date.now() - Date.parse(session.date_end) < 2 * 3600_000 ? 300 : 3600;
  const get = (path) => getCached(`${OPENF1}/${path}?session_key=${k}`, ttl).catch(() => []);
  const [drivers, results, laps, stints, pits] = await Promise.all([
    get('drivers'), get('session_result'), get('laps'), get('stints'), get('pit'),
  ]);
  const timing = parseF1Timing({ session, drivers, results, laps, stints, pits });
  if (!timing.rows.length) return { available: false, reason: 'OpenF1 is still processing this session. Check back in a few minutes.', session: timing.session };
  return { available: true, ...timing };
}

// Ball by ball (cricket) or play by play. Cricket's feed is paged oldest
// first, 25 balls a page: finished pages never change, so they're cached for
// a day and only the newest page is re-read. `full` loads every page (for the
// charts) when the match is short enough; otherwise just the recent overs.
async function playsFor(id, league, event, series, full) {
  if (id === 'cricket') {
    if (!series) series = await findCricketSeries(league, event);
    if (!series) return { kind: 'none' };
    const base = `${ESPN}/cricket/${series}/playbyplay?event=${event}&page=`;
    const first = await getJson(`${base}1`, TTL.live);
    const pages = Number(first?.commentary?.pageCount) || 1;
    const want = new Set([pages, Math.max(1, pages - 1)]);
    if (full) {
      const from = pages <= 40 ? 2 : Math.max(2, pages - 5);
      for (let n = from; n <= pages; n++) want.add(n);
    }
    want.delete(1);
    const rest = await Promise.allSettled([...want].map((n) => getJson(`${base}${n}`, n === pages ? TTL.live : 86_400)));
    const items = [
      ...(first?.commentary?.items || []),
      ...rest.flatMap((r) => (r.status === 'fulfilled' ? r.value?.commentary?.items || [] : [])),
    ];
    const parsed = parseCricketBalls(items);
    return parsed ? { kind: 'cricket', complete: full && pages <= 40, ...parsed } : { kind: 'none' };
  }
  if (!['nba', 'nfl', 'epl'].includes(id)) return { kind: 'none' };
  return parsePlays(await fetchSummary(id, league, event, series), id);
}

// Box score players first (with their stats), then everyone else in the squad.
export function mergeRoster(players, roster) {
  const seen = new Set(players.map((p) => p.id));
  const rest = roster.filter((p) => p.id && !seen.has(p.id));
  return [...players, ...rest];
}

// Just the players (used for live refreshes of tracked players).
async function playersFor(id, league, event, series) {
  const summary = await fetchSummary(id, league, event, series);
  const players = extractPlayers(summary, id);
  if (players.length) return { source: 'boxscore', players };
  const fallback = await rosterPlayers(league, summary);
  return fallback.length ? { source: 'roster', players: fallback } : { source: 'none', players: [] };
}

// Before a game starts there's no box score yet, so fall back to both
// teams' rosters so players can be picked in advance.
async function rosterPlayers(league, summary) {
  if (league.rosters) {
    const teams = teamsFromSummary(summary);
    const rosters = await Promise.all(teams.map(async (t) => {
      const r = await fetch(`${ESPN}/${league.path}/teams/${t.id}/roster`, {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: 6 * 3600, cacheEverything: true }, // rosters barely change on game day
      });
      return r.ok ? rosterToPlayers(await r.json(), t) : [];
    }));
    return rosters.flat();
  }
  return [];
}

// Past results change slowly; cache them longer than live scores.
async function getCached(url, ttl) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

// A team's last 5 results. NFL/NBA schedules default to the current phase
// (often preseason), so the regular season is fetched too; early in a season
// the previous season fills the gap.
async function formFor(league, teamId) {
  const base = `${ESPN}/${league.path}/teams/${teamId}/schedule`;
  const urls = [base];
  if (league.seasonTypes) urls.push(`${base}?seasontype=2`);
  const got = (await Promise.allSettled(urls.map((u) => getCached(u, 1800))))
    .filter((r) => r.status === 'fulfilled').map((r) => r.value);
  let form = parseForm(got, teamId);
  if (form.results.length < 5) {
    const prev = new Date().getUTCFullYear() - 1;
    const more = await getCached(`${base}?season=${prev}${league.seasonTypes ? '&seasontype=2' : ''}`, 6 * 3600).catch(() => null);
    if (more) form = parseForm([...got, more], teamId);
  }
  if (!got.length && !form.results.length) throw new Error('ESPN has no schedule for this team');
  return form;
}

// A player's recent games. Out of season the default can be empty, so try
// the current and previous seasons.
async function gamelogFor(league, athlete) {
  const base = `https://site.web.api.espn.com/apis/common/v3/sports/${league.path}/athletes/${athlete}/gamelog`;
  const year = new Date().getUTCFullYear();
  for (const url of [base, `${base}?season=${year}`, `${base}?season=${year - 1}`]) {
    try {
      const log = parseGamelog(await getCached(url, 900));
      if (log.games.length) return log;
    } catch { /* try the next season */ }
  }
  return parseGamelog({});
}

// Cricket scorecards are filed under a series id. If the app didn't send one,
// find the match in the scorepanel (edge-cached, so this is usually free).
async function findCricketSeries(league, event) {
  const found = await findCricketEvent(league, event);
  return found ? cricketSeries(found.group, found.ev) : undefined;
}

async function findCricketEvent(league, event) {
  // The live panel first, then the last week's results for finished matches.
  for (const load of [() => fetchEspn(league), () => fetchEspnPast(league)]) {
    try {
      const panel = await load();
      for (const group of panel.scores || []) {
        const ev = (group.events || []).find((e) => String(e.id) === event);
        if (ev) return { group, ev };
      }
    } catch { /* try the next source */ }
  }
  return undefined;
}

// Each side's innings totals ("390 & 314/6d"; runs, wickets, overs per innings).
async function cricketTeams(league, event) {
  const found = await findCricketEvent(league, event);
  const state = found?.ev?.status?.type?.state || found?.ev?.competitions?.[0]?.status?.type?.state || '';
  const teams = (found?.ev?.competitions?.[0]?.competitors || []).map((c) => ({
    id: String(c.team?.id ?? c.id ?? ''),
    abbr: c.team?.abbreviation || '',
    name: c.team?.displayName || c.team?.name || '',
    score: c.score || '',
    innings: (c.linescores || []).map((l) => ({
      period: Number(l.period) || 0, runs: l.runs, wickets: l.wickets, overs: l.overs,
      isBatting: !!l.isBatting, isCurrent: !!l.isCurrent, description: l.description || '',
    })),
  }));
  return { teams, state };
}

// cacheTtl makes Cloudflare's edge share one upstream response across all
// requests for ~20s, so ESPN sees at most ~3 requests a minute per URL.
async function getJson(url, ttl = TTL.live) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: ttl, cacheEverything: true },
  });
  if (!res.ok) {
    const err = new Error(`ESPN ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchEspn(league) {
  const base = league.url || `${ESPN}/${league.path}/scoreboard`;
  if (!league.range) {
    const cur = await getJson(base);
    if (!league.nextWeek) return cur;
    // ESPN's NFL scoreboard only covers the current week, which can leave just
    // Monday night's game. Add next week so the list always looks ahead.
    const week = Number(cur?.week?.number);
    const type = Number(cur?.season?.type);
    const year = Number(cur?.season?.year);
    if (!week || !type || !year) return cur;
    try {
      const next = await getJson(`${base}?seasontype=${type}&week=${week + 1}&dates=${year}`);
      return mergeEvents([cur, next]);
    } catch {
      return cur; // e.g. after the last week of a season phase
    }
  }

  const [from, to] = league.range;
  // 1. The whole week in one request.
  try {
    return await getJson(`${base}?dates=${ymd(from)}-${ymd(to)}`);
  } catch (err) {
    if (err.status && err.status >= 500) throw err; // ESPN is down; don't hammer it
  }
  // 2. ESPN rejected the range: ask for each day separately and merge.
  const days = [];
  for (let d = from; d <= to; d++) days.push(ymd(d));
  const results = await Promise.allSettled(days.map((d) => getJson(`${base}?dates=${d}`)));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (ok.length) return mergeEvents(ok);
  // 3. Last resort: today's default scoreboard.
  return getJson(base);
}

// Premier League backup: only used if ESPN fails, capped at 90 calls/day.
async function fetchApiFootball(id, env) {
  const quota = env.QUOTA.get(env.QUOTA.idFromName('api-football'));
  if (!(await quota.take(90))) throw new Error('Backup feed daily limit reached');

  const today = new Date();
  const season = today.getUTCMonth() >= 6 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const date = today.toISOString().slice(0, 10);
  const res = await fetch(
    `https://v3.football.api-sports.io/fixtures?league=39&season=${season}&date=${date}`,
    { headers: { 'x-apisports-key': env.API_FOOTBALL_KEY }, cf: { cacheTtl: TTL.idle, cacheEverything: true } },
  );
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  return normalizeApiFootball(await res.json(), id);
}

function ymd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

function corsHeaders(request, env) {
  // Same-origin by default. Add other origins (e.g. a GitHub Pages URL) to
  // ALLOWED_ORIGINS in wrangler.jsonc, comma-separated.
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
  }
  return {};
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
