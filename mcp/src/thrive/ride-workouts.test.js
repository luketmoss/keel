// #774 - the steps rules and the wording of the ride workout and FTP tools. Pure functions;
// `test/fixtures/ride-steps-golden.json` pins the Worker's copy of the API's steps rules.
//   node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  checkRideSteps, canonicalSteps, checkName, checkCategory, checkDescription, checkFtpWatts, checkFtpDate,
  describeBlocks, describeLibrary, describeWorkout, planUpdate, describeUpdatePreview, describeDeletePreview,
  describeFtp, describeFtpPreview, hms, hm, isUnknownAction,
} from './ride-workouts.js';

const golden = JSON.parse(readFileSync(new URL('../../test/fixtures/ride-steps-golden.json', import.meta.url), 'utf8'));

// The example in #765's header comment: 10 + 3 x (12 + 4) + 5 + 5 + 6 = 74 minutes.
const EXAMPLE = golden.valid[0].steps;

const stored = (o = {}) => ({
  id: 'rw_1a2b3c4d', name: 'Sweet Spot 3x12', category: 'Sweet spot', description: 'Three blocks.',
  steps: EXAMPLE, duration_s: '4440', created: 'c', updated: 'u', last_ridden_date: '2026-11-07', ...o,
});

test('every valid case in the golden fixture is accepted with its total', () => {
  for (const c of golden.valid) {
    const out = checkRideSteps(c.steps);
    assert.equal(out.duration_s, c.total_s, c.name);
    assert.equal(out.steps.v, 1, c.name);
    assert.deepEqual(out.steps.steps, Array.isArray(c.steps) ? c.steps : c.steps.steps, c.name);
  }
});

test('every invalid case in the golden fixture is refused with its message, naming where', () => {
  for (const c of golden.invalid) {
    assert.throws(() => checkRideSteps(c.steps), { message: c.error }, c.name);
  }
});

test('the golden fixture covers the refusals the issue names', () => {
  const names = golden.invalid.map((c) => c.name);
  for (const want of [
    'a nested repeat', 'pct 301', 'grade 4.55', 'a slope step carrying pct', 'a repeat of 1', 'a repeat of 51',
    'a label of 41 characters', 'a total of 21601 seconds',
  ]) assert.ok(names.includes(want), want);
  assert.ok(golden.invalid.some((c) => /unknown key/.test(c.error)));
});

test('a mistake is named by block and step', () => {
  assert.throws(
    () => checkRideSteps([{ label: 'a', dur_s: 60, mode: 'free' }, { repeat: 3, steps: [
      { label: 'b', dur_s: 60, mode: 'erg', pct: 301 }] }]),
    { message: 'block 2, step 1: pct 301 is over 300.' },
  );
});

test('the Worker never adds duration_s or timestamps to the steps it sends', () => {
  const { steps } = checkRideSteps(EXAMPLE.steps);
  assert.deepEqual(Object.keys(steps), ['v', 'steps']);
  assert.ok(!/duration|created|updated/.test(JSON.stringify(steps)));
});

test('canonicalSteps ignores key order and nothing else', () => {
  const a = { v: 1, steps: [{ label: 'x', dur_s: 60, mode: 'free' }] };
  const b = { steps: [{ mode: 'free', dur_s: 60, label: 'x' }], v: 1 };
  assert.equal(canonicalSteps(a), canonicalSteps(b));
  assert.notEqual(canonicalSteps(a), canonicalSteps({ v: 1, steps: [{ label: 'x', dur_s: 61, mode: 'free' }] }));
});

test('time formats', () => {
  assert.equal(hms(4440), '1:14:00');
  assert.equal(hms(59), '0:00:59');
  assert.equal(hm(4440), '1:14');
  assert.equal(hm(3570), '1:00');
});

test('name, category, description and FTP checks', () => {
  assert.equal(checkName('Sweet Spot'), 'Sweet Spot');
  assert.throws(() => checkName('  '), /name must be 1 to 80/);
  assert.throws(() => checkName('x'.repeat(81)), /name must be 1 to 80/);
  assert.equal(checkCategory('sweet spot'), 'Sweet spot');
  assert.equal(checkCategory('VO2'), 'VO2');
  assert.throws(() => checkCategory('Tempo'), /category "Tempo" is not one of Endurance, Sweet spot, Threshold, VO2, Recovery/);
  assert.equal(checkDescription(''), '');
  assert.throws(() => checkDescription('x'.repeat(1001)), /at most 1000/);
  assert.equal(checkFtpWatts(50), 50);
  assert.equal(checkFtpWatts(1000), 1000);
  for (const bad of [49, 1001, 250.5, NaN, '250']) assert.throws(() => checkFtpWatts(bad), /ftp_w must be a whole number of watts, 50 to 1000/);
  assert.equal(checkFtpDate('2026-11-03', '2026-11-03'), '2026-11-03');
  assert.throws(() => checkFtpDate('2026-11-04', '2026-11-03'), /after today/);
  assert.throws(() => checkFtpDate('2026-02-30', '2026-11-03'), /not a real date/);
});

test('the steps in words: a repeat as 3 x [...], a ramp as 50 -> 70%', () => {
  assert.deepEqual(describeBlocks(checkRideSteps(EXAMPLE).steps), [
    '1. Warm-up 10:00 ERG 50 -> 70% FTP',
    '2. 3 x [',
    '   - Sweet spot 12:00 ERG 90% FTP, 90 rpm',
    '   - Recover 4:00 ERG 55% FTP',
    '   ] (16:00 a round, 48:00 in all)',
    '3. Climb 5:00 slope 4.5%',
    '4. Spin 5:00 resistance level 30',
    '5. Cool-down 6:00 free ride',
  ]);
});

test('describeWorkout prints the header, the steps, the total and steps JSON that checks and is unchanged', () => {
  const text = describeWorkout(stored());
  assert.match(text, /^Sweet Spot 3x12 \(rw_1a2b3c4d\) · Sweet spot · 1:14:00 · last ridden 2026-11-07$/m);
  assert.match(text, /^Description: Three blocks\.$/m);
  assert.match(text, /3 x \[/);
  assert.match(text, /^Total: 1:14:00$/m);
  const json = text.split('\n').at(-1);
  const plan = planUpdate(stored(), { steps: checkRideSteps(JSON.parse(json)).steps });
  assert.deepEqual(plan.changes, []);
});

test('a workout whose stored steps cannot be read says so and shows no steps JSON', () => {
  const text = describeWorkout(stored({ steps: null }));
  assert.match(text, /the stored steps cannot be read/);
  assert.ok(!/Steps JSON/.test(text));
  assert.throws(() => planUpdate(stored({ steps: null }), { name: 'New' }), /cannot be read/);
});

test('the library is ordered by name, one line each, with never ridden', () => {
  const lib = [
    stored({ id: 'rw_b', name: 'zebra', category: 'Endurance', duration_s: '3600', last_ridden_date: '' }),
    stored({ id: 'rw_a', name: 'Alpha', description: 'sweet climbing' }),
  ];
  assert.equal(describeLibrary(lib), [
    '2 ride workouts:',
    'rw_a · Alpha · Sweet spot · 1:14 · last ridden 2026-11-07',
    'rw_b · zebra · Endurance · 1:00 · never ridden',
  ].join('\n'));
  assert.match(describeLibrary(lib, { category: 'Endurance' }), /^1 of 2 ride workouts \(category Endurance\):\nrw_b/);
  assert.match(describeLibrary(lib, { search: 'CLIMB' }), /rw_a/);
  assert.equal(describeLibrary(lib, { search: 'nothing' }), 'No ride workouts match search "nothing". The library has 2.');
  assert.equal(describeLibrary([]), "No ride workouts in Thrive Spin's library.");
});

test('planUpdate keeps what is not given as read, and finds only real changes', () => {
  const same = planUpdate(stored(), { name: 'Sweet Spot 3x12', category: 'Sweet spot', description: 'Three blocks.' });
  assert.deepEqual(same.changes, []);
  const renamed = planUpdate(stored(), { name: 'New name' });
  assert.deepEqual(renamed.changes, [{ key: 'name', from: 'Sweet Spot 3x12', to: 'New name' }]);
  assert.deepEqual(renamed.fields, {
    name: 'New name', category: 'Sweet spot', description: 'Three blocks.', steps: EXAMPLE,
  });
  assert.equal(renamed.fields.steps, EXAMPLE, 'the stored steps are sent exactly as read');
  const cleared = planUpdate(stored(), { description: '' });
  assert.deepEqual(cleared.changes.map((c) => c.key), ['description']);
});

test('the update preview shows only the fields that change, with steps in words', () => {
  const shorter = checkRideSteps([{ label: 'Spin', dur_s: 300, mode: 'free' }]).steps;
  const plan = planUpdate(stored(), { name: 'Short', steps: shorter });
  const text = describeUpdatePreview(stored(), plan);
  assert.match(text, /^DRY RUN — nothing written\./);
  assert.match(text, /- name: "Sweet Spot 3x12" -> "Short"/);
  assert.ok(!/- category|- description/.test(text));
  assert.match(text, /Now \(1:14:00\):/);
  assert.match(text, /Would be \(0:05:00\):/);
  assert.match(text, /3 x \[/);
  assert.match(text, /confirm: true/);
});

test('the delete preview shows the workout and its last ridden date, and what keeps its id', () => {
  const text = describeDeletePreview(stored());
  assert.match(text, /^DRY RUN — nothing deleted\./);
  assert.match(text, /rw_1a2b3c4d · Sweet Spot 3x12 · Sweet spot · 1:14 · last ridden 2026-11-07/);
  assert.match(text, /keep its id/);
  assert.match(describeDeletePreview(stored({ last_ridden_date: '' })), /never ridden/);
});

test('thrive_ftp: current, then history newest first, a ramp test naming its ride, and the empty case', () => {
  const history = [
    { id: 'f3', date: '2026-11-07', ftp_w: '255', source: 'manual', ride_id: '' },
    { id: 'f2', date: '2026-03-02', ftp_w: '240', source: 'ramp_test', ride_id: 'ride-9' },
    { id: 'f1', date: '2025-06-01', ftp_w: '230', source: 'manual', ride_id: '' },
  ];
  const text = describeFtp({ current: history[0], history });
  assert.equal(text, [
    'Current FTP: 255 W, set 2026-11-07 (manual)',
    '',
    'History, newest first (3 of 3):',
    '- 2026-11-07 · 255 W · manual',
    '- 2026-03-02 · 240 W · ramp test (ride ride-9)',
    '- 2025-06-01 · 230 W · manual',
  ].join('\n'));
  const narrowed = describeFtp({ current: history[0], history }, { from: '2026-01-01', to: '2026-06-30' });
  assert.match(narrowed, /^Current FTP: 255 W/);
  assert.match(narrowed, /History from 2026-01-01 to 2026-06-30, newest first \(1 of 3\):\n- 2026-03-02/);
  assert.match(describeFtp({ current: history[0], history }, { from: '2027-01-01' }), /No FTP entries from 2027-01-01 to today\./);
  assert.equal(describeFtp({ current: null, history: [] }), 'No FTP is recorded.');
});

test('the FTP preview sets the current FTP beside the new one', () => {
  const current = { id: 'f', date: '2026-03-02', ftp_w: '240', source: 'ramp_test', ride_id: 'r' };
  const text = describeFtpPreview(current, { ftp_w: 250, date: '2026-11-03' });
  assert.match(text, /^DRY RUN — nothing written\./);
  assert.match(text, /FTP now: 240 W \(set 2026-03-02, ramp test \(ride r\)\)\./);
  assert.match(text, /New: 250 W on 2026-11-03, source manual\./);
  assert.match(text, /never rescored/);
  assert.match(describeFtpPreview(current, { ftp_w: 250, date: '2026-01-01' }), /only adds to the history/);
  assert.match(describeFtpPreview(null, { ftp_w: 250, date: '2026-11-03' }), /FTP now: none recorded\./);
});

test('an unknown-action refusal is recognised', () => {
  assert.equal(isUnknownAction(new Error('Unknown action: "getRideWorkouts"')), true);
  assert.equal(isUnknownAction(new Error('name must be 1 to 80 characters')), false);
});
