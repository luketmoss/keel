// Test-only: a fake Forage API behind `fetch`, so component tests drive the
// real client. It records every request and answers each action from a small
// in-memory store; a test overrides one action with `answer`.
import { vi } from 'vitest';
import type {
  Cook,
  Food,
  ImportPreview,
  PlanEntry,
  RecipeSummary,
  StructuredLine,
  StructuredRecipe,
  Trip,
  TripSummary,
} from './api/types';

export const API_URL = 'https://api.test/exec';

export interface Sent {
  action: string;
  access_token: string | null;
  payload: any;
  headers: unknown;
  method: string | undefined;
  /** Every parameter sent, for a read's filters (#709's getPlan). */
  params: URLSearchParams;
}

type Answer = { success: true; data: unknown } | { success: false; error: string; code?: string; [k: string]: unknown };

export function emptyNutrition(lines: { line_id: string; food_id: string; optional: boolean }[]) {
  const missing = lines
    .filter((l) => !l.optional && !l.food_id)
    .map((l) => ({ line_id: l.line_id, reason: 'no_food' }));
  return {
    per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
    missing,
    partial: missing.length > 0,
  };
}

/** A preview from a structured recipe, as the API answers one: food ids kept, nothing else matched. */
export function previewOf(r: StructuredRecipe): ImportPreview {
  const lines = r.lines.map((raw, i) => {
    const l: StructuredLine = typeof raw === 'string' ? { text: raw } : raw;
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
      food_id: l.food_id ?? '',
      match: null,
      suggestions: [],
    };
  });
  return {
    recipe: {
      name: r.name,
      source_url: r.source_url ?? '',
      source_site: '',
      servings: r.servings ?? null,
      total_min: r.total_min ?? null,
      notes: r.notes ?? '',
    },
    lines,
    steps: r.steps.map((s, i) => ({
      position: i + 1,
      section: '',
      name: '',
      ...(typeof s === 'string' ? { text: s } : s),
    })),
    nutrition: emptyNutrition(lines) as ImportPreview['nutrition'],
    duplicate_of: null,
    needs: [],
  };
}

/** The preview a read answers: two lines, one unmatched, plus a to-taste line. */
export const READ_PREVIEW: ImportPreview = {
  recipe: {
    name: 'Weeknight Lentil Soup',
    source_url: 'https://example.com/weeknight-lentil-soup',
    source_site: 'example.com',
    servings: 4,
    total_min: 45,
    notes: '',
  },
  lines: [
    {
      line_id: 'L1',
      section: '',
      text: '1 1/2 cups red lentils, rinsed',
      qty: 1.5,
      unit: 'cup',
      name: 'red lentils',
      note: 'rinsed',
      grams: null,
      optional: false,
      flags: [],
      food_id: '',
      match: null,
      suggestions: [],
    },
    {
      line_id: 'L2',
      section: 'For the pot',
      text: '1 large onion, diced',
      qty: 1,
      unit: 'large',
      name: 'onion',
      note: 'diced',
      grams: null,
      optional: false,
      flags: [],
      food_id: '',
      match: null,
      suggestions: [],
    },
    {
      line_id: 'L3',
      section: 'For the pot',
      text: 'salt, to taste',
      qty: null,
      unit: '',
      name: 'salt',
      note: 'to taste',
      grams: null,
      optional: true,
      flags: ['to_taste', 'no_qty'],
      food_id: '',
      match: null,
      suggestions: [],
    },
  ],
  steps: [
    { position: 1, section: '', name: '', text: 'Soften the onion.' },
    { position: 2, section: '', name: '', text: 'Simmer the lentils.' },
  ],
  nutrition: emptyNutrition([
    { line_id: 'L1', food_id: '', optional: false },
    { line_id: 'L2', food_id: '', optional: false },
  ]) as ImportPreview['nutrition'],
  duplicate_of: null,
  needs: [],
};

export function fakeApi() {
  const sent: Sent[] = [];
  const foods: Food[] = [];
  const recipes: RecipeSummary[] = [];
  const cooks: Cook[] = [];
  /** #709: the plan, as getPlan answers it; `notOnTrip` is the banner count it reports. */
  const plan: PlanEntry[] = [];
  const counts = { notOnTrip: 0 };
  /** #718: the open trip getTrip answers, the closed ones getTrips answers, and what startTrip builds. */
  const trips: { open: Trip | null; closed: TripSummary[]; built: Trip | null } = {
    open: null,
    closed: [],
    built: null,
  };
  const overrides = new Map<string, (payload: any) => Answer>();
  let seq = 0;

  const env = import.meta.env as Record<string, string | undefined>;
  env.VITE_FORAGE_API_URL = API_URL;

  function handle(action: string, payload: any): Answer {
    const override = overrides.get(action);
    if (override) return override(payload);
    switch (action) {
      case 'getRecipes':
        return { success: true, data: recipes };
      case 'getFoods':
        return { success: true, data: foods };
      case 'upsertFood': {
        const food = { id: `fd_${++seq}`, ...payload } as Food;
        foods.push(food);
        return { success: true, data: food };
      }
      case 'deleteRecipe': {
        const i = recipes.findIndex((r) => r.id === payload.id);
        recipes.splice(i, 1);
        return { success: true, data: { id: payload.id, deleted: true } };
      }
      case 'importRecipe': {
        if (payload.recipe && payload.dry_run === false) {
          const p = previewOf(payload.recipe);
          const summary = {
            id: `rc_${++seq}`,
            ...p.recipe,
            source_site: 'example.com',
            created: new Date(2026, 10, seq).toISOString(),
            nutrition: p.nutrition,
            partial: p.nutrition.partial,
          } as RecipeSummary;
          recipes.push(summary);
          return { success: true, data: { ...summary, lines: [], steps: [] } };
        }
        if (payload.recipe) return { success: true, data: previewOf(payload.recipe) };
        return { success: true, data: JSON.parse(JSON.stringify(READ_PREVIEW)) };
      }
      case 'getCooks':
        return { success: true, data: cooks };
      case 'upsertCook': {
        const existing = cooks.find((c) => c.id === payload.id);
        if (existing) Object.assign(existing, payload);
        const cook = existing ?? ({ date: '2026-11-01', rating: null, note: '', plan_id: '', ...payload } as Cook);
        if (!existing) cooks.push(cook);
        return { success: true, data: cook };
      }
      case 'deleteCook':
        cooks.splice(
          cooks.findIndex((c) => c.id === payload.id),
          1,
        );
        return { success: true, data: { id: payload.id, deleted: true } };
      case 'logFood':
        return { success: true, data: { id: payload.id ?? 'lg_1', ...payload } };
      case 'getPlan':
        return { success: true, data: { entries: plan, not_on_trip: counts.notOnTrip } };
      case 'upsertPlanEntry': {
        const recipe = recipes.find((r) => r.id === payload.recipe_id);
        const entry = {
          recipe_id: '',
          note: '',
          trip_id: '',
          created: 'x',
          updated: 'x',
          recipe_name: recipe?.name ?? '',
          servings: recipe?.servings ?? null,
          kcal_serving: recipe?.nutrition.per_serving.kcal ?? null,
          partial: recipe?.partial ?? false,
          trip_status: '',
          on_trip: false,
          shopped: false,
          ...payload,
        } as PlanEntry;
        const i = plan.findIndex((e) => e.id === entry.id);
        if (i === -1) plan.push(entry);
        else plan[i] = entry;
        return { success: true, data: entry };
      }
      case 'movePlanEntry': {
        const entry = plan.find((e) => e.id === payload.id);
        if (!entry) return { success: false, error: `Plan entry "${payload.id}" not found`, code: 'not_found' };
        Object.assign(entry, payload);
        return { success: true, data: entry };
      }
      case 'deletePlanEntry': {
        const i = plan.findIndex((e) => e.id === payload.id);
        if (i === -1) return { success: false, error: `Plan entry "${payload.id}" not found`, code: 'not_found' };
        const [gone] = plan.splice(i, 1);
        return { success: true, data: { ...gone, deleted: true } };
      }
      case 'getTrip':
        return { success: true, data: { trip: trips.open } };
      case 'getTrips':
        return { success: true, data: trips.closed };
      case 'startTrip': {
        const trip = { ...(trips.built as Trip), id: payload.id, through: payload.through };
        if (!payload.dry_run) trips.open = trip;
        return { success: true, data: { trip, written: !payload.dry_run, dry_run: !!payload.dry_run } };
      }
      case 'setTripItem': {
        const item = trips.open?.items.find((i) => i.food_id === payload.food_id);
        if (!trips.open || !item) return { success: false, error: 'Not on the trip', code: 'not_on_trip' };
        if (payload.choice) Object.assign(item, { choice: payload.choice, suggested: false });
        if (payload.choice === 'have') item.bought = false;
        if (payload.bought !== undefined) item.bought = payload.bought;
        return { success: true, data: { item: { ...item } } };
      }
      case 'closeTrip': {
        const trip = { ...(trips.open as Trip), status: 'closed' as const, closed_at: '2026-11-02T18:00:00.000Z' };
        trips.open = null;
        return { success: true, data: { trip } };
      }
      case 'discardTrip': {
        const id = trips.open?.id;
        trips.open = null;
        return { success: true, data: { discarded: id, meals_cleared: 0 } };
      }
      default:
        return { success: false, error: `Unknown action "${action}"` };
    }
  }

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url !== API_URL) throw new Error(`unexpected fetch ${url}`);
    const body = init?.body as URLSearchParams;
    const action = body.get('action')!;
    const raw = body.get('payload');
    const payload = raw ? JSON.parse(raw) : undefined;
    sent.push({
      action,
      access_token: body.get('access_token'),
      payload,
      headers: init?.headers,
      method: init?.method,
      params: body,
    });
    const answer = handle(action, payload);
    return { json: async () => answer } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    sent,
    foods,
    recipes,
    cooks,
    plan,
    counts,
    trips,
    fetch: fetchMock,
    /** Answer one action with this instead. */
    answer(action: string, fn: (payload: any) => Answer) {
      overrides.set(action, fn);
    },
    calls: (action: string) => sent.filter((s) => s.action === action),
  };
}
