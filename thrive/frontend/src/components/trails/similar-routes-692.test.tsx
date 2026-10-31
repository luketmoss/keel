// #692 — Routes like this and Near here on activity detail: demo mode through the
// real rule, the status line, and nothing without a track source.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/preact';
import { h } from 'preact';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

let demo = true;
vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => demo,
}));
vi.mock('../../auth/auth-context', () => ({ useAuth: () => ({ token: 'tok' }) }));

const getWorkoutTrack = vi.fn();
vi.mock('../../api/thrive-api', async (orig) => ({
  ...(await orig<typeof import('../../api/thrive-api')>()),
  getWorkoutTrack: (...args: unknown[]) => getWorkoutTrack(...args),
}));

const navigate = vi.fn();
vi.mock('../../router/router', async (orig) => ({
  ...(await orig<typeof import('../../router/router')>()),
  navigate: (p: string) => navigate(p),
  goBack: vi.fn(),
}));

import { shiftDemoWorkouts, DEMO_WORKOUTS } from '../../api/demo-data';
import { DEMO_TRACKS } from '../../api/demo-track';
import { workouts } from '../../state/store';
import { clearSimilarIndex } from '../../state/similar-routes';
import { clearTrackCache } from '../../maps/track-cache';
import { WorkoutDetail } from '../activities/workout-detail';
import { STOPPED_LINE } from './similar-routes';

const here = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  demo = true;
  localStorage.clear();
  clearTrackCache();
  clearSimilarIndex();
  getWorkoutTrack.mockReset();
  navigate.mockClear();
  workouts.value = shiftDemoWorkouts(new Date());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const keys = (title: string) =>
  [
    ...screen.getByRole('heading', { name: title }).closest('section')!.querySelectorAll<HTMLElement>('.activity-card'),
  ].map((c) => c.getAttribute('data-focus-key'));

describe('demo mode, through the real rule', () => {
  it('the ride: two shifted rides are Routes like this, the part and the far one are Near here', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(keys('Routes like this')).toEqual(['workout:w_demo012', 'workout:w_demo034']);
    expect(keys('Near here')).toEqual(['workout:w_demo022', 'workout:w_demo028']);
    expect(screen.getByText('Share ground with this one')).toBeTruthy();
    expect(document.querySelector('[role="status"].trail-index-status')).toBeNull();
    expect(getWorkoutTrack).not.toHaveBeenCalled();
  });

  it('the hike: the two earlier hikes, and no Near here', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo008' }));
    expect(keys('Routes like this')).toEqual(['workout:w_demo025', 'workout:w_demo031']);
    expect(screen.queryByText('Near here')).toBeNull();
  });

  it('a card opens its activity, and an activity with no results shows no section or placeholder', () => {
    const first = render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    fireEvent.click(first.container.querySelector<HTMLElement>('[data-focus-key="workout:w_demo012"]')!);
    expect(navigate).toHaveBeenCalledWith('/history/w_demo012');
    cleanup();
    render(h(WorkoutDetail, { workoutId: 'w_demo003' }));
    expect(screen.queryByText('Routes like this')).toBeNull();
    expect(screen.queryByText('Near here')).toBeNull();
    expect(document.querySelector('.trail-index-status')).toBeNull();
  });

  it('sits after the Trails card and before nothing else in the sheet: Routes like this first', () => {
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    const html = document.querySelector('.detail-sheet')!.innerHTML;
    expect(html.indexOf('trails-card-title')).toBeLessThan(html.indexOf('routes-like-this-title'));
    expect(html.indexOf('routes-like-this-title')).toBeLessThan(html.indexOf('near-here-title'));
  });

  it('the fixture holds no pair list and no real coordinate or name', () => {
    const track = readFileSync(resolve(here, '../../api/demo-track.ts'), 'utf-8');
    const trails = readFileSync(resolve(here, '../../api/demo-trails.ts'), 'utf-8');
    expect(trails).not.toMatch(/DEMO_ROUTE_PAIRS/);
    expect(readFileSync(resolve(here, '../../trails/search.ts'), 'utf-8')).not.toMatch(/pairedWith/);
    expect(track).not.toMatch(/-?\d{1,3}\.\d{6,}/);
    expect(Object.keys(DEMO_TRACKS)).toHaveLength(8);
    const refs = new Set(DEMO_WORKOUTS.filter((w) => w.id in DEMO_TRACKS).map((w) => w.track_ref));
    expect(refs.has('')).toBe(false);
  });
});

describe('outside demo mode', () => {
  beforeEach(() => {
    demo = false;
    workouts.value = shiftDemoWorkouts(new Date());
  });

  it('shows neither section nor status line without an API URL, and makes no request', () => {
    vi.stubEnv('VITE_THRIVE_API_URL', '');
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Canyon Road Ride');
    expect(screen.queryByText('Routes like this')).toBeNull();
    expect(screen.queryByText('Near here')).toBeNull();
    expect(document.querySelector('.trail-index-status')).toBeNull();
    expect(getWorkoutTrack).not.toHaveBeenCalled();
  });

  it('shows the building line while the index is incomplete, then the stopped line after five failures', async () => {
    vi.stubEnv('VITE_THRIVE_API_URL', 'https://api.invalid/exec');
    getWorkoutTrack.mockResolvedValue({ ok: false, kind: 'network' });
    render(h(WorkoutDetail, { workoutId: 'w_demo011' }));
    const status = () => document.querySelector('.trail-index-status');
    expect(status()!.getAttribute('role')).toBe('status');
    expect(status()!.textContent).toMatch(/^Looking for similar routes… \d+ of \d+ checked$/);
    await waitFor(() => expect(status()!.textContent).toBe(STOPPED_LINE), { timeout: 5000 });
    expect(getWorkoutTrack.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
