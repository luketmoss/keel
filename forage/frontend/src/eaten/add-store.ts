// The Add sheet's lists (#931): foods, recipes, the last 60 days of the log, the usuals and the combos for each meal,
// held in module state so they outlive a pass, and kept on the device (localStorage, one entry a signed-in account)
// so a fresh start opens the sheet with them too. The sheet shows what is held on its first frame and refreshes
// behind it, once an open. Every storage touch is wrapped: storage that is full or blocked just means no copy on the
// device, and the lists are still held in memory for the session.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { Combo, Food, FoodLogEntry, RecipeSummary, Slot, Usual } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';

/** How far back the recents look. */
export const RECENT_DAYS = 60;

/** What the Add sheet lists from. */
export interface AddLists {
  foods: Food[];
  recipes: RecipeSummary[];
  /** The last 60 days of the log, behind Recent. */
  log: FoodLogEntry[];
}

/** Version 1 of what is kept on the device, under `forage_add:<email>`. */
interface Kept {
  v: 1;
  lists: AddLists | null;
  combos: Partial<Record<Slot, Combo[]>>;
  usuals: Usual[] | null;
}

const PREFIX = 'forage_add:';

/** The held lists, or null until the first load answers (and nothing was kept on the device). */
export const addLists = signal<AddLists | null>(null);
/** The held combos for each meal; a meal with none held has no entry. */
export const addCombos = signal<Partial<Record<Slot, Combo[]>>>({});
/** The first load failed with nothing held: the sheet says so and offers Try again. A failed refresh over held lists never sets it. */
export const addFailed = signal(false);

let account: string | null = null;
let usuals: Usual[] | null = null;
/** This open's refresh has been started: a return to the sheet from the amount sheet or a form does not start another. */
let refreshed = false;
/** Counts the entries, foods and recipes patched in by a write, so a refresh that began before one can't undo it. */
let patches = 0;
let saveQueued = false;

const keyFor = (email: string) => PREFIX + email.toLowerCase();

function read(email: string): Kept | null {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return null;
    const k = JSON.parse(raw) as Partial<Kept> | null;
    if (!k || k.v !== 1) return null;
    const l = k.lists;
    const lists =
      l && Array.isArray(l.foods) && Array.isArray(l.recipes) && Array.isArray(l.log)
        ? { foods: l.foods, recipes: l.recipes, log: l.log }
        : null;
    const combos = k.combos && typeof k.combos === 'object' && !Array.isArray(k.combos) ? k.combos : {};
    return { v: 1, lists, combos, usuals: Array.isArray(k.usuals) ? k.usuals : null };
  } catch {
    return null;
  }
}

/** Write what is held, once for however many changes land in the same tick. */
function save(): void {
  if (!account || saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    if (!account) return;
    const kept: Kept = { v: 1, lists: addLists.value, combos: addCombos.value, usuals };
    try {
      window.localStorage.setItem(keyFor(account), JSON.stringify(kept));
    } catch {
      // Full or blocked: the lists stay held in memory.
    }
  });
}

function forget(): void {
  addLists.value = null;
  addCombos.value = {};
  addFailed.value = false;
  usuals = null;
  refreshed = false;
  patches = 0;
}

/**
 * Bind the held lists to the signed-in account: the first call, or a different account, drops what memory holds and
 * reads that account's copy from the device. `email` is null for the demo user and when signed out, which keeps the
 * lists in memory only and never touches a real account's copy. Answers the usuals held for the account.
 */
export function bindAddAccount(email: string | null): { changed: boolean; usuals: Usual[] | null } {
  const next = email ? email.toLowerCase() : null;
  if (next === account) return { changed: false, usuals };
  account = next;
  forget();
  const kept = next ? read(next) : null;
  if (kept) {
    addLists.value = kept.lists;
    addCombos.value = kept.combos;
    usuals = kept.usuals;
  }
  return { changed: true, usuals };
}

/** Sign-out: drop what is held and remove every copy from the device. */
export function clearAddHeld(): void {
  account = null;
  forget();
  try {
    const ls = window.localStorage;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(PREFIX)) ls.removeItem(k);
    }
  } catch {
    // Nothing could be kept there to begin with.
  }
}

/** A pass begins: the next open of the sheet may refresh once. */
export function beginAddPass(): void {
  refreshed = false;
}

/**
 * Refresh behind what the sheet shows: foods, recipes, the log and this meal's combos, at most once a pass unless
 * `force` (Try again). The answer replaces the held lists with no skeleton. A failure leaves them in place and says
 * nothing, unless there is nothing held to show.
 */
export function refreshAdd(api: ForageApi, slot: Slot, today: string, force = false): Promise<void> {
  if (refreshed && !force) return Promise.resolve();
  refreshed = true;
  addFailed.value = false;
  const who = account;
  const before = patches;
  const lists = Promise.all([
    api.getFoods(),
    api.getRecipes(),
    api.getFoodLog(addDays(today, -RECENT_DAYS), today),
  ]).then(
    ([foods, recipes, log]) => {
      if (who !== account) return;
      // A write made while this was out is newer than the answer: keep the held lists, which carry it.
      if (patches !== before && addLists.value) return;
      addLists.value = { foods, recipes, log };
      save();
    },
    () => {
      if (who !== account) return;
      if (!addLists.value) addFailed.value = true;
    },
  );
  const combos = api.getCombos({ slot }).then(
    (r) => {
      if (who !== account) return;
      addCombos.value = { ...addCombos.value, [slot]: r.combos };
      save();
    },
    () => {},
  );
  return Promise.all([lists, combos]).then(() => {});
}

/** The usuals as the screen has them, kept for the device. */
export function holdUsuals(list: Usual[]): void {
  usuals = list;
  save();
}

function patch(change: (lists: AddLists) => AddLists): void {
  const lists = addLists.value;
  if (!lists) return;
  addLists.value = change(lists);
  patches++;
  save();
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

/** A food created or edited: replaced where it is, or added, so a search finds it at once. */
export function holdFood(food: Food): void {
  patch((l) => ({ ...l, foods: upsertById(l.foods, food) }));
}

/** A food deleted. */
export function dropHeldFood(id: string): void {
  patch((l) => ({ ...l, foods: l.foods.filter((f) => f.id !== id) }));
}

/** A recipe saved or changed: replaced where it is, or first. */
export function holdRecipe(recipe: RecipeSummary): void {
  patch((l) => ({
    ...l,
    recipes: l.recipes.some((r) => r.id === recipe.id)
      ? l.recipes.map((r) => (r.id === recipe.id ? recipe : r))
      : [recipe, ...l.recipes],
  }));
}

/** An entry logged or changed, so Recent includes it. One older than the 60 days is not in a refresh either. */
export function holdEntry(entry: FoodLogEntry): void {
  if (entry.date < addDays(localDate(), -RECENT_DAYS)) return;
  patch((l) => ({ ...l, log: upsertById(l.log, entry) }));
}

/** An entry deleted. */
export function dropHeldEntry(id: string): void {
  patch((l) => ({ ...l, log: l.log.filter((e) => e.id !== id) }));
}

/** Forget everything, in memory only (tests). */
export function _resetAdd(): void {
  account = null;
  forget();
}
