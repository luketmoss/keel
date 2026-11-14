// #881: each new client method posts its action and its payload unchanged, and hands back the API's answer as
// the typed shape the API issues (#877, #878, #879) define. The typed samples below are what fail typecheck when a
// type drifts from its issue.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveApi } from './client';
import type { CombosResult, CopyMealInput, FoodLogEntry, LogGroupResult, Usual, UsualInput } from './types';

const usual: Usual = {
  id: 'us_1a2b3c4d',
  name: 'Oatmeal',
  slot: 'Breakfast',
  created: '2026-11-01T12:00:00.000Z',
  updated: '2026-11-01T12:00:00.000Z',
  lines: [
    {
      line_id: 'L1',
      position: 1,
      food_id: 'fd_oats',
      qty: 0.5,
      unit: 'cup',
      options: null,
      last_pick: '',
      swaps: [],
    },
    {
      line_id: 'L2',
      position: 2,
      food_id: '',
      qty: null,
      unit: '',
      options: [
        { food_id: 'fd_blue', qty: 0.5, unit: 'cup' },
        { food_id: 'fd_banana', qty: 1, unit: 'medium' },
      ],
      last_pick: 'fd_blue',
      swaps: [{ food_id: 'fd_straw', count: 2 }],
    },
  ],
  used_count: 3,
  last_used: '2026-11-13',
  start: { kcal: 310.4, protein_g: 11.2, carbs_g: 52, fat_g: 7.1, partial: false },
};

const entry: FoodLogEntry = {
  id: 'lg_1',
  date: '2026-11-14',
  slot: 'Breakfast',
  food_id: 'fd_oats',
  recipe_id: '',
  qty: 0.5,
  unit: 'cup',
  grams: 40,
  kcal: 155.6,
  protein_g: 6.8,
  carbs_g: 26.4,
  fat_g: 2.8,
  partial: false,
  source: 'app',
  logged_at: '2026-11-14T08:00:00.000Z',
  created: '2026-11-14T08:00:00.000Z',
  updated: '2026-11-14T08:00:00.000Z',
  group_id: 'gr_1a2b3c4d',
  group_name: 'Oatmeal',
  usual_id: 'us_1a2b3c4d',
  usual_line_id: 'L1',
};

const grouped: LogGroupResult = { entries: [entry], group_id: 'gr_1a2b3c4d' };

const combos: CombosResult = {
  combos: [
    {
      key: 'fd_bread+fd_turkey|fd_cheddar/fd_swiss',
      name: 'Bread + Turkey + Cheddar / Swiss',
      slot: 'Lunch',
      meals: 7,
      last_date: '2026-11-10',
      lines: [
        { food_id: 'fd_bread', qty: 2, unit: 'slice' },
        {
          options: [
            { food_id: 'fd_cheddar', qty: 1, unit: 'slice' },
            { food_id: 'fd_swiss', qty: 1, unit: 'slice' },
          ],
          default: 'fd_cheddar',
        },
      ],
      meal_dates: [{ date: '2026-11-10', slot: 'Lunch' }],
    },
  ],
  stats: { meals: 54, sets: 38, kept: 6, after_inner: 5, joined: 4, covered: 1, hidden: 0, returned: 3 },
};

describe('the usuals, groups, copy and combos client (#881)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Runs one call against a stubbed API that answers `data`; gives back what was sent and what came back. */
  async function run<T>(data: unknown, call: (api: ReturnType<typeof createLiveApi>) => Promise<T>) {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ success: true, data }) }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await call(createLiveApi('tok', 'https://example.test/exec'));
    const calls = fetchMock.mock.calls as unknown as [string, { method: string; body: URLSearchParams }][];
    expect(calls).toHaveLength(1);
    const body = calls[0][1].body;
    return {
      result,
      action: body.get('action'),
      token: body.get('access_token'),
      payload: body.has('payload') ? JSON.parse(body.get('payload')!) : undefined,
      params: Object.fromEntries([...body].filter(([k]) => k !== 'action' && k !== 'access_token' && k !== 'payload')),
    };
  }

  it('getUsuals asks for every usual, or one slot', async () => {
    const all = await run([usual], (api) => api.getUsuals());
    expect(all).toMatchObject({ action: 'getUsuals', token: 'tok', params: {}, payload: undefined });
    expect(all.result).toEqual([usual]);
    const some = await run([usual], (api) => api.getUsuals('Breakfast'));
    expect(some.params).toEqual({ slot: 'Breakfast' });
  });

  it('getUsual sends the id', async () => {
    const r = await run(usual, (api) => api.getUsual('us_1a2b3c4d'));
    expect(r).toMatchObject({ action: 'getUsual', params: { id: 'us_1a2b3c4d' } });
    expect(r.result).toEqual(usual);
  });

  it('upsertUsual sends the usual as given', async () => {
    const input: UsualInput = {
      id: 'us_1a2b3c4d',
      name: 'Oatmeal',
      slot: 'Breakfast',
      lines: [
        { line_id: 'L1', food_id: 'fd_oats', qty: 0.5, unit: 'cup' },
        {
          options: [
            { food_id: 'fd_blue', qty: 0.5, unit: 'cup' },
            { food_id: 'fd_banana', qty: 1, unit: 'medium' },
          ],
          last_pick: 'fd_blue',
        },
      ],
    };
    const r = await run(usual, (api) => api.upsertUsual(input));
    expect(r).toMatchObject({ action: 'upsertUsual', payload: input });
    expect(r.result).toEqual(usual);
  });

  it('deleteUsual sends the id', async () => {
    const r = await run({ id: 'us_1' }, (api) => api.deleteUsual('us_1'));
    expect(r).toMatchObject({ action: 'deleteUsual', payload: { id: 'us_1' } });
  });

  it('logUsual sends the picks, and dry_run only when asked', async () => {
    const input = { usual_id: 'us_1', date: '2026-11-14', slot: 'Breakfast' as const, picks: { L2: 'fd_banana' } };
    const r = await run(grouped, (api) => api.logUsual(input));
    expect(r).toMatchObject({ action: 'logUsual', payload: input });
    expect(r.result).toEqual(grouped);
    const dry = await run(grouped, (api) => api.logUsual(input, true));
    expect(dry.payload).toEqual({ ...input, dry_run: true });
  });

  it('logGroup sends the name and items, and dry_run only when asked', async () => {
    const input = {
      date: '2026-11-14',
      slot: 'Lunch' as const,
      name: 'Bread + Turkey',
      items: [
        { food_id: 'fd_bread', qty: 2, unit: 'slice' },
        { food_id: 'fd_turkey', qty: 3, unit: 'slice' },
      ],
    };
    const r = await run(grouped, (api) => api.logGroup(input));
    expect(r).toMatchObject({ action: 'logGroup', payload: input });
    expect(r.result).toEqual(grouped);
    expect((await run(grouped, (api) => api.logGroup(input, true))).payload).toEqual({ ...input, dry_run: true });
  });

  it('copyMeal sends the source and the target', async () => {
    const input: CopyMealInput = {
      from_date: '2026-11-13',
      from_slot: 'Breakfast',
      group_id: 'gr_1',
      to_date: '2026-11-14',
      to_slot: 'Breakfast',
    };
    const r = await run([entry], (api) => api.copyMeal(input));
    expect(r).toMatchObject({ action: 'copyMeal', payload: input });
    expect(r.result).toEqual([entry]);
  });

  it('setLogGroup sends the ids and the group, or null to ungroup', async () => {
    const group = { name: 'Oatmeal', usual_id: 'us_1' };
    const r = await run([entry], (api) => api.setLogGroup(['lg_1', 'lg_2'], group));
    expect(r).toMatchObject({ action: 'setLogGroup', payload: { ids: ['lg_1', 'lg_2'], group } });
    const off = await run([entry], (api) => api.setLogGroup(['lg_1'], null));
    expect(off.payload).toEqual({ ids: ['lg_1'], group: null });
  });

  it('deleteLogEntries is deleteLogEntry with ids', async () => {
    const r = await run({ ids: ['lg_1', 'lg_2'] }, (api) => api.deleteLogEntries(['lg_1', 'lg_2']));
    expect(r).toMatchObject({ action: 'deleteLogEntry', payload: { ids: ['lg_1', 'lg_2'] } });
  });

  it('getCombos sends only the filters given', async () => {
    const none = await run(combos, (api) => api.getCombos());
    expect(none).toMatchObject({ action: 'getCombos', params: {} });
    expect(none.result).toEqual(combos);
    const all = await run(combos, (api) => api.getCombos({ slot: 'Snacks', days: 30, limit: 3 }));
    expect(all.params).toEqual({ slot: 'Snacks', days: '30', limit: '3' });
  });

  it('hideCombo sends the key', async () => {
    const r = await run({ hidden: ['k'] }, (api) => api.hideCombo('fd_a+fd_b'));
    expect(r).toMatchObject({ action: 'hideCombo', payload: { key: 'fd_a+fd_b' } });
  });

  it('unhideCombos sends the keys, or nothing for all', async () => {
    const some = await run({ hidden: [] }, (api) => api.unhideCombos(['fd_a+fd_b']));
    expect(some).toMatchObject({ action: 'unhideCombos', payload: { keys: ['fd_a+fd_b'] } });
    const all = await run({ hidden: [] }, (api) => api.unhideCombos());
    expect(all.payload).toEqual({});
  });

  it('saveFood sends short_name with the food', async () => {
    const r = await run({ id: 'fd_1' }, (api) => api.saveFood({ id: 'fd_1', short_name: 'Crunchy PB' }));
    expect(r).toMatchObject({ action: 'upsertFood', payload: { id: 'fd_1', short_name: 'Crunchy PB' } });
  });
});
