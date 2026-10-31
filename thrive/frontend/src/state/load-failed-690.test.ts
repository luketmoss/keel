// #690: `loadFailed` is set when the initial read fails for any reason but sign-in, cleared when it
// succeeds, and never set by a failed background refresh.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchWorkouts = vi.fn();
vi.mock('../api/exercises-api', async (orig) => ({ ...(await orig<object>()), fetchExercises: async () => [] }));
vi.mock('../api/templates-api', async (orig) => ({ ...(await orig<object>()), fetchTemplateRows: async () => [] }));
vi.mock('../api/labels-api', async (orig) => ({ ...(await orig<object>()), fetchLabels: async () => [] }));
vi.mock('../api/workouts-api', async (orig) => ({
  ...(await orig<object>()),
  fetchWorkouts: (t: string) => fetchWorkouts(t),
  fetchSets: async () => [],
}));
vi.mock('../api/demo-data', async (orig) => ({ ...(await orig<object>()), isDemo: () => false }));

import { loadInitialData, refreshWorkouts } from './actions';
import { loadFailed, loading, workouts } from './store';
import { ReauthFailedError } from '@keel/auth';

beforeEach(() => {
  fetchWorkouts.mockReset();
  loadFailed.value = false;
  loading.value = false;
  workouts.value = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('loadFailed', () => {
  it('is set by a failed initial read, and cleared by the next one that succeeds', async () => {
    fetchWorkouts.mockRejectedValue(new Error('network'));
    await loadInitialData('tok');
    expect(loadFailed.value).toBe(true);
    expect(loading.value).toBe(false);
    fetchWorkouts.mockResolvedValue([]);
    await loadInitialData('tok');
    expect(loadFailed.value).toBe(false);
  });

  it('is not set by a sign-in failure', async () => {
    fetchWorkouts.mockRejectedValue(new ReauthFailedError());
    await loadInitialData('tok');
    expect(loadFailed.value).toBe(false);
  });

  it('is not set by a failed background refresh, which keeps its data', async () => {
    const kept = [{ id: 'kept' }] as never;
    workouts.value = kept;
    fetchWorkouts.mockRejectedValue(new Error('network'));
    await refreshWorkouts('tok');
    expect(loadFailed.value).toBe(false);
    expect(workouts.value).toBe(kept);
  });
});
