// Share a game as a picture: the score card drawn onto a canvas, then handed
// to the phone's share sheet (or downloaded where sharing files isn't supported).

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const TEXT = 'Barlow, -apple-system, "Segoe UI", Roboto, sans-serif';
const W = 1080;
const PAD = 64;

function readableOn(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1C2127' : '#fff';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, max) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(ctx, text, max) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// card: { league, context, status: { text, live }, sides: [{ abbr, name, color, score, sub, lost }],
//         field: [{ pos, name, val, focus }], lines: [string], players: [{ name, team, stats: [[value, label]] }] }
export async function drawShareImage(card) {
  try {
    await Promise.all([
      document.fonts.load(`800 100px ${DISPLAY}`),
      document.fonts.load(`700 40px ${TEXT}`),
      document.fonts.load(`600 30px ${TEXT}`),
    ]);
  } catch { /* fall back to system fonts */ }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Measure first, then draw at the right height.
  ctx.font = `500 32px ${TEXT}`;
  const lines = (card.lines || []).flatMap((l) => wrap(ctx, l, W - PAD * 2));
  const sideH = 150;
  const players = (card.players || []).slice(0, 3);
  let H = PAD + 60 + 30;
  H += card.sides?.length ? card.sides.length * sideH : 0;
  H += card.field?.length ? card.field.length * 92 : 0;
  H += lines.length ? 24 + lines.length * 44 : 0;
  const COLS = 4;
  const playerH = (p) => 70 + Math.ceil(Math.min(p.stats.length, 8) / COLS) * 96 + 16;
  H += players.length ? 40 + players.reduce((a, p) => a + playerH(p) + 16, 0) : 0;
  H += 150; // footer
  H = Math.max(H, 760);
  canvas.width = W;
  canvas.height = H;

  // Background: dark slate with each team's colour glowing from its side.
  ctx.fillStyle = '#0F1317';
  ctx.fillRect(0, 0, W, H);
  const [a, b] = card.sides || [];
  const glow = (x, y, color) => {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 760);
    g.addColorStop(0, `${color}66`);
    g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(0, 0, a?.color || '#2F6FEB');
  glow(W, H * 0.6, b?.color || '#E0312B');
  ctx.fillStyle = 'rgba(15,19,23,.35)';
  ctx.fillRect(0, 0, W, H);

  let y = PAD;
  // Top line: league and context, status pill on the right.
  ctx.textBaseline = 'middle';
  const pillText = card.status?.text || '';
  ctx.font = `700 30px ${TEXT}`;
  const pillW = pillText ? ctx.measureText(pillText).width + (card.status.live ? 64 : 40) : 0;
  if (pillText) {
    roundRect(ctx, W - PAD - pillW, y, pillW, 56, 14);
    ctx.fillStyle = card.status.live ? '#E0312B' : 'rgba(255,255,255,.14)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    if (card.status.live) {
      ctx.beginPath();
      ctx.arc(W - PAD - pillW + 28, y + 28, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(pillText, W - PAD - pillW + (card.status.live ? 46 : 20), y + 29);
  }
  ctx.font = `700 34px ${TEXT}`;
  ctx.fillStyle = '#fff';
  const league = card.league || '';
  ctx.fillText(league, PAD, y + 28);
  const lw = ctx.measureText(league).width;
  ctx.font = `500 32px ${TEXT}`;
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.fillText(fit(ctx, card.context || '', W - PAD * 2 - lw - pillW - 40), PAD + lw + 16, y + 28);
  y += 60 + 30;

  // Teams and scores.
  for (const s of card.sides || []) {
    const mid = y + sideH / 2;
    ctx.fillStyle = s.color || '#555';
    roundRect(ctx, 0, y + 22, 12, sideH - 44, 6);
    ctx.fill();
    ctx.font = `700 30px ${TEXT}`;
    const bw = Math.max(110, ctx.measureText(s.abbr).width + 36);
    roundRect(ctx, PAD, mid - 34, bw, 68, 16);
    ctx.fillStyle = s.color || '#444';
    ctx.fill();
    ctx.fillStyle = readableOn(s.color);
    ctx.textAlign = 'center';
    ctx.fillText(s.abbr || '', PAD + bw / 2, mid + 1);
    ctx.textAlign = 'left';

    ctx.textAlign = 'right';
    let scoreW = 0;
    if (s.score) {
      const big = s.score.length > 6 ? 76 : 112;
      ctx.font = `800 ${big}px ${DISPLAY}`;
      ctx.fillStyle = s.lost ? 'rgba(255,255,255,.55)' : '#fff';
      ctx.fillText(s.score, W - PAD, s.sub ? mid - 14 : mid + 4);
      scoreW = ctx.measureText(s.score).width;
      if (s.sub) {
        ctx.font = `600 28px ${TEXT}`;
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.fillText(s.sub, W - PAD, mid + 44);
        scoreW = Math.max(scoreW, ctx.measureText(s.sub).width);
      }
    }
    ctx.textAlign = 'left';
    ctx.font = `700 48px ${TEXT}`;
    ctx.fillStyle = s.lost ? 'rgba(255,255,255,.6)' : '#fff';
    ctx.fillText(fit(ctx, s.name, W - PAD * 2 - bw - 32 - scoreW - 32), PAD + bw + 28, mid + 2);
    y += sideH;
  }

  // Golf and F1: the order.
  for (const r of card.field || []) {
    const mid = y + 46;
    if (r.focus) {
      roundRect(ctx, PAD - 20, y + 6, W - PAD * 2 + 40, 80, 16);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fill();
    }
    ctx.font = `800 60px ${DISPLAY}`;
    ctx.fillStyle = r.focus ? '#FF6B63' : '#F0B93E';
    ctx.fillText(r.pos, PAD, mid + 2);
    ctx.font = `700 44px ${TEXT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText(fit(ctx, r.name, W - PAD * 2 - 300), PAD + 130, mid);
    if (r.val) {
      ctx.textAlign = 'right';
      ctx.font = `700 40px ${TEXT}`;
      ctx.fillText(r.val, W - PAD, mid);
      ctx.textAlign = 'left';
    }
    y += 92;
  }

  // Detail lines (cricket situation, scorers).
  if (lines.length) {
    y += 24;
    ctx.font = `500 32px ${TEXT}`;
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    for (const l of lines) { ctx.fillText(l, PAD, y + 20); y += 44; }
  }

  // Tracked players: name, then stat tiles (number over label), four a row.
  if (players.length) {
    y += 40;
    const tileW = (W - PAD * 2) / COLS;
    for (const p of players) {
      const h = playerH(p);
      roundRect(ctx, PAD - 20, y, W - PAD * 2 + 40, h, 22);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fill();
      ctx.font = `700 36px ${TEXT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name, PAD, y + 40);
      const nw = ctx.measureText(p.name).width;
      ctx.font = `600 26px ${TEXT}`;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillText(p.team || '', PAD + nw + 14, y + 42);
      p.stats.slice(0, 8).forEach(([value, label], i) => {
        const tx = PAD + (i % COLS) * tileW;
        const ty = y + 70 + Math.floor(i / COLS) * 96;
        ctx.font = `800 56px ${DISPLAY}`;
        ctx.fillStyle = '#fff';
        ctx.fillText(fit(ctx, value, tileW - 16), tx, ty + 30);
        ctx.font = `600 23px ${TEXT}`;
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.fillText(fit(ctx, label, tileW - 16), tx, ty + 74);
      });
      y += h + 16;
    }
  }

  // Footer: wordmark and date.
  const fy = H - PAD - 10;
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.fillStyle = '#fff';
  ctx.fillText('Sideline', PAD, fy);
  ctx.textAlign = 'right';
  ctx.font = `500 28px ${TEXT}`;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText(new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }), W - PAD, fy + 4);
  ctx.textAlign = 'left';
  return canvas;
}

// Share sheet where available; otherwise save the picture.
export async function shareCanvas(canvas, title) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Couldn’t make the picture');
  const file = new File([blob], 'sideline-score.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sideline-score.png';
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'saved';
}
