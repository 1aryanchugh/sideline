// Sideline — client.
// A watchlist of games stored on the device. Scores are fetched from the
// Worker only while the screen is visible; polling speeds up when something
// is live and stops entirely when the app is in the background.

import { winProbChart, leadChart, manhattan, worm } from './charts.js';
import { drawShareImage, shareCanvas } from './share.js';

const API = ''; // same origin; set to your Worker URL if hosting the app elsewhere
const STORE_KEY = 'sideline.v1';
const DATA_VERSION = 2; // bump to discard saved stats after a parsing change
// The sample board lives only in this tab (sessionStorage), never in the
// address bar, so the browser can't autocomplete you back into it later.
const DEMO_FLAG = 'sideline.demo';
if (new URLSearchParams(location.search).has('demo')) {
  try { sessionStorage.setItem(DEMO_FLAG, '1'); } catch { /* private mode */ }
  history.replaceState(null, '', location.pathname);
}
const DEMO = window.SIDELINE_DEMO === true || (() => { try { return sessionStorage.getItem(DEMO_FLAG) === '1'; } catch { return false; } })();
// Sample data is only downloaded for the sample board.
const DEMO_FOLLOWS = DEMO ? (await import('./demo.js')).DEMO_FOLLOWS : [];
function enterDemo() {
  try { sessionStorage.setItem(DEMO_FLAG, '1'); } catch { /* private mode */ }
  location.reload();
}
function exitDemo() {
  try { sessionStorage.removeItem(DEMO_FLAG); } catch { /* private mode */ }
  location.replace('/');
}

const LEAGUES = [
  { id: 'nfl', label: 'NFL' },
  { id: 'nba', label: 'NBA' },
  { id: 'afl', label: 'AFL' },
  { id: 'nrl', label: 'NRL' },
  { id: 'epl', label: 'Premier League' },
  { id: 'cricket', label: 'Cricket' },
  { id: 'ufc', label: 'UFC' },
  { id: 'golf', label: 'Golf' },
  { id: 'f1', label: 'F1' },
  { id: 'other', label: 'Other' }, // anything without a free feed, tracked by hand
];
const LABEL = Object.fromEntries(LEAGUES.map((l) => [l.id, l.label]));

// Small line icons for the sport chips.
const SPORT_ICON = {
  nfl: '<path d="M4.5 15.5c-1.6-4.4 1.9-11.9 11-11 1.6 4.4-1.9 11.9-11 11z"/><path d="M8 12l4-4M9.2 9.2l1.6 1.6M10.6 7.8l1.6 1.6M7.8 10.6l1.6 1.6"/>',
  nba: '<circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13M10 3.5v13M5.4 5.4c2.6 2.4 2.6 6.8 0 9.2M14.6 5.4c-2.6 2.4-2.6 6.8 0 9.2"/>',
  afl: '<ellipse cx="10" cy="10" rx="4.4" ry="7"/><path d="M10 6.2v7.6M8.6 8h2.8M8.6 10h2.8M8.6 12h2.8"/>',
  nrl: '<ellipse cx="10" cy="10" rx="7" ry="4.4" transform="rotate(-30 10 10)"/><path d="M7.6 12.4l4.8-4.8"/>',
  epl: '<circle cx="10" cy="10" r="6.5"/><path d="M10 7l2.4 1.7-.9 2.8H8.5l-.9-2.8z"/><path d="M10 3.5V7M12.4 8.7l3.6-1.2M11.5 11.5l2 3M8.5 11.5l-2 3M7.6 8.7L4 7.5"/>',
  cricket: '<path d="M13.8 3.6l2.6 2.6-7.6 7.6-2.6-2.6z"/><path d="M6.2 11.2L3.6 13.8l2.6 2.6 2.6-2.6"/><circle cx="14.5" cy="14.5" r="1.6"/>',
  ufc: '<path d="M7.3 3.5h5.4l3.8 3.8v5.4l-3.8 3.8H7.3l-3.8-3.8V7.3z"/>',
  golf: '<path d="M7 17V3.5l7 3-7 3"/><path d="M4.5 17h7"/>',
  f1: '<path d="M4.5 17V3.5h11v8h-11"/><path d="M8.2 3.5v8M11.8 3.5v8M4.5 7.5h11"/>',
  other: '<path d="M10 4v12M4 10h12"/>',
};
function sportIcon(id) {
  const span = document.createElement('span');
  span.className = 'sport-icon';
  span.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${SPORT_ICON[id] || ''}</svg>`;
  return span;
}

const POLL = { live: 20_000, soon: 60_000, idle: 300_000 };

// Sports where ESPN publishes per-player stats (AFL, golf and F1 don't).
const PLAYER_LEAGUES = new Set(['nfl', 'nba', 'nrl', 'epl', 'cricket', 'ufc']);
const FORM_LEAGUES = new Set(['nfl', 'nba', 'nrl', 'epl']);   // recent results from team schedules
const GAMELOG_LEAGUES = new Set(['nfl', 'nba']);               // per-player game logs
const GROUP_SHORT = {
  passing: 'Pass', rushing: 'Rush', receiving: 'Rec', defensive: 'Def', kicking: 'Kick',
  punting: 'Punt', kickReturns: 'KR', puntReturns: 'PR', interceptions: 'Int', fumbles: 'Fum',
  batting: 'Bat', bowling: 'Bowl', fielding: 'Field',
};

const ICON = {
  close: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

// ---------- state ----------

let follows = DEMO ? structuredClone(DEMO_FOLLOWS) : load();
let timer = null;
let inflight = null;
let lastSync = DEMO ? Date.now() : null;
let syncError = false;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    const list = saved.follows || [];
    // Older saves may hold stats from a previous parser (e.g. cricket career
    // totals). Keep the games and tracked players; refetch the numbers.
    if ((saved.v || 1) < DATA_VERSION) {
      for (const f of list) {
        delete f.stats;
        f.finalStats = false;
      }
    }
    return list;
  } catch { return []; }
}
// ---------- talking to the Worker ----------

// A random id kept on this phone, so the Worker's request limit is per device
// rather than per network (a whole uni wifi shares one address).
const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem('sideline.device');
    if (!id) { id = crypto.randomUUID?.() || `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem('sideline.device', id); }
    return id;
  } catch { return ''; }
})();

// fetch() for the Worker. If it ever says "slow down" (429), wait the few
// seconds it asks for and try again, quietly, up to twice.
async function apiFetch(url, tries = 2) {
  const headers = DEVICE_ID ? { 'X-Sideline-Device': DEVICE_ID } : {};
  const res = await fetch(url, { headers });
  if (res.status === 429 && tries > 0) {
    const wait = Math.min(30, Number(res.headers.get('Retry-After')) || 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return apiFetch(url, tries - 1);
  }
  return res;
}

// ---------- settings (theme, compact board, auto-clear, favourite teams) ----------

const SETTINGS_KEY = 'sideline.settings';
const DEFAULT_SETTINGS = { theme: 'system', compact: false, autoClear: false, favourites: [], dismissed: [] };
let settings = loadSettings();
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  applySettings();
}
function applySettings() {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  document.body.classList.toggle('compact', !!settings.compact);
}
applySettings();

const isFavourite = (league, c) => settings.favourites.some((t) => t.league === league &&
  ((t.id && String(t.id) === String(c.id)) || (t.name && t.name === c.name)));

function save() {
  if (DEMO) return; // the demo board never overwrites a real one
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: DATA_VERSION, follows })); } catch { /* private mode */ }
}

// ---------- data ----------

async function getLeague(league, past = false) {
  const res = await apiFetch(`${API}/api/scores?league=${encodeURIComponent(league)}${past ? '&past=1' : ''}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
  return body.events || [];
}

// Ball by ball / play by play. `full` adds every page for the charts.
const playsCache = new Map();
const PLAYS_LEAGUES = new Set(['cricket', 'nba', 'nfl', 'epl']);
async function getPlays(f, full = false) {
  if (DEMO) return f.demoPlays || { kind: 'none' };
  const key = `${f.key}:${full}`;
  const hit = playsCache.get(key);
  if (hit && Date.now() - hit.at < 15_000) return hit.data;
  const ev = f.snap;
  const qs = new URLSearchParams({ league: f.league, event: ev.summaryId || ev.id });
  if (ev.series) qs.set('series', ev.series);
  if (full) qs.set('full', '1');
  const res = await apiFetch(`${API}/api/plays?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
  playsCache.set(key, { data: body, at: Date.now() });
  return body;
}

async function getLeagueDay(league, date) {
  const res = await apiFetch(`${API}/api/scores?league=${encodeURIComponent(league)}&date=${date}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
  return body.events || [];
}

async function getPlayers(f) {
  if (DEMO) return { players: f.demoPlayers || [], source: 'boxscore' };
  const ev = f.snap;
  const qs = new URLSearchParams({ league: f.league, event: ev.summaryId || ev.id });
  if (ev.series) qs.set('series', ev.series);
  const res = await apiFetch(`${API}/api/players?${qs}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
  let players = body.players || [];
  // A UFC summary covers the whole card; keep just this bout's two fighters.
  if (f.league === 'ufc') {
    const ids = new Set((ev.competitors || []).map((c) => c.id));
    players = players.filter((p) => ids.has(p.id));
  }
  return { players, source: body.source };
}

async function refresh() {
  if (DEMO) { render(); return; }
  if (inflight) return inflight;
  const leagues = [...new Set([
    ...follows.filter((f) => f.league !== 'other').map((f) => f.league),
    ...settings.favourites.map((t) => t.league),
  ])];
  if (!leagues.length) { schedule(); render(); return; }

  setSync('Updating');
  inflight = (async () => {
    const results = await Promise.allSettled(leagues.map(getLeague));
    syncError = results.some((r) => r.status === 'rejected');
    const byKey = new Map();
    results.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      for (const ev of r.value) byKey.set(`${leagues[i]}:${ev.id}`, ev);
    });
    // Keep the last known snapshot if a game has dropped out of the feed
    // (feeds roll forward after full time), so finals stay on the board.
    // A followed game missing from its league's feed (ESPN's default
    // scoreboard can skip a day) is looked up by its date instead, once it's
    // due to start, so it never sits on "Later" while it's being played.
    const missing = follows.filter((f) => f.league !== 'other' && f.league !== 'afl' && f.snap &&
      !byKey.has(f.key) && f.snap.state !== 'post' && f.snap.start &&
      Date.parse(f.snap.start) < Date.now() + 15 * 60_000 &&
      results[leagues.indexOf(f.league)]?.status === 'fulfilled');
    const days = [...new Set(missing.map((f) => `${f.league}|${f.snap.start.slice(0, 10).replaceAll('-', '')}`))];
    await Promise.allSettled(days.map(async (k) => {
      const [league, date] = k.split('|');
      for (const ev of await getLeagueDay(league, date)) byKey.set(`${league}:${ev.id}`, ev);
    }));
    for (const f of follows) {
      const fresh = byKey.get(f.key);
      if (fresh) { f.snap = fresh; f.seenAt = Date.now(); }
    }
    autoFollowFavourites(byKey);
    autoClearFinished();
    // Live cricket: who's batting, who's bowling and this over, for the card.
    await Promise.allSettled(follows.filter((f) => f.league === 'cricket' && f.snap).map(async (f) => {
      if (f.snap.state !== 'in') { delete f.live; return; }
      const data = await getPlays(f);
      f.live = data.kind === 'cricket' ? data.current : null;
    }));
    // Player stats: only for games with tracked players, only while live
    // (plus one last fetch at full time for the final numbers).
    const needStats = follows.filter((f) => f.tracked?.length && f.snap &&
      (f.snap.state === 'in' || (f.snap.state === 'post' && !f.finalStats)));
    await Promise.allSettled(needStats.map(async (f) => {
      const { players } = await getPlayers(f);
      f.stats = f.stats || {};
      // Always replace what's saved, so stale numbers never linger on the card.
      for (const p of players) {
        if (f.tracked.some((t) => t.id === p.id)) f.stats[p.id] = p.groups;
      }
      announceTargets(f);
      f.statsAt = Date.now();
      if (f.snap.state === 'post') f.finalStats = true;
    }));
    lastSync = Date.now();
    save();
    render();
  })().finally(() => { inflight = null; schedule(); });
  return inflight;
}

// Favourite teams: their live and upcoming games join the board by themselves
// (unless you removed that game, which is remembered).
function autoFollowFavourites(byKey) {
  if (!settings.favourites.length) return;
  for (const [key, ev] of byKey) {
    const league = key.split(':')[0];
    if (ev.state === 'post' || ev.kind === 'field') continue;
    if (follows.some((f) => f.key === key) || settings.dismissed.includes(key)) continue;
    if (!(ev.competitors || []).some((c) => isFavourite(league, c))) continue;
    if (ev.start && Date.parse(ev.start) - Date.now() > 7 * 86_400_000) continue;
    follow({ ...ev, league });
    follows[follows.length - 1].auto = true;
  }
}
// Optional: finished games leave the board a day after full time.
function autoClearFinished() {
  const now = Date.now();
  for (const f of follows) if (stateOf(f) === 'post' && !f.finishedAt) f.finishedAt = now;
  if (!settings.autoClear) return;
  follows = follows.filter((f) => !(stateOf(f) === 'post' && f.league !== 'other' && now - (f.finishedAt || now) > 86_400_000));
}

function nextDelay() {
  const now = Date.now();
  const feedFollows = follows.filter((f) => f.league !== 'other' && f.snap);
  if (feedFollows.some((f) => f.snap.state === 'in' && !f.snap.pause)) return POLL.live;
  // At stumps nothing changes until play resumes; at lunch or tea check every minute.
  if (feedFollows.some((f) => f.snap.state === 'in' && f.snap.pause &&
    (!resumeAt(f.snap) || resumeAt(f.snap) - now < 30 * 60_000))) return POLL.soon;
  const soon = feedFollows.some((f) => {
    if (f.snap.state !== 'pre' || !f.snap.start) return false;
    return Date.parse(f.snap.start) - now < 30 * 60_000; // starts within 30 min
  });
  return soon ? POLL.soon : POLL.idle;
}

function schedule() {
  clearTimeout(timer);
  timer = null;
  if (DEMO || document.hidden || (!follows.some((f) => f.league !== 'other') && !settings.favourites.length)) { setSync(); return; }
  timer = setTimeout(refresh, nextDelay());
  setSync();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(timer); timer = null; setSync(); }
  else refresh();
});

// ---------- sync indicator ----------

const syncBtn = document.getElementById('sync');
const syncLabel = document.getElementById('sync-label');
syncBtn.addEventListener('click', () => refresh());

function setSync(text) {
  if (DEMO) { syncLabel.textContent = 'Sample'; syncBtn.classList.remove('is-live', 'is-error'); return; }
  const live = follows.some((f) => stateOf(f) === 'in');
  syncBtn.classList.toggle('is-live', live && !syncError);
  syncBtn.classList.toggle('is-error', syncError);
  if (text) { syncLabel.textContent = text; return; }
  if (syncError) syncLabel.textContent = 'Retrying';
  else if (!lastSync) syncLabel.textContent = follows.length ? 'Waiting' : 'Up to date';
  else syncLabel.textContent = live ? `Live, ${ago(lastSync)}` : `Updated ${ago(lastSync)}`;
}
setInterval(() => { if (!document.hidden && !inflight) setSync(); }, 15_000);

// ---------- board ----------

const board = document.getElementById('board');
const empty = document.getElementById('empty');
document.getElementById('demo-note').hidden = !DEMO;
document.getElementById('exit-demo').addEventListener('click', exitDemo);
document.querySelector('.demo-link')?.addEventListener('click', (e) => { e.preventDefault(); enterDemo(); });
document.getElementById('today').textContent = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

function stateOf(f) {
  return f.league === 'other' ? f.custom.state : f.snap?.state || 'pre';
}

function render() {
  board.replaceChildren();
  empty.hidden = follows.length > 0;
  const groups = [
    ['in', 'Live now', follows.filter((f) => stateOf(f) === 'in')],
    ['pre', 'Later', follows.filter((f) => stateOf(f) === 'pre')
      .sort((a, b) => Date.parse(a.snap?.start || 0) - Date.parse(b.snap?.start || 0))],
    ['post', 'Finished', follows.filter((f) => stateOf(f) === 'post')],
  ];
  for (const [state, label, items] of groups) {
    if (!items.length) continue;
    const head = el('div', `section-head${state === 'in' ? ' is-live' : ''}`);
    head.append(el('h2', null, label), el('span', 'count', String(items.length)));
    if (state === 'post') {
      const clear = el('button', 'clear', 'Clear finished');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        follows = follows.filter((f) => stateOf(f) !== 'post');
        save(); render(); schedule();
      });
      head.append(clear);
    }
    board.append(head, ...items.map(card));
  }
  setSync();
}

function card(f) {
  const st = stateOf(f);
  const node = el('article', `game is-${st}${st === 'in' ? ' is-live' : ''}`);

  if (f.league === 'other') return customCard(f, node, st);

  const ev = f.snap;
  const head = el('div', 'game-head');
  head.append(
    el('span', 'league', LABEL[f.league] || f.league),
    el('span', 'context', ev?.group || (ev?.kind === 'field' ? ev.name : '')),
    clockEl(ev),
  );
  node.append(head);
  if (!ev) return node;

  if (ev.kind === 'field') {
    const list = ev.competitors || [];
    const top = list.slice(0, 3);
    const focus = f.focus ? list.find((c) => c.id === f.focus) : null;
    const rows = focus && !top.includes(focus) ? [...top, focus] : top;
    const wrap = el('div', 'sides');
    for (const c of rows) wrap.append(fieldRow(c, c === focus, f.league));
    if (!rows.length) wrap.append(el('p', 'detail', f.focusName ? `${f.focusName} isn't listed yet.` : 'Order appears once the session starts.'));
    node.append(wrap);
    makeOpenable(wrap, f);
  } else {
    const wrap = el('div', 'sides');
    const hasWinner = (ev.competitors || []).some((x) => x.winner);
    for (const c of ev.competitors || []) wrap.append(sideRow(c, st, st === 'post' && hasWinner && !c.winner));
    node.append(wrap);
    makeOpenable(wrap, f);
    // Cricket's one-liner ("Kent lead by 80 runs") is the most useful context.
    if (f.league === 'cricket' && ev.detail && st !== 'pre') node.append(el('p', 'detail', ev.detail));
    if (st === 'in' && ev.pause) node.append(el('p', 'detail resume', pauseLine(ev)));
    if (f.league === 'cricket' && st === 'in' && f.live) node.append(creaseBlock(f, f.live, ev.pause));
    // Soccer goals / NRL tries under the score: "Saka 23', Havertz 67'".
    const scorers = scorersBlock(f);
    if (scorers) node.append(scorers);
    if (f.tracked?.length) node.append(trackedBlock(f));
  }

  const foot = el('div', 'game-foot');
  foot.append(el('span', 'updated', st === 'pre' ? kickoffLong(ev.start) : f.seenAt ? `Updated ${ago(f.seenAt)}` : ''));
  if (hasDetail(f)) {
    const btn = el('button', 'btn-quiet', detailLabel(f));
    btn.type = 'button';
    btn.addEventListener('click', () => openDetail(f));
    foot.append(btn);
  }
  foot.append(shareBtn(f), removeBtn(f, ev.name));
  node.append(foot);
  return node;
}

// ---------- share as a picture ----------

function shareBtn(f) {
  const b = el('button', 'icon-btn');
  b.type = 'button';
  b.innerHTML = ICON.share;
  b.setAttribute('aria-label', `Share ${f.snap?.name || 'this game'} as a picture`);
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const canvas = await drawShareImage(shareData(f));
      const how = await shareCanvas(canvas, f.snap?.name || 'Sideline');
      if (how === 'saved') showToast('Picture saved', 'OK', () => {});
    } catch (e) {
      showToast(`Couldn't share (${e.message})`, 'OK', () => {});
    } finally { b.disabled = false; }
  });
  return b;
}

function shareData(f) {
  const ev = f.snap || {};
  const st = stateOf(f);
  const status = st === 'in' && ev.pause ? { text: ev.pause.toUpperCase() }
    : st === 'in'
    ? { text: f.league === 'cricket' || !ev.detail || ev.detail === 'In Progress' ? 'LIVE' : `LIVE  ${ev.detail}`, live: true }
    : st === 'post' ? { text: 'FINAL' } : { text: kickoff(ev.start) };
  const data = { league: LABEL[f.league] || f.league, context: ev.group || '', status, lines: [], players: [] };
  if (ev.kind === 'field') {
    const list = ev.competitors || [];
    const rows = list.slice(0, 5);
    const focus = f.focus && list.find((c) => c.id === f.focus);
    if (focus && !rows.includes(focus)) rows.push(focus);
    data.context = ev.name || data.context;
    data.field = rows.map((c) => ({
      pos: !c.pos ? '–' : f.league === 'f1' && /^\d+$/.test(c.pos) ? `P${c.pos}` : c.pos,
      name: c.name, val: c.score ?? '', focus: c === focus,
    }));
  } else {
    const hasWinner = (ev.competitors || []).some((c) => c.winner);
    data.sides = (ev.competitors || []).slice(0, 2).map((c) => {
      const raw = st === 'pre' || c.score == null ? '' : String(c.score);
      const m = /^(.*?)\s*\((.+)\)\s*$/.exec(raw);
      const color = teamColor(c);
      return {
        abbr: abbrev(c), name: c.name, color: /^#/.test(color) ? color : '#556270',
        score: m ? m[1] : raw, sub: m ? m[2] : '', lost: st === 'post' && hasWinner && !c.winner,
      };
    });
    if (f.league === 'cricket' && ev.detail && st !== 'pre') data.lines.push(ev.detail);
    if (st === 'in' && ev.pause) data.lines.push(pauseLine(ev));
    if (f.league === 'cricket' && st === 'in' && f.live) {
      const c = f.live;
      const bats = (c.crease || []).map((b) => `${b.name} ${b.runs}${b.id === c.striker ? '*' : ''} (${b.balls})`).join(', ');
      if (bats) data.lines.push(`Batting: ${bats}`);
      if (c.bowler) data.lines.push(`Bowling: ${c.bowler.name} ${c.bowler.wickets}/${c.bowler.conceded} (${c.bowler.overs} ov)`);
    }
    const tl = ev.timeline || [];
    if (['epl', 'nrl'].includes(f.league)) {
      const wanted = f.league === 'nrl' ? 'try' : 'goal';
      for (const c of ev.competitors || []) {
        const mine = tl.filter((e) => e.type === wanted && e.team === c.short && e.scorer);
        if (mine.length) data.lines.push(`${c.short}: ${mine.map((e) => `${e.scorer.split(' ').slice(-1)[0]} ${e.when}`).join(', ')}`);
      }
    }
  }
  for (const t of f.tracked || []) {
    const groups = f.stats?.[t.id] || [];
    // Target stats first (they're left out of the card's chips), then the rest.
    const targeted = Object.keys(t.targets || {}).map((k) => findStat(groups, k)).filter(Boolean);
    const rest = t.mode === 'all' ? groups.flatMap((g) => g.stats) : shownStats(t, groups);
    const stats = [...targeted, ...rest.filter((s) => !targeted.some((x) => x.key === s.key))]
      .filter((s) => /^[-+]?[\d.,/:%\s-]+$/.test(String(s.value)))
      .map((s) => [String(s.value), statName(s).replace(/\btouchdowns\b/i, 'TDs').replace(/\btouchdown\b/i, 'TD')]);
    if (stats.length) data.players.push({ name: t.name, team: t.team, stats });
  }
  return data;
}

// Cricket on the card: the batters in, the bowler, this over ball by ball,
// and the rates. Readable at a glance, like a TV score bug.
function creaseBlock(f, c, paused) {
  const wrap = el('div', `crease${paused ? ' paused' : ''}`);
  const comp = (f.snap?.competitors || []).find((x) => x.short === c.team);
  if (comp) paintTeam(wrap, comp);
  const bats = el('div', 'cr-bats');
  for (const b of c.crease || []) {
    const row = el('span', `cr-bat${b.id === c.striker ? ' on-strike' : ''}`);
    row.append(el('span', 'cr-name', shortPerson(b.name)), el('b', null, String(b.runs)), el('span', 'cr-balls', `(${b.balls})`));
    if (b.id === c.striker) row.title = 'On strike';
    bats.append(row);
  }
  if ((c.crease || []).length < 2) bats.append(el('span', 'cr-bat cr-new', 'New batter'));
  wrap.append(bats);
  if (c.bowler) {
    const bw = el('div', 'cr-bowl');
    bw.append(el('span', 'cr-name', shortPerson(c.bowler.name)),
      el('span', null, `${c.bowler.wickets}/${c.bowler.conceded}`),
      el('span', 'cr-balls', `${c.bowler.overs} ov`));
    wrap.append(bw);
  }
  if (paused) return wrap; // batters and bowler only: the over and rates mean little at a break
  wrap.append(overStrip(c.thisOver, `Over ${c.overNumber}`));
  const rates = [
    c.runRate && `Run rate ${c.runRate}`,
    c.rrr && `Required ${c.rrr}`,
    c.limited && c.need != null && c.remaining > 0 && `Need ${c.need} off ${c.remaining}`,
  ].filter(Boolean);
  if (rates.length) wrap.append(el('div', 'cr-rates', rates.join('   ')));
  return wrap;
}
function overStrip(tokens, label) {
  const row = el('div', 'over-strip');
  if (label) row.append(el('span', 'os-label', label));
  for (const t of tokens || []) row.append(el('span', `ball ${ballClass(t)}`, t));
  return row;
}
function ballClass(t) {
  if (t === 'W') return 'b-w';
  if (t === '6') return 'b-6';
  if (t === '4') return 'b-4';
  if (t === '•') return 'b-dot';
  if (/wd|nb|lb|b$/.test(t)) return 'b-x';
  return 'b-run';
}
function shortPerson(name) {
  const parts = String(name || '').split(' ');
  return parts.length > 1 ? `${parts[0][0]} ${parts.slice(1).join(' ')}` : name;
}

function scorersBlock(f) {
  const tl = f.snap?.timeline;
  if (!tl?.length || !['epl', 'nrl'].includes(f.league)) return null;
  const wanted = f.league === 'nrl' ? 'try' : 'goal';
  const wrap = el('div', 'scorers');
  let any = false;
  for (const c of f.snap.competitors || []) {
    const mine = tl.filter((e) => e.type === wanted && e.team === c.short && e.scorer);
    if (!mine.length) continue;
    any = true;
    // Group repeat scorers: "To'o 3', 24', 30'".
    const byName = new Map();
    for (const e of mine) {
      const surname = e.scorer.split(' ').slice(-1)[0];
      const tag = e.flag === 'Pen' ? ' pen' : e.flag === 'OG' ? ' og' : '';
      byName.set(surname, [...(byName.get(surname) || []), `${e.when}${tag}`]);
    }
    const line = el('p', 'scorer-line');
    line.append(el('b', null, c.short), ` ${[...byName].map(([n, ts]) => `${n} ${ts.join(', ')}`).join('; ')}`);
    wrap.append(line);
  }
  return any ? wrap : null;
}

// Tapping the scores opens the box score / scorecard / leaderboard.
function makeOpenable(node, f) {
  if (!hasDetail(f)) return;
  node.classList.add('openable');
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.setAttribute('aria-label', `${detailLabel(f)} for ${f.snap?.name || 'this game'}`);
  node.addEventListener('click', () => openDetail(f));
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(f); } });
}

// Overnight in a multi-day match, the next day starts at the same local time
// as day one, so the resume time is day one's start rolled forward.
function resumeAt(ev) {
  if (ev?.pause !== 'Stumps' || !ev.start) return null;
  const first = Date.parse(ev.start);
  if (!Number.isFinite(first)) return null;
  const now = Date.now();
  let t = first;
  while (t <= now) t += 86_400_000;
  return t;
}
function untilText(ms) {
  const mins = Math.max(0, Math.round((ms - Date.now()) / 60_000));
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `in ${h}h${m ? ` ${m}m` : ''}`;
}
function pauseLine(ev) {
  if (!ev?.pause) return null;
  const day = ev.day ? `Day ${ev.day}. ` : '';
  const at = resumeAt(ev);
  if (at) {
    const d = new Date(at);
    const days = Math.round((new Date(d.toDateString()) - new Date(new Date().toDateString())) / 86_400_000);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const when = days === 0 ? `today ${time}` : days === 1 ? `tomorrow ${time}` : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
    return `${ev.pause}, ${day}Play resumes ${when} (${untilText(at)}), your time.`;
  }
  return `${ev.pause}. ${day}Play will resume shortly.`;
}

function clockEl(ev) {
  if (!ev) return el('span', 'clock', '');
  if (ev.state === 'in' && ev.pause) return el('span', 'clock paused', ev.pause);
  // Cricket's detail is a sentence ("SA require 380 runs"); it's shown under the score instead.
  if (ev.state === 'in') return el('span', 'clock live', ev.league !== 'cricket' && ev.detail && ev.detail !== 'In Progress' ? ev.detail : 'Live');
  if (ev.state === 'post') return el('span', 'clock', /final|full|ft/i.test(ev.detail || '') ? 'Final' : (ev.detail || 'Final'));
  return el('span', 'clock', kickoff(ev.start));
}

function sideRow(c, state, lost) {
  const row = el('div', `side${lost ? ' lost' : ''}`);
  paintTeam(row, c);
  // ESPN sends "0" before kick-off; show nothing until the game starts.
  const score = state === 'pre' || c.score === '' || c.score == null ? null : String(c.score);
  const isText = score != null && /[^\d]/.test(score); // "238/6 (42 ov)", "10.4 (64)"
  const pts = el('span', `pts${isText ? ' text' : ''}${score == null ? ' blank' : ''}`);
  // Cricket: "284 & 41/1 (13 ov, target 421)" -> big "284 & 41/1", small "13 ov, target 421".
  const m = score && /^(.*?)\s*\((.+)\)\s*$/.exec(score);
  if (m) pts.append(el('span', 'pts-main', m[1]), el('span', 'pts-sub', m[2]));
  else pts.textContent = score ?? '';
  row.append(el('span', 'bar'), el('span', 'badge', abbrev(c)), el('span', 'team', c.name), pts);
  return row;
}

function fieldRow(c, isFocus, league) {
  const row = el('div', `field-row${isFocus ? ' focus' : ''}`);
  // F1 positions read "P3"; golf already arrives as "3", "T3" or "CUT".
  const pos = !c.pos ? '–' : league === 'f1' && /^\d+$/.test(c.pos) ? `P${c.pos}` : c.pos;
  row.append(el('span', 'pos', pos), el('span', 'who', c.name), el('span', 'val', c.score ?? ''));
  return row;
}

function customCard(f, node, st) {
  const head = el('div', 'game-head');
  head.append(el('span', 'league', 'Other'), el('span', 'context', 'Updated by you'),
    el('span', `clock${st === 'in' ? ' live' : ''}`, { pre: 'Upcoming', in: 'Live', post: 'Finished' }[st]));
  node.append(head, el('div', 'custom-title', f.custom.title));
  if (f.custom.note) node.append(el('div', 'custom-note', f.custom.note));

  const seg = el('div', 'segmented');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Status');
  for (const [s, text] of [['pre', 'Upcoming'], ['in', 'Live'], ['post', 'Finished']]) {
    const b = el('button', null, text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s === st));
    b.addEventListener('click', () => { f.custom.state = s; save(); render(); });
    seg.append(b);
  }
  node.append(seg);

  const foot = el('div', 'game-foot');
  const edit = el('button', 'btn-quiet', f.custom.note ? 'Edit note' : 'Add note');
  edit.type = 'button';
  edit.addEventListener('click', () => {
    // Swap the footer for an inline editor.
    const input = el('input', 'search note-input');
    input.id = `note-${f.key}`;
    input.value = f.custom.note || '';
    input.placeholder = 'Result or note';
    input.setAttribute('aria-label', 'Note');
    const saveBtn = el('button', 'btn-quiet', 'Save');
    saveBtn.type = 'button';
    const commit = () => { f.custom.note = input.value.trim(); save(); render(); };
    saveBtn.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    foot.replaceChildren(input, saveBtn);
    input.focus();
  });
  foot.append(el('span', 'updated', ''), edit, removeBtn(f, f.custom.title));
  node.append(foot);
  return node;
}

// Remove straight away, with an Undo bar for a few seconds.
function removeBtn(f, name) {
  const b = el('button', 'icon-btn');
  b.type = 'button';
  b.innerHTML = ICON.close;
  b.setAttribute('aria-label', `Remove ${name || 'game'}`);
  b.addEventListener('click', () => {
    const index = follows.indexOf(f);
    follows = follows.filter((x) => x !== f);
    rememberDismissed(f.key);
    save(); render(); schedule();
    showToast(`Removed ${shortName(name)}`, 'Undo', () => {
      follows.splice(Math.min(index, follows.length), 0, f);
      settings.dismissed = settings.dismissed.filter((k) => k !== f.key);
      saveSettings();
      save(); render(); schedule();
    });
  });
  return b;
}

// Removing a game stops a favourite team's game being re-added.
function rememberDismissed(key) {
  if (!settings.favourites.length || settings.dismissed.includes(key)) return;
  settings.dismissed = [...settings.dismissed, key].slice(-200);
  saveSettings();
}

const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(message, actionLabel, action) {
  clearTimeout(toastTimer);
  const btn = el('button', 'toast-action', actionLabel);
  btn.type = 'button';
  btn.addEventListener('click', () => { action(); toast.hidden = true; });
  toast.replaceChildren(el('span', null, message), btn);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function shortName(name) {
  return !name ? 'game' : name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

// Tracked players: pinned stats (or the first few) as big numerals.
function trackedBlock(f) {
  const wrap = el('div', 'tracked');
  for (const t of f.tracked) {
    const groups = f.stats?.[t.id];
    const line = el('button', 'tp');
    line.type = 'button';
    line.setAttribute('aria-label', `${t.name}: all stats`);
    const head = el('span', 'tp-head');
    head.append(el('span', 'tp-name', t.name));
    if (t.team) head.append(el('span', 'tp-team', t.team));
    line.append(head);
    const tgts = targetRows(f, t, groups || []);
    if (tgts) line.append(tgts);
    if (!groups?.length) {
      const stats = el('span', 'tp-stats');
      stats.append(el('span', 'tp-wait', f.snap.state === 'pre' ? 'Stats appear at kick-off' : 'No stats yet'));
      line.append(stats);
    } else if (t.mode === 'all') {
      // Every stat, grouped (Passing, Rushing… or each innings).
      for (const g of groups) {
        if (groups.length > 1) line.append(el('span', 'tp-group', g.label));
        line.append(statChips(g.stats));
      }
    } else {
      line.append(statChips(shownStats(t, groups)));
    }
    line.addEventListener('click', () => openPlayer(f, t.id, () => sheet.close()));
    wrap.append(line);
  }
  return wrap;
}

function statChips(list) {
  const stats = el('span', 'tp-stats');
  for (const s of list) {
    const isText = !/^[-+]?[\d.,/:%\s-]+$/.test(String(s.value)); // "c Smith b Jones", "not out"
    const c = el('span', `tp-stat${isText ? ' text' : ''}`);
    c.append(el('b', null, s.value), el('span', null, statName(s)));
    stats.append(c);
  }
  return stats;
}

// The chosen stats; with none chosen yet, the first four of the main group.
// Choices are stored without the innings ("bowling.wickets"), so in cricket
// they follow the player into their latest innings.
// A stat's name as people say it: "Passing yards", "Runs conceded", "Wickets".
// ESPN's full names, in sentence case; abbreviations only as a fallback.
// Safety net for older cached data: the Worker already sends readable roles.
const ROLE_NAMES = { WK: 'Wicketkeeper', BT: 'Batter', BAT: 'Batter', BL: 'Bowler', BOWL: 'Bowler', AR: 'All-rounder' };
function roleName(pos) {
  const raw = String(pos || '').trim();
  if (!raw || /^(UKN|UNK|UNKNOWN|NA|N\/A|-+|\?)$/i.test(raw)) return '';
  return ROLE_NAMES[raw.toUpperCase()] || raw;
}

const plural = (n, word) => `${n} ${word}${String(n) === '1' ? '' : 's'}`;

// One plain-English line for a player in the list, e.g.
// "48 runs off 38 balls, 6 fours" or "3 wickets for 51 runs, 18 overs".
function playerSummary(p) {
  const g = p.groups[0];
  if (!g) return '';
  const v = (k) => g.stats.find((s) => s.key === k || String(s.key).endsWith(`.${k}`))?.value;
  if (/-batting$/.test(g.group || '')) {
    const r = v('runs'); const b = v('ballsFaced'); const fours = v('fours'); const sixes = v('sixes');
    if (r == null) return '';
    const notOut = /not out/i.test(v('howOut') || '') ? '*' : '';
    return [
      `${notOut ? `${r}* not out` : plural(r, 'run')}${b != null ? ` off ${plural(b, 'ball')}` : ''}`,
      Number(fours) > 0 ? plural(fours, 'four') : '',
      Number(sixes) > 0 ? plural(sixes, 'six').replace(/sixs$/, 'sixes') : '',
    ].filter(Boolean).join(', ');
  }
  if (/-bowling$/.test(g.group || '')) {
    const w = v('wickets'); const r = v('conceded'); const o = v('overs');
    if (w == null) return '';
    return [`${plural(w, 'wicket')} for ${plural(r ?? 0, 'run')}`, o != null ? plural(o, 'over') : ''].filter(Boolean).join(', ');
  }
  return g.stats
    .filter((s) => s.value !== '' && s.value != null && !/^(-|--|0-0)$/.test(s.value))
    .slice(0, 2)
    .map((s) => {
      const name = statName(s).toLowerCase();
      return `${s.value} ${String(s.value) === '1' ? singular(name) : name}`;
    })
    .join(', ');
}

// "1 tackles" -> "1 tackle", "1 rushing attempts" -> "1 rushing attempt".
function singular(phrase) {
  return phrase.replace(/(\w+)$/, (w) => (/ies$/.test(w) ? w.replace(/ies$/, 'y') : /[^s]s$/.test(w) ? w.slice(0, -1) : w));
}

function statName(s) {
  const raw = (s.label && s.label !== s.abbr ? s.label : (s.abbr || s.short || ''))
    .replace(/^Meters Run$/i, 'Run metres').replace(/\bMeters\b/g, 'Metres');
  return raw
    .split(' ')
    .map((w, i) => (i === 0 || /^[A-Z0-9/+-]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

function shownStats(t, groups) {
  const multi = groups.length > 1;
  const all = groups.flatMap((g) => g.stats.map((s) => ({
    ...s,
    generic: genericKey(s.key),
    short: multi && groupShort(g.group) ? `${groupShort(g.group)} ${s.abbr}` : s.abbr,
  })));
  const targeted = new Set(Object.keys(t.targets || {}));
  const rest = all.filter((s) => !targeted.has(s.generic));
  if (t.pins?.length) return t.pins.filter((k) => !targeted.has(k)).map((k) => rest.find((s) => s.generic === k || s.key === k)).filter(Boolean);
  return rest.slice(0, 4);
}

// "passing" -> "Pass"; cricket's "inn2-bowling" -> "Bowl".
function groupShort(group) {
  return GROUP_SHORT[group] || GROUP_SHORT[String(group).split('-')[1]] || '';
}

// ---------- team colours ----------

function paintTeam(node, c) {
  const color = c.color || hashColor(c.name || c.short || '');
  node.style.setProperty('--team', color);
  node.style.setProperty('--on-team', readableOn(color));
}
// Two teams in near-identical colours (Rams and Bills are both navy) would
// be unreadable on a chart, so the second one switches to neutral grey.
function distinctFrom(a, b) {
  const rgb = (c) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(c));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return b;
  const dist = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  return dist < 90 ? '#9AA3AD' : b;
}
function teamColor(c) {
  return c?.color || hashColor(c?.name || c?.short || '');
}
function abbrev(c) {
  if (c.short) return c.short.slice(0, 4);
  const words = String(c.name || '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : words[0] || '?').slice(0, 3).toUpperCase();
}
// Teams without official colours get a stable, muted colour from their name.
function hashColor(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 42% 38%)`;
}
function readableOn(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1C2127' : '#fff';
}

// ---------- sheet ----------

const sheet = document.getElementById('add');
const chips = document.getElementById('league-chips');
const body = document.getElementById('add-body');
const title = document.getElementById('add-title');
const backBtn = document.getElementById('sheet-back');
let current = 'nfl';
let backAction = null;

document.querySelectorAll('[data-open-add]').forEach((b) => b.addEventListener('click', openAdd));
sheet.addEventListener('close', () => { scrollMemory.clear(); body.dataset.view = ''; pendingScroll = null; render(); refresh(); });
backBtn.addEventListener('click', () => backAction?.());
// Tap outside the sheet to close it.
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

const scrollMemory = new Map();
let pendingScroll = null;
// `view` names the screen (e.g. "game:nfl:401:box"). Named screens remember
// where you'd scrolled to: redrawing the same screen keeps its place, and
// going back to one returns you to where you left it.
function showSheet(heading, { back = null, withChips = false, view = '' } = {}) {
  title.textContent = heading;
  chips.hidden = !withChips;
  backAction = back;
  backBtn.hidden = !back;
  if (!sheet.open) sheet.showModal();
  const prev = body.dataset.view || '';
  if (prev) scrollMemory.set(prev, body.scrollTop);
  const same = !!view && prev === view;
  body.dataset.view = view;
  pendingScroll = view ? { key: view, top: same ? body.scrollTop : (scrollMemory.get(view) ?? 0) } : null;
  if (!view) body.scrollTop = 0;
  return same;
}

// Put the screen back where it belongs once its content is in. Called again
// after slower parts (form, recent games) load, unless you've scrolled since.
function settleScroll() {
  if (pendingScroll && body.dataset.view === pendingScroll.key) body.scrollTop = pendingScroll.top;
}
// A screen opened without a remembered spot (e.g. the default tab) can be renamed once its tab is known.
function renameView(key) {
  if (body.dataset.view === key) return;
  const fallback = pendingScroll?.top ?? 0;
  body.dataset.view = key;
  pendingScroll = { key, top: scrollMemory.get(key) ?? fallback };
}
for (const type of ['touchmove', 'wheel']) {
  body.addEventListener(type, () => { pendingScroll = null; }, { passive: true });
}

function openAdd() {
  chips.replaceChildren(...LEAGUES.map((l) => {
    const c = el('button', 'chip');
    c.append(sportIcon(l.id), el('span', null, l.label));
    c.type = 'button';
    c.setAttribute('aria-pressed', String(l.id === current));
    c.addEventListener('click', () => { current = l.id; openAdd(); });
    return c;
  }));
  showSheet('Follow a game', { withChips: true });
  chips.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  current === 'other' ? showCustomForm() : showEvents(current);
}

// Upcoming fixtures, or finished games from the last 7 days.
let fixtureWhen = 'upcoming';
function whenToggle(league) {
  const seg = el('div', 'segmented wide when-toggle');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Which games');
  for (const [k, label] of [['upcoming', 'Live & upcoming'], ['past', 'Past 7 days']]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(k === fixtureWhen));
    b.addEventListener('click', () => { if (fixtureWhen !== k) { fixtureWhen = k; showEvents(league); } });
    seg.append(b);
  }
  return seg;
}

async function showEvents(league) {
  // The sample board's games aren't real fixtures, so don't offer them.
  if (DEMO) {
    const exit = el('button', 'btn-primary wide', 'Exit sample board');
    exit.type = 'button';
    exit.addEventListener('click', exitDemo);
    body.replaceChildren(el('p', 'hint', 'This is the sample board, so it can’t follow real games. Exit it to build your own board with live fixtures.'), exit);
    return;
  }
  const past = fixtureWhen === 'past';
  const toggle = whenToggle(league);
  body.replaceChildren(toggle, skeleton('list', 6));
  let events;
  try {
    events = DEMO ? demoFixtures(league).filter((e) => (e.state === 'post') === past) : await getLeague(league, past);
  } catch (e) {
    body.replaceChildren(toggle, el('p', 'hint', `${LABEL[league]} ${past ? 'results' : 'fixtures'} didn't load (${e.message}). Tap the sport to try again.`));
    return;
  }
  if (current !== league || past !== (fixtureWhen === 'past')) return;

  // Some feeds (the NFL's) return the whole week, finished games included.
  // Those belong under Past 7 days, so this list is only live and upcoming.
  if (!past) events = events.filter((e) => e.state !== 'post');

  if (!events.length) {
    body.replaceChildren(toggle, el('p', 'hint', past
      ? `No ${LABEL[league]} games finished in the past 7 days.`
      : `No ${LABEL[league]} games are live or coming up in the next week. Finished games are under Past 7 days. To track something without a feed, use Other.`));
    return;
  }
  // Results read newest first; fixtures soonest first.
  events.sort(past
    ? (a, b) => Date.parse(b.start || 0) - Date.parse(a.start || 0)
    : (a, b) => rank(a) - rank(b) || Date.parse(a.start) - Date.parse(b.start));

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = league === 'golf' || league === 'f1' ? 'Search events' : 'Search teams';
  search.setAttribute('aria-label', 'Search fixtures');
  const list = el('div');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = events.filter((e) => !q || haystack(e).includes(q)).slice(0, 80);
    const out = [];
    let lastDay = null;
    for (const e of shown) {
      const day = e.state === 'in' ? 'Live now' : dayLabel(e.start);
      if (day !== lastDay) { out.push(el('div', 'day', day)); lastDay = day; }
      out.push(fixtureRow(e));
    }
    if (!out.length) out.push(el('p', 'hint', `Nothing matches "${search.value}".`));
    list.replaceChildren(...out);
  };
  search.addEventListener('input', draw);
  body.replaceChildren(toggle, search, list);
  draw();
}

function fixtureRow(ev) {
  const key = `${ev.league}:${ev.id}`;
  const row = el('div', 'fixture');
  const when = el('span', `when${ev.state === 'in' ? ' live' : ''}`,
    ev.state === 'in' ? 'Live' : ev.state === 'post' ? 'Final' : timeOnly(ev.start));

  const teams = el('div', 'teams');
  if (ev.kind === 'field' || !(ev.competitors || []).length) {
    teams.append(el('span', 'line', ev.name));
    if (ev.group && ev.group !== ev.name) teams.append(el('span', 'sub', ev.group));
  } else {
    for (const c of ev.competitors) {
      const line = el('span', 'line');
      paintTeam(line, c);
      line.append(el('span', 'badge', abbrev(c)), el('span', 'fx-name', c.name));
      if (ev.state === 'post' && c.score != null && c.score !== '') {
        line.append(el('span', `fx-score${c.winner === false && ev.competitors.some((x) => x.winner) ? ' lost' : ''}`, String(c.score)));
      }
      teams.append(line);
    }
    if (ev.group) teams.append(el('span', 'sub', ev.group));
  }

  const already = follows.some((f) => f.key === key && !f.focus);
  const btn = el('button', `follow-btn${already ? ' on' : ''}`, already ? '✓ Following' : ev.kind === 'field' ? 'Choose' : 'Follow');
  btn.type = 'button';
  btn.addEventListener('click', () => {
    if (ev.kind === 'field') return showField(ev);
    if (follows.some((f) => f.key === key && !f.focus)) {
      follows = follows.filter((f) => !(f.key === key && !f.focus));
      btn.textContent = 'Follow';
      btn.classList.remove('on');
    } else {
      follow(ev);
      btn.textContent = '✓ Following';
      btn.classList.add('on');
    }
    save();
  });
  row.append(when, teams, btn);
  return row;
}

// Golf / F1: follow the whole leaderboard, or pin one player or driver.
function showField(ev) {
  showSheet(ev.name, { back: openAdd });
  const key = `${ev.league}:${ev.id}`;
  const rows = [];
  const whole = rowButton('Top of the leaderboard', 'Shows the top three', follows.some((f) => f.key === key && !f.focus) ? 'Following' : 'Follow');
  whole.addEventListener('click', () => { follow(ev); markOn(whole); });
  rows.push(whole, el('div', 'day', 'Or follow one'));
  for (const c of ev.competitors || []) {
    const on = follows.some((f) => f.key === key && f.focus === c.id);
    const b = rowButton(c.name, c.pos ? `Currently ${c.pos}` : '', on ? 'Following' : 'Follow');
    b.addEventListener('click', () => { follow(ev, c); markOn(b); });
    rows.push(b);
  }
  if (!(ev.competitors || []).length) rows.push(el('p', 'hint', 'The field appears here once the event starts.'));
  body.replaceChildren(...rows);
}

function rowButton(t, s, act) {
  const b = el('button', 'row-btn');
  b.type = 'button';
  b.append(el('span', 't', t), el('span', 's', s), el('span', `act${act === 'Following' || act === 'Tracking' ? ' on' : ''}`, act));
  return b;
}
function markOn(b) {
  const act = b.querySelector('.act');
  act.textContent = 'Following';
  act.classList.add('on');
}

function follow(ev, focusComp) {
  const key = `${ev.league}:${ev.id}`;
  follows = follows.filter((f) => !(f.key === key && f.focus === (focusComp?.id ?? null)));
  follows.push({
    key,
    league: ev.league,
    id: ev.id,
    focus: focusComp?.id ?? null,
    focusName: focusComp?.name ?? null,
    snap: ev,
    seenAt: Date.now(),
    addedAt: Date.now(),
  });
  save();
}

function showCustomForm() {
  const wrap = el('div', 'form-field');
  const tLabel = el('label', null, 'Event');
  tLabel.htmlFor = 'custom-title';
  const t = el('input', 'search');
  t.id = 'custom-title';
  t.placeholder = 'Race 7, Flemington';
  const nLabel = el('label', null, 'Note');
  nLabel.htmlFor = 'custom-note';
  const n = el('input', 'search');
  n.id = 'custom-note';
  n.placeholder = 'Optional';
  const add = el('button', 'btn-primary wide', 'Add to board');
  add.type = 'button';
  add.addEventListener('click', () => {
    const titleText = t.value.trim();
    if (!titleText) { t.focus(); return; }
    follows.push({
      key: `other:${crypto.randomUUID()}`,
      league: 'other',
      custom: { title: titleText, note: n.value.trim(), state: 'pre' },
      addedAt: Date.now(),
    });
    save();
    sheet.close();
  });
  wrap.append(
    el('p', 'hint', 'For events without a free live feed, like racing. You set the status yourself.'),
    tLabel, t, nLabel, n, add,
  );
  body.replaceChildren(wrap);
}

// ---------- game screen ----------

let gameCache = null; // { key, data, at } for the open game

async function getGame(f) {
  if (gameCache?.key === f.key && Date.now() - gameCache.at < 15_000) return gameCache.data;
  let data;
  if (DEMO) {
    data = f.demoGame || { teams: [], periods: null, tables: [], teamStats: null, events: [], players: f.demoPlayers || [], source: 'boxscore' };
  } else {
    const ev = f.snap;
    const qs = new URLSearchParams({ league: f.league, event: ev.summaryId || ev.id });
    if (ev.series) qs.set('series', ev.series);
    const res = await apiFetch(`${API}/api/game?${qs}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
    data = body;
    if (f.league === 'ufc') {
      // A UFC summary covers the whole card; keep just this bout's two fighters.
      const ids = new Set((ev.competitors || []).map((c) => c.id));
      data.players = data.players.filter((p) => ids.has(p.id));
      data.tables = data.tables.map((t) => ({ ...t, rows: t.rows.filter((r) => ids.has(r.id)) })).filter((t) => t.rows.length);
    }
  }
  gameCache = { key: f.key, data, at: Date.now() };
  return data;
}

function detailLabel(f) {
  if (f.snap?.kind === 'field') return 'Leaderboard';
  return f.league === 'cricket' ? 'Scorecard' : 'Box score';
}
function hasDetail(f) {
  return f.snap?.kind === 'field' || PLAYER_LEAGUES.has(f.league);
}

function openDetail(f, tab) {
  if (f.snap?.kind === 'field') return openLeaderboard(f);
  return openGame(f, tab);
}

// Tabs appear only when ESPN publishes that part of the game:
//   cricket  Scorecard · Players
//   soccer   Summary (goals, cards) · Team stats · Players
//   others   Box score · Team stats · Scoring · Players
async function openGame(f, tab) {
  const view = `game:${f.key}:${tab || 'default'}`;
  // Redrawing the same screen keeps what's there while new data loads, so nothing jumps.
  if (!showSheet(f.snap?.name || 'Game', { view })) body.replaceChildren(skeleton('game', 6));
  let g;
  try { g = await getGame(f); }
  catch (e) { body.replaceChildren(el('p', 'hint', `The game didn't load. ${e.message}.`)); return; }
  if (body.dataset.view !== view) return; // you've moved on to another screen

  // Some sports list scorers only in the live score feed (NRL tries, soccer goals).
  const events = g.events?.length ? g.events : (f.snap?.timeline || []);
  const isSoccer = f.league === 'epl';
  const hasInfo = !!(g.info || g.injuries?.length || g.series);

  const tabs = [];
  if (isSoccer && events.length) tabs.push(['events', 'Summary']);
  if (isSoccer && g.lineups?.length) tabs.push(['lineups', 'Line-ups']);
  if (g.innings?.length) tabs.push(['box', 'Scorecard']);
  else if (g.tables.length || g.periods || g.leaders?.length) tabs.push(['box', isSoccer ? 'Player stats' : 'Box score']);
  if (g.teamStats) tabs.push(['team', 'Team stats']);
  if (!isSoccer && events.length) tabs.push(['events', f.league === 'nrl' ? 'Tries & goals' : 'Scoring']);
  if (PLAYS_LEAGUES.has(f.league) && f.snap?.state !== 'pre') {
    tabs.splice(Math.min(1, tabs.length), 0, ['plays', { cricket: 'Ball by ball', epl: 'Commentary' }[f.league] || 'Plays']);
  }
  if (FORM_LEAGUES.has(f.league)) tabs.push(['form', 'Form']);
  if (hasInfo) tabs.push(['info', 'Info']);
  tabs.push(['players', 'Players']);
  const active = tabs.some(([id]) => id === tab) ? tab : tabs[0][0];

  const bar = el('div', 'tabs');
  bar.setAttribute('role', 'tablist');
  for (const [id, label] of tabs) {
    const b = el('button', 'tab', label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(id === active));
    b.addEventListener('click', () => openGame(f, id));
    bar.append(b);
  }

  const panel = el('div', 'tab-panel');
  if (active === 'box') {
    if (g.leaders?.length && !g.innings?.length) panel.append(leadersBlock(f, g));
    panel.append(...(g.innings?.length ? scorecardPanel(f, g) : boxPanel(f, g)));
  }
  if (active === 'team') panel.append(teamStatsPanel(f, g));
  if (active === 'form') formPanel(f, g, panel);
  if (active === 'plays') playsPanel(f, g, panel);
  if (active === 'events') panel.append(eventsPanel(f, g, events));
  if (active === 'lineups') panel.append(...lineupsPanel(f, g));
  if (active === 'info') panel.append(...infoPanel(f, g));
  if (active === 'players') panel.append(...playersPanel(f, g));
  renameView(`game:${f.key}:${active}`);
  body.replaceChildren(matchHeader(f, g), bar, panel);
  settleScroll();
}

// Both teams and the score at the top of the game screen, plus ESPN's win
// probability (NFL, NBA) and the season series when there is one.
function matchHeader(f, g) {
  const ev = f.snap || {};
  const wrap = el('div', 'match-head');
  const row = el('div', 'mh-row');
  const sides = (ev.competitors || []).slice(0, 2);
  const side = (c) => {
    const box = el('div', 'mh-team');
    const badge = el('span', 'badge', abbrev(c));
    paintTeam(badge, c);
    const score = ev.state === 'pre' || c.score == null || c.score === '' ? '' : String(c.score).replace(/\s*\(.*\)$/, '');
    box.append(badge, el('span', 'mh-name', c.name), el('span', `mh-score${ev.state === 'post' && sides.some((x) => x.winner) && !c.winner ? ' lost' : ''}`, score));
    return box;
  };
  if (sides.length === 2) {
    wrap.classList.add('duo');
    wrap.style.setProperty('--home', teamColor(sides[0]));
    wrap.style.setProperty('--away', teamColor(sides[1]));
    const mid = el('div', 'mh-mid');
    mid.append(clockEl(ev));
    if (ev.state === 'pre') mid.append(el('span', 'mh-when', kickoffLong(ev.start)));
    else if (f.league === 'cricket' && ev.detail) mid.append(el('span', 'mh-when', ev.detail));
    if (ev.state === 'in' && ev.pause) mid.append(el('span', 'mh-when resume', pauseLine(ev)));
    row.append(side(sides[0]), mid, side(sides[1]));
    wrap.append(row);
  }
  if (g.winProb && sides.length === 2) {
    const wp = el('div', 'win-prob');
    const [home, away] = sides;
    const bar = el('div', 'wp-bar');
    const h = el('span', 'wp-home');
    h.style.width = `${g.winProb.home}%`;
    paintTeam(h, home);
    const aw = el('span', 'wp-away');
    paintTeam(aw, away);
    bar.append(h, aw);
    const labels = el('div', 'wp-labels');
    labels.append(el('span', null, `${home.short || home.name} ${g.winProb.home}%`),
      el('span', 'wp-title', g.winProb.live ? 'Win probability' : 'Pre-game projection'),
      el('span', null, `${g.winProb.away}% ${away.short || away.name}`));
    wp.append(labels, bar);
    wrap.append(wp);
  }
  if (g.series) wrap.append(el('p', 'mh-series', g.series));
  return wrap;
}

// "Game leaders": each team's top performer per category.
function leadersBlock(f, g) {
  const sec = el('section', 'leaders');
  const season = g.leaders.some((t) => t.scope === 'season');
  sec.append(el('h3', null, season ? (f.league === 'nfl' ? 'Season leaders, per game' : 'Season leaders') : 'Game leaders'));
  if (season) sec.append(el('p', 'hint small', 'The game hasn\u2019t started, so these are this season\u2019s leaders. They switch to this game\u2019s leaders at kick-off.'));
  const cats = [...new Set(g.leaders.flatMap((t) => t.categories.map((c) => c.label)))];
  for (const label of cats) {
    const block = el('div', 'leader-cat');
    block.append(el('div', 'lc-label', statName({ label })));
    for (const t of g.leaders) {
      const c = t.categories.find((x) => x.label === label);
      if (!c) continue;
      const row = el('button', 'lc-row');
      row.type = 'button';
      const comp = teamComp(f, g, t.team);
      const badge = el('span', 'badge', abbrev(comp));
      paintTeam(badge, comp);
      paintTeam(row, comp);
      row.append(badge, el('span', 'lc-name', c.name), el('span', 'lc-val', c.value));
      if (c.id) row.addEventListener('click', () => openPlayer(f, c.id, () => openGame(f, 'box')));
      block.append(row);
    }
    sec.append(block);
  }
  return sec;
}

function infoPanel(f, g) {
  const parts = [];
  const info = g.info;
  if (info) {
    const dl = el('dl', 'facts');
    const fact = (k, v) => { if (v) dl.append(el('dt', null, k), el('dd', null, v)); };
    const startWord = { cricket: 'Start of play', nba: 'Tip-off', nfl: 'Kick-off', epl: 'Kick-off', nrl: 'Kick-off', afl: 'First bounce' }[f.league] || 'Start';
    fact('Venue', info.venue);
    fact(startWord, f.snap?.start ? kickoffLong(f.snap.start) : '');
    fact('Toss', info.toss);
    fact('Hours of play', info.hours);
    fact('Attendance', info.attendance ? `${Number(info.attendance).toLocaleString()}${info.capacity ? ` of ${Number(info.capacity).toLocaleString()}` : ''}` : '');
    fact('Watch on', info.broadcasts.join(', '));
    fact('Weather', info.weather);
    if (dl.children.length) parts.push(section('Match details', dl));
    if (info.officials.length) {
      const dl2 = el('dl', 'facts');
      for (const o of info.officials) dl2.append(el('dt', null, o.role || 'Official'), el('dd', null, o.name));
      parts.push(section(f.league === 'cricket' ? 'Umpires & officials' : 'Officials', dl2));
    }
  }
  if (g.series) parts.push(section('Season series', el('p', 'plain', g.series)));
  for (const t of g.injuries || []) {
    const comp = teamComp(f, g, t.team);
    const ul = el('ul', 'injuries');
    for (const i of t.list) {
      const li = el('li');
      li.append(el('span', 'inj-name', `${i.name}${i.position ? ` (${i.position})` : ''}`),
        el('span', `inj-status ${/out|ir|injured/i.test(i.status) ? 'out' : ''}`, i.status), el('span', 'inj-detail', i.detail));
      ul.append(li);
    }
    parts.push(section(`${comp.name || t.team} injuries`, ul));
  }
  return parts.length ? parts : [el('p', 'hint', 'ESPN hasn’t published match details for this game.')];
}
function section(title, content) {
  const s = el('section', 'info-sec');
  s.append(el('h3', null, title), content);
  return s;
}

// Soccer: formation, starting XI by shirt number, then the bench.
function lineupsPanel(f, g) {
  const teams = g.lineups.map((t) => t.team);
  let shown = boxTeam.get(`${f.key}:xi`);
  if (!teams.includes(shown)) shown = teams[0];
  const parts = [];
  if (teams.length > 1) parts.push(teamPicker(f, g, teams, shown, (abbr) => { boxTeam.set(`${f.key}:xi`, abbr); openGame(f, 'lineups'); }));
  const t = g.lineups.find((x) => x.team === shown);
  const list = (people, mark) => {
    const ol = el('ol', 'xi');
    for (const p of people) {
      const li = el('li');
      const flag = p.subbedOut ? el('span', 'sub off', 'Off') : p.subbedIn ? el('span', 'sub on', 'On') : null;
      li.append(el('span', 'xi-num', p.jersey || ''), el('span', 'xi-name', p.name), el('span', 'xi-pos', p.position));
      if (flag) li.append(flag);
      ol.append(li);
    }
    return ol;
  };
  if (t.formation) parts.push(el('p', 'formation', `Formation ${t.formation}`));
  parts.push(section('Starting XI', list(t.starters)));
  if (t.bench.length) parts.push(section('Substitutes', list(t.bench)));
  return parts;
}

// A team picker with each side's badge, like ESPN's box score.
function teamPicker(f, g, teams, selected, onPick) {
  const seg = el('div', 'team-picker');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Team');
  for (const abbr of teams) {
    const comp = teamComp(f, g, abbr);
    const b = el('button', 'team-pick');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(abbr === selected));
    const badge = el('span', 'badge', abbrev(comp));
    paintTeam(badge, comp);
    b.append(badge, el('span', 'tp-label', comp.name || abbr));
    b.addEventListener('click', () => onPick(abbr));
    seg.append(b);
  }
  return seg;
}
function teamComp(f, g, abbr) {
  return (f.snap?.competitors || []).find((c) => c.short === abbr)
    || { short: abbr, name: g.teams.find((t) => t.abbr === abbr)?.name || abbr, color: g.teams.find((t) => t.abbr === abbr)?.color };
}

function boxPanel(f, g) {
  const parts = [];
  if (g.periods) parts.push(periodsTable(f, g.periods));
  if (!g.tables.length) {
    parts.push(el('p', 'hint', f.snap?.state === 'pre'
      ? 'The box score fills in once the game starts.'
      : 'ESPN hasn’t published player stats for this game yet.'));
    return parts;
  }
  // One team at a time keeps it readable on a phone.
  const teams = [...new Set(g.tables.map((t) => t.team).filter(Boolean))];
  let shown = boxTeam.get(f.key);
  if (!teams.includes(shown)) shown = teams[0];
  if (teams.length > 1) {
    parts.push(teamPicker(f, g, teams, shown, (abbr) => { boxTeam.set(f.key, abbr); openGame(f, 'box'); }));
  }
  for (const t of g.tables) {
    if (teams.length > 1 && t.team !== shown) continue;
    parts.push(statTable(f, t, g));
  }
  return parts;
}
const boxTeam = new Map();

// ---------- cricket scorecard ----------

const scoreInnings = new Map(); // which innings is open, per game

function scorecardPanel(f, g) {
  const list = g.innings;
  let idx = scoreInnings.get(f.key);
  if (idx == null || idx >= list.length) idx = list.length - 1; // latest innings first

  // Innings chips: "AUS 1st 390 · SA 1st 284 · AUS 2nd 314/6d".
  const chipsRow = el('div', 'innings-chips');
  chipsRow.setAttribute('role', 'tablist');
  list.forEach((inn, i) => {
    const b = el('button', 'inn-chip');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === idx));
    const comp = teamComp(f, g, inn.team);
    const dot = el('span', 'inn-dot');
    paintTeam(dot, comp);
    paintTeam(b, comp);
    b.append(dot, el('span', 'inn-name', `${inn.team} ${inn.ordinal}`), el('span', 'inn-score', inn.score));
    if (inn.live) b.classList.add('live');
    b.addEventListener('click', () => { scoreInnings.set(f.key, i); openGame(f, 'box'); });
    chipsRow.append(b);
  });

  const inn = list[idx];
  const batComp = teamComp(f, g, inn.team);
  const bowlAbbr = (f.snap?.competitors || []).map((c) => c.short).find((x) => x && x !== inn.team)
    || g.teams.map((t) => t.abbr).find((x) => x && x !== inn.team);
  const bowlComp = bowlAbbr ? teamComp(f, g, bowlAbbr) : null;
  const head = el('div', 'inn-head');
  paintTeam(head, batComp);
  const titleBox = el('div');
  titleBox.append(
    el('h3', null, `${inn.teamName} ${inn.ordinal} innings`),
    el('p', 'inn-meta', [inn.overs && `${inn.overs} overs`, inn.runRate && `run rate ${inn.runRate}`].filter(Boolean).join(', ')),
  );
  const big = el('span', 'inn-total', inn.score);
  head.append(titleBox, big);
  if (inn.live) head.append(el('span', 'clock live', 'Batting'));

  // Batting: name with the dismissal underneath, then R B 4s 6s SR.
  const bat = el('table', 'grid scorecard');
  bat.append(el('thead'), el('tbody'), el('tfoot'));
  const bh = el('tr');
  bh.append(el('th', 'name', 'Batter'), ...['R', 'B', '4s', '6s', 'SR'].map((h) => el('th', null, h)));
  bat.tHead.append(bh);
  for (const b of inn.batting) {
    const tr = el('tr', isTracked(f, b.id) ? 'tracked-row' : null);
    const name = el('th', 'name');
    name.setAttribute('scope', 'row');
    const btn = el('button', 'name-btn', b.name);
    btn.type = 'button';
    btn.addEventListener('click', () => openPlayer(f, b.id, () => openGame(f, 'box')));
    name.append(btn, el('span', `how-out${b.notOut ? ' not-out' : ''}`, b.howOut));
    const r = Number(b.runs);
    if (b.notOut) tr.classList.add('not-out-row');
    tr.append(name, el('td', `runs${r >= 100 ? ' hundred' : r >= 50 ? ' fifty' : ''}`, `${b.runs}${b.notOut ? '*' : ''}`), el('td', null, b.balls), el('td', null, b.fours), el('td', null, b.sixes), el('td', null, b.sr));
    bat.tBodies[0].append(tr);
  }
  const ex = inn.extras;
  const exParts = [ex.wd && `${ex.wd} wd`, ex.nb && `${ex.nb} nb`, ex.other && `${ex.other} b/lb`].filter(Boolean).join(', ');
  const exRow = el('tr', 'extras');
  const exName = el('th', 'name', 'Extras');
  if (exParts) exName.append(el('span', 'how-out', exParts));
  const exVal = el('td', 'runs', String(ex.total));
  exVal.colSpan = 5;
  exRow.append(exName, exVal);
  const totRow = el('tr', 'total');
  const totName = el('th', 'name', 'Total');
  if (inn.overs) totName.append(el('span', 'how-out', `${inn.overs} overs${inn.runRate ? `, run rate ${inn.runRate}` : ''}`));
  const totVal = el('td', 'runs', inn.score);
  totVal.colSpan = 5;
  totRow.append(totName, totVal);
  bat.tFoot.append(exRow, totRow);

  const batWrap = el('div', 'table-wrap card-table');
  paintTeam(batWrap, batComp);
  batWrap.append(bat);
  const parts = [chipsRow, head, batWrap];
  if (inn.notBatted?.length) {
    const p = el('p', 'dnb');
    p.append(el('b', null, `${inn.notBattedLabel}: `), inn.notBatted.join(', '));
    parts.push(p);
  }

  if (inn.bowling.length) {
    const bowl = el('table', 'grid');
    bowl.append(el('thead'), el('tbody'));
    const hh = el('tr');
    hh.append(el('th', 'name', 'Bowler'), ...['O', 'M', 'R', 'W', 'Econ', 'Wd', 'NB'].map((h) => el('th', null, h)));
    bowl.tHead.append(hh);
    for (const b of inn.bowling) {
      const tr = el('tr', isTracked(f, b.id) ? 'tracked-row' : null);
      const name = el('th', 'name');
      name.setAttribute('scope', 'row');
      const btn = el('button', 'name-btn', b.name);
      btn.type = 'button';
      btn.addEventListener('click', () => openPlayer(f, b.id, () => openGame(f, 'box')));
      name.append(btn);
      const w = Number(b.w);
      tr.append(name, el('td', null, b.o), el('td', null, b.m), el('td', null, b.r), el('td', `runs${w >= 5 ? ' five' : w >= 3 ? ' haul' : ''}`, b.w), el('td', null, b.econ), el('td', null, b.wd), el('td', null, b.nb));
      bowl.tBodies[0].append(tr);
    }
    const sec = el('section', 'box-table');
    sec.append(el('h3', null, bowlComp ? `${bowlComp.name || bowlAbbr} bowling` : 'Bowling'));
    if (bowlComp) paintTeam(sec, bowlComp);
    const w = el('div', 'table-wrap card-table');
    w.append(bowl);
    sec.append(w);
    parts.push(sec);
  }
  return parts;
}

function teamName(f, g, abbr) {
  return g.teams.find((t) => t.abbr === abbr)?.name
    || (f.snap?.competitors || []).find((c) => c.short === abbr)?.name || abbr;
}

function periodsTable(f, p) {
  const wrap = el('div', 'table-wrap card-table');
  const table = el('table', 'grid periods');
  const head = el('tr');
  head.append(el('th', 'name', ''), ...p.labels.map((l) => el('th', null, l)), el('th', 'total', 'T'));
  table.append(el('thead'), el('tbody'));
  table.tHead.append(head);
  for (const r of p.rows) {
    const tr = el('tr');
    const name = el('th', 'name');
    const comp = (f.snap?.competitors || []).find((c) => c.short === r.abbr) || { short: r.abbr, name: r.abbr };
    const badge = el('span', 'badge', abbrev(comp));
    paintTeam(badge, comp);
    name.append(badge);
    tr.append(name, ...r.values.map((v) => el('td', null, v)), el('td', 'total', r.total));
    table.tBodies[0].append(tr);
  }
  wrap.append(table);
  return wrap;
}

// Columns where the biggest number is the best one, so it's worth highlighting.
const BEST_HIGH = new Set(['PTS', 'REB', 'AST', 'STL', 'BLK', 'YDS', 'TD', 'REC', 'G', 'A', 'SACKS', 'TOT', 'TRY', 'TRIES', 'MTRS', 'RM']);
function statTable(f, t, g) {
  const section = el('section', 'box-table');
  if (g && t.team) paintTeam(section, teamComp(f, g, t.team));
  const best = t.columns.map((c, i) => {
    if (!BEST_HIGH.has(String(c.abbr).toUpperCase())) return null;
    const nums = t.rows.map((r) => parseFloat(String(r.values[i]).replace(/,/g, '')));
    const vals = nums.filter((n) => Number.isFinite(n));
    const max = Math.max(...vals);
    // Only worth picking out when it actually stands out: a clear, single leader.
    return vals.length > 1 && max > 0 && vals.filter((n) => n === max).length === 1 ? max : null;
  });
  section.append(el('h3', null, t.title));
  const wrap = el('div', 'table-wrap card-table');
  const table = el('table', 'grid');
  const head = el('tr');
  head.append(el('th', 'name', 'Player'));
  for (const c of t.columns) {
    const th = el('th', null, c.abbr);
    th.title = c.label;
    th.setAttribute('scope', 'col');
    head.append(th);
  }
  table.append(el('thead'), el('tbody'));
  table.tHead.append(head);
  let benchShown = false;
  const span = t.columns.length + 1;
  const divider = (text) => {
    const tr = el('tr', 'divider');
    const th = el('th', null, text);
    th.colSpan = span;
    tr.append(th);
    return tr;
  };
  if (t.rows.some((r) => r.bench === true)) table.tBodies[0].append(divider('Starters'));
  for (const r of t.rows) {
    if (r.bench && !benchShown) { table.tBodies[0].append(divider('Bench')); benchShown = true; }
    const tr = el('tr', isTracked(f, r.id) ? 'tracked-row' : null);
    const name = el('th', 'name');
    name.setAttribute('scope', 'row');
    const btn = el('button', 'name-btn', r.name);
    btn.type = 'button';
    btn.addEventListener('click', () => openPlayer(f, r.id, () => openGame(f, 'box')));
    name.append(btn);
    tr.append(name, ...r.values.map((v, i) => el('td',
      best[i] != null && parseFloat(String(v).replace(/,/g, '')) === best[i] ? 'best' : null, v)));
    table.tBodies[0].append(tr);
  }
  if (t.totals) {
    const foot = el('tfoot');
    const tr = el('tr', 'total');
    tr.append(el('th', 'name', 'Team'), ...t.totals.map((v) => el('td', null, v)));
    foot.append(tr);
    table.append(foot);
  }
  wrap.append(table);
  section.append(wrap);
  return section;
}

function teamStatsPanel(f, g) {
  const ts = g.teamStats;
  const wrap = el('div', 'team-stats');
  const head = el('div', 'ts-head');
  for (const abbr of ts.teams) {
    const comp = (f.snap?.competitors || []).find((c) => c.short === abbr) || { short: abbr, name: abbr };
    const badge = el('span', 'badge', abbrev(comp));
    paintTeam(badge, comp);
    head.append(badge);
  }
  head.insertBefore(el('span', 'ts-mid', ''), head.lastChild);
  const colors = ts.teams.map((abbr) => teamColor((f.snap?.competitors || []).find((c) => c.short === abbr) || { short: abbr, name: abbr }));
  wrap.append(head);
  for (const r of ts.rows) {
    const row = el('div', 'ts-row');
    const [a, b] = r.values;
    const na = parseFloat(a), nb = parseFloat(b);
    row.append(
      el('span', `ts-val${na > nb ? ' lead' : ''}`, a),
      el('span', 'ts-label', r.label),
      el('span', `ts-val${nb > na ? ' lead' : ''}`, b),
    );
    // A split bar in team colours shows who's ahead at a glance.
    if (Number.isFinite(na) && Number.isFinite(nb) && na >= 0 && nb >= 0 && na + nb > 0) {
      const bar = el('div', 'ts-bar');
      const left = el('span', `ts-l${na >= nb ? ' ahead' : ''}`);
      const right = el('span', `ts-r${nb >= na ? ' ahead' : ''}`);
      left.style.flexGrow = String(na);
      right.style.flexGrow = String(nb);
      left.style.setProperty('--team', colors[0]);
      right.style.setProperty('--team', colors[1]);
      bar.append(left, right);
      row.append(bar);
    }
    wrap.append(row);
  }
  return wrap;
}

// Goals, tries and cards read like a match report: minute, what happened,
// who did it (and who assisted), on the scoring team's side.
const EV_ICON = {
  goal: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6.2l3.3 2.4-1.3 3.9H8l-1.3-3.9z" fill="currentColor"/></svg>',
  try: '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="10" rx="8.4" ry="5.2" transform="rotate(-35 10 10)" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.4 12.6l5.2-5.2M8.6 9.2l2.2 2.2" stroke="currentColor" stroke-width="1.4"/></svg>',
  kick: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3v14M15 3v14M5 9h10" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  yellow: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5.5" y="2.5" width="9" height="15" rx="1.6" fill="#F2C200"/></svg>',
  red: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5.5" y="2.5" width="9" height="15" rx="1.6" fill="#E0312B"/></svg>',
};

function eventsPanel(f, g, events) {
  const list = el('ol', 'events');
  const home = (f.snap?.competitors || [])[0]?.short;
  for (const e of events) {
    // NFL/NBA scoring plays: time, type and running score, then the play.
    if (e.type === 'score') {
      const li = el('li', 'ev-play');
      const top = el('div', 'ev-top');
      top.append(el('span', 'ev-when', e.when || ''), el('span', 'ev-kind', [e.kind, e.team].filter(Boolean).join(', ')));
      if (e.score) top.append(el('span', 'ev-score', e.score));
      li.append(top, el('p', 'ev-text', e.text));
      list.append(li);
      continue;
    }
    const li = el('li', `ev-row ${e.team && e.team === home ? 'home' : 'away'}`);
    const icon = el('span', `ev-icon ${e.type}`);
    icon.innerHTML = EV_ICON[e.type] || '';
    const label = { goal: 'Goal', try: 'Try', kick: e.kind ? cap(e.kind) : 'Goal kick', yellow: f.league === 'nrl' ? 'Sin bin' : 'Yellow card', red: 'Red card' }[e.type] || cap(e.kind);
    const who = el('div', 'ev-who');
    const name = el('span', 'ev-name', e.scorer || label);
    if (e.flag) name.append(el('span', 'ev-flag', e.flag === 'Pen' ? 'pen' : 'own goal'));
    who.append(name);
    const sub = [e.scorer ? label : '', e.assist && `Assist: ${e.assist}`].filter(Boolean).join('. ');
    if (sub) who.append(el('span', 'ev-sub', sub));
    const comp = teamComp(f, g, e.team);
    const badge = el('span', 'badge', e.team ? abbrev(comp) : '');
    if (e.team) { paintTeam(badge, comp); paintTeam(li, comp); }
    li.append(el('span', 'ev-min', e.when || ''), icon, who, badge);
    list.append(li);
  }
  if (!events.length) return el('p', 'hint', 'Nothing to show yet.');
  return list;
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function playersPanel(f, g) {
  if (!g.players.length) {
    return [el('p', 'hint', f.league === 'ufc'
      ? 'ESPN hasn’t published fight stats for this bout yet. They usually appear once the fight starts.'
      : 'The player list for this game isn’t out yet. It usually appears once the game starts.')];
  }
  const search = el('input', 'search');
  search.type = 'search';
  search.id = 'player-search';
  search.placeholder = 'Search players';
  search.setAttribute('aria-label', 'Search players');
  const note = g.source === 'roster'
    ? el('p', 'hint small', 'The game hasn’t started. Track players now and their stats fill in from kick-off.')
    : null;
  const list = el('div');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = g.players.filter((p) => !q || `${p.name} ${p.team} ${p.position}`.toLowerCase().includes(q));
    shown.sort((a, b) => Number(isTracked(f, b.id)) - Number(isTracked(f, a.id)) || a.team.localeCompare(b.team));
    const rows = [];
    let last = null;
    for (const p of shown.slice(0, 150)) {
      const heading = isTracked(f, p.id) ? 'Tracking' : teamName(f, g, p.team) || 'Players';
      if (heading !== last) { rows.push(el('div', 'day', heading)); last = heading; }
      const summary = playerSummary(p) || (g.source === 'boxscore' ? 'No stats yet' : '');
      const b = rowButton(p.name, [roleName(p.position), summary].filter(Boolean).join(', '), isTracked(f, p.id) ? 'Tracking' : 'View');
      b.addEventListener('click', () => openPlayer(f, p.id, () => openGame(f, 'players')));
      rows.push(b);
    }
    if (!rows.length) rows.push(el('p', 'hint', `No player matches "${search.value}".`));
    list.replaceChildren(...rows);
  };
  search.addEventListener('input', draw);
  draw();
  return [search, note, list].filter(Boolean);
}

// Golf and F1: the whole field, with one tap to follow a player or driver.
// Golf and F1 order. F1 adds a Timing view (OpenF1) once the session's over.
const lbMode = new Map();
function openLeaderboard(f, mode) {
  const ev = f.snap;
  if (mode) lbMode.set(f.key, mode);
  const view = f.league === 'f1' ? (lbMode.get(f.key) || 'order') : 'order';
  showSheet(ev.name, { view: `lb:${f.key}:${view}` });
  const parts = [];
  if (f.league === 'f1') {
    const seg = el('div', 'segmented wide');
    for (const [k, label] of [['order', 'Order'], ['timing', 'Timing']]) {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(k === view));
      b.addEventListener('click', () => openLeaderboard(f, k));
      seg.append(b);
    }
    parts.push(seg);
  }
  if (view === 'timing') {
    const holder = el('div');
    parts.push(holder);
    body.replaceChildren(...parts);
    f1Timing(f, holder);
    return;
  }
  const list = ev.competitors || [];
  if (!list.length) { body.replaceChildren(...parts, el('p', 'hint', 'The order appears once the session starts.')); return; }
  const table = el('div', 'leaderboard');
  for (const c of list) {
    const row = el('button', `lb-row${f.focus === c.id ? ' focus' : ''}`);
    row.type = 'button';
    const pos = !c.pos ? '–' : f.league === 'f1' && /^\d+$/.test(c.pos) ? `P${c.pos}` : c.pos;
    row.append(el('span', 'pos', pos), el('span', 'who', c.name), el('span', 'val', c.score ?? ''),
      el('span', 'act', f.focus === c.id ? 'Following' : 'Follow'));
    row.addEventListener('click', () => {
      f.focus = f.focus === c.id ? null : c.id;
      f.focusName = f.focus ? c.name : null;
      save();
      openLeaderboard(f);
    });
    table.append(row);
  }
  body.replaceChildren(...parts, el('p', 'hint small', 'Tap a name to keep them on your card, even outside the top three.'), table);
  settleScroll();
}

const TYRE_CLASS = { S: 'soft', M: 'medium', H: 'hard', I: 'inter', W: 'wet' };
async function f1Timing(f, holder) {
  holder.append(skeleton('list', 8));
  let t;
  try {
    if (DEMO) t = f.demoTiming || { available: false, reason: 'Timing appears here once the session has finished.' };
    else {
      const res = await apiFetch(`${API}/api/f1?start=${encodeURIComponent(f.snap.start)}`);
      t = await res.json();
      if (!res.ok) throw new Error(t.error || res.status);
    }
  } catch (e) {
    holder.replaceChildren(el('p', 'hint', `Timing didn't load (${e.message}).`));
    return;
  }
  if (!holder.isConnected) return;
  if (!t.available) {
    holder.replaceChildren(el('p', 'hint', `${t.reason} OpenF1’s live timing is a paid service, so Sideline shows the full breakdown after each session.`));
    return;
  }
  const parts = [];
  if (t.fastest) {
    const fl = el('div', 'f1-fastest');
    fl.append(el('span', 'fl-tag', 'Fastest lap'), el('b', null, t.fastest.code), el('span', null, `${t.fastest.time}, lap ${t.fastest.lap}`));
    parts.push(fl);
  }
  const isRace = t.session?.isRace;
  const tbl = el('table', 'grid f1-table');
  tbl.append(el('thead'), el('tbody'));
  const hr = el('tr');
  hr.append(el('th', 'name', 'Driver'), el('th', null, isRace ? 'Gap' : 'Time'), el('th', null, isRace ? 'Best' : 'Gap'), el('th', 'tyres', isRace ? 'Tyres' : 'Laps'));
  tbl.tHead.append(hr);
  for (const r of t.rows) {
    const tr = el('tr', f.focusName && r.name.toLowerCase() === f.focusName.toLowerCase() ? 'tracked-row' : null);
    const name = el('th', 'name');
    name.setAttribute('scope', 'row');
    const chip = el('span', 'f1-driver');
    if (r.color) chip.style.setProperty('--team', r.color);
    const who = el('span', 'f1-who');
    who.append(el('b', null, r.code || r.name), el('span', 'f1-team', r.team));
    chip.append(el('span', 'f1-pos', r.pos ? String(r.pos) : '–'), who);
    name.append(chip);
    const best = el('td', r.fastest ? 'f1-best' : null, r.best);
    if (isRace) {
      const tyres = el('td', 'tyres');
      for (const s of r.stints) {
        const p = el('span', `tyre ${TYRE_CLASS[s.compound] || ''}`, s.compound);
        p.title = `${s.name}, laps ${s.from}–${s.to}`;
        tyres.append(p);
      }
      tr.append(name, el('td', null, r.gap), best, tyres);
    } else {
      tr.append(name, el('td', null, r.time), el('td', null, r.gap), el('td', 'tyres', r.laps != null ? String(r.laps) : ''));
    }
    tbl.tBodies[0].append(tr);
  }
  const wrap = el('div', 'table-wrap card-table');
  wrap.append(tbl);
  parts.push(wrap);
  if (isRace) parts.push(el('p', 'hint small', 'Tyres: S soft, M medium, H hard, I intermediate, W wet, in the order each driver used them.'));
  parts.push(el('p', 'hint small', 'Timing from OpenF1.'));
  holder.replaceChildren(...parts);
  settleScroll();
}

// ---------- player screen ----------

const genericKey = (k) => String(k).replace(/^inn\d+-/, ''); // cricket ticks follow the latest innings

async function openPlayer(f, id, back) {
  back = back || (() => openGame(f, 'players'));
  const t = f.tracked?.find((x) => x.id === id);
  const view = `player:${f.key}:${id}`;
  if (!showSheet(t?.name || 'Player', { back, view })) body.replaceChildren(skeleton('list', 6));
  let g;
  try { g = await getGame(f); } catch { g = { players: [], teams: [] }; }
  if (body.dataset.view !== view) return;

  // Fall back to the last stats saved on the card if the feed is unreachable.
  const p = g.players.find((x) => x.id === id) ||
    (t ? { id, name: t.name, team: t.team, position: '', groups: f.stats?.[id] || [] } : null);
  if (!p) { body.replaceChildren(el('p', 'hint', 'This player isn’t in the game’s data.')); return; }
  title.textContent = p.name;

  const hero = el('div', 'player-hero');
  const comp = (f.snap?.competitors || []).find((c) => c.short === p.team) || { short: p.team, name: p.team };
  paintTeam(hero, comp);
  const badge = el('span', 'badge', p.team || '?');
  paintTeam(badge, comp);
  hero.append(badge, el('span', 'meta', [comp.name !== p.team ? comp.name : '', roleName(p.position)].filter(Boolean).join(', ') || ' '));

  const entry = f.tracked?.find((x) => x.id === p.id);
  const toggle = el('button', `${entry ? 'btn-secondary' : 'btn-primary'} wide`, entry ? 'Stop tracking' : 'Track on game card');
  toggle.type = 'button';
  toggle.addEventListener('click', () => {
    if (isTracked(f, p.id)) {
      f.tracked = f.tracked.filter((x) => x.id !== p.id);
      if (f.stats) delete f.stats[p.id];
    } else {
      f.tracked = [...(f.tracked || []), { id: p.id, name: p.name, team: p.team, mode: 'chosen', pins: defaultPins(p.groups) }];
      (f.stats ||= {})[p.id] = p.groups;
      f.finalStats = false;
    }
    save();
    openPlayer(f, p.id, back);
  });

  const parts = [hero, toggle];

  if (entry) {
    const mode = entry.mode || 'chosen';
    const choose = el('div', 'card-choice');
    choose.append(el('span', 'choice-label', 'On the game card'));
    const seg = el('div', 'segmented');
    for (const [m, label] of [['chosen', 'Chosen stats'], ['all', 'All stats']]) {
      const b = el('button', null, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(m === mode));
      b.addEventListener('click', () => {
        entry.mode = m;
        if (m === 'chosen' && !entry.pins?.length) entry.pins = defaultPins(p.groups);
        save();
        openPlayer(f, p.id, back);
      });
      seg.append(b);
    }
    choose.append(seg);
    parts.push(choose);
    parts.push(el('p', 'hint small', mode === 'all'
      ? 'Every stat below shows on the game card.'
      : `Tick the stats to show on the game card. ${entry.pins?.length || 0} chosen.`));
    parts.push(targetsSection(f, p, entry, back));
  }

  if (!p.groups.length) {
    parts.push(el('p', 'hint', f.snap?.state === 'pre'
      ? 'No stats yet. They appear here once the game starts.'
      : 'No stats yet. They’ll appear here as soon as they get involved.'));
  } else {
    const chosenMode = entry && (entry.mode || 'chosen') === 'chosen';
    for (const grp of p.groups) {
      const section = el('section', 'stat-group');
      section.append(el('h3', null, grp.label));
      for (const s of grp.stats) {
        const gk = genericKey(s.key);
        const on = chosenMode && entry.pins?.includes(gk);
        const row = el(chosenMode ? 'label' : 'div', `stat-row${on ? ' on' : ''}`);
        row.append(el('span', 'label', s.label), el('span', 'val', s.value));
        if (chosenMode) {
          const box = el('input', 'tick');
          box.type = 'checkbox';
          box.id = `tick-${p.id}-${s.key}`;
          box.checked = on;
          box.setAttribute('aria-label', `Show ${s.label} on the game card`);
          box.addEventListener('change', () => {
            entry.pins = box.checked
              ? [...new Set([...(entry.pins || []), gk])]
              : (entry.pins || []).filter((k) => k !== gk);
            save();
            row.classList.toggle('on', box.checked);
          });
          row.append(box);
        } else {
          row.append(el('span'));
        }
        section.append(row);
      }
      parts.push(section);
    }
  }
  let recent = null;
  if (GAMELOG_LEAGUES.has(f.league)) {
    recent = el('section', 'recent');
    recent.append(el('h3', null, 'Recent games'), skeleton('list', 3));
    parts.push(recent);
  }
  body.replaceChildren(...parts);
  settleScroll();
  if (recent) fillRecent(f, p, recent);
}

// First four stats of the player's main group, e.g. passing yards and TDs.
function defaultPins(groups) {
  return (groups?.[0]?.stats || []).slice(0, 4).map((s) => genericKey(s.key));
}

function isTracked(f, id) {
  return !!f.tracked?.some((t) => t.id === id);
}

// ---------- targets ----------
// Per tracked player: t.targets = { [statKey]: { value, dir: 'atLeast' | 'atMost', label, hit } }.
// Keys are stored without the innings ("bowling.wickets"), so cricket targets
// follow the player's latest innings, like chosen stats do.

// The main stats per sport, offered before kick-off when no live stats exist yet.
const TARGET_STATS = {
  nfl: [['passing.passingYards', 'Passing yards'], ['passing.passingTouchdowns', 'Passing touchdowns'], ['passing.interceptions', 'Interceptions thrown'],
    ['rushing.rushingYards', 'Rushing yards'], ['rushing.rushingTouchdowns', 'Rushing touchdowns'], ['rushing.rushingAttempts', 'Rushing attempts'],
    ['receiving.receptions', 'Receptions'], ['receiving.receivingYards', 'Receiving yards'], ['receiving.receivingTouchdowns', 'Receiving touchdowns'],
    ['defensive.sacks', 'Sacks'], ['defensive.totalTackles', 'Tackles']],
  nba: [['general.points', 'Points'], ['general.rebounds', 'Rebounds'], ['general.assists', 'Assists'],
    ['general.threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3-pointers made'], ['general.steals', 'Steals'], ['general.blocks', 'Blocks'], ['general.turnovers', 'Turnovers']],
  cricket: [['batting.runs', 'Runs'], ['batting.ballsFaced', 'Balls faced'], ['batting.fours', 'Fours'], ['batting.sixes', 'Sixes'],
    ['bowling.wickets', 'Wickets'], ['bowling.conceded', 'Runs conceded'], ['bowling.maidens', 'Maidens']],
  nrl: [['general.tries', 'Tries'], ['general.metres', 'Run metres'], ['general.tackles', 'Tackles'], ['general.tryAssists', 'Try assists'], ['general.cleanBreaks', 'Line breaks'], ['general.points', 'Points']],
  epl: [['general.totalGoals', 'Goals'], ['general.goalAssists', 'Assists'], ['general.shotsOnTarget', 'Shots on target'], ['general.totalShots', 'Shots'], ['general.saves', 'Saves']],
  ufc: [],
};

// First number in a stat: "214" -> 214, "4-9" (made-attempted) -> 4, "4.4" overs -> 4.4.
function statNumber(v) {
  const m = /-?\d+(?:\.\d+)?/.exec(String(v ?? '').replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

function findStat(groups, key) {
  for (const g of groups || []) {
    for (const s of g.stats) if (genericKey(s.key) === key || s.key === key) return s;
  }
  return null;
}

function targetState(f, groups, key, tg) {
  const s = findStat(groups, key);
  const cur = s ? statNumber(s.value) ?? 0 : 0;
  const done = f.snap?.state === 'post';
  let state = 'open';
  if (tg.dir === 'atMost') state = cur > tg.value ? 'over' : done ? 'hit' : 'open';
  else state = cur >= tg.value ? 'hit' : done ? 'miss' : 'open';
  const pct = tg.value ? Math.max(0, Math.min(100, (cur / tg.value) * 100)) : (cur > 0 ? 100 : 0);
  return { cur, state, pct, label: tg.label || (s ? statName(s) : key) };
}

// The targets on the game card: "18 / 25 Rushing yards" with a progress bar.
function targetRows(f, t, groups) {
  const entries = Object.entries(t.targets || {});
  if (!entries.length) return null;
  const wrap = el('span', 'targets');
  for (const [key, tg] of entries) {
    const st = targetState(f, groups, key, tg);
    const row = el('span', `target ${st.state}`);
    const text = el('span', 'tg-text');
    const nums = el('b', null, `${st.cur} / ${tg.value}`);
    text.append(nums, ` ${tg.dir === 'atMost' ? 'at most, ' : ''}${st.label}`);
    const tag = { hit: 'Reached', over: 'Over', miss: 'Missed', open: '' }[st.state];
    if (tag) text.append(el('span', 'tg-tag', tag));
    const bar = el('span', 'tg-bar');
    const fill = el('span', 'tg-fill');
    fill.style.width = `${st.pct}%`;
    bar.append(fill);
    row.append(text, bar);
    wrap.append(row);
  }
  return wrap;
}

// While the app is open, say when a target is reached (once per target).
function announceTargets(f) {
  for (const t of f.tracked || []) {
    for (const [key, tg] of Object.entries(t.targets || {})) {
      if (tg.dir === 'atMost' || tg.hit) continue;
      const st = targetState(f, f.stats?.[t.id], key, tg);
      if (st.state === 'hit') {
        tg.hit = true;
        showToast(`${t.name} reached ${tg.value} ${st.label.toLowerCase()}`, 'View', () => openPlayer(f, t.id, () => sheet.close()));
      }
    }
  }
}

// Player screen: list targets, edit or remove them, add new ones.
function targetsSection(f, p, entry, back) {
  const sec = el('section', 'targets-sec');
  const head = el('div', 'tsec-head');
  head.append(el('h3', null, 'Targets'), el('span', 'hint small', 'Optional'));
  sec.append(head);
  const targets = entry.targets || {};
  const keys = Object.keys(targets);
  const list = el('div', 'tsec-list');
  for (const key of keys) {
    const tg = targets[key];
    const st = targetState(f, p.groups, key, tg);
    const row = el('div', `tsec-row ${st.state}`);
    row.append(el('span', 'tsec-label', `${tg.dir === 'atMost' ? 'At most' : 'At least'} ${tg.value} ${st.label.toLowerCase()}`),
      el('span', 'tsec-now', f.snap?.state === 'pre' ? '' : `Now ${st.cur}`));
    const edit = el('button', 'btn-quiet', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => sec.replaceWith(targetEditor(f, p, entry, back, key)));
    const del = el('button', 'icon-btn');
    del.type = 'button';
    del.innerHTML = ICON.close;
    del.setAttribute('aria-label', `Remove target for ${st.label}`);
    del.addEventListener('click', () => { delete entry.targets[key]; save(); openPlayer(f, p.id, back); });
    row.append(edit, del);
    list.append(row);
  }
  if (keys.length) sec.append(list);
  const add = el('button', 'btn-secondary wide', keys.length ? 'Add another target' : 'Set a target');
  add.type = 'button';
  add.addEventListener('click', () => sec.replaceWith(targetEditor(f, p, entry, back)));
  sec.append(add);
  if (!keys.length) sec.append(el('p', 'hint small', 'For example, 25 rushing yards. Progress shows on the game card.'));
  return sec;
}

function targetEditor(f, p, entry, back, editKey) {
  const box = el('section', 'targets-sec editor');
  box.append(el('h3', null, editKey ? 'Edit target' : 'New target'));

  // Stats to choose from: this player's numeric stats, then the sport's main ones.
  const options = new Map();
  for (const g of p.groups || []) {
    for (const s of g.stats) {
      if (statNumber(s.value) == null) continue;
      const k = genericKey(s.key);
      if (!options.has(k)) options.set(k, { label: statName(s), group: g.label.replace(/,.*$/, '') });
    }
  }
  for (const [k, label] of TARGET_STATS[f.league] || []) {
    if (!options.has(k)) options.set(k, { label, group: 'Main stats' });
  }
  const current = editKey ? entry.targets[editKey] : null;

  const sel = el('select', 'search');
  sel.id = `target-stat-${p.id}`;
  sel.setAttribute('aria-label', 'Stat');
  const groups = new Map();
  for (const [k, o] of options) {
    if (!groups.has(o.group)) {
      const og = document.createElement('optgroup');
      og.label = o.group;
      groups.set(o.group, og);
      sel.append(og);
    }
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = o.label;
    if (k === editKey) opt.selected = true;
    groups.get(o.group).append(opt);
  }
  if (!options.size) {
    box.append(el('p', 'hint small', 'There are no stats to set a target on for this player yet.'));
  }

  let dir = current?.dir || 'atLeast';
  const seg = el('div', 'segmented');
  for (const [d, label] of [['atLeast', 'At least'], ['atMost', 'At most']]) {
    const b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(d === dir));
    b.addEventListener('click', () => {
      dir = d;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    seg.append(b);
  }

  const num = el('input', 'search');
  num.type = 'number';
  num.inputMode = 'decimal';
  num.min = '0';
  num.step = 'any';
  num.id = `target-value-${p.id}`;
  num.placeholder = '25';
  num.setAttribute('aria-label', 'Target number');
  if (current) num.value = String(current.value);

  const row = el('div', 'tg-inputs');
  row.append(seg, num);
  const err = el('p', 'hint small tg-err');

  const saveBtn = el('button', 'btn-primary wide', 'Save target');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    const v = Number(num.value);
    if (!num.value || !Number.isFinite(v) || v < 0) { err.textContent = 'Enter a number, like 25.'; num.focus(); return; }
    const key = sel.value;
    entry.targets = entry.targets || {};
    if (editKey && editKey !== key) delete entry.targets[editKey];
    entry.targets[key] = { value: v, dir, label: options.get(key)?.label || key, hit: false };
    save();
    openPlayer(f, p.id, back);
  });
  const cancel = el('button', 'btn-quiet', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => openPlayer(f, p.id, back));

  box.append(el('label', 'tg-label', 'Stat'), sel, el('label', 'tg-label', 'Target'), row, err, saveBtn, cancel);
  if (options.size) setTimeout(() => num.focus(), 50);
  return box;
}

// ---------- form & recent games ----------

const formCache = new Map();    // game key -> { at, teams }
const historyCache = new Map(); // league:athlete -> { at, log }

async function getForm(f, g) {
  const hit = formCache.get(f.key);
  if (hit && Date.now() - hit.at < 600_000) return hit.teams;
  let teams;
  if (DEMO) teams = f.demoForm || [];
  else {
    const ids = (g.teams?.length ? g.teams.map((t) => t.id) : (f.snap?.competitors || []).map((c) => c.id)).filter((x) => /^\d+$/.test(x || ''));
    if (!ids.length) throw new Error('No team ids for this game');
    const res = await apiFetch(`${API}/api/form?league=${f.league}&teams=${ids.slice(0, 2).join(',')}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
    teams = body.teams || [];
  }
  formCache.set(f.key, { at: Date.now(), teams });
  return teams;
}

async function getHistory(f, athlete) {
  const key = `${f.league}:${athlete}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.log;
  let log;
  if (DEMO) log = f.demoHistory?.[athlete] || { columns: [], groups: [], games: [], summary: [] };
  else {
    const res = await apiFetch(`${API}/api/history?league=${f.league}&athlete=${encodeURIComponent(athlete)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Couldn't reach the score service (${res.status})`);
    log = body;
  }
  historyCache.set(key, { at: Date.now(), log });
  return log;
}

// Form tab: each side's last five results, newest first, and their next game.
// ---------- settings screen ----------

document.getElementById('open-settings').addEventListener('click', () => openSettings());

function segmentedSetting(label, options, value, onPick) {
  const row = el('div', 'set-row');
  row.append(el('span', 'set-label', label));
  const seg = el('div', 'segmented');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', label);
  for (const [v, text] of options) {
    const b = el('button', null, text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === value));
    b.addEventListener('click', () => onPick(v));
    seg.append(b);
  }
  row.append(seg);
  return row;
}
function switchSetting(label, hint, on, onChange) {
  const row = el('label', 'set-row switch-row');
  const text = el('span', 'set-text');
  text.append(el('span', 'set-label', label), el('span', 'set-hint', hint));
  const box = el('input', 'switch');
  box.type = 'checkbox';
  box.setAttribute('role', 'switch');
  box.checked = on;
  box.addEventListener('change', () => onChange(box.checked));
  row.append(text, box);
  return row;
}

function openSettings() {
  showSheet('Settings', { view: 'settings' });
  const redraw = () => openSettings();
  const look = el('section', 'set-sec');
  look.append(el('h3', null, 'Display'),
    segmentedSetting('Theme', [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], settings.theme,
      (v) => { settings.theme = v; saveSettings(); redraw(); }),
    switchSetting('Compact board', 'Smaller cards, so more games fit on screen.', settings.compact,
      (v) => { settings.compact = v; saveSettings(); }),
    switchSetting('Clear finished games', 'Remove games from the board a day after they finish.', settings.autoClear,
      (v) => { settings.autoClear = v; saveSettings(); autoClearFinished(); save(); }));

  const fav = el('section', 'set-sec');
  fav.append(el('h3', null, 'Favourite teams'),
    el('p', 'hint small', 'Their games are added to your board automatically, a week ahead. Remove one and it stays removed.'));
  const list = el('div', 'fav-list');
  for (const t of settings.favourites) {
    const row = el('div', 'fav-row');
    const badge = el('span', 'badge', t.abbr || abbrev({ name: t.name }));
    paintTeam(badge, { name: t.name, color: t.color });
    const x = el('button', 'icon-btn');
    x.type = 'button';
    x.innerHTML = ICON.close;
    x.setAttribute('aria-label', `Remove ${t.name} from favourites`);
    x.addEventListener('click', () => {
      settings.favourites = settings.favourites.filter((y) => y !== t);
      saveSettings(); redraw();
    });
    row.append(badge, el('span', 'fav-name', t.name), el('span', 'fav-league', LABEL[t.league] || t.league), x);
    list.append(row);
  }
  if (!settings.favourites.length) list.append(el('p', 'hint small', 'No favourites yet.'));
  const add = el('button', 'btn-secondary wide', 'Add a favourite team');
  add.type = 'button';
  add.addEventListener('click', () => openFavPicker('afl'));
  fav.append(list, add);

  const about = el('section', 'set-sec');
  const aboutLink = el('a', 'btn-secondary wide about-link', 'About Sideline and privacy');
  aboutLink.href = '/about';
  about.append(el('h3', null, 'About'),
    el('p', 'hint small', 'Scores and stats from ESPN, AFL from Squiggle, F1 timing from OpenF1. Your board and settings stay on this device. Not affiliated with any league or team.'),
    aboutLink);
  body.replaceChildren(look, fav, about);
  settleScroll();
}

const teamsCache = new Map();
const FAV_LEAGUES = ['afl', 'nrl', 'nfl', 'nba', 'epl', 'cricket'];
async function openFavPicker(league) {
  showSheet('Favourite teams', { back: () => openSettings(), view: `fav:${league}` });
  const chipRow = el('div', 'chips inline-chips');
  for (const id of FAV_LEAGUES) {
    const c = el('button', 'chip', LABEL[id]);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(id === league));
    c.addEventListener('click', () => openFavPicker(id));
    chipRow.append(c);
  }
  let teams = teamsCache.get(league);
  if (!teams) body.replaceChildren(chipRow, skeleton('list', 6));
  try {
    if (!teams) {
      const res = await apiFetch(`${API}/api/teams?league=${league}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.status);
      teams = data.teams || [];
      teamsCache.set(league, teams);
    }
  } catch (e) {
    body.replaceChildren(chipRow, el('p', 'hint', `Teams didn't load (${e.message}).`));
    return;
  }
  if (body.dataset.view !== `fav:${league}`) return;
  const list = el('div', 'fav-list');
  for (const t of teams) {
    const on = settings.favourites.some((x) => x.league === league && String(x.id) === String(t.id));
    const row = el('button', `fav-row pick${on ? ' on' : ''}`);
    row.type = 'button';
    row.setAttribute('aria-pressed', String(on));
    const badge = el('span', 'badge', t.abbr || abbrev({ name: t.name }));
    paintTeam(badge, { name: t.name, color: t.color });
    row.append(badge, el('span', 'fav-name', t.name), el('span', 'star', on ? '★' : '☆'));
    row.addEventListener('click', () => {
      if (on) settings.favourites = settings.favourites.filter((x) => !(x.league === league && String(x.id) === String(t.id)));
      else settings.favourites = [...settings.favourites, { league, id: t.id, abbr: t.abbr, name: t.name, color: t.color }];
      saveSettings();
      openFavPicker(league);
      refresh();
    });
    list.append(row);
  }
  if (!teams.length) list.append(el('p', 'hint', league === 'cricket' ? 'No cricket teams are playing this week.' : 'No teams found.'));
  body.replaceChildren(chipRow, list);
  settleScroll();
}

// ---------- play by play, ball by ball, momentum charts ----------

function chartSection(title, svg, legend = []) {
  if (!svg) return null;
  const sec = el('section', 'chart-sec');
  const head = el('div', 'chart-head');
  head.append(el('h3', null, title));
  if (legend.length) {
    const lg = el('div', 'legend');
    for (const [label, color] of legend) {
      const item = el('span', 'lg-item');
      const dot = el('span', 'lg-dot');
      dot.style.background = color;
      item.append(dot, label);
      lg.append(item);
    }
    head.append(lg);
  }
  const box = el('div', 'chart-box');
  box.innerHTML = svg;
  sec.append(head, box);
  return sec;
}

async function playsPanel(f, g, panel) {
  panel.append(skeleton('list', 6));
  let d;
  try { d = await getPlays(f, true); }
  catch (e) { panel.replaceChildren(el('p', 'hint', `Play-by-play didn't load (${e.message}).`)); return; }
  if (!panel.isConnected) return;
  const comps = f.snap?.competitors || [];
  const compOf = (abbr) => comps.find((c) => c.short === abbr) || teamComp(f, g, abbr);
  const side = (abbr) => ({ abbr, color: teamColor(compOf(abbr)) });
  const parts = [];

  if (d.kind === 'cricket') {
    const cur = d.current;
    if (f.snap?.state === 'in' && cur) parts.push(section('At the crease', creaseBlock(f, cur)));
    const innings = d.innings || [];
    const latest = innings[innings.length - 1];
    if (latest) {
      const ov = d.overs.filter((o) => o.inn === latest.inn);
      parts.push(chartSection(`Runs per over, ${latest.team}`,
        manhattan(ov, side(latest.team).color, cur?.limited ? cur.maxOvers : 0), [['Wicket', 'var(--live)']]));
    }
    if (d.complete && cur?.limited && innings.length) {
      const inns = innings.map((i) => ({
        ...side(i.team),
        points: d.overs.filter((o) => o.inn === i.inn).map((o) => ({ n: o.n, total: o.total, wickets: o.wickets })),
      }));
      if (inns[1] && inns[1].abbr !== inns[0].abbr) inns[1].color = distinctFrom(inns[0].color, inns[1].color);
      parts.push(chartSection('Run worm', worm(inns, cur.maxOvers), inns.map((i) => [i.abbr, i.color])));
    }
    // Newest first, with a line at the start of each over.
    const list = el('ol', 'pbp');
    let lastOver = null;
    for (const b of d.recent || []) {
      const key = `${b.inn}:${b.over}`;
      if (key !== lastOver) {
        lastOver = key;
        const o = d.overs.find((x) => x.inn === b.inn && x.n === b.over);
        const head = el('li', 'pbp-head');
        head.append(el('b', null, `Over ${b.over}`),
          el('span', null, o ? [plural(o.runs, 'run'), o.wickets ? plural(o.wickets, 'wicket') : '', `${b.team} ${o.total}`].filter(Boolean).join(', ') : ''));
        list.append(head);
      }
      const li = el('li', `pbp-row${b.wicket ? ' big' : ''}`);
      li.append(el('span', `ball ${ballClass(b.token)}`, b.token), el('span', 'pbp-when', String(b.overs)));
      const txt = el('div', 'pbp-text');
      txt.append(el('span', null, b.text));
      if (b.detail) txt.append(el('span', 'pbp-sub', b.detail));
      li.append(txt);
      list.append(li);
    }
    if (list.children.length) parts.push(section('Ball by ball', list));
  } else if (d.kind === 'plays' || d.kind === 'commentary') {
    const home = side(d.home), away = side(d.away);
    away.color = distinctFrom(home.color, away.color);
    if (d.winProb?.length > 1) {
      parts.push(chartSection('Win probability', winProbChart(d.winProb, home, away),
        [[`${home.abbr} ${d.winProb.at(-1)}%`, home.color], [`${away.abbr} ${Math.round((100 - d.winProb.at(-1)) * 10) / 10}%`, away.color]]));
    }
    if (d.margin?.length > 1) {
      parts.push(chartSection('Lead tracker', leadChart(d.margin, d.length, f.league === 'nba' ? 720 : 900, home, away),
        [[home.abbr, home.color], [away.abbr, away.color]]));
    }
    const list = el('ol', 'pbp');
    for (const it of d.items || []) {
      if (it.header) {
        const head = el('li', 'pbp-head drive');
        const comp = compOf(it.team);
        const badge = el('span', 'badge', abbrev(comp));
        paintTeam(badge, comp);
        head.append(badge, el('span', null, it.text));
        if (it.scoring) head.classList.add('scored');
        list.append(head);
        continue;
      }
      const li = el('li', `pbp-row${it.scoring ? ' big' : ''}`);
      if (it.team) paintTeam(li, compOf(it.team));
      li.append(el('span', 'pbp-when', it.when || ''));
      const txt = el('div', 'pbp-text');
      if (it.down) txt.append(el('span', 'pbp-sub', it.down));
      txt.append(el('span', null, it.text));
      li.append(txt);
      const right = el('span', 'pbp-score');
      if (it.tag) right.append(el('span', 'pbp-tag', it.tag));
      if (it.score && it.scoring) right.append(el('span', null, it.score));
      li.append(right);
      list.append(li);
    }
    if (list.children.length) parts.push(section(d.kind === 'commentary' ? 'Commentary' : 'Play by play', list));
  }
  const shown = parts.filter(Boolean);
  panel.replaceChildren(...(shown.length ? shown : [el('p', 'hint', 'ESPN hasn’t published play-by-play for this game yet.')]));
  settleScroll();
}

async function formPanel(f, g, panel) {
  panel.append(skeleton('list', 5));
  let teams;
  try { teams = await getForm(f, g); }
  catch (e) { panel.replaceChildren(el('p', 'hint', `Recent results didn't load (${e.message}).`)); return; }
  const blocks = teams.map((t) => {
    const comp = teamComp(f, g, t.abbr || (f.snap?.competitors || []).find((c) => c.id === t.id)?.short || '');
    const sec = el('section', 'form-team');
    paintTeam(sec, comp);
    const head = el('div', 'form-head');
    const badge = el('span', 'badge', abbrev(comp));
    paintTeam(badge, comp);
    const name = el('div', 'form-name');
    name.append(el('b', null, comp.name || t.name || t.abbr), el('span', null, t.record ? `Record ${t.record}` : ''));
    const strip = el('div', 'form-strip');
    strip.setAttribute('aria-label', `Last ${t.results.length} results, newest first`);
    for (const r of t.results) strip.append(el('span', `pill ${r.result}`, r.result));
    head.append(badge, name, strip);
    sec.append(head);
    if (t.error) { sec.append(el('p', 'hint small', `Results unavailable (${t.error}).`)); return sec; }
    if (!t.results.length) { sec.append(el('p', 'hint small', 'No completed games yet this season.')); return sec; }
    const list = el('ol', 'form-list');
    for (const r of t.results) {
      const li = el('li');
      li.append(
        el('span', `pill ${r.result}`, r.result),
        el('span', 'form-opp', `${r.home ? 'v' : '@'} ${r.oppName || r.opp}`),
        el('span', 'form-score', `${r.us}–${r.them}`),
        el('span', 'form-date', shortDate(r.date)),
      );
      list.append(li);
    }
    sec.append(list);
    if (t.next) sec.append(el('p', 'form-next', `Next: ${t.next.home ? 'v' : '@'} ${t.next.oppName || t.next.opp}, ${kickoffLong(t.next.date)}`));
    return sec;
  });
  panel.replaceChildren(...blocks);
  settleScroll();
}

// Player screen: last games as a table (date, opponent, result, stats),
// grouped like the box score, with season totals underneath.
async function fillRecent(f, p, section) {
  let log;
  try { log = await getHistory(f, p.id); }
  catch (e) { section.replaceChildren(el('h3', null, 'Recent games'), el('p', 'hint small', `Recent games didn't load (${e.message}).`)); return; }
  if (!log.games?.length) {
    section.replaceChildren(el('h3', null, 'Recent games'), el('p', 'hint small', 'No games logged for this player yet.'));
    return;
  }
  const table = el('table', 'grid gamelog');
  table.append(el('thead'), el('tbody'));
  if (log.groups?.length > 1) {
    const gr = el('tr', 'group-row');
    const lead = el('th', 'name', '');
    lead.colSpan = 2;
    gr.append(lead);
    for (const grp of log.groups) {
      const th = el('th', 'group', grp.label);
      th.colSpan = grp.span;
      gr.append(th);
    }
    table.tHead.append(gr);
  }
  const hr = el('tr');
  hr.append(el('th', 'name', 'Game'), el('th', 'res', ''));
  for (const c of log.columns) {
    const th = el('th', null, c.abbr);
    th.title = c.label;
    hr.append(th);
  }
  table.tHead.append(hr);
  for (const gm of log.games) {
    const tr = el('tr');
    const name = el('th', 'name');
    name.append(el('span', 'gl-opp', `${gm.atVs === '@' ? '@' : 'v'} ${gm.opp}`), el('span', 'how-out', shortDate(gm.date)));
    const res = el('td', 'res');
    res.append(el('span', `pill ${gm.result}`, gm.result || '–'), el('span', 'gl-score', gm.score));
    tr.append(name, res, ...gm.values.map((v) => el('td', null, v)));
    table.tBodies[0].append(tr);
  }
  if (log.summary?.length) {
    const foot = el('tfoot');
    for (const row of log.summary) {
      const tr = el('tr', 'total');
      const th = el('th', 'name', row.label);
      tr.append(th, el('td', 'res', ''), ...row.values.map((v) => el('td', null, v)));
      foot.append(tr);
    }
    table.append(foot);
  }
  const wrap = el('div', 'table-wrap card-table');
  wrap.append(table);
  section.replaceChildren(el('h3', null, `Recent games${log.season ? `, ${log.season}` : ''}`), wrap);
  settleScroll();
}

function shortDate(iso) {
  return iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
}

// Grey placeholder shapes while something loads (shimmer respects reduced motion).
function skeleton(kind = 'list', rows = 5) {
  const wrap = el('div', `skeleton ${kind}`);
  wrap.setAttribute('aria-busy', 'true');
  wrap.setAttribute('aria-label', 'Loading');
  if (kind === 'game') {
    const head = el('div', 'sk-head');
    head.append(el('span', 'sk-block sk-badge'), el('span', 'sk-block sk-score'), el('span', 'sk-block sk-badge'));
    wrap.append(head, el('span', 'sk-block sk-tabs'));
  }
  for (let i = 0; i < rows; i++) {
    const row = el('div', 'sk-row');
    row.append(el('span', 'sk-block sk-line'), el('span', 'sk-block sk-short'));
    wrap.append(row);
  }
  return wrap;
}

// ---------- helpers ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function rank(e) { return { in: 0, pre: 1, post: 2 }[e.state] ?? 3; }
function haystack(e) {
  return [e.name, e.group, ...(e.competitors || []).map((c) => `${c.name} ${c.short || ''}`)].join(' ').toLowerCase();
}
function dayLabel(iso) {
  if (!iso) return 'Date to be confirmed';
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}
function timeOnly(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'TBC';
}
// Compact kick-off for the card corner: "7:30 pm", "Tomorrow 11:15 am", "Wed 9:00 pm".
function kickoff(iso) {
  if (!iso) return 'TBC';
  const day = dayLabel(iso);
  if (day === 'Today') return timeOnly(iso);
  if (day === 'Tomorrow' || day === 'Yesterday') return `${day} ${timeOnly(iso)}`;
  return `${new Date(iso).toLocaleDateString([], { weekday: 'short' })} ${timeOnly(iso)}`;
}
function kickoffLong(iso) {
  return iso ? `${dayLabel(iso)} at ${timeOnly(iso)}` : '';
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 20) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
function demoFixtures(league) {
  return DEMO_FOLLOWS.filter((f) => f.league === league).map((f) => f.snap);
}

// ---------- boot ----------

render();
refresh();
if (!DEMO && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
