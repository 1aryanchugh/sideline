import test from 'node:test';
import assert from 'node:assert/strict';
import { parseF1Timing, lapTime } from '../src/f1.js';

test('lapTime formats seconds as m:ss.sss', () => {
  assert.equal(lapTime(95.432), '1:35.432');
  assert.equal(lapTime(59.9), '59.900');
  assert.equal(lapTime(null), '');
});

test('parseF1Timing: race order, gaps, best laps, stints, pit stops', () => {
  const t = parseF1Timing({
    session: { session_key: 1, session_name: 'Race', session_type: 'Race', circuit_short_name: 'Singapore' },
    drivers: [
      { driver_number: 4, name_acronym: 'NOR', full_name: 'Lando NORRIS', team_name: 'McLaren', team_colour: 'FF8000' },
      { driver_number: 81, name_acronym: 'PIA', full_name: 'Oscar PIASTRI', team_name: 'McLaren', team_colour: 'FF8000' },
      { driver_number: 1, name_acronym: 'VER', full_name: 'Max VERSTAPPEN', team_name: 'Red Bull Racing', team_colour: '3671C6' },
    ],
    results: [
      { position: 2, driver_number: 81, gap_to_leader: 7.335, number_of_laps: 62 },
      { position: 1, driver_number: 4, gap_to_leader: 0, number_of_laps: 62 },
      { position: null, driver_number: 1, dnf: true, number_of_laps: 30 },
    ],
    laps: [
      { driver_number: 4, lap_number: 40, lap_duration: 95.5 }, { driver_number: 81, lap_number: 41, lap_duration: 95.1 },
      { driver_number: 81, lap_number: 1, lap_duration: null },
    ],
    stints: [
      { driver_number: 4, stint_number: 2, compound: 'HARD', lap_start: 21, lap_end: 62 },
      { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 20 },
    ],
    pits: [{ driver_number: 4, lap_number: 20 }],
  });
  assert.deepEqual(t.rows.map((r) => `${r.pos} ${r.code} ${r.gap}`), ['1 NOR Leader', '2 PIA +7.335s', 'null VER DNF']);
  assert.equal(t.rows[0].name, 'Lando Norris');
  assert.deepEqual(t.rows[0].stints.map((s) => s.compound), ['M', 'H']);
  assert.equal(t.rows[0].pits, 1);
  assert.equal(t.rows[1].fastest, true);
  assert.deepEqual(t.fastest, { code: 'PIA', time: '1:35.100', lap: 41 });
  assert.equal(t.session.isRace, true);
});

test('parseF1Timing: qualifying uses each driver\'s last session time', () => {
  const t = parseF1Timing({
    session: { session_name: 'Qualifying', session_type: 'Qualifying' },
    drivers: [{ driver_number: 4, name_acronym: 'NOR', full_name: 'Lando NORRIS' }],
    results: [{ position: 1, driver_number: 4, duration: [91.2, 90.8, 90.1], gap_to_leader: [0, 0, 0] }],
  });
  assert.equal(t.rows[0].time, '1:30.100');
  assert.equal(t.rows[0].gap, '');
});
