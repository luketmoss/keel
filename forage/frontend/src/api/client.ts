// The Forage API client (#706): the first, as #704 left it out. Every call is a
// POST with a URLSearchParams body and no hand-set headers, so the browser
// sends no preflight (Apps Script has no doOptions), and carries the user's
// Google access token, never the API key.
import type {
  BarcodeLookup,
  Cook,
  Food,
  FoodDetail,
  ImportInput,
  ImportPreview,
  PlanEntry,
  PlanEntryInput,
  PlanMove,
  PlanResult,
  RecipeDetail,
  RecipeLogEntry,
  RecipeSort,
  RecipeSummary,
  StarterFood,
  StarterResult,
  StartTripInput,
  StartTripResult,
  StructuredRecipe,
  Trip,
  TripItemChange,
  TripItemResult,
  TripSummary,
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
  /** #708: `q` searches name, ingredient lines and matched foods; `sort` defaults to newest. */
  getRecipes(query?: { q?: string; sort?: RecipeSort }): Promise<RecipeSummary[]>;
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
  // #708: cooks, and logging a cooked recipe to Eaten.
  /** Newest first; one recipe's, or every recipe's. */
  getCooks(recipeId?: string): Promise<Cook[]>;
  /** upsertCook: merges into the cook with that id, or creates one (no date is today, by the API's clock). */
  saveCook(cook: Partial<Cook> & { id: string }): Promise<Cook>;
  deleteCook(id: string): Promise<void>;
  logFood(entry: RecipeLogEntry): Promise<void>;
  // #709: the meal plan. `today` is the device's, so the banner counts from the day the app shows.
  getPlan(from: string, to: string, today: string): Promise<PlanResult>;
  /** upsertPlanEntry with the app's own id. */
  planMeal(entry: PlanEntryInput): Promise<PlanEntry>;
  /** movePlanEntry: refused with code `not_found` for a meal already removed. */
  moveMeal(id: string, changes: PlanMove): Promise<PlanEntry>;
  removeMeal(id: string): Promise<void>;
  // #718: shopping trips.
  /** The open trip, or null. */
  getTrip(): Promise<Trip | null>;
  /** Closed trips, newest first. */
  getClosedTrips(): Promise<TripSummary[]>;
  startTrip(input: StartTripInput): Promise<StartTripResult>;
  setTripItem(tripId: string, foodId: string, change: TripItemChange): Promise<TripItemResult>;
  closeTrip(tripId: string): Promise<Trip>;
  discardTrip(tripId: string): Promise<void>;
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
    getRecipes: (query = {}) => {
      const params: Record<string, string> = {};
      if (query.q?.trim()) params.q = query.q.trim();
      if (query.sort) params.sort = query.sort;
      return call<RecipeSummary[]>('getRecipes', undefined, undefined, params);
    },
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
    getCooks: (recipeId) => call<Cook[]>('getCooks', undefined, undefined, recipeId ? { recipe_id: recipeId } : {}),
    saveCook: (cook) => call<Cook>('upsertCook', cook),
    deleteCook: async (id) => {
      await call('deleteCook', { id });
    },
    logFood: async (entry) => {
      await call('logFood', entry);
    },
    getPlan: (from, to, today) => call<PlanResult>('getPlan', undefined, undefined, { from, to, today }),
    planMeal: (entry) => call<PlanEntry>('upsertPlanEntry', entry),
    moveMeal: (id, changes) => call<PlanEntry>('movePlanEntry', { id, ...changes }),
    removeMeal: async (id) => {
      await call('deletePlanEntry', { id });
    },
    getTrip: async () => (await call<{ trip: Trip | null }>('getTrip')).trip,
    getClosedTrips: () => call<TripSummary[]>('getTrips', undefined, undefined, { status: 'closed' }),
    startTrip: (input) => call<StartTripResult>('startTrip', input),
    setTripItem: (tripId, foodId, change) =>
      call<TripItemResult>('setTripItem', { trip_id: tripId, food_id: foodId, ...change }),
    closeTrip: async (tripId) => (await call<{ trip: Trip }>('closeTrip', { trip_id: tripId })).trip,
    discardTrip: async (tripId) => {
      await call('discardTrip', { trip_id: tripId });
    },
  };
}
