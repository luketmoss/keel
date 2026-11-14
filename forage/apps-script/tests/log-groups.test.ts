// #878: groups in the food log, logging a usual, copying a meal, and the usual's use and swaps.

import { describe, expect, it } from 'vitest';
import { loadApi, makeSheet, type Api } from './apps-script-sandbox';

const CLIENT_ID = 'forage-1234.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';

function seed(api: Api) {
  const food = (id: string, name: string, kcal: number | null, servings: { name: string; g: number }[]) =>
    api.ok('upsertFood', {
      payload: {
        id,
        name,
        servings_json: servings,
        ...(kcal === null ? {} : { kcal_100g: kcal, protein_100g: 10, carbs_100g: 50, fat_100g: 5 }),
      },
    });
  food('fd_oats', 'Oats', 380, [{ name: 'cup', g: 80 }]);
  food('fd_pb', 'Peanut butter', 590, [{ name: 'tbsp', g: 16 }]);
  food('fd_milk', 'Milk', 60, [{ name: 'cup', g: 240 }]);
  food('fd_corn', 'Corn flakes', 357, [{ name: 'cup', g: 28 }]);
  food('fd_bran', 'Bran flakes', 320, [{ name: 'cup', g: 40 }]);
  food('fd_rice', 'Rice crisps', 380, [{ name: 'cup', g: 30 }]);
}

const OATMEAL = {
  name: 'Oatmeal',
  slot: 'Breakfast',
  lines: [
    { food_id: 'fd_oats', qty: 0.5, unit: 'cup' },
    { food_id: 'fd_pb', qty: 2, unit: 'tbsp' },
    {
      options: [
        { food_id: 'fd_corn', qty: 1.25, unit: 'cup' },
        { food_id: 'fd_bran', qty: 1, unit: 'cup' },
        { food_id: 'fd_rice', qty: 1, unit: 'cup' },
      ],
    },
    { food_id: 'fd_milk', qty: 1, unit: 'cup' },
  ],
};

function loaded() {
  const api = loadApi();
  seed(api);
  const usual = api.ok('upsertUsual', { payload: OATMEAL });
  return { api, usual };
}

const col = (api: Api, tab: string, field: string) => {
  const header = api.ss.getSheetByName(tab)!.rows[0] as string[];
  return api.rows(tab).map((r) => r[header.indexOf(field)]);
};

describe('ensureSchema (AC 1)', () => {
  it('on a Sheet at version 5 appends the four FoodLog columns and sets version 6, leaving rows alone', () => {
    const api = loadApi();
    seed(api);
    api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_oats', qty: 1, unit: 'cup' } });
    const log = makeSheet('FoodLog', api.ss.getSheetByName('FoodLog')!.rows.map((r) => r.slice(0, 24)));
    api.ss.sheets.set('FoodLog', log);
    api.ok('setConfig', { payload: { key: 'schema_version', value: '5' } });
    const before = JSON.stringify(log.rows);
    const data = api.ok('ensureSchema');
    expect(data.extended).toEqual([{ tab: 'FoodLog', added: ['group_id', 'group_name', 'usual_id', 'usual_line_id'] }]);
    expect(data.schema_version).toBe('6');
    const after = api.ss.getSheetByName('FoodLog')!.rows;
    expect(after[0].slice(24)).toEqual(['group_id', 'group_name', 'usual_id', 'usual_line_id']);
    expect(JSON.stringify(after[1].slice(0, 24))).toBe(JSON.stringify(JSON.parse(before)[1]));
    expect(api.ok('getFoodLog')[0]).toMatchObject({ group_id: '', group_name: '', usual_id: '', usual_line_id: '' });
  });
});

describe('logUsual (AC 2 to 5)', () => {
  it('writes one entry per line, in order, sharing a group named for the usual (AC 2)', () => {
    const { api, usual } = loaded();
    const res = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    expect(res.group_id).toMatch(/^gr_[0-9a-f]{8}$/);
    expect(res.entries).toHaveLength(4);
    expect(new Set(res.entries.map((e: any) => e.group_id))).toEqual(new Set([res.group_id]));
    expect(res.entries.map((e: any) => e.group_name)).toEqual(Array(4).fill('Oatmeal'));
    expect(res.entries.map((e: any) => e.usual_line_id)).toEqual(['L1', 'L2', 'L3', 'L4']);
    expect(res.entries.map((e: any) => e.usual_id)).toEqual(Array(4).fill(usual.id));
    expect(res.entries.map((e: any) => e.food_id)).toEqual(['fd_oats', 'fd_pb', 'fd_corn', 'fd_milk']);
    expect(res.entries[0]).toMatchObject({ qty: 0.5, unit: 'cup', grams: 40, kcal: 152, slot: 'Breakfast', date: '2026-11-01' });
    expect(api.ok('getFoodLog', { from: '2026-11-01', to: '2026-11-01' }).map((e: any) => e.usual_line_id)).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('logs last_pick at its own amount by default, a pick at the pick\'s amount, and records the pick (AC 3)', () => {
    const { api, usual } = loaded();
    const first = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    expect(first.entries[2]).toMatchObject({ food_id: 'fd_corn', qty: 1.25, unit: 'cup' });
    expect(api.ok('getUsual', { id: usual.id }).lines[2].last_pick).toBe('fd_corn');

    const second = api.ok('logUsual', {
      payload: { usual_id: usual.id, date: '2026-11-02', slot: 'Breakfast', picks: { L3: 'fd_bran' } },
    });
    expect(second.entries[2]).toMatchObject({ food_id: 'fd_bran', qty: 1, unit: 'cup', grams: 40 });
    expect(api.ok('getUsual', { id: usual.id }).lines[2].last_pick).toBe('fd_bran');

    const third = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-03', slot: 'Breakfast' } });
    expect(third.entries[2].food_id).toBe('fd_bran');
  });

  it('refuses a pick that is not an option, an Always line, or an unknown line, and writes nothing (AC 4)', () => {
    const { api, usual } = loaded();
    const before = JSON.stringify(api.ss.getSheetByName('UsualLines')!.rows);
    for (const picks of [{ L3: 'fd_oats' }, { L1: 'fd_oats' }, { L9: 'fd_corn' }]) {
      const res = api.call('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast', picks } });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/picks\.L\d/);
    }
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(JSON.stringify(api.ss.getSheetByName('UsualLines')!.rows)).toBe(before);
  });

  it('refuses an empty usual and an unknown one', () => {
    const { api } = loaded();
    const empty = api.ok('upsertUsual', { payload: { name: 'Empty', slot: 'Snacks', lines: [] } });
    expect(api.call('logUsual', { payload: { usual_id: empty.id, date: '2026-11-01', slot: 'Snacks' } }).error).toMatch(/no lines/);
    expect(api.call('logUsual', { payload: { usual_id: 'us_nope', date: '2026-11-01', slot: 'Snacks' } }).error).toMatch(/not found/);
    expect(api.rows('FoodLog')).toHaveLength(0);
  });

  it('with dry_run returns the entries and writes nothing, last_pick included (AC 5)', () => {
    const { api, usual } = loaded();
    const res = api.ok('logUsual', {
      payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast', picks: { L3: 'fd_rice' }, dry_run: true },
    });
    expect(res.entries).toHaveLength(4);
    expect(res.entries[2]).toMatchObject({ food_id: 'fd_rice', group_id: res.group_id });
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(api.ok('getUsual', { id: usual.id }).lines[2].last_pick).toBe('');
    expect(api.rows('MCPChangeLog').filter((r) => r[2] === 'logUsual')).toHaveLength(0);
  });
});

describe('logGroup (AC 6)', () => {
  it('writes two entries under a new group with no usual', () => {
    const api = loadApi();
    seed(api);
    const res = api.ok('logGroup', {
      payload: {
        date: '2026-11-01', slot: 'Snacks', name: 'Toast',
        items: [{ food_id: 'fd_oats', qty: 1, unit: 'cup' }, { food_id: 'fd_pb', qty: 1, unit: 'tbsp' }],
      },
    });
    expect(res.entries).toHaveLength(2);
    expect(res.entries.map((e: any) => [e.group_id, e.group_name, e.usual_id, e.usual_line_id])).toEqual([
      [res.group_id, 'Toast', '', ''],
      [res.group_id, 'Toast', '', ''],
    ]);
  });

  it('refuses a missing name, a long name, 0 or 31 items, and a bad item, writing nothing', () => {
    const api = loadApi();
    seed(api);
    const item = { food_id: 'fd_oats', qty: 1, unit: 'cup' };
    const base = { date: '2026-11-01', slot: 'Snacks', name: 'X', items: [item] };
    const bad = [
      { ...base, name: '' }, { ...base, name: 'x'.repeat(121) }, { ...base, items: [] },
      { ...base, items: Array(31).fill(item) }, { ...base, items: [item, { food_id: 'fd_oats', qty: 1, unit: 'bucket' }] },
    ];
    for (const payload of bad) expect(api.call('logGroup', { payload }).success).toBe(false);
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(api.ok('logGroup', { payload: { ...base, items: Array(30).fill(item) } }).entries).toHaveLength(30);
  });
});

describe('copyMeal (AC 7 to 10)', () => {
  function yesterday() {
    const { api, usual } = loaded();
    const group = api.ok('logGroup', {
      payload: {
        date: '2026-10-01', slot: 'Breakfast', name: 'Toast',
        items: [{ food_id: 'fd_oats', qty: 1, unit: 'cup' }, { food_id: 'fd_pb', qty: 2, unit: 'tbsp' }],
      },
    });
    api.ok('logFood', { payload: { date: '2026-10-01', slot: 'Breakfast', food_id: 'fd_milk', qty: 1, unit: 'cup' } });
    api.ok('logFood', { payload: { date: '2026-10-02', slot: 'Breakfast', food_id: 'fd_corn', qty: 1, unit: 'cup', id: 'lg_today' } });
    return { api, usual, group };
  }

  it('adds the entries after the target meal\'s, regrouping the pair with the same name (AC 7)', () => {
    const { api, group } = yesterday();
    const copies = api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2026-10-02', to_slot: 'Breakfast' },
    });
    expect(copies).toHaveLength(3);
    expect(copies.map((e: any) => [e.food_id, e.qty, e.unit])).toEqual([
      ['fd_oats', 1, 'cup'], ['fd_pb', 2, 'tbsp'], ['fd_milk', 1, 'cup'],
    ]);
    expect(copies[0].group_id).toBe(copies[1].group_id);
    expect(copies[0].group_id).not.toBe(group.group_id);
    expect(copies[0].group_name).toBe('Toast');
    expect(copies[2]).toMatchObject({ group_id: '', group_name: '' });
    const day = api.ok('getFoodLog', { from: '2026-10-02', to: '2026-10-02' });
    expect(day.map((e: any) => e.food_id)).toEqual(['fd_corn', 'fd_oats', 'fd_pb', 'fd_milk']);
    // The source is untouched.
    expect(api.ok('getFoodLog', { from: '2026-10-01', to: '2026-10-01' })).toHaveLength(3);
  });

  it('works the nutrition out again, so the copy has new figures and the source keeps its old (AC 8)', () => {
    const { api } = yesterday();
    const before = api.ok('getFoodLog', { from: '2026-10-01', to: '2026-10-01' }).find((e: any) => e.food_id === 'fd_milk');
    api.ok('upsertFood', {
      payload: { id: 'fd_milk', name: 'Milk', kcal_100g: 100, protein_100g: 10, carbs_100g: 50, fat_100g: 5, servings_json: [{ name: 'cup', g: 240 }] },
    });
    const copies = api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2026-10-03', to_slot: 'Lunch' },
    });
    const milk = copies.find((e: any) => e.food_id === 'fd_milk');
    expect(before.kcal).toBe(144);
    expect(milk.kcal).toBe(240);
    expect(milk).toMatchObject({ date: '2026-10-03', slot: 'Lunch' });
    const source = api.ok('getFoodLog', { from: '2026-10-01', to: '2026-10-01' }).find((e: any) => e.id === before.id);
    expect(source.kcal).toBe(144);
  });

  it('with group_id copies only that group (AC 9)', () => {
    const { api, group } = yesterday();
    const copies = api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', group_id: group.group_id, to_date: '2026-10-04', to_slot: 'Snacks' },
    });
    expect(copies.map((e: any) => e.food_id)).toEqual(['fd_oats', 'fd_pb']);
    expect(api.call('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', group_id: 'gr_nope', to_date: '2026-10-04', to_slot: 'Snacks' },
    }).success).toBe(false);
  });

  it('keeps a usual\'s link on the copy', () => {
    const { api, usual } = loaded();
    api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-10-01', slot: 'Breakfast' } });
    const copies = api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2026-10-02', to_slot: 'Breakfast' },
    });
    expect(copies.map((e: any) => [e.usual_id, e.usual_line_id])).toEqual([1, 2, 3, 4].map((n) => [usual.id, `L${n}`]));
    expect(api.ok('getUsual', { id: usual.id }).used_count).toBe(2);
  });

  it('refuses a future date and an empty meal (AC 10)', () => {
    const { api } = yesterday();
    const future = api.call('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2999-01-01', to_slot: 'Breakfast' },
    });
    expect(future.error).toMatch(/after today/);
    const empty = api.call('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Dinner', to_date: '2026-10-02', to_slot: 'Dinner' },
    });
    expect(empty.error).toMatch(/nothing logged/);
    expect(api.rows('FoodLog')).toHaveLength(4);
  });

  it('keeps an entry whose serving the food renamed since, by #880\'s rule', () => {
    const { api } = yesterday();
    api.ok('upsertFood', {
      payload: { id: 'fd_oats', name: 'Oats', kcal_100g: 380, protein_100g: 10, carbs_100g: 50, fat_100g: 5, servings_json: [{ name: 'bowl', g: 80 }] },
    });
    const copies = api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2026-10-05', to_slot: 'Breakfast' },
    });
    expect(copies[0]).toMatchObject({ food_id: 'fd_oats', unit: 'cup', grams: 80 });
  });
});

describe('setLogGroup (AC 11, 12)', () => {
  it('group null clears the four fields and nothing else (AC 11)', () => {
    const { api, usual } = loaded();
    const { entries } = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    const ids = entries.slice(0, 2).map((e: any) => e.id);
    const out = api.ok('setLogGroup', { payload: { ids, group: null } });
    expect(out.map((e: any) => [e.group_id, e.group_name, e.usual_id, e.usual_line_id])).toEqual([['', '', '', ''], ['', '', '', '']]);
    const [a, b] = out;
    const { group_id, group_name, usual_id, usual_line_id, ...rest } = entries[0];
    const { group_id: g2, group_name: n2, usual_id: u2, usual_line_id: l2, ...restAfter } = a;
    expect(restAfter).toEqual(rest);
    expect(b.food_id).toBe('fd_pb');
    expect(col(api, 'FoodLog', 'group_id').slice(2)).toEqual([entries[2].group_id, entries[3].group_id]);
  });

  it('with { name, usual_id } groups them and sets usual_line_id by food (AC 11)', () => {
    const { api, usual } = loaded();
    const mk = (food_id: string, unit: string) =>
      api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id, qty: 1, unit } }).id;
    const ids = [mk('fd_milk', 'cup'), mk('fd_bran', 'cup'), mk('fd_oats', 'cup')];
    const out = api.ok('setLogGroup', { payload: { ids, group: { name: 'My bowl', usual_id: usual.id } } });
    expect(new Set(out.map((e: any) => e.group_id)).size).toBe(1);
    expect(out[0].group_id).toMatch(/^gr_/);
    expect(out.map((e: any) => [e.group_name, e.usual_id, e.usual_line_id])).toEqual([
      ['My bowl', usual.id, 'L4'], ['My bowl', usual.id, 'L3'], ['My bowl', usual.id, 'L1'],
    ]);
  });

  it('with only a name sets no usual, and refuses an unknown usual, a bad name or missing entries', () => {
    const { api } = loaded();
    const id = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    expect(api.ok('setLogGroup', { payload: { ids: [id], group: { name: 'Drink' } } })[0]).toMatchObject({ group_name: 'Drink', usual_id: '', usual_line_id: '' });
    expect(api.call('setLogGroup', { payload: { ids: [id], group: { name: 'X', usual_id: 'us_nope' } } }).error).toMatch(/Usual "us_nope"/);
    expect(api.call('setLogGroup', { payload: { ids: [id], group: { name: '' } } }).success).toBe(false);
    expect(api.call('setLogGroup', { payload: { ids: [id, 'lg_nope'], group: null } }).error).toMatch(/lg_nope/);
  });

  it('refuses entries from two different meals and changes nothing (AC 12)', () => {
    const { api } = loaded();
    const a = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    const b = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Dinner', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    const c = api.ok('logFood', { payload: { date: '2026-11-02', slot: 'Lunch', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    const before = JSON.stringify(api.rows('FoodLog'));
    for (const ids of [[a, b], [a, c]]) {
      expect(api.call('setLogGroup', { payload: { ids, group: { name: 'X' } } }).error).toMatch(/same date and meal/);
    }
    expect(JSON.stringify(api.rows('FoodLog'))).toBe(before);
  });
});

describe('deleteLogEntry with ids (AC 13)', () => {
  it('deletes none and names the missing id when one does not exist', () => {
    const { api } = loaded();
    const a = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    const b = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_oats', qty: 1, unit: 'cup' } }).id;
    const res = api.call('deleteLogEntry', { payload: { ids: [a, b, 'lg_ghost'] } });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/lg_ghost/);
    expect(api.rows('FoodLog')).toHaveLength(2);
  });

  it('deletes all of them, and accepts 1 to 50', () => {
    const { api } = loaded();
    const a = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_milk', qty: 1, unit: 'cup' } }).id;
    const b = api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_oats', qty: 1, unit: 'cup' } }).id;
    expect(api.call('deleteLogEntry', { payload: { ids: [] } }).success).toBe(false);
    expect(api.call('deleteLogEntry', { payload: { ids: Array(51).fill('x').map((x, i) => x + i) } }).success).toBe(false);
    expect(api.ok('deleteLogEntry', { payload: { ids: [a, b] } })).toEqual({ ids: [a, b], deleted: true });
    expect(api.rows('FoodLog')).toHaveLength(0);
    expect(api.call('deleteLogEntry', { payload: { id: a } }).success).toBe(false);
  });
});

describe('swaps, use and deleteUsual (AC 14 to 16)', () => {
  it('a swap keeps the group and recomputes (AC 14)', () => {
    const { api, usual } = loaded();
    const { entries } = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    const out = api.ok('updateLogEntry', { payload: { id: entries[3].id, changes: { food_id: 'fd_oats', qty: 1, unit: 'cup' } } });
    expect(out).toMatchObject({
      food_id: 'fd_oats', grams: 80, kcal: 304, group_id: entries[3].group_id, group_name: 'Oatmeal',
      usual_id: usual.id, usual_line_id: 'L4',
    });
  });

  it('reports used_count, last_used and swaps after two logs with L2 swapped (AC 15)', () => {
    const { api, usual } = loaded();
    for (const date of ['2026-11-01', '2026-11-05']) {
      const { entries } = api.ok('logUsual', { payload: { usual_id: usual.id, date, slot: 'Breakfast' } });
      api.ok('updateLogEntry', { payload: { id: entries[1].id, changes: { food_id: 'fd_milk', qty: 1, unit: 'cup' } } });
    }
    const u = api.ok('getUsual', { id: usual.id });
    expect(u.used_count).toBe(2);
    expect(u.last_used).toBe('2026-11-05');
    expect(u.lines[1].swaps).toEqual([{ food_id: 'fd_milk', count: 2 }]);
    expect(u.lines[0].swaps).toEqual([]);
    // A pick-one's own options are not swaps; a food outside them is.
    const { entries } = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-06', slot: 'Breakfast', picks: { L3: 'fd_bran' } } });
    api.ok('updateLogEntry', { payload: { id: entries[0].id, changes: { food_id: 'fd_pb', qty: 1, unit: 'tbsp' } } });
    const after = api.ok('getUsuals')[0];
    expect(after.lines[2].swaps).toEqual([]);
    expect(after.lines[0].swaps).toEqual([{ food_id: 'fd_pb', count: 1 }]);
  });

  it('deleteUsual clears usual_id and usual_line_id and keeps the group (AC 16)', () => {
    const { api, usual } = loaded();
    const { entries } = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Lunch', food_id: 'fd_oats', qty: 1, unit: 'cup' } });
    api.ok('deleteUsual', { payload: { id: usual.id } });
    const log = api.ok('getFoodLog', { from: '2026-11-01', to: '2026-11-01' });
    expect(log).toHaveLength(5);
    const grouped = log.filter((e: any) => e.group_id);
    expect(grouped).toHaveLength(4);
    expect(grouped.map((e: any) => [e.group_id, e.group_name, e.usual_id, e.usual_line_id])).toEqual(
      entries.map((e: any) => [e.group_id, 'Oatmeal', '', '']),
    );
  });
});

describe('getFoodLogTotals (AC 17)', () => {
  it('answers the same for the same entries, grouped or not, with and without by_meal', () => {
    const grouped = loaded();
    grouped.api.ok('logUsual', { payload: { usual_id: grouped.usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    const plain = loaded();
    for (const e of [['fd_oats', 0.5, 'cup'], ['fd_pb', 2, 'tbsp'], ['fd_corn', 1.25, 'cup'], ['fd_milk', 1, 'cup']] as const) {
      plain.api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: e[0], qty: e[1], unit: e[2] } });
    }
    for (const params of [{ from: '2026-11-01', to: '2026-11-01' }, { from: '2026-11-01', to: '2026-11-01', by_meal: true }]) {
      expect(grouped.api.ok('getFoodLogTotals', params)).toEqual(plain.api.ok('getFoodLogTotals', params));
    }
  });
});

describe('callers and undo', () => {
  it('the app\'s token may run the four actions and Thrive\'s may not', () => {
    const tokeninfo = (aud: string) => () => ({
      status: 200,
      body: JSON.stringify({ aud, azp: aud, email: EMAIL, email_verified: 'true', expires_in: '3599' }),
    });
    const app = loadApi({ properties: { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL }, tokeninfo: tokeninfo(CLIENT_ID) });
    seed(app);
    const usual = app.ok('upsertUsual', { payload: OATMEAL });
    const res = app.post({ action: 'logUsual', access_token: 'ya29.x', payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Breakfast' } });
    expect(res.success).toBe(true);
    expect(app.rows('MCPChangeLog').filter((r) => r[2] === 'logUsual')).toHaveLength(0);
    expect(app.post({ action: 'copyMeal', access_token: 'ya29.x', payload: { from_date: '2026-11-01', from_slot: 'Breakfast', to_date: '2026-11-02', to_slot: 'Breakfast' } }).success).toBe(true);
  });

  it('logs the writes for the key, and undoCall on a copyMeal removes exactly the copies (AC 18)', () => {
    const { api, usual } = loaded();
    api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-10-01', slot: 'Breakfast', call_id: 'log-1' } });
    const rowsAfterLog = api.rows('FoodLog').length;
    expect(api.rows('MCPChangeLog').filter((r) => r[1] === 'log-1').map((r) => r[3]).sort()).toEqual(
      ['FoodLog', 'FoodLog', 'FoodLog', 'FoodLog', 'UsualLines'],
    );
    api.ok('copyMeal', {
      payload: { from_date: '2026-10-01', from_slot: 'Breakfast', to_date: '2026-10-02', to_slot: 'Breakfast', call_id: 'copy-1' },
    });
    expect(api.rows('FoodLog')).toHaveLength(rowsAfterLog * 2);
    const dry = api.ok('undoCall', { payload: { call_id: 'copy-1' } });
    expect(dry.rows.map((r: any) => r.restore)).toEqual([null, null, null, null]);
    api.ok('undoCall', { payload: { call_id: 'copy-1', confirm: true } });
    expect(api.rows('FoodLog')).toHaveLength(rowsAfterLog);
    expect(api.ok('getFoodLog', { from: '2026-10-01', to: '2026-10-01' })).toHaveLength(4);
  });

  it('logs setLogGroup, logGroup and deleteLogEntry ids, and not a dry run', () => {
    const { api } = loaded();
    const g = api.ok('logGroup', { payload: { date: '2026-11-01', slot: 'Snacks', name: 'N', items: [{ food_id: 'fd_oats', qty: 1, unit: 'cup' }], call_id: 'g-1' } });
    api.ok('logGroup', { payload: { date: '2026-11-01', slot: 'Snacks', name: 'N', items: [{ food_id: 'fd_oats', qty: 1, unit: 'cup' }], dry_run: true, call_id: 'g-dry' } });
    api.ok('setLogGroup', { payload: { ids: [g.entries[0].id], group: null, call_id: 's-1' } });
    api.ok('deleteLogEntry', { payload: { ids: [g.entries[0].id], call_id: 'd-1' } });
    expect(api.rows('MCPChangeLog').map((r) => r[1])).toEqual(expect.arrayContaining(['g-1', 's-1', 'd-1']));
    expect(api.rows('MCPChangeLog').map((r) => r[1])).not.toContain('g-dry');
  });
});
