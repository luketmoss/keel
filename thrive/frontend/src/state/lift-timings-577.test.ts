// #577 — Lift Mode's writes to Sets K:M. saveSetTimings changes only the cells it
// is given, writes all three together so none is blanked, and follows the write in
// both signals; saveSet, which writes A:J, keeps what K:M hold.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { activeWorkoutSets, sets, toasts } from './store';
import type { SetWithRow } from '../api/types';

const api = vi.hoisted(() => ({
  updateSet: vi.fn(async (..._a: unknown[]) => undefined),
  updateSetTimings: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock('../api/workouts-api', async (orig) => ({
  ...(await orig<typeof import('../api/workouts-api')>()),
  updateSet: api.updateSet,
  updateSetTimings: api.updateSetTimings,
}));

const { saveSetTimings, saveSet } = await import('./actions');

const row = (o: Partial<SetWithRow>): SetWithRow => ({
  workout_id: 'w1',
  exercise_id: 'e_ohp',
  exercise_name: 'OH Press',
  section: 'primary',
  exercise_order: 1,
  set_number: 1,
  planned_reps: '8',
  weight: '',
  reps: '',
  effort: '',
  rest_target_s: '90',
  set_s: '',
  rest_s: '',
  sheetRow: 2,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  toasts.value = [];
  const rows = [row({}), row({ set_number: 2, sheetRow: 3 })];
  sets.value = [...rows];
  activeWorkoutSets.value = [...rows];
});

describe('saveSetTimings', () => {
  it('writes K:M with the cells it was not given as the row holds them', async () => {
    expect(await saveSetTimings([{ sheetRow: 2, patch: { set_s: '41' } }], 'tok')).toBe(true);
    expect(api.updateSetTimings).toHaveBeenCalledWith(2, { rest_target_s: '90', set_s: '41', rest_s: '' }, 'tok');
  });

  it('follows each write in both signals, so the next reads it', async () => {
    await saveSetTimings([{ sheetRow: 2, patch: { set_s: '41' } }], 'tok');
    await saveSetTimings([{ sheetRow: 2, patch: { rest_s: '121' } }], 'tok');
    expect(api.updateSetTimings).toHaveBeenLastCalledWith(
      2,
      { rest_target_s: '90', set_s: '41', rest_s: '121' },
      'tok',
    );
    for (const list of [sets.value, activeWorkoutSets.value]) {
      expect(list[0]).toMatchObject({ set_s: '41', rest_s: '121', rest_target_s: '90' });
      expect(list[1]).toMatchObject({ set_s: '', rest_s: '', rest_target_s: '90' });
    }
  });

  it('writes a changed rest_target_s and leaves the measurements alone', async () => {
    await saveSetTimings(
      [
        { sheetRow: 2, patch: { rest_target_s: '60' } },
        { sheetRow: 3, patch: { rest_target_s: '60' } },
      ],
      'tok',
    );
    expect(api.updateSetTimings).toHaveBeenCalledTimes(2);
    expect(api.updateSetTimings).toHaveBeenCalledWith(3, { rest_target_s: '60', set_s: '', rest_s: '' }, 'tok');
  });

  it('resolves false with a toast when a write fails, and does not touch the signals', async () => {
    api.updateSetTimings.mockRejectedValueOnce(new Error('offline'));
    expect(await saveSetTimings([{ sheetRow: 2, patch: { set_s: '41' } }], 'tok')).toBe(false);
    expect(toasts.value.map((t) => t.type)).toEqual(['error']);
    expect(sets.value[0].set_s).toBe('');
  });
});

describe('saveSet keeps K:M', () => {
  it('an A:J edit of a row with measurements leaves them in the signals', async () => {
    await saveSetTimings([{ sheetRow: 2, patch: { set_s: '41' } }], 'tok');
    const { rest_target_s: _t, set_s: _s, rest_s: _r, ...edit } = sets.value[0];
    await saveSet({ ...edit, reps: '8', effort: 'Easy' }, 'tok', 2);
    expect(api.updateSet).toHaveBeenCalled();
    expect(sets.value[0]).toMatchObject({ reps: '8', effort: 'Easy', set_s: '41', rest_target_s: '90' });
    expect(activeWorkoutSets.value[0]).toMatchObject({ set_s: '41', rest_target_s: '90' });
  });
});
