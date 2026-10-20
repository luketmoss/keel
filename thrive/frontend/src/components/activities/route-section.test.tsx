// #407: the Route section of the activity detail screen, rendered.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/preact';
import { h } from 'preact';

vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok-secret' }) }));

const demo = { on: false };
vi.mock('../../api/demo-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

const getWorkoutTrack = vi.fn();
vi.mock('../../api/thrive-api', () => ({ getWorkoutTrack: (...a: unknown[]) => getWorkoutTrack(...a) }));

const loadMaps = vi.fn();
const maps = { key: 'KEY' };
vi.mock('../../maps/google-maps', () => ({
  loadMaps: () => loadMaps(),
  mapsApiKey: () => maps.key,
}));

import { RouteSection, clearRouteCache, routeAvailable } from './route-section';
import { WorkoutDetail } from './workout-detail';
import { DEMO_TRACKS } from '../../api/demo-track';
import { workouts, sets, exercises } from '../../state/store';
import type { WorkoutTrack, WorkoutWithRow } from '../../api/types';
import { installFakeGoogleMaps, removeFakeGoogleMaps, type FakeMapState } from '../../maps/fake-google-maps';
import { readGlobalCss } from '../../test-css';

const TRACK: WorkoutTrack = {
  type: 'Feature',
  bbox: [-100.02, 45, -100, 45.002],
  properties: {
    format: 'thrive-track',
    version: 1,
    source: 'coros',
    activity_id: '1',
    start_utc: '2026-06-01T14:00:00.000Z',
    t: [0, 30, 60],
    ele: [1, 2, 3],
    simplify: { algorithm: 'rdp', tolerance_m: 5 },
    points_in: 99,
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-100, 45],
      [-100.01, 45.002],
      [-100.02, 45],
    ],
  },
};

function workout(over: Partial<WorkoutWithRow> = {}): WorkoutWithRow {
  return {
    id: 'w_ride',
    date: '2026-06-01',
    time: '08:10',
    type: 'bike',
    name: 'Gravel Bike',
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
    sub_type: 'gravel',
    source: 'coros',
    source_activity_id: '1',
    raw_ref: 'raw',
    fit_ref: 'fit',
    fit_fetched_at: '2026-06-01T15:00:00.000Z',
    synced_at: '',
    started_at_utc: '',
    calories: '',
    estimated_seconds: '',
    sport_type: '203',
    track_ref: 'trk',
    sheetRow: 2,
    ...over,
  };
}

let state: FakeMapState;
beforeEach(() => {
  vi.stubEnv('VITE_THRIVE_API_URL', 'https://script.google.com/macros/s/x/exec');
  maps.key = 'KEY';
  demo.on = false;
  state = installFakeGoogleMaps();
  getWorkoutTrack.mockReset().mockResolvedValue({ ok: true, track: TRACK });
  loadMaps.mockReset().mockResolvedValue(undefined);
  clearRouteCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  removeFakeGoogleMaps();
  workouts.value = [];
  sets.value = [];
  exercises.value = [];
});

describe('routeAvailable', () => {
  it('needs a track_ref, a Maps key and the API URL', () => {
    expect(routeAvailable(workout())).toBe(true);
    expect(routeAvailable(workout({ track_ref: '' }))).toBe(false);
    maps.key = '';
    expect(routeAvailable(workout())).toBe(false);
    maps.key = 'KEY';
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(routeAvailable(workout())).toBe(false);
  });

  it('is never for a planned or active workout', () => {
    expect(routeAvailable(workout({ status: 'planned' }))).toBe(false);
    expect(routeAvailable(workout({ status: 'active' }))).toBe(false);
  });

  it('in demo mode needs the key and a bundled track, not the API', () => {
    demo.on = true;
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(routeAvailable(workout({ id: 'w_demo008', track_ref: 'demo-track' }))).toBe(true);
    expect(routeAvailable(workout({ id: 'w_other', track_ref: 'demo-track' }))).toBe(false);
    maps.key = '';
    expect(routeAvailable(workout({ id: 'w_demo008', track_ref: 'demo-track' }))).toBe(false);
  });
});

describe('the section', () => {
  it('holds the map box while loading, then replaces it with the drawn map', async () => {
    let finish!: () => void;
    loadMaps.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { container } = render(h(RouteSection, { workout: workout() }));
    expect(screen.getByRole('heading', { name: 'Route' })).toBeTruthy();
    const box = container.querySelector('.detail-route-map')!;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toBe('Loading route…');

    await act(async () => finish());
    await waitFor(() => expect(container.querySelector('[role="region"][aria-label="Route map"]')).toBeTruthy());
    expect(container.querySelectorAll('.detail-route-map')).toHaveLength(1);
    await waitFor(() => expect(state.maps).toHaveLength(1));
    expect(state.maps[0].container).toBe(container.querySelector('.detail-route-map'));
    expect(state.polylines).toHaveLength(2);
  });

  it("fetches the track through the API with the user's token", async () => {
    render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(state.maps).toHaveLength(1));
    expect(getWorkoutTrack).toHaveBeenCalledWith('w_ride', 'tok-secret');
  });

  it.each([
    ['the track request fails', () => getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'token_invalid' })],
    ['the API refuses', () => getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'no_track' })],
    ['the track request times out', () => getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'timeout' })],
    ['the Maps script fails to load', () => loadMaps.mockRejectedValue(new Error('maps_script'))],
    ['Google refuses the key', () => loadMaps.mockRejectedValue(new Error('maps_auth'))],
    [
      'the track has fewer than two usable points',
      () =>
        getWorkoutTrack.mockResolvedValue({
          ok: true,
          track: {
            ...TRACK,
            geometry: {
              type: 'LineString',
              coordinates: [
                [1, 95],
                [2, 96],
              ],
            },
          },
        }),
    ],
  ])('shows the error line, in the same box, when %s', async (_n, arrange) => {
    arrange();
    const { container } = render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(screen.getByText("Couldn't load the route.")).toBeTruthy());
    expect(container.querySelectorAll('.detail-route-map')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Try again' }).className).toContain('btn-secondary');
    expect(screen.getByRole('button', { name: 'Try again' }).className).not.toContain('btn-sm');
    expect(screen.getByRole('heading', { name: 'Route' })).toBeTruthy();
  });

  it('logs the reason once as a kind, never the token or a coordinate', async () => {
    getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'token_invalid' });
    render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(screen.getByText("Couldn't load the route.")).toBeTruthy());
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('route map:', 'token_invalid');
    expect(JSON.stringify((console.warn as any).mock.calls)).not.toContain('tok-secret');
  });

  it('Try again retries both steps, and a button is not shown while the retry is in flight', async () => {
    loadMaps.mockRejectedValueOnce(new Error('maps_script'));
    getWorkoutTrack.mockResolvedValueOnce({ ok: false, kind: 'network' });
    render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());

    let finish!: () => void;
    loadMaps.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    expect(screen.getByText('Loading route…')).toBeTruthy();
    expect(getWorkoutTrack).toHaveBeenCalledTimes(2);
    expect(loadMaps).toHaveBeenCalledTimes(2);

    await act(async () => finish());
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });

  it('does not fetch a track twice when the same activity is reopened in the session', async () => {
    const first = render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(state.maps).toHaveLength(1));
    first.unmount();
    render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(state.maps).toHaveLength(2));
    expect(getWorkoutTrack).toHaveBeenCalledTimes(1);
  });

  it('abandons a load when the screen goes away, and draws nothing into a later one', async () => {
    let finish!: (v: unknown) => void;
    getWorkoutTrack.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const view = render(h(RouteSection, { workout: workout() }));
    view.unmount();
    await act(async () => finish({ ok: true, track: TRACK }));
    expect(state.maps).toHaveLength(0);
  });

  it('a second activity fetches its own track', async () => {
    const first = render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(state.maps).toHaveLength(1));
    first.unmount();
    render(h(RouteSection, { workout: workout({ id: 'w_other' }) }));
    await waitFor(() => expect(state.maps).toHaveLength(2));
    expect(getWorkoutTrack).toHaveBeenCalledTimes(2);
    expect(getWorkoutTrack).toHaveBeenLastCalledWith('w_other', 'tok-secret');
  });

  it('demo mode draws the bundled track and never calls the API', async () => {
    demo.on = true;
    render(h(RouteSection, { workout: workout({ id: 'w_demo008', track_ref: 'demo-track' }) }));
    await waitFor(() => expect(state.maps).toHaveLength(1));
    expect(getWorkoutTrack).not.toHaveBeenCalled();
    expect(state.polylines[0].options.path.length).toBe(DEMO_TRACKS.w_demo008.geometry.coordinates.length);
  });
});

describe('on the detail screen', () => {
  const show = (w: WorkoutWithRow) => {
    workouts.value = [w];
    return render(h(WorkoutDetail, { workoutId: w.id }));
  };

  it('puts the Route section right after the title block, above the stats card', async () => {
    const { container } = show(workout());
    const title = container.querySelector('.detail-title-block')!;
    const route = container.querySelector('.detail-route')!;
    expect(route).toBeTruthy();
    expect(title.nextElementSibling).toBe(route);
    expect(route.nextElementSibling?.className).toBe('detail-stats-card');
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });

  it('shows no Route section, and asks for no map script, without a track_ref', () => {
    const { container } = show(workout({ track_ref: '' }));
    expect(container.querySelector('.detail-route')).toBeNull();
    expect(screen.queryByText('Route')).toBeNull();
    expect(loadMaps).not.toHaveBeenCalled();
    expect(getWorkoutTrack).not.toHaveBeenCalled();
  });

  it('shows none anywhere in a build without the key or the API URL', () => {
    maps.key = '';
    expect(show(workout()).container.querySelector('.detail-route')).toBeNull();
    cleanup();
    maps.key = 'KEY';
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(show(workout()).container.querySelector('.detail-route')).toBeNull();
    expect(loadMaps).not.toHaveBeenCalled();
  });

  it('says "No details recorded" when there is no route and nothing else to show', () => {
    const { container } = show(workout({ track_ref: '', elapsed_seconds: '', distance_m: '' }));
    expect(container.textContent).toContain('No details recorded');
  });

  it('does not say "No details recorded" over a route', async () => {
    const { container } = show(workout({ elapsed_seconds: '', distance_m: '' }));
    expect(container.textContent).not.toContain('No details recorded');
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();

  it('defines the six tokens in :root, and none of them in a theme', () => {
    const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)![1];
    for (const t of [
      '--map-track',
      '--map-track-casing',
      '--map-track-width',
      '--map-track-width-casing',
      '--map-dot-size',
      '--detail-map-height',
    ]) {
      expect(root, t).toContain(`${t}:`);
    }
    expect(root).toMatch(/--map-track:\s*#2f66f0/);
    expect(root).toMatch(/--detail-map-height:\s*280px/);
    expect(css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*--map-/g)).toBeNull();
  });

  it('gives the box a fixed height from the token in every state, the rounding and border of the cards below', () => {
    const rule = css.match(/\.detail-route-map\s*\{([^}]*)\}/)![1];
    expect(rule).toContain('height: var(--detail-map-height)');
    expect(rule).toContain('var(--radius-md)');
    expect(rule).toContain('var(--color-border)');
    expect(rule).toContain('overflow: hidden');
  });

  it('uses the secondary text colour for its two lines, not the muted one', () => {
    const rule = css.match(/\.detail-route-status\s*\{([^}]*)\}/)![1];
    expect(rule).toContain('var(--color-text-secondary)');
    expect(rule).not.toContain('--color-text-muted');
  });
});
