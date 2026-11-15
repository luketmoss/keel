// #877: usuals, their two tabs, the four actions, and what they touch (undo, deleteFood, tokens).

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const CLIENT_ID = 'forage-1234.apps.googleusercontent.com';
const THRIVE_ID = 'thrive-5678.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';

const USUAL_ACTIONS = ['getUsuals', 'getUsual', 'upsertUsual', 'deleteUsual'];

/** Foods per 100 g: oats, three cereals/fruits with their own units, and a food with no nutrition. */
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
  food('fd_corn', 'Corn flakes', 357, [{ name: 'cup', g: 28 }]);
  food('fd_bran', 'Bran flakes', 320, [{ name: 'cup', g: 40 }]);
  food('fd_rice', 'Rice crisps', 380, [{ name: 'cup', g: 30 }]);
  food('fd_mystery', 'Mystery bar', null, [{ name: 'bar', g: 40 }]);
}

const PICK = {
  options: [
    { food_id: 'fd_corn', qty: 1.25, unit: 'cup' },
    { food_id: 'fd_bran', qty: 1, unit: 'cup' },
    { food_id: 'fd_rice', qty: 1, unit: 'cup' },
  ],
};

const OATMEAL = {
  name: 'Oatmeal',
  slot: 'Breakfast',
  lines: [{ food_id: 'fd_oats', qty: 0.5, unit: 'cup' }, { food_id: 'fd_pb', qty: 2, unit: 'tbsp' }, PICK],
};

function loaded() {
  const api = loadApi();
  seed(api);
  return api;
}

describe('ensureSchema (AC 1)', () => {
  it('on a Sheet at version 4 creates Usuals and UsualLines, sets version 7, and a second run changes nothing', () => {
    const api = loadApi({ empty: true });
    api.ok('ensureSchema');
    api.ss.sheets.delete('Usuals');
    api.ss.sheets.delete('UsualLines');
    api.ok('setConfig', { payload: { key: 'schema_version', value: '4' } });
    const data = api.ok('ensureSchema');
    expect(data.created).toEqual(['Usuals', 'UsualLines']);
    expect(data.schema_version).toBe('7');
    expect(api.ss.getSheetByName('Usuals')!.rows).toEqual([['id', 'name', 'slot', 'created', 'updated']]);
    expect(api.ss.getSheetByName('UsualLines')!.rows).toEqual([
      ['usual_id', 'line_id', 'position', 'food_id', 'qty', 'unit', 'options_json', 'last_pick', 'optional'],
    ]);
    const before = JSON.stringify([...api.ss.sheets.entries()].map(([n, s]) => [n, s.rows]));
    const again = api.ok('ensureSchema');
    expect(again.created).toEqual([]);
    expect(JSON.stringify([...api.ss.sheets.entries()].map(([n, s]) => [n, s.rows]))).toBe(before);
  });
});

describe('upsertUsual (AC 2, 3, 5)', () => {
  it('stores 1 usual and 3 lines numbered L1 to L3 and answers getUsual\'s shape', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: OATMEAL });
    expect(usual.id).toMatch(/^us_[0-9a-f]{8}$/);
    expect(api.rows('Usuals')).toHaveLength(1);
    expect(api.rows('UsualLines')).toHaveLength(3);
    expect(usual.lines.map((l: any) => l.line_id)).toEqual(['L1', 'L2', 'L3']);
    expect(usual).toMatchObject({ name: 'Oatmeal', slot: 'Breakfast', used_count: 0, last_used: null });
    expect(api.ok('getUsual', { id: usual.id })).toEqual(usual);
    expect(usual.lines[0]).toMatchObject({ food_id: 'fd_oats', qty: 0.5, unit: 'cup', options: null, last_pick: '' });
  });

  it('keeps the ids sent, and numbers a new line after the highest used', () => {
    const api = loaded();
    const first = api.ok('upsertUsual', { payload: OATMEAL });
    const second = api.ok('upsertUsual', {
      payload: {
        id: first.id,
        name: 'Oatmeal',
        slot: 'Breakfast',
        lines: [
          { line_id: 'L1', food_id: 'fd_oats', qty: 0.5, unit: 'cup' },
          { line_id: 'L3', ...PICK },
          { food_id: 'fd_pb', qty: 1, unit: 'tbsp' },
        ],
      },
    });
    expect(second.lines.map((l: any) => l.line_id)).toEqual(['L1', 'L3', 'L4']);
    expect(api.rows('Usuals')).toHaveLength(1);
    expect(api.rows('UsualLines')).toHaveLength(3);
    expect(second.created).toBe(first.created);
  });

  it('round-trips a pick-one whose options have different amounts and units exactly', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: { ...OATMEAL, lines: [{ ...PICK, last_pick: 'fd_bran' }] } });
    expect(usual.lines[0]).toMatchObject({ food_id: '', qty: null, unit: '', last_pick: 'fd_bran' });
    expect(usual.lines[0].options).toEqual(PICK.options);
    expect(api.ok('getUsual', { id: usual.id }).lines[0].options).toEqual(PICK.options);
  });

  it('allows zero lines, and keeps the stored lines when lines is left out', () => {
    const api = loaded();
    const empty = api.ok('upsertUsual', { payload: { name: 'New', slot: 'Snacks', lines: [] } });
    expect(empty.lines).toEqual([]);
    const usual = api.ok('upsertUsual', { payload: OATMEAL });
    const renamed = api.ok('upsertUsual', { payload: { id: usual.id, name: 'Porridge', slot: 'Breakfast' } });
    expect(renamed.name).toBe('Porridge');
    expect(renamed.lines).toHaveLength(3);
  });

  it('a retry with the same id upserts one usual', () => {
    const api = loaded();
    api.ok('upsertUsual', { payload: { id: 'us_mine', ...OATMEAL } });
    api.ok('upsertUsual', { payload: { id: 'us_mine', ...OATMEAL } });
    expect(api.rows('Usuals')).toHaveLength(1);
    expect(api.rows('UsualLines')).toHaveLength(3);
  });
});

describe('refusals (AC 4): each names the field and writes nothing', () => {
  const cases: [string, any, RegExp][] = [
    ['a blank name', { name: '  ' }, /name is required/],
    ['a name over 120 characters', { name: 'x'.repeat(121) }, /name must be at most 120/],
    ['an unknown slot', { slot: 'Brunch' }, /slot must be one of/],
    ['a missing food', { lines: [{ food_id: 'fd_nope', qty: 1, unit: 'g' }] }, /lines\[1\]\.food_id "fd_nope" is not a food/],
    ['one option', { lines: [{ options: [PICK.options[0]] }] }, /lines\[1\]\.options must have 2 to 12 options, not 1/],
    [
      'thirteen options',
      { lines: [{ options: Array.from({ length: 13 }, () => PICK.options[0]) }] },
      /lines\[1\]\.options must have 2 to 12 options, not 13/,
    ],
    [
      'a repeated food',
      { lines: [{ options: [PICK.options[0], { food_id: 'fd_corn', qty: 2, unit: 'cup' }] }] },
      /lines\[1\]\.options\[2\]\.food_id "fd_corn" is already an option/,
    ],
    [
      'a unit the food does not have',
      { lines: [{ food_id: 'fd_oats', qty: 1, unit: 'tbsp' }] },
      /lines\[1\]\.unit "tbsp" is not one of Oats's servings \(cup, or g\)/,
    ],
    [
      'a unit an option does not have',
      { lines: [{ options: [PICK.options[0], { food_id: 'fd_bran', qty: 1, unit: 'scoop' }] }] },
      /lines\[1\]\.options\[2\]\.unit "scoop"/,
    ],
    ['qty of 0', { lines: [{ food_id: 'fd_oats', qty: 0, unit: 'cup' }] }, /lines\[1\]\.qty must be greater than 0/],
    ['a negative option qty', { lines: [{ options: [{ ...PICK.options[0], qty: -1 }, PICK.options[1]] }] }, /options\[1\]\.qty/],
    ['no qty on an Always line', { lines: [{ food_id: 'fd_oats', unit: 'cup' }] }, /lines\[1\]\.qty is required/],
    [
      'a last_pick that is not an option',
      { lines: [{ ...PICK, last_pick: 'fd_oats' }] },
      /lines\[1\]\.last_pick "fd_oats" is not one of its options/,
    ],
    [
      'a pick-one that also has a food',
      { lines: [{ ...PICK, food_id: 'fd_oats' }] },
      /lines\[1\] is a pick-one, so food_id must be blank/,
    ],
    ['a last_pick on an Always line', { lines: [{ food_id: 'fd_oats', qty: 1, unit: 'cup', last_pick: 'fd_oats' }] }, /lines\[1\]\.last_pick/],
    [
      'a line id sent twice',
      { lines: [{ line_id: 'L1', food_id: 'fd_oats', qty: 1, unit: 'cup' }, { line_id: 'L1', food_id: 'fd_pb', qty: 1, unit: 'tbsp' }] },
      /line_id L1 is sent twice/,
    ],
  ];

  for (const [label, over, message] of cases) {
    it(label, () => {
      const api = loaded();
      const existing = api.ok('upsertUsual', { payload: { id: 'us_kept', ...OATMEAL } });
      const before = JSON.stringify([api.rows('Usuals'), api.rows('UsualLines')]);
      const res = api.call('upsertUsual', { payload: { id: 'us_kept', ...OATMEAL, ...over } });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(message);
      expect(JSON.stringify([api.rows('Usuals'), api.rows('UsualLines')])).toBe(before);
      expect(api.ok('getUsual', { id: 'us_kept' })).toEqual(existing);
    });
  }

  it('writes nothing for a new usual either', () => {
    const api = loaded();
    expect(api.call('upsertUsual', { payload: { name: 'Bad', slot: 'Nope', lines: [] } }).success).toBe(false);
    expect(api.rows('Usuals')).toHaveLength(0);
  });

  it('accepts g, and stores it as g', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: { name: 'G', slot: 'Snacks', lines: [{ food_id: 'fd_oats', qty: 40, unit: 'Grams' }] } });
    expect(usual.lines[0].unit).toBe('g');
  });
});

describe('getUsuals (AC 6, 7)', () => {
  it('start is computeNutrition of the Always lines and each pick-one\'s last_pick, or its first option', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: OATMEAL });
    const expected = (pick: { food_id: string; qty: number; unit: string }) =>
      api.ok('computeNutrition', {
        payload: {
          servings: 1,
          lines: [
            { text: 'oats', food_id: 'fd_oats', qty: 0.5, unit: 'cup' },
            { text: 'pb', food_id: 'fd_pb', qty: 2, unit: 'tbsp' },
            { text: 'pick', ...pick },
          ],
        },
      });
    const first = expected(PICK.options[0]);
    expect(first.partial).toBe(false);
    const start = api.ok('getUsuals')[0].start;
    expect(start).toMatchObject(first.per_serving);
    expect(start.partial).toBe(false);

    const bran = api.ok('upsertUsual', {
      payload: { id: usual.id, ...OATMEAL, lines: [OATMEAL.lines[0], OATMEAL.lines[1], { ...PICK, last_pick: 'fd_bran' }] },
    });
    expect(bran.start).toMatchObject(expected(PICK.options[1]).per_serving);
    expect(bran.start.kcal).not.toBe(first.per_serving.kcal);
  });

  it('is partial when a food has no nutrition, counting the rest', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', {
      payload: { name: 'Bar', slot: 'Snacks', lines: [{ food_id: 'fd_oats', qty: 0.5, unit: 'cup' }, { food_id: 'fd_mystery', qty: 1, unit: 'bar' }] },
    });
    const oatsOnly = api.ok('computeNutrition', { payload: { servings: 1, lines: [{ text: 'o', food_id: 'fd_oats', qty: 0.5, unit: 'cup' }] } });
    expect(usual.start.partial).toBe(false);
    expect(usual.start.kcal).toBe(oatsOnly.per_serving.kcal);
    expect(usual.start.missing).toEqual([{ line_id: 'L2', reason: 'no_nutrition' }]);
  });

  it('is unknown, not 0, when nothing counts', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: { name: 'Empty', slot: 'Snacks', lines: [] } });
    expect(usual.start.kcal).toBeNull();
    expect(usual.start.partial).toBe(false);
  });

  it('returns only the usuals for a slot, sorted by name when none was used', () => {
    const api = loaded();
    api.ok('upsertUsual', { payload: { ...OATMEAL, name: 'Zebra bowl' } });
    api.ok('upsertUsual', { payload: { ...OATMEAL, name: 'Apple bowl' } });
    api.ok('upsertUsual', { payload: { name: 'Cereal', slot: 'After dinner', lines: [PICK] } });
    expect(api.ok('getUsuals').map((u: any) => u.name)).toEqual(['Apple bowl', 'Cereal', 'Zebra bowl']);
    expect(api.ok('getUsuals', { slot: 'Breakfast' }).map((u: any) => u.name)).toEqual(['Apple bowl', 'Zebra bowl']);
    expect(api.call('getUsuals', { slot: 'Brunch' }).success).toBe(false);
  });

  it('getUsual refuses an unknown id', () => {
    expect(loaded().call('getUsual', { id: 'us_nope' }).error).toMatch(/Usual "us_nope" not found/);
  });

  it('counts uses from FoodLog rows with a usual_id, by group, most recent first', () => {
    const api = loaded();
    const a = api.ok('upsertUsual', { payload: { ...OATMEAL, name: 'A' } });
    const b = api.ok('upsertUsual', { payload: { ...OATMEAL, name: 'B' } });
    const log = (usual: any, date: string) =>
      api.ok('logUsual', { payload: { usual_id: usual.id, date, slot: 'Breakfast' } });
    log(b, '2026-11-01');
    log(b, '2026-11-03');
    log(a, '2026-11-02');
    const list = api.ok('getUsuals');
    expect(list.map((u: any) => [u.name, u.used_count, u.last_used])).toEqual([
      ['B', 2, '2026-11-03'],
      ['A', 1, '2026-11-02'],
    ]);
  });
});

describe('deleteUsual (AC 8)', () => {
  it('removes the usual and its lines and leaves every FoodLog row it was not logged from', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: OATMEAL });
    api.ok('logFood', { payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'fd_oats', qty: 0.5, unit: 'cup', dry_run: false } });
    const log = JSON.stringify(api.rows('FoodLog'));
    expect(api.ok('deleteUsual', { payload: { id: usual.id } })).toEqual({ id: usual.id, deleted: true });
    expect(api.rows('Usuals')).toHaveLength(0);
    expect(api.rows('UsualLines')).toHaveLength(0);
    expect(JSON.stringify(api.rows('FoodLog'))).toBe(log);
  });

  it('refuses an unknown id', () => {
    expect(loaded().call('deleteUsual', { payload: { id: 'us_nope' } }).error).toMatch(/not found/);
  });
});

describe('deleteFood (AC 9)', () => {
  it('is refused for a food a usual line uses, and for one only an option uses, naming the usual', () => {
    const api = loaded();
    const usual = api.ok('upsertUsual', { payload: OATMEAL });
    for (const food of ['fd_oats', 'fd_bran']) {
      const res = api.call('deleteFood', { payload: { id: food } });
      expect(res.success).toBe(false);
      expect(res.code).toBe('in_use');
      expect(res.error).toContain(`Oatmeal (${usual.id})`);
      expect((res as any).uses.usuals).toEqual([{ id: usual.id, name: 'Oatmeal' }]);
    }
    expect(api.call('deleteFood', { payload: { id: 'fd_mystery' } }).success).toBe(true);
    api.ok('deleteUsual', { payload: { id: usual.id } });
    expect(api.call('deleteFood', { payload: { id: 'fd_oats' } }).success).toBe(true);
  });
});

describe('MCP change log and undo (AC 10)', () => {
  it('logs upsertUsual and deleteUsual, and undoCall on the delete brings the usual and its lines back', () => {
    const api = loaded();
    const saved = api.ok('upsertUsual', { payload: { ...OATMEAL, call_id: 'save-1' } });
    const logged = api.rows('MCPChangeLog').filter((r) => r[1] === 'save-1').map((r) => r[3]).sort();
    expect(logged).toEqual(['UsualLines', 'UsualLines', 'UsualLines', 'Usuals']);

    const rowsBefore = JSON.stringify([api.rows('Usuals'), api.rows('UsualLines')]);
    api.ok('deleteUsual', { payload: { id: saved.id, call_id: 'del-1' } });
    expect(api.rows('MCPChangeLog').filter((r) => r[1] === 'del-1')).toHaveLength(4);
    const dry = api.ok('undoCall', { payload: { call_id: 'del-1' } });
    expect(dry.dry_run).toBe(true);
    api.ok('undoCall', { payload: { call_id: 'del-1', confirm: true } });
    expect(api.ok('getUsual', { id: saved.id })).toEqual(saved);
    expect(JSON.stringify([api.rows('Usuals'), api.rows('UsualLines')]).length).toBe(rowsBefore.length);
  });

  it('undoing the save removes the usual and its lines', () => {
    const api = loaded();
    const saved = api.ok('upsertUsual', { payload: { ...OATMEAL, call_id: 'save-1' } });
    api.ok('undoCall', { payload: { call_id: 'save-1', confirm: true } });
    expect(api.rows('Usuals')).toHaveLength(0);
    expect(api.rows('UsualLines')).toHaveLength(0);
    expect(api.call('getUsual', { id: saved.id }).success).toBe(false);
  });

  it('refuses to undo a food\'s creation while a usual outside the call uses it', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_new', name: 'New food', servings_json: [{ name: 'cup', g: 50 }], call_id: 'food-1' } });
    api.ok('upsertUsual', { payload: { name: 'U', slot: 'Snacks', lines: [{ food_id: 'fd_new', qty: 1, unit: 'cup' }] } });
    const res = api.call('undoCall', { payload: { call_id: 'food-1', confirm: true } });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Nothing undone/);
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('a token caller\'s usual writes are not logged', () => {
    const api = tokenApi();
    seed(api);
    const before = api.rows('MCPChangeLog').length;
    expect(api.post({ action: 'upsertUsual', access_token: 'tok', payload: OATMEAL }).success).toBe(true);
    expect(api.rows('MCPChangeLog')).toHaveLength(before);
  });
});

function tokenApi(client = CLIENT_ID, extra: Record<string, string> = {}): Api {
  return loadApi({
    properties: { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_THRIVE_CLIENT_ID: THRIVE_ID, TOKEN_ALLOWED_EMAIL: EMAIL, ...extra },
    tokeninfo: () => ({
      status: 200,
      body: JSON.stringify({ aud: client, azp: client, email: EMAIL, email_verified: 'true', expires_in: '3599' }),
    }),
  });
}

describe('callers (AC 11)', () => {
  it('the app\'s token may call all four actions', () => {
    const api = tokenApi();
    // Seed through the key: tokeninfo answers every token the same.
    seed(api);
    const made = api.post({ action: 'upsertUsual', access_token: 'tok', payload: OATMEAL });
    expect(made.success).toBe(true);
    const id = made.data.id;
    expect(api.post({ action: 'getUsuals', access_token: 'tok' }).success).toBe(true);
    expect(api.post({ action: 'getUsual', access_token: 'tok', id }).success).toBe(true);
    expect(api.post({ action: 'deleteUsual', access_token: 'tok', payload: { id } }).success).toBe(true);
  });

  it('the Thrive token may call none', () => {
    const api = tokenApi(THRIVE_ID);
    for (const action of USUAL_ACTIONS) {
      const res = api.post({ action, access_token: 'tok', id: 'us_1', payload: { id: 'us_1', name: 'x', slot: 'Snacks' } });
      expect(res.success, action).toBe(false);
      expect(res.code, action).toBe('not_permitted');
    }
  });
});
