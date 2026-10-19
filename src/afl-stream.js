import { DurableObject } from 'cloudflare:workers';
import { normalizeSquiggle } from './normalize.js';

// One shared object that holds a single connection to Squiggle's Event API
// (Server-Sent Events) while anyone has the app open, and drops it a few
// minutes after the last viewer leaves.
//
// Why: Squiggle asks that live scores come from the Event API, not from
// re-polling the Standard API (which is cached ~60s anyway). The app polls
// this Worker; the Worker never re-polls Squiggle for live data.

const SSE_URL = 'https://sse.squiggle.com.au/games';
const API = 'https://api.squiggle.com.au/';
const IDLE_MS = 5 * 60 * 1000;          // close the stream after 5 min unwatched
const FIXTURE_MS = 30 * 60 * 1000;      // refresh upcoming fixtures every 30 min
const TEAMS_MS = 24 * 60 * 60 * 1000;   // team list once a day
const FINAL_KEEP_MS = 24 * 60 * 60 * 1000;

export class AflStream extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.live = new Map();   // game id -> latest state from the stream
    this.abort = null;
    this.lastSeen = 0;
  }

  get userAgent() {
    const email = this.env.CONTACT_EMAIL;
    if (!email || email.includes('example.com')) {
      throw new Error('AFL needs a contact email: run `npx wrangler secret put CONTACT_EMAIL` (Squiggle requires it in the User-Agent)');
    }
    return `Sideline live scores - ${email}`;
  }

  // Called by the Worker on every app refresh. Returns all AFL games we know.
  async snapshot() {
    this.lastSeen = Date.now();
    const ua = this.userAgent;
    if (!this.abort) this.#startStream(ua);
    if (!(await this.ctx.storage.getAlarm())) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }

    const [teams, fixtures, finals] = await Promise.all([
      this.#teams(ua),
      this.#fixtures(ua),
      this.ctx.storage.get('finals').then((f) => f || {}),
    ]);

    // Live stream wins over fixtures; finals fill in games that just ended.
    const byId = new Map();
    for (const g of fixtures) byId.set(g.id, g);
    for (const [id, g] of Object.entries(finals)) byId.set(Number(id), g.game);
    for (const [id, g] of this.live) byId.set(id, g);

    return [...byId.values()]
      .map((g) => normalizeSquiggle(g, teams))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  // Completed games from the last `days` days. Doesn't open the live stream.
  async recent(days = 7) {
    const ua = this.userAgent;
    const [teams, done] = await Promise.all([this.#teams(ua), this.#completed(ua)]);
    const since = Date.now() / 1000 - days * 86_400;
    return done
      .filter((g) => Number(g.unixtime) >= since)
      .map((g) => normalizeSquiggle(g, teams))
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  }

  // This season's finished games (cached for an hour).
  async #completed(ua) {
    const cached = await this.ctx.storage.get('completed');
    if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.games;
    try {
      const year = new Date().getUTCFullYear();
      const res = await fetch(`${API}?q=games;year=${year};complete=100`, { headers: { 'User-Agent': ua } });
      const json = await res.json();
      const games = json.games || [];
      await this.ctx.storage.put('completed', { at: Date.now(), games });
      return games;
    } catch {
      return cached?.games || [];
    }
  }

  // Runs every minute while the stream is open; closes it once nobody's watching.
  async alarm() {
    if (Date.now() - this.lastSeen > IDLE_MS) {
      this.abort?.abort();
      this.abort = null;
      this.live.clear();
      return;
    }
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  async #teams(ua) {
    const cached = await this.ctx.storage.get('teams');
    if (cached && Date.now() - cached.at < TEAMS_MS) return cached.map;
    try {
      const res = await fetch(`${API}?q=teams`, { headers: { 'User-Agent': ua } });
      const json = await res.json();
      const map = {};
      for (const t of json.teams || []) map[t.id] = { name: t.name, abbrev: t.abbrev, logo: t.logo };
      await this.ctx.storage.put('teams', { at: Date.now(), map });
      return map;
    } catch {
      return cached?.map || {};
    }
  }

  // Games not yet finished this season (cached, so Squiggle sees ~2 requests/hour at most).
  async #fixtures(ua) {
    const cached = await this.ctx.storage.get('fixtures');
    if (cached && Date.now() - cached.at < FIXTURE_MS) return cached.games;
    try {
      const year = new Date().getUTCFullYear();
      const res = await fetch(`${API}?q=games;year=${year};complete=!100`, { headers: { 'User-Agent': ua } });
      const json = await res.json();
      const games = json.games || [];
      await this.ctx.storage.put('fixtures', { at: Date.now(), games });
      return games;
    } catch {
      return cached?.games || [];
    }
  }

  async #rememberFinal(game) {
    const finals = (await this.ctx.storage.get('finals')) || {};
    finals[game.id] = { at: Date.now(), game };
    for (const [id, f] of Object.entries(finals)) {
      if (Date.now() - f.at > FINAL_KEEP_MS) delete finals[id];
    }
    await this.ctx.storage.put('finals', finals);
  }

  #onEvent(event, data) {
    let payload;
    try { payload = JSON.parse(data); } catch { return; }
    if (event === 'games' && Array.isArray(payload)) {
      this.live.clear();
      for (const g of payload) this.live.set(g.id, g);
    } else if (event === 'addGame' && payload?.id) {
      this.live.set(payload.id, payload);
    } else if (event === 'removeGame' && payload?.id) {
      this.live.delete(payload.id);
      if (Number(payload.complete) >= 100) this.#rememberFinal(payload);
    }
  }

  // Long-lived SSE reader with reconnect + exponential backoff.
  async #startStream(ua) {
    const controller = new AbortController();
    this.abort = controller;
    let backoff = 2_000;

    while (!controller.signal.aborted) {
      try {
        const res = await fetch(SSE_URL, {
          headers: { 'User-Agent': ua, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        backoff = 2_000;

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value.replace(/\r/g, '');
          let split;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            let event = 'message';
            const data = [];
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).trim());
            }
            if (data.length) this.#onEvent(event, data.join('\n'));
          }
        }
      } catch {
        if (controller.signal.aborted) break;
      }
      // Squiggle restarts occasionally; wait, then reconnect.
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
    if (this.abort === controller) this.abort = null;
  }
}

// A tiny per-day counter so the API-Football backup can never exceed its
// free 100 requests/day (we stop at 90 to leave headroom).
export class DailyQuota extends DurableObject {
  async take(limit = 90) {
    const day = new Date().toISOString().slice(0, 10);
    const rec = (await this.ctx.storage.get('q')) || { day, used: 0 };
    if (rec.day !== day) { rec.day = day; rec.used = 0; }
    if (rec.used >= limit) return false;
    rec.used += 1;
    await this.ctx.storage.put('q', rec);
    return true;
  }
}
