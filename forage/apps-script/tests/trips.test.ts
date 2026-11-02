// #718: shopping trips A. Building a trip from the plan (combining foods, the
// need, unmatched lines, eligibility, dry run, idempotent id), the default
// choices and the store memory, stale lines, close and discard, the removed
// row-level actions, and undo of each write.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const TODAY = '2026-11-02'; // a Monday
const WED = '2026-11-04';
const FRI = '2026-11-06';

const FOODS = [
  {
    id: 'fd_onion', name: 'Yellow onion', category: 'Produce', servings_json: [{ name: 'medium', g: 110 }],
    buy_unit: 'onion', buy_unit_plural: 'onions', buy_unit_g: 110, usual_store: 'costco',
  },
  { id: 'fd_oil', name: 'Olive oil', category: 'Pantry', servings_json: [{ name: 'tbsp', g: 13.5 }], usually_have: true },
  {
    id: 'fd_beans', name: 'Kidney beans', category: 'Pantry', buy_unit: 'can', buy_unit_plural: 'cans', buy_unit_g: 425,
  },
  { id: 'fd_mince', name: 'Ground beef', category: 'Meat' },
  { id: 'fd_chuck', name: 'Beef chuck', category: 'Meat' },
  { id: 'fd_cumin', name: 'Cumin' },
  { id: 'fd_water', name: 'Water', never_shop: true },
];

const CHILI = {
  id: 'rc_chili',
  name: 'Weeknight chili',
  servings: 4,
  lines: [
    { text: '2 onions, diced', qty: 2, unit: '', food_id: 'fd_onion' },
    { text: '2 tbsp olive oil', qty: 2, unit: 'tbsp', food_id: 'fd_oil' },
    { text: '2 cans kidney beans', qty: 2, unit: 'can', food_id: 'fd_beans' },
    { text: '1 lb ground beef', qty: 1, unit: 'lb', food_id: 'fd_mince' },
    { text: '1 tsp cumin', qty: 1, unit: 'tsp', food_id: 'fd_cumin', optional: true },
    { text: '2 cups water', qty: 2, unit: 'cup', food_id: 'fd_water' },
  ],
};

const STEW = {
  id: 'rc_stew',
  name: 'Beef Stew',
  servings: 6,
  lines: [
    { text: '2 lb beef chuck, cubed', qty: 2, unit: 'lb', food_id: 'fd_chuck' },
    { text: '1 medium onion, chopped', qty: 1, unit: 'medium', food_id: 'fd_onion' },
    { text: '1 tbsp olive oil', qty: 1, unit: 'tbsp', food_id: 'fd_oil' },
    { text: '1 handful kidney beans', qty: 1, unit: 'handful', food_id: 'fd_beans' },
    { text: '1 bay leaf', food_id: '' },
  ],
};

/**
 * The fixture plan: chili Wednesday and stew Friday dinner, both using the
 * onion; a note; chili today; and stew tomorrow, already on a closed trip.
 */
function fixture(): Api {
  const api = loadApi();
  for (const food of FOODS) api.ok('upsertFood', { payload: food });
  api.ok('upsertRecipe', { payload: CHILI });
  api.ok('upsertRecipe', { payload: STEW });
  const plan = (p: object) => api.ok('upsertPlanEntry', { payload: p });
  plan({ id: 'pl_old', date: '2026-11-03', slot: 'Lunch', recipe_id: 'rc_stew' });
  api.ok('startTrip', { payload: { id: 'tr_old', through: '2026-11-03', today: TODAY } });
  api.ok('closeTrip', { payload: { trip_id: 'tr_old' } });
  plan({ id: 'pl_wed', date: WED, slot: 'Dinner', recipe_id: 'rc_chili' });
  plan({ id: 'pl_fri', date: FRI, slot: 'Dinner', recipe_id: 'rc_stew' });
  plan({ id: 'pl_note', date: '2026-11-05', slot: 'Lunch', note: 'Eating out' });
  plan({ id: 'pl_today', date: TODAY, slot: 'Dinner', recipe_id: 'rc_chili' });
  return api;
}

const start = (api: Api, payload: object = {}) =>
  api.ok('startTrip', { payload: { id: 'tr_1', through: FRI, today: TODAY, ...payload } });
const byFood = (trip: { items: { food_id: string }[] }) => Object.fromEntries(trip.items.map((i) => [i.food_id, i]));
/** The three tabs a trip writes, each row as text and sorted, since an undo may put a row back in another place. */
const tripRows = (api: Api) =>
  JSON.stringify(['Trips', 'TripItems', 'Plan'].map((t) => api.rows(t).map((r) => JSON.stringify(r)).sort()));

describe('building', () => {
  it('both meals make one onion item with two lines, its need combining both meals into about N onions', () => {
    const api = fixture();
    const { trip, written } = start(api);
    expect(written).toBe(true);
    expect(trip.meals.map((m: { plan_id: string }) => m.plan_id)).toEqual(['pl_wed', 'pl_fri']);
    const onion = byFood(trip).fd_onion;
    // 220 g + 110 g = 3 onions of 110 g; 3 − 0.15 rounds up to 3.
    expect(onion).toMatchObject({ name: 'Yellow onion', category: 'Produce', need: 'about 3 onions', mine: false, buy: '' });
    expect(onion.lines).toEqual([
      { plan_id: 'pl_wed', date: WED, slot: 'Dinner', recipe_name: 'Weeknight chili', line_id: 'L1', text: '2 onions, diced', amt: '2' },
      { plan_id: 'pl_fri', date: FRI, slot: 'Dinner', recipe_name: 'Beef Stew', line_id: 'L2', text: '1 medium onion, chopped', amt: '1 medium' },
    ]);
    expect(api.rows('TripItems').filter((r) => r[0] === 'tr_1')).toHaveLength(5);
    const stored = JSON.parse(String(api.rows('TripItems').find((r) => r[0] === 'tr_1' && r[1] === 'fd_onion')![2]));
    expect(stored).toEqual([
      { plan_id: 'pl_wed', line_id: 'L1', amt: '2', grams: 220 },
      { plan_id: 'pl_fri', line_id: 'L2', amt: '1 medium', grams: 110 },
    ]);
  });

  it('pins the − 0.15 edge: 1.15 units is "about 1 onion", 1.16 is "about 2 onions"', () => {
    for (const [grams, need] of [
      [115, 'about 1 onion'],
      [116, 'about 2 onions'],
      [50, 'about 1 onion'],
    ] as const) {
      const api = loadApi();
      api.ok('upsertFood', { payload: { id: 'fd_o', name: 'Onion', buy_unit: 'onion', buy_unit_plural: 'onions', buy_unit_g: 100 } });
      api.ok('upsertRecipe', { payload: { id: 'rc_1', name: 'Soup', servings: 2, lines: [{ text: 'onion', food_id: 'fd_o', grams }] } });
      api.ok('upsertPlanEntry', { payload: { id: 'pl_1', date: WED, slot: 'Dinner', recipe_id: 'rc_1' } });
      expect(start(api).trip.items[0].need, `${grams} g`).toBe(need);
    }
  });

  it('a food with no buy_unit_g joins its amounts; one with a unit and a gramless line adds it after', () => {
    const items = byFood(start(fixture()).trip);
    expect(items.fd_oil.need).toBe('2 tbsp + 1 tbsp');
    expect(items.fd_beans.need).toBe('about 2 cans + 1 handful');
    expect(items.fd_chuck.need).toBe('2 lb');
  });

  it('optional lines and never_shop foods make no item; an unmatched line is listed with its text and recipe', () => {
    const { trip } = start(fixture());
    expect(Object.keys(byFood(trip)).sort()).toEqual(['fd_beans', 'fd_chuck', 'fd_mince', 'fd_oil', 'fd_onion']);
    expect(trip.unmatched).toEqual([{ plan_id: 'pl_fri', recipe_name: 'Beef Stew', line_id: 'L5', text: '1 bay leaf' }]);
  });

  it('orders items by category, blank last, then name; counts them', () => {
    const api = fixture();
    api.ok('upsertFood', { payload: { id: 'fd_chuck', category: '' } });
    const { trip } = start(api);
    expect(trip.items.map((i: { name: string }) => i.name)).toEqual([
      'Ground beef', 'Kidney beans', 'Olive oil', 'Yellow onion', 'Beef chuck',
    ]);
    expect(trip.counts).toEqual({ all: 5, todo: 3, have: 1, ks: 0, costco: 1, other: 0, to_buy: 1, bought: 0 });
  });

  it('the note, today\'s meal and the meal on the closed trip are refused, each named, and nothing is written', () => {
    const api = fixture();
    const before = tripRows(api);
    const res = api.call('startTrip', {
      payload: { through: FRI, today: TODAY, plan_ids: ['pl_wed', 'pl_note', 'pl_today', 'pl_old', 'pl_nope'] },
    });
    expect(res).toMatchObject({ success: false, code: 'ineligible' });
    expect((res as { problems: unknown[] }).problems).toEqual([
      { plan_id: 'pl_note', error: 'pl_note is a note, not a recipe meal.' },
      { plan_id: 'pl_today', error: 'pl_today is dated 2026-11-02, today or earlier.' },
      { plan_id: 'pl_old', error: 'pl_old is already on trip tr_old.' },
      { plan_id: 'pl_nope', error: 'pl_nope is not in the plan.' },
    ]);
    expect(res.error).toBe(
      'pl_note is a note, not a recipe meal. pl_today is dated 2026-11-02, today or earlier. ' +
        'pl_old is already on trip tr_old. pl_nope is not in the plan.',
    );
    const late = api.call('startTrip', { payload: { through: WED, today: TODAY, plan_ids: ['pl_fri'] } });
    expect(late.error).toBe('pl_fri is dated 2026-11-06, after Wed 2026-11-04.');
    expect(tripRows(api)).toBe(before);
  });

  it('a second startTrip while one is open is refused naming the open trip', () => {
    const api = fixture();
    start(api);
    const before = tripRows(api);
    const res = api.call('startTrip', { payload: { through: FRI, today: TODAY, plan_ids: [] } });
    expect(res).toMatchObject({
      success: false,
      code: 'trip_open',
      error: 'A trip is already open (tr_1). Close it or throw it away first.',
    });
    expect(tripRows(api)).toBe(before);
  });

  it('plan_ids: [] makes an open trip with no meals and no items', () => {
    const api = fixture();
    const { trip } = start(api, { plan_ids: [] });
    expect(trip).toMatchObject({ id: 'tr_1', status: 'open', meals: [], items: [], unmatched: [] });
    expect(trip.counts.all).toBe(0);
    expect(api.rows('Plan').filter((r) => r[5] === 'tr_1')).toEqual([]);
  });

  it('dry_run: true answers the items, counts and unmatched, and writes no Trips, TripItems or Plan row', () => {
    const api = fixture();
    const before = tripRows(api);
    const preview = start(api, { dry_run: true });
    expect(preview).toMatchObject({ written: false, dry_run: true, trip: { id: 'tr_1', status: 'open' } });
    expect(preview.trip.items).toHaveLength(5);
    expect(preview.trip.counts.all).toBe(5);
    expect(preview.trip.unmatched).toHaveLength(1);
    expect(preview.trip.meals).toHaveLength(2);
    expect(tripRows(api)).toBe(before);
    // A key caller's dry run is not logged either.
    expect(api.rows('MCPChangeLog').filter((r) => r[2] === 'startTrip' && r[3] === 'Trips' && String(r[6]).includes('tr_1'))).toEqual([]);
  });

  it('a repeat with the same id answers the existing trip with written: false and writes nothing', () => {
    const api = fixture();
    const first = start(api);
    const before = tripRows(api);
    const again = start(api, { plan_ids: [] });
    expect(again.written).toBe(false);
    expect(again.trip).toEqual(first.trip);
    expect(tripRows(api)).toBe(before);
  });

  it("after startTrip each chosen meal's getPlan row has the trip's id and reads On list", () => {
    const api = fixture();
    start(api);
    const entries = api.ok('getPlan', { today: TODAY }).entries;
    const row = (id: string) => entries.find((e: { id: string }) => e.id === id);
    expect(row('pl_wed')).toMatchObject({ trip_id: 'tr_1', on_trip: true, shopped: false, trip_status: 'open' });
    expect(row('pl_fri')).toMatchObject({ trip_id: 'tr_1', on_trip: true, shopped: false });
    expect(row('pl_today')).toMatchObject({ trip_id: '', on_trip: false });
  });
});

describe('defaults and choices', () => {
  it('usually_have starts have, a usual store starts there, both suggested; neither starts unsorted', () => {
    const items = byFood(start(fixture()).trip);
    expect(items.fd_oil).toMatchObject({ choice: 'have', suggested: true });
    expect(items.fd_onion).toMatchObject({ choice: 'costco', suggested: true });
    expect(items.fd_chuck).toMatchObject({ choice: '', suggested: false });
  });

  it('a store that differs from usual_store is stored, unsuggested, remembered on the food, and suggested next trip', () => {
    const api = fixture();
    start(api);
    const res = api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'ks' } });
    expect(res).toMatchObject({ remembered: true, item: { food_id: 'fd_onion', choice: 'ks', suggested: false } });
    expect(api.ok('getFood', { id: 'fd_onion' }).usual_store).toBe('ks');
    api.ok('discardTrip', { payload: {} });
    expect(byFood(start(api).trip).fd_onion).toMatchObject({ choice: 'ks', suggested: true });
  });

  it('have never changes the food; a store equal to usual_store answers no remembered', () => {
    const api = fixture();
    start(api);
    const food = () => api.rows('Foods').find((r) => r[0] === 'fd_onion');
    const before = JSON.stringify(food());
    const have = api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'have' } });
    expect(have).toEqual({ item: expect.objectContaining({ choice: 'have', suggested: false }) });
    expect(JSON.stringify(food())).toBe(before);
    const same = api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'costco' } });
    expect(same.remembered).toBeUndefined();
    expect(JSON.stringify(food())).toBe(before);
  });

  it('bought on an unsorted or Have it item is refused; changing a bought item to have clears bought', () => {
    const api = fixture();
    start(api);
    expect(api.call('setTripItem', { payload: { food_id: 'fd_chuck', bought: true } })).toMatchObject({
      success: false,
      code: 'no_store',
      error: 'Only an item with a store can be bought.',
    });
    expect(api.call('setTripItem', { payload: { food_id: 'fd_oil', bought: true } }).code).toBe('no_store');
    expect(api.ok('setTripItem', { payload: { food_id: 'fd_onion', bought: true } }).item.bought).toBe(true);
    expect(api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'have' } }).item).toMatchObject({
      choice: 'have',
      bought: false,
    });
    expect(api.ok('getTrip').trip.counts).toMatchObject({ bought: 0, have: 2 });
  });

  it('a closed trip, or a food not on the trip, is refused with fixed text and writes nothing', () => {
    const api = fixture();
    start(api);
    const before = JSON.stringify(['TripItems', 'Foods'].map((t) => api.rows(t)));
    expect(api.call('setTripItem', { payload: { food_id: 'fd_cumin', choice: 'ks' } })).toMatchObject({
      success: false,
      code: 'not_on_trip',
      error: "Cumin isn't on trip tr_1.",
    });
    expect(api.call('setTripItem', { payload: { trip_id: 'tr_old', food_id: 'fd_onion', choice: 'ks' } })).toMatchObject({
      success: false,
      code: 'trip_closed',
      error: 'Trip tr_old is closed.',
    });
    expect(JSON.stringify(['TripItems', 'Foods'].map((t) => api.rows(t)))).toBe(before);
  });
});

describe('stale lines', () => {
  it("deleting Wednesday's meal drops its lines on the next read; an item only it used is deleted", () => {
    const api = fixture();
    start(api);
    api.ok('deletePlanEntry', { payload: { id: 'pl_wed' } });
    const items = byFood(api.ok('getTrip').trip);
    expect(items.fd_onion.lines.map((l: { plan_id: string }) => l.plan_id)).toEqual(['pl_fri']);
    expect(items.fd_onion.need).toBe('about 1 onion');
    expect(items.fd_mince).toBeUndefined();
    expect(api.rows('TripItems').some((r) => r[0] === 'tr_1' && r[1] === 'fd_mince')).toBe(false);
    // The drop is written, and is not change-logged.
    expect(api.rows('MCPChangeLog').filter((r) => r[2] === 'getTrip')).toEqual([]);
  });

  it("a meal moved to another day keeps its lines on the trip, with its new date", () => {
    const api = fixture();
    start(api);
    api.ok('movePlanEntry', { payload: { id: 'pl_fri', date: '2026-11-07' } });
    const onion = byFood(api.ok('getTrip').trip).fd_onion;
    expect(onion.lines.map((l: { plan_id: string; date: string }) => [l.plan_id, l.date])).toEqual([
      ['pl_wed', WED],
      ['pl_fri', '2026-11-07'],
    ]);
  });

  it("a closed trip's items are not pruned when its meals are later deleted", () => {
    const api = fixture();
    const before = api.rows('TripItems').filter((r) => r[0] === 'tr_old');
    expect(before.length).toBeGreaterThan(0);
    api.ok('deletePlanEntry', { payload: { id: 'pl_old' } });
    const trip = api.ok('getTrip', { id: 'tr_old' }).trip;
    expect(trip.items).toHaveLength(before.length);
    expect(trip.items[0].lines[0]).toMatchObject({ plan_id: 'pl_old', date: '', recipe_name: '', text: '' });
    expect(api.rows('TripItems').filter((r) => r[0] === 'tr_old')).toEqual(before);
  });

  it('a trip write prunes first, and the drop is not in its change log', () => {
    const api = fixture();
    start(api);
    api.ok('deletePlanEntry', { payload: { id: 'pl_wed' } });
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'ks', call_id: 'c-set' } });
    const logged = api.rows('MCPChangeLog').filter((r) => r[1] === 'c-set').map((r) => [r[3], JSON.parse(String(r[4]))]);
    expect(logged).toEqual([
      ['TripItems', { trip_id: 'tr_1', food_id: 'fd_onion' }],
      ['Foods', { id: 'fd_onion' }],
    ]);
  });
});

describe('close and discard', () => {
  it('closeTrip closes; its meals read Shopped; getTrip answers null; getTrips reports items, bought and stores', () => {
    const api = fixture();
    start(api);
    api.ok('setTripItem', { payload: { food_id: 'fd_chuck', choice: 'ks' } });
    api.ok('setTripItem', { payload: { food_id: 'fd_chuck', bought: true } });
    const { trip } = api.ok('closeTrip', { payload: {} });
    expect(trip).toMatchObject({ id: 'tr_1', status: 'closed' });
    expect(trip.closed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const entries = api.ok('getPlan', { today: TODAY }).entries;
    expect(entries.find((e: { id: string }) => e.id === 'pl_wed')).toMatchObject({ on_trip: true, shopped: true });
    expect(api.ok('getTrip')).toEqual({ trip: null });
    const [last] = api.ok('getTrips', { status: 'closed' });
    expect(last).toMatchObject({ id: 'tr_1', items: 5, bought: 1, stores: ['ks', 'costco'] });
    expect(api.call('closeTrip', { payload: { trip_id: 'tr_1' } }).code).toBe('trip_closed');
  });

  it("discardTrip deletes the trip and its items and clears its meals' trip_id; a closed trip is refused", () => {
    const api = fixture();
    start(api);
    const notOnTrip = () => api.ok('getPlan', { today: TODAY }).not_on_trip;
    expect(notOnTrip()).toBe(0);
    expect(api.ok('discardTrip', { payload: {} })).toEqual({ discarded: 'tr_1', meals_cleared: 2 });
    expect(api.rows('Trips').map((r) => r[0])).toEqual(['tr_old']);
    expect(api.rows('TripItems').some((r) => r[0] === 'tr_1')).toBe(false);
    expect(api.rows('Plan').filter((r) => r[0] === 'pl_wed' || r[0] === 'pl_fri').map((r) => r[5])).toEqual(['', '']);
    expect(notOnTrip()).toBe(2);
    expect(api.call('discardTrip', { payload: { trip_id: 'tr_old' } })).toMatchObject({
      success: false,
      code: 'trip_closed',
      error: 'Trip tr_old is closed; only an open trip can be thrown away.',
    });
    expect(api.call('discardTrip', { payload: {} })).toMatchObject({ code: 'no_open_trip', error: 'No shopping trip is open.' });
  });

  it("#703's row-level trip writes are no longer actions", () => {
    const api = fixture();
    for (const action of ['createTrip', 'updateTrip', 'upsertTripItems', 'deleteTripItem']) {
      expect(api.call(action, { payload: {} }).error).toBe(`Unknown action "${action}"`);
    }
    expect([...api.sandbox.TOKEN_ACTIONS]).toEqual(expect.arrayContaining(['startTrip', 'setTripItem', 'closeTrip', 'discardTrip']));
    expect(Object.keys(api.sandbox.CHANGE_LOGGED_ACTIONS)).toEqual(
      expect.arrayContaining(['startTrip', 'setTripItem', 'closeTrip', 'discardTrip']),
    );
  });
});

describe('undo (#713) reverses each trip write', () => {
  const undo = (api: Api, callId: string) => api.call('undoCall', { payload: { call_id: callId, confirm: true } });
  const tripIdOf = (api: Api, planId: string) => api.rows('Plan').find((r) => r[0] === planId)![5];

  it("a started trip is removed, with its items, and its meals' trip_id cleared", () => {
    const api = fixture();
    const before = tripRows(api);
    start(api, { call_id: 'c-start' });
    expect(tripIdOf(api, 'pl_wed')).toBe('tr_1');
    expect(undo(api, 'c-start').success).toBe(true);
    expect(tripRows(api)).toBe(before);
  });

  it("a choice and the food's usual_store are restored", () => {
    const api = fixture();
    start(api);
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'ks', call_id: 'c-set' } });
    expect(undo(api, 'c-set').success).toBe(true);
    expect(byFood(api.ok('getTrip').trip).fd_onion).toMatchObject({ choice: 'costco', suggested: true });
    expect(api.ok('getFood', { id: 'fd_onion' }).usual_store).toBe('costco');
  });

  it('a close reopens; refused, naming it, when another trip has been opened since', () => {
    const api = fixture();
    start(api);
    api.ok('closeTrip', { payload: { call_id: 'c-close' } });
    expect(undo(api, 'c-close').success).toBe(true);
    expect(api.ok('getTrip').trip).toMatchObject({ id: 'tr_1', status: 'open', closed_at: '' });

    api.ok('closeTrip', { payload: { call_id: 'c-close-2' } });
    api.ok('upsertPlanEntry', { payload: { id: 'pl_sat', date: '2026-11-07', slot: 'Dinner', recipe_id: 'rc_chili' } });
    api.ok('startTrip', { payload: { id: 'tr_2', through: '2026-11-08', today: TODAY } });
    const res = undo(api, 'c-close-2');
    expect(res).toMatchObject({ success: false, code: 'undo_refused' });
    expect(res.error).toBe(
      'Nothing undone: it would reopen a trip while trip tr_2 is open, and only one trip can be open at a time',
    );
    expect(api.ok('getTrip').trip.id).toBe('tr_2');
  });

  it("a discard restores the trip, its items and the trip_ids", () => {
    const api = fixture();
    start(api);
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'ks' } });
    const before = tripRows(api);
    api.ok('discardTrip', { payload: { call_id: 'c-discard' } });
    expect(undo(api, 'c-discard').success).toBe(true);
    expect(tripRows(api)).toBe(before);
    expect(api.ok('getTrip').trip.id).toBe('tr_1');
  });

  it('is refused, naming the rows, when they changed since; a stale-line prune counts', () => {
    const api = fixture();
    start(api, { call_id: 'c-start' });
    api.ok('deletePlanEntry', { payload: { id: 'pl_wed' } });
    api.ok('getTrip');
    const res = undo(api, 'c-start');
    expect(res).toMatchObject({ success: false, code: 'undo_refused' });
    expect((res as { data: { conflicts: { tab: string }[] } }).data.conflicts.map((c) => c.tab)).toContain('TripItems');
  });
});
