// The Eaten tab's data (#712), loaded through the API. Components read the signals; this file owns the fetching.
// The day card is `getFoodLogTotals` for the day and each row an entry's stored snapshot: the app adds nothing up.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import { quietGate } from '../api/quiet-gate';
import type { Food, FoodLogDay, FoodLogEntry, FoodLogMeal, LogMealInput, PlanEntry, Slot } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';
import { showToast } from '../ui/toast';
import { switchUnit, type UnitOption } from './amount-edit';
import {
  beginHeld,
  bindAddAccount,
  dropHeldEntry,
  endHeld,
  heldFoods,
  heldRecipes,
  holdEntry,
  holdFood,
  landHeld,
  _resetAdd,
} from './add-store';
import { newLogId } from './format';
import { previewFood, previewRecipe, type EntryNutrition } from './preview';
import {
  addedMealToast,
  liveItems,
  mealInput,
  provisionalEntries,
  removedMealToast,
  targetName,
  type TrayItem,
} from './tray';

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
/**
 * Read the usuals into the Add sheet's held lists, the tab's one copy (#945), with any usual saved since put back over
 * the answer. A failure leaves what is held, and the Add sheet simply has no Usuals section (#885).
 */
export async function loadDayUsuals(api: ForageApi): Promise<void> {
  const load = beginHeld();
  try {
    landHeld(load, { usuals: await api.getUsuals() });
  } catch {
    // Nothing to say: the foods work without them.
  } finally {
    endHeld(load);
  }
}

/**
 * Bind the Add sheet's held lists to the signed-in account (#931), `null` for the demo user. What the device kept for
 * the account, its usuals included, is what the sheet's first frame shows; a different account drops the last one's.
 */
export function bindAccount(email: string | null): void {
  bindAddAccount(email);
}

/**
 * The one inline amount editor open in the day (#882): the entry, the amount being set, the figures worked out for it
 * (#929, no request), and whether it is saving or the save failed. The row reads it for its chip and calories; the editor writes it.
 */
export interface AmountEdit {
  id: string;
  /** What is stored, to tell a change from none. */
  base: { qty: number; unit: string };
  qty: number;
  unit: string;
  /** The figures of `qty` and `unit` (`preview.ts`); null while the amount is the stored one, or the unit has no weight. */
  preview: EntryNutrition | null;
  busy: boolean;
  error: boolean;
}
export const editing = signal<AmountEdit | null>(null);

let saving: Promise<boolean> | null = null;

/** Open the editor on an entry, at its stored amount. The caller has closed any other first. */
export function openEditor(entry: FoodLogEntry): void {
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

/**
 * The figures of an amount of an entry, worked out here: its food (or recipe) as the day holds it, and the entry's own
 * grams per unit for a serving the food has since renamed (#880). Null for a food or recipe the day doesn't hold, and
 * for a unit with no weight, so the row keeps the stored figure and the save is left to the API.
 */
function figuresFor(entry: FoodLogEntry, qty: number, unit: string): EntryNutrition | null {
  if (entry.recipe_id) {
    const recipe = heldRecipes.value.find((r) => r.id === entry.recipe_id);
    return recipe ? previewRecipe(recipe, qty) : null;
  }
  const food = heldFoods.value.find((f) => f.id === entry.food_id);
  return food ? previewFood(food, qty, unit, entry) : null;
}

/** Set the amount being edited; the row's calories follow on the same tap, with no request (#929). */
export function setDraft(qty: number, unit: string): void {
  const e = editing.value;
  if (!e || e.busy) return;
  const changed = qty !== e.base.qty || unit !== e.base.unit;
  const entry = dayEntries.value.find((x) => x.id === e.id);
  editing.value = { ...e, qty, unit, error: false, preview: changed && entry ? figuresFor(entry, qty, unit) : null };
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

/**
 * Move the open editor to another unit at the same weight and save it (#883), after a serving was added to the food:
 * the entry as the write answered it replaces the row's, and the editor stays open on it. Resolves false when the
 * save failed, which leaves the editor open on the new unit with its error, so Done tries again.
 */
export function switchEditorTo(api: ForageApi, from: UnitOption | undefined, to: UnitOption): Promise<boolean> {
  const e = editing.value;
  if (!e) return Promise.resolve(true);
  if (saving) return saving;
  const qty = switchUnit(e.qty, from, to);
  editing.value = { ...e, qty, unit: to.unit, preview: null, busy: true, error: false };
  saving = (async () => {
    try {
      const entry = await api.updateLogEntry(e.id, { qty, unit: to.unit });
      upsertEntry(entry);
      const now = editing.value;
      if (now && now.id === e.id) {
        editing.value = {
          ...now,
          base: { qty: entry.qty, unit: entry.unit },
          qty: entry.qty,
          unit: entry.unit,
          preview: null,
          busy: false,
          error: false,
        };
      }
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
  // The foods and recipes land in the Add sheet's held lists, the tab's one copy (#939), with any write made since
  // put back over them.
  const library = withRecipes ? beginHeld() : null;
  try {
    const [entries, totals, plan, foods, recipes] = await Promise.all([
      api.getFoodLog(date, date),
      api.getFoodLogTotals(date, date, true),
      everything ? api.getPlan(date, date, today) : null,
      everything ? api.getFoods() : null,
      withRecipes ? api.getRecipes() : null,
    ]);
    if (seq !== latest) return;
    if (library && (foods || recipes)) landHeld(library, { ...(foods && { foods }), ...(recipes && { recipes }) });
    if (quiet && patches !== before) return;
    dayEntries.value = entries;
    const day = totals.days.find((d) => d.date === date) ?? null;
    dayTotals.value = day;
    dayMeals.value = day?.meals ?? [];
    if (plan) dayPlan.value = plan.entries.filter((p) => p.date === date && p.recipe_id);
    if (everything) fullOut = false;
    dayState.value = 'ready';
  } catch {
    if (seq !== latest || quiet) return;
    dayState.value = 'error';
  } finally {
    if (library) endHeld(library);
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
  holdEntry(entry);
  if (entry.date !== eatenDate.value) return;
  const rest = dayEntries.value;
  const i = rest.findIndex((e) => e.id === entry.id);
  const next = i < 0 ? [...rest, entry] : rest.map((e) => (e.id === entry.id ? entry : e));
  // The order a reload gives: by when each was logged.
  dayEntries.value = next.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  patches++;
}

/** Take a deleted entry out of the day. */
export function removeEntry(id: string): void {
  dropHeldEntry(id);
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

/**
 * A meal the tray saved (#933) whose `logMeal` is out or failed: the day shows its rows muted with `Saving…`, or under
 * `Couldn't save N items.` The call is the same on every retry, ids included, so a write that landed but lost its
 * answer is not doubled.
 */
export interface PendingMeal {
  id: string;
  date: string;
  slot: Slot;
  input: LogMealInput;
  /** The entries as the app worked them out, named, until the write answers. */
  rows: { entry: FoodLogEntry; name: string }[];
  /** The foods in it, for the day's names before a refresh knows them. */
  foods: Food[];
  /** A usual is among them: its last pick and use count moved. */
  usual: boolean;
  failed: boolean;
}
export const pendingMeals = signal<PendingMeal[]>([]);

const sending = new Set<string>();

function patchPending(id: string, change: Partial<PendingMeal>): void {
  pendingMeals.value = pendingMeals.value.map((p) => (p.id === id ? { ...p, ...change } : p));
}

/** Save the tray: its rows go on the day at once, muted, and one `logMeal` goes out. The caller closes the sheet. */
export function saveMeal(api: ForageApi, date: string, slot: Slot, tray: TrayItem[]): void {
  const items = liveItems(tray); // #942: an optional line that is off is not saved
  if (!items.length) return;
  const id = newLogId();
  const entries = provisionalEntries(id, date, slot, items);
  pendingMeals.value = [
    ...pendingMeals.value,
    {
      id,
      date,
      slot,
      input: mealInput(date, slot, items),
      rows: items.map((item, i) => ({ entry: entries[i], name: targetName(item.target) })),
      foods: items.flatMap((i) => (i.target.kind === 'food' ? [i.target.food] : [])),
      usual: items.some((i) => !!i.group?.usualId),
      failed: false,
    },
  ];
  void sendMeal(api, id);
}

/** Send a pending meal, or send it again with the same ids. A second call while one is out does nothing. */
export async function sendMeal(api: ForageApi, id: string): Promise<void> {
  const meal = pendingMeals.value.find((p) => p.id === id);
  if (!meal || sending.has(id)) return;
  sending.add(id);
  patchPending(id, { failed: false });
  try {
    const { entries } = await api.logMeal(meal.input);
    // The stored entries replace the pending rows in one update; the totals catch up quietly (#785).
    for (const f of meal.foods) if (!heldFoods.value.some((x) => x.id === f.id)) holdFood(f);
    for (const e of entries) upsertEntry(e);
    pendingMeals.value = pendingMeals.value.filter((p) => p.id !== id);
    void refreshDay(api);
    if (meal.usual) void loadDayUsuals(api);
    const ids = entries.map((e) => e.id);
    showToast(addedMealToast(meal.rows, meal.slot), { label: 'Undo', run: () => void undoMeal(api, meal, ids) });
  } catch {
    patchPending(id, { failed: true });
  } finally {
    sending.delete(id);
  }
}

/** Discard a meal that failed: its rows leave the day. */
export function discardMeal(id: string): void {
  pendingMeals.value = pendingMeals.value.filter((p) => p.id !== id);
}

/** Undo deletes exactly the entries the write stored. */
async function undoMeal(api: ForageApi, meal: PendingMeal, ids: string[]): Promise<void> {
  try {
    await api.deleteLogEntries(ids);
    for (const id of ids) removeEntry(id);
    void refreshDay(api);
    if (meal.usual) void loadDayUsuals(api);
    showToast(removedMealToast(meal.rows, meal.slot));
  } catch {
    showToast("Couldn't undo. The items are still there.");
  }
}

/** Forget what was loaded (tests and sign-out). */
export function _resetEaten(): void {
  _resetAdd();
  latest++;
  gate.reset();
  wantRecipes = false;
  fullOut = false;
  patches = 0;
  loadedDate = '';
  saving = null;
  editing.value = null;
  eatenDate.value = localDate();
  eatenToday.value = localDate();
  dayState.value = 'loading';
  dayEntries.value = [];
  dayTotals.value = null;
  dayMeals.value = [];
  dayPlan.value = [];
  pendingMeals.value = [];
  sending.clear();
}
