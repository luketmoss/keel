// The Eaten tab's data (#712), loaded through the API. Components read the signals; this file owns the fetching.
// The day card is `getFoodLogTotals` for the day and each row an entry's stored snapshot: the app adds nothing up.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import { quietGate } from '../api/quiet-gate';
import type { Food, FoodLogDay, FoodLogEntry, FoodLogMeal, PlanEntry, RecipeSummary } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';

export type DayState = 'loading' | 'ready' | 'error';

/** The day Eaten shows. Never after the device's today. */
export const eatenDate = signal(localDate());
/** The device's today when the day was last loaded or moved. */
export const eatenToday = signal(localDate());
export const dayState = signal<DayState>('loading');
export const dayEntries = signal<FoodLogEntry[]>([]);
/** The day's totals, or null when nothing is logged (the date is absent from `days`). */
export const dayTotals = signal<FoodLogDay | null>(null);
/** The day's per-meal totals (#866), one per slot with an entry; empty when the API answered without `meals`. */
export const dayMeals = signal<FoodLogMeal[]>([]);
/** The day's planned recipe meals, in plan order, before the log hides any. */
export const dayPlan = signal<PlanEntry[]>([]);
/** The library, for the entries' names and the Add sheet. */
export const logFoods = signal<Food[]>([]);
export const logRecipes = signal<RecipeSummary[]>([]);

/**
 * The one inline amount editor open in the day (#882): the entry, the amount being set, the dry-run preview of it, and
 * whether it is saving or the save failed. The row reads it for its chip and calories; the editor writes it.
 */
export interface AmountEdit {
  id: string;
  /** What is stored, to tell a change from none. */
  base: { qty: number; unit: string };
  qty: number;
  unit: string;
  /** The API's dry run of `qty` and `unit`; null until one answers, or while the amount is the stored one. */
  preview: FoodLogEntry | null;
  busy: boolean;
  error: boolean;
}
export const editing = signal<AmountEdit | null>(null);

/** The preview is asked for this long after the last change to the amount or unit. */
export const PREVIEW_DELAY_MS = 400;
let previewSeq = 0;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<boolean> | null = null;

function stopPreview(): void {
  clearTimeout(previewTimer);
  previewSeq++;
}

/** Open the editor on an entry, at its stored amount. The caller has closed any other first. */
export function openEditor(entry: FoodLogEntry): void {
  stopPreview();
  editing.value = {
    id: entry.id,
    base: { qty: entry.qty, unit: entry.unit },
    qty: entry.qty,
    unit: entry.unit,
    preview: null,
    busy: false,
    error: false,
  };
}

/** Set the amount being edited; the row's calories follow from one dry run, 400ms after the last change. */
export function setDraft(api: ForageApi, qty: number, unit: string): void {
  const e = editing.value;
  if (!e || e.busy) return;
  stopPreview();
  const changed = qty !== e.base.qty || unit !== e.base.unit;
  editing.value = { ...e, qty, unit, error: false, preview: changed ? e.preview : null };
  if (!changed) return;
  const mine = previewSeq;
  previewTimer = setTimeout(() => {
    api.updateLogEntry(e.id, { qty, unit }, true).then(
      (preview) => {
        const now = editing.value;
        if (mine === previewSeq && now && now.id === e.id) editing.value = { ...now, preview };
      },
      // A failed preview leaves the old figure and says nothing: the save is still allowed.
      () => {},
    );
  }, PREVIEW_DELAY_MS);
}

/**
 * Close the editor, saving a changed amount first (#882, #785): the entry as the write answered it goes into the day,
 * the editor closes, and the totals refresh quietly. Resolves true when nothing is left open; false when the save
 * failed, which leaves the editor open with its error.
 */
export function closeEditor(api: ForageApi): Promise<boolean> {
  const e = editing.value;
  if (!e) return Promise.resolve(true);
  if (saving) return saving;
  stopPreview();
  const changes: { qty?: number; unit?: string } = {};
  if (e.qty !== e.base.qty) changes.qty = e.qty;
  if (e.unit !== e.base.unit) changes.unit = e.unit;
  if (!Object.keys(changes).length) {
    editing.value = null;
    return Promise.resolve(true);
  }
  editing.value = { ...e, busy: true, error: false };
  saving = (async () => {
    try {
      upsertEntry(await api.updateLogEntry(e.id, changes));
      editing.value = null;
      void refreshDay(api);
      return true;
    } catch {
      const now = editing.value;
      if (now) editing.value = { ...now, busy: false, error: true };
      return false;
    } finally {
      saving = null;
    }
  })();
  return saving;
}

/** Run `go` once the editor is closed and saved; if the save fails, it stays open and `go` does not run. */
export function afterEditor(api: ForageApi, go: () => void): void {
  if (!editing.value) go();
  else void closeEditor(api).then((ok) => ok && go());
}

let latest = 0;
/** The day the last load was for (#825): a hash that moves `eatenDate` without a day move is loaded by the screen. */
export let loadedDate = '';
/** Counts the entries patched in from a write's reply, so a refresh that began before one can't undo it (#785). */
let patches = 0;
const gate = quietGate();
/** A queued refresh must also fetch the recipes (the Nutrition sheet changed one); cleared when a refresh starts. */
let wantRecipes = false;
/** A full load began and its answer hasn't landed: a quiet refresh that supersedes it reads everything, so nothing is lost. */
let fullOut = false;

/**
 * Load the viewed day: its entries, its totals, its plan, and the library's names. A slower, older answer never wins.
 * `quiet` is the refresh after a save (#785): a failure leaves what is on screen alone, and an answer that began
 * before a later patch is dropped, since it would put older data over the newer row.
 */
export async function loadDay(api: ForageApi, date = eatenDate.value, quiet = false): Promise<void> {
  const seq = ++latest;
  loadedDate = date;
  const before = patches;
  const today = localDate();
  if (!quiet) {
    gate.cancel();
    fullOut = true;
  }
  eatenToday.value = today;
  // A log write can't change the plan, the foods or the recipes, so a quiet refresh reads only the log and its
  // totals, unless the Nutrition sheet changed a recipe (#790).
  const everything = !quiet || fullOut;
  const withRecipes = everything || wantRecipes;
  wantRecipes = false;
  try {
    const [entries, totals, plan, foods, recipes] = await Promise.all([
      api.getFoodLog(date, date),
      api.getFoodLogTotals(date, date, true),
      everything ? api.getPlan(date, date, today) : null,
      everything ? api.getFoods() : null,
      withRecipes ? api.getRecipes() : null,
    ]);
    if (seq !== latest) return;
    if (quiet && patches !== before) return;
    dayEntries.value = entries;
    const day = totals.days.find((d) => d.date === date) ?? null;
    dayTotals.value = day;
    dayMeals.value = day?.meals ?? [];
    if (plan) dayPlan.value = plan.entries.filter((p) => p.date === date && p.recipe_id);
    if (foods) logFoods.value = foods;
    if (recipes) logRecipes.value = recipes;
    if (everything) fullOut = false;
    dayState.value = 'ready';
  } catch {
    if (seq !== latest || quiet) return;
    dayState.value = 'error';
  }
}

/**
 * Refresh the day after a save without touching `dayState`: the totals catch up, nothing blanks (#785). One at a
 * time (#790): asked again while one is out, it runs once more when that settles. `recipes` also reads the recipe
 * list, for a change to a recipe's nutrition.
 */
export function refreshDay(api: ForageApi, recipes = false): Promise<void> {
  if (recipes) wantRecipes = true;
  return gate.request(() => loadDay(api, eatenDate.value, true));
}

/** Put an entry as the write answered it into the day: inserted, or replaced in place. Another day's is left to the refresh. */
export function upsertEntry(entry: FoodLogEntry): void {
  if (entry.date !== eatenDate.value) return;
  const rest = dayEntries.value;
  const i = rest.findIndex((e) => e.id === entry.id);
  const next = i < 0 ? [...rest, entry] : rest.map((e) => (e.id === entry.id ? entry : e));
  // The order a reload gives: by when each was logged.
  dayEntries.value = next.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  patches++;
}

/** A food the day's rows may name, as the screen has it now: a food added moments ago isn't in `logFoods` yet. */
export function knowFood(food: Food): void {
  logFoods.value = [...logFoods.value.filter((f) => f.id !== food.id), food];
}

/** Take a deleted entry out of the day. */
export function removeEntry(id: string): void {
  dayEntries.value = dayEntries.value.filter((e) => e.id !== id);
  patches++;
}

/** Move a day back or forward; forward stops at today. */
export function moveDay(api: ForageApi, by: -1 | 1): void {
  const today = localDate();
  const next = addDays(eatenDate.value, by);
  if (next > today) return;
  eatenDate.value = next;
  dayState.value = 'loading';
  void loadDay(api, next);
}

/**
 * The planned meals still to offer: each log entry with the same recipe and slot hides one plan entry, so a
 * recipe planned twice in a slot still offers the second once the first is logged.
 */
export function unloggedPlan(plan: PlanEntry[], entries: FoodLogEntry[]): PlanEntry[] {
  const logged = new Map<string, number>();
  for (const e of entries) {
    if (!e.recipe_id) continue;
    const k = `${e.slot}|${e.recipe_id}`;
    logged.set(k, (logged.get(k) ?? 0) + 1);
  }
  return plan.filter((p) => {
    const k = `${p.slot}|${p.recipe_id}`;
    const n = logged.get(k) ?? 0;
    if (!n) return true;
    logged.set(k, n - 1);
    return false;
  });
}

/** Forget what was loaded (tests and sign-out). */
export function _resetEaten(): void {
  latest++;
  gate.reset();
  wantRecipes = false;
  fullOut = false;
  patches = 0;
  loadedDate = '';
  stopPreview();
  saving = null;
  editing.value = null;
  eatenDate.value = localDate();
  eatenToday.value = localDate();
  dayState.value = 'loading';
  dayEntries.value = [];
  dayTotals.value = null;
  dayMeals.value = [];
  dayPlan.value = [];
  logFoods.value = [];
  logRecipes.value = [];
}
