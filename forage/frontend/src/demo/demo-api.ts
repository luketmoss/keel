// The demo layer (#704's gate): the ForageApi with no network. Any import
// answers the bundled sample; saved recipes and new foods live in memory,
// and a reload resets them.
import { ApiError, type ForageApi } from '../api/client';
import type {
  Food,
  ImportLine,
  ImportPreview,
  Nutrition,
  RecipeDetail,
  RecipeSummary,
  StructuredLine,
  StructuredRecipe,
} from '../api/types';
import { DEMO_IMPORT } from './demo-data';

let seq = 0;
const nextId = (prefix: string) => `${prefix}_demo${(++seq).toString(16).padStart(4, '0')}`;

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

export function createDemoApi(): ForageApi {
  const foods: Food[] = [];
  const recipes: RecipeSummary[] = [];

  const byName = (name: string) => foods.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());

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

  return {
    getRecipes: async () => recipes.map((r) => ({ ...r })),
    getFoods: async () => foods.map((f) => ({ ...f })),
    createFood: async (name) => {
      const now = new Date().toISOString();
      const food: Food = {
        id: nextId('fd'),
        name,
        kind: 'ingredient',
        brand: '',
        category: '',
        kcal_100g: null,
        protein_100g: null,
        carbs_100g: null,
        fat_100g: null,
        servings_json: null,
        source: 'manual',
        created: now,
        updated: now,
      };
      foods.push(food);
      return { ...food };
    },
    deleteRecipe: async (id) => {
      const i = recipes.findIndex((r) => r.id === id);
      if (i !== -1) recipes.splice(i, 1);
    },
    previewImport: async (input) => {
      if ('recipe' in input) return previewStructured(input.recipe);
      const sample: ImportPreview = JSON.parse(JSON.stringify(DEMO_IMPORT));
      const dup = recipes.find((r) => r.source_url === sample.recipe.source_url);
      sample.duplicate_of = dup ? { id: dup.id, name: dup.name } : null;
      for (const l of sample.lines) {
        const f = byName(l.name);
        if (f) Object.assign(l, { food_id: f.id, match: 'exact' });
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
      const nutrition = noNutrition(p.lines);
      const summary: RecipeSummary = {
        id: nextId('rc'),
        ...p.recipe,
        created: now,
        updated: now,
        nutrition,
        partial: nutrition.partial,
        rating: null,
        last_cooked: null,
        has_walkthrough: false,
      };
      recipes.push(summary);
      const detail: RecipeDetail = {
        ...summary,
        lines: p.lines.map((l, i) => ({
          recipe_id: summary.id,
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
        steps: p.steps.map((s) => ({ recipe_id: summary.id, ...s })),
      };
      return detail;
    },
  };
}
