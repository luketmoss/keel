// #132 — the Apps Script API client: request shape, the envelope, the
// failure that looks nothing like its cause, and payload chunking.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.THRIVE_API_URL = 'https://example.test/macros/s/DEPLOYMENT/exec';
process.env.THRIVE_API_KEY = 'test-key';
process.env.THRIVE_READ_RETRY_DELAYS_MS = '1,1';

const api = await import('./api.js');
const { chunkByPayload, ApiError, MAX_ENCODED_PAYLOAD } = api;

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Replace fetch; record each URL; answer with `respond(url, n)`. */
function stubFetch(respond) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(String(url)));
    const { status = 200, body } = respond(urls.at(-1), urls.length);
    return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  return urls;
}

// --- request shape ------------------------------------------------------

test('a read sends action and key, and skips empty parameters', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  await api.fetchSets(undefined);
  await api.fetchSets('w_1');
  assert.equal(urls[0].searchParams.get('action'), 'getSets');
  assert.equal(urls[0].searchParams.get('key'), 'test-key');
  assert.equal(urls[0].searchParams.has('workout_id'), false);
  assert.equal(urls[1].searchParams.get('workout_id'), 'w_1');
});

test('fetchBodyMeasurements sends action, from, to and an optional kind (#201)', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  await api.fetchBodyMeasurements('2026-09-01', '2026-09-30');
  await api.fetchBodyMeasurements('2026-09-01', '2026-09-30', 'scale');
  assert.equal(urls[0].searchParams.get('action'), 'getBodyMeasurements');
  assert.equal(urls[0].searchParams.get('from'), '2026-09-01');
  assert.equal(urls[0].searchParams.get('to'), '2026-09-30');
  assert.equal(urls[0].searchParams.has('kind'), false);
  assert.equal(urls[1].searchParams.get('kind'), 'scale');
});

// Writes go by GET with a payload, because Apps Script's POST redirect breaks
// anonymous callers.
test('a write sends its data as a JSON payload parameter', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: { workout_id: 'w_1', sets_deleted: 3 } } }));
  const res = await api.deleteWorkout('w_1');
  assert.equal(urls[0].searchParams.get('action'), 'deleteWorkout');
  assert.deepEqual(JSON.parse(urls[0].searchParams.get('payload')), { id: 'w_1' });
  assert.deepEqual(res, { workout_id: 'w_1', sets_deleted: 3 });
});

// --- the envelope -------------------------------------------------------

test('an API refusal becomes an ApiError carrying the server\'s message', async () => {
  stubFetch(() => ({ body: { success: false, error: 'Workout "w_x" not found' } }));
  await assert.rejects(api.fetchWorkout('w_x'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.message, 'Workout "w_x" not found');
    assert.equal(err.action, 'getWorkout');
    return true;
  });
});

// Found during the first deployment: a library deployment serves a sign-in
// page, a non-web-app /exec serves 404, and a web app nobody authorized
// serves "Access denied". All are HTML, none mentions its cause.
test('a web page instead of JSON is explained, not reported as a parse error', async () => {
  stubFetch(() => ({ status: 403, body: '<!doctype html><html><title>Access Denied</title></html>' }));
  await assert.rejects(api.fetchWorkouts(), (err) => {
    assert.ok(err instanceof ApiError);
    assert.match(err.message, /returned 403 with a web page instead of JSON/);
    assert.match(err.message, /\/exec URL of a web-app deployment with anonymous access/);
    assert.match(err.message, /authorized it by opening that URL once in a browser/);
    assert.doesNotMatch(err.message, /Unexpected token/);
    return true;
  });
});

// --- transient pages: reads retry, writes never do -------------------------

const PAGE = { status: 404, body: '<html><title>Page Not Found</title></html>' };
const OK = { body: { success: true, data: [{ id: 'w_1' }] } };

// #132's QA hit a run of these 404 pages that cleared on their own.
test('a read retries a transient page and then succeeds', async () => {
  const urls = stubFetch((url, n) => (n === 1 ? PAGE : OK));
  assert.deepEqual(await api.fetchWorkouts(), [{ id: 'w_1' }]);
  assert.equal(urls.length, 2);
});

test('a read gives up after three attempts and explains', async () => {
  const urls = stubFetch(() => PAGE);
  await assert.rejects(api.fetchWorkouts(), /returned 404 with a web page instead of JSON/);
  assert.equal(urls.length, 3);
});

// A page does not prove the write failed; retrying a create would duplicate it.
test('a write is sent exactly once, even when the answer is a page', async () => {
  const urls = stubFetch(() => PAGE);
  await assert.rejects(api.createWorkout({ type: 'weight', name: 'Push' }), /web page instead of JSON/);
  assert.equal(urls.length, 1);
});

// success: false is the script's real answer, not a transport blip.
test('an API refusal is never retried', async () => {
  const urls = stubFetch(() => ({ body: { success: false, error: 'Workout "w_x" not found' } }));
  await assert.rejects(api.fetchWorkout('w_x'), /not found/);
  assert.equal(urls.length, 1);
});

// --- chunking (#132 AC5) --------------------------------------------------

const wrap = (run) => ({ sets: run });
const item = (n) => ({ workout_id: 'w_1', exercise_id: 'ex_1', exercise_name: 'Bench Press', set_number: n, planned_reps: '8' });

test('everything fits in one chunk when it can', () => {
  const items = [item(1), item(2), item(3)];
  assert.deepEqual(chunkByPayload(items, wrap), [items]);
});

test('chunks respect the limit and keep every item, in order', () => {
  const items = Array.from({ length: 60 }, (_, i) => item(i + 1));
  const chunks = chunkByPayload(items, wrap, 1000);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(encodeURIComponent(JSON.stringify(wrap(c))).length <= 1000);
  }
  assert.deepEqual(chunks.flat(), items);
});

test('an entry too large to send alone is an error, never truncated', () => {
  const huge = { ...item(1), notes: 'x'.repeat(2000) };
  assert.throws(() => chunkByPayload([item(1), huge], wrap, 1000), /A single entry is too large to send/);
  assert.throws(() => chunkByPayload([huge], wrap, 1000), /A single entry is too large to send/);
});

test('the default limit keeps the decoded payload under the server\'s 6000', () => {
  // Percent-encoding only grows a string, so an encoded limit below the
  // server's decoded one is a guarantee, not an estimate.
  assert.ok(MAX_ENCODED_PAYLOAD < 6000);
  const chunks = chunkByPayload(Array.from({ length: 200 }, (_, i) => item(i + 1)), wrap);
  for (const c of chunks) assert.ok(JSON.stringify(wrap(c)).length < 6000);
});

// --- appendSets: chunked, and honest about partial writes -----------------

test('appendSets sends a large batch as several requests', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  const written = await api.appendSets(Array.from({ length: 80 }, (_, i) => item(i + 1)));
  assert.equal(written, 80);
  assert.ok(urls.length > 1);
  const sent = urls.flatMap((u) => JSON.parse(u.searchParams.get('payload')).sets);
  assert.equal(sent.length, 80);
});

test('appendSets says how many rows landed before a later chunk failed', async () => {
  stubFetch((url, n) => (n === 2
    ? { body: { success: false, error: 'Exceeded maximum execution time' } }
    : { body: { success: true, data: [] } }));
  await assert.rejects(api.appendSets(Array.from({ length: 80 }, (_, i) => item(i + 1))), (err) => {
    assert.match(err.message, /^Exceeded maximum execution time — \d+ of 80 set rows were already written \(chunk 2 of \d+ failed\)\.$/);
    assert.doesNotMatch(err.message, /— 0 of 80/);
    return true;
  });
});

test('appendSets with nothing to write makes no request', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  assert.equal(await api.appendSets([]), 0);
  assert.equal(urls.length, 0);
});

// --- #583: rest_plans, and a round never split across chunks ---------------

/** One workout's sets, exercise by exercise, as prepareSchedule builds them. */
const planned = (workoutId, sections) => sections.flatMap(([section, exercises, sets], s) =>
  Array.from({ length: exercises }, (_, e) => Array.from({ length: sets }, (_, k) => ({
    workout_id: workoutId, exercise_id: `ex_${s}_${e}`, exercise_name: `Exercise ${s} ${e}`, section,
    exercise_order: s * 10 + e + 1, set_number: k + 1, planned_reps: '10', weight: '', reps: '', effort: '',
  }))).flat());

/** For every chunk, the rounds it holds, as `workout section set_number` -> how many sets of it. */
function roundsPerChunk(urls) {
  return urls.map((u) => {
    const counts = {};
    for (const s of JSON.parse(u.searchParams.get('payload')).sets) {
      if (!['SS1', 'SS2', 'SS3', 'burnout'].includes(s.section)) continue;
      const k = `${s.workout_id} ${s.section} ${s.set_number}`;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  });
}

test('appendSets sends each workout its rest plan, in the chunks that carry its sets', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  const sets = [...planned('w_a', [['primary', 1, 2]]), ...planned('w_b', [['SS1', 2, 2]])];
  await api.appendSets(sets, {
    w_a: { template_id: 'tpl_1', rest: [{ section: 'primary', rest_s: 120 }] },
    w_b: { template_id: '' },
    w_other: { template_id: 'tpl_2' },
  });
  assert.equal(urls.length, 1);
  assert.deepEqual(JSON.parse(urls[0].searchParams.get('payload')).rest_plans, {
    w_a: { template_id: 'tpl_1', rest: [{ section: 'primary', rest_s: 120 }] },
    w_b: { template_id: '' },
  });
});

test('appendSets never splits a superset or burnout round across chunks', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  // A week of large sessions: every section of a superset is well over a few sets.
  const sets = ['w_1', 'w_2', 'w_3'].flatMap((id) =>
    planned(id, [['warmup', 2, 1], ['primary', 1, 5], ['SS1', 3, 4], ['SS2', 2, 4], ['burnout', 3, 3]]));
  const plans = Object.fromEntries(['w_1', 'w_2', 'w_3'].map((id) => [id, { template_id: 'tpl_x' }]));
  const written = await api.appendSets(sets, plans);
  assert.equal(written, sets.length);
  assert.ok(urls.length > 1, 'the week needs several chunks');
  const sent = urls.flatMap((u) => JSON.parse(u.searchParams.get('payload')).sets);
  assert.equal(sent.length, sets.length);

  // Every round arrives whole in exactly one chunk.
  const expected = {};
  for (const s of sets) {
    if (!['SS1', 'SS2', 'SS3', 'burnout'].includes(s.section)) continue;
    const k = `${s.workout_id} ${s.section} ${s.set_number}`;
    expected[k] = (expected[k] ?? 0) + 1;
  }
  const seen = {};
  for (const chunk of roundsPerChunk(urls)) {
    for (const [k, n] of Object.entries(chunk)) {
      assert.equal(seen[k], undefined, `round ${k} is split across chunks`);
      assert.equal(n, expected[k], `round ${k} is incomplete in its chunk`);
      seen[k] = n;
    }
  }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(expected).sort());
});

test('a superset too large to send in one request goes round by round, each round whole', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  // 3 exercises x 8 sets of one superset: over the payload limit on its own.
  const sets = planned('w_big', [['SS1', 3, 8]]);
  assert.ok(encodeURIComponent(JSON.stringify({ sets })).length > MAX_ENCODED_PAYLOAD);
  await api.appendSets(sets, { w_big: { template_id: '' } });
  assert.ok(urls.length > 1);
  for (const chunk of roundsPerChunk(urls)) for (const n of Object.values(chunk)) assert.equal(n, 3);
});

test('setWorkoutRest previews as a dry run, and writes once with confirm (#583)', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: { count: 0, changes: [] } } }));
  const rest = [{ section: 'burnout', rest_s: 60, switch_s: 5 }];
  await api.previewWorkoutRest('w_1', rest);
  await api.setWorkoutRest('w_1', rest);
  assert.deepEqual(urls.map((u) => u.searchParams.get('action')), ['setWorkoutRest', 'setWorkoutRest']);
  assert.deepEqual(JSON.parse(urls[0].searchParams.get('payload')), { workout_id: 'w_1', rest });
  assert.deepEqual(JSON.parse(urls[1].searchParams.get('payload')), { workout_id: 'w_1', rest, confirm: true });
});

// --- #234 ---------------------------------------------------------------

test('fetchJournal sends action, from and to (#234)', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: [] } }));
  await api.fetchJournal('2026-09-01', '2026-09-30');
  assert.equal(urls[0].searchParams.get('action'), 'getJournal');
  assert.equal(urls[0].searchParams.get('from'), '2026-09-01');
  assert.equal(urls[0].searchParams.get('to'), '2026-09-30');
});

test('upsertJournal sends date and note as a payload, once, and passes a blank note through (#234)', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: { result: 'deleted', entry: null } } }));
  const res = await api.upsertJournal('2026-09-23', '');
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('action'), 'upsertJournal');
  assert.deepEqual(JSON.parse(urls[0].searchParams.get('payload')), { date: '2026-09-23', note: '' });
  assert.deepEqual(res, { result: 'deleted', entry: null });
});

test('upsertJournal refuses a note too long for the URL, sending nothing (#234)', async () => {
  const urls = stubFetch(() => ({ body: { success: true, data: {} } }));
  await assert.rejects(async () => api.upsertJournal('2026-09-23', 'x'.repeat(MAX_ENCODED_PAYLOAD)), /too long to send/);
  assert.equal(urls.length, 0);
});

test('a failed upsertJournal is not retried (#234)', async () => {
  const urls = stubFetch(() => ({ status: 404, body: '<html>Not found</html>' }));
  await assert.rejects(api.upsertJournal('2026-09-23', 'hi'));
  assert.equal(urls.length, 1);
});
