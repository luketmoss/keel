// #773 - end to end, in both orders: the real Apps Script source over a fake sheet and Drive, and the
// real COROS activity step over a fake archive, joined by a client that calls the sandbox's actions.
// Whichever device reaches Thrive first, the ride ends as one Workouts row, `source = spin`, with
// `coros_activity_id` set, and a further sync run over the same window changes nothing and adds no row.

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { CellValue, DriveNode } from './apps-script-sandbox';
import { loadSpin, call, makeRide, saveRide, type SpinFixtures } from './spin-fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const syncDir = path.resolve(here, '..', '..', 'sync');
const load = async (rel: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(path.join(syncDir, rel)).href);

const KEY = 'test-key';
const SYNCED = '2026-09-24T21:00:00.000Z';

const fixture = JSON.parse(readFileSync(
  path.join(syncDir, 'test', 'fixtures', 'activities', 'activity-indoor-cycling-471166302945817204.json'), 'utf8'));
const COROS_ID: string = fixture.activity_id;
/** The watch's start; the phone's is `minutes` later, as an instant. */
const watchStart = fixture.list_entry.startTimestamp * 1000;
const phoneStart = (minutes: number) => new Date(watchStart + minutes * 60_000).toISOString().replace('.000Z', 'Z');

interface World {
  api: ReturnType<typeof loadSpin>;
  drive: Record<string, DriveNode>;
  sync: () => Promise<any>;
  archiveFile: () => any;
  rows: () => Record<string, CellValue>[];
}

async function world(fixtures: SpinFixtures = {}): Promise<World> {
  const { createArchive } = await load('src/archive.mjs');
  const { syncActivities } = await load('src/sync-activities.mjs');
  const { memoryDrive } = await load('test/helpers.mjs');

  const drive: Record<string, DriveNode> = {};
  const api = loadSpin(fixtures, { drive, uuids: ['a1b2c3d4-0000', 'b2c3d4e5-0000', 'c3d4e5f6-0000'] });

  const memory = memoryDrive();
  const archive = createArchive(memory, { now: () => Date.parse(SYNCED) });
  await archive.upsertActivity({
    activityId: COROS_ID, localDate: fixture.list_entry.date, tool: fixture.tool, args: fixture.args,
    listEntry: fixture.list_entry, payload: fixture.payload,
  });

  const act = async (action: string, payload: unknown) => {
    const { res } = call<any>(api, action, payload, KEY);
    if (!res.success) throw new Error(`${action}: ${res.error}`);
    return res.data;
  };
  const syncApi = {
    enrichRide: (p: unknown) => act('enrichRide', p),
    upsertSyncedWorkout: (p: unknown) => act('upsertSyncedWorkout', p),
  };
  const fileOf = () => [...memory.files.values()].find((f: any) => f.props.activity_id === COROS_ID);
  const fitStep = { ensure: async () => ({}) };

  return {
    api, drive,
    sync: () => syncActivities({
      archive, api: syncApi, activityIds: [COROS_ID], syncedAt: SYNCED, fit: fitStep, log: () => {},
    }),
    archiveFile: () => (fileOf() as any).data,
    rows: () => api.rows.map((r) => Object.fromEntries(
      (api.sandbox.WORKOUT_FIELDS as string[]).map((f, i) => [f, r[i]]))),
  };
}

const copy = (rows: unknown) => JSON.stringify(rows);

describe('both orders end as one Spin row linked to the COROS activity', () => {
  it('Spin uploads first, then the sync processes the 201 activity', async () => {
    const w = await world();
    const ride = makeRide({ started_at_utc: phoneStart(3), avg_hr: null, calories: null });
    const saved = saveRide(w.api, ride);
    expect(saved.res.data.status).toBe('created');

    const first = await w.sync();
    expect(first.failures).toEqual([]);
    expect(first.enriched).toBe(1);
    expect(first.created).toBe(0);

    const rows = w.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'spin', source_activity_id: 'ride-1', coros_activity_id: COROS_ID, sport_type: '201', raw_ref: '',
      fit_ref: saved.res.data.fit_ref, streams_ref: saved.res.data.streams_ref,
      name: 'Sweet Spot 3x12', started_at_utc: phoneStart(3),
    });
    // The watch's heart rate and calories filled what the phone did not send.
    expect(rows[0].avg_hr).not.toBe('');
    expect(rows[0].calories).not.toBe('');
    expect(w.archiveFile().normalized.enrichment.workout_id).toBe(rows[0].id);

    const settled = copy(w.api.rows);
    const again = await w.sync();
    expect(again.failures).toEqual([]);
    expect(again.created + again.updated + again.enriched).toBe(0);
    expect(again.unchanged).toBe(1);
    expect(copy(w.api.rows)).toBe(settled);
    expect(w.rows()).toHaveLength(1);
  });

  it('the sync processes the activity first, then Spin uploads', async () => {
    const w = await world();
    const first = await w.sync();
    expect(first.failures).toEqual([]);
    expect(first.created).toBe(1); // no Spin ride yet: the watch's own row
    expect(w.rows()).toHaveLength(1);
    expect(w.rows()[0]).toMatchObject({ source: 'coros', source_activity_id: COROS_ID, sport_type: '201' });
    const corosRowId = w.rows()[0].id;

    const saved = saveRide(w.api, makeRide({ started_at_utc: phoneStart(3), avg_hr: null, calories: null }));
    expect(saved.res.data).toMatchObject({ status: 'merged', id: corosRowId, coros_activity_id: COROS_ID });

    const rows = w.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: corosRowId, source: 'spin', source_activity_id: 'ride-1', coros_activity_id: COROS_ID, raw_ref: '',
      sport_type: '201', started_at_utc: phoneStart(3),
    });
    expect(rows[0].avg_hr).not.toBe(''); // kept from the watch: Spin sent none

    const merged = copy(w.api.rows);
    const next = await w.sync();
    expect(next.failures).toEqual([]);
    expect(next.created).toBe(0); // never recreates a COROS row: the link is in the sheet
    expect(w.rows()).toHaveLength(1);
    expect(copy(w.api.rows)).toBe(merged);
    expect(w.archiveFile().normalized.enrichment.workout_id).toBe(corosRowId);

    const again = await w.sync();
    expect(again.created + again.updated + again.enriched).toBe(0);
    expect(copy(w.api.rows)).toBe(merged);
    expect(w.rows()).toHaveLength(1);
  });

  it('the merge holds even when the archive\'s record of what was written is lost', async () => {
    const w = await world();
    await w.sync();
    saveRide(w.api, makeRide({ started_at_utc: phoneStart(3) }));
    const merged = copy(w.api.rows);
    const data = w.archiveFile();
    data.normalized = null; // the archive forgot: the link is in the sheet
    const next = await w.sync();
    expect(next.failures).toEqual([]);
    expect(next.created).toBe(0);
    expect(w.rows()).toHaveLength(1);
    expect(copy(w.api.rows)).toBe(merged);
  });

  it('a ride the watch recorded 16 minutes apart is two rows, as two separate rides', async () => {
    const w = await world();
    saveRide(w.api, makeRide({ started_at_utc: phoneStart(16) }));
    const out = await w.sync();
    expect(out.failures).toEqual([]);
    expect(out.created).toBe(1);
    expect(w.rows().map((r) => r.source).sort()).toEqual(['coros', 'spin']);
  });

  it('two Spin rides within 15 minutes of the activity: the sync notes it, writes no row and does not fail', async () => {
    const w = await world();
    saveRide(w.api, makeRide({ started_at_utc: phoneStart(2) }, 'ride-1'));
    saveRide(w.api, makeRide({ started_at_utc: phoneStart(9) }, 'ride-2'));
    const before = copy(w.api.rows);
    const out = await w.sync();
    expect(out.failures).toEqual([]);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatch(/ambiguous \(candidates: w_a1b2c3d4 at .*, w_b2c3d4e5 at .*\)/);
    expect(copy(w.api.rows)).toBe(before);
    expect(w.rows()).toHaveLength(2);
  });

  it('a Spin row deleted after the link: the activity gets a note and no row of its own', async () => {
    const w = await world();
    saveRide(w.api, makeRide({ started_at_utc: phoneStart(3) }));
    expect((await w.sync()).enriched).toBe(1);
    w.api.rows.length = 0; // the owner deleted the ride in Thrive
    const out = await w.sync();
    expect(out.failures).toEqual([]);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toMatch(/its Spin ride is gone/);
    expect(w.rows()).toHaveLength(0);
  });
});
