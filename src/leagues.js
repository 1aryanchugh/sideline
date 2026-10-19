// Which upstream feed powers each league, and how fresh it needs to be.
// ESPN's public site API needs no key; "range" asks for a window of days so
// the add-a-game picker shows the coming week, not just today.

// `players: true` means ESPN publishes per-player stats for that sport's games.
// `rosters: true` means team rosters can be fetched before kick-off.
// `nextWeek: true`: the feed is week-based (NFL), so next week's games are fetched too.
// `form: true`: recent results from team schedules. `gamelog: true`: per-player game logs.
export const LEAGUES = {
  nfl:  { label: 'NFL',            source: 'espn', path: 'football/nfl',   nextWeek: true, players: true, rosters: true, form: true, gamelog: true, seasonTypes: true },
  nba:  { label: 'NBA',            source: 'espn', path: 'basketball/nba', range: [-1, 7], players: true, rosters: true, form: true, gamelog: true, seasonTypes: true },
  afl:  { label: 'AFL',            source: 'squiggle' }, // no free per-player AFL stats
  nrl:  { label: 'NRL',            source: 'espn', path: 'rugby-league/3', range: [-1, 7], players: true, form: true },
  epl:  { label: 'Premier League', source: 'espn', path: 'soccer/eng.1',   range: [-1, 7], backup: 'apiFootball', players: true, rosters: true, form: true },
  ufc:  { label: 'UFC',            source: 'espn', path: 'mma/ufc',        range: [-1, 14], kind: 'bouts', players: true },
  golf: { label: 'PGA Tour',       source: 'espn', path: 'golf/pga',       kind: 'field' },
  f1:   { label: 'Formula 1',      source: 'espn', path: 'racing/f1',      kind: 'sessions' },
  // One feed for every live cricket series (Tests, ODIs, T20s, BBL, county...).
  cricket: { label: 'Cricket', source: 'espn', url: 'https://site.api.espn.com/apis/site/v2/sports/cricket/scorepanel', kind: 'cricket', players: true },
};

// Seconds to cache an upstream response at Cloudflare's edge.
export const TTL = { live: 20, idle: 300 };
