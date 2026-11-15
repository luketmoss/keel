// The Add sheet's lists (#931): foods, recipes, the last 60 days of the log, the usuals and the combos for each meal,
// held in module state so they outlive a pass, and kept on the device (localStorage, one entry a signed-in account)
// so a fresh start opens the sheet with them too. The sheet shows what is held on its first frame and refreshes
// behind it, once an open. Every storage touch is wrapped: storage that is full or blocked just means no copy on the
// device, and the lists are still held in memory for the session.
//
// The held foods and recipes are the Eaten tab's only copy of the library (#939): the day's rows are named and their
// amounts worked out from `heldFoods` / `heldRecipes`, the day load's answer lands here, and a food or recipe created,
// edited or deleted anywhere is one `holdFood` / `holdRecipe` / `dropHeldFood` call. Each list is held on its own, so a
// day load can fill the foods before the Add sheet has ever asked for the log.
import { computed, signal } from '@preact/signals';
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

/** Each list as held: null until a load answers it (or the device kept one). */
interface Held {
  foods: Food[] | null;
  recipes: RecipeSummary[] | null;
  log: FoodLogEntry[] | null;
}

/** Version 1 of what is kept on the device, under `forage_add:<email>`. A list not held yet is null (#939). */
interface Kept {
  v: 1;
  lists: Held | null;
  combos: Partial<Record<Slot, Combo[]>>;
  usuals: Usual[] | null;
}

const PREFIX = 'forage_add:';

const EMPTY: Held = { foods: null, recipes: null, log: null };
const held = signal<Held>(EMPTY);

/** The held lists, or null until all three are held (a load answered, or the device kept them). */
export const addLists = computed<AddLists | null>(() => {
  const { foods, recipes, log } = held.value;
  return foods && recipes && log ? { foods, recipes, log } : null;
});
/** The library's foods, for the day's rows and the Add sheet; empty until a load answers. */
export const heldFoods = computed<Food[]>(() => held.value.foods ?? []);
/** The library's recipes, for the day's rows and the Add sheet; empty until a load answers. */
export const heldRecipes = computed<RecipeSummary[]>(() => held.value.recipes ?? []);
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
/**
 * The writes made while a load is out, each with its count, put back over that load's answer when it lands: the
 * answer began before them, so they are newer (#939). Kept only while a load that began before them is out.
 */
let changes: { seq: number; apply: (h: Held) => Held }[] = [];
/** The loads out now, each with the count it began at. */
const out = new Map<object, number>();
let saveQueued = false;

const keyFor = (email: string) => PREFIX + email.toLowerCase();

function read(email: string): Kept | null {
  try {
    const raw = window.localStorage.getItem(keyFor(email));
    if (!raw) return null;
    const k = JSON.parse(raw) as Partial<Kept> | null;
    if (!k || k.v !== 1) return null;
    const l = k.lists;
    const list = <T>(x: T[] | null | undefined): T[] | null => (Array.isArray(x) ? x : null);
    const lists = l ? { foods: list(l.foods), recipes: list(l.recipes), log: list(l.log) } : null;
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
    const h = held.value;
    const kept: Kept = { v: 1, lists: h.foods || h.recipes || h.log ? h : null, combos: addCombos.value, usuals };
    try {
      window.localStorage.setItem(keyFor(account), JSON.stringify(kept));
    } catch {
      // Full or blocked: the lists stay held in memory.
    }
  });
}

function forget(): void {
  held.value = EMPTY;
  changes = [];
  out.clear();
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
    held.value = kept.lists ?? EMPTY;
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

/** A load of some of the lists, begun by `beginHeld`. */
export interface HeldLoad {
  token: object;
  mark: number;
  who: string | null;
}

/** A load of some of the lists begins: answer it with `landHeld`, and end it either way with `endHeld`. */
export function beginHeld(): HeldLoad {
  const token = {};
  out.set(token, patches);
  return { token, mark: patches, who: account };
}

/**
 * A load's answer replaces the lists it read, then every write made since it began is put back over them, so an
 * older answer never undoes a newer write. An answer for an account no longer signed in is dropped.
 */
export function landHeld(load: HeldLoad, answer: Partial<Held>): void {
  if (load.who !== account) return;
  let next: Held = { ...held.value, ...answer };
  for (const c of changes) if (c.seq > load.mark) next = c.apply(next);
  held.value = next;
  save();
}

/** A load ended, answered or not: the writes that no load still out began before are let go. */
export function endHeld(load: HeldLoad): void {
  if (!out.delete(load.token)) return;
  const oldest = Math.min(...out.values());
  changes = changes.filter((c) => c.seq > oldest);
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
  const load = beginHeld();
  const lists = Promise.all([api.getFoods(), api.getRecipes(), api.getFoodLog(addDays(today, -RECENT_DAYS), today)])
    .then(
      ([foods, recipes, log]) => landHeld(load, { foods, recipes, log }),
      () => {
        if (who !== account) return;
        if (!addLists.value) addFailed.value = true;
      },
    )
    .finally(() => endHeld(load));
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

/** Apply a write to what is held, and keep it to put back over any load that is out. A list not held stays so. */
function patch(change: (h: Held) => Held): void {
  patches++;
  if (out.size > 0) changes.push({ seq: patches, apply: change });
  held.value = change(held.value);
  save();
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

/** A food created or edited: replaced where it is, or added, so the day's rows and a search have it at once. */
export function holdFood(food: Food): void {
  patch((h) => (h.foods ? { ...h, foods: upsertById(h.foods, food) } : h));
}

/** A food deleted. */
export function dropHeldFood(id: string): void {
  patch((h) => (h.foods ? { ...h, foods: h.foods.filter((f) => f.id !== id) } : h));
}

/** A recipe saved or changed: replaced where it is, or first. */
export function holdRecipe(recipe: RecipeSummary): void {
  patch((h) =>
    h.recipes
      ? {
          ...h,
          recipes: h.recipes.some((r) => r.id === recipe.id)
            ? h.recipes.map((r) => (r.id === recipe.id ? recipe : r))
            : [recipe, ...h.recipes],
        }
      : h,
  );
}

/** A recipe deleted. */
export function dropHeldRecipe(id: string): void {
  patch((h) => (h.recipes ? { ...h, recipes: h.recipes.filter((r) => r.id !== id) } : h));
}

/** An entry logged or changed, so Recent includes it. One older than the 60 days is not in a refresh either. */
export function holdEntry(entry: FoodLogEntry): void {
  if (entry.date < addDays(localDate(), -RECENT_DAYS)) return;
  patch((h) => (h.log ? { ...h, log: upsertById(h.log, entry) } : h));
}

/** An entry deleted. */
export function dropHeldEntry(id: string): void {
  patch((h) => (h.log ? { ...h, log: h.log.filter((e) => e.id !== id) } : h));
}

/** Forget everything, in memory only (tests). */
export function _resetAdd(): void {
  account = null;
  forget();
}
