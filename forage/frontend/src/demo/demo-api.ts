// The demo layer (#704's gate): the ForageApi with no network. Any import
// answers the bundled sample; the library starts with six sample foods (#707)
// and five sample recipes with their cooks (#708); saved recipes, foods, cooks
// and log entries live in memory, and a reload resets them.
//
// Recipe nutrition here is a small stand-in for the API's nutrition.js, enough
// for the Nutrition sheet to show its states: mass units, a food's named
// weights, and the partial rule. The live app never computes it.
import { ApiError, linesWithFood, type ForageApi } from '../api/client';
import type {
  Cook,
  Food,
  FoodDetail,
  FoodLogDay,
  FoodLogEntry,
  ImportLine,
  LogEntryInput,
  ImportPreview,
  MissingReason,
  Nutrition,
  PlanEntry,
  RecipeDetail,
  RecipeSort,
  RecipeSummary,
  StarterFood,
  StarterResult,
  StructuredLine,
  StructuredRecipe,
} from '../api/types';
import { localDate } from '../cook/format';
import { DEMO_STEW_WALKTHROUGH } from './demo-walkthrough';
import { displayName, hasNutrition } from '../library/food-math';
import { SLOTS } from '../api/types';
import { addDays } from '../plan/dates';
import {
  DEMO_COOKS,
  DEMO_FOODS,
  DEMO_IMPORT,
  DEMO_LOG,
  DEMO_PLAN,
  DEMO_PRODUCT,
  DEMO_RECIPES,
  DEMO_STARTERS,
} from './demo-data';
import { createDemoTrips } from './demo-trips';

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

const DAY = 86400000;

/** The sample recipes as stored rows, dated back from today. */
function seedRecipes(now: number): RecipeDetail[] {
  return DEMO_RECIPES.map((d) => {
    const at = new Date(now - d.added_days_ago * DAY).toISOString();
    return {
      id: d.id,
      name: d.name,
      source_url: `https://${d.source_site}/${d.id.slice(8)}`,
      source_site: d.source_site,
      servings: d.servings,
      total_min: d.total_min,
      notes: '',
      created: at,
      updated: at,
      nutrition: {
        per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
        missing: [],
        partial: false,
      },
      partial: false,
      rating: null,
      last_cooked: null,
      has_walkthrough: d.has_walkthrough,
      // #711: the demo does not run the validator; its one walkthrough is the fixture, which passes.
      walkthrough_ok: d.id === 'rc_demo_stew',
      walkthrough: d.id === 'rc_demo_stew' ? DEMO_STEW_WALKTHROUGH : null,
      walkthrough_check: d.id === 'rc_demo_stew' ? { ok: true, problems: [] } : null,
      cook_count: 0,
      unrated_cook_id: null,
      lines: d.lines.map((l, i) => ({
        recipe_id: d.id,
        line_id: `L${i + 1}`,
        position: i + 1,
        section: l.section ?? '',
        text: l.text,
        qty: l.qty ?? null,
        unit: l.unit ?? '',
        food_id: l.food_id ?? '',
        grams: null,
        optional: !!l.optional,
        resolved_grams: null,
        reason: '',
      })),
      steps: d.steps.map((st, i) => ({
        recipe_id: d.id,
        position: i + 1,
        section: st.section ?? '',
        name: st.name ?? '',
        text: st.text,
      })),
    };
  });
}

function seedCooks(now: number): Cook[] {
  return DEMO_COOKS.map((c, i) => ({
    id: c.id,
    recipe_id: c.recipe_id,
    recipe_name: '',
    date: localDate(new Date(now - c.days_ago * DAY)),
    rating: c.rating,
    note: c.note,
    plan_id: '',
    created: new Date(now - c.days_ago * DAY + i).toISOString(),
  }));
}

/** Newest first: by date, then when it was recorded. */
const cookOrder = (a: Cook, b: Cook) => (b.date + b.created).localeCompare(a.date + a.created);

export function createDemoApi(): ForageApi {
  const foods: Food[] = DEMO_FOODS.map((f) => JSON.parse(JSON.stringify(f)));
  const now = Date.now();
  const recipes: RecipeDetail[] = seedRecipes(now);
  const cooks: Cook[] = seedCooks(now);
  // #712: the food log, as stored. Each entry's snapshot is the demo's stand-in for the API's, taken when written.
  const log: FoodLogEntry[] = [];
  // #709: the plan's rows, as stored; reads derive the rest as the API does.
  const today = localDate(new Date(now));
  const plan = DEMO_PLAN.map((p, i) => ({
    id: p.id,
    date: addDays(today, p.in_days),
    slot: p.slot,
    recipe_id: p.recipe_id ?? '',
    note: p.note ?? '',
    trip_id: p.trip_id ?? '',
    created: new Date(now + i).toISOString(),
    updated: new Date(now + i).toISOString(),
  }));
  type PlanRow = (typeof plan)[number];
  // #718: the sample trips, over the same plan, foods and recipes.
  const trips = createDemoTrips({ now, today, plan, foods, recipes, gramsOf });

  /** A Plan row as `getPlan` answers it: the recipe's name and kcal a serving, the trip's status. */
  function planView(p: PlanRow): PlanEntry {
    const r = recipes.find((x) => x.id === p.recipe_id);
    const n = r ? withNutrition(r) : null;
    const status = p.trip_id ? trips.statusOf(p.trip_id) : '';
    return {
      ...clone(p),
      recipe_name: r?.name ?? '',
      servings: r?.servings ?? null,
      kcal_serving: n ? n.nutrition.per_serving.kcal : null,
      partial: n ? n.partial : false,
      trip_status: status,
      on_trip: !!p.trip_id,
      shopped: status === 'closed',
    };
  }

  function findMeal(id: string): PlanRow {
    const p = plan.find((x) => x.id === id);
    if (!p) throw new ApiError(`Plan entry "${id}" not found`, 'not_found');
    return p;
  }

  const byName = (name: string) => foods.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

  /** What the API derives from Cooks (#703, #708): the latest rating and date, the count, the unrated latest. */
  function cookFields(id: string) {
    const mine = cooks.filter((c) => c.recipe_id === id).sort(cookOrder);
    const rated = mine.find((c) => c.rating !== null);
    return {
      rating: rated?.rating ?? null,
      last_cooked: mine[0]?.date ?? null,
      cook_count: mine.length,
      unrated_cook_id: mine[0] && mine[0].rating === null ? mine[0].id : null,
    };
  }

  function withNutrition(r: RecipeDetail): RecipeDetail {
    const nutrition = nutritionOf(r.lines, r.servings, foods);
    const lines = r.lines.map((l, i) => ({
      ...l,
      resolved_grams: nutrition.by_line![i].grams,
      reason: (nutrition.missing.find((m) => m.line_id === l.line_id)?.reason ?? '') as Line['reason'],
    }));
    return { ...r, lines, nutrition, partial: nutrition.partial, ...cookFields(r.id) };
  }

  /** A log entry's snapshot as the API takes it (#703): a food by its grams, a recipe by its servings. */
  function snapshotOf(input: LogEntryInput) {
    if ('food_id' in input) {
      const food = foods.find((f) => f.id === input.food_id);
      if (!food) throw new ApiError(`food_id "${input.food_id}" is not a food`);
      const serving = (food.servings_json ?? []).find((w) => w.name === input.unit);
      if (input.unit !== 'g' && !serving) {
        throw new ApiError(`unit "${input.unit}" is not one of this food's servings, or g`);
      }
      const grams = input.unit === 'g' ? input.qty : input.qty * serving!.g;
      const known = hasNutrition(food);
      const of = (v: number | null) => (known ? round1((v! * grams) / 100) : null);
      return {
        grams: round1(grams),
        kcal: of(food.kcal_100g),
        protein_g: of(food.protein_100g),
        carbs_g: of(food.carbs_100g),
        fat_g: of(food.fat_100g),
        partial: !known,
      };
    }
    const r = recipes.find((x) => x.id === input.recipe_id);
    if (!r) throw new ApiError(`recipe_id "${input.recipe_id}" is not a recipe`);
    const { per_serving: per, partial } = withNutrition(r).nutrition;
    const times = (v: number | null) => (v === null ? null : round1(v * input.qty));
    return {
      grams: null,
      kcal: times(per.kcal),
      protein_g: times(per.protein_g),
      carbs_g: times(per.carbs_g),
      fat_g: times(per.fat_g),
      partial: partial || per.kcal === null,
    };
  }

  /** logFood: the same id again replaces that entry; a dry run answers it and stores nothing. */
  function writeLog(input: LogEntryInput, dryRun: boolean, keep?: FoodLogEntry): FoodLogEntry {
    const id = input.id ?? nextId('lg');
    const existing = keep ?? log.find((e) => e.id === id);
    const isRecipe = 'recipe_id' in input;
    const unit = isRecipe ? 'serving' : input.unit;
    const same =
      !!existing &&
      existing.qty === input.qty &&
      existing.unit === unit &&
      (isRecipe ? existing.recipe_id === input.recipe_id : existing.food_id === input.food_id);
    const snap =
      same && existing
        ? {
            grams: existing.grams,
            kcal: existing.kcal,
            protein_g: existing.protein_g,
            carbs_g: existing.carbs_g,
            fat_g: existing.fat_g,
            partial: existing.partial,
          }
        : snapshotOf(input);
    const now = new Date().toISOString();
    const entry: FoodLogEntry = {
      id,
      date: input.date,
      slot: input.slot,
      food_id: isRecipe ? '' : input.food_id,
      recipe_id: isRecipe ? input.recipe_id : '',
      qty: input.qty,
      unit,
      ...snap,
      source: existing?.source ?? 'app',
      logged_at: existing?.logged_at ?? now,
      created: existing?.created ?? now,
      updated: now,
    };
    if (dryRun) return entry;
    const i = log.findIndex((e) => e.id === id);
    if (i === -1) log.push(entry);
    else log[i] = entry;
    return clone(entry);
  }

  function findLog(id: string): FoodLogEntry {
    const e = log.find((x) => x.id === id);
    if (!e) throw new ApiError(`Log entry "${id}" not found`);
    return e;
  }

  /** `getRecipes` `q` and `sort`, as the API does them. */
  function search(q: string, sort: RecipeSort): RecipeSummary[] {
    const needle = q.trim().toLowerCase();
    const out: RecipeSummary[] = [];
    for (const r of recipes) {
      let matched = '';
      if (needle && !r.name.toLowerCase().includes(needle)) {
        const hit = r.lines.find((l) => {
          const food = foods.find((f) => f.id === l.food_id);
          return l.text.toLowerCase().includes(needle) || !!food?.name.toLowerCase().includes(needle);
        });
        if (!hit) continue;
        matched = hit.text;
      }
      const row = summary(r);
      if (needle) row.matched_line = matched;
      out.push(row);
    }
    const newest = (a: RecipeSummary, b: RecipeSummary) => b.created.localeCompare(a.created);
    const desc = (k: 'rating' | 'last_cooked') => (a: RecipeSummary, b: RecipeSummary) => {
      const x = a[k];
      const y = b[k];
      if (x === null || y === null) return x === y ? newest(a, b) : x === null ? 1 : -1;
      return x < y ? 1 : x > y ? -1 : newest(a, b);
    };
    const order =
      sort === 'name'
        ? (a: RecipeSummary, b: RecipeSummary) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || newest(a, b)
        : sort === 'rating' || sort === 'last_cooked'
          ? desc(sort)
          : newest;
    return out.sort(order);
  }

  function withName(c: Cook): Cook {
    return { ...clone(c), recipe_name: recipes.find((r) => r.id === c.recipe_id)?.name ?? '' };
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
    getRecipes: async (query = {}) => search(query.q ?? '', query.sort ?? 'newest'),
    getFoods: async (q) => {
      const want = (q ?? '').trim().toLowerCase();
      return clone(foods.filter((f) => !want || `${f.name} ${f.brand}`.toLowerCase().includes(want)));
    },
    createFood: (name) => api.saveFood({ name, kind: 'ingredient', source: 'manual' }),
    deleteRecipe: async (id) => {
      // As the API: a recipe a planned meal uses stays (#703).
      const planned = plan.filter((p) => p.recipe_id === id).map((p) => p.id);
      if (planned.length) {
        throw new ApiError(`Recipe "${id}" is in use, so it was not deleted`, 'in_use', {
          uses: { plan: planned, log: [] },
        });
      }
      const i = recipes.findIndex((r) => r.id === id);
      if (i !== -1) recipes.splice(i, 1);
      for (let j = cooks.length - 1; j >= 0; j--) if (cooks[j].recipe_id === id) cooks.splice(j, 1);
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
        cook_count: 0,
        unrated_cook_id: null,
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
    getCooks: async (recipeId) =>
      cooks
        .filter((c) => !recipeId || c.recipe_id === recipeId)
        .sort(cookOrder)
        .map(withName),
    saveCook: async (input) => {
      const existing = cooks.find((c) => c.id === input.id);
      if (existing) {
        for (const k of ['rating', 'note', 'date', 'plan_id'] as const) {
          if (input[k] !== undefined)
            (existing as unknown as Record<string, unknown>)[k] = input[k] === '' ? null : input[k];
        }
        if (existing.note === null) existing.note = '';
        return withName(existing);
      }
      if (!recipes.some((r) => r.id === input.recipe_id)) {
        throw new ApiError(`recipe_id "${input.recipe_id ?? ''}" is not a recipe`);
      }
      if (input.plan_id) throw new ApiError(`plan_id "${input.plan_id}" is not a plan entry`);
      const cook: Cook = {
        id: input.id,
        recipe_id: input.recipe_id!,
        recipe_name: '',
        date: input.date ?? localDate(),
        rating: input.rating ?? null,
        note: input.note ?? '',
        plan_id: '',
        created: new Date().toISOString(),
      };
      cooks.push(cook);
      return withName(cook);
    },
    deleteCook: async (id) => {
      const i = cooks.findIndex((c) => c.id === id);
      if (i === -1) throw new ApiError(`Cook "${id}" not found`);
      cooks.splice(i, 1);
    },
    logFood: async (entry) => {
      writeLog(entry, false);
    },
    getFoodLog: async (from, to) =>
      clone(
        log
          .filter((e) => e.date >= from && e.date <= to)
          .sort(
            (a, b) =>
              a.date.localeCompare(b.date) ||
              SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
              a.logged_at.localeCompare(b.logged_at),
          ),
      ),
    getFoodLogTotals: async (from, to) => {
      const by = new Map<string, FoodLogDay>();
      for (const e of log.filter((x) => x.date >= from && x.date <= to)) {
        const day = by.get(e.date) ?? {
          date: e.date,
          entries: 0,
          unknown_entries: 0,
          kcal: null,
          protein_g: null,
          carbs_g: null,
          fat_g: null,
          partial: false,
        };
        day.entries++;
        if (e.kcal === null) day.unknown_entries++;
        for (const f of ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const) {
          const v = e[f];
          if (v !== null) day[f] = (day[f] ?? 0) + v;
        }
        if (e.partial || e.kcal === null) day.partial = true;
        by.set(e.date, day);
      }
      const r1 = (v: number | null) => (v === null ? null : round1(v));
      const days = [...by.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({
          ...d,
          kcal: r1(d.kcal),
          protein_g: r1(d.protein_g),
          carbs_g: r1(d.carbs_g),
          fat_g: r1(d.fat_g),
        }));
      return { from, to, days };
    },
    logEntry: async (entry, dryRun = false) => writeLog(entry, dryRun),
    updateLogEntry: async (id, changes, dryRun = false) => {
      const was = findLog(id);
      const base: LogEntryInput = was.recipe_id
        ? { id, date: was.date, slot: was.slot, recipe_id: was.recipe_id, qty: was.qty, unit: 'serving' }
        : { id, date: was.date, slot: was.slot, food_id: was.food_id, qty: was.qty, unit: was.unit };
      return writeLog({ ...base, ...changes } as LogEntryInput, dryRun, was);
    },
    deleteLogEntry: async (id) => {
      log.splice(log.indexOf(findLog(id)), 1);
    },
    getPlan: async (from, to, day) => {
      const last = addDays(day, 7);
      const order = (a: PlanRow, b: PlanRow) =>
        a.date.localeCompare(b.date) ||
        SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) ||
        a.created.localeCompare(b.created);
      return {
        entries: plan
          .filter((p) => p.date >= from && p.date <= to)
          .sort(order)
          .map(planView),
        not_on_trip: plan.filter((p) => p.recipe_id && !p.trip_id && p.date > day && p.date <= last).length,
        late_meals: trips.lateMeals(day),
      };
    },
    planMeal: async (input) => {
      if ('recipe_id' in input && !recipes.some((r) => r.id === input.recipe_id)) {
        throw new ApiError(`recipe_id "${input.recipe_id}" is not a recipe`);
      }
      const now = new Date().toISOString();
      const existing = plan.find((p) => p.id === input.id);
      const row: PlanRow = {
        id: input.id,
        date: input.date,
        slot: input.slot,
        recipe_id: 'recipe_id' in input ? input.recipe_id : '',
        note: 'note' in input ? input.note.trim() : '',
        trip_id: existing?.trip_id ?? '',
        created: existing?.created ?? now,
        updated: now,
      };
      if (existing) Object.assign(existing, row);
      else plan.push(row);
      return planView(row);
    },
    moveMeal: async (id, changes) => {
      const p = findMeal(id);
      Object.assign(p, changes, { updated: new Date().toISOString() });
      return planView(p);
    },
    removeMeal: async (id) => {
      plan.splice(plan.indexOf(findMeal(id)), 1);
    },
    getTrip: trips.getTrip,
    getClosedTrips: trips.getClosedTrips,
    startTrip: trips.startTrip,
    setTripItem: trips.setTripItem,
    closeTrip: trips.closeTrip,
    discardTrip: trips.discardTrip,
    addToTrip: trips.addToTrip,
    removeTripItem: trips.removeTripItem,
  };
  // #712: the sample days, logged through the same path as the app's entries, in the order logged.
  DEMO_LOG.forEach((d, i) => {
    const date = addDays(today, -d.days_ago);
    writeLog({ ...d.entry, id: `lg_demo_${i + 1}`, date } as LogEntryInput, false);
    const at = new Date(now - d.days_ago * DAY - (DEMO_LOG.length - i) * 60000).toISOString();
    Object.assign(log[log.length - 1], { logged_at: at, created: at, updated: at });
  });
  return api;
}
