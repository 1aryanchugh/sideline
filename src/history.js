// Past games: a team's recent results (from its ESPN schedule) and a
// player's game log (NFL, NBA).

const num = (v) => {
  const n = Number(typeof v === 'object' && v ? v.value ?? v.displayValue : v);
  return Number.isFinite(n) ? n : null;
};
const disp = (v) => (typeof v === 'object' && v ? v.displayValue ?? (v.value != null ? String(v.value) : '') : v ?? '');

// Recent results for one team, newest first, plus the next game.
// `schedules` is one or more ESPN team schedule responses (merged, de-duplicated).
export function parseForm(schedules, teamId, limit = 5) {
  const seen = new Set();
  const games = [];
  for (const json of schedules) {
    for (const ev of json?.events || []) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      // Preseason results say little about form; leave them out.
      if (ev.seasonType?.type === 1 || ev.seasonType?.abbreviation === 'pre') continue;
      const comp = ev.competitions?.[0] || {};
      const cs = comp.competitors || [];
      const us = cs.find((c) => String(c.id ?? c.team?.id) === String(teamId));
      const them = cs.find((c) => c !== us);
      if (!us || !them) continue;
      const type = comp.status?.type || ev.status?.type || {};
      const done = type.completed === true || type.state === 'post';
      games.push({
        id: String(ev.id),
        date: ev.date || comp.date,
        done,
        home: us.homeAway === 'home',
        opp: them.team?.abbreviation || them.team?.shortDisplayName || '',
        oppName: them.team?.displayName || '',
        oppColor: them.team?.color ? `#${them.team.color}` : null,
        us: disp(us.score),
        them: disp(them.score),
        result: !done ? '' : us.winner === true ? 'W' : them.winner === true ? 'L'
          : num(us.score) != null && num(us.score) === num(them.score) ? 'D'
          : num(us.score) > num(them.score) ? 'W' : num(us.score) < num(them.score) ? 'L' : '',
      });
    }
  }
  const byDate = (a, b) => Date.parse(a.date) - Date.parse(b.date);
  const past = games.filter((g) => g.done && g.result).sort(byDate).reverse().slice(0, limit);
  const next = games.filter((g) => !g.done && Date.parse(g.date) > Date.now()).sort(byDate)[0] || null;
  const team = schedules.find((s) => s?.team)?.team;
  return {
    id: String(teamId),
    abbr: team?.abbreviation || '',
    name: team?.displayName || '',
    record: team?.recordSummary || '',
    results: past.map(({ done, ...g }) => g),
    next: next ? { date: next.date, opp: next.opp, oppName: next.oppName, home: next.home } : null,
  };
}

// A player's game log: one row per game (newest first), column headings,
// grouped (Passing, Rushing…), and season summary rows (Totals, Averages).
export function parseGamelog(json, limit = 10) {
  const labels = json?.labels || [];
  const names = json?.names || [];
  const long = json?.displayNames || [];
  if (!labels.length) return { columns: [], groups: [], games: [], summary: [], season: '' };

  const columns = labels.map((abbr, i) => ({ key: names[i] || abbr, abbr, label: long[i] || abbr }));
  // Column groups, e.g. 11 passing columns then 5 rushing.
  const groups = (json.categories || []).filter((c) => c.count > 0).map((c) => ({ label: c.displayName || c.name, span: c.count }));

  const meta = json.events || {};
  const rows = new Map();
  const summary = [];
  let season = '';
  for (const st of json.seasonTypes || []) {
    if (!season) season = st.displayName || '';
    for (const cat of st.categories || []) {
      for (const e of cat.events || []) {
        if (!rows.has(String(e.eventId))) rows.set(String(e.eventId), e.stats || []);
      }
    }
    // Only the first season type's summary (regular season over preseason).
    if (!summary.length) {
      for (const s of st.summary?.stats || []) {
        if (Array.isArray(s.stats)) summary.push({ label: s.displayName || s.type || 'Totals', values: s.stats.map(String) });
      }
    }
  }

  const games = [...rows].map(([id, stats]) => {
    const m = meta[id] || {};
    return {
      id,
      date: m.gameDate || '',
      opp: m.opponent?.abbreviation || '',
      oppName: m.opponent?.displayName || '',
      atVs: m.atVs || '',
      result: m.gameResult || '',
      score: m.score || '',
      values: columns.map((_, i) => (stats[i] != null ? String(stats[i]) : '')),
    };
  })
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, limit);

  return { columns, groups, games, summary, season };
}
