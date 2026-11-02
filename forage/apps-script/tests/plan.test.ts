// #709: the meal plan's API. getPlan's derived fields and not_on_trip,
// movePlanEntry, planWeek, the id-less duplicate check, the fixed-text
// refusals, that plan writes leave Trips, TripItems and Cooks alone, and undo.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';
import { PROTOTYPE_KCAL_PER_SERVING, STEW_FOODS, STEW_RECIPE } from './fixtures/beef-stew';

const TODAY = '2026-11-02'; // a Monday
const BEEF = { id: 'beef', name: 'Beef', kcal_100g: 190, protein_100g: 19, carbs_100g: 0, fat_100g: 12 };

/** Two recipes: rc_soup counts fully, rc_part has an unmatched line. */
function seeded(): Api {
  const api = loadApi();
  api.ok('upsertFood', { payload: BEEF });
  api.ok('upsertRecipe', {
    payload: { id: 'rc_soup', name: 'Beef soup', servings: 2, lines: [{ text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' }] },
  });
  api.ok('upsertRecipe', {
    payload: {
      id: 'rc_part',
      name: 'Mystery stew',
      servings: 4,
      lines: [{ text: '1 lb beef', qty: 1, unit: 'lb', food_id: 'beef' }, { text: 'something', food_id: '' }],
    },
  });
  return api;
}

const plan = (api: Api, payload: object) => api.ok('upsertPlanEntry', { payload });
const getPlan = (api: Api, params: object = {}) => api.ok('getPlan', { today: TODAY, ...params });

describe('getPlan: derived fields, order, not_on_trip', () => {
  it('answers each entry with recipe_name, servings, kcal_serving, partial and the trip fields', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    plan(api, { id: 'pl_2', date: '2026-11-03', slot: 'Lunch', recipe_id: 'rc_part' });
    plan(api, { id: 'pl_3', date: '2026-11-03', slot: 'Snacks', note: 'Popcorn' });
    const out = getPlan(api);
    expect(out.entries.map((e: { id: string }) => e.id)).toEqual(['pl_2', 'pl_1', 'pl_3']);
    expect(out.entries[1]).toMatchObject({
      recipe_name: 'Beef soup',
      servings: 2,
      kcal_serving: Math.round(((190 * 453.592) / 100 / 2) * 10) / 10,
      partial: false,
      trip_id: '',
      trip_status: '',
      on_trip: false,
      shopped: false,
    });
    expect(out.entries[0]).toMatchObject({ recipe_name: 'Mystery stew', partial: true });
    expect(out.entries[2]).toMatchObject({ note: 'Popcorn', recipe_name: '', kcal_serving: null, partial: false });
    expect(out.not_on_trip).toBe(2);
  });

  it('kcal_serving is null, never 0, when nothing could be counted', () => {
    const api = seeded();
    api.ok('upsertRecipe', { payload: { id: 'rc_none', name: 'Toast', servings: 1, lines: [{ text: 'bread', food_id: '' }] } });
    plan(api, { date: '2026-11-03', slot: 'Breakfast', recipe_id: 'rc_none' });
    expect(getPlan(api).entries[0].kcal_serving).toBeNull();
  });

  it('orders by date, slot, then the order planned', () => {
    const api = seeded();
    plan(api, { id: 'pl_b', date: '2026-11-04', slot: 'Dinner', recipe_id: 'rc_soup' });
    plan(api, { id: 'pl_a', date: '2026-11-04', slot: 'Dinner', recipe_id: 'rc_part' });
    plan(api, { id: 'pl_c', date: '2026-11-03', slot: 'Snacks', note: 'Fruit' });
    plan(api, { id: 'pl_d', date: '2026-11-04', slot: 'Breakfast', note: 'Oats' });
    expect(getPlan(api).entries.map((e: { id: string }) => e.id)).toEqual(['pl_c', 'pl_d', 'pl_b', 'pl_a']);
  });

  it('marks a meal on an open trip on_trip, and one on a closed trip shopped', () => {
    const api = seeded();
    api.ok('createTrip', { payload: { id: 'tr_old' } });
    api.ok('updateTrip', { payload: { id: 'tr_old', changes: { status: 'closed' } } });
    api.ok('createTrip', { payload: { id: 'tr_new' } });
    plan(api, { id: 'pl_open', date: '2026-11-04', slot: 'Dinner', recipe_id: 'rc_soup', trip_id: 'tr_new' });
    plan(api, { id: 'pl_shut', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', trip_id: 'tr_old' });
    const byId = Object.fromEntries(getPlan(api).entries.map((e: { id: string }) => [e.id, e]));
    expect(byId.pl_open).toMatchObject({ trip_status: 'open', on_trip: true, shopped: false });
    expect(byId.pl_shut).toMatchObject({ trip_status: 'closed', on_trip: true, shopped: true });
    expect(getPlan(api).not_on_trip).toBe(0);
  });

  it('not_on_trip counts recipe meals after today, within the 8 days, on no trip', () => {
    const api = seeded();
    api.ok('createTrip', { payload: { id: 'tr_1' } });
    plan(api, { date: TODAY, slot: 'Dinner', recipe_id: 'rc_soup' }); // today: not counted
    plan(api, { date: '2026-11-01', slot: 'Dinner', recipe_id: 'rc_soup' }); // yesterday
    plan(api, { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' }); // counted
    plan(api, { date: '2026-11-09', slot: 'Lunch', recipe_id: 'rc_part' }); // today + 7: counted
    plan(api, { date: '2026-11-10', slot: 'Dinner', recipe_id: 'rc_soup' }); // today + 8: outside
    plan(api, { date: '2026-11-04', slot: 'Dinner', note: 'Eating out' }); // a note
    plan(api, { date: '2026-11-05', slot: 'Dinner', recipe_id: 'rc_soup', trip_id: 'tr_1' }); // on a trip
    expect(getPlan(api).not_on_trip).toBe(2);
    // Whatever range is read, the count is the 8 days'.
    expect(getPlan(api, { from: '2026-11-10', to: '2026-11-10' }).not_on_trip).toBe(2);
    expect(getPlan(api, { today: '2026-11-03' }).not_on_trip).toBe(2);
  });

  it('the beef stew fixture planned for Tuesday dinner reports kcal within 1 of #703\'s figure', () => {
    const api = loadApi();
    for (const food of STEW_FOODS) api.ok('upsertFood', { payload: food });
    api.ok('upsertRecipe', { payload: STEW_RECIPE });
    plan(api, { id: 'pl_tue', date: '2026-11-03', slot: 'Dinner', recipe_id: 'stew' });
    const [entry] = getPlan(api, { from: '2026-11-03', to: '2026-11-03' }).entries;
    expect(entry).toMatchObject({ id: 'pl_tue', recipe_name: 'Beef Stew', servings: 6, partial: false });
    expect(Math.abs(entry.kcal_serving - PROTOTYPE_KCAL_PER_SERVING)).toBeLessThanOrEqual(1);
  });

  it('writes answer with the entry in the same shape', () => {
    const api = seeded();
    const saved = plan(api, { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    expect(saved).toEqual(getPlan(api).entries[0]);
  });
});

describe('movePlanEntry', () => {
  it('changes the date and slot and keeps the rest', () => {
    const api = seeded();
    const saved = plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    const moved = api.ok('movePlanEntry', { payload: { id: 'pl_1', date: '2026-11-05', slot: 'Lunch' } });
    expect(moved).toMatchObject({ id: 'pl_1', date: '2026-11-05', slot: 'Lunch', recipe_id: 'rc_soup', created: saved.created });
    expect(api.rows('Plan')).toHaveLength(1);
  });

  it('changes a note meal\'s text', () => {
    const api = seeded();
    plan(api, { id: 'pl_n', date: '2026-11-03', slot: 'Dinner', note: 'Eating out' });
    expect(api.ok('movePlanEntry', { payload: { id: 'pl_n', note: '  Leftovers ' } }).note).toBe('Leftovers');
  });

  it('refuses an unknown id by name, and writes nothing', () => {
    const api = seeded();
    const res = api.call('movePlanEntry', { payload: { id: 'pl_nope', date: '2026-11-05' } });
    expect(res).toMatchObject({ success: false, error: 'Plan entry "pl_nope" not found', code: 'not_found' });
    expect(api.rows('Plan')).toEqual([]);
  });

  it('refuses a note on a recipe meal', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    expect(api.call('movePlanEntry', { payload: { id: 'pl_1', note: 'Eating out' } }).error).toBe(
      'a plan entry has exactly one of recipe_id and note',
    );
  });
});

describe('deletePlanEntry', () => {
  it('answers the entry as it was', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    expect(api.ok('deletePlanEntry', { payload: { id: 'pl_1' } })).toMatchObject({
      id: 'pl_1',
      deleted: true,
      recipe_name: 'Beef soup',
      on_trip: false,
    });
    expect(api.call('deletePlanEntry', { payload: { id: 'pl_1' } })).toMatchObject({ code: 'not_found' });
  });
});

describe('plan writes never touch Trips, TripItems or Cooks', () => {
  it('moving and removing a meal on a trip, with a cook, leaves those rows as they were', () => {
    const api = seeded();
    api.ok('createTrip', { payload: { id: 'tr_1', through: '2026-11-08' } });
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', trip_id: 'tr_1' });
    api.ok('upsertTripItems', {
      payload: { trip_id: 'tr_1', items: [{ food_id: 'beef', lines: [{ plan_id: 'pl_1', line_id: 'L1', amt: '1 lb', grams: 453.6 }] }] },
    });
    api.ok('upsertCook', { payload: { id: 'ck_1', recipe_id: 'rc_soup', date: '2026-11-03', plan_id: 'pl_1' } });
    const snapshot = () => JSON.stringify(['Trips', 'TripItems', 'Cooks'].map((t) => api.rows(t)));
    const before = snapshot();

    api.ok('movePlanEntry', { payload: { id: 'pl_1', date: '2026-11-06', slot: 'Lunch' } });
    expect(snapshot()).toBe(before);
    expect(getPlan(api).entries[0]).toMatchObject({ trip_id: 'tr_1', on_trip: true });
    api.ok('deletePlanEntry', { payload: { id: 'pl_1' } });
    expect(snapshot()).toBe(before);
    expect(api.rows('Plan')).toEqual([]);
  });
});

describe('the id-less duplicate check', () => {
  it('a create without an id for a planned date, slot and recipe answers duplicate_of and writes nothing', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    const res = api.call('upsertPlanEntry', { payload: { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' } });
    expect(res).toMatchObject({ success: false, code: 'duplicate', written: false, duplicate_of: { id: 'pl_1', recipe_name: 'Beef soup' } });
    expect(api.rows('Plan')).toHaveLength(1);
  });

  it('allow_duplicate writes, and another slot or day is not a duplicate', () => {
    const api = seeded();
    plan(api, { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    plan(api, { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', allow_duplicate: true });
    plan(api, { date: '2026-11-03', slot: 'Lunch', recipe_id: 'rc_soup' });
    plan(api, { date: '2026-11-04', slot: 'Dinner', recipe_id: 'rc_soup' });
    expect(api.rows('Plan')).toHaveLength(4);
  });

  it('an id sent twice leaves one row; notes are never duplicates', () => {
    const api = seeded();
    plan(api, { id: 'pl_x', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    plan(api, { id: 'pl_x', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    plan(api, { date: '2026-11-03', slot: 'Lunch', note: 'Leftovers' });
    plan(api, { date: '2026-11-03', slot: 'Lunch', note: 'Leftovers' });
    expect(api.rows('Plan')).toHaveLength(3);
  });
});

describe('fixed-text refusals', () => {
  const cases: [string, object, string][] = [
    ['an invalid date', { date: '2026-02-30', slot: 'Dinner', note: 'x' }, 'date must be a real date as YYYY-MM-DD'],
    ['a date in another shape', { date: '11/03/2026', slot: 'Dinner', note: 'x' }, 'date must be a real date as YYYY-MM-DD'],
    ['an unknown slot', { date: '2026-11-03', slot: 'Brunch', note: 'x' }, 'slot must be one of Breakfast, Lunch, Dinner, Snacks'],
    ['a blank note', { date: '2026-11-03', slot: 'Dinner', note: '   ' }, 'note must be 1 to 120 characters'],
    ['an over-long note', { date: '2026-11-03', slot: 'Dinner', note: 'x'.repeat(121) }, 'note must be 1 to 120 characters'],
    ['both', { date: '2026-11-03', slot: 'Dinner', note: 'x', recipe_id: 'rc_soup' }, 'a plan entry has exactly one of recipe_id and note'],
    ['neither', { date: '2026-11-03', slot: 'Dinner' }, 'a plan entry has exactly one of recipe_id and note'],
    ['an unknown recipe', { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_nope' }, 'recipe_id "rc_nope" is not a recipe'],
  ];
  it.each(cases)('upsertPlanEntry refuses %s', (_name, payload, error) => {
    const api = seeded();
    expect(api.call('upsertPlanEntry', { payload }).error).toBe(error);
    expect(api.rows('Plan')).toEqual([]);
  });

  it('a 120-character note is kept, trimmed', () => {
    const api = seeded();
    expect(plan(api, { date: '2026-11-03', slot: 'Dinner', note: ` ${'x'.repeat(120)} ` }).note).toHaveLength(120);
  });

  it('movePlanEntry refuses the same', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', note: 'Out' });
    expect(api.call('movePlanEntry', { payload: { id: 'pl_1', date: '2026-02-30' } }).error).toBe(PLAN_DATE);
    expect(api.call('movePlanEntry', { payload: { id: 'pl_1', slot: 'Tea' } }).error).toMatch(/^slot must be one of/);
    expect(api.call('movePlanEntry', { payload: { id: 'pl_1', note: '' } }).error).toBe(
      'a plan entry has exactly one of recipe_id and note',
    );
  });
});

const PLAN_DATE = 'date must be a real date as YYYY-MM-DD';

describe('planWeek', () => {
  const week = [
    { date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' },
    { date: '2026-11-04', slot: 'Dinner', note: 'Eating out' },
    { date: '2026-11-05', slot: 'Lunch', recipe_id: 'rc_part' },
  ];

  it('is a dry run by default: the preview with calories, nothing written', () => {
    const api = seeded();
    const out = api.ok('planWeek', { payload: { entries: week } });
    expect(out).toMatchObject({ dry_run: true, planned: 3, skipped: 0 });
    expect(out.entries.map((e: { recipe_name: string; skipped: boolean }) => [e.recipe_name, e.skipped])).toEqual([
      ['Beef soup', false],
      ['', false],
      ['Mystery stew', false],
    ]);
    expect(out.entries[2].partial).toBe(true);
    expect(api.rows('Plan')).toEqual([]);
    expect(api.rows('MCPChangeLog').filter((r) => r[2] === 'planWeek')).toEqual([]);
  });

  it('dry_run false writes them together, in one append, logged under the call', () => {
    const api = seeded();
    const out = api.ok('planWeek', { payload: { entries: week, dry_run: false, call_id: 'wk-1' } });
    expect(out).toMatchObject({ dry_run: false, planned: 3, skipped: 0 });
    expect(getPlan(api).entries.map((e: { id: string }) => e.id).sort()).toEqual(
      out.entries.map((e: { id: string }) => e.id).sort(),
    );
    expect(api.rows('MCPChangeLog').filter((r) => r[1] === 'wk-1')).toHaveLength(3);
  });

  it('skips an id-less meal already planned, or repeated in the call, unless allow_duplicate', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup' });
    const twice = [...week, { date: '2026-11-05', slot: 'Lunch', recipe_id: 'rc_part' }];
    const out = api.ok('planWeek', { payload: { entries: twice, dry_run: false } });
    expect(out).toMatchObject({ planned: 2, skipped: 2 });
    expect(out.entries.map((e: { duplicate_of: string }) => e.duplicate_of)).toEqual(['pl_1', '', '', out.entries[2].id]);
    expect(api.rows('Plan')).toHaveLength(3);
    api.ok('planWeek', { payload: { entries: week, dry_run: false, allow_duplicate: true } });
    expect(api.rows('Plan')).toHaveLength(6);
  });

  it('with one invalid entry writes none and names which, every one that failed', () => {
    const api = seeded();
    const bad = [...week, { date: '2026-02-30', slot: 'Dinner', note: 'x' }, { date: '2026-11-06', slot: 'Tea', note: 'y' }];
    const res = api.call('planWeek', { payload: { entries: bad, dry_run: false } });
    expect(res).toMatchObject({ success: false, code: 'invalid_entries' });
    expect((res as unknown as { problems: unknown }).problems).toEqual([
      { entry: 4, date: '2026-02-30', error: PLAN_DATE },
      { entry: 5, date: '2026-11-06', error: 'slot must be one of Breakfast, Lunch, Dinner, Snacks' },
    ]);
    expect(res.error).toBe(
      `Nothing saved: entry 4 (2026-02-30): ${PLAN_DATE}; entry 5 (2026-11-06): slot must be one of Breakfast, Lunch, Dinner, Snacks`,
    );
    expect(api.rows('Plan')).toEqual([]);
  });

  it('refuses more than 28 entries, and none', () => {
    const api = seeded();
    const many = Array.from({ length: 29 }, (_, i) => ({ date: '2026-11-03', slot: 'Snacks', note: `n${i}` }));
    expect(api.call('planWeek', { payload: { entries: many, dry_run: false } }).error).toBe(
      '29 entries is over the limit of 28',
    );
    expect(api.call('planWeek', { payload: { entries: [] } }).error).toBe('entries must be a list of 1 to 28');
    expect(api.rows('Plan')).toEqual([]);
    expect(api.ok('planWeek', { payload: { entries: many.slice(0, 28), dry_run: false } }).planned).toBe(28);
  });

  it('an entry with an id is kept, so a retried week leaves one row each', () => {
    const api = seeded();
    const ids = week.map((e, i) => ({ ...e, id: `pl_w${i}` }));
    api.ok('planWeek', { payload: { entries: ids, dry_run: false } });
    api.ok('planWeek', { payload: { entries: ids, dry_run: false } });
    expect(api.rows('Plan')).toHaveLength(3);
  });
});

describe('undo reverses each plan write, and keeps a meal that joined a trip', () => {
  const undo = (api: Api, callId: string) => api.call('undoCall', { payload: { call_id: callId, confirm: true } });

  it('upsertPlanEntry, movePlanEntry, deletePlanEntry and planWeek are each undone', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', call_id: 'c-add' });
    api.ok('movePlanEntry', { payload: { id: 'pl_1', date: '2026-11-04', call_id: 'c-move' } });
    expect(undo(api, 'c-move').success).toBe(true);
    expect(getPlan(api).entries[0].date).toBe('2026-11-03');
    api.ok('deletePlanEntry', { payload: { id: 'pl_1', call_id: 'c-del' } });
    expect(undo(api, 'c-del').success).toBe(true);
    expect(getPlan(api).entries.map((e: { id: string }) => e.id)).toEqual(['pl_1']);
    api.ok('planWeek', { payload: { entries: [{ date: '2026-11-05', slot: 'Lunch', note: 'Out' }], dry_run: false, call_id: 'c-wk' } });
    expect(api.rows('Plan')).toHaveLength(2);
    expect(undo(api, 'c-wk').success).toBe(true);
    expect(api.rows('Plan')).toHaveLength(1);
    // The two undos put back exactly the row the add left, so the add undoes too.
    expect(undo(api, 'c-add').success).toBe(true);
    expect(api.rows('Plan')).toEqual([]);
  });

  it('an added meal undone straight away is removed', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', call_id: 'c-add' });
    expect(undo(api, 'c-add').success).toBe(true);
    expect(api.rows('Plan')).toEqual([]);
  });

  it('refuses to remove a meal that has since joined a trip, naming it', () => {
    const api = seeded();
    plan(api, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', call_id: 'c-add' });
    api.ok('createTrip', { payload: { id: 'tr_1' } });
    api.ok('upsertTripItems', {
      payload: { trip_id: 'tr_1', items: [{ food_id: 'beef', lines: [{ plan_id: 'pl_1', line_id: 'L1', amt: '1 lb', grams: 453.6 }] }] },
    });
    const res = undo(api, 'c-add');
    expect(res).toMatchObject({ success: false, code: 'undo_refused' });
    expect(res.data.uses).toEqual([expect.objectContaining({ tab: 'Plan', id: 'pl_1', name: '2026-11-03 Dinner', by: 'TripItems' })]);
    expect(api.rows('Plan')).toHaveLength(1);

    // A trip_id written onto the row is a change since the call, and refuses it too.
    const api2 = seeded();
    plan(api2, { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: 'rc_soup', call_id: 'c-add' });
    api2.ok('createTrip', { payload: { id: 'tr_1' } });
    plan(api2, { id: 'pl_1', trip_id: 'tr_1' });
    const res2 = undo(api2, 'c-add');
    expect(res2.data.conflicts[0]).toMatchObject({ tab: 'Plan', row_key: { id: 'pl_1' } });
    expect(api2.rows('Plan')).toHaveLength(1);
  });
});
