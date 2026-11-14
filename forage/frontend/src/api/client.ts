// The Forage API client (#706): the first, as #704 left it out. Every call is a
// POST with a URLSearchParams body and no hand-set headers, so the browser
// sends no preflight (Apps Script has no doOptions), and carries the user's
// Google access token, never the API key.
import type {
  AddToTripInput,
  AddToTripResult,
  BarcodeLookup,
  Cook,
  Food,
  FoodDetail,
  FoodLogEntry,
  FoodLogTotals,
  ImportInput,
  LogEntryChange,
  LogEntryInput,
  ImportPreview,
  NewRecipeInput,
  NewRecipeLine,
  Nutrition,
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
  /** #719: `q` narrows to a substring of the name or brand. */
  getFoods(q?: string): Promise<Food[]>;
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
  // #788: a recipe made from logged entries.
  /** upsertRecipe with no stored recipe of that `id`: creates it. The same id again replaces it, so a retry leaves one. */
  createRecipe(input: NewRecipeInput): Promise<RecipeDetail>;
  /** computeNutrition: per-serving figures for lines and a serving count, nothing saved. */
  previewRecipe(lines: NewRecipeLine[], servings: number): Promise<Nutrition>;
  // #708: cooks, and logging a cooked recipe to Eaten.
  /** Newest first; one recipe's, or every recipe's. */
  getCooks(recipeId?: string): Promise<Cook[]>;
  /** upsertCook: merges into the cook with that id, or creates one (no date is today, by the API's clock). */
  saveCook(cook: Partial<Cook> & { id: string }): Promise<Cook>;
  deleteCook(id: string): Promise<void>;
  logFood(entry: RecipeLogEntry): Promise<void>;
  // #712: the food log. Every figure is the API's: entries carry their snapshot, the day its totals.
  getFoodLog(from: string, to: string): Promise<FoodLogEntry[]>;
  /** `byMeal` adds each day's `meals` (#865); without it the request, and the answer, are as before. */
  getFoodLogTotals(from: string, to: string, byMeal?: boolean): Promise<FoodLogTotals>;
  /** logFood with the app's own id; `dryRun` answers the entry as it would be stored, writing nothing. */
  logEntry(entry: LogEntryInput, dryRun?: boolean): Promise<FoodLogEntry>;
  updateLogEntry(id: string, changes: LogEntryChange, dryRun?: boolean): Promise<FoodLogEntry>;
  deleteLogEntry(id: string): Promise<void>;
  // #709: the meal plan. `today` is the device's, so the banner counts from the day the app shows.
  getPlan(from: string, to: string, today: string): Promise<PlanResult>;
  /** upsertPlanEntry with the app's own id. */
  planMeal(entry: PlanEntryInput): Promise<PlanEntry>;
  /** movePlanEntry: refused with code `not_found` for a meal already removed. */
  moveMeal(id: string, changes: PlanMove): Promise<PlanEntry>;
  removeMeal(id: string): Promise<void>;
  // #718: shopping trips.
  /** The open trip, or null. #719: `today` (the device's) dates its late meals. */
  getTrip(today?: string): Promise<Trip | null>;
  /** Closed trips, newest first. */
  getClosedTrips(): Promise<TripSummary[]>;
  startTrip(input: StartTripInput): Promise<StartTripResult>;
  setTripItem(tripId: string, foodId: string, change: TripItemChange): Promise<TripItemResult>;
  closeTrip(tripId: string): Promise<Trip>;
  discardTrip(tripId: string): Promise<void>;
  // #719: added items and late meals.
  addToTrip(tripId: string, input: AddToTripInput): Promise<AddToTripResult>;
  /** Only an added item with no meals; answers the trip without it. */
  removeTripItem(tripId: string, foodId: string): Promise<Trip>;
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
    getFoods: (q) => call<Food[]>('getFoods', undefined, undefined, q?.trim() ? { q: q.trim() } : {}),
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
    createRecipe: (input) => call<RecipeDetail>('upsertRecipe', input),
    previewRecipe: (lines, servings) => call<Nutrition>('computeNutrition', { servings, lines }),
    getCooks: (recipeId) => call<Cook[]>('getCooks', undefined, undefined, recipeId ? { recipe_id: recipeId } : {}),
    saveCook: (cook) => call<Cook>('upsertCook', cook),
    deleteCook: async (id) => {
      await call('deleteCook', { id });
    },
    logFood: async (entry) => {
      await call('logFood', entry);
    },
    getFoodLog: (from, to) => call<FoodLogEntry[]>('getFoodLog', undefined, undefined, { from, to }),
    getFoodLogTotals: (from, to, byMeal = false) =>
      call<FoodLogTotals>(
        'getFoodLogTotals',
        undefined,
        undefined,
        byMeal ? { from, to, by_meal: 'true' } : { from, to },
      ),
    logEntry: (entry, dryRun = false) => call<FoodLogEntry>('logFood', dryRun ? { ...entry, dry_run: true } : entry),
    updateLogEntry: (id, changes, dryRun = false) =>
      call<FoodLogEntry>('updateLogEntry', dryRun ? { id, changes, dry_run: true } : { id, changes }),
    deleteLogEntry: async (id) => {
      await call('deleteLogEntry', { id });
    },
    getPlan: (from, to, today) => call<PlanResult>('getPlan', undefined, undefined, { from, to, today }),
    planMeal: (entry) => call<PlanEntry>('upsertPlanEntry', entry),
    moveMeal: (id, changes) => call<PlanEntry>('movePlanEntry', { id, ...changes }),
    removeMeal: async (id) => {
      await call('deletePlanEntry', { id });
    },
    getTrip: async (today) =>
      (await call<{ trip: Trip | null }>('getTrip', undefined, undefined, today ? { today } : {})).trip,
    getClosedTrips: () => call<TripSummary[]>('getTrips', undefined, undefined, { status: 'closed' }),
    startTrip: (input) => call<StartTripResult>('startTrip', input),
    setTripItem: (tripId, foodId, change) =>
      call<TripItemResult>('setTripItem', { trip_id: tripId, food_id: foodId, ...change }),
    closeTrip: async (tripId) => (await call<{ trip: Trip }>('closeTrip', { trip_id: tripId })).trip,
    discardTrip: async (tripId) => {
      await call('discardTrip', { trip_id: tripId });
    },
    addToTrip: (tripId, input) => call<AddToTripResult>('addToTrip', { trip_id: tripId, ...input }),
    removeTripItem: async (tripId, foodId) =>
      (await call<{ trip: Trip }>('removeTripItem', { trip_id: tripId, food_id: foodId })).trip,
  };
}
