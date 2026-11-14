// #879: combos found in the food log, and hiding them.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

type Item = [string, number, string?];

/** The test's "today", from the API's own clock, and a date `ago` days before it. */
function dates(api: Api) {
  const today: string = api.sandbox.todayLocal();
  return { today, ago: (n: number): string => api.sandbox.addDaysTo(today, -n) };
}

const NAMES: Record<string, string> = {
  oats: 'Oats', ab: 'Almond butter', blue: 'Blueberries', ban: 'Banana', milk: 'Milk', bread: 'Bread', turkey: 'Turkey',
  ched: 'Cheddar', swiss: 'Swiss', yog: 'Yogurt', gran: 'Granola', apple: 'Apple', pb: 'Peanut butter', spin: 'Spinach',
};

function seedFoods(api: Api, ids = Object.keys(NAMES)) {
  for (const id of ids) api.ok('upsertFood', { payload: { id: `fd_${id}`, name: NAMES[id] ?? id } });
}

let seq = 0;

/** Append FoodLog rows directly: the log is the input here, not the thing under test. */
function log(api: Api, rows: { date: string; slot: string; items: Item[] }[]) {
  const sheet = api.ss.getSheetByName('FoodLog')!;
  const fields: string[] = api.sandbox.TABS.FoodLog.fields;
  for (const meal of rows) {
    for (const [food, qty, unit] of meal.items) {
      const rec: Record<string, unknown> = {
        id: `lg_${(seq++).toString(16).padStart(8, '0')}`, date: meal.date, slot: meal.slot, food_id: `fd_${food}`,
        qty, unit: unit ?? 'srv', source: 'app',
      };
      sheet.rows.push(fields.map((f) => (rec[f] === undefined ? '' : rec[f])) as any);
    }
  }
}

/** The same meal on each of `days` days ago. */
function meals(api: Api, slot: string, items: Item[], days: number[]) {
  const { ago } = dates(api);
  log(api, days.map((d) => ({ date: ago(d), slot, items })));
}

/** The prototype's 60-day sample (#876). */
function prototypeLog(api: Api) {
  seedFoods(api);
  meals(api, 'Breakfast', [['oats', 0.5], ['ab', 0.5], ['blue', 0.5], ['milk', 1]], [1, 3, 6, 9, 13, 17]);
  meals(api, 'Breakfast', [['oats', 0.5], ['ab', 0.75], ['ban', 0.5], ['milk', 1]], [2, 5, 8, 12, 20]);
  meals(api, 'Breakfast', [['oats', 0.5], ['pb', 1], ['spin', 1], ['milk', 1]], [24, 40]);
  meals(api, 'Breakfast', [['yog', 1], ['gran', 2]], [4, 7, 10, 15, 19, 23, 30]);
  meals(api, 'Breakfast', [['yog', 1], ['gran', 1.5], ['blue', 0.5]], [27, 33]);
  meals(api, 'Lunch', [['bread', 2], ['turkey', 3], ['ched', 1]], [4, 11]);
  meals(api, 'Lunch', [['bread', 2], ['turkey', 3], ['ched', 1], ['spin', 1]], [1, 8]);
  meals(api, 'Lunch', [['bread', 2], ['turkey', 4], ['swiss', 1]], [6, 14, 21]);
  meals(api, 'Snacks', [['apple', 1], ['pb', 1]], [2, 6, 9, 16, 22]);
  meals(api, 'Snacks', [['apple', 1], ['pb', 0.5]], [29]);
}

const byName = (combos: any[], name: string) => combos.find((c) => c.name === name);

describe('getCombos', () => {
  it('joins the oatmeal sets into one combo with a pick-one over 11 meals (AC 1)', () => {
    const api = loadApi();
    prototypeLog(api);
    const { combos } = api.ok('getCombos');
    const c = combos.find((x: any) => x.key.startsWith('fd_ab+fd_milk+fd_oats|'));
    expect(c).toBeDefined();
    expect(c.key).toBe('fd_ab+fd_milk+fd_oats|fd_ban/fd_blue');
    expect(c.meals).toBe(11);
    expect(c.slot).toBe('Breakfast');
    expect(c.name).toBe('Oats + Almond butter + Milk + Blueberries / Banana');
    expect(c.lines.slice(0, 3).map((l: any) => l.food_id)).toEqual(['fd_oats', 'fd_ab', 'fd_milk']);
    const pick = c.lines[3];
    expect(pick.options.map((o: any) => o.food_id)).toEqual(['fd_blue', 'fd_ban']);
    expect(pick.default).toBe('fd_blue'); // yesterday's breakfast
    expect(c.meal_dates).toHaveLength(11);
    // Neither four-food set nor the three-food core is listed separately.
    for (const other of combos) {
      expect(other.key).not.toBe('fd_ab+fd_blue+fd_milk+fd_oats');
      expect(other.key).not.toBe('fd_ab+fd_ban+fd_milk+fd_oats');
      expect(other.key).not.toBe('fd_ab+fd_milk+fd_oats');
    }
  });

  it('joins bread and turkey with a cheddar / swiss pick-one over 7 meals (AC 2)', () => {
    const api = loadApi();
    prototypeLog(api);
    const c = api.ok('getCombos').combos.find((x: any) => x.key === 'fd_bread+fd_turkey|fd_ched/fd_swiss');
    expect(c.meals).toBe(7);
    expect(c.name).toBe('Bread + Turkey + Cheddar / Swiss');
    expect(c.slot).toBe('Lunch');
    expect(c.lines[2].options).toEqual([
      { food_id: 'fd_ched', qty: 1, unit: 'srv' },
      { food_id: 'fd_swiss', qty: 1, unit: 'srv' },
    ]);
  });

  it('gives yogurt + granola over 9 meals and no three-food combo (AC 3)', () => {
    const api = loadApi();
    prototypeLog(api);
    const { combos } = api.ok('getCombos');
    const c = byName(combos, 'Yogurt + Granola');
    expect(c.meals).toBe(9);
    expect(c.key).toBe('fd_gran+fd_yog');
    expect(combos.some((x: any) => x.key.includes('fd_blue') && x.key.includes('fd_yog'))).toBe(false);
  });

  it('never returns a set in only 2 meals (AC 4)', () => {
    const api = loadApi();
    prototypeLog(api);
    for (const c of api.ok('getCombos').combos) expect(c.meals).toBeGreaterThanOrEqual(3);
    // oats + peanut butter + spinach + milk is in 2 meals
    expect(api.ok('getCombos').combos.some((c: any) => c.key.includes('fd_spin') && c.key.includes('fd_pb'))).toBe(false);
  });

  it('leaves out a combo one usual covers, and brings it back when the usual is deleted (AC 5)', () => {
    const api = loadApi();
    prototypeLog(api);
    const usual = api.ok('upsertUsual', {
      payload: {
        name: 'Oatmeal', slot: 'Breakfast',
        lines: [
          { food_id: 'fd_oats', qty: 0.5, unit: 'g' },
          { food_id: 'fd_ab', qty: 10, unit: 'g' },
          { food_id: 'fd_milk', qty: 100, unit: 'g' },
          { options: [{ food_id: 'fd_blue', qty: 50, unit: 'g' }, { food_id: 'fd_ban', qty: 50, unit: 'g' }] },
        ],
      },
    });
    const covered = api.ok('getCombos');
    expect(covered.combos.some((c: any) => c.key.startsWith('fd_ab+fd_milk+fd_oats'))).toBe(false);
    expect(covered.stats.covered).toBe(1);
    api.ok('deleteUsual', { payload: { id: usual.id } });
    const back = api.ok('getCombos');
    expect(back.combos.some((c: any) => c.key === 'fd_ab+fd_milk+fd_oats|fd_ban/fd_blue')).toBe(true);
    expect(back.stats.covered).toBe(0);
  });

  it('is not covered by a usual that holds only some of its foods', () => {
    const api = loadApi();
    prototypeLog(api);
    api.ok('upsertUsual', {
      payload: { name: 'Oats', slot: 'Breakfast', lines: [{ food_id: 'fd_oats', qty: 1, unit: 'g' }, { food_id: 'fd_milk', qty: 1, unit: 'g' }] },
    });
    expect(api.ok('getCombos').stats.covered).toBe(0);
  });

  it('hideCombo removes a combo and unhideCombos brings it back (AC 6)', () => {
    const api = loadApi();
    prototypeLog(api);
    const key = 'fd_bread+fd_turkey|fd_ched/fd_swiss';
    const hidden = api.ok('hideCombo', { payload: { key } });
    expect(hidden.hidden).toEqual([key]);
    expect(api.ok('hideCombo', { payload: { key } }).hidden).toEqual([key]);
    const after = api.ok('getCombos');
    expect(after.combos.some((c: any) => c.key === key)).toBe(false);
    expect(after.stats.hidden).toBe(1);
    expect(JSON.parse(api.ok('getConfig').hidden_combos)).toEqual([key]);

    expect(api.ok('unhideCombos', { payload: { keys: ['fd_other'] } }).hidden).toEqual([key]);
    expect(api.ok('unhideCombos', { payload: { keys: [key] } }).hidden).toEqual([]);
    expect(api.ok('getCombos').combos.some((c: any) => c.key === key)).toBe(true);
  });

  it('unhideCombos with no keys shows every hidden combo', () => {
    const api = loadApi();
    prototypeLog(api);
    api.ok('hideCombo', { payload: { key: 'fd_gran+fd_yog' } });
    api.ok('hideCombo', { payload: { key: 'fd_apple+fd_pb' } });
    expect(api.ok('getCombos').stats.hidden).toBe(2);
    expect(api.ok('unhideCombos', { payload: {} }).hidden).toEqual([]);
    expect(api.ok('getCombos').stats.hidden).toBe(0);
  });

  it('logs hideCombo and unhideCombos in MCPChangeLog, and undoCall reverts them (AC 12)', () => {
    const api = loadApi();
    prototypeLog(api);
    const key = 'fd_gran+fd_yog';
    api.ok('hideCombo', { payload: { key, call_id: 'hide-1' } });
    expect(api.ok('getChangeLog', { call_id: 'hide-1' })).toMatchObject([{ action: 'hideCombo', tab: 'Config' }]);
    expect(api.ok('getCombos').combos.some((c: any) => c.key === key)).toBe(false);
    api.ok('undoCall', { payload: { call_id: 'hide-1', confirm: true } });
    expect(api.ok('getCombos').combos.some((c: any) => c.key === key)).toBe(true);

    api.ok('hideCombo', { payload: { key, call_id: 'hide-2' } });
    api.ok('unhideCombos', { payload: { call_id: 'unhide-1' } });
    expect(api.ok('getChangeLog', { call_id: 'unhide-1' })).toMatchObject([{ action: 'unhideCombos', tab: 'Config' }]);
    api.ok('undoCall', { payload: { call_id: 'unhide-1', confirm: true } });
    expect(api.ok('getCombos').combos.some((c: any) => c.key === key)).toBe(false);
  });

  it('lets the app token run all three actions', () => {
    const api = loadApi();
    for (const a of ['getCombos', 'hideCombo', 'unhideCombos']) expect(api.sandbox.TOKEN_ACTIONS).toContain(a);
  });

  it('refuses a bad key and a bad key list', () => {
    const api = loadApi();
    expect(api.call('hideCombo', { payload: {} }).error).toMatch(/key is required/);
    expect(api.call('unhideCombos', { payload: { keys: 'x' } }).error).toMatch(/keys must be a list/);
    expect(api.call('unhideCombos', { payload: { keys: [1] } }).error).toMatch(/keys must be a list/);
  });

  it("reads each food's median in its most-used unit (AC 7)", () => {
    const api = loadApi();
    seedFoods(api);
    const { ago } = dates(api);
    const base: Item[] = [['oats', 1, 'cup'], ['milk', 1, 'cup']];
    log(api, [
      { date: ago(1), slot: 'Breakfast', items: [...base, ['ab', 0.5, 'tbsp']] },
      { date: ago(2), slot: 'Breakfast', items: [...base, ['ab', 0.5, 'tbsp']] },
      { date: ago(3), slot: 'Breakfast', items: [...base, ['ab', 0.75, 'tbsp']] },
      { date: ago(4), slot: 'Breakfast', items: [...base, ['ab', 20, 'g']] },
    ]);
    const c = api.ok('getCombos').combos[0];
    expect(c.meals).toBe(4);
    expect(c.lines.find((l: any) => l.food_id === 'fd_ab')).toEqual({ food_id: 'fd_ab', qty: 0.5, unit: 'tbsp' });
  });

  it('takes the mean of the middle two for an even count', () => {
    const api = loadApi();
    seedFoods(api);
    meals(api, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2]);
    meals(api, 'Snacks', [['apple', 1], ['pb', 2]], [3, 4]);
    const c = api.ok('getCombos').combos[0];
    expect(c.lines.find((l: any) => l.food_id === 'fd_pb').qty).toBe(1.5);
  });

  it("does not count today's entries, nor entries older than days (AC 8)", () => {
    const api = loadApi();
    seedFoods(api);
    // 2 meals in the window, a third today
    meals(api, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2, 0]);
    expect(api.ok('getCombos').combos).toEqual([]);
    // 2 in the window, a third 61 days back; days = 60 reaches back to 60, days = 61 reaches 61
    const old = loadApi();
    seedFoods(old);
    meals(old, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2, 61]);
    expect(old.ok('getCombos').combos).toEqual([]);
    expect(old.ok('getCombos', { days: 61 }).combos).toHaveLength(1);
    expect(old.ok('getCombos', { days: 61 }).combos[0].meals).toBe(3);
    // exactly 60 days back is inside the default window
    const edge = loadApi();
    seedFoods(edge);
    meals(edge, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2, 60]);
    expect(edge.ok('getCombos').combos[0].meals).toBe(3);
  });

  it('ignores recipe entries', () => {
    const api = loadApi();
    seedFoods(api);
    meals(api, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2, 3]);
    const sheet = api.ss.getSheetByName('FoodLog')!;
    const fields: string[] = api.sandbox.TABS.FoodLog.fields;
    const { ago } = dates(api);
    for (const d of [1, 2, 3]) {
      const rec: Record<string, unknown> = { id: `lg_r${d}`, date: ago(d), slot: 'Snacks', recipe_id: 'rc_x', qty: 1, unit: 'serving' };
      sheet.rows.push(fields.map((f) => rec[f] ?? '') as any);
    }
    const c = api.ok('getCombos').combos[0];
    expect(c.lines).toHaveLength(2);
    expect(c.meals).toBe(3);
  });

  it('lists the combos for a slot first (AC 9)', () => {
    const api = loadApi();
    prototypeLog(api);
    const all = api.ok('getCombos').combos;
    expect(all[0].slot).not.toBe('Snacks'); // yogurt + granola or oatmeal lead on meals
    const snacks = api.ok('getCombos', { slot: 'Snacks' }).combos;
    expect(snacks[0].slot).toBe('Snacks');
    expect(snacks[0].name).toBe('Apple + Peanut butter');
    expect(snacks).toHaveLength(all.length);
    const firstOther = snacks.findIndex((c: any) => c.slot !== 'Snacks');
    expect(snacks.slice(firstOther).every((c: any) => c.slot !== 'Snacks')).toBe(true);
  });

  it('sorts by meals, then latest, and applies limit', () => {
    const api = loadApi();
    prototypeLog(api);
    const { combos } = api.ok('getCombos');
    for (let i = 1; i < combos.length; i++) {
      const [a, b] = [combos[i - 1], combos[i]];
      expect(a.meals > b.meals || (a.meals === b.meals && a.last_date >= b.last_date)).toBe(true);
    }
    const two = api.ok('getCombos', { limit: 2 });
    expect(two.combos.map((c: any) => c.key)).toEqual(combos.slice(0, 2).map((c: any) => c.key));
    expect(two.stats.returned).toBe(2);
  });

  it('reports a count after every step, and they add up (AC 10)', () => {
    const api = loadApi();
    prototypeLog(api);
    api.ok('hideCombo', { payload: { key: 'fd_apple+fd_pb' } });
    api.ok('upsertUsual', {
      payload: {
        name: 'Yogurt', slot: 'Breakfast',
        lines: [{ food_id: 'fd_yog', qty: 1, unit: 'g' }, { food_id: 'fd_gran', qty: 1, unit: 'g' }],
      },
    });
    const { combos, stats } = api.ok('getCombos');
    expect(stats.meals).toBe(6 + 5 + 2 + 7 + 2 + 2 + 2 + 3 + 5 + 1);
    expect(stats.sets).toBeGreaterThanOrEqual(stats.kept);
    expect(stats.kept).toBeGreaterThanOrEqual(stats.after_inner);
    expect(stats.after_inner).toBeGreaterThanOrEqual(stats.joined);
    expect(stats.covered).toBe(1);
    expect(stats.hidden).toBe(1);
    expect(stats.joined - stats.covered - stats.hidden).toBe(stats.returned);
    expect(stats.returned).toBe(combos.length);
    expect(combos.map((c: any) => c.name).sort()).toEqual([
      'Bread + Turkey + Cheddar / Swiss', 'Oats + Almond butter + Milk + Blueberries / Banana',
    ]);
  });

  it('names a food by its short name where it has one (#880)', () => {
    const api = loadApi();
    seedFoods(api);
    api.ok('upsertFood', { payload: { id: 'fd_pb', name: 'Peanut butter, creamy, smooth', short_name: 'PB' } });
    meals(api, 'Snacks', [['apple', 1], ['pb', 1]], [1, 2, 3]);
    expect(api.ok('getCombos').combos[0].name).toBe('Apple + PB');
  });

  it('checks its parameters', () => {
    const api = loadApi();
    expect(api.call('getCombos', { slot: 'Brunch' }).error).toMatch(/slot must be one of/);
    expect(api.call('getCombos', { days: 0 }).error).toMatch(/days must be at least 1/);
    expect(api.call('getCombos', { days: 1.5 }).error).toMatch(/days must be a whole number/);
    expect(api.call('getCombos', { limit: -1 }).error).toMatch(/limit must be at least 1/);
  });

  it('answers an empty log with no combos and zero counts', () => {
    const api = loadApi();
    expect(api.ok('getCombos')).toEqual({
      combos: [],
      stats: { meals: 0, sets: 0, kept: 0, after_inner: 0, joined: 0, covered: 0, hidden: 0, returned: 0 },
    });
  });

  it('keeps a meal with more than 12 foods to its 12 most-logged', () => {
    const api = loadApi();
    const ids = Array.from({ length: 14 }, (_, i) => `f${String(i).padStart(2, '0')}`);
    seedFoods(api, ids);
    // 13 foods in every meal, plus a 14th that is only ever logged once
    const items = (extra: string): Item[] => [...ids.slice(0, 12), extra].map((f) => [f, 1] as Item);
    meals(api, 'Lunch', items('f12'), [1, 2, 3]);
    meals(api, 'Lunch', items('f13').slice(0, 12).concat([['f13', 1]]), [4]);
    const { combos, stats } = api.ok('getCombos');
    expect(stats.meals).toBe(4);
    // f13 is in one meal, so it can never be in a kept set, and the 12 shared foods give 5-food sets
    expect(combos.every((c: any) => !c.key.includes('f13'))).toBe(true);
    expect(combos.length).toBeGreaterThan(0);
  });

  it('answers a 60-day log of 300 meals in under 5 seconds (AC 11)', () => {
    const api = loadApi();
    const pool = Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, '0')}`);
    seedFoods(api, pool);
    const { ago } = dates(api);
    const rows: { date: string; slot: string; items: Item[] }[] = [];
    let n = 0;
    for (let day = 1; day <= 60; day++) {
      for (const slot of ['Breakfast', 'Lunch', 'Dinner', 'After dinner', 'Snacks']) {
        // meals of 3 to 9 foods, drawn from a pool in which a few foods are common
        const size = 3 + (n % 7);
        const foods = new Set<string>();
        for (let k = 0; foods.size < size; k++) foods.add(pool[(n * 7 + k * k * 3 + k) % (k < 3 ? 8 : 30)]);
        rows.push({ date: ago(day), slot, items: [...foods].map((f) => [f, 1 + (n % 3)] as Item) });
        n++;
      }
    }
    expect(rows).toHaveLength(300);
    log(api, rows);
    const t0 = Date.now();
    const res = api.ok('getCombos');
    const ms = Date.now() - t0;
    expect(res.stats.meals).toBe(300);
    expect(res.stats.kept).toBeGreaterThan(0);
    expect(ms).toBeLessThan(5000);
  });

  it('stays under 5 seconds when every meal has the 12 foods the cap allows (AC 11, worst case)', () => {
    const api = loadApi();
    const pool = Array.from({ length: 16 }, (_, i) => `w${String(i).padStart(2, '0')}`);
    seedFoods(api, pool);
    const { ago } = dates(api);
    const rows: { date: string; slot: string; items: Item[] }[] = [];
    let n = 0;
    for (let day = 1; day <= 60; day++) {
      for (const slot of ['Breakfast', 'Lunch', 'Dinner', 'After dinner', 'Snacks']) {
        const start = n % pool.length;
        rows.push({ date: ago(day), slot, items: Array.from({ length: 12 }, (_, k) => [pool[(start + k * 5) % pool.length], 1] as Item) });
        n++;
      }
    }
    log(api, rows);
    const t0 = Date.now();
    const res = api.ok('getCombos');
    const ms = Date.now() - t0;
    expect(res.stats.sets).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(5000);
  });
});
