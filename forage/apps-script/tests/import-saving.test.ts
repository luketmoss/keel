// #706 Matching and Save: what auto-matches (exact and alias only), learning
// aliases, the save and its refusals, dry runs writing nothing, text escaping
// and the size limits.

import { describe, expect, it } from 'vitest';
import { SheetFormula, loadApi, type Api } from './apps-script-sandbox';

function withFoods(names: string[]): Api {
  const api = loadApi();
  names.forEach((name, i) => api.ok('upsertFood', { payload: { id: `fd_${i + 1}`, name } }));
  return api;
}

function preview(api: Api, recipe: Record<string, unknown>) {
  return api.ok('importRecipe', { payload: { recipe } });
}

function save(api: Api, recipe: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return api.call('importRecipe', { payload: { recipe, dry_run: false, ...extra } });
}

describe('AC: a line is auto-matched only by exact or alias', () => {
  it('sugar against Sugar-apples and Brown sugar is unmatched, with both suggested', () => {
    const api = withFoods(['Sugar-apples', 'Brown sugar', 'Flour']);
    const line = preview(api, { name: 'X', servings: 1, lines: ['1 cup sugar'] }).lines[0];
    expect(line).toMatchObject({ food_id: '', match: null });
    expect(line.suggestions.map((s: { name: string }) => s.name).sort()).toEqual(['Brown sugar', 'Sugar-apples']);
  });

  it('sugar with a food named Sugar is exact; tomatoes matches Tomato', () => {
    const api = withFoods(['Sugar', 'Tomato']);
    const lines = preview(api, { name: 'X', servings: 1, lines: ['1 cup sugar', '3 tomatoes, diced'] }).lines;
    expect(lines[0]).toMatchObject({ food_id: 'fd_1', match: 'exact' });
    expect(lines[1]).toMatchObject({ food_id: 'fd_2', match: 'exact' });
  });

  it('no other rule produces a food_id', () => {
    const library = ['Beef', 'Beef broth', 'Brown sugar', 'Sugar-apples', 'Onion powder', 'Green onion', 'Olive oil',
      'Chicken', 'Garlic powder', 'Cheddar cheese', 'Flour tortilla', 'Milk chocolate'];
    const api = withFoods(library);
    const names = ['beef broth', 'beef', 'sugar', 'onion', 'oil', 'chicken breast', 'garlic', 'cheese', 'flour',
      'chocolate', 'brown sugars', 'fresh beef', 'minced garlic powder', 'olive oils'];
    const lines = preview(api, { name: 'X', servings: 1, lines: names.map((n) => `1 cup ${n}`) }).lines;
    const norm = (s: string) => api.sandbox.normalizeName(s);
    for (const line of lines) {
      const exact = library.find((f) => norm(f) === norm(line.name));
      if (exact) expect(line, line.name).toMatchObject({ match: 'exact', food_id: `fd_${library.indexOf(exact) + 1}` });
      else expect(line, line.name).toMatchObject({ match: null, food_id: '' });
    }
    // Spot checks of what normalising does and does not join.
    expect(lines.find((l: any) => l.name === 'brown sugars')).toMatchObject({ match: 'exact' });
    expect(lines.find((l: any) => l.name === 'fresh beef')).toMatchObject({ match: 'exact' });
    expect(lines.find((l: any) => l.name === 'onion')).toMatchObject({ match: null });
    expect(lines.find((l: any) => l.name === 'chicken breast')).toMatchObject({ match: null });
  });
});

describe('AC: aliases are learned from saves', () => {
  it('a name the user matched is alias-matched on the next preview', () => {
    const api = withFoods(['Granulated sugar']);
    const res = save(api, { name: 'Cookies', servings: 12, lines: [{ text: '1 cup white sugar', qty: 1, unit: 'cup', name: 'white sugar', food_id: 'fd_1' }] });
    expect(res.success).toBe(true);
    const next = preview(api, { name: 'Cake', servings: 8, lines: ['2 cups white sugar'] }).lines[0];
    expect(next).toMatchObject({ food_id: 'fd_1', match: 'alias' });
    expect(JSON.parse(api.ok('getConfig').ingredient_aliases)).toEqual({ 'white sugar': 'fd_1' });
  });

  it('an alias to a deleted food is ignored', () => {
    const api = withFoods(['Granulated sugar']);
    save(api, { name: 'Cookies', servings: 12, lines: [{ text: '1 cup white sugar', name: 'white sugar', food_id: 'fd_1' }] });
    api.ok('deleteRecipe', { payload: { id: api.ok('getRecipes')[0].id } });
    api.ok('deleteFood', { payload: { id: 'fd_1' } });
    expect(preview(api, { name: 'Cake', servings: 8, lines: ['2 cups white sugar'] }).lines[0]).toMatchObject({
      food_id: '',
      match: null,
    });
  });
});

describe('AC: saving with unmatched lines, servings and lines', () => {
  it('a recipe saves with unmatched lines, and the preview says it is partial', () => {
    const api = loadApi();
    const p = preview(api, { name: 'Toast', servings: 1, lines: ['1 slice bread', 'butter, to taste'] });
    expect(p.nutrition.partial).toBe(true);
    expect(p.nutrition.missing).toEqual([{ line_id: 'L1', reason: 'no_food' }]);
    expect(save(api, { name: 'Toast', servings: 1, lines: ['1 slice bread'] }).success).toBe(true);
  });

  it('it cannot be saved without servings or with no lines; the preview lists what it needs', () => {
    const api = loadApi();
    expect(preview(api, { name: 'Toast', lines: ['1 slice bread'] }).needs).toEqual(['servings']);
    expect(save(api, { name: 'Toast', lines: ['1 slice bread'] }).error).toBe('servings is required');
    expect(save(api, { name: 'Toast', servings: 1, lines: [] }).error).toBe('a recipe needs at least one ingredient line');
    expect(save(api, { name: '', servings: 1, lines: ['1 egg'] }).error).toBe('name is required');
    expect(api.rows('Recipes')).toEqual([]);
  });
});

describe('AC: a saved import is stored whole', () => {
  it('the Recipe, a RecipeLines row per line with L1… ids, and a Steps row per step, read back through getRecipe', () => {
    const api = withFoods(['Black beans']);
    const res = save(api, {
      name: 'Beans',
      servings: 2,
      source_url: 'https://www.example.com/beans',
      lines: ['1 (15 oz) can black beans', { text: 'salt, to taste', optional: true, section: 'To finish' }],
      steps: ['Warm the beans.', { text: 'Salt them.', section: 'To finish' }],
    });
    expect(res.success).toBe(true);
    const recipe = api.ok('getRecipe', { id: res.data.id });
    expect(recipe).toMatchObject({ name: 'Beans', servings: 2, source_site: 'example.com' });
    expect(recipe.lines.map((l: any) => [l.line_id, l.section, l.text, l.qty, l.unit, l.food_id, l.grams, l.optional])).toEqual([
      ['L1', '', '1 (15 oz) can black beans', 1, 'can', 'fd_1', 425.2, false],
      ['L2', 'To finish', 'salt, to taste', null, '', '', null, true],
    ]);
    expect(recipe.steps.map((s: any) => [s.position, s.section, s.text])).toEqual([
      [1, '', 'Warm the beans.'],
      [2, 'To finish', 'Salt them.'],
    ]);
  });
});

describe('AC: dry_run writes nothing; a source_url saves once', () => {
  it('a dry run leaves every tab unchanged', () => {
    const api = withFoods(['Egg']);
    const before = JSON.stringify(api.sandbox.TAB_ORDER.map((t: string) => api.rows(t)));
    api.ok('importRecipe', { payload: { text: 'Egg\nServes 1\nIngredients\n1 egg\nSteps\nBoil.' } });
    api.ok('importRecipe', { payload: { recipe: { name: 'Egg', servings: 1, lines: [{ text: '1 egg', food_id: 'fd_1' }] } } });
    expect(JSON.stringify(api.sandbox.TAB_ORDER.map((t: string) => api.rows(t)))).toBe(before);
  });

  it('the same recipe twice with the same source_url is refused the second time, naming it, unless allow_duplicate', () => {
    const api = loadApi();
    const recipe = { name: 'Toast', servings: 1, source_url: 'https://example.com/toast', lines: ['1 slice bread'] };
    const first = save(api, recipe);
    expect(first.success).toBe(true);
    const second = save(api, recipe);
    expect(second).toMatchObject({ success: false, code: 'duplicate', duplicate_of: { id: first.data.id, name: 'Toast' } });
    expect(api.rows('Recipes')).toHaveLength(1);
    expect(preview(api, recipe).duplicate_of).toEqual({ id: first.data.id, name: 'Toast' });
    expect(save(api, recipe, { allow_duplicate: true }).success).toBe(true);
    expect(api.rows('Recipes')).toHaveLength(2);
  });
});

describe('AC: import writes are text', () => {
  it.each(['=1+1', '2026-03-04', '0042'])('%s as a line, a step, a name and a note reads back exactly', (value) => {
    const api = loadApi();
    const res = save(api, { name: value, notes: value, servings: 1, lines: [value], steps: [value] });
    expect(res.success).toBe(true);
    const recipe = api.ok('getRecipe', { id: res.data.id });
    expect([recipe.name, recipe.notes, recipe.lines[0].text, recipe.steps[0].text]).toEqual([value, value, value, value]);
    for (const tab of ['Recipes', 'RecipeLines', 'Steps']) {
      for (const row of api.rows(tab)) for (const c of row) expect(c).not.toBeInstanceOf(SheetFormula);
    }
  });
});

describe('AC: the size limits', () => {
  it('a jsonld or text over 45,000 characters is refused by name', () => {
    const api = loadApi();
    const big = 'x'.repeat(45_001);
    expect(api.call('importRecipe', { payload: { text: big } })).toMatchObject({
      success: false,
      code: 'too_large',
      error: expect.stringMatching(/^text is 45001 characters/),
    });
    expect(api.call('importRecipe', { payload: { jsonld: [big] } }).error).toMatch(/^jsonld is 45001 characters/);
  });

  it("a 30,000-character page's blocks import whole", () => {
    const lines = Array.from({ length: 300 }, (_, i) => `${i + 1} cups ingredient number ${i + 1}, chopped "fine" — notes ${'n'.repeat(48)}`);
    const block = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Recipe', name: 'Big', recipeYield: '4', recipeIngredient: lines });
    expect(block.length).toBeGreaterThan(30_000);
    expect(block.length).toBeLessThan(45_000);
    const p = loadApi().ok('importRecipe', { payload: { jsonld: [block] } });
    expect(p.lines).toHaveLength(300);
    expect(p.lines[299].text).toBe(lines[299]);
  });
});

describe('deleteRecipe in use answers which meals use it', () => {
  it('code in_use with the plan and log entries', () => {
    const api = loadApi();
    const r = save(api, { name: 'Toast', servings: 1, lines: ['1 slice bread'] }).data;
    api.ok('upsertPlanEntry', { payload: { id: 'pl_1', date: '2026-11-02', slot: 'Lunch', recipe_id: r.id } });
    expect(api.call('deleteRecipe', { payload: { id: r.id } })).toMatchObject({
      success: false,
      code: 'in_use',
      uses: { plan: ['pl_1'], log: [] },
    });
  });
});
