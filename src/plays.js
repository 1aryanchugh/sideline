// Play-by-play, ball-by-ball and momentum data, read from ESPN.
//
//   Cricket  /cricket/{series}/playbyplay?event=…&page=N  (oldest ball first, 25 per page)
//   NBA      summary.plays[]          (score after every play)
//   NFL      summary.drives.{previous,current}[].plays[]
//   Soccer   summary.commentary[]
//   NFL/NBA  summary.winprobability[] (home win % after each play)
//
// Everything returns newest first, already trimmed for a phone screen.

const MAX_ITEMS = 60;

// ---------- cricket ----------

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const who = (x) => x?.athlete?.displayName || x?.athlete?.shortName || '';
const surname = (n) => String(n || '').split(' ').slice(-1)[0];

// "•" dot, "4", "6", "W", "1wd", "nb", "2lb"…
export function ballToken(it) {
  const runs = num(it.scoreValue) ?? 0;
  const type = String(it.playType?.description || '').toLowerCase();
  if (it.dismissal?.dismissal) return 'W';
  if (it.over?.wide || /wide/.test(type)) return runs > 1 ? `${runs}wd` : 'wd';
  if (it.over?.noBall || /no ?ball/.test(type)) return runs > 1 ? `${runs}nb` : 'nb';
  if (it.over?.legByes || /leg ?bye/.test(type)) return `${runs}lb`;
  if (it.over?.byes || /\bbye/.test(type)) return `${runs}b`;
  return runs === 0 ? '•' : String(runs);
}

function ballOf(it) {
  const bat = (b) => (b?.athlete ? {
    id: String(b.athlete.id ?? ''), name: who(b), runs: num(b.totalRuns) ?? 0, balls: num(b.faced) ?? 0,
  } : null);
  const inn = it.innings || {};
  return {
    seq: num(it.sequence) ?? 0,
    inn: num(it.period) ?? num(inn.number) ?? 1,
    innLabel: it.periodText || '',
    team: it.team?.abbreviation || '',
    over: num(it.over?.number) ?? 0,                 // 1-based over
    overs: it.over?.overs ?? it.over?.actual ?? '',  // e.g. 12.3
    overDone: !!it.over?.complete,
    token: ballToken(it),
    runs: num(it.scoreValue) ?? 0,
    wicket: !!it.dismissal?.dismissal,
    short: it.shortText || '',
    text: it.text || '',
    dismissal: it.dismissal?.dismissal ? (it.dismissal.text || '').replace(/\s+/g, ' ').trim() : '',
    batter: bat(it.batsman),
    other: bat(it.otherBatsman),
    bowler: it.bowler?.athlete ? {
      id: String(it.bowler.athlete.id ?? ''), name: who(it.bowler),
      overs: it.bowler.overs ?? '', maidens: num(it.bowler.maidens) ?? 0,
      conceded: num(it.bowler.conceded) ?? 0, wickets: num(it.bowler.wickets) ?? 0,
    } : null,
    total: num(inn.runs) ?? num(inn.totalRuns),
    wickets: num(inn.wickets) ?? 0,
    runRate: num(inn.runRate),
    target: num(inn.target) || null,
    remaining: num(inn.remainingBalls),
    limit: num(inn.ballLimit) || null,
  };
}

// items: every page's items, any order. Returns what the card and the
// "Ball by ball" tab need.
export function parseCricketBalls(items) {
  // Only real deliveries: ESPN mixes in notes (end of day, drinks, new batter)
  // that have no over number or batter, which would read as 0 (0).
  const balls = (items || []).map(ballOf)
    .filter((b) => b.seq && b.over > 0 && (b.batter?.name || b.bowler?.name))
    .sort((a, b) => a.seq - b.seq);
  if (!balls.length) return null;
  const last = balls[balls.length - 1];

  // This over (or the one just finished): every delivery, extras included.
  const thisOver = balls.filter((b) => b.inn === last.inn && b.over === last.over).map((b) => b.token);

  // At the crease. After a wicket the next batter isn't known until they face.
  const crease = [last.batter, last.other].filter(Boolean)
    .filter((b) => !(last.wicket && b.id === last.batter?.id));

  let need = null, rrr = null;
  if (last.target && last.total != null) {
    need = Math.max(0, last.target - last.total);
    if (last.remaining > 0) rrr = (need / (last.remaining / 6)).toFixed(2);
  }

  // Runs and wickets per over, per innings (Manhattan), and the running total (worm).
  const overs = [];
  for (const b of balls) {
    let o = overs.find((x) => x.inn === b.inn && x.n === b.over);
    if (!o) { o = { inn: b.inn, team: b.team, n: b.over, runs: 0, wickets: 0, total: 0 }; overs.push(o); }
    o.runs += b.runs;
    if (b.wicket) o.wickets += 1;
    if (b.total != null) o.total = b.total;
  }
  const innings = [...new Map(overs.map((o) => [o.inn, { inn: o.inn, team: o.team }])).values()];

  // Newest first, grouped by over: "Over 12: 1 4 • W  (8 runs, 1 wicket)".
  const recent = balls.slice(-MAX_ITEMS).reverse().map((b) => ({
    id: String(b.seq), inn: b.inn, team: b.team, over: b.over, overs: b.overs, token: b.token,
    text: b.short, detail: b.dismissal, wicket: b.wicket,
    score: b.total != null ? `${b.total}/${b.wickets}` : '',
  }));

  return {
    current: {
      inn: last.inn,
      team: last.team,
      score: last.total != null ? `${last.total}/${last.wickets}` : '',
      overs: last.overs,
      thisOver,
      overNumber: last.over,
      crease: crease.map((b) => ({ name: b.name, runs: b.runs, balls: b.balls, id: b.id })),
      striker: last.wicket ? null : last.batter?.id || null,
      bowler: last.bowler,
      runRate: last.runRate != null ? last.runRate.toFixed(2) : null,
      need,
      remaining: last.remaining,
      rrr,
      limited: !!last.limit,
      maxOvers: last.limit ? Math.round(last.limit / 6) : null,
      lastWicket: [...balls].reverse().find((b) => b.wicket)?.dismissal || '',
    },
    overs,
    innings,
    recent,
  };
}

// ---------- NBA / NFL / soccer ----------

function clockSecs(s) {
  const m = /^(\d+):(\d+)/.exec(String(s || ''));
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Seconds elapsed in the game at a play, for x positions on the lead chart.
function elapsed(league, period, clock) {
  const P = league === 'nba' ? 720 : 900;
  const OT = league === 'nba' ? 300 : 600;
  const regs = 4;
  const left = clockSecs(clock);
  if (period <= regs) return (period - 1) * P + (P - left);
  return regs * P + (period - regs - 1) * OT + (OT - left);
}

function sides(summary) {
  const comps = summary?.header?.competitions?.[0]?.competitors || [];
  const home = comps.find((c) => c.homeAway === 'home') || comps[0];
  const away = comps.find((c) => c.homeAway === 'away') || comps[1];
  const ab = (c) => c?.team?.abbreviation || '';
  const byId = new Map(comps.map((c) => [String(c.team?.id ?? c.id), ab(c)]));
  return { home: ab(home), away: ab(away), byId };
}

const periodName = (league, n) => {
  if (league === 'nba' || league === 'nfl') return n > 4 ? (n === 5 ? 'OT' : `${n - 4}OT`) : `Q${n}`;
  return n ? `P${n}` : '';
};

export function parsePlays(summary, league) {
  const { home, away, byId } = sides(summary);
  const out = { kind: 'none', home, away, items: [], winProb: [], margin: [], length: 0 };

  if (league === 'nba') {
    const plays = summary?.plays || [];
    out.kind = 'plays';
    let lastH = 0, lastA = 0;
    for (const p of plays) {
      const period = num(p.period?.number) ?? 1;
      const h = num(p.homeScore), a = num(p.awayScore);
      if (h != null && a != null && (h !== lastH || a !== lastA || !out.margin.length)) {
        out.margin.push({ t: elapsed('nba', period, p.clock?.displayValue), d: h - a });
        lastH = h; lastA = a;
      }
    }
    out.items = plays.slice(-MAX_ITEMS).reverse().map((p) => ({
      id: String(p.id ?? p.sequenceNumber ?? ''),
      when: [periodName('nba', num(p.period?.number)), p.clock?.displayValue].filter(Boolean).join(' '),
      text: p.text || p.type?.text || '',
      team: byId.get(String(p.team?.id ?? '')) || '',
      score: p.homeScore != null ? `${p.awayScore}–${p.homeScore}` : '',
      scoring: !!p.scoringPlay,
      tag: p.scoringPlay ? `+${p.scoreValue ?? ''}` : '',
    }));
    out.length = elapsed('nba', Math.max(4, ...plays.map((p) => num(p.period?.number) || 1)), '0:00');
  }

  if (league === 'nfl') {
    const drives = [...(summary?.drives?.previous || [])];
    const cur = summary?.drives?.current;
    if (cur && !drives.some((d) => d.id === cur.id)) drives.push(cur);
    out.kind = 'plays';
    const items = [];
    let lastH = 0, lastA = 0;
    for (const d of drives) {
      const team = d.team?.abbreviation || '';
      items.push({
        id: `d${d.id}`, header: true, team,
        text: [d.displayResult || d.result, d.description].filter(Boolean).join(', '),
        scoring: !!d.isScore,
      });
      for (const p of d.plays || []) {
        const period = num(p.period?.number) ?? 1;
        const h = num(p.homeScore), a = num(p.awayScore);
        if (h != null && a != null && (h !== lastH || a !== lastA)) {
          out.margin.push({ t: elapsed('nfl', period, p.clock?.displayValue), d: h - a });
          lastH = h; lastA = a;
        }
        items.push({
          id: String(p.id ?? ''),
          when: [periodName('nfl', period), p.clock?.displayValue].filter(Boolean).join(' '),
          down: p.start?.shortDownDistanceText || p.start?.downDistanceText || '',
          text: p.text || p.type?.text || '',
          team,
          score: h != null ? `${a}–${h}` : '',
          scoring: !!p.scoringPlay,
          tag: p.scoringPlay ? (p.type?.abbreviation || 'Score') : '',
        });
      }
    }
    if (out.margin.length) out.margin.unshift({ t: 0, d: 0 });
    // Newest first, keeping each drive's header above its plays.
    const groups = [];
    for (const it of items) {
      if (it.header) groups.push([it]);
      else if (groups.length) groups[groups.length - 1].push(it);
    }
    out.items = groups.reverse().flatMap(([head, ...plays]) => [head, ...plays.reverse()]).slice(0, MAX_ITEMS + 10);
    out.length = elapsed('nfl', Math.max(4, ...drives.flatMap((d) => (d.plays || []).map((p) => num(p.period?.number) || 1))), '0:00');
  }

  if (league === 'epl') {
    const list = summary?.commentary || [];
    out.kind = 'commentary';
    out.items = [...list]
      .sort((a, b) => (num(b.sequence) ?? 0) - (num(a.sequence) ?? 0))
      .slice(0, MAX_ITEMS)
      .map((c) => ({
        id: String(c.sequence ?? ''),
        when: c.time?.displayValue || '',
        text: c.text || '',
        scoring: /goal!/i.test(c.text || ''),
        tag: /goal!/i.test(c.text || '') ? 'Goal' : /yellow card/i.test(c.text || '') ? 'Yellow' : /red card/i.test(c.text || '') ? 'Red' : '',
      }))
      .filter((c) => c.text);
  }

  // Win probability: home team's chance after each play (NFL, NBA).
  out.winProb = (summary?.winprobability || [])
    .map((w) => num(w.homeWinPercentage))
    .filter((v) => v != null)
    .map((v) => Math.round(v * 1000) / 10);

  if (out.kind === 'plays' && !out.items.length && !out.winProb.length) out.kind = 'none';
  return out;
}
