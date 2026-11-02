// The Forage API's shapes (#703, #706, #707, #708, #709), mirrored from apps-script/src. A change
// to a response shape changes this file in the same pull request.

export type FoodKind = 'ingredient' | 'packaged';
export type FoodSource = 'usda' | 'off' | 'label' | 'manual' | '';
export type Store = 'ks' | 'costco' | 'other' | '';

export interface Weight {
  name: string;
  g: number;
}

/** A Foods row. Nutrition is per 100 g; null is unknown, never 0. Fields after `source` are #707's. */
export interface Food {
  id: string;
  name: string;
  kind: FoodKind;
  brand: string;
  category: string;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  servings_json: Weight[] | null;
  source: FoodSource;
  created: string;
  updated: string;
  buy_unit?: string;
  buy_unit_plural?: string;
  buy_unit_g?: number | null;
  usual_store?: Store;
  usually_have?: boolean;
  regular?: boolean;
  packs_json?: string[] | null;
  never_shop?: boolean;
  source_ref?: string;
  verified?: boolean;
  barcode?: string;
}

/** `getFood`: the row plus the recipes whose lines use it. */
export interface FoodDetail extends Food {
  used_by: { id: string; name: string }[];
}

/** A starter list entry (`getStarterFoods`), USDA SR Legacy per 100 g. */
export interface StarterFood {
  id: string;
  name: string;
  category: string;
  fdc: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  servings: Weight[];
  aliases: string[];
  /** The library food it already is, or ''. */
  in_library: string;
  /** A name-only food it would fill in, or ''. */
  can_fill: string;
}

export interface StarterResult {
  added: { starter_id: string; id: string; name: string }[];
  filled: { starter_id: string; id: string; name: string }[];
  existing: { starter_id: string; id: string; name: string }[];
}

/** `lookupBarcode`. `food` is an unsaved row (`id` blank). */
export interface BarcodeLookup {
  found: boolean;
  reason: '' | 'not_found' | 'no_nutrition';
  food: Food | null;
  warnings: 'energy_mismatch'[];
  already_in_library: { id: string; name: string } | null;
}

export interface PerServing {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export type MissingReason = 'no_food' | 'no_nutrition' | 'no_weight';

/** What `computeNutrition` and the import preview answer. */
export interface Nutrition {
  per_serving: PerServing;
  missing: { line_id: string; reason: MissingReason }[];
  partial: boolean;
  lines?: { line_id: string; grams: number | null; reason: MissingReason | ''; kcal?: number | null }[];
  /** `getRecipe` only (#707): each line's grams and its kcal a serving, null when left out. */
  by_line?: { line_id: string; grams: number | null; kcal: number | null }[];
}

/** A Recipes row with what reads derive, as `getRecipes` answers it. */
export interface RecipeSummary {
  id: string;
  name: string;
  source_url: string;
  source_site: string;
  servings: number | null;
  total_min: number | null;
  notes: string;
  created: string;
  updated: string;
  nutrition: Omit<Nutrition, 'lines'>;
  partial: boolean;
  rating: number | null;
  last_cooked: string | null;
  has_walkthrough: boolean;
  /** #708: how many cooks, and the latest cook's id while it has no rating, else null. */
  cook_count: number;
  unrated_cook_id: string | null;
  /** #708, only on a search: the first ingredient line that matched when the name did not, else ''. */
  matched_line?: string;
}

/** #708: `getRecipes` `sort`. */
export type RecipeSort = 'newest' | 'name' | 'rating' | 'last_cooked';

/** A Cooks row (#703), as `getCooks` and `upsertCook` answer it (#708). `rating` null is not rated. */
export interface Cook {
  id: string;
  recipe_id: string;
  recipe_name: string;
  date: string;
  rating: number | null;
  note: string;
  plan_id: string;
  created: string;
}

export type Slot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
export const SLOTS: Slot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

/**
 * #709: a Plan row as `getPlan` and the plan writes answer it. Exactly one of
 * `recipe_id` and `note` is set. The fields after `updated` are derived by
 * the API on read: `kcal_serving` is null when unknown, never 0, and is rounded
 * only for display.
 */
export interface PlanEntry {
  id: string;
  date: string;
  slot: Slot;
  recipe_id: string;
  note: string;
  trip_id: string;
  created: string;
  updated: string;
  recipe_name: string;
  servings: number | null;
  kcal_serving: number | null;
  partial: boolean;
  trip_status: '' | 'open' | 'closed';
  on_trip: boolean;
  shopped: boolean;
}

/** `getPlan`: the entries by date, slot and creation, and the banner's count. */
export interface PlanResult {
  entries: PlanEntry[];
  not_on_trip: number;
}

// ---- #718: shopping trips. Every amount, count and breakdown here is the API's (trips.js).

/** Where an item is got: Have it, a store, or '' (not sorted). */
export type TripChoice = 'have' | 'ks' | 'costco' | 'other' | '';
export type TripStore = 'ks' | 'costco' | 'other';
export const TRIP_STORES: TripStore[] = ['ks', 'costco', 'other'];

/** One meal line behind an item, expanded from the item's snapshot. `text` is '' when the recipe line is gone. */
export interface TripLine {
  plan_id: string;
  date: string;
  slot: string;
  recipe_name: string;
  line_id: string;
  text: string;
  amt: string;
}

export interface TripItem {
  food_id: string;
  name: string;
  category: string;
  choice: TripChoice;
  suggested: boolean;
  bought: boolean;
  /** #719's. */
  buy: string;
  mine: boolean;
  /** What the meals need (`about 6 onions`), or null for an item with no lines. */
  need: string | null;
  lines: TripLine[];
}

export interface TripMeal {
  plan_id: string;
  date: string;
  slot: Slot;
  recipe_id: string;
  recipe_name: string;
}

export interface TripCounts {
  all: number;
  todo: number;
  have: number;
  ks: number;
  costco: number;
  other: number;
  to_buy: number;
  bought: number;
}

/** `getTrip`'s trip. */
export interface Trip {
  id: string;
  status: 'open' | 'closed';
  through: string;
  created: string;
  closed_at: string;
  meals: TripMeal[];
  items: TripItem[];
  counts: TripCounts;
  unmatched: { plan_id: string; recipe_name: string; line_id: string; text: string }[];
}

/** A `getTrips` row, for "Last trip". */
export interface TripSummary {
  id: string;
  status: 'open' | 'closed';
  through: string;
  created: string;
  closed_at: string;
  items: number;
  bought: number;
  stores: TripStore[];
}

export interface StartTripInput {
  /** The sheet's own id, so a double tap or a retry builds one trip. */
  id: string;
  through: string;
  plan_ids: string[];
  today: string;
  dry_run: boolean;
}

export interface StartTripResult {
  trip: Trip;
  written: boolean;
  dry_run: boolean;
}

export interface TripItemChange {
  choice?: Exclude<TripChoice, ''>;
  bought?: boolean;
}

export interface TripItemResult {
  item: TripItem;
  remembered?: boolean;
}

/** A new meal as the app plans it, always with its own id so a retry leaves one row. */
export type PlanEntryInput = { id: string; date: string; slot: Slot } & ({ recipe_id: string } | { note: string });

/** What `movePlanEntry` changes. */
export interface PlanMove {
  date?: string;
  slot?: Slot;
  note?: string;
}

/** What the app sends `logFood` for a recipe (#708's finish screen). */
export interface RecipeLogEntry {
  id?: string;
  date: string;
  slot: Slot;
  recipe_id: string;
  qty: number;
  unit: 'serving';
}

/** A RecipeLines row. */
export interface RecipeLine {
  recipe_id: string;
  line_id: string;
  position: number;
  section: string;
  text: string;
  qty: number | null;
  unit: string;
  food_id: string;
  grams: number | null;
  optional: boolean;
}

/** A Steps row. */
export interface Step {
  recipe_id: string;
  position: number;
  section: string;
  name: string;
  text: string;
}

/** `getRecipe`: the summary plus lines (with resolved grams) and steps. */
export interface RecipeDetail extends RecipeSummary {
  lines: (RecipeLine & { resolved_grams: number | null; reason: MissingReason | '' })[];
  steps: Step[];
}

// ---- import (#706)

export type ImportFlag = 'range' | 'to_taste' | 'package' | 'alternative' | 'no_qty';

/** A structured line a caller sends. `name` is only for matching and learning. */
export interface StructuredLine {
  text: string;
  qty?: number | null;
  unit?: string;
  name?: string;
  note?: string;
  food_id?: string;
  grams?: number | null;
  section?: string;
  optional?: boolean;
}

export interface StructuredRecipe {
  name: string;
  servings?: number | null;
  total_min?: number | null;
  source_url?: string;
  notes?: string;
  lines: (string | StructuredLine)[];
  steps: (string | { text: string; section?: string; name?: string })[];
}

/** Exactly one input; `url` may come with `jsonld` as its source. */
export type ImportInput =
  { url: string } | { jsonld: string[]; url?: string } | { text: string } | { recipe: StructuredRecipe };

export interface ImportLine {
  line_id: string;
  section: string;
  text: string;
  qty: number | null;
  unit: string;
  name: string;
  note: string;
  grams: number | null;
  optional: boolean;
  flags: ImportFlag[];
  food_id: string;
  match: 'exact' | 'alias' | null;
  suggestions: Suggestion[];
}

/** A library food, or (#707) a starter food not yet in the library. */
export type Suggestion =
  { food_id: string; name: string; starter_id?: undefined } | { starter_id: string; name: string; food_id?: undefined };

export interface ImportPreview {
  recipe: {
    name: string;
    source_url: string;
    source_site: string;
    servings: number | null;
    total_min: number | null;
    notes: string;
  };
  lines: ImportLine[];
  steps: { position: number; section: string; name: string; text: string }[];
  nutrition: Nutrition;
  duplicate_of: { id: string; name: string } | null;
  needs: ('name' | 'servings' | 'lines')[];
}

/** Why an import read or save failed. The app keys its copy on these, never on the API's text. */
export type ImportCode = 'bad_url' | 'blocked' | 'unreachable' | 'no_recipe' | 'too_large' | 'duplicate' | 'incomplete';

/** The unit vocabulary of #703, for the line editor. */
export const UNITS = [
  'g',
  'kg',
  'oz',
  'lb',
  'tsp',
  'tbsp',
  'cup',
  'fl oz',
  'ml',
  'l',
  'clove',
  'can',
  'slice',
  'large',
  'medium',
  'small',
  'stick',
  'sprig',
  'bunch',
  'head',
  'stalk',
  'piece',
  'package',
  'jar',
] as const;
