// #152: raw COROS payloads land in Drive, once each, and errors never do.
// MCP and Drive are both fakes; nothing here touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArchive, sha256 } from '../src/archive.mjs';
import { CorosUnavailableError } from '../src/errors.mjs';
import {
  ANOMALY_BUDGET_MS, ANOMALY_DELAYS_MS, anomalyBudget, callTool, CorosToolError, healthCalls, ingest, parseSportRecords,
} from '../src/ingest.mjs';
import { corosText, fakeCoros, memoryDrive, noWait } from './helpers.mjs';

// 03:00 UTC on 24 Sept: Denver's run date is still the 23rd.
const NOW = Date.parse('2026-09-24T03:00:00Z');
const LATER = Date.parse('2026-09-24T05:00:00Z');

// The shape COROS returned in #152's live run, shortened.
const LIST = [
  'Sport Records — 2026-09-13 to 2026-09-24 (3 records)',
  '========================',
  '',
  '1. Gym Cardio — 2026-09-23',
  '   Location: Gym Cardio',
  '   Time Window: startTimestamp=1790170000 | endTimestamp=1790172465',
  '   Duration: 41:05',
  ' | Avg HR: 104 bpm | Calories: 212 kcal',
  '   LabelId: 700000000000000101 | SportType: 400',
  '',
  '2. Strength — 2026-09-23',
  '   Location: Strength',
  '   Time Window: startTimestamp=1790161200 | endTimestamp=1790161290',
  '   Duration: 1:30 | Sets: 3',
  ' | Avg HR: 63 bpm | Calories: 17 kcal',
  '   LabelId: 700000000000000102 | SportType: 402',
  '',
  // 04:30 UTC on 1 Sept is still 31 Aug in Denver: the folder follows the local date.
  '3. Outdoor Bike — 2026-08-31',
  '   Time Window: startTimestamp=1788237000 | endTimestamp=1788240600',
  '   LabelId: 999 | SportType: 200',
].join('\n');

const detail = (id, extra = '') => corosText(`Activity ${id} Details\n=====\n\nWorkout Time: 41:05${extra}`);

function healthHandlers() {
  const h = {};
  for (const [tool] of healthCalls({ start: '2026-09-13', end: '2026-09-24', recentDays: 11 })) {
    h[tool] = (args) => corosText(`${tool} ${JSON.stringify(args)}`);
  }
  return h;
}

function coros(overrides = {}) {
  return fakeCoros({
    querySportRecords: corosText(LIST),
    getActivityDetail: ({ labelId }) => detail(labelId),
    ...healthHandlers(),
    ...overrides,
  });
}

const silent = () => {};
const run = (client, drive, now = NOW) =>
  ingest({ client, archive: createArchive(drive, { now: () => now }), now, log: silent, retry: noWait });

const activityFile = (drive, id) => [...drive.files.values()].find((f) => f.props.activity_id === id);
const healthFile = (drive, date) => [...drive.files.values()].find((f) => f.props.run_date === date);

// --- AC1 ---------------------------------------------------------------------

test('the list is requested for D − 10 to D + 1 in Denver dates', async () => {
  const client = coros();
  await run(client, memoryDrive());
  assert.deepEqual(client.calls[0], {
    name: 'querySportRecords', args: { startDate: '20260913', endDate: '20260924', limit: 100 },
  });
});

test('every listed activity, strength included, lands as one file keyed by vendor ID', async () => {
  const drive = memoryDrive();
  const client = coros();
  const summary = await run(client, drive);

  assert.deepEqual(summary.activities, { created: 3, updated: 0, unchanged: 0 });
  assert.deepEqual(summary.failures, []);
  assert.deepEqual(
    client.calls.filter((c) => c.name === 'getActivityDetail').map((c) => c.args),
    [
      { labelId: '700000000000000101', sportType: 400 },
      { labelId: '700000000000000102', sportType: 402 },
      { labelId: '999', sportType: 200 },
    ],
  );

  const strength = activityFile(drive, '700000000000000102');
  assert.equal(drive.pathOf(strength.id), 'Thrive COROS/activities/2026/09/700000000000000102.json');
  assert.deepEqual(strength.props, { source: 'coros', activity_id: '700000000000000102' });

  const payload = detail('700000000000000102').content[0].text;
  assert.deepEqual(Object.keys(strength.data).sort(), [
    'activity_id', 'args', 'fetched_at', 'list_entry', 'normalized', 'payload', 'payload_hash', 'source', 'tool',
  ]);
  assert.equal(strength.data.source, 'coros');
  assert.equal(strength.data.tool, 'getActivityDetail');
  assert.deepEqual(strength.data.args, { labelId: '700000000000000102', sportType: 402 });
  assert.equal(strength.data.payload, payload, 'the payload is the tool text byte-for-byte, JSON quoting and all');
  assert.equal(strength.data.payload_hash, sha256(payload));
  assert.equal(strength.data.fetched_at, new Date(NOW).toISOString());
  assert.equal(strength.data.normalized, null);
  assert.equal(strength.data.list_entry.sportType, 402);
  assert.match(strength.data.list_entry.text, /^2\. Strength — 2026-09-23/);
});

test('an activity is foldered by its Denver start date, not the UTC one', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  assert.equal(drive.pathOf(activityFile(drive, '999').id), 'Thrive COROS/activities/2026/08/999.json');
});

test('folders are created once and reused', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const folders = [...drive.files.values()].filter((f) => f.mimeType === 'folder').map((f) => drive.pathOf(f.id)).sort();
  assert.deepEqual(folders, [
    'Thrive COROS',
    'Thrive COROS/activities',
    'Thrive COROS/activities/2026',
    'Thrive COROS/activities/2026/08',
    'Thrive COROS/activities/2026/09',
    'Thrive COROS/health',
    'Thrive COROS/health/2026',
    'Thrive COROS/health/2026/09',
  ]);
});

// --- AC2 ---------------------------------------------------------------------

test('a second run with unchanged payloads writes nothing at all', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const before = drive.writes.length;

  const summary = await run(coros(), drive, LATER);
  assert.deepEqual(summary.activities, { created: 0, updated: 0, unchanged: 3 });
  assert.equal(summary.health, 'unchanged');
  assert.equal(drive.writes.length, before);
});

test('a changed payload updates the same file in place and keeps normalized', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const file = activityFile(drive, '700000000000000101');
  file.data.normalized = { Name: 'Gym Cardio', 'Elapsed (s)': 2258 }; // #153's, written later

  const summary = await run(coros({
    getActivityDetail: ({ labelId }) => detail(labelId, labelId === '700000000000000101' ? '\nTrimmed' : ''),
  }), drive, LATER);

  assert.deepEqual(summary.activities, { created: 0, updated: 1, unchanged: 2 });
  const after = activityFile(drive, '700000000000000101');
  assert.equal(after.id, file.id, 'the Drive file ID, the future raw_ref, is unchanged');
  assert.match(after.data.payload, /Trimmed/);
  assert.equal(after.data.payload_hash, sha256(after.data.payload));
  assert.equal(after.data.fetched_at, new Date(LATER).toISOString());
  assert.deepEqual(after.data.normalized, { Name: 'Gym Cardio', 'Elapsed (s)': 2258 });
  assert.equal([...drive.files.values()].filter((f) => f.props.activity_id === '700000000000000101').length, 1);
});

test('a moved and renamed file is found by its app properties, not duplicated', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const file = activityFile(drive, '700000000000000101');
  file.name = 'renamed.json';
  file.parentId = 'somewhere-else';

  await run(coros({ getActivityDetail: ({ labelId }) => detail(labelId, '\nEdited') }), drive, LATER);
  assert.equal([...drive.files.values()].filter((f) => f.props.activity_id === '700000000000000101').length, 1);
  assert.match(activityFile(drive, '700000000000000101').data.payload, /Edited/);
});

// --- AC3 ---------------------------------------------------------------------

test('health calls cover the window, with sleep HRV in ranges of at most 7 days', () => {
  assert.deepEqual(healthCalls({ start: '2026-09-13', end: '2026-09-24', recentDays: 11 }), [
    ['queryDailyHealthData', { days: 11 }],
    ['querySleepOverview', { startDate: '20260913', endDate: '20260924' }],
    ['queryRestingHeartRate', { days: 11 }],
    ['queryTrainingLoadAssessment', { days: 11 }],
    ['querySleepHrv', { startDate: '20260913', endDate: '20260919' }],
    ['querySleepHrv', { startDate: '20260920', endDate: '20260924' }],
    ['queryRecoveryStatus', {}],
    ['queryFitnessAssessmentOverview', {}],
  ]);
});

test('daily health lands as one bundle for the local run date', async () => {
  const drive = memoryDrive();
  const summary = await run(coros(), drive);
  assert.equal(summary.health, 'created');

  const file = healthFile(drive, '2026-09-23');
  assert.equal(drive.pathOf(file.id), 'Thrive COROS/health/2026/09/2026-09-23.json');
  assert.deepEqual(file.props, { source: 'coros', kind: 'health', run_date: '2026-09-23' });
  assert.equal(file.data.calls.length, 8);
  const recovery = file.data.calls.find((c) => c.tool === 'queryRecoveryStatus');
  assert.deepEqual(recovery.args, {});
  assert.equal(recovery.payload, JSON.stringify('queryRecoveryStatus {}'));
  assert.match(file.data.payload_hash, /^[0-9a-f]{64}$/);
  assert.equal(file.data.fetched_at, new Date(NOW).toISOString());
});

test('a later run on the same date updates the bundle in place when it changed', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const id = healthFile(drive, '2026-09-23').id;

  const summary = await run(coros({ queryRecoveryStatus: corosText('Recovery: 80%') }), drive, LATER);
  assert.equal(summary.health, 'updated');
  const file = healthFile(drive, '2026-09-23');
  assert.equal(file.id, id);
  assert.equal(file.data.calls.find((c) => c.tool === 'queryRecoveryStatus').payload, JSON.stringify('Recovery: 80%'));
  assert.equal([...drive.files.values()].filter((f) => f.props.kind === 'health').length, 1);
});

// --- AC4 ---------------------------------------------------------------------

test('each kind of failure is retried, three attempts in all, then reported', async () => {
  const failures = {
    'a thrown transport error': new Error('fetch failed'),
    'a 5xx': Object.assign(new Error('Streamable HTTP error: 503 Service Unavailable'), { code: 503 }),
    'an isError result': corosText('Internal error', { isError: true }),
    'the unavailable text': corosText('COROS API is temporarily unavailable. Please try again later.'),
    'the anomaly text': corosText('Tool call anomalies detected. High risk of session context pollution.'),
  };
  for (const [what, failure] of Object.entries(failures)) {
    const client = fakeCoros({ getActivityDetail: failure });
    await assert.rejects(
      callTool(client, 'getActivityDetail', { labelId: '1', sportType: 400 }, { retry: noWait }),
      CorosToolError,
      what,
    );
    assert.equal(client.calls.length, 3, `${what}: three attempts`);
  }
});

test('the delays between attempts back off', async () => {
  const waited = [];
  const client = fakeCoros({ queryRecoveryStatus: new Error('fetch failed') });
  await assert.rejects(callTool(client, 'queryRecoveryStatus', {}, {
    retry: { wait: async (ms) => { waited.push(ms); } },
  }));
  assert.equal(waited.length, 2);
  assert.ok(waited[1] > waited[0]);
});

test('a transient failure followed by success archives only the good payload', async () => {
  const drive = memoryDrive();
  let attempts = 0;
  const client = coros({
    getActivityDetail: ({ labelId }) =>
      (labelId === '999' && ++attempts < 3 ? corosText('COROS API is temporarily unavailable') : detail(labelId)),
  });
  const summary = await run(client, drive);
  assert.deepEqual(summary.failures, []);
  assert.equal(attempts, 3, 'succeeded on the third and last attempt');
  assert.equal(activityFile(drive, '999').data.payload, detail('999').content[0].text);
});

test('a detail that keeps failing is never archived, and the other activities still land', async () => {
  const drive = memoryDrive();
  const logs = [];
  const client = coros({
    getActivityDetail: ({ labelId }) =>
      (labelId === '700000000000000101' ? corosText('COROS API is temporarily unavailable') : detail(labelId)),
  });
  const summary = await ingest({
    client, archive: createArchive(drive, { now: () => NOW }), now: NOW, log: (l) => logs.push(l), retry: noWait,
  });

  assert.equal(activityFile(drive, '700000000000000101'), undefined);
  assert.ok(activityFile(drive, '700000000000000102'));
  assert.ok(activityFile(drive, '999'));
  assert.equal(summary.health, 'created');
  assert.equal(summary.failures.length, 1, 'the run reports a failure, so it exits non-zero');
  assert.match(summary.failures[0], /700000000000000101/);
  assert.ok(logs.some((l) => /FAILED activity 700000000000000101/.test(l)));
  for (const f of drive.files.values()) {
    assert.doesNotMatch(JSON.stringify(f.data ?? {}), /temporarily unavailable/);
  }
});

test('an error on an activity already archived leaves its file untouched', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const before = JSON.stringify(activityFile(drive, '700000000000000101').data);
  const summary = await run(coros({
    getActivityDetail: ({ labelId }) => (labelId === '700000000000000101' ? corosText('x', { isError: true }) : detail(labelId)),
  }), drive, LATER);
  assert.equal(summary.failures.length, 1);
  assert.equal(JSON.stringify(activityFile(drive, '700000000000000101').data), before);
});

test('a failed list call ends the run before any detail call', async () => {
  const client = coros({ querySportRecords: corosText('COROS API is temporarily unavailable') });
  const drive = memoryDrive();
  await assert.rejects(run(client, drive), CorosUnavailableError);
  assert.equal(client.calls.filter((c) => c.name === 'querySportRecords').length, 3);
  assert.equal(client.calls.filter((c) => c.name !== 'querySportRecords').length, 0);
  assert.equal(drive.writes.length, 0);
});

test('a failed health call writes no bundle and is reported', async () => {
  const drive = memoryDrive();
  const summary = await run(coros({ querySleepHrv: corosText('boom', { isError: true }) }), drive);
  assert.equal(summary.health, null);
  assert.equal(healthFile(drive, '2026-09-23'), undefined);
  assert.match(summary.failures.at(-1), /health 2026-09-23: querySleepHrv/);
  assert.equal(summary.activities.created, 3);
});

test('a payload carrying a FIT download URL is refused, not archived', async () => {
  const drive = memoryDrive();
  const summary = await run(coros({
    getActivityDetail: ({ labelId }) => detail(labelId, labelId === '999' ? '\nhttps://s3.coros.com/fit/1/999.fit' : ''),
  }), drive);
  assert.equal(activityFile(drive, '999'), undefined);
  assert.match(summary.failures[0], /FIT download URL/);
});

// --- the list ----------------------------------------------------------------

test('the list parser reads every record and its timestamps', () => {
  const entries = parseSportRecords(JSON.stringify(LIST));
  assert.deepEqual(entries.map((e) => [e.activityId, e.sportType, e.name, e.date, e.startTimestamp]), [
    ['700000000000000101', 400, 'Gym Cardio', '2026-09-23', 1790170000],
    ['700000000000000102', 402, 'Strength', '2026-09-23', 1790161200],
    ['999', 200, 'Outdoor Bike', '2026-08-31', 1788237000],
  ]);
});

test('an empty window is zero activities, not an error', () => {
  assert.deepEqual(parseSportRecords(JSON.stringify('No sport records found from 2026-09-01 to 2026-09-10.')), []);
});

test('a list that cannot be read in full fails rather than dropping activities', () => {
  assert.throws(() => parseSportRecords(JSON.stringify(LIST.replace('(3 records)', '(4 records)'))), /declares 4/);
  assert.throws(() => parseSportRecords(JSON.stringify(LIST.replace('LabelId: 999', 'Label: 999'))), /unreadable/);
  assert.throws(() => parseSportRecords(JSON.stringify('Something new entirely')), /unrecognized/);
});

// --- AC5 ---------------------------------------------------------------------

test('the ingest calls only COROS read tools', async () => {
  const client = coros();
  await run(client, memoryDrive());
  for (const { name } of client.calls) assert.match(name, /^(query|get)/);
});

// --- #860: detail only for new or changed activities, and the anomaly guard ---

const HOUR = 60 * 60 * 1000;
const detailIds = (client) => client.calls.filter((c) => c.name === 'getActivityDetail').map((c) => c.args.labelId);
const ANOMALY = 'Tool call anomalies detected. High risk of session context pollution.';

test('#860: an archived, unchanged activity older than 48 h is not fetched again', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const before = JSON.stringify(activityFile(drive, '999').data);

  const client = coros();
  const logs = [];
  const summary = await ingest({
    client, archive: createArchive(drive, { now: () => LATER }), now: LATER, log: (l) => logs.push(l), retry: noWait,
  });
  assert.deepEqual(detailIds(client), ['700000000000000101', '700000000000000102'],
    'the two recent activities are fetched; the month-old one is not');
  assert.deepEqual(summary.activities, { created: 0, updated: 0, unchanged: 3 });
  assert.equal(summary.detailSkipped, 1);
  assert.deepEqual(summary.activityIds, ['700000000000000101', '700000000000000102', '999'],
    'a skipped activity is still handed to the later stages');
  assert.equal(JSON.stringify(activityFile(drive, '999').data), before);
  assert.ok(logs.some((l) => /activity 999 .*not re-fetched/.test(l)));
});

test('#860: an activity the archive does not hold is fetched, however old', async () => {
  const client = coros();
  const summary = await run(client, memoryDrive(), NOW + 30 * 24 * HOUR);
  assert.deepEqual(detailIds(client), ['700000000000000101', '700000000000000102', '999']);
  assert.equal(summary.activities.created, 3);
  assert.equal(summary.detailSkipped, 0);
});

test('#860: an activity whose list entry changed is fetched again and its file updated', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const id = activityFile(drive, '999').id;
  const trimmed = LIST.replace('endTimestamp=1788240600', 'endTimestamp=1788239000');

  const client = coros({
    querySportRecords: corosText(trimmed),
    getActivityDetail: ({ labelId }) => detail(labelId, labelId === '999' ? '\nTrimmed' : ''),
  });
  const summary = await run(client, drive, LATER);
  assert.ok(detailIds(client).includes('999'));
  assert.equal(summary.activities.updated, 1);
  assert.equal(summary.detailSkipped, 0);
  const file = activityFile(drive, '999');
  assert.equal(file.id, id);
  assert.match(file.data.payload, /Trimmed/);
  assert.match(file.data.list_entry.text, /endTimestamp=1788239000/);
});

test('#860: a rename shown only in the list is fetched again', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  const client = coros({ querySportRecords: corosText(LIST.replace('3. Outdoor Bike', '3. Evening Ride')) });
  const summary = await run(client, drive, LATER);
  assert.ok(detailIds(client).includes('999'));
  assert.equal(summary.activities.updated, 1);
  assert.equal(activityFile(drive, '999').data.list_entry.name, 'Evening Ride');
});

test('#860: an unchanged activity is fetched while it is 48 h old or less, and skipped after', async () => {
  const drive = memoryDrive();
  await run(coros(), drive);
  // 101 started at 1790170000 (2026-09-23T13:26:40Z).
  const start = 1790170000 * 1000;

  const within = coros();
  await run(within, drive, start + 47 * HOUR);
  assert.ok(detailIds(within).includes('700000000000000101'));

  const after = coros();
  const summary = await run(after, drive, start + 49 * HOUR);
  assert.ok(!detailIds(after).includes('700000000000000101'));
  assert.equal(summary.detailSkipped, 3, '102 started before 101, so all three are past 48 h');
});

test('#860: the anomaly text waits 30 s then 90 s, three attempts in all', async () => {
  const waited = [];
  const logs = [];
  const client = fakeCoros({ getActivityDetail: corosText(ANOMALY) });
  await assert.rejects(callTool(client, 'getActivityDetail', { labelId: '1', sportType: 400 }, {
    retry: { wait: async (ms) => { waited.push(ms); } }, log: (l) => logs.push(l),
  }), CorosToolError);
  assert.equal(client.calls.length, 3);
  assert.deepEqual(waited, ANOMALY_DELAYS_MS);
  assert.deepEqual(ANOMALY_DELAYS_MS, [30_000, 90_000]);
  assert.deepEqual(logs, [
    '  COROS anomaly guard on getActivityDetail, attempt 1 of 3: waiting 30 s',
    '  COROS anomaly guard on getActivityDetail, attempt 2 of 3: waiting 90 s',
  ]);
});

test('#860: every other failure still waits 2 s then 8 s', async () => {
  const failures = [
    new Error('fetch failed'),
    corosText('Internal error', { isError: true }),
    corosText('COROS API is temporarily unavailable. Please try again later.'),
    { content: [] },
  ];
  for (const failure of failures) {
    const waited = [];
    const client = fakeCoros({ getActivityDetail: failure });
    await assert.rejects(callTool(client, 'getActivityDetail', { labelId: '1', sportType: 400 }, {
      retry: { wait: async (ms) => { waited.push(ms); } },
    }));
    assert.deepEqual(waited, [2000, 8000]);
  }
});

test('#860: once a run has spent its 5 minutes on anomaly waits, it falls back to 2 s / 8 s', async () => {
  assert.equal(ANOMALY_BUDGET_MS, 5 * 60_000);
  const waited = [];
  const summary = await ingest({
    client: coros({ getActivityDetail: corosText(ANOMALY) }),
    archive: createArchive(memoryDrive(), { now: () => NOW }),
    now: NOW,
    log: silent,
    retry: { wait: async (ms) => { waited.push(ms); } },
  });
  // 120 s + 120 s leaves 60 s: the third activity's 30 s fits, its 90 s does not.
  assert.deepEqual(waited.slice(0, 6), [30_000, 90_000, 30_000, 90_000, 30_000, 8000]);
  assert.ok(waited.slice(0, 6).filter((ms) => ms >= 30_000).reduce((a, b) => a + b, 0) <= ANOMALY_BUDGET_MS);
  assert.equal(summary.failures.length, 3);

  const spent = [];
  await assert.rejects(callTool(fakeCoros({ x: corosText(ANOMALY) }), 'x', {}, {
    anomaly: anomalyBudget(0), retry: { wait: async (ms) => { spent.push(ms); } },
  }));
  assert.deepEqual(spent, [2000, 8000]);
});

test('#860: an anomaly answer then a good payload archives only the payload, with no failure', async () => {
  const drive = memoryDrive();
  const logs = [];
  const client = coros({
    getActivityDetail: ({ labelId }, n) => (labelId === '999' && n === 3 ? corosText(ANOMALY) : detail(labelId)),
  });
  const summary = await ingest({
    client, archive: createArchive(drive, { now: () => NOW }), now: NOW, log: (l) => logs.push(l), retry: noWait,
  });
  assert.deepEqual(summary.failures, []);
  assert.equal(activityFile(drive, '999').data.payload, detail('999').content[0].text);
  const guard = logs.filter((l) => /anomaly guard/.test(l));
  assert.equal(guard.length, 1);
  assert.doesNotMatch(guard[0], /999/, 'the guard line names the tool, not the activity');
});
