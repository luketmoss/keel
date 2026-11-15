// #933: the tray's own rules, with no screen: what a tap adds, what the footer says, and the one logMeal it sends.
import { describe, expect, it } from 'vitest';
import type { Combo, Food, FoodLogEntry, RecipeSummary, Usual } from '../api/types';
import {
  TRAY_MAX,
  addedMealToast,
  closePromptTitle,
  comboItems,
  comboWhen,
  couldntSave,
  footerText,
  labelFigures,
  lastEntries,
  mealInput,
  pickOption,
  provisionalEntries,
  removeGroup,
  removedMealToast,
  searchTargets,
  setAmount,
  startAmount,
  trayTotals,
  usualItems,
  usualsMatching,
  whenWord,
  type TrayItem,
} from './tray';

function food(id: string, name: string, over: Partial<Food> = {}): Food {
  return {
    id,
    name,
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: 100,
    protein_100g: 10,
    carbs_100g: 10,
    fat_100g: 1,
    servings_json: [{ name: 'cup', g: 100 }],
    source: 'manual',
    created: '',
    updated: '',
    ...over,
  };
}

const RICE = food('fd_rice', 'Rice');
const BEAN = food('fd_bean', 'Beans', { servings_json: null });
const NONE = food('fd_none', 'Mystery', { kcal_100g: null, protein_100g: null, carbs_100g: null, fat_100g: null });
const SOUP = {
  id: 'rc_soup',
  name: 'Soup',
  servings: 4,
  partial: true,
  nutrition: { per_serving: { kcal: 200, protein_g: 5, carbs_g: 20, fat_g: 8 }, missing: [], partial: true },
} as unknown as RecipeSummary;

const item = (over: Partial<TrayItem> & Pick<TrayItem, 'id' | 'target'>): TrayItem => ({
  qty: 1,
  unit: 'cup',
  ...over,
});
const entry = (over: Partial<FoodLogEntry>): FoodLogEntry =>
  ({
    id: 'e',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'cup',
    logged_at: '2026-11-01T10:00:00Z',
    ...over,
  }) as FoodLogEntry;

describe('what a tap adds', () => {
  it('a food goes in at its newest entry’s amount, while that unit is still there', () => {
    const last = lastEntries([
      entry({ id: 'a', food_id: 'fd_rice', qty: 3, unit: 'cup', logged_at: '2026-10-01T10:00:00Z' }),
      entry({ id: 'b', food_id: 'fd_rice', qty: 2, unit: 'cup', logged_at: '2026-11-01T10:00:00Z' }),
    ]);
    expect(startAmount({ kind: 'food', food: RICE }, last)).toEqual({ qty: 2, unit: 'cup' });
  });

  it('falls back to #712’s default when there is no entry or its unit is gone', () => {
    const gone = lastEntries([entry({ food_id: 'fd_rice', qty: 3, unit: 'scoop' })]);
    expect(startAmount({ kind: 'food', food: RICE }, gone)).toEqual({ qty: 1, unit: 'cup' });
    expect(startAmount({ kind: 'food', food: BEAN }, new Map())).toEqual({ qty: 100, unit: 'g' });
    // Grams is always a unit.
    const grams = lastEntries([entry({ food_id: 'fd_bean', qty: 40, unit: 'g' })]);
    expect(startAmount({ kind: 'food', food: BEAN }, grams)).toEqual({ qty: 40, unit: 'g' });
  });

  it('a recipe goes in at its last servings, else 1', () => {
    expect(startAmount({ kind: 'recipe', recipe: SOUP }, new Map())).toEqual({ qty: 1, unit: 'serving' });
    const last = lastEntries([entry({ recipe_id: 'rc_soup', qty: 1.5, unit: 'serving' })]);
    expect(startAmount({ kind: 'recipe', recipe: SOUP }, last)).toEqual({ qty: 1.5, unit: 'serving' });
  });
});

describe('the totals and the footer', () => {
  const rice = item({ id: 'a', target: { kind: 'food', food: RICE }, qty: 2 });
  const bean = item({ id: 'b', target: { kind: 'food', food: BEAN }, qty: 50, unit: 'g' });

  it('adds the known calories, and reads + when a recipe is partial or a food has none', () => {
    expect(trayTotals([rice, bean])).toEqual({ count: 2, kcal: 250, plus: false });
    const soup = item({ id: 'c', target: { kind: 'recipe', recipe: SOUP }, qty: 1, unit: 'serving' });
    expect(trayTotals([rice, soup])).toEqual({ count: 2, kcal: 400, plus: true });
    const none = item({ id: 'd', target: { kind: 'food', food: NONE } });
    expect(trayTotals([rice, none])).toEqual({ count: 2, kcal: 200, plus: true });
    expect(trayTotals([none])).toEqual({ count: 1, kcal: null, plus: true });
    expect(trayTotals([])).toEqual({ count: 0, kcal: null, plus: false });
  });

  it('says it as the note does', () => {
    expect(footerText(trayTotals([rice, bean]), 'Breakfast')).toBe('Add 2 to breakfast · 250 kcal');
    expect(footerText(trayTotals([rice]), 'After dinner')).toBe('Add 1 to after dinner · 200 kcal');
    expect(labelFigures(trayTotals([rice, bean]))).toBe('2 · 250 kcal');
    expect(addedMealToast([{ name: 'Rice' }], 'Snacks')).toBe('Added Rice to snacks');
    expect(addedMealToast([{ name: 'Rice' }, { name: 'Beans' }], 'Snacks')).toBe('Added 2 to snacks');
    expect(removedMealToast([{ name: 'Rice' }, { name: 'Beans' }], 'Snacks')).toBe('Removed 2 from snacks');
    expect(couldntSave(1)).toBe("Couldn't save 1 item.");
    expect(couldntSave(5)).toBe("Couldn't save 5 items.");
    expect(closePromptTitle(1, 'Lunch')).toBe('Add 1 item to lunch?');
    expect(closePromptTitle(5, 'Lunch')).toBe('Add 5 items to lunch?');
  });
});

describe('the one logMeal', () => {
  it('sends every item in order with its id; loose items have no group, each group its own key, name and usual', () => {
    const g1 = { key: 'g1', name: 'Oatmeal', usualId: 'us_1' };
    const g2 = { key: 'g2', name: 'Rice + Beans' };
    const items: TrayItem[] = [
      item({ id: 'lg_a', target: { kind: 'food', food: RICE } }),
      item({ id: 'lg_b', target: { kind: 'food', food: RICE }, group: g1, lineId: 'L1' }),
      item({ id: 'lg_c', target: { kind: 'food', food: BEAN }, qty: 50, unit: 'g', group: g1, lineId: 'L2' }),
      item({ id: 'lg_d', target: { kind: 'recipe', recipe: SOUP }, unit: 'serving' }),
      item({ id: 'lg_e', target: { kind: 'food', food: BEAN }, group: g2 }),
    ];
    expect(mealInput('2026-11-02', 'Breakfast', items)).toEqual({
      date: '2026-11-02',
      slot: 'Breakfast',
      items: [
        { id: 'lg_a', food_id: 'fd_rice', qty: 1, unit: 'cup' },
        {
          id: 'lg_b',
          food_id: 'fd_rice',
          qty: 1,
          unit: 'cup',
          group: { key: 'g1', name: 'Oatmeal', usual_id: 'us_1', usual_line_id: 'L1' },
        },
        {
          id: 'lg_c',
          food_id: 'fd_bean',
          qty: 50,
          unit: 'g',
          group: { key: 'g1', name: 'Oatmeal', usual_id: 'us_1', usual_line_id: 'L2' },
        },
        { id: 'lg_d', recipe_id: 'rc_soup', qty: 1, unit: 'serving' },
        { id: 'lg_e', food_id: 'fd_bean', qty: 1, unit: 'cup', group: { key: 'g2', name: 'Rice + Beans' } },
      ],
    });
  });

  it('the day’s provisional rows carry the figures worked out here and one pending group id a group', () => {
    const g = { key: 'g1', name: 'Oatmeal', usualId: 'us_1' };
    const rows = provisionalEntries('lg_call', '2026-11-02', 'Lunch', [
      item({ id: 'lg_a', target: { kind: 'food', food: RICE }, qty: 2 }),
      item({ id: 'lg_b', target: { kind: 'food', food: RICE }, group: g, lineId: 'L1' }),
      item({ id: 'lg_c', target: { kind: 'food', food: BEAN }, unit: 'g', qty: 50, group: g, lineId: 'L2' }),
    ]);
    expect(rows.map((r) => [r.id, r.kcal, r.group_id])).toEqual([
      ['lg_a', 200, ''],
      ['lg_b', 100, 'lg_call:g1'],
      ['lg_c', 50, 'lg_call:g1'],
    ]);
    expect(rows[1]).toMatchObject({ slot: 'Lunch', date: '2026-11-02', usual_id: 'us_1', usual_line_id: 'L1' });
  });
});

describe('editing and groups', () => {
  const g = { key: 'g1', name: 'Usual' };
  const items: TrayItem[] = [
    item({ id: 'a', target: { kind: 'food', food: RICE } }),
    item({ id: 'b', target: { kind: 'food', food: RICE }, group: g }),
    item({ id: 'c', target: { kind: 'food', food: BEAN }, group: g }),
  ];

  it('sets an amount, removes a group whole, and swaps a pick-one to its option at the option’s amount', () => {
    expect(setAmount(items, 'a', 2.5, 'g').map((i) => [i.qty, i.unit])).toEqual([
      [2.5, 'g'],
      [1, 'cup'],
      [1, 'cup'],
    ]);
    expect(removeGroup(items, 'g1').map((i) => i.id)).toEqual(['a']);
    const next = pickOption(items, 'b', { food_id: 'fd_bean', qty: 75, unit: 'g' }, new Map([[BEAN.id, BEAN]]));
    expect(next[1]).toMatchObject({ qty: 75, unit: 'g', target: { food: { id: 'fd_bean' } }, group: g });
    // A food the sheet doesn't hold changes nothing.
    expect(pickOption(items, 'b', { food_id: 'fd_gone', qty: 1, unit: 'g' }, new Map())).toBe(items);
  });

  it('holds 30', () => {
    expect(TRAY_MAX).toBe(30);
  });
});

describe('usuals, combos and search', () => {
  const foods = new Map([RICE, BEAN].map((f) => [f.id, f]));
  const usual = {
    id: 'us_1',
    name: 'Lunch bowl',
    slot: 'Lunch',
    last_used: null,
    lines: [
      { line_id: 'L1', position: 1, food_id: 'fd_rice', qty: 2, unit: 'cup', options: null, last_pick: '', swaps: [] },
      {
        line_id: 'L2',
        position: 2,
        food_id: '',
        qty: null,
        unit: '',
        options: [
          { food_id: 'fd_rice', qty: 1, unit: 'cup' },
          { food_id: 'fd_bean', qty: 50, unit: 'g' },
        ],
        last_pick: 'fd_bean',
        swaps: [],
      },
      { line_id: 'L3', position: 3, food_id: 'fd_gone', qty: 1, unit: 'cup', options: null, last_pick: '', swaps: [] },
    ],
  } as unknown as Usual;

  it('a usual is its lines as one group: a pick-one at its last pick, a food the library lost left out', () => {
    const made = usualItems(usual, foods);
    expect(made.map((i) => [i.lineId, i.qty, i.unit])).toEqual([
      ['L1', 2, 'cup'],
      ['L2', 50, 'g'],
    ]);
    expect(new Set(made.map((i) => i.group!.key)).size).toBe(1);
    expect(made[0].group).toMatchObject({ name: 'Lunch bowl', usualId: 'us_1' });
    expect(made[1].options).toHaveLength(2);
    // A second tap is a second group.
    expect(usualItems(usual, foods)[0].group!.key).not.toBe(made[0].group!.key);
  });

  it('a combo is its foods as a group named for it, with no usual, a pick-one at its default', () => {
    const combo = {
      key: 'k',
      name: 'Rice + Beans',
      slot: 'Lunch',
      meals: 6,
      last_date: '2026-11-01',
      meal_dates: [],
      lines: [
        { food_id: 'fd_rice', qty: 1, unit: 'cup' },
        {
          options: [
            { food_id: 'fd_rice', qty: 1, unit: 'cup' },
            { food_id: 'fd_bean', qty: 50, unit: 'g' },
          ],
          default: 'fd_bean',
        },
      ],
    } as unknown as Combo;
    const made = comboItems(combo, foods);
    expect(made.map((i) => [i.target.kind === 'food' ? i.target.food.id : '', i.qty, i.unit])).toEqual([
      ['fd_rice', 1, 'cup'],
      ['fd_bean', 50, 'g'],
    ]);
    expect(made[0].group).toMatchObject({ name: 'Rice + Beans' });
    expect(made[0].group!.usualId).toBeUndefined();
    expect(comboWhen(combo, '2026-11-03')).toBe('6 times · last Sunday');
  });

  it('says when in the words of the note', () => {
    expect(whenWord('2026-11-15', '2026-11-15')).toBe('today');
    expect(whenWord('2026-11-14', '2026-11-15')).toBe('yesterday');
    expect(whenWord('2026-11-12', '2026-11-15')).toBe('Thursday');
    expect(whenWord('2026-11-02', '2026-11-15')).toBe('Mon 2 Nov');
  });

  it('search finds foods by name, brand or short name and then recipes; usuals by name or any food', () => {
    const short = food('fd_s', 'Greek yogurt, plain, nonfat', { short_name: 'Yogurt' });
    expect(searchTargets('yogurt', [RICE, short], [])).toHaveLength(1);
    expect(searchTargets('s', [RICE, BEAN], [SOUP]).map((t) => (t.kind === 'food' ? t.food.id : t.recipe.id))).toEqual([
      'fd_bean',
      'rc_soup',
    ]);
    expect(searchTargets('e', [RICE, BEAN], [SOUP], 2)).toHaveLength(2);
    expect(usualsMatching([usual], 'Dinner', 'bean', foods)).toHaveLength(1);
    expect(usualsMatching([usual], 'Dinner', 'bowl', foods)).toHaveLength(1);
    expect(usualsMatching([usual], 'Dinner', 'pizza', foods)).toHaveLength(0);
  });
});
