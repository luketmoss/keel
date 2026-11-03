// #765 - the Worker's mirror of Thrive Spin's Workouts columns (AE:AM): the new-workout object
// carries the nine blank, a Spin ride's narration names Thrive Spin and says its power, IF, TSS,
// kJ, FTP and intensity, and a plan with a Spin workout shows its id. Pure functions of a row.
//   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkout, provenanceOf, provenanceTag, describeSyncedFields, describeSpinRide,
} from './domain.js';

const NINE = [
  'avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w',
  'intensity_pct', 'ride_workout_id', 'streams_ref',
];

const blank = (o) => ({
  id: '', date: '', time: '', type: '', name: '', template_id: '', notes: '', elapsed_seconds: '',
  created: '', copied_from: '', status: '', moving_seconds: '', effort: '', distance_m: '',
  ascent_m: '', descent_m: '', avg_hr: '', sub_type: '', source: '', source_activity_id: '',
  raw_ref: '', fit_ref: '', fit_fetched_at: '', synced_at: '', started_at_utc: '', calories: '',
  estimated_seconds: '', sport_type: '', track_ref: '', trails: '',
  ...Object.fromEntries(NINE.map((f) => [f, ''])),
  ...o,
});

const ride = blank({
  id: 'w_ride', date: '2026-11-07', time: '08:02', type: 'bike', sub_type: 'indoor', name: 'Sweet Spot 3x12',
  moving_seconds: '3600', calories: '683', avg_hr: '141', source: 'spin', source_activity_id: 'ride-1',
  fit_ref: 'fit-1', fit_fetched_at: '2026-11-07T16:10:00.000Z', synced_at: '2026-11-07T16:10:00.000Z',
  started_at_utc: '2026-11-07T15:02:11Z', streams_ref: 'streams-1',
  avg_power_w: '190', np_w: '215', intensity_factor: '0.86', tss: '74', work_kj: '683', ftp_w: '250',
  intensity_pct: '100', ride_workout_id: 'rw_1a2b3c4d',
});

test('buildWorkout carries the nine Spin fields blank, whatever the caller sends', () => {
  const w = buildWorkout({ type: 'bike', name: 'Evening Ride', ride_workout_id: 'rw_x', tss: '9' });
  for (const f of NINE) assert.equal(w[f], '', f);
});

test('a Spin ride is named Thrive Spin as its source, in a list line and in the provenance line', () => {
  assert.equal(provenanceOf(ride), 'synced');
  assert.equal(provenanceTag(ride), ' (Thrive Spin)');
  const lines = describeSyncedFields(ride);
  assert.ok(
    lines.includes(
      '- Provenance: recorded by Thrive Spin (activity ride-1, last synced 2026-11-07T16:10:00.000Z)'),
    lines.join('\n'),
  );
});

test('a Spin ride\'s narration has its power, IF, TSS, kJ, FTP and intensity line, and the Spin workout ridden', () => {
  const lines = describeSyncedFields(ride);
  assert.ok(
    lines.includes('- Ride: avg 190 W, NP 215 W, IF 0.86, TSS 74, 683 kJ, FTP 250 W, intensity 100%'),
    lines.join('\n'),
  );
  assert.ok(lines.includes('- Spin workout ridden: rw_1a2b3c4d'));
  assert.ok(lines.includes('- Ride streams: stored in Drive (streams-1)'));
  assert.ok(lines.includes('- FIT file: archived in Drive (fit-1), saved 2026-11-07T16:10:00.000Z'));
  // Indoors: no GPS track, no trails, no COROS link.
  assert.ok(!lines.some((l) => /GPS track|Trails|COROS:/.test(l)), lines.join('\n'));
});

test('a free ride has no Spin workout line, and a blank figure is left out rather than printed as 0', () => {
  const free = blank({ ...ride, ride_workout_id: '', np_w: '', intensity_factor: '', tss: '' });
  const lines = describeSyncedFields(free);
  assert.ok(lines.includes('- Ride: avg 190 W, 683 kJ, FTP 250 W, intensity 100%'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('- Spin workout')));
  assert.equal(describeSpinRide(blank({ source: 'spin' })), '');
  assert.ok(!describeSyncedFields(blank({ source: 'spin', source_activity_id: 'r' })).some((l) => l.startsWith('- Ride:')));
});

test('a plan with ride_workout_id shows the linked Spin workout, and one without shows nothing', () => {
  const plan = blank({ id: 'w_plan', date: '2026-11-08', type: 'bike', name: 'Plan', status: 'planned', ride_workout_id: 'rw_1a2b3c4d' });
  const lines = describeSyncedFields(plan);
  assert.ok(lines.includes('- Planned Spin workout: rw_1a2b3c4d'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.startsWith('- Ride:')));
  assert.deepEqual(describeSyncedFields({ ...plan, ride_workout_id: '' }), ['- Provenance: hand-logged']);
});

test('a COROS row is narrated as before, even with the new fields present', () => {
  const coros = blank({
    id: 'w_c', type: 'bike', name: 'Gravel', source: 'coros', source_activity_id: '4711',
    synced_at: '2026-09-24T17:41:10.000Z', moving_seconds: '5100',
  });
  assert.equal(provenanceTag(coros), ' (COROS)');
  assert.ok(describeSyncedFields(coros).includes(
    '- Provenance: synced from COROS (activity 4711, last synced 2026-09-24T17:41:10.000Z)'));
  assert.ok(!describeSyncedFields(coros).some((l) => l.startsWith('- Ride:')));
});
