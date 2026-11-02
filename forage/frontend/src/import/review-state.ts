// The review screen's state (#706), in module-level signals so the shell can
// swap the tab for the review and back. Every figure on the screen comes from
// the API: an edit or a match refreshes the preview with a fresh dry run.
import { signal } from '@preact/signals';
import { ApiError, type ForageApi } from '../api/client';
import type { Food, ImportFlag, ImportPreview, Nutrition, StructuredRecipe, Suggestion } from '../api/types';

export interface DraftLine {
  /** Stable for the life of the review, for keys and focus. */
  key: number;
  section: string;
  /** The source's line, verbatim. Editing never changes it. */
  text: string;
  qty: number | null;
  unit: string;
  name: string;
  note: string;
  grams: number | null;
  optional: boolean;
  flags: ImportFlag[];
  food_id: string;
  suggestions: Suggestion[];
}

export interface Review {
  name: string;
  /** As typed: blank blocks Save. */
  servings: string;
  minutes: string;
  source_url: string;
  source_site: string;
  notes: string;
  lines: DraftLine[];
  steps: ImportPreview['steps'];
  nutrition: Nutrition;
  duplicate_of: ImportPreview['duplicate_of'];
  /** "Import again" was tapped. */
  allowDuplicate: boolean;
  edited: boolean;
  refreshing: boolean;
  saving: boolean;
  /** A fixed sentence above Save, or null. */
  saveError: string | null;
}

export const review = signal<Review | null>(null);
/** The library's foods, for names and the chooser; new ones are added as they are made. */
export const foods = signal<Food[]>([]);
/** "Saved <name>", shown in Library for four seconds. */
export const savedNotice = signal<string | null>(null);

let keySeq = 0;
let refreshSeq = 0;

export function openReview(preview: ImportPreview, library: Food[]): void {
  foods.value = library;
  review.value = {
    name: preview.recipe.name,
    servings: preview.recipe.servings === null ? '' : String(preview.recipe.servings),
    minutes: preview.recipe.total_min === null ? '' : String(preview.recipe.total_min),
    source_url: preview.recipe.source_url,
    source_site: preview.recipe.source_site,
    notes: preview.recipe.notes,
    lines: preview.lines.map((l) => ({
      key: ++keySeq,
      section: l.section,
      text: l.text,
      qty: l.qty,
      unit: l.unit,
      name: l.name,
      note: l.note,
      grams: l.grams,
      optional: l.optional,
      flags: l.flags,
      food_id: l.food_id,
      suggestions: l.suggestions,
    })),
    steps: preview.steps,
    nutrition: preview.nutrition,
    duplicate_of: preview.duplicate_of,
    allowDuplicate: false,
    edited: false,
    refreshing: false,
    saving: false,
    saveError: null,
  };
}

export function closeReview(): void {
  review.value = null;
}

export function patchReview(patch: Partial<Review>): void {
  if (review.value) review.value = { ...review.value, ...patch };
}

/** Lines that count and have no food: what "Which food is this?" and "Add N new foods" are about. */
export function unmatched(r: Review): DraftLine[] {
  return r.lines.filter((l) => !l.optional && !l.food_id);
}

/** The distinct cleaned names of the unmatched lines, in order. */
export function unmatchedNames(r: Review): string[] {
  const seen = new Set<string>();
  return unmatched(r)
    .map((l) => l.name.trim())
    .filter((n) => {
      const k = n.toLowerCase();
      if (!n || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function wholeNumber(s: string): number | null {
  const n = Number(s.trim());
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

/** The review as the structured `recipe` input. */
export function toStructured(r: Review): StructuredRecipe {
  return {
    name: r.name.trim(),
    servings: wholeNumber(r.servings),
    total_min: r.minutes.trim() === '' ? null : Number(r.minutes) >= 0 ? Number(r.minutes) : null,
    source_url: r.source_url,
    notes: r.notes,
    lines: r.lines.map((l) => ({
      text: l.text,
      qty: l.qty,
      unit: l.unit,
      name: l.name,
      note: l.note,
      food_id: l.food_id,
      grams: l.grams,
      section: l.section,
      optional: l.optional,
    })),
    steps: r.steps.map((s) => ({ text: s.text, section: s.section, name: s.name })),
  };
}

/** Why Save is disabled, or null. */
export function saveBlocker(r: Review): string | null {
  if (!r.lines.length) return 'A recipe needs at least one ingredient';
  if (wholeNumber(r.servings) === null) return 'How many does it serve?';
  if (r.duplicate_of && !r.allowDuplicate) return 'Already in your library';
  return null;
}

/**
 * Change lines and refresh the preview from a dry run. Only the API's answer
 * moves the nutrition line; a stale answer is dropped.
 */
export async function updateLines(api: ForageApi, change: (lines: DraftLine[]) => DraftLine[]): Promise<void> {
  const current = review.value;
  if (!current) return;
  const lines = change(current.lines);
  patchReview({ lines, edited: true, refreshing: true });
  await refresh(api);
}

export async function refresh(api: ForageApi): Promise<void> {
  const r = review.value;
  if (!r) return;
  const seq = ++refreshSeq;
  try {
    const preview = await api.previewImport({ recipe: toStructured(r) });
    if (seq !== refreshSeq || !review.value) return;
    const now = review.value;
    patchReview({
      refreshing: false,
      nutrition: preview.nutrition,
      lines: now.lines.map((l, i) => {
        const p = preview.lines[i];
        return p && !l.food_id && p.food_id ? { ...l, food_id: p.food_id } : l;
      }),
    });
  } catch {
    if (seq === refreshSeq) patchReview({ refreshing: false });
  }
}

/** Create a food with only a name, keep it in the library list, and answer it. */
export async function createFood(api: ForageApi, name: string): Promise<Food> {
  const food = await api.createFood(name.trim());
  foods.value = [...foods.value, food];
  return food;
}

/**
 * Add a starter food (#707) and answer its library food, now in the list:
 * the one it became, filled in, or already was.
 */
export async function addStarterFood(api: ForageApi, starterId: string): Promise<Food> {
  const res = await api.addStarterFoods([starterId]);
  const made = res.added[0] ?? res.filled[0] ?? res.existing[0];
  const food = await api.getFood(made.id);
  foods.value = [...foods.value.filter((f) => f.id !== food.id), food];
  return food;
}

/** Match every line whose cleaned name is `name` (case-insensitive) and has no food. */
export function matchByName(lines: DraftLine[], name: string, foodId: string): DraftLine[] {
  const k = name.trim().toLowerCase();
  return lines.map((l) => (!l.food_id && l.name.trim().toLowerCase() === k ? { ...l, food_id: foodId } : l));
}

/** "Add N new foods": one food per distinct unmatched name. Answers how many of how many. */
export async function addNewFoods(api: ForageApi): Promise<{ added: number; of: number }> {
  const r = review.value;
  if (!r) return { added: 0, of: 0 };
  const names = unmatchedNames(r);
  const made: { name: string; id: string }[] = [];
  for (const name of names) {
    try {
      made.push({ name, id: (await createFood(api, name)).id });
    } catch {
      // The rest still get their foods; the status line says how many.
    }
  }
  await updateLines(api, (lines) => made.reduce((ls, m) => matchByName(ls, m.name, m.id), lines));
  return { added: made.length, of: names.length };
}

/** The fixed sentence for a refused save. */
export function saveErrorText(err: unknown, r: Review): string {
  if (err instanceof ApiError) {
    if (err.code === 'network') return "Couldn't save. Your edits are kept here. Try again.";
    const missing = /food_id "([^"]+)" is not a food/.exec(err.message);
    if (missing) {
      const n = r.lines.findIndex((l) => l.food_id === missing[1]);
      return `Couldn't save: a food for line ${n + 1} no longer exists`;
    }
    if (err.code === 'incomplete') return `Couldn't save: ${err.message}`;
  }
  return "Couldn't save. Your edits are kept here. Try again.";
}
