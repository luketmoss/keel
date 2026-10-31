// #692 — the similar-routes index: order, one request at a time, what is kept on
// the device, and what happens when fetches fail. Invented coordinates only.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../api/demo-data')>()),
  isDemo: () => false,
}));

const getWorkoutTrack = vi.fn();
vi.mock('../api/thrive-api', async (orig) => ({
  ...(await orig<typeof import('../api/thrive-api')>()),
  getWorkoutTrack: (...args: unknown[]) => getWorkoutTrack(...args),
}));

import { workouts } from './store';
import type { WorkoutWithRow, WorkoutTrack } from '../api/types';
import { clearTrackCache, getCachedTrack } from '../maps/track-cache';
import {
  CELLS_KEY,
  INDEX_CAP,
  MAX_FAILURES,
  clearSimilarIndex,
  ensureIndex,
  indexProgress,
  similarFor,
} from './similar-routes';
import { DEMO_WORKOUTS } from '../api/demo-data';

const LAT = 10;
const LON = 10;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT * Math.PI) / 180);

function track(northM: number): WorkoutTrack {
  const coordinates: [number, number][] = [];
  for (let d = 0; d <= 3000; d += 20) coordinates.push([LON + d / M_PER_DEG_LON, LAT + northM / M_PER_DEG_LAT]);
  return {
    type: 'Feature',
    bbox: [0, 0, 0, 0],
    properties: {
      format: 'thrive-track',
      version: 1,
      source: 'coros',
      activity_id: 'x',
      start_utc: '',
      t: [],
      ele: [],
      simplify: { algorithm: 'rdp', tolerance_m: 5 },
      points_in: coordinates.length,
    },
    geometry: { type: 'LineString', coordinates },
  };
}

const template = DEMO_WORKOUTS.find((w) => w.id === 'w_demo011')!;
function row(id: string, day: number, ref = `ref-${id}`, status: WorkoutWithRow['status'] = ''): WorkoutWithRow {
  return { ...template, id, date: `2025-02-${String(day).padStart(2, '0')}`, time: '08:00', track_ref: ref, status };
}

/** id -> metres north of the base route; an id not here has no track. */
let routes: Record<string, number>;
let inFlight = 0;
let maxInFlight = 0;
const requested: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  clearTrackCache();
  clearSimilarIndex();
  getWorkoutTrack.mockReset();
  requested.length = 0;
  inFlight = 0;
  maxInFlight = 0;
  routes = { a: 0, b: 10, c: 150 };
  getWorkoutTrack.mockImplementation(async (id: string) => {
    requested.push(id);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    if (id in routes) return { ok: true, track: track(routes[id]) };
    return { ok: false, kind: 'no_track' };
  });
  workouts.value = [row('a', 10), row('b', 9), row('c', 8), row('plan', 20, 'ref-plan', 'planned'), row('none', 7, '')];
});

afterEach(() => {
  vi.useRealTimers();
});

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5000);
}

describe('first run', () => {
  it('reads the viewed track first, then the others newest first, one index request at a time', async () => {
    ensureIndex('c', 'tok');
    await settle();
    expect(requested).toEqual(['c', 'a', 'b']);
    // The planned activity and the one with no track_ref are neither fetched nor used.
    expect(maxInFlight).toBe(1);
    expect(indexProgress.value).toEqual({ state: 'complete', checked: 3, total: 3 });
  });

  it('keeps only the viewed activity in the session track cache', async () => {
    ensureIndex('a', 'tok');
    await settle();
    expect(getCachedTrack('a')).toBeDefined();
    expect(getCachedTrack('b')).toBeUndefined();
    expect(getCachedTrack('c')).toBeUndefined();
  });

  it('lists the activities that match, and never the viewed one', async () => {
    ensureIndex('a', 'tok');
    await settle();
    const r = similarFor('a');
    expect(r.routes.map((w) => w.id)).toEqual(['b']);
    expect(r.near.map((w) => w.id)).toEqual([]);
    expect(similarFor('a').routes.map((w) => w.id)).not.toContain('a');
  });

  it('indexes at most 600 activities', async () => {
    workouts.value = Array.from({ length: INDEX_CAP + 40 }, (_, i) => row(`m${i}`, 1 + (i % 28), `r${i}`));
    for (const w of workouts.value) routes[w.id] = 0;
    ensureIndex('m0', 'tok');
    await vi.advanceTimersByTimeAsync(60000);
    expect(requested.length).toBe(INDEX_CAP);
  });
});

describe('kept on the device', () => {
  it('shows the sections after a reload with no track request', async () => {
    ensureIndex('a', 'tok');
    await settle();
    expect(localStorage.getItem(CELLS_KEY)).toBeTruthy();

    vi.resetModules();
    const fresh = await import('./similar-routes');
    const freshStore = await import('./store');
    freshStore.workouts.value = workouts.value;
    getWorkoutTrack.mockClear();
    fresh.ensureIndex('a', 'tok');
    expect(getWorkoutTrack).not.toHaveBeenCalled();
    expect(fresh.similarFor('a').routes.map((w) => w.id)).toEqual(['b']);
    expect(fresh.indexProgress.value.state).toBe('complete');
  });

  it('fetches again only a new activity or one whose track_ref changed, and drops a deleted one', async () => {
    ensureIndex('a', 'tok');
    await settle();
    requested.length = 0;
    routes.d = 0;
    workouts.value = [row('a', 10), row('b', 9, 'rebuilt'), row('d', 6), row('plan', 20, 'ref-plan', 'planned')];
    ensureIndex('a', 'tok');
    await settle();
    expect(requested.sort()).toEqual(['b', 'd']);
    const saved = JSON.parse(localStorage.getItem(CELLS_KEY)!) as { e: Record<string, unknown> };
    expect(Object.keys(saved.e).sort()).toEqual(['a', 'b', 'd']);
  });

  it('is cleared on sign-out', async () => {
    ensureIndex('a', 'tok');
    await settle();
    clearSimilarIndex();
    expect(localStorage.getItem(CELLS_KEY)).toBeNull();
    expect(similarFor('a').routes).toEqual([]);
    expect(indexProgress.value.state).toBe('idle');
  });

  it('works from memory when storage is unavailable or over quota', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    ensureIndex('a', 'tok');
    await settle();
    expect(similarFor('a').routes.map((w) => w.id)).toEqual(['b']);
    expect(indexProgress.value.state).toBe('complete');
    set.mockRestore();
    get.mockRestore();
  });

  it('stores an activity the API says has no track as no cells, and does not ask again', async () => {
    delete routes.c;
    ensureIndex('a', 'tok');
    await settle();
    expect(indexProgress.value.state).toBe('complete');
    requested.length = 0;
    ensureIndex('a', 'tok');
    await settle();
    expect(requested).toEqual([]);
  });
});

describe('progress and failure', () => {
  it('reports N of M while building, and results found so far', async () => {
    ensureIndex('a', 'tok');
    expect(indexProgress.value).toEqual({ state: 'building', checked: 0, total: 3 });
    await settle();
    expect(indexProgress.value.state).toBe('complete');
  });

  it('stops after five failures in a row, saves none of them, and resumes on the next open', async () => {
    workouts.value = Array.from({ length: 9 }, (_, i) => row(`f${i}`, 1 + i));
    getWorkoutTrack.mockImplementation(async (id: string) => {
      requested.push(id);
      return { ok: false, kind: 'network' };
    });
    ensureIndex('f0', 'tok');
    await settle();
    expect(requested).toHaveLength(MAX_FAILURES);
    expect(indexProgress.value.state).toBe('stopped');
    const saved = localStorage.getItem(CELLS_KEY);
    expect(saved === null || Object.keys((JSON.parse(saved) as { e: object }).e).length === 0).toBe(true);

    // Opening a tracked activity again resumes it.
    getWorkoutTrack.mockImplementation(async (id: string) => {
      requested.push(id);
      return { ok: true, track: track(0) };
    });
    requested.length = 0;
    ensureIndex('f0', 'tok');
    await settle();
    expect(requested).toHaveLength(9);
    expect(indexProgress.value.state).toBe('complete');
  });

  it('logs no coordinate, cell or track', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    ensureIndex('a', 'tok');
    await settle();
    for (const s of spies) {
      expect(s).not.toHaveBeenCalled();
      s.mockRestore();
    }
  });
});
