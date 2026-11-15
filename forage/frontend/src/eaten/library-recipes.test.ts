// #941: a recipe changed or deleted in the Library reaches the Eaten tab's one copy of the recipes (#939), the one the
// day's rows, the amount preview and the Add sheet read, with one call from the Library's store.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ForageApi } from '../api/client';
import type { FoodLogEntry, RecipeDetail, RecipeSummary } from '../api/types';
import { localDate } from '../cook/format';
import { addRecipe, deleteRecipe, patchRecipe, recipes, _resetRecipes } from '../library/recipes-store';
import { addLists, beginAddPass, bindAddAccount, heldRecipes, refreshAdd } from './add-store';
import { dayEntries, editing, loadDay, openEditor, setDraft, _resetEaten } from './eaten-store';

const EMAIL = 'luke@example.com';
const today = localDate();

function summary(id: string, name: string, kcal: number, over: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    name,
    servings: 2,
    created: '2026-11-01T00:00:00.000Z',
    rating: null,
    last_cooked: null,
    nutrition: {
      per_serving: { kcal, protein_g: 10, carbs_g: 10, fat_g: 10 },
      partial: false,
    },
    ...over,
  } as unknown as RecipeSummary;
}

/** A recipe as a write answers it: the summary with its lines, steps and walkthrough. */
function detail(s: RecipeSummary): RecipeDetail {
  return { ...s, lines: [], steps: [], walkthrough: null, walkthrough_check: null } as unknown as RecipeDetail;
}

function recipeEntry(id: string, recipe_id: string): FoodLogEntry {
  return {
    id,
    date: today,
    slot: 'Dinner',
    food_id: '',
    recipe_id,
    qty: 1,
    unit: 'serving',
    grams: null,
    kcal: 400,
    protein_g: 10,
    carbs_g: 10,
    fat_g: 10,
    partial: false,
    source: 'app',
    logged_at: `${today}T18:00:00.000Z`,
    created: 'x',
    updated: 'x',
  } as unknown as FoodLogEntry;
}

/** An API with one serving of chili on today's log; recipes answer from `server`, or a held promise. */
function makeApi(server: { recipes: RecipeSummary[] }) {
  const gates: { recipes?: Promise<RecipeSummary[]> } = {};
  const api = {
    getFoodLog: async (from: string) => (from === today ? [recipeEntry('lg_1', 'rc_chili')] : []),
    getFoodLogTotals: async () => ({ days: [] }),
    getPlan: async () => ({ entries: [], not_on_trip: 0, late_meals: [] }),
    getFoods: async () => [],
    getRecipes: () => gates.recipes ?? Promise.resolve(server.recipes.map((r) => ({ ...r }))),
    getCombos: async () => ({ combos: [] }),
    deleteRecipe: async () => undefined,
  } as unknown as ForageApi;
  return { api, gates };
}

/** Load the day and open the Add sheet once, so every list is held. */
async function loadAll(api: ForageApi) {
  bindAddAccount(EMAIL);
  await loadDay(api);
  await refreshAdd(api, 'Dinner', today);
}

beforeEach(() => {
  localStorage.clear();
  _resetEaten();
  _resetRecipes();
});
afterEach(() => {
  _resetEaten();
  _resetRecipes();
});

describe('a recipe changed in the Library reaches the Eaten tab (#941)', () => {
  it('nutrition fixed in the Library moves the Add sheet’s kcal and the amount preview, with no reload', async () => {
    const { api } = makeApi({
      recipes: [
        summary('rc_chili', 'Chili', 400, {
          nutrition: { per_serving: { kcal: 400, protein_g: 10, carbs_g: 10, fat_g: 10 }, partial: true },
        } as never),
      ],
    });
    await loadAll(api);

    // A line matched to a food in the Library's Nutrition sheet: 500 kcal a serving, no longer partial.
    patchRecipe(detail(summary('rc_chili', 'Chili', 500)));

    expect(addLists.value?.recipes.find((r) => r.id === 'rc_chili')?.nutrition.per_serving.kcal).toBe(500);
    openEditor(dayEntries.value[0]);
    setDraft(2, 'serving');
    expect(editing.value?.preview?.kcal).toBe(1000);
  });

  it('a cook logged or rated in the Library carries its rating and last cooked into the held recipe', async () => {
    const { api } = makeApi({ recipes: [summary('rc_chili', 'Chili', 400)] });
    await loadAll(api);

    patchRecipe(detail(summary('rc_chili', 'Chili', 400, { rating: 5, last_cooked: today } as never)));

    const held = heldRecipes.value.find((r) => r.id === 'rc_chili') as unknown as {
      rating: number;
      last_cooked: string;
    };
    expect(held.rating).toBe(5);
    expect(held.last_cooked).toBe(today);
  });

  it('reaches the Eaten tab when the Library’s search hides the recipe', async () => {
    const { api } = makeApi({ recipes: [summary('rc_chili', 'Chili', 400)] });
    await loadAll(api);
    expect(recipes.value).toEqual([]); // the Library's list hasn't loaded, as a search with no match leaves it

    patchRecipe(detail(summary('rc_chili', 'Chili, smoky', 400)));

    expect(heldRecipes.value.map((r) => r.name)).toEqual(['Chili, smoky']);
  });

  it('a recipe deleted in the Library leaves the Add sheet and the copy kept on the device', async () => {
    const { api } = makeApi({ recipes: [summary('rc_chili', 'Chili', 400), summary('rc_soup', 'Soup', 200)] });
    await loadAll(api);

    expect(await deleteRecipe(api, 'rc_soup')).toBeNull();

    expect(addLists.value?.recipes.map((r) => r.id)).toEqual(['rc_chili']);
    await Promise.resolve();
    const kept = JSON.parse(localStorage.getItem(`forage_add:${EMAIL}`)!);
    expect(kept.lists.recipes.map((r: RecipeSummary) => r.id)).toEqual(['rc_chili']);
  });

  it('a recipe deleted while an Add sheet refresh is out stays deleted when that answer lands', async () => {
    const server = { recipes: [summary('rc_chili', 'Chili', 400), summary('rc_soup', 'Soup', 200)] };
    const { api, gates } = makeApi(server);
    await loadAll(api);

    let release!: (r: RecipeSummary[]) => void;
    gates.recipes = new Promise((r) => (release = r));
    beginAddPass();
    const refreshing = refreshAdd(api, 'Dinner', today);
    await deleteRecipe(api, 'rc_soup');
    release(server.recipes.map((r) => ({ ...r }))); // read before the delete: still has the soup
    await refreshing;

    expect(addLists.value?.recipes.map((r) => r.id)).toEqual(['rc_chili']);
  });

  it('a recipe added twice (saved, then answered again) is held once', async () => {
    const { api } = makeApi({ recipes: [summary('rc_chili', 'Chili', 400)] });
    await loadAll(api);

    addRecipe(detail(summary('rc_new', 'Stew', 300)));
    addRecipe(detail(summary('rc_new', 'Stew', 300)));

    expect(heldRecipes.value.map((r) => r.id)).toEqual(['rc_new', 'rc_chili']);
    expect(recipes.value.map((r) => r.id)).toEqual(['rc_new']);
  });
});
