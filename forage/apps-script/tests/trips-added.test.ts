// #719: shopping trips B. Added items (by food, by free text, idempotent), the
// buying amount on setTripItem, removeTripItem, late meals on getTrip, getPlan
// and addToTrip, the last-buy write in closeTrip, and undo of each.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const TODAY = '2026-11-02'; // a Monday
const WED = '2026-11-04';
const THU = '2026-11-05';
const FRI = '2026-11-06';

const FOODS = [
  {
    id: 'fd_onion', name: 'Yellow onion', category: 'Produce', servings_json: [{ name: 'medium', g: 110 }],
    buy_unit: 'onion', buy_unit_plural: 'onions', buy_unit_g: 110, usual_store: 'costco',
  },
  { id: 'fd_oil', name: 'Olive oil', category: 'Pantry', usually_have: true },
  { id: 'fd_chuck', name: 'Beef chuck', category: 'Meat' },
  { id: 'fd_milk', name: 'Milk', regular: true, usual_store: 'ks', packs_json: ['1 gallon'], last_buy: '1 gallon' },
  {
    id: 'fd_eggs', name: 'Eggs', regular: true, usual_store: 'ks', usually_have: true,
    packs_json: ['18 pack', '12 pack'], last_buy: '18 pack', last_bought_on: '2026-10-20',
  },
  { id: 'fd_towels', name: 'Paper towels' },
  { id: 'fd_water', name: 'Water', never_shop: true },
];

const CHILI = {
  id: 'rc_chili',
  name: 'Weeknight chili',
  servings: 4,
  lines: [
    { text: '2 onions, diced', qty: 2, unit: '', food_id: 'fd_onion' },
    { text: '2 tbsp olive oil', qty: 2, unit: 'tbsp', food_id: 'fd_oil' },
    { text: '3 eggs', qty: 3, unit: '', food_id: 'fd_eggs' },
  ],
};

const STEW = {
  id: 'rc_stew',
  name: 'Beef Stew',
  servings: 6,
  lines: [
    { text: '2 lb beef chuck, cubed', qty: 2, unit: 'lb', food_id: 'fd_chuck' },
    { text: '1 medium onion, chopped', qty: 1, unit: 'medium', food_id: 'fd_onion' },
  ],
};

const TOAST = { id: 'rc_toast', name: 'Toast', servings: 1, lines: [{ text: 'water', food_id: 'fd_water' }] };

/** Chili Wednesday on the open trip tr_1 (through Friday); stew Thursday and a note planned after it was built. */
function fixture(): Api {
  const api = loadApi();
  for (const food of FOODS) api.ok('upsertFood', { payload: food });
  for (const r of [CHILI, STEW, TOAST]) api.ok('upsertRecipe', { payload: r });
  const plan = (p: object) => api.ok('upsertPlanEntry', { payload: p });
  plan({ id: 'pl_wed', date: WED, slot: 'Dinner', recipe_id: 'rc_chili' });
  api.ok('startTrip', { payload: { id: 'tr_1', through: FRI, today: TODAY } });
  plan({ id: 'pl_thu', date: THU, slot: 'Dinner', recipe_id: 'rc_stew' });
  plan({ id: 'pl_note', date: THU, slot: 'Lunch', note: 'Eating out' });
  return api;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the API's answer is untyped JSON
const byFood = (trip: { items: any[] }): Record<string, any> => Object.fromEntries(trip.items.map((i) => [i.food_id, i]));
const trip = (api: Api) => api.ok('getTrip', { today: TODAY }).trip;
const add = (api: Api, payload: object) => api.ok('addToTrip', { payload: { today: TODAY, ...payload } });
const food = (api: Api, id: string) => api.ok('getFood', { id });

describe('adding a food', () => {
  it('a regular goes on with its usual store (suggested) and last_buy; mine, no lines, no need', () => {
    const api = fixture();
    const out = add(api, { food_id: 'fd_milk' });
    expect(out.added).toEqual(['fd_milk']);
    expect(out.food).toEqual({ id: 'fd_milk', name: 'Milk', created: false, matched_existing: false });
    expect(byFood(out.trip).fd_milk).toMatchObject({
      choice: 'ks', suggested: true, buy: '1 gallon', mine: true, need: null, lines: [],
      packs: ['1 gallon'], last_buy: '1 gallon',
    });
  });

  it('a usually-have food added by hand is its usual store, never Have it; none at all is unsorted', () => {
    const api = fixture();
    add(api, { food_id: 'fd_towels' });
    const t = trip(api);
    expect(byFood(t).fd_towels).toMatchObject({ choice: '', suggested: false, buy: '' });
    // Eggs are on the list for the chili already; a fresh trip shows the hand-added rule.
    api.ok('discardTrip', { payload: {} });
    api.ok('startTrip', { payload: { id: 'tr_2', through: FRI, today: TODAY, plan_ids: [] } });
    expect(byFood(add(api, { food_id: 'fd_eggs' }).trip).fd_eggs).toMatchObject({ choice: 'ks', suggested: true });
  });

  it('a food already on the list changes nothing, and so does a repeat', () => {
    const api = fixture();
    const before = JSON.stringify(api.rows('TripItems'));
    expect(add(api, { food_id: 'fd_onion' })).toMatchObject({ added: [], joined: [], meals: [] });
    expect(JSON.stringify(api.rows('TripItems'))).toBe(before);
    add(api, { food_id: 'fd_milk' });
    add(api, { food_id: 'fd_milk' });
    expect(api.rows('TripItems').filter((r) => r[1] === 'fd_milk')).toHaveLength(1);
  });

  it('refuses an unknown food, a never-on-a-list food, no open trip, and a closed trip, each with fixed text', () => {
    const api = fixture();
    expect(api.call('addToTrip', { payload: { food_id: 'fd_nope' } })).toMatchObject({
      success: false, code: 'not_found', error: 'No such food: fd_nope',
    });
    expect(api.call('addToTrip', { payload: { food_id: 'fd_water' } })).toMatchObject({
      success: false, code: 'never_shop', error: 'Water is set to never go on a list. Change that on the food first.',
    });
    api.ok('closeTrip', { payload: {} });
    expect(api.call('addToTrip', { payload: { food_id: 'fd_milk' } })).toMatchObject({
      success: false, code: 'no_open_trip', error: 'No shopping trip is open.',
    });
    expect(api.call('addToTrip', { payload: { trip_id: 'tr_1', food_id: 'fd_milk' } })).toMatchObject({
      success: false, code: 'trip_closed', error: 'That trip is closed.',
    });
  });

  it('takes exactly one of food_id, text and late_meals', () => {
    const api = fixture();
    for (const payload of [{}, { food_id: 'fd_milk', text: 'milk' }, { text: 'x', late_meals: true }]) {
      expect(api.call('addToTrip', { payload })).toMatchObject({
        success: false, error: 'Give one of food_id, text or late_meals.',
      });
    }
  });
});

describe('adding free text', () => {
  it('creates one name-only food, in the library, on the list unsorted', () => {
    const api = fixture();
    const out = add(api, { text: '  dragon   fruit ' });
    expect(out.food).toMatchObject({ name: 'Dragon fruit', created: true, matched_existing: false });
    const made = food(api, out.food.id);
    expect(made).toMatchObject({ name: 'Dragon fruit', kind: 'ingredient', source: 'manual', category: '', kcal_100g: null });
    expect(api.ok('getFoods', { q: 'dragon' })).toHaveLength(1);
    expect(byFood(out.trip)[out.food.id]).toMatchObject({ choice: '', mine: true, need: null });
  });

  it('"milk", "Milk" and " milk " are one food: an existing one is reused and none created', () => {
    const api = fixture();
    const foods = api.rows('Foods').length;
    for (const text of ['milk', 'Milk', ' milk ']) {
      expect(add(api, { text }).food).toMatchObject({ id: 'fd_milk', created: false, matched_existing: true });
    }
    expect(api.rows('Foods')).toHaveLength(foods);
    expect(api.rows('TripItems').filter((r) => r[1] === 'fd_milk')).toHaveLength(1);
  });

  it('refuses an empty name, one over 80 characters, and a never-on-a-list match', () => {
    const api = fixture();
    for (const text of ['', '   ', 'x'.repeat(81)]) {
      expect(api.call('addToTrip', { payload: { text } })).toMatchObject({
        success: false, code: 'bad_name', error: 'Give the item a name of 1 to 80 characters.',
      });
    }
    expect(api.call('addToTrip', { payload: { text: 'water' } }).code).toBe('never_shop');
  });
});

describe('buying amounts', () => {
  it('setTripItem buy writes only the buying amount, trimmed; blank and spaces clear it', () => {
    const api = fixture();
    const before = byFood(trip(api)).fd_eggs;
    const { item } = api.ok('setTripItem', { payload: { food_id: 'fd_eggs', buy: ' 18 pack ' } });
    expect(item).toMatchObject({ buy: '18 pack', choice: before.choice, suggested: before.suggested, need: before.need });
    expect(food(api, 'fd_eggs').last_buy).toBe('18 pack');
    expect(api.ok('setTripItem', { payload: { food_id: 'fd_eggs', buy: '   ' } }).item.buy).toBe('');
  });

  it('refuses more than 60 characters, and a closed trip with "That trip is closed."', () => {
    const api = fixture();
    expect(api.call('setTripItem', { payload: { food_id: 'fd_eggs', buy: 'x'.repeat(61) } }).success).toBe(false);
    expect(api.ok('setTripItem', { payload: { food_id: 'fd_eggs', buy: 'x'.repeat(60) } }).item.buy).toHaveLength(60);
    api.ok('closeTrip', { payload: {} });
    expect(api.call('setTripItem', { payload: { trip_id: 'tr_1', food_id: 'fd_eggs', buy: '1' } })).toMatchObject({
      success: false, code: 'trip_closed', error: 'That trip is closed.',
    });
  });

  it('choosing Have it keeps the buying amount', () => {
    const api = fixture();
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', buy: '3 lb bag' } });
    expect(api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'have' } }).item.buy).toBe('3 lb bag');
  });
});

describe('removeTripItem', () => {
  it('removes an added item with no lines and keeps the food', () => {
    const api = fixture();
    add(api, { food_id: 'fd_towels' });
    const out = api.ok('removeTripItem', { payload: { food_id: 'fd_towels' } });
    expect(out).toMatchObject({ removed: 'fd_towels', name: 'Paper towels' });
    expect(byFood(out.trip).fd_towels).toBeUndefined();
    expect(food(api, 'fd_towels').name).toBe('Paper towels');
  });

  it('refuses an item with lines naming how many meals, one not on the list, and a closed trip', () => {
    const api = fixture();
    add(api, { late_meals: true });
    expect(api.call('removeTripItem', { payload: { food_id: 'fd_onion' } })).toMatchObject({
      success: false, code: 'has_meals', error: 'Yellow onion is on the list for 2 planned meals.',
    });
    expect(api.call('removeTripItem', { payload: { food_id: 'fd_towels' } })).toMatchObject({
      success: false, code: 'not_on_trip', error: "Paper towels isn't on the list.",
    });
    api.ok('closeTrip', { payload: {} });
    expect(api.call('removeTripItem', { payload: { trip_id: 'tr_1', food_id: 'fd_onion' } }).error).toBe(
      'That trip is closed.',
    );
  });
});

describe('stale lines and added items', () => {
  it('an item that loses all its lines stays when added by you and is deleted otherwise', () => {
    const api = fixture();
    add(api, { food_id: 'fd_milk' });
    api.ok('deletePlanEntry', { payload: { id: 'pl_wed' } });
    const items = byFood(trip(api));
    expect(items.fd_onion).toBeUndefined();
    expect(items.fd_eggs).toBeUndefined();
    expect(items.fd_milk).toMatchObject({ mine: true, lines: [] });
  });

  it('an added item a late meal then joins keeps mine, and stays when that meal goes', () => {
    const api = fixture();
    add(api, { food_id: 'fd_chuck' });
    add(api, { late_meals: true });
    expect(byFood(trip(api)).fd_chuck).toMatchObject({ mine: true });
    expect(byFood(trip(api)).fd_chuck.lines).toHaveLength(1);
    api.ok('deletePlanEntry', { payload: { id: 'pl_thu' } });
    expect(byFood(trip(api)).fd_chuck).toMatchObject({ mine: true, lines: [] });
  });
});

describe('late meals', () => {
  it('getTrip and getPlan list recipe meals after today through `through` with no trip, by date then slot', () => {
    const api = fixture();
    api.ok('upsertPlanEntry', { payload: { id: 'pl_thu_l', date: THU, slot: 'Breakfast', recipe_id: 'rc_chili' } });
    api.ok('upsertPlanEntry', { payload: { id: 'pl_sat', date: '2026-11-07', slot: 'Dinner', recipe_id: 'rc_chili' } });
    api.ok('upsertPlanEntry', { payload: { id: 'pl_today', date: TODAY, slot: 'Dinner', recipe_id: 'rc_chili' } });
    const expected = [
      { plan_id: 'pl_thu_l', recipe_name: 'Weeknight chili', date: THU, slot: 'Breakfast' },
      { plan_id: 'pl_thu', recipe_name: 'Beef Stew', date: THU, slot: 'Dinner' },
    ];
    expect(trip(api).late_meals).toEqual(expected);
    expect(api.ok('getPlan', { today: TODAY }).late_meals).toEqual(expected);
  });

  it('none for a closed trip, and getPlan has none with no trip open', () => {
    const api = fixture();
    const closed = api.ok('closeTrip', { payload: {} }).trip;
    expect(closed.late_meals).toEqual([]);
    expect(api.ok('getTrip', { id: 'tr_1', today: TODAY }).trip.late_meals).toEqual([]);
    expect(api.ok('getPlan', { today: TODAY }).late_meals).toEqual([]);
  });

  it('adding them sets trip_id, adds new items with the defaults, and grows items already there keeping choice and tick', () => {
    const api = fixture();
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', choice: 'ks' } });
    api.ok('setTripItem', { payload: { food_id: 'fd_onion', bought: true } });
    const out = add(api, { late_meals: true });
    expect(out).toMatchObject({ added: ['fd_chuck'], joined: ['fd_onion'], meals: ['pl_thu'] });
    const items = byFood(out.trip);
    expect(items.fd_onion).toMatchObject({ choice: 'ks', bought: true, need: 'about 3 onions' });
    expect(items.fd_onion.lines.map((l: { plan_id: string }) => l.plan_id)).toEqual(['pl_wed', 'pl_thu']);
    expect(items.fd_chuck).toMatchObject({ choice: '', mine: false });
    expect(out.trip.late_meals).toEqual([]);
    const thu = api.ok('getPlan', { today: TODAY }).entries.find((e: { id: string }) => e.id === 'pl_thu');
    expect(thu).toMatchObject({ trip_id: 'tr_1', on_trip: true, shopped: false });
  });

  it('twice adds nothing the second time; a meal needing nothing new still joins', () => {
    const api = fixture();
    add(api, { late_meals: true });
    const rows = JSON.stringify(api.rows('TripItems'));
    expect(add(api, { late_meals: true })).toMatchObject({ added: [], joined: [], meals: [] });
    expect(JSON.stringify(api.rows('TripItems'))).toBe(rows);
    api.ok('upsertPlanEntry', { payload: { id: 'pl_toast', date: FRI, slot: 'Breakfast', recipe_id: 'rc_toast' } });
    expect(add(api, { late_meals: true })).toMatchObject({ added: [], joined: [], meals: ['pl_toast'] });
  });

  it('a meal added late reads Shopped once the trip closes', () => {
    const api = fixture();
    add(api, { late_meals: true });
    api.ok('closeTrip', { payload: {} });
    const thu = api.ok('getPlan', { today: TODAY }).entries.find((e: { id: string }) => e.id === 'pl_thu');
    expect(thu.shopped).toBe(true);
  });
});

describe('remembering what you bought', () => {
  const setUp = () => {
    const api = fixture();
    add(api, { food_id: 'fd_milk' }); // buy '1 gallon' from last time
    add(api, { food_id: 'fd_towels' });
    const set = (payload: object) => api.ok('setTripItem', { payload });
    set({ food_id: 'fd_eggs', choice: 'ks' });
    set({ food_id: 'fd_eggs', buy: '12 pack' });
    set({ food_id: 'fd_eggs', bought: true });
    set({ food_id: 'fd_milk', bought: true }); // bought, buying amount from last time
    set({ food_id: 'fd_towels', choice: 'other' });
    set({ food_id: 'fd_towels', buy: '6 rolls' }); // not bought
    set({ food_id: 'fd_onion', bought: true }); // bought, no buying amount
    set({ food_id: 'fd_oil', buy: '1 bottle' }); // Have it
    api.ok('upsertFood', { payload: { id: 'fd_onion', last_buy: '3 lb bag', last_bought_on: '2026-10-01' } });
    return api;
  };

  it('closing writes last_buy and the closing date only for bought, store-sorted items with a buying amount', () => {
    const api = setUp();
    api.ok('closeTrip', { payload: { today: '2026-11-03' } });
    expect(food(api, 'fd_eggs')).toMatchObject({ last_buy: '12 pack', last_bought_on: '2026-11-03' });
    expect(food(api, 'fd_milk')).toMatchObject({ last_buy: '1 gallon', last_bought_on: '2026-11-03' });
    expect(food(api, 'fd_towels')).toMatchObject({ last_buy: '', last_bought_on: '' });
    expect(food(api, 'fd_onion')).toMatchObject({ last_buy: '3 lb bag', last_bought_on: '2026-10-01' });
    expect(food(api, 'fd_oil')).toMatchObject({ last_buy: '' });
  });

  it('a failing food write leaves the trip open', () => {
    const api = setUp();
    const real = api.sandbox.upsertRecord;
    api.sandbox.upsertRecord = (tab: string, rec: object) => {
      if (tab === 'Foods') throw new Error('Sheets is down');
      return real(tab, rec);
    };
    expect(api.call('closeTrip', { payload: {} })).toMatchObject({ success: false, error: 'Sheets is down' });
    api.sandbox.upsertRecord = real;
    expect(trip(api)).toMatchObject({ id: 'tr_1', status: 'open' });
  });

  it('undoing a close restores each food\'s earlier last_buy and last_bought_on', () => {
    const api = setUp();
    api.ok('closeTrip', { payload: { today: '2026-11-03', call_id: 'c-close' } });
    expect(api.call('undoCall', { payload: { call_id: 'c-close', confirm: true } }).success).toBe(true);
    expect(food(api, 'fd_eggs')).toMatchObject({ last_buy: '18 pack', last_bought_on: '2026-10-20' });
    expect(food(api, 'fd_milk')).toMatchObject({ last_buy: '1 gallon', last_bought_on: '' });
    expect(trip(api).status).toBe('open');
  });

  it('next trip: an added food starts at last_buy; a meal item is not prefilled but carries last_buy for its chip', () => {
    const api = setUp();
    api.ok('closeTrip', { payload: { today: '2026-11-03' } });
    api.ok('upsertPlanEntry', { payload: { id: 'pl_fri', date: FRI, slot: 'Dinner', recipe_id: 'rc_chili' } });
    api.ok('startTrip', { payload: { id: 'tr_2', through: FRI, today: TODAY } });
    const eggs = byFood(trip(api)).fd_eggs;
    expect(eggs).toMatchObject({ buy: '', last_buy: '12 pack', last_bought_on: '2026-11-03', packs: ['18 pack', '12 pack'] });
    expect(byFood(add(api, { food_id: 'fd_milk' }).trip).fd_milk.buy).toBe('1 gallon');
  });
});

describe('undo (#713) of the #719 writes', () => {
  const undo = (api: Api, callId: string) => api.call('undoCall', { payload: { call_id: callId, confirm: true } });
  const snapshot = (api: Api) =>
    JSON.stringify(['Foods', 'TripItems', 'Plan'].map((t) => api.rows(t).map((r) => JSON.stringify(r)).sort()));

  it('an add by text removes the item and the food it created', () => {
    const api = fixture();
    const before = snapshot(api);
    add(api, { text: 'dragon fruit', call_id: 'c-add' });
    expect(undo(api, 'c-add').success).toBe(true);
    expect(snapshot(api)).toBe(before);
  });

  it('a late-meals add clears the trip_ids it set and the lines it added', () => {
    const api = fixture();
    const before = snapshot(api);
    add(api, { late_meals: true, call_id: 'c-late' });
    expect(undo(api, 'c-late').success).toBe(true);
    expect(snapshot(api)).toBe(before);
    expect(trip(api).late_meals.map((m: { plan_id: string }) => m.plan_id)).toEqual(['pl_thu']);
  });

  it('is refused, naming the item, once it has been sorted, bought or given a buying amount', () => {
    for (const change of [{ choice: 'ks' }, { buy: '2 rolls' }]) {
      const api = fixture();
      add(api, { food_id: 'fd_towels', call_id: 'c-add' });
      api.ok('setTripItem', { payload: { food_id: 'fd_towels', ...change } });
      const res = undo(api, 'c-add');
      expect(res).toMatchObject({ success: false, code: 'undo_refused' });
      const conflicts = (res as unknown as { data: { conflicts: { tab: string; row_key: object }[] } }).data.conflicts;
      expect(conflicts).toEqual([expect.objectContaining({ tab: 'TripItems', row_key: { trip_id: 'tr_1', food_id: 'fd_towels' } })]);
    }
  });

  it('a late-meals add is refused once the meal has moved off the trip', () => {
    const api = fixture();
    add(api, { late_meals: true, call_id: 'c-late' });
    api.ok('movePlanEntry', { payload: { id: 'pl_thu', date: '2026-11-07' } });
    expect(undo(api, 'c-late')).toMatchObject({ success: false, code: 'undo_refused' });
  });

  it('a removal recreates the row; a buy change restores the prior value', () => {
    const api = fixture();
    add(api, { food_id: 'fd_towels' });
    const before = snapshot(api);
    api.ok('removeTripItem', { payload: { food_id: 'fd_towels', call_id: 'c-rm' } });
    expect(undo(api, 'c-rm').success).toBe(true);
    expect(snapshot(api)).toBe(before);
    api.ok('setTripItem', { payload: { food_id: 'fd_eggs', buy: '18 pack', call_id: 'c-buy' } });
    expect(undo(api, 'c-buy').success).toBe(true);
    expect(byFood(trip(api)).fd_eggs.buy).toBe('');
  });
});
