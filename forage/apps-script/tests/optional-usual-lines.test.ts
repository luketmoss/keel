// #942: optional usual lines. A line is every time (''), usually in ('in') or sometimes ('out').

import { describe, expect, it } from 'vitest';
import { loadApi, makeSheet, type Api } from './apps-script-sandbox';

function seed(api: Api) {
  const food = (id: string, name: string, kcal: number, servings: { name: string; g: number }[]) =>
    api.ok('upsertFood', {
      payload: { id, name, servings_json: servings, kcal_100g: kcal, protein_100g: 10, carbs_100g: 50, fat_100g: 5 },
    });
  food('fd_oats', 'Oats', 400, [{ name: 'cup', g: 100 }]);
  food('fd_apple', 'Apple', 50, [{ name: 'each', g: 100 }]);
  food('fd_pear', 'Pear', 60, [{ name: 'each', g: 100 }]);
  food('fd_feta', 'Feta', 300, [{ name: 'oz', g: 28 }]);
}

const SALAD = {
  name: 'Salad',
  slot: 'Lunch',
  lines: [
    { food_id: 'fd_oats', qty: 1, unit: 'cup' }, // L1 every time
    { food_id: 'fd_feta', qty: 1, unit: 'oz', optional: 'out' }, // L2 sometimes
    {
      options: [
        { food_id: 'fd_apple', qty: 1, unit: 'each' },
        { food_id: 'fd_pear', qty: 2, unit: 'each' },
      ],
      optional: 'in',
    }, // L3 usually in
  ],
};

function loaded() {
  const api = loadApi();
  seed(api);
  return { api, usual: api.ok('upsertUsual', { payload: SALAD }) };
}

const log = (api: Api, id: string, picks?: Record<string, string | null>) =>
  api.call('logUsual', { payload: { usual_id: id, date: '2026-11-01', slot: 'Lunch', ...(picks ? { picks } : {}) } });

describe('upsertUsual optional', () => {
  it('stores it on Always and pick-one lines, and reads it back; a blank one reads as an empty string', () => {
    const { api, usual } = loaded();
    expect(usual.lines.map((l: any) => l.optional)).toEqual(['', 'out', 'in']);
    expect(api.ok('getUsuals')[0].lines.map((l: any) => l.optional)).toEqual(['', 'out', 'in']);
    const header = api.ss.getSheetByName('UsualLines')!.rows[0] as string[];
    expect(header[header.length - 1]).toBe('optional');
  });

  it('refuses any other value, naming lines[n].optional, and writes nothing', () => {
    const { api } = loaded();
    const res = api.call('upsertUsual', {
      payload: { name: 'Bad', slot: 'Lunch', lines: [{ food_id: 'fd_oats', qty: 1, unit: 'cup', optional: 'maybe' }] },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/lines\[1\]\.optional/);
    expect(api.ok('getUsuals')).toHaveLength(1);
  });
});

describe('logUsual with optional lines', () => {
  it('logs an in line and not an out line when there are no picks', () => {
    const { api, usual } = loaded();
    const res = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Lunch' } });
    expect(res.entries.map((e: any) => e.usual_line_id)).toEqual(['L1', 'L3']);
    expect(new Set(res.entries.map((e: any) => e.group_id)).size).toBe(1);
  });

  it('leaves a line out with null and keeps its last_pick', () => {
    const { api, usual } = loaded();
    api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Lunch', picks: { L3: 'fd_pear' } } });
    const res = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-02', slot: 'Lunch', picks: { L3: null } } });
    expect(res.entries.map((e: any) => e.usual_line_id)).toEqual(['L1']);
    expect(api.ok('getUsual', { id: usual.id }).lines[2].last_pick).toBe('fd_pear');
  });

  it('brings in an out single-food line by naming its own food, at the line amount', () => {
    const { api, usual } = loaded();
    const res = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Lunch', picks: { L2: 'fd_feta' } } });
    expect(res.entries.map((e: any) => e.usual_line_id)).toEqual(['L1', 'L2', 'L3']);
    expect(res.entries[1]).toMatchObject({ food_id: 'fd_feta', qty: 1, unit: 'oz' });
  });

  it('still logs an optional pick-one\'s option pick', () => {
    const { api, usual } = loaded();
    const res = api.ok('logUsual', { payload: { usual_id: usual.id, date: '2026-11-01', slot: 'Lunch', picks: { L3: 'fd_pear' } } });
    expect(res.entries[1]).toMatchObject({ food_id: 'fd_pear', qty: 2 });
  });

  it('refuses null for a non-optional line, naming it, and a food pick on one; writes nothing', () => {
    const { api, usual } = loaded();
    expect(log(api, usual.id, { L1: null }).error).toMatch(/picks\.L1/);
    expect(log(api, usual.id, { L1: 'fd_oats' }).error).toMatch(/Always line/);
    expect(log(api, usual.id, { L2: 'fd_apple' }).error).toMatch(/picks\.L2/);
    expect(api.rows('FoodLog')).toHaveLength(0);
  });

  it('refuses a usual whose every line is left out', () => {
    const api = loadApi();
    seed(api);
    const usual = api.ok('upsertUsual', {
      payload: { name: 'Toppings', slot: 'Lunch', lines: [{ food_id: 'fd_feta', qty: 1, unit: 'oz', optional: 'out' }] },
    });
    const res = log(api, usual.id);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/nothing would be logged/);
    expect(api.rows('FoodLog')).toHaveLength(0);
  });
});

describe('start nutrition and undo', () => {
  it('counts in and every-time lines and leaves out lines out', () => {
    const { api, usual } = loaded();
    // oats 100 g × 4 = 400 + apple 100 g × 0.5 = 50
    expect(usual.start.kcal).toBe(450);
    const all = api.ok('upsertUsual', {
      payload: { id: usual.id, name: 'Salad', slot: 'Lunch', lines: usual.lines.map((l: any) => ({ ...l, optional: '' })) },
    });
    expect(all.start.kcal).toBe(450 + 84);
  });
});

describe('ensureSchema', () => {
  it('on a Sheet at version 6 appends the optional header to UsualLines, keeps its rows, and sets version 7', () => {
    const { api, usual } = loaded();
    const old = api.ss.getSheetByName('UsualLines')!.rows.map((r) => r.slice(0, 8));
    api.ss.sheets.set('UsualLines', makeSheet('UsualLines', old));
    api.ok('setConfig', { payload: { key: 'schema_version', value: '6' } });
    const data = api.ok('ensureSchema');
    expect(data.extended).toEqual([{ tab: 'UsualLines', added: ['optional'] }]);
    expect(data.schema_version).toBe('7');
    expect(api.ss.getSheetByName('UsualLines')!.rows[0][8]).toBe('optional');
    // A row from before reads as every time.
    expect(api.ok('getUsual', { id: usual.id }).lines.map((l: any) => l.optional)).toEqual(['', '', '']);
  });
});

describe('undo', () => {
  it('a change to a line optional is logged and undoCall reverts it', () => {
    const { api, usual } = loaded();
    const lines = usual.lines.map((l: any) =>
      l.options
        ? { line_id: l.line_id, options: l.options, optional: 'out' }
        : { line_id: l.line_id, food_id: l.food_id, qty: l.qty, unit: l.unit, optional: 'out' },
    );
    api.ok('upsertUsual', { payload: { id: usual.id, name: 'Salad', slot: 'Lunch', lines, call_id: 'save-1' } });
    expect(api.ok('getUsual', { id: usual.id }).lines.map((l: any) => l.optional)).toEqual(['out', 'out', 'out']);
    api.ok('undoCall', { payload: { call_id: 'save-1', confirm: true } });
    expect(api.ok('getUsual', { id: usual.id }).lines.map((l: any) => l.optional)).toEqual(['', 'out', 'in']);
  });
});
