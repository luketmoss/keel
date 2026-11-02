// #708: recipe search and sort, the derived cook fields, getCooks with
// recipe_name, a merging upsertCook that defaults to today, and deleteRecipe
// taking the recipe's cook history with it.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

/** Each write gets the next timestamp, so "newest" is the order they were made in. */
function clocked(api: Api): void {
  let n = 0;
  api.sandbox.isoNow = () => new Date(Date.UTC(2026, 9, 1, 12, 0, n++)).toISOString();
}

/** Three recipes, added Stew, then Tacos, then Bread, with a food matched to a Tacos line. */
function library(): Api {
  const api = loadApi();
  clocked(api);
  api.ok('upsertFood', { payload: { id: 'fd_turkey', name: 'Ground turkey' } });
  api.ok('upsertRecipe', {
    payload: {
      id: 'rc_stew',
      name: 'Beef Stew',
      servings: 6,
      lines: [{ text: '2 lb beef chuck' }, { text: '3 carrots' }],
      steps: [{ text: 'Brown the beef.' }],
    },
  });
  api.ok('upsertRecipe', {
    payload: {
      id: 'rc_tacos',
      name: 'Lettuce Wraps',
      servings: 4,
      lines: [{ text: '1 lb meat', food_id: 'fd_turkey' }, { text: '1 head butter lettuce' }],
      steps: [],
    },
  });
  api.ok('upsertRecipe', {
    payload: { id: 'rc_bread', name: 'banana bread', servings: 8, lines: [{ text: '3 ripe bananas' }], steps: [] },
  });
  return api;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('getRecipes q: name, ingredient text and matched food name, ignoring case', () => {
  it('finds by a word in the name, with no matched_line', () => {
    const rows = library().ok('getRecipes', { q: 'STEW' });
    expect(ids(rows)).toEqual(['rc_stew']);
    expect(rows[0].matched_line).toBe('');
  });

  it('finds by a word in an ingredient line, naming the first matching line verbatim', () => {
    const rows = library().ok('getRecipes', { q: 'Carrot' });
    expect(ids(rows)).toEqual(['rc_stew']);
    expect(rows[0].matched_line).toBe('3 carrots');
  });

  it('finds by the name of the food matched to a line', () => {
    const rows = library().ok('getRecipes', { q: 'turkey' });
    expect(ids(rows)).toEqual(['rc_tacos']);
    expect(rows[0].matched_line).toBe('1 lb meat');
  });

  it('answers an empty list for no match, and treats whitespace as no search', () => {
    const api = library();
    expect(api.ok('getRecipes', { q: 'zucchini' })).toEqual([]);
    const all = api.ok('getRecipes', { q: '   ' });
    expect(all).toHaveLength(3);
    expect(all[0]).not.toHaveProperty('matched_line');
  });
});

describe('getRecipes sort', () => {
  function cooked(): Api {
    const api = library();
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-20', rating: 4 } });
    api.ok('upsertCook', { payload: { recipe_id: 'rc_tacos', date: '2026-10-28', rating: 5 } });
    return api;
  }

  it('defaults to newest: last added first', () => {
    expect(ids(library().ok('getRecipes'))).toEqual(['rc_bread', 'rc_tacos', 'rc_stew']);
    expect(ids(library().ok('getRecipes', { sort: 'newest' }))).toEqual(['rc_bread', 'rc_tacos', 'rc_stew']);
  });

  it('name is A to Z, ignoring case', () => {
    expect(ids(library().ok('getRecipes', { sort: 'name' }))).toEqual(['rc_bread', 'rc_stew', 'rc_tacos']);
  });

  it('rating is highest first with unrated last', () => {
    expect(ids(cooked().ok('getRecipes', { sort: 'rating' }))).toEqual(['rc_tacos', 'rc_stew', 'rc_bread']);
  });

  it('last cooked is most recent first with never-cooked last', () => {
    const api = cooked();
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-30' } });
    expect(ids(api.ok('getRecipes', { sort: 'last_cooked' }))).toEqual(['rc_stew', 'rc_tacos', 'rc_bread']);
  });

  it('ties fall back to newest', () => {
    const api = library();
    for (const id of ['rc_stew', 'rc_bread']) api.ok('upsertCook', { payload: { recipe_id: id, date: '2026-10-01', rating: 3 } });
    expect(ids(api.ok('getRecipes', { sort: 'rating' }))).toEqual(['rc_bread', 'rc_stew', 'rc_tacos']);
  });

  it('refuses an unknown sort', () => {
    expect(library().call('getRecipes', { sort: 'spicy' }).error).toBe(
      'sort must be one of newest, name, rating, last_cooked',
    );
  });
});

describe('derived cook fields: rating, last_cooked, cook_count, unrated_cook_id', () => {
  it('are the latest cook\'s, and unrated_cook_id names the latest cook while it has no rating', () => {
    const api = library();
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-04', rating: 5 } });
    const latest = api.ok('upsertCook', { payload: { id: 'ck_late', recipe_id: 'rc_stew', date: '2026-10-20' } });
    const stew = () => api.ok('getRecipes').find((r: { id: string }) => r.id === 'rc_stew');
    expect(stew()).toMatchObject({ rating: 5, last_cooked: '2026-10-20', cook_count: 2, unrated_cook_id: 'ck_late' });
    expect(api.ok('getRecipe', { id: 'rc_stew' })).toMatchObject({ cook_count: 2, unrated_cook_id: 'ck_late' });

    api.ok('upsertCook', { payload: { id: latest.id, rating: 3 } });
    expect(stew()).toMatchObject({ rating: 3, unrated_cook_id: null });
    const bread = api.ok('getRecipes').find((r: { id: string }) => r.id === 'rc_bread');
    expect(bread).toMatchObject({ rating: null, last_cooked: null, cook_count: 0, unrated_cook_id: null });
  });
});

describe('getCooks and upsertCook', () => {
  it('getCooks lists every cook, or one recipe\'s, newest first, each with recipe_name', () => {
    const api = library();
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-04' } });
    api.ok('upsertCook', { payload: { recipe_id: 'rc_tacos', date: '2026-10-28' } });
    const all = api.ok('getCooks');
    expect(all.map((c: { recipe_name: string }) => c.recipe_name)).toEqual(['Lettuce Wraps', 'Beef Stew']);
    expect(api.ok('getCooks', { recipe_id: 'rc_stew' }).map((c: { date: string }) => c.date)).toEqual(['2026-10-04']);
  });

  it('a new cook with no date is today in TIMEZONE; a date sent is kept', () => {
    const api = library();
    const today = api.sandbox.todayLocal();
    const cook = api.ok('upsertCook', { payload: { recipe_id: 'rc_stew' } });
    expect(cook).toMatchObject({ date: today, rating: null, recipe_name: 'Beef Stew' });
    expect(api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-01-02' } }).date).toBe('2026-01-02');
  });

  it('merges: a rating keeps the date and note, a blank rating clears it, a retry leaves one row', () => {
    const api = library();
    const cook = api.ok('upsertCook', { payload: { id: 'ck_1', recipe_id: 'rc_stew', date: '2026-10-04', note: 'Salty' } });
    expect(api.ok('upsertCook', { payload: { id: 'ck_1', rating: 4 } })).toMatchObject({
      date: '2026-10-04',
      note: 'Salty',
      rating: 4,
      created: cook.created,
    });
    expect(api.ok('upsertCook', { payload: { id: 'ck_1', rating: null } }).rating).toBeNull();
    expect(api.ok('upsertCook', { payload: { id: 'ck_1', rating: '' } }).rating).toBeNull();
    api.ok('upsertCook', { payload: { id: 'ck_1', recipe_id: 'rc_stew', date: '2026-10-04' } });
    expect(api.rows('Cooks')).toHaveLength(1);
    expect(api.call('upsertCook', { payload: { id: 'ck_1', rating: 0 } }).error).toMatch(/at least 1/);
  });
});

describe('deleteRecipe deletes the recipe\'s cooks with it', () => {
  it('removes its cooks and leaves another recipe\'s', () => {
    const api = library();
    api.ok('upsertCook', { payload: { recipe_id: 'rc_stew', date: '2026-10-04' } });
    api.ok('upsertCook', { payload: { recipe_id: 'rc_tacos', date: '2026-10-05' } });
    api.ok('deleteRecipe', { payload: { id: 'rc_stew' } });
    expect(api.ok('getCooks').map((c: { recipe_id: string }) => c.recipe_id)).toEqual(['rc_tacos']);
  });

  it('a key caller\'s delete logs the cooks, so forage_undo brings them back', () => {
    const api = library();
    api.ok('upsertCook', { payload: { id: 'ck_1', recipe_id: 'rc_stew', date: '2026-10-04', rating: 4 } });
    api.ok('deleteRecipe', { payload: { id: 'rc_stew', call_id: 'del-1' } });
    expect(api.rows('Cooks')).toEqual([]);
    api.ok('undoCall', { payload: { call_id: 'del-1', confirm: true } });
    expect(api.ok('getCooks')).toMatchObject([{ id: 'ck_1', recipe_id: 'rc_stew', rating: 4 }]);
  });

  it('undoing a recipe\'s creation is refused while it has been cooked since', () => {
    const api = library();
    api.ok('upsertRecipe', { payload: { id: 'rc_new', name: 'Soup', servings: 2, lines: [], steps: [], call_id: 'make-1' } });
    api.ok('upsertCook', { payload: { recipe_id: 'rc_new', date: '2026-10-04' } });
    const res = api.call('undoCall', { payload: { call_id: 'make-1', confirm: true } });
    expect(res.success).toBe(false);
    expect(api.rows('Recipes').some((r) => r[0] === 'rc_new')).toBe(true);
  });
});
