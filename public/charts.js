// Small, dependency-free SVG charts for the game screen.
// Each returns an SVG string sized by its viewBox; CSS makes it full width.
// Colours come in as team colours; neutral strokes use currentColor.

const W = 320;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let uid = 0;

// Fill above the middle line in one colour and below it in another, using
// the same area clipped twice. Used by win probability and the lead tracker.
function twoTone(points, midY, top, bottom, H, colors) {
  const id = `c${++uid}`;
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${line}L${points[points.length - 1][0].toFixed(1)},${midY}L${points[0][0].toFixed(1)},${midY}Z`;
  return `
    <defs>
      <clipPath id="${id}a"><rect x="0" y="${top}" width="${W}" height="${midY - top}"/></clipPath>
      <clipPath id="${id}b"><rect x="0" y="${midY}" width="${W}" height="${bottom - midY}"/></clipPath>
    </defs>
    <path d="${area}" fill="${colors[0]}" fill-opacity=".28" clip-path="url(#${id}a)"/>
    <path d="${area}" fill="${colors[1]}" fill-opacity=".28" clip-path="url(#${id}b)"/>
    <path d="${line}" fill="none" stroke="${colors[0]}" stroke-width="2" clip-path="url(#${id}a)" stroke-linejoin="round"/>
    <path d="${line}" fill="none" stroke="${colors[1]}" stroke-width="2" clip-path="url(#${id}b)" stroke-linejoin="round"/>`;
}

// values: home win % after each play. Home is drawn above the line.
export function winProbChart(values, home, away) {
  const H = 132, top = 14, bottom = 118, mid = (top + bottom) / 2;
  const n = values.length;
  if (n < 2) return '';
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => bottom - (v / 100) * (bottom - top);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const last = values[n - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Win probability: ${esc(home.abbr)} ${last}%, ${esc(away.abbr)} ${Math.round((100 - last) * 10) / 10}%">
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="currentColor" stroke-opacity=".25" stroke-dasharray="3 3"/>
    <text x="4" y="${top - 3}" class="ch-lbl">${esc(home.abbr)} 100%</text>
    <text x="4" y="${H - 2}" class="ch-lbl">${esc(away.abbr)} 100%</text>
    ${twoTone(pts, mid, top, bottom, H, [home.color, away.color])}
    <circle cx="${pts[n - 1][0] - 2}" cy="${pts[n - 1][1]}" r="3.5" fill="${last >= 50 ? home.color : away.color}"/>
  </svg>`;
}

// points: [{ t: seconds elapsed, d: home minus away }]. Step line, with
// quarter lines. length: total seconds in the game so far (or regulation).
export function leadChart(points, length, periodLen, home, away) {
  if (points.length < 2) return '';
  const H = 140, top = 12, bottom = 118, mid = (top + bottom) / 2;
  const maxAbs = Math.max(5, ...points.map((p) => Math.abs(p.d)));
  const x = (t) => Math.min(W, (t / length) * W);
  const y = (d) => mid - (d / maxAbs) * (mid - top);
  const pts = [];
  points.forEach((p, i) => {
    if (i) pts.push([x(p.t), y(points[i - 1].d)]);
    pts.push([x(p.t), y(p.d)]);
  });
  const periods = Math.round(length / periodLen);
  let grid = '';
  for (let i = 1; i < Math.max(periods, 4); i++) {
    const gx = x(i * periodLen);
    grid += `<line x1="${gx}" x2="${gx}" y1="${top}" y2="${bottom}" stroke="currentColor" stroke-opacity=".12"/>`;
  }
  const qs = Array.from({ length: Math.max(periods, 4) }, (_, i) =>
    `<text x="${x((i + 0.5) * periodLen)}" y="${H - 6}" text-anchor="middle" class="ch-lbl">${i < 4 ? `Q${i + 1}` : 'OT'}</text>`).join('');
  const biggest = points.reduce((a, p) => (p.d > a.h ? { ...a, h: p.d } : p.d < -a.a ? { ...a, a: -p.d } : a), { h: 0, a: 0 });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Lead tracker. Biggest leads: ${esc(home.abbr)} ${biggest.h}, ${esc(away.abbr)} ${biggest.a}">
    ${grid}
    <line x1="0" x2="${W}" y1="${mid}" y2="${mid}" stroke="currentColor" stroke-opacity=".3"/>
    <text x="4" y="${top + 9}" class="ch-lbl">${esc(home.abbr)} +${maxAbs}</text>
    <text x="4" y="${bottom - 3}" class="ch-lbl">${esc(away.abbr)} +${maxAbs}</text>
    ${twoTone(pts, mid, top, bottom, H, [home.color, away.color])}
    ${qs}
  </svg>`;
}

// Runs per over (bars) with wickets as dots on top.
export function manhattan(overs, color, maxOvers) {
  if (!overs.length) return '';
  const H = 130, top = 16, bottom = 112;
  const count = Math.max(maxOvers || 0, overs[overs.length - 1].n, 10);
  const maxRuns = Math.max(8, ...overs.map((o) => o.runs));
  const bw = W / count;
  const bars = overs.map((o) => {
    const h = (o.runs / maxRuns) * (bottom - top);
    const bx = (o.n - 1) * bw + bw * 0.15;
    const dots = Array.from({ length: o.wickets }, (_, k) =>
      `<circle cx="${bx + bw * 0.35}" cy="${bottom - h - 5 - k * 7}" r="2.8" class="ch-wkt"/>`).join('');
    return `<rect x="${bx.toFixed(1)}" y="${(bottom - h).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="1.5" fill="${color}"/>${dots}`;
  }).join('');
  const ticks = [];
  const step = count > 60 ? 20 : count > 25 ? 10 : 5;
  for (let n = step; n <= count; n += step) ticks.push(`<text x="${((n - 0.5) * bw).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="ch-lbl">${n}</text>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Runs per over">
    <line x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" stroke="currentColor" stroke-opacity=".3"/>
    <text x="4" y="${top - 4}" class="ch-lbl">${maxRuns} runs</text>
    ${bars}${ticks.join('')}
  </svg>`;
}

// Running total by over for each innings, so a chase can be read against the target.
export function worm(innings, maxOvers) {
  const all = innings.flatMap((i) => i.points);
  if (all.length < 2) return '';
  const H = 140, top = 14, bottom = 116;
  const count = Math.max(maxOvers || 0, ...all.map((p) => p.n), 10);
  const maxRuns = Math.max(50, ...all.map((p) => p.total));
  const x = (n) => (n / count) * W;
  const y = (r) => bottom - (r / maxRuns) * (bottom - top);
  const lines = innings.map((inn) => {
    const pts = [[0, bottom], ...inn.points.map((p) => [x(p.n), y(p.total)])];
    const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
    const wk = inn.points.filter((p) => p.wickets).map((p) => `<circle cx="${x(p.n).toFixed(1)}" cy="${y(p.total).toFixed(1)}" r="2.8" class="ch-wkt"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${inn.color}" stroke-width="2.2" stroke-linejoin="round"/>${wk}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Run worm">
    <line x1="0" x2="${W}" y1="${bottom}" y2="${bottom}" stroke="currentColor" stroke-opacity=".3"/>
    <text x="4" y="${top - 3}" class="ch-lbl">${maxRuns}</text>
    <text x="${W - 4}" y="${H - 6}" text-anchor="end" class="ch-lbl">${count} overs</text>
    ${lines}
  </svg>`;
}
