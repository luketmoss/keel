// #407, #532: the route map hero of the activity detail screen, rendered.

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

import { RouteHero, clearRouteCache, routeAvailable, trackAvailable, useWorkoutTrack } from './route-section';
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

const ELEVATED: WorkoutTrack = {
  ...TRACK,
  properties: { ...TRACK.properties, ele: [1650, 1700, 1800] },
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

/** The hero as the detail screen builds it: the track hook, then the hero over it. */
function RouteSection({ workout }: { workout: WorkoutWithRow }) {
  return h(RouteHero, { trackState: useWorkoutTrack(workout.id) });
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

describe('trackAvailable (#532)', () => {
  it('needs a track_ref and the API URL, and no Maps key', () => {
    maps.key = '';
    expect(trackAvailable(workout())).toBe(true);
    expect(routeAvailable(workout())).toBe(false);
    expect(trackAvailable(workout({ track_ref: '' }))).toBe(false);
    expect(trackAvailable(workout({ status: 'planned' }))).toBe(false);
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(trackAvailable(workout())).toBe(false);
  });
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

describe('the hero', () => {
  it('holds the map box while loading, then replaces it with the drawn map', async () => {
    let finish!: () => void;
    loadMaps.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { container } = render(h(RouteSection, { workout: workout() }));
    expect(screen.queryByRole('heading', { name: 'Route' })).toBeNull();
    const box = container.querySelector('.detail-hero-map')!;
    expect(box.getAttribute('aria-busy')).toBe('true');
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toBe('Loading route…');

    await act(async () => finish());
    await waitFor(() => expect(container.querySelector('[role="region"][aria-label="Route map"]')).toBeTruthy());
    expect(container.querySelectorAll('.detail-hero-map')).toHaveLength(1);
    await waitFor(() => expect(state.maps).toHaveLength(1));
    expect(state.maps[0].container).toBe(container.querySelector('.detail-hero-map'));
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
    expect(container.querySelectorAll('.detail-hero-map')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Try again' }).className).toContain('btn-secondary');
    expect(screen.getByRole('button', { name: 'Try again' }).className).not.toContain('btn-sm');
    expect(screen.queryByRole('heading', { name: 'Route' })).toBeNull();
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

  it('puts the hero first, the bar over it, and the title block in the sheet, with no Route heading', async () => {
    const { container } = show(workout());
    const screenEl = container.querySelector('.workout-detail-screen')!;
    expect(screenEl.classList.contains('has-hero')).toBe(true);
    expect(screenEl.firstElementChild?.className).toBe('detail-hero');
    expect(screenEl.querySelector('.detail-top-bar')).toBeTruthy();
    const sheet = container.querySelector('.detail-sheet')!;
    expect(sheet.firstElementChild).toBe(container.querySelector('.detail-title-block'));
    expect(sheet.querySelector('.detail-stats-card')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Route' })).toBeNull();
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });

  it('gives a walk with a track the hero too: the rule is the track, not the type', async () => {
    const { container } = show(workout({ type: 'walk', name: 'Walk' }));
    expect(container.querySelector('.detail-hero')).toBeTruthy();
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });

  it('shows no hero, no placeholder and no Elevation card without a track_ref, and asks for nothing', () => {
    const { container } = show(workout({ track_ref: '' }));
    expect(container.querySelector('.detail-hero')).toBeNull();
    expect(container.querySelector('.has-hero')).toBeNull();
    expect(container.querySelector('.detail-elevation-card')).toBeNull();
    expect(screen.queryByText('Loading route…')).toBeNull();
    expect(loadMaps).not.toHaveBeenCalled();
    expect(getWorkoutTrack).not.toHaveBeenCalled();
  });

  it('shows no hero without the API URL, and asks for no map script', () => {
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    expect(show(workout()).container.querySelector('.detail-hero')).toBeNull();
    expect(loadMaps).not.toHaveBeenCalled();
  });

  it('without a Maps key: no hero and no map script, but the Elevation card, in the shell layout', async () => {
    maps.key = '';
    getWorkoutTrack.mockResolvedValue({ ok: true, track: ELEVATED });
    const { container } = show(workout());
    expect(container.querySelector('.detail-hero')).toBeNull();
    await waitFor(() => expect(container.querySelector('.detail-elevation-card')).toBeTruthy());
    expect(loadMaps).not.toHaveBeenCalled();
    expect(getWorkoutTrack).toHaveBeenCalledTimes(1);
  });

  it('shows the Elevation card after the stats card once the track arrives, and not before', async () => {
    getWorkoutTrack.mockResolvedValue({ ok: true, track: ELEVATED });
    const { container } = show(workout());
    expect(container.querySelector('.detail-elevation-card')).toBeNull();
    await waitFor(() => expect(container.querySelector('.detail-elevation-card')).toBeTruthy());
    expect(container.querySelector('.detail-stats-card')?.nextElementSibling).toBe(
      container.querySelector('.detail-elevation-card'),
    );
    await waitFor(() => expect(state.maps).toHaveLength(1));
  });

  it('leaves the Elevation card out when the track fails, and keeps the sheet', async () => {
    getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = show(workout());
    await waitFor(() => expect(screen.getByText("Couldn't load the route.")).toBeTruthy());
    expect(container.querySelector('.detail-elevation-card')).toBeNull();
    expect(container.querySelector('.detail-title-block')).toBeTruthy();
  });

  it('keeps the bar buttons in the page over the loading state', () => {
    loadMaps.mockReturnValue(new Promise(() => {}));
    show(workout());
    expect(screen.getByText('Loading route…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit workout' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
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

describe('the map options (#532)', () => {
  it('place zoom and full screen at the bottom right and the map type at the bottom left', async () => {
    render(h(RouteSection, { workout: workout() }));
    await waitFor(() => expect(state.maps).toHaveLength(1));
    const o = state.maps[0].options;
    expect(o.zoomControlOptions.position).toBe(12);
    expect(o.fullscreenControlOptions.position).toBe(12);
    expect(o.mapTypeControlOptions.position).toBe(6);
    expect(o.gestureHandling).toBe('cooperative');
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
      '--detail-hero-height',
    ]) {
      expect(root, t).toContain(`${t}:`);
    }
    expect(root).toMatch(/--map-track:\s*#2f66f0/);
    expect(root).toMatch(/--detail-hero-height:\s*clamp\(320px, 62vh, 560px\)/);
    expect(css).not.toContain('--detail-map-height');
    expect(css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*--map-/g)).toBeNull();
  });

  it('gives the hero its height from the token, and the map box leaves room for the sheet overlap', () => {
    const hero = css.match(/\.workout-detail-screen > \.detail-hero\s*\{([^}]*)\}/)![1];
    expect(hero).toContain('height: var(--detail-hero-height)');
    const box = css.match(/\.detail-hero-map\s*\{([^}]*)\}/)![1];
    expect(box).toContain('calc(100% - var(--space-lg))');
  });

  it('overlaps the map with a rounded sheet, and floats the top bar on scrims', () => {
    const sheet = css.match(/\.workout-detail-screen\.has-hero > \.detail-sheet\s*\{([^}]*)\}/)![1];
    expect(sheet).toContain('margin-top: calc(-1 * var(--space-lg))');
    expect(sheet).toContain('var(--radius-lg) var(--radius-lg) 0 0');
    const bar = css.match(/\.workout-detail-screen\.has-hero > \.detail-top-bar\s*\{([^}]*)\}/)![1];
    expect(bar).toContain('position: absolute');
    expect(bar).toContain('env(safe-area-inset-top');
    expect(css).toMatch(
      /\.has-hero \.detail-icon-btn\s*\{[^}]*color-mix\(in srgb, var\(--color-bg\) 78%, transparent\)/,
    );
  });

  it('uses the secondary text colour for its two lines, not the muted one', () => {
    const rule = css.match(/\.detail-hero-status\s*\{([^}]*)\}/)![1];
    expect(rule).toContain('var(--color-text-secondary)');
    expect(rule).not.toContain('--color-text-muted');
  });
});
