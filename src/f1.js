// F1 session timing from OpenF1 (api.openf1.org). Free without a key for
// finished sessions; live timing needs their paid tier, so this fills in once
// a session is over. Everything is cached for an hour at the edge, which keeps
// well inside OpenF1's free limit (30 requests a minute).

export const OPENF1 = 'https://api.openf1.org/v1';

const COMPOUND = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' };

export function lapTime(sec) {
  if (sec == null || !Number.isFinite(Number(sec))) return '';
  const s = Number(sec);
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(3).padStart(6, '0');
  return m ? `${m}:${rest}` : rest;
}

const lastOf = (v) => (Array.isArray(v) ? [...v].reverse().find((x) => x != null) : v);

function gapText(gap, pos, isRace) {
  const g = lastOf(gap);
  if (pos === 1) return isRace ? 'Leader' : '';
  if (g == null || g === '') return '';
  if (typeof g === 'string') return g.startsWith('+') ? g : `+${g}`;
  return `+${Number(g).toFixed(3)}s`;
}

// raw: { session, drivers, results, laps, stints, pits } straight from OpenF1.
export function parseF1Timing(raw) {
  const isRace = /race|sprint$/i.test(raw.session?.session_type || '') || /race|sprint/i.test(raw.session?.session_name || '');
  const drivers = new Map((raw.drivers || []).map((d) => [d.driver_number, d]));

  // Best lap per driver, and the session's fastest.
  const best = new Map();
  for (const l of raw.laps || []) {
    const t = Number(l.lap_duration);
    if (!Number.isFinite(t) || t <= 0) continue;
    const cur = best.get(l.driver_number);
    if (!cur || t < cur.t) best.set(l.driver_number, { t, lap: l.lap_number });
  }
  let fastest = null;
  for (const [n, b] of best) if (!fastest || b.t < fastest.t) fastest = { n, ...b };

  const stintsBy = new Map();
  for (const s of (raw.stints || []).sort((a, b) => a.stint_number - b.stint_number)) {
    const list = stintsBy.get(s.driver_number) || [];
    list.push({
      compound: COMPOUND[String(s.compound || '').toUpperCase()] || '?',
      name: s.compound ? s.compound[0] + s.compound.slice(1).toLowerCase() : 'Unknown',
      from: s.lap_start, to: s.lap_end, age: s.tyre_age_at_start ?? 0,
    });
    stintsBy.set(s.driver_number, list);
  }
  const pitsBy = new Map();
  for (const p of raw.pits || []) pitsBy.set(p.driver_number, (pitsBy.get(p.driver_number) || 0) + 1);

  const results = [...(raw.results || [])].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const rows = results.map((r) => {
    const d = drivers.get(r.driver_number) || {};
    const b = best.get(r.driver_number);
    const status = r.dsq ? 'DSQ' : r.dns ? 'DNS' : r.dnf ? 'DNF' : '';
    return {
      pos: r.position ?? null,
      number: r.driver_number,
      code: d.name_acronym || '',
      name: d.full_name ? d.full_name.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : `Car ${r.driver_number}`,
      team: d.team_name || '',
      color: d.team_colour ? `#${d.team_colour}` : null,
      gap: status || gapText(r.gap_to_leader, r.position, isRace),
      time: isRace ? '' : lapTime(lastOf(r.duration)),
      laps: r.number_of_laps ?? null,
      points: r.points ?? null,
      best: b ? lapTime(b.t) : '',
      bestLap: b?.lap ?? null,
      fastest: fastest?.n === r.driver_number,
      stints: stintsBy.get(r.driver_number) || [],
      pits: pitsBy.get(r.driver_number) || 0,
    };
  });

  return {
    session: raw.session ? {
      key: raw.session.session_key, name: raw.session.session_name, type: raw.session.session_type,
      circuit: raw.session.circuit_short_name, country: raw.session.country_name, isRace,
    } : null,
    rows,
    fastest: fastest ? { code: drivers.get(fastest.n)?.name_acronym || '', time: lapTime(fastest.t), lap: fastest.lap } : null,
    totalLaps: Math.max(0, ...rows.map((r) => r.laps || 0)),
  };
}
