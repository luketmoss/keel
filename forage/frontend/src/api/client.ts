// The Forage API client (#706): the first, as #704 left it out. Every call is a
// POST with a URLSearchParams body and no hand-set headers, so the browser
// sends no preflight (Apps Script has no doOptions), and carries the user's
// Google access token, never the API key.
import type {
  BarcodeLookup,
  Food,
  FoodDetail,
  ImportInput,
  ImportPreview,
  RecipeDetail,
  RecipeSummary,
  StarterFood,
  StarterResult,
  StructuredRecipe,
} from './types';

/** A failed call. `code` is the API's (`blocked`, `duplicate`, `in_use`…), or `network` / `unconfigured`. */
export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(message: string, code = '', details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/** What the app asks of the API. The demo layer is another implementation of it. */
export interface ForageApi {
  getRecipes(): Promise<RecipeSummary[]>;
  getFoods(): Promise<Food[]>;
  createFood(name: string): Promise<Food>;
  deleteRecipe(id: string): Promise<void>;
  /** A dry run: the preview, nothing written. */
  previewImport(input: ImportInput, signal?: AbortSignal): Promise<ImportPreview>;
  saveImport(recipe: StructuredRecipe, allowDuplicate: boolean): Promise<RecipeDetail>;
  // #707: the food library and recipe nutrition.
  getFood(id: string): Promise<FoodDetail>;
  /** upsertFood: merges the fields sent into the food with that id, or creates one. */
  saveFood(food: Partial<Food>): Promise<Food>;
  deleteFood(id: string): Promise<void>;
  setFoodWeight(foodId: string, unit: string, grams: number): Promise<Food>;
  lookupBarcode(code: string): Promise<BarcodeLookup>;
  getStarterFoods(): Promise<StarterFood[]>;
  addStarterFoods(ids: string[]): Promise<StarterResult>;
  getRecipe(id: string): Promise<RecipeDetail>;
  /** Match one saved recipe line to a food: the recipe written back whole, every line id kept. */
  setLineFood(recipeId: string, lineId: string, foodId: string): Promise<RecipeDetail>;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/** A recipe's lines as upsertRecipe takes them back, with one line's food changed. */
export function linesWithFood(recipe: RecipeDetail, lineId: string, foodId: string) {
  return recipe.lines.map((l) => ({
    line_id: l.line_id,
    section: l.section,
    text: l.text,
    qty: l.qty,
    unit: l.unit,
    food_id: l.line_id === lineId ? foodId : l.food_id,
    grams: l.grams,
    optional: l.optional,
  }));
}

export function createLiveApi(token: string, url = import.meta.env.VITE_FORAGE_API_URL): ForageApi {
  async function call<T>(
    action: string,
    payload?: unknown,
    signal?: AbortSignal,
    params: Record<string, string> = {},
  ): Promise<T> {
    if (!url) throw new ApiError('The Forage API is not configured', 'unconfigured');
    const body = new URLSearchParams({ action, access_token: token, ...params });
    if (payload !== undefined) body.set('payload', JSON.stringify(payload));
    let envelope: Envelope<T>;
    try {
      const res = await fetch(url, { method: 'POST', body, signal });
      envelope = await res.json();
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new ApiError('Network error', 'network');
    }
    if (!envelope.success) {
      const details: Record<string, unknown> = { ...envelope };
      delete details.success;
      throw new ApiError(envelope.error ?? 'Request failed', envelope.code ?? '', details);
    }
    return envelope.data as T;
  }

  const getRecipe = (id: string) => call<RecipeDetail>('getRecipe', undefined, undefined, { id });

  return {
    getRecipes: () => call<RecipeSummary[]>('getRecipes'),
    getFoods: () => call<Food[]>('getFoods'),
    createFood: (name) => call<Food>('upsertFood', { name, kind: 'ingredient', source: 'manual' }),
    deleteRecipe: async (id) => {
      await call('deleteRecipe', { id });
    },
    previewImport: (input, signal) => call<ImportPreview>('importRecipe', { ...input, dry_run: true }, signal),
    saveImport: (recipe, allowDuplicate) =>
      call<RecipeDetail>('importRecipe', { recipe, dry_run: false, allow_duplicate: allowDuplicate }),
    getFood: (id) => call<FoodDetail>('getFood', undefined, undefined, { id }),
    saveFood: (food) => call<Food>('upsertFood', food),
    deleteFood: async (id) => {
      await call('deleteFood', { id });
    },
    setFoodWeight: (foodId, unit, grams) => call<Food>('setFoodWeight', { food_id: foodId, unit, grams }),
    lookupBarcode: (code) => call<BarcodeLookup>('lookupBarcode', undefined, undefined, { code }),
    getStarterFoods: () => call<StarterFood[]>('getStarterFoods'),
    addStarterFoods: (ids) => call<StarterResult>('addStarterFoods', { ids }),
    getRecipe,
    setLineFood: async (recipeId, lineId, foodId) => {
      const recipe = await getRecipe(recipeId);
      return call<RecipeDetail>('upsertRecipe', { id: recipeId, lines: linesWithFood(recipe, lineId, foodId) });
    },
  };
}
