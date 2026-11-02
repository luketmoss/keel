// The demo layer (#704's gate): the ForageApi with no network. Any import
// answers the bundled sample; the library starts with six sample foods (#707);
// saved recipes and foods live in memory, and a reload resets them.
//
// Recipe nutrition here is a small stand-in for the API's nutrition.js, enough
// for the Nutrition sheet to show its states: mass units, a food's named
// weights, and the partial rule. The live app never computes it.
import { ApiError, linesWithFood, type ForageApi } from '../api/client';
import type {
  Food,
  FoodDetail,
  ImportLine,
  ImportPreview,
  MissingReason,
  Nutrition,
  RecipeDetail,
  RecipeSummary,
  StarterFood,
  StarterResult,
  StructuredLine,
  StructuredRecipe,
} from '../api/types';
import { displayName, hasNutrition } from '../library/food-math';
import { DEMO_FOODS, DEMO_IMPORT, DEMO_PRODUCT, DEMO_STARTERS } from './demo-data';

let seq = 0;
const nextId = (prefix: string) => `${prefix}_demo${(++seq).toString(16).padStart(4, '0')}`;

const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const round1 = (n: number) => Math.round(n * 10) / 10;

type Line = RecipeDetail['lines'][number];

function noNutrition(lines: { line_id: string; food_id: string; optional: boolean }[]): Nutrition {
  const missing = lines
    .filter((l) => !l.optional && !l.food_id)
    .map((l) => ({ line_id: l.line_id, reason: 'no_food' as const }));
  return {
    per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
    missing,
    partial: missing.length > 0,
  };
}

/** A line's grams through its food, or null: the demo's short version of the API's conversion. */
function gramsOf(line: Pick<Line, 'qty' | 'unit' | 'grams'>, food: Food | undefined): number | null {
  if (typeof line.grams === 'number') return line.grams;
  if (typeof line.qty !== 'number') return null;
  const unit = line.unit.trim().toLowerCase();
  if (MASS_G[unit]) return line.qty * MASS_G[unit];
  const servings = food?.servings_json ?? [];
  const sing = (u: string) => u.replace(/s$/, '');
  const hit = unit
    ? servings.find((s) => sing(s.name.toLowerCase()) === sing(unit))
    : (servings.find((s) => s.name === 'each') ?? servings[0]);
  return hit ? line.qty * hit.g : null;
}

function nutritionOf(lines: Line[], servings: number | null, foods: Food[]): RecipeDetail['nutrition'] {
  const by = servings && servings > 0 ? servings : 1;
  const total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const missing: { line_id: string; reason: MissingReason }[] = [];
  const byLine: { line_id: string; grams: number | null; kcal: number | null }[] = [];
  let counted = 0;
  for (const l of lines) {
    const food = foods.find((f) => f.id === l.food_id);
    const grams = gramsOf(l, food);
    let kcal: number | null = null;
    if (!l.optional) {
      const reason: MissingReason | '' = !food
        ? 'no_food'
        : !hasNutrition(food)
          ? 'no_nutrition'
          : grams === null
            ? 'no_weight'
            : '';
      if (reason) missing.push({ line_id: l.line_id, reason });
      else {
        const f = food!;
        total.kcal += (f.kcal_100g! * grams!) / 100;
        total.protein_g += (f.protein_100g! * grams!) / 100;
        total.carbs_g += (f.carbs_100g! * grams!) / 100;
        total.fat_g += (f.fat_100g! * grams!) / 100;
        kcal = round1((f.kcal_100g! * grams!) / 100 / by);
        counted++;
      }
    }
    byLine.push({ line_id: l.line_id, grams: grams === null ? null : round1(grams), kcal });
  }
  const per = (v: number) => (counted ? round1(v / by) : null);
  return {
    per_serving: {
      kcal: per(total.kcal),
      protein_g: per(total.protein_g),
      carbs_g: per(total.carbs_g),
      fat_g: per(total.fat_g),
    },
    missing,
    partial: missing.some((m) => m.reason !== 'no_nutrition'),
    by_line: byLine,
  };
}

export function createDemoApi(): ForageApi {
  const foods: Food[] = DEMO_FOODS.map((f) => JSON.parse(JSON.stringify(f)));
  const recipes: RecipeDetail[] = [];

  const byName = (name: string) => foods.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

  function withNutrition(r: RecipeDetail): RecipeDetail {
    const nutrition = nutritionOf(r.lines, r.servings, foods);
    const lines = r.lines.map((l, i) => ({
      ...l,
      resolved_grams: nutrition.by_line![i].grams,
      reason: (nutrition.missing.find((m) => m.line_id === l.line_id)?.reason ?? '') as Line['reason'],
    }));
    return { ...r, lines, nutrition, partial: nutrition.partial };
  }

  function summary(r: RecipeDetail): RecipeSummary {
    const full = withNutrition(r);
    const out: RecipeSummary & { lines?: unknown; steps?: unknown } = clone(full);
    delete out.lines;
    delete out.steps;
    delete (out.nutrition as Nutrition).by_line;
    return out;
  }

  function starterStatus(s: (typeof DEMO_STARTERS)[number]): StarterFood {
    const mine = foods.find((f) => displayName(f).toLowerCase() === s.name.toLowerCase());
    const fill = foods.find((f) => !hasNutrition(f) && s.aliases.includes(f.name.toLowerCase()));
    return { ...clone(s), in_library: mine?.id ?? '', can_fill: mine ? '' : (fill?.id ?? '') };
  }

  function previewStructured(r: StructuredRecipe): ImportPreview {
    const lines: ImportLine[] = r.lines.map((raw, i) => {
      const l: StructuredLine = typeof raw === 'string' ? { text: raw, name: raw } : raw;
      const given = l.food_id ? foods.find((f) => f.id === l.food_id) : undefined;
      if (l.food_id && !given) throw new ApiError(`food_id "${l.food_id}" is not a food`);
      const exact = given ? undefined : byName(l.name ?? '');
      return {
        line_id: `L${i + 1}`,
        section: l.section ?? '',
        text: l.text,
        qty: l.qty ?? null,
        unit: l.unit ?? '',
        name: l.name ?? l.text,
        note: l.note ?? '',
        grams: l.grams ?? null,
        optional: !!l.optional,
        flags: [],
        food_id: given?.id ?? exact?.id ?? '',
        match: exact ? 'exact' : null,
        suggestions: [],
      };
    });
    const needs: ImportPreview['needs'] = [];
    if (!r.name.trim()) needs.push('name');
    if (!r.servings) needs.push('servings');
    if (!lines.length) needs.push('lines');
    const source = r.source_url ?? '';
    const dup = source ? recipes.find((x) => x.source_url === source) : undefined;
    return {
      recipe: {
        name: r.name,
        source_url: source,
        source_site: source ? new URL(source).hostname.replace(/^www\./, '') : '',
        servings: r.servings ?? null,
        total_min: r.total_min ?? null,
        notes: r.notes ?? '',
      },
      lines,
      steps: r.steps.map((s, i) => {
        const step = typeof s === 'string' ? { text: s } : s;
        return { position: i + 1, section: step.section ?? '', name: step.name ?? '', text: step.text };
      }),
      nutrition: noNutrition(lines),
      duplicate_of: dup ? { id: dup.id, name: dup.name } : null,
      needs,
    };
  }

  function findFood(id: string): Food {
    const f = foods.find((x) => x.id === id);
    if (!f) throw new ApiError(`Food "${id}" not found`);
    return f;
  }

  const api: ForageApi = {
    getRecipes: async () => recipes.map(summary),
    getFoods: async () => clone(foods),
    createFood: (name) => api.saveFood({ name, kind: 'ingredient', source: 'manual' }),
    deleteRecipe: async (id) => {
      const i = recipes.findIndex((r) => r.id === id);
      if (i !== -1) recipes.splice(i, 1);
    },
    previewImport: async (input) => {
      if ('recipe' in input) return previewStructured(input.recipe);
      const sample: ImportPreview = clone(DEMO_IMPORT);
      const dup = recipes.find((r) => r.source_url === sample.recipe.source_url);
      sample.duplicate_of = dup ? { id: dup.id, name: dup.name } : null;
      for (const l of sample.lines) {
        const f = byName(l.name);
        if (f) Object.assign(l, { food_id: f.id, match: 'exact' });
        else if (l.name === 'garlic') l.suggestions = [{ starter_id: 'garlic', name: 'Garlic' }];
      }
      sample.nutrition = noNutrition(sample.lines);
      return sample;
    },
    saveImport: async (recipe, allowDuplicate) => {
      const p = previewStructured(recipe);
      if (p.needs.length) throw new ApiError(`${p.needs[0]} is required`, 'incomplete');
      if (p.duplicate_of && !allowDuplicate) {
        throw new ApiError('duplicate', 'duplicate', { duplicate_of: p.duplicate_of });
      }
      const now = new Date().toISOString();
      const id = nextId('rc');
      const detail: RecipeDetail = {
        id,
        ...p.recipe,
        created: now,
        updated: now,
        nutrition: noNutrition(p.lines),
        partial: false,
        rating: null,
        last_cooked: null,
        has_walkthrough: false,
        lines: p.lines.map((l, i) => ({
          recipe_id: id,
          line_id: l.line_id,
          position: i + 1,
          section: l.section,
          text: l.text,
          qty: l.qty,
          unit: l.unit,
          food_id: l.food_id,
          grams: l.grams,
          optional: l.optional,
          resolved_grams: l.grams,
          reason: '',
        })),
        steps: p.steps.map((s) => ({ recipe_id: id, ...s })),
      };
      recipes.push(detail);
      return withNutrition(detail);
    },
    getFood: async (id) => {
      const f = findFood(id);
      const used_by = recipes
        .filter((r) => r.lines.some((l) => l.food_id === id))
        .map((r) => ({ id: r.id, name: r.name }));
      return { ...clone(f), used_by } as FoodDetail;
    },
    saveFood: async (input) => {
      const existing = input.id ? foods.find((f) => f.id === input.id) : undefined;
      const now = new Date().toISOString();
      const next: Food = existing
        ? { ...existing, ...input, updated: now }
        : ({
            ...clone(DEMO_FOODS[5]),
            source: 'manual',
            ...input,
            id: nextId('fd'),
            created: now,
            updated: now,
          } as Food);
      if (!next.name?.trim()) throw new ApiError('name is required');
      const clash = foods.find(
        (f) => f.id !== next.id && displayName(f).toLowerCase() === displayName(next).toLowerCase(),
      );
      if (clash) throw new ApiError(`a food named ${displayName(clash)} already exists`, 'duplicate');
      if (existing) Object.assign(existing, next);
      else foods.push(next);
      return clone(next);
    },
    deleteFood: async (id) => {
      findFood(id);
      const users = recipes.filter((r) => r.lines.some((l) => l.food_id === id));
      if (users.length) {
        throw new ApiError(`Food "${id}" is in use, so it was not deleted`, 'in_use', {
          uses: { recipes: users.map((r) => ({ id: r.id, name: r.name })), trips: [] },
        });
      }
      foods.splice(foods.indexOf(findFood(id)), 1);
    },
    setFoodWeight: async (foodId, unit, grams) => {
      const f = findFood(foodId);
      const list = (f.servings_json ?? []).filter((s) => s.name.toLowerCase() !== unit.toLowerCase());
      const at = (f.servings_json ?? []).findIndex((s) => s.name.toLowerCase() === unit.toLowerCase());
      const weight = { name: unit.toLowerCase(), g: round1(grams) };
      if (at === -1) list.push(weight);
      else list.splice(at, 0, weight);
      f.servings_json = list;
      return clone(f);
    },
    lookupBarcode: async (code) => {
      const mine = foods.find((f) => f.barcode === code);
      if (mine) {
        return {
          found: true,
          reason: '',
          food: null,
          warnings: [],
          already_in_library: { id: mine.id, name: displayName(mine) },
        };
      }
      if (code === '0000000000000')
        return { found: false, reason: 'not_found', food: null, warnings: [], already_in_library: null };
      const food = { ...clone(DEMO_PRODUCT), source_ref: code, barcode: code };
      return { found: true, reason: '', food, warnings: ['energy_mismatch'], already_in_library: null };
    },
    getStarterFoods: async () => DEMO_STARTERS.map(starterStatus),
    addStarterFoods: async (ids) => {
      const out: StarterResult = { added: [], filled: [], existing: [] };
      for (const id of ids) {
        const s = DEMO_STARTERS.find((x) => x.id === id);
        if (!s) throw new ApiError(`"${id}" is not on the starter list`);
        const status = starterStatus(s);
        const values = {
          kcal_100g: s.kcal_100g,
          protein_100g: s.protein_100g,
          carbs_100g: s.carbs_100g,
          fat_100g: s.fat_100g,
        };
        if (status.in_library) {
          out.existing.push({ starter_id: id, id: status.in_library, name: s.name });
        } else if (status.can_fill) {
          const f = findFood(status.can_fill);
          Object.assign(f, values, { servings_json: f.servings_json ?? s.servings });
          out.filled.push({ starter_id: id, id: f.id, name: f.name });
        } else {
          const f = await api.saveFood({
            name: s.name,
            kind: 'ingredient',
            ...values,
            servings_json: s.servings,
            source: 'usda',
          });
          out.added.push({ starter_id: id, id: f.id, name: f.name });
        }
      }
      return out;
    },
    getRecipe: async (id) => {
      const r = recipes.find((x) => x.id === id);
      if (!r) throw new ApiError(`Recipe "${id}" not found`);
      return clone(withNutrition(r));
    },
    setLineFood: async (recipeId, lineId, foodId) => {
      const r = recipes.find((x) => x.id === recipeId);
      if (!r) throw new ApiError(`Recipe "${recipeId}" not found`);
      const next = linesWithFood(r, lineId, foodId);
      r.lines = r.lines.map((l, i) => ({ ...l, food_id: next[i].food_id }));
      return clone(withNutrition(r));
    },
  };
  return api;
}
