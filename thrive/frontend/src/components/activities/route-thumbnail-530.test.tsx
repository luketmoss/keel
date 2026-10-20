// #530 — route thumbnails on tracked activity cards.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok-secret' }) }));
vi.mock('../../router/router', () => ({ navigate: vi.fn() }));

const demo = { on: false };
vi.mock('../../api/demo-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

const getWorkoutTrack = vi.fn();
vi.mock('../../api/thrive-api', () => ({ getWorkoutTrack: (...a: unknown[]) => getWorkoutTrack(...a) }));

import { ActivitiesScreen } from './activities-screen';
import { fitThumbnail, thumbnailAvailable, THUMB_HEIGHT, THUMB_WIDTH } from './route-thumbnail';
import { clearTrackCache, fetchTrack, getCachedTrack, MAX_IN_FLIGHT } from '../../maps/track-cache';
import { workouts, sets, exercises, activitiesMonth, loading } from '../../state/store';
import type { WorkoutTrack, WorkoutWithRow } from '../../api/types';
import { readGlobalCss } from '../../test-css';

function track(coordinates: [number, number][]): WorkoutTrack {
  return {
    type: 'Feature',
    bbox: [0, 0, 0, 0],
    properties: {
      format: 'thrive-track',
      version: 1,
      source: 'coros',
      activity_id: '1',
      start_utc: '2026-10-18T14:00:00.000Z',
      t: [],
      ele: [],
      simplify: { algorithm: 'rdp', tolerance_m: 5 },
      points_in: coordinates.length,
    },
    geometry: { type: 'LineString', coordinates },
  };
}
const LOOP = track([
  [-100, 45],
  [-100.01, 45.002],
  [-100.02, 45],
]);

let n = 0;
function ride(over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  n += 1;
  return {
    id: `r${n}`,
    date: '2026-10-18',
    time: '08:00',
    type: 'bike',
    name: `Ride ${n}`,
    template_id: '',
    notes: '',
    elapsed_seconds: '3600',
    created: '',
    copied_from: '',
    status: '',
    moving_seconds: '',
    effort: '',
    distance_m: '20000',
    ascent_m: '',
    descent_m: '',
    avg_hr: '',
    sub_type: '',
    source: 'coros',
    source_activity_id: '1',
    raw_ref: '',
    fit_ref: '',
    fit_fetched_at: '',
    synced_at: '',
    started_at_utc: '',
    calories: '',
    estimated_seconds: '',
    sport_type: '',
    track_ref: 'trk',
    sheetRow: 2 + n,
    ...over,
  };
}

// A controllable IntersectionObserver: tests say which elements are in range.
class FakeObserver {
  static all: FakeObserver[] = [];
  static options: IntersectionObserverInit[] = [];
  els = new Set<Element>();
  constructor(
    private cb: (e: Partial<IntersectionObserverEntry>[]) => void,
    opts?: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
    FakeObserver.options.push(opts ?? {});
  }
  observe(el: Element) {
    this.els.add(el);
  }
  disconnect() {
    this.els.clear();
  }
  unobserve(el: Element) {
    this.els.delete(el);
  }
  static set(el: Element, isIntersecting: boolean) {
    for (const o of FakeObserver.all) if (o.els.has(el)) o.cb([{ target: el, isIntersecting }]);
  }
}

const card = (id: string) => document.querySelector<HTMLButtonElement>(`[data-focus-key="workout:${id}"]`)!;
const inRange = (id: string, on = true) => act(() => FakeObserver.set(card(id), on));
const show = (list: WorkoutWithRow[]) => {
  workouts.value = list;
  loading.value = false;
  return render(h(ActivitiesScreen, {}));
};
const routeDrawn = (id: string) => card(id).querySelector('.activity-route');

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T12:00:00'));
  vi.stubEnv('VITE_THRIVE_API_URL', 'https://script.google.com/macros/s/x/exec');
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  FakeObserver.all = [];
  FakeObserver.options = [];
  demo.on = false;
  activitiesMonth.value = '2026-10';
  getWorkoutTrack.mockReset().mockResolvedValue({ ok: true, track: LOOP });
  clearTrackCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
});

describe('AC1: a tracked card draws its route in the slot', () => {
  it('replaces the type tile with a fitted line and a start dot once its track is in', async () => {
    const r = ride();
    show([r]);
    expect(card(r.id).querySelector('.activity-tile')).toBeTruthy();
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    const slot = card(r.id).querySelector('.activity-visual')!;
    expect(slot.classList.contains('activity-tile')).toBe(false);
    expect(slot.querySelectorAll('polyline')).toHaveLength(2);
    expect(slot.querySelectorAll('circle')).toHaveLength(1);
    const first = slot.querySelector('polyline.activity-route-line')!.getAttribute('points')!.split(' ');
    for (const p of first) {
      const [x, y] = p.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(THUMB_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(THUMB_HEIGHT);
    }
    const dot = slot.querySelector('circle')!;
    expect(`${dot.getAttribute('cx')},${dot.getAttribute('cy')}`).toBe(first[0]);
  });

  it('draws a bundled demo track in demo mode without calling the API', async () => {
    demo.on = true;
    const r = ride({ id: 'w_demo008' });
    show([r]);
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    expect(getWorkoutTrack).not.toHaveBeenCalled();
  });

  it('is available only for a completed, tracked activity in a build that can read tracks', () => {
    expect(thumbnailAvailable(ride())).toBe(true);
    expect(thumbnailAvailable(ride({ track_ref: '' }))).toBe(false);
    expect(thumbnailAvailable(ride({ status: 'planned' }))).toBe(false);
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(thumbnailAvailable(ride())).toBe(false);
    demo.on = true;
    expect(thumbnailAvailable(ride({ id: 'w_demo008' }))).toBe(true);
    expect(thumbnailAvailable(ride({ id: 'w_other' }))).toBe(false);
  });
});

describe('AC2: no Google Maps', () => {
  it('draws without loading the Maps script or any maps.googleapis.com request', async () => {
    const r = ride();
    show([r]);
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull();
    const source = readFileSync(resolve(__dirname, 'route-thumbnail.tsx'), 'utf-8');
    expect(source).not.toMatch(/google-maps|maps\.googleapis/);
  });
});

describe('AC3: when a track is requested, and how many at once', () => {
  it('requests nothing until the card is within one screen height of the viewport', async () => {
    const r = ride();
    show([r]);
    expect(getWorkoutTrack).not.toHaveBeenCalled();
    expect(FakeObserver.options[0].rootMargin).toBe(`${window.innerHeight}px 0px`);
    inRange(r.id, false);
    expect(getWorkoutTrack).not.toHaveBeenCalled();
    inRange(r.id);
    await waitFor(() => expect(getWorkoutTrack).toHaveBeenCalledTimes(1));
    expect(getWorkoutTrack).toHaveBeenCalledWith(r.id, 'tok-secret');
  });

  it('keeps at most two in flight, starts the next as one settles, and drops a card that left range', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const calls: string[] = [];
    getWorkoutTrack.mockImplementation(async (id: string) => {
      calls.push(id);
      await gates[calls.length - 1].promise;
      return { ok: true, track: LOOP };
    });
    const list = [ride(), ride(), ride(), ride()];
    show(list);
    for (const r of list) inRange(r.id);
    await waitFor(() => expect(calls).toHaveLength(MAX_IN_FLIGHT));
    expect(MAX_IN_FLIGHT).toBe(2);
    expect(calls).toEqual([list[0].id, list[1].id]);

    // The fourth card scrolls away before its turn: it is dropped from the queue.
    inRange(list[3].id, false);
    await act(async () => gates[0].resolve(null));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toBe(list[2].id);
    await act(async () => gates[1].resolve(null));
    await act(async () => gates[2].resolve(null));
    expect(calls).toHaveLength(3);

    // It asks again when it comes back.
    inRange(list[3].id);
    await waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[3]).toBe(list[3].id);
  });
});

describe('AC4: one fetch per track per session, shared with the detail screen', () => {
  it('does not fetch a cached track again, from the list or the detail fetch', async () => {
    const r = ride();
    show([r]);
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    expect(getCachedTrack(r.id)).toBe(LOOP);
    await fetchTrack(r.id, 'tok-secret');
    expect(getWorkoutTrack).toHaveBeenCalledTimes(1);
  });

  it('draws at once from a track the detail screen fetched first', async () => {
    const r = ride();
    await fetchTrack(r.id, 'tok-secret');
    show([r]);
    expect(routeDrawn(r.id)).toBeTruthy();
    expect(getWorkoutTrack).toHaveBeenCalledTimes(1);
  });

  it('shares one request between two callers asking for the same track at once', async () => {
    const gate = deferred();
    getWorkoutTrack.mockImplementation(async () => {
      await gate.promise;
      return { ok: true, track: LOOP };
    });
    const a = fetchTrack('same', 'tok');
    const b = fetchTrack('same', 'tok');
    gate.resolve(null);
    await Promise.all([a, b]);
    expect(getWorkoutTrack).toHaveBeenCalledTimes(1);
  });
});

describe('AC5: the tile is a complete state', () => {
  const failures: [string, () => void][] = [
    ['a failed request', () => getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'network' })],
    ['a thrown error', () => getWorkoutTrack.mockRejectedValue(new Error('timeout'))],
    ['a track with one point', () => getWorkoutTrack.mockResolvedValue({ ok: true, track: track([[-100, 45]]) })],
    [
      'a track whose latitudes are all invalid',
      () =>
        getWorkoutTrack.mockResolvedValue({
          ok: true,
          track: track([
            [10, 95],
            [11, 120],
          ]),
        }),
    ],
  ];

  it.each(failures)('keeps the type tile, with no spinner or error text, on %s', async (_name, arrange) => {
    arrange();
    const r = ride();
    show([r]);
    const before = card(r.id).textContent;
    inRange(r.id);
    await waitFor(() => expect(getWorkoutTrack).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(card(r.id).querySelector('.activity-tile svg')).toBeTruthy();
    expect(routeDrawn(r.id)).toBeNull();
    expect(card(r.id).querySelector('[role="status"], [aria-busy]')).toBeNull();
    expect(card(r.id).textContent).toBe(before);
  });

  it('logs only the failure kind, never a token, body or coordinate', async () => {
    getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'network' });
    const r = ride();
    show([r]);
    inRange(r.id);
    await waitFor(() => expect(console.warn).toHaveBeenCalledTimes(1));
    expect(console.warn).toHaveBeenCalledWith('route thumbnail:', 'network');
  });

  it('does not cache a failure, so a later visit tries again', async () => {
    getWorkoutTrack.mockResolvedValueOnce({ ok: false, kind: 'network' });
    const r = ride();
    const first = show([r]);
    inRange(r.id);
    await waitFor(() => expect(console.warn).toHaveBeenCalled());
    first.unmount();
    show([r]);
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    expect(getWorkoutTrack).toHaveBeenCalledTimes(2);
  });
});

describe('AC6: no track_ref, no request', () => {
  it('never requests a track, even in range', () => {
    const r = ride({ track_ref: '' });
    show([r]);
    inRange(r.id);
    expect(getWorkoutTrack).not.toHaveBeenCalled();
    expect(card(r.id).querySelector('.activity-tile')).toBeTruthy();
  });
});

describe('AC7: assistive technology', () => {
  it('hides the thumbnail and leaves the card name unchanged', async () => {
    const r = ride();
    show([r]);
    const name = card(r.id).getAttribute('aria-label');
    inRange(r.id);
    await waitFor(() => expect(routeDrawn(r.id)).toBeTruthy());
    expect(routeDrawn(r.id)!.getAttribute('aria-hidden')).toBe('true');
    expect(card(r.id).getAttribute('aria-label')).toBe(name);
  });
});

describe('AC8: @keel/geo helpers', () => {
  it('draws a route across the antimeridian as a short line, not around the globe', () => {
    const pts = fitThumbnail(
      track([
        [179.99, 10],
        [-179.99, 10.001],
        [-179.98, 10],
      ]),
    )!;
    expect(pts).toHaveLength(3);
    expect(pts[0][0]).toBeLessThan(pts[1][0]);
    expect(pts[1][0]).toBeLessThan(pts[2][0]);
    for (const [x] of pts) {
      expect(x).toBeGreaterThanOrEqual(-0.001);
      expect(x).toBeLessThanOrEqual(THUMB_WIDTH + 0.001);
    }
  });

  it('drops invalid latitudes', () => {
    const pts = fitThumbnail(
      track([
        [10, 45],
        [10.001, 120],
        [10.002, 45.001],
      ]),
    )!;
    expect(pts).toHaveLength(2);
  });

  it('fits inside the tile, keeps the aspect ratio and centres', () => {
    const wide = fitThumbnail(
      track([
        [0, 45],
        [0.01, 45],
      ]),
    )!;
    expect(wide[0][0]).toBeCloseTo(0);
    expect(wide[1][0]).toBeCloseTo(THUMB_WIDTH);
    expect(wide[0][1]).toBeCloseTo(THUMB_HEIGHT / 2);
    // Longitude is scaled by cos(latitude): at 60 degrees, 0.02 east spans the same as 0.01 north.
    const eastNorth = fitThumbnail(
      track([
        [0, 60],
        [0.02, 60],
        [0.02, 60.01],
      ]),
    )!;
    const east = eastNorth[1][0] - eastNorth[0][0];
    const north = eastNorth[1][1] - eastNorth[2][1];
    expect(east / north).toBeCloseTo(1, 1);
  });

  it('is unusable when every point is one place', () => {
    expect(
      fitThumbnail(
        track([
          [1, 1],
          [1, 1],
        ]),
      ),
    ).toBeNull();
  });
});

describe('the stylesheet', () => {
  it('draws the thumbnail in the --map-* tokens at 60% widths with non-scaling strokes', () => {
    const css = readGlobalCss();
    expect(css).toMatch(/\.activity-route-line\s*{[^}]*stroke:\s*var\(--map-track\);[^}]*\* 0\.6\)/);
    expect(css).toMatch(/\.activity-route-casing\s*{[^}]*stroke:\s*var\(--map-track-casing\)/);
    expect(css).toMatch(/vector-effect:\s*non-scaling-stroke/);
    expect(css).toMatch(/\.activity-route\s*{[^}]*background:\s*var\(--color-surface-raised\)/);
  });
});
