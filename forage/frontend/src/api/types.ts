// The Forage API's shapes (#703, #706), mirrored from apps-script/src. A change
// to a response shape changes this file in the same pull request.

export type FoodKind = 'ingredient' | 'packaged';
export type FoodSource = 'usda' | 'off' | 'label' | 'manual' | '';

/** A Foods row. Nutrition is per 100 g; null is unknown, never 0. */
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
  servings_json: { name: string; g: number }[] | null;
  source: FoodSource;
  created: string;
  updated: string;
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
  lines?: { line_id: string; grams: number | null; reason: MissingReason | '' }[];
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
  suggestions: { food_id: string; name: string }[];
}

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
