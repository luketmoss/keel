// #939: the Eaten tab has one copy of the foods and recipes, the Add sheet's held lists. A write anywhere reaches the
// day's rows, the amount preview and the Add sheet together, and an answer that began before a write never undoes it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry, RecipeSummary } from '../api/types';
import { localDate } from '../cook/format';
import { _resetFoods, keepFood } from '../library/foods-store';
import {
  addLists,
  bindAddAccount,
  dropHeldFood,
  heldFoods,
  heldRecipes,
  holdFood,
  holdRecipe,
  refreshAdd,
} from './add-store';
import { dayEntries, editing, loadDay, openEditor, refreshDay, setDraft, _resetEaten } from './eaten-store';
import { entryName } from './format';

const EMAIL = 'luke@example.com';
const today = localDate();

function food(id: string, name: string, kcal = 100): Food {
  return {
    id,
    name,
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: kcal,
    protein_100g: 1,
    carbs_100g: 1,
    fat_100g: 1,
    servings_json: null,
    source: 'manual',
    created: '',
    updated: '',
  };
}

function recipe(id: string, name: string): RecipeSummary {
  return { id, name, servings: 2 } as RecipeSummary;
}

function entry(id: string, food_id: string): FoodLogEntry {
  return {
    id,
    date: today,
    slot: 'Breakfast',
    food_id,
    recipe_id: '',
    qty: 100,
    unit: 'g',
    grams: 100,
    kcal: 100,
    protein_g: 1,
    carbs_g: 1,
    fat_g: 1,
    partial: false,
    source: 'app',
    logged_at: `${today}T08:00:00.000Z`,
    created: 'x',
    updated: 'x',
  } as FoodLogEntry;
}

/** A promise the test settles by hand. */
function held<T>() {
  let release!: (v: T) => void;
  const promise = new Promise<T>((r) => (release = r));
  return { promise, release };
}

/** An API with one apple on today's log; `foods` and `recipes` answer from what the test sets, or a held promise. */
function makeApi(server: { foods: Food[]; recipes: RecipeSummary[] }) {
  const gates: { foods?: Promise<Food[]> } = {};
  const api = {
    getFoodLog: async (from: string) => (from === today ? [entry('lg_1', 'fd_apple')] : []),
    getFoodLogTotals: async () => ({ days: [] }),
    getPlan: async () => ({ entries: [], not_on_trip: 0, late_meals: [] }),
    getFoods: () => gates.foods ?? Promise.resolve(server.foods.map((f) => ({ ...f }))),
    getRecipes: async () => server.recipes.map((r) => ({ ...r })),
    getCombos: async () => ({ combos: [] }),
  } as unknown as ForageApi;
  return { api, gates };
}

const rowName = () => entryName(dayEntries.value[0], heldFoods.value, heldRecipes.value);

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
  _resetFoods();
});
afterEach(() => {
  _resetEaten();
  _resetFoods();
});

describe('one copy of the library (#939)', () => {
  it('a food edited in the Library renames the day’s row and moves its amount preview, with no reload', async () => {
    const { api } = makeApi({ foods: [food('fd_apple', 'Apple', 50)], recipes: [] });
    await loadDay(api);
    expect(rowName()).toBe('Apple');

    keepFood(food('fd_apple', 'Green apple', 200));

    expect(rowName()).toBe('Green apple');
    openEditor(dayEntries.value[0]);
    setDraft(50, 'g');
    // 50 g at the edited 200 kcal / 100 g, not the 50 the day loaded with.
    expect(editing.value?.preview?.kcal).toBe(100);
  });

  it('a food deleted in the Library leaves the Add sheet and its row reads as a removed food', async () => {
    const { api } = makeApi({ foods: [food('fd_apple', 'Apple')], recipes: [] });
    bindAddAccount(EMAIL);
    await loadDay(api);
    await refreshAdd(api, 'Breakfast', today);
    expect(addLists.value?.foods.map((f) => f.id)).toEqual(['fd_apple']);

    dropHeldFood('fd_apple');

    expect(addLists.value?.foods).toEqual([]);
    expect(rowName()).toBe('A removed food');
  });

  it('a food created before the Add sheet ever loaded is held, and the sheet’s first load keeps it', async () => {
    const server = { foods: [food('fd_apple', 'Apple')], recipes: [] as RecipeSummary[] };
    const { api } = makeApi(server);
    bindAddAccount(EMAIL);
    await loadDay(api);
    expect(addLists.value).toBeNull();

    holdFood(food('fd_kale', 'Kale'));
    expect(heldFoods.value.map((f) => f.id)).toEqual(['fd_apple', 'fd_kale']);

    server.foods.push(food('fd_kale', 'Kale'));
    await refreshAdd(api, 'Breakfast', today);
    expect(addLists.value?.foods.map((f) => f.id)).toEqual(['fd_apple', 'fd_kale']);
  });

  it('a food written while the day load is out survives that load’s answer', async () => {
    const { api, gates } = makeApi({ foods: [food('fd_apple', 'Apple')], recipes: [] });
    const slow = held<Food[]>();
    gates.foods = slow.promise;
    const loading = loadDay(api);

    holdFood(food('fd_apple', 'Apple')); // nothing held yet: kept to put back over the answer
    keepFood(food('fd_kale', 'Kale'));
    slow.release([food('fd_apple', 'Apple, old')]);
    await loading;

    expect(heldFoods.value.map((f) => f.name)).toEqual(['Apple', 'Kale']);
    expect(rowName()).toBe('Apple');
  });

  it('a recipe saved anywhere is in the Add sheet’s recipes and the day’s list at once', async () => {
    const { api } = makeApi({ foods: [food('fd_apple', 'Apple')], recipes: [recipe('rc_1', 'Chili')] });
    bindAddAccount(EMAIL);
    await loadDay(api);
    await refreshAdd(api, 'Breakfast', today);

    holdRecipe(recipe('rc_2', 'Soup'));

    expect(heldRecipes.value.map((r) => r.id)).toEqual(['rc_2', 'rc_1']);
    expect(addLists.value?.recipes.map((r) => r.id)).toEqual(['rc_2', 'rc_1']);
  });

  it('a quiet refresh that reads the recipes updates the one list', async () => {
    const server = { foods: [food('fd_apple', 'Apple')], recipes: [recipe('rc_1', 'Chili')] };
    const { api } = makeApi(server);
    bindAddAccount(EMAIL);
    await loadDay(api);
    await refreshAdd(api, 'Breakfast', today);

    server.recipes = [{ ...recipe('rc_1', 'Chili'), name: 'Chili, more beans' }];
    await refreshDay(api, true);

    expect(addLists.value?.recipes.map((r) => r.name)).toEqual(['Chili, more beans']);
  });

  it('keeps the foods a day load read on the device, and another account never sees them', async () => {
    const { api } = makeApi({ foods: [food('fd_apple', 'Apple')], recipes: [] });
    bindAddAccount(EMAIL);
    await loadDay(api);
    await Promise.resolve();
    expect(JSON.parse(localStorage.getItem(`forage_add:${EMAIL}`)!).lists.foods[0].id).toBe('fd_apple');

    bindAddAccount('other@example.com');
    expect(heldFoods.value).toEqual([]);
    bindAddAccount(EMAIL);
    expect(heldFoods.value.map((f) => f.id)).toEqual(['fd_apple']);
  });
});
