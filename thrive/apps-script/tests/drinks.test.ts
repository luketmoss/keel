// #519 - the Drinks and Settings actions: logDrink, getDrinks, getDrinkTotals,
// updateDrinkTime, deleteDrink, updateSetting, against the sandbox's fake sheets.

import { describe, it, expect } from 'vitest';
import { loadApi, callDoGet, type CellValue } from './apps-script-sandbox';

// 2026-10-20 13:30 UTC is 07:30 MDT (UTC-6) on the 20th.
const NOW = new Date('2026-10-20T13:30:00.000Z');
const NOW_ISO = NOW.toISOString();

const row = (over: Partial<Record<string, string>> = {}): CellValue[] => {
  const d = {
    id: 'd-1', kind: 'water', amount: '250', date: '2026-10-20', time: '07:00:00',
    logged_at_utc: '2026-10-20T13:00:00.000Z', source: 'app',
    created: '2026-10-20T13:00:01.000Z', updated: '2026-10-20T13:00:01.000Z', ...over,
  };
  return [d.id, d.kind, d.amount, d.date, d.time, d.logged_at_utc, d.source, d.created, d.updated];
};

const drink = (over: Record<string, unknown> = {}) => ({
  id: 'e5d1c3a2-0000-4000-8000-000000000001', kind: 'water', amount: 250,
  logged_at_utc: '2026-10-20T13:05:00Z', source: 'widget', ...over,
});

function setup(fixtures: { drinks?: CellValue[][]; settings?: CellValue[][] } = { drinks: [] }) {
  const api = loadApi(fixtures, { now: NOW });
  const call = (action: string, payload?: unknown, extra: Record<string, string> = {}) =>
    callDoGet<any>(api.sandbox, {
      action, ...(payload !== undefined ? { payload: JSON.stringify(payload) } : {}), ...extra,
    });
  return { ...api, call };
}

describe('logDrink', () => {
  it('appends a row whose date and time are the Denver local clock of logged_at_utc', () => {
    const { call, drinkRows } = setup();
    const res = call('logDrink', drink());
    expect(res.success, res.error).toBe(true);
    expect(res.data).toEqual({
      id: 'e5d1c3a2-0000-4000-8000-000000000001', kind: 'water', amount: '250',
      date: '2026-10-20', time: '07:05:00', logged_at_utc: '2026-10-20T13:05:00.000Z',
      source: 'widget', created: NOW_ISO, updated: NOW_ISO,
    });
    expect(drinkRows).toHaveLength(1);
    expect(call('getDrinks', undefined, { from: '2026-10-20', to: '2026-10-20' }).data.drinks).toEqual([res.data]);
  });

  it('files 23:30 Denver under that date even when UTC is already the next day', () => {
    const { call } = setup();
    const res = call('logDrink', drink({ logged_at_utc: '2026-10-21T05:30:00Z' }));
    expect(res.data.date).toBe('2026-10-20');
    expect(res.data.time).toBe('23:30:00');
  });

  it('follows daylight saving: the same UTC hour is an hour apart across the change', () => {
    const { call } = setup();
    expect(call('logDrink', drink({ id: 'a', logged_at_utc: '2026-11-01T12:30:00Z' })).data.time).toBe('05:30:00');
    expect(call('logDrink', drink({ id: 'b', logged_at_utc: '2026-11-02T12:30:00Z' })).data.time).toBe('05:30:00');
    expect(call('logDrink', drink({ id: 'c', logged_at_utc: '2026-10-31T12:30:00Z' })).data.time).toBe('06:30:00');
  });

  it('repeating an id returns the existing row unchanged and writes nothing', () => {
    const { call, drinkRows } = setup();
    const first = call('logDrink', drink());
    const again = call('logDrink', drink({ amount: 500, logged_at_utc: '2026-10-20T20:00:00Z', source: 'app' }));
    expect(again.success).toBe(true);
    expect(again.data).toEqual(first.data);
    expect(drinkRows).toHaveLength(1);
  });

  it('logs one alcohol drink', () => {
    const { call } = setup();
    const res = call('logDrink', drink({ kind: 'alcohol', amount: 1 }));
    expect(res.data.kind).toBe('alcohol');
    expect(res.data.amount).toBe('1');
  });

  it('logs one cup of coffee, and a repeated id leaves one row', () => {
    const { call, drinkRows } = setup();
    const first = call('logDrink', drink({ kind: 'coffee', amount: 1 }));
    expect(first.data.kind).toBe('coffee');
    expect(first.data.amount).toBe('1');
    call('logDrink', drink({ kind: 'coffee', amount: 1 }));
    expect(drinkRows).toHaveLength(1);
  });

  it('writes every value as text, so an id like -1 stays text', () => {
    const { call, drinkRows } = setup();
    const res = call('logDrink', drink({ id: '-1' }));
    expect(res.success, res.error).toBe(true);
    expect(drinkRows![0][0]).toBe('-1');
    expect(typeof drinkRows![0][2]).toBe('string');
  });

  const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
    ['an unknown kind', { kind: 'juice' }, /kind must be water, alcohol or coffee/],
    ['tea', { kind: 'tea' }, /kind must be water, alcohol or coffee/],
    ['a missing kind', { kind: undefined }, /kind must be/],
    ['a water amount of 0', { amount: 0 }, /amount for water/],
    ['a negative water amount', { amount: -250 }, /amount for water/],
    ['a fractional water amount', { amount: 250.5 }, /amount for water/],
    ['a water amount over 2000', { amount: 2001 }, /amount for water/],
    ['a non-numeric water amount', { amount: 'lots' }, /amount for water/],
    ['a missing amount', { amount: undefined }, /amount for water/],
    ['an alcohol amount of 2', { kind: 'alcohol', amount: 2 }, /amount for alcohol or coffee must be 1/],
    ['an alcohol amount of 0', { kind: 'alcohol', amount: 0 }, /amount for alcohol or coffee must be 1/],
    ['a coffee amount of 2', { kind: 'coffee', amount: 2 }, /amount for alcohol or coffee must be 1/],
    ['a coffee amount of 0', { kind: 'coffee', amount: 0 }, /amount for alcohol or coffee must be 1/],
    ['a blank coffee amount', { kind: 'coffee', amount: '' }, /amount for alcohol or coffee must be 1/],
    ['a missing id', { id: undefined }, /id is required/],
    ['an empty id', { id: '' }, /id is required/],
    ['an id with spaces', { id: 'a b' }, /id is required/],
    ['an id over 64 characters', { id: 'x'.repeat(65) }, /id is required/],
    ['a missing logged_at_utc', { logged_at_utc: undefined }, /logged_at_utc is required/],
    ['a local-time logged_at_utc', { logged_at_utc: '2026-10-20T07:05:00-06:00' }, /logged_at_utc is required/],
    ['an impossible logged_at_utc', { logged_at_utc: '2026-13-45T25:00:00Z' }, /logged_at_utc is required/],
    ['an unknown source', { source: 'mcp' }, /source must be widget or app/],
    ['a missing source', { source: undefined }, /source must be/],
  ];
  for (const [label, over, message] of refusals) {
    it(`refuses ${label}, with fixed text and no row`, () => {
      const { call, drinkRows } = setup();
      const res = call('logDrink', drink(over));
      expect(res.success).toBe(false);
      expect(res.error).toMatch(message);
      expect(drinkRows).toHaveLength(0);
    });
  }

  it('echoes none of the caller\'s input in a refusal', () => {
    const { call } = setup();
    const res = call('logDrink', drink({ kind: 'SECRET-KIND', id: 'ok-id' }));
    expect(res.error).not.toContain('SECRET-KIND');
  });

  it('takes the script lock and releases it', () => {
    const { call, lock } = setup();
    call('logDrink', drink());
    expect(lock.acquired).toBe(1);
    expect(lock.held).toBe(false);
  });
});

describe('getDrinks', () => {
  const rows = [
    row({ id: 'late', date: '2026-10-20', logged_at_utc: '2026-10-20T20:00:00.000Z', time: '14:00:00' }),
    row({ id: 'early', date: '2026-10-20', logged_at_utc: '2026-10-20T12:00:00.000Z', time: '06:00:00' }),
    row({ id: 'prev', date: '2026-10-19', logged_at_utc: '2026-10-19T18:00:00.000Z' }),
    row({ id: 'next', date: '2026-10-21', logged_at_utc: '2026-10-21T18:00:00.000Z' }),
  ];

  it('without a range returns today (Denver) in logged_at_utc order, with the goal', () => {
    const { call } = setup({ drinks: rows });
    const res = call('getDrinks');
    expect(res.success, res.error).toBe(true);
    expect(res.data.drinks.map((d: any) => d.id)).toEqual(['early', 'late']);
    expect(res.data.water_goal_ml).toBe(1893);
  });

  it('with a range returns only rows in it, inclusive', () => {
    const { call } = setup({ drinks: rows });
    const res = call('getDrinks', undefined, { from: '2026-10-19', to: '2026-10-20' });
    expect(res.data.drinks.map((d: any) => d.id)).toEqual(['prev', 'early', 'late']);
  });

  it('a one-day range of a quiet day is empty, and a missing tab is empty too', () => {
    expect(setup({ drinks: rows }).call('getDrinks', undefined, { from: '2026-01-01', to: '2026-01-01' }).data.drinks).toEqual([]);
    expect(setup({}).call('getDrinks').data).toEqual({ drinks: [], water_goal_ml: 1893 });
  });

  it('refuses a range over 400 days, accepts exactly 400', () => {
    const { call } = setup({ drinks: [] });
    const over = call('getDrinks', undefined, { from: '2025-01-01', to: '2026-02-05' });
    expect(over.success).toBe(false);
    expect(over.error).toMatch(/at most 400 days/);
    expect(call('getDrinks', undefined, { from: '2025-01-01', to: '2026-02-04' }).success).toBe(true);
  });

  it('refuses half a range, a backwards range and a malformed date', () => {
    const { call } = setup({ drinks: [] });
    for (const range of <Record<string, string>[]>[{ from: '2026-10-01' }, { to: '2026-10-01' }, { from: '2026-10-02', to: '2026-10-01' },
      { from: 'yesterday', to: '2026-10-01' }]) {
      const res = call('getDrinks', undefined, range);
      expect(res.success, JSON.stringify(range)).toBe(false);
      expect(res.error).toMatch(/from and to must be given together/);
    }
  });
});

describe('getDrinkTotals', () => {
  it('sums today\'s water ml, alcohol drinks and coffee cups, and carries the goal', () => {
    const { call } = setup({
      drinks: [
        row({ id: '1', amount: '250' }), row({ id: '2', amount: '500' }),
        row({ id: '3', kind: 'alcohol', amount: '1' }), row({ id: '4', kind: 'alcohol', amount: '1' }),
        row({ id: '6', kind: 'coffee', amount: '1' }), row({ id: '7', kind: 'coffee', amount: '1' }), row({ id: '8', kind: 'coffee', amount: '1' }),
        row({ id: '5', date: '2026-10-19', amount: '900' }),
      ],
    });
    expect(call('getDrinkTotals').data).toEqual({
      date: '2026-10-20', water_ml: 750, alcohol_drinks: 2, coffee_cups: 3, water_goal_ml: 1893,
    });
  });

  it('returns zeros, not blanks, with no drinks or no tab', () => {
    const zeros = { date: '2026-10-20', water_ml: 0, alcohol_drinks: 0, coffee_cups: 0, water_goal_ml: 1893 };
    expect(setup({ drinks: [] }).call('getDrinkTotals').data).toEqual(zeros);
    expect(setup({}).call('getDrinkTotals').data).toEqual(zeros);
  });

  it('counts a drink logged at 23:30 Denver toward its own day, not the next', () => {
    const { call } = setup();
    call('logDrink', drink({ logged_at_utc: '2026-10-20T05:30:00Z', amount: 300 })); // 23:30 on the 19th
    call('logDrink', drink({ id: 'x2', logged_at_utc: '2026-10-20T13:00:00Z', amount: 200 }));
    expect(call('getDrinkTotals').data.water_ml).toBe(200);
  });
});

describe('water_goal_ml', () => {
  it('reads 1893 with the row or the whole tab absent, and the stored value after updateSetting', () => {
    expect(setup({ drinks: [] }).call('getDrinkTotals').data.water_goal_ml).toBe(1893);
    const s = setup({ drinks: [], settings: [] });
    expect(s.call('getDrinkTotals').data.water_goal_ml).toBe(1893);
    const res = s.call('updateSetting', { key: 'water_goal_ml', value: 2500 });
    expect(res.data).toEqual({ key: 'water_goal_ml', value: '2500', updated: NOW_ISO });
    expect(s.call('getDrinkTotals').data.water_goal_ml).toBe(2500);
    expect(s.call('getDrinks').data.water_goal_ml).toBe(2500);
  });

  it('rewrites the one row in place on a second update', () => {
    const s = setup({ drinks: [], settings: [] });
    s.call('updateSetting', { key: 'water_goal_ml', value: 2500 });
    s.call('updateSetting', { key: 'water_goal_ml', value: 3000 });
    expect(s.settingRows).toHaveLength(1);
    expect(s.settingRows![0][1]).toBe('3000');
  });

  it('accepts the bounds and refuses anything outside 250-10000 or not whole', () => {
    const s = setup({ drinks: [], settings: [] });
    expect(s.call('updateSetting', { key: 'water_goal_ml', value: 250 }).success).toBe(true);
    expect(s.call('updateSetting', { key: 'water_goal_ml', value: 10000 }).success).toBe(true);
    for (const value of [249, 10001, 0, -1, 1893.5, 'lots', null]) {
      const res = s.call('updateSetting', { key: 'water_goal_ml', value });
      expect(res.success, String(value)).toBe(false);
      expect(res.error).toMatch(/water_goal_ml must be a whole number/);
    }
    expect(s.settingRows![0][1]).toBe('10000');
  });

  it('refuses any other key', () => {
    const s = setup({ drinks: [], settings: [] });
    const res = s.call('updateSetting', { key: 'something_else', value: 1000 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/only water_goal_ml/);
    expect(s.settingRows).toHaveLength(0);
  });

  it('reads a corrupt stored value as the default', () => {
    const s = setup({ drinks: [], settings: [['water_goal_ml', '5', NOW_ISO]] });
    expect(s.call('getDrinkTotals').data.water_goal_ml).toBe(1893);
  });
});

describe('updateDrinkTime', () => {
  it('changes time and updated, and leaves date, amount and logged_at_utc untouched', () => {
    const before = row({ id: 'a' });
    const { call, drinkRows } = setup({ drinks: [row({ id: 'z' }), before] });
    const res = call('updateDrinkTime', { id: 'a', time: '06:45:10' });
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({
      id: 'a', time: '06:45:10', date: '2026-10-20', amount: '250',
      logged_at_utc: '2026-10-20T13:00:00.000Z', source: 'app', created: '2026-10-20T13:00:01.000Z',
      updated: NOW_ISO,
    });
    expect(drinkRows![1].slice(0, 4)).toEqual(['a', 'water', '250', '2026-10-20']);
    expect(drinkRows![1][4]).toBe('06:45:10');
    expect(drinkRows![0][4]).toBe('07:00:00');
  });

  it('refuses an unknown id, and a time that is not HH:MM:SS', () => {
    const { call, drinkRows } = setup({ drinks: [row({ id: 'a' })] });
    expect(call('updateDrinkTime', { id: 'nope', time: '06:45:10' }).error).toMatch(/No drink with that id/);
    for (const time of ['6:45:10', '06:45', '24:00:00', '06:60:00', '', 645, undefined]) {
      expect(call('updateDrinkTime', { id: 'a', time }).error, String(time)).toMatch(/time must be HH:MM:SS/);
    }
    expect(drinkRows![0][4]).toBe('07:00:00');
  });
});

describe('deleteDrink', () => {
  it('removes only that row', () => {
    const { call, drinkRows } = setup({ drinks: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })] });
    const res = call('deleteDrink', { id: 'b' });
    expect(res.success, res.error).toBe(true);
    expect(drinkRows!.map((r) => r[0])).toEqual(['a', 'c']);
  });

  it('refuses an unknown id, and a missing one', () => {
    const { call, drinkRows } = setup({ drinks: [row({ id: 'a' })] });
    expect(call('deleteDrink', { id: 'nope' }).error).toMatch(/No drink with that id/);
    expect(call('deleteDrink', {}).error).toMatch(/id is required/);
    expect(drinkRows).toHaveLength(1);
  });
});

describe('mapping', () => {
  it('DRINK_FIELDS is the nine columns, in order', () => {
    const { sandbox } = setup();
    expect([...sandbox.DRINK_FIELDS]).toEqual([
      'id', 'kind', 'amount', 'date', 'time', 'logged_at_utc', 'source', 'created', 'updated']);
    expect(sandbox.DRINK_COLUMN_COUNT).toBe(9);
    expect([...sandbox.SETTING_FIELDS]).toEqual(['key', 'value', 'updated']);
    expect(sandbox.SETTING_COLUMN_COUNT).toBe(3);
  });
});
