// #520 - Thrive Sip's water and alcohol on the Day view: the state behind the
// two cards and the Settings goal field.
//
// Entries are held per local date. A tap adds its entry at once, marked
// `pending`, and the API call settles it: success swaps in the server's row,
// failure removes the entry and says so. Every tap has its own UUID, so five
// taps in a second are five rows and a re-send of one id is the same row, never
// two (the API answers a repeated id with the row it already has). Nothing
// here throws. Demo mode (`isDemo`) never calls the API: it keeps everything in
// memory, seeded for today and yesterday.

import { signal } from '@preact/signals';
import { isDemo } from '../api/demo-data';
import {
  UNWIND_AMOUNT_MG,
  WATER_AMOUNT_MAX_ML,
  WATER_GOAL_DEFAULT_ML,
  WATER_GOAL_KEY,
  WATER_GOAL_MAX_ML,
  WATER_GOAL_MIN_ML,
  DRINKS_MAX_RANGE_DAYS,
  deleteDrink,
  getDrinkTotals,
  getDrinks,
  logDrink,
  updateDrinkAmount,
  updateDrinkTime,
  updateSetting,
  type Drink,
  type DrinkKind,
} from '../api/drinks';
import { DENVER, addDays, todayInDenver } from '../day/dates';
import type { HealthTabState } from './store';
import { throttled } from './page-visible';

export const ML_PER_OZ = 29.5735;
/** What "+ 4 oz" stores. */
export const QUICK_WATER_ML = 118;

/** A drink as held here: `pending` until the API has acknowledged it. */
export interface DrinkEntry extends Drink {
  pending?: boolean;
}

export interface DayDrinks {
  status: 'loading' | 'loaded' | 'error';
  entries: DrinkEntry[];
}

/** The drinks of each date read or logged so far. */
export const drinkDays = signal<Record<string, DayDrinks>>({});
/** The goal as the last read said it, in ml. */
export const waterGoalMl = signal<number>(WATER_GOAL_DEFAULT_ML);
/** One inline error per date and kind (`2026-10-20:water`), shown by its card. */
export const drinkErrors = signal<Record<string, string>>({});

export const errorKey = (date: string, kind: DrinkKind) => `${date}:${kind}`;

export const ERROR_LOG = "Couldn't save that drink. Try again.";
export const ERROR_DELETE = "Couldn't delete that drink.";
export const ERROR_TIME = "Couldn't save that time.";
export const ERROR_AMOUNT = "Couldn't save that amount.";

function setError(date: string, kind: DrinkKind, text: string | null): void {
  const next = { ...drinkErrors.value };
  if (text === null) delete next[errorKey(date, kind)];
  else next[errorKey(date, kind)] = text;
  drinkErrors.value = next;
}

// ── Display ──────────────────────────────────────────────────────────

/**
 * ml to the nearest whole ounce: 118 ml is "4", 590 ml is "20". Whole, not
 * tenths, because QUICK_WATER_ML is 3.99 oz and tenths would show the shortfall
 * once taps pile up: six taps, 708 ml, read "23.9" (#571, as the widget in #569).
 */
export function formatOz(ml: number): string {
  return String(goalOz(ml));
}

/** Whole ounces for the goal field. */
export function goalOz(ml: number): number {
  return Math.round(ml / ML_PER_OZ);
}

/** The largest whole ounce under WATER_AMOUNT_MAX_ML: 67 oz is 1981 ml. */
export const WATER_OZ_MAX = Math.floor(WATER_AMOUNT_MAX_ML / ML_PER_OZ);

/** A water amount in whole oz as typed, to ml; null when it is not a whole number from 1 to WATER_OZ_MAX. */
export function ozToWaterMl(oz: string): number | null {
  if (!/^\d{1,3}$/.test(oz.trim())) return null;
  const n = Number(oz.trim());
  return n >= 1 && n <= WATER_OZ_MAX ? Math.round(n * ML_PER_OZ) : null;
}

/** The goal in oz as typed, to ml; null when it is not a whole number the API will take. */
export function ozToGoalMl(oz: string): number | null {
  if (!/^\d{1,4}$/.test(oz.trim())) return null;
  const ml = Math.round(Number(oz.trim()) * ML_PER_OZ);
  return ml >= WATER_GOAL_MIN_ML && ml <= WATER_GOAL_MAX_ML ? ml : null;
}

/** The whole-ounce range ozToGoalMl accepts, for its message. */
export const GOAL_OZ_MIN = Math.ceil(WATER_GOAL_MIN_ML / ML_PER_OZ);
export const GOAL_OZ_MAX = Math.floor(WATER_GOAL_MAX_ML / ML_PER_OZ);

// ── Time ─────────────────────────────────────────────────────────────

const clockParts = new Intl.DateTimeFormat('en-US', {
  timeZone: DENVER,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** The Denver local date and `HH:MM:SS` at an instant, the way the API files a drink. */
export function denverClock(now: Date): { date: string; time: string } {
  const parts = clockParts.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: todayInDenver(now), time: `${hour}:${get('minute')}:${get('second')}` };
}

/**
 * The UTC instant of 23:59:00 Denver on a local date, DST-correct: 05:59Z the
 * next day in MDT, 06:59Z in MST. Tries each offset and keeps the one that
 * reads back as that local time.
 */
export function endOfDayInstant(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  for (const offset of [6, 7]) {
    const instant = new Date(Date.UTC(y, m - 1, d, 23 + offset, 59, 0));
    const clock = denverClock(instant);
    if (clock.date === date && clock.time === '23:59:00') return instant;
  }
  return new Date(Date.UTC(y, m - 1, d, 30, 59, 0));
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

/** Newest first: by local time, then by the instant they were taken. */
export function newestFirst(entries: readonly DrinkEntry[]): DrinkEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.time.localeCompare(a.time) || b.logged_at_utc.localeCompare(a.logged_at_utc) || b.id.localeCompare(a.id),
  );
}

// ── Local changes, so a read that began earlier cannot undo them ──────

let changeSeq = 0;
const changedAt = new Map<string, number>();
const touch = (id: string) => changedAt.set(id, ++changeSeq);

function dayOf(date: string): DayDrinks {
  return drinkDays.value[date] ?? { status: 'loaded', entries: [] };
}

function setDay(date: string, day: DayDrinks): void {
  drinkDays.value = { ...drinkDays.value, [date]: day };
}

function updateEntries(date: string, change: (entries: DrinkEntry[]) => DrinkEntry[]): void {
  const day = dayOf(date);
  setDay(date, { status: day.status === 'loading' ? 'loading' : 'loaded', entries: change(day.entries) });
}

/** Put an entry in, replacing any with its id: an id is never listed twice. */
function putEntry(date: string, entry: DrinkEntry): void {
  updateEntries(date, (list) => [...list.filter((e) => e.id !== entry.id), entry]);
}

function removeEntry(date: string, id: string): void {
  updateEntries(date, (list) => list.filter((e) => e.id !== id));
}

// ── Demo data ────────────────────────────────────────────────────────

/** What one tap of a kind stores: 118 ml of water, 5 mg of Unwind, else one. */
export const quickAmount = (kind: DrinkKind): number =>
  kind === 'water' ? QUICK_WATER_ML : kind === 'unwind' ? UNWIND_AMOUNT_MG : 1;

function demoEntry(id: string, kind: DrinkKind, date: string, time: string, source: 'app' | 'widget'): DrinkEntry {
  const stamp = `${date}T${time}Z`;
  return {
    id,
    kind,
    amount: quickAmount(kind),
    date,
    time,
    logged_at_utc: stamp,
    source,
    created: stamp,
    updated: stamp,
  };
}

function demoDay(date: string): DrinkEntry[] {
  const today = todayInDenver();
  if (date === today) {
    return [
      demoEntry('demo-drink-1', 'water', date, '07:45:00', 'app'),
      demoEntry('demo-drink-c1', 'coffee', date, '07:10:00', 'app'),
      demoEntry('demo-drink-c2', 'coffee', date, '10:30:00', 'app'),
      demoEntry('demo-drink-2', 'water', date, '10:20:00', 'widget'),
      demoEntry('demo-drink-3', 'water', date, '12:05:00', 'app'),
      demoEntry('demo-drink-4', 'alcohol', date, '12:40:00', 'app'),
      demoEntry('demo-drink-u1', 'unwind', date, '21:30:00', 'app'),
    ];
  }
  if (date === addDays(today, -1)) {
    return [
      demoEntry('demo-drink-5', 'water', date, '08:10:00', 'app'),
      demoEntry('demo-drink-c3', 'coffee', date, '07:30:00', 'app'),
      demoEntry('demo-drink-6', 'water', date, '13:30:00', 'app'),
      demoEntry('demo-drink-7', 'alcohol', date, '20:15:00', 'app'),
      demoEntry('demo-drink-8', 'alcohol', date, '21:05:00', 'app'),
      demoEntry('demo-drink-u2', 'unwind', date, '21:45:00', 'app'),
      demoEntry('demo-drink-u3', 'unwind', date, '22:30:00', 'app'),
    ];
  }
  return [];
}

// ── Reads ────────────────────────────────────────────────────────────

const inFlight = new Map<string, Promise<void>>();

/**
 * Read one date's drinks, and the goal that comes with them. The day is
 * `loading` only the first time; a later read keeps what is shown and a failed
 * one leaves it. Entries still pending, or changed here since the read began,
 * win over what the read returns. A call while one runs for the same date joins it.
 */
export function loadDrinks(date: string, token: string): Promise<void> {
  if (isDemo()) {
    if (!drinkDays.value[date]) setDay(date, { status: 'loaded', entries: demoDay(date) });
    return Promise.resolve();
  }
  const running = inFlight.get(date);
  if (running) return running;
  if (!drinkDays.value[date] || drinkDays.value[date].status === 'error') {
    setDay(date, { status: 'loading', entries: drinkDays.value[date]?.entries ?? [] });
  }
  const startSeq = changeSeq;
  const run = getDrinks({ from: date, to: date }, token)
    .then((out) => {
      const day = dayOf(date);
      if (!out.ok) {
        if (day.status !== 'loaded') setDay(date, { status: 'error', entries: day.entries });
        return;
      }
      const local = new Map(day.entries.map((e) => [e.id, e]));
      const recent = (id: string) => (changedAt.get(id) ?? 0) > startSeq;
      const entries: DrinkEntry[] = [];
      for (const d of out.data.drinks) {
        if (d.date !== date) continue;
        if (recent(d.id)) {
          const mine = local.get(d.id);
          if (mine) entries.push(mine); // a removed one stays removed
        } else entries.push(d);
      }
      for (const e of day.entries) {
        if (!entries.some((x) => x.id === e.id) && (e.pending || recent(e.id))) entries.push(e);
      }
      setDay(date, { status: 'loaded', entries });
      waterGoalMl.value = out.data.water_goal_ml;
    })
    .finally(() => {
      inFlight.delete(date);
    });
  inFlight.set(date, run);
  return run;
}

/** The goal alone, for Settings. A failed read leaves the last value. */
export async function loadGoal(token: string): Promise<void> {
  if (isDemo()) return;
  const out = await getDrinkTotals(token);
  if (out.ok) waterGoalMl.value = out.data.water_goal_ml;
}

// ── History, for Trends (#521) ───────────────────────────────────────

/**
 * Every drink of the last DRINKS_MAX_RANGE_DAYS days, as Trends sums them per
 * local day. Read from `getDrinks`, never from DailySummary, so it agrees with
 * the Day cards. Held apart from `drinkDays`: those are one date at a time and
 * carry the optimistic, unsaved taps; this is a read-only copy.
 */
export const drinkHistory = signal<HealthTabState<Drink>>({ state: 'idle' });

/** Synthetic history for demo mode: a pattern over three weeks, today and yesterday as the Day cards show them. */
function demoHistory(): Drink[] {
  const today = todayInDenver();
  const out: Drink[] = demoDay(today).concat(demoDay(addDays(today, -1)));
  for (let back = 2; back <= 20; back++) {
    const date = addDays(today, -back);
    const glasses = 3 + ((back * 5) % 9);
    for (let i = 0; i < glasses; i++) {
      out.push(demoEntry(`demo-h-${back}-${i}`, 'water', date, `${String(7 + i).padStart(2, '0')}:00:00`, 'app'));
    }
    if (back % 3 === 0) out.push(demoEntry(`demo-h-${back}-a`, 'alcohol', date, '19:30:00', 'app'));
    const cups = back % 4 === 0 ? 0 : 1 + (back % 3);
    for (let i = 0; i < cups; i++) {
      out.push(demoEntry(`demo-h-${back}-c${i}`, 'coffee', date, `${String(7 + i * 3).padStart(2, '0')}:15:00`, 'app'));
    }
    const tablets = back % 5 === 0 ? 0 : back % 3;
    for (let i = 0; i < tablets; i++) {
      out.push(demoEntry(`demo-h-${back}-u${i}`, 'unwind', date, `${String(21 + i)}:00:00`, 'app'));
    }
  }
  return out;
}

let historyInFlight: Promise<void> | null = null;

/**
 * Read the history window ending today. One read at a time: a call while one
 * runs joins it. A failed read leaves rows already loaded; with none, it is an
 * error. Trends calls it on every entry, so a drink logged on the Day view is
 * there on the next visit with no rebuild step.
 */
export function loadDrinkHistory(token: string): Promise<void> {
  if (isDemo()) {
    drinkHistory.value = { state: 'loaded', rows: demoHistory() };
    return Promise.resolve();
  }
  if (historyInFlight) return historyInFlight;
  if (drinkHistory.value.state !== 'loaded') drinkHistory.value = { state: 'loading' };
  const to = todayInDenver();
  const from = addDays(to, -(DRINKS_MAX_RANGE_DAYS - 1));
  historyInFlight = getDrinks({ from, to }, token)
    .then((out) => {
      if (out.ok) {
        drinkHistory.value = { state: 'loaded', rows: out.data.drinks };
        waterGoalMl.value = out.data.water_goal_ml;
      } else if (drinkHistory.value.state !== 'loaded') {
        drinkHistory.value = { state: 'error' };
      }
    })
    .finally(() => {
      historyInFlight = null;
    });
  return historyInFlight;
}

// ── Refresh on return (#553) ─────────────────────────────────────────

let refreshDate = '';

/**
 * The Day cards' re-read when the app comes back to the foreground, so a drink
 * logged elsewhere (the widget, another device) shows without a reload: the
 * shown date and the history window, one start per 60 s and never two at once,
 * the guard `healthRefresh` uses. The loaders keep pending and recently changed
 * entries and join a read in flight, so a re-read cannot drop or double a tap.
 */
export const drinksRefresh = throttled(
  async (token) => {
    await Promise.all([loadDrinks(refreshDate, token), loadDrinkHistory(token)]);
  },
  { minIntervalMs: 60_000 },
);

/** Re-read `date`'s drinks and the history, unless one started under 60 s ago. */
export function refreshDrinks(date: string, token: string): Promise<void> {
  refreshDate = date;
  return drinksRefresh.run(token);
}

// ── Writes ───────────────────────────────────────────────────────────

/**
 * "+ 4 oz" / "+ 1 drink": the entry appears now. Viewed date today (Denver, read
 * at the tap): stamped with this moment. A past date (#588): filed under it at
 * 23:59:00 Denver, so a screen left open past midnight still files under the day
 * on show. The button is never held back while a request runs, so each tap is
 * its own call.
 */
export async function addDrink(kind: DrinkKind, token: string, viewed?: string): Promise<void> {
  const now = new Date();
  const current = denverClock(now);
  const past = viewed !== undefined && viewed < current.date;
  const instant = past ? endOfDayInstant(viewed) : now;
  const { date, time } = past ? { date: viewed, time: '23:59:00' } : current;
  const stamp = instant.toISOString();
  const entry: DrinkEntry = {
    id: newId(),
    kind,
    amount: quickAmount(kind),
    date,
    time,
    logged_at_utc: stamp,
    source: 'app',
    created: stamp,
    updated: stamp,
    pending: true,
  };
  setError(date, kind, null);
  touch(entry.id);
  putEntry(date, entry);
  if (isDemo()) {
    touch(entry.id);
    putEntry(date, { ...entry, pending: false });
    return;
  }
  const out = await logDrink({ id: entry.id, kind, amount: entry.amount, logged_at_utc: stamp, source: 'app' }, token);
  touch(entry.id);
  if (out.ok) {
    putEntry(date, { ...out.data, pending: false });
  } else {
    removeEntry(date, entry.id);
    setError(date, kind, ERROR_LOG);
  }
}

/** Move a drink to another time that day (`HH:MM:SS`). Resolves true when it was saved. */
export async function editDrinkTime(entry: DrinkEntry, time: string, token: string): Promise<boolean> {
  setError(entry.date, entry.kind, null);
  if (time === entry.time) return true;
  if (isDemo()) {
    touch(entry.id);
    putEntry(entry.date, { ...entry, time, updated: new Date().toISOString() });
    return true;
  }
  const out = await updateDrinkTime(entry.id, time, token);
  if (!out.ok) {
    setError(entry.date, entry.kind, ERROR_TIME);
    return false;
  }
  touch(entry.id);
  putEntry(entry.date, { ...out.data, pending: false });
  return true;
}

/** Change a water entry's amount, in ml. Resolves true when it was saved; the entry keeps its old amount until then. */
export async function editDrinkAmount(entry: DrinkEntry, amount: number, token: string): Promise<boolean> {
  setError(entry.date, entry.kind, null);
  if (amount === entry.amount) return true;
  if (isDemo()) {
    touch(entry.id);
    putEntry(entry.date, { ...entry, amount, updated: new Date().toISOString() });
    return true;
  }
  const out = await updateDrinkAmount(entry.id, amount, token);
  if (!out.ok) {
    setError(entry.date, entry.kind, ERROR_AMOUNT);
    return false;
  }
  touch(entry.id);
  putEntry(entry.date, { ...out.data, pending: false });
  return true;
}

/** Remove a drink. The entry stays until the API says it is gone. */
export async function removeDrink(entry: DrinkEntry, token: string): Promise<boolean> {
  setError(entry.date, entry.kind, null);
  if (!isDemo()) {
    const out = await deleteDrink(entry.id, token);
    if (!out.ok) {
      setError(entry.date, entry.kind, ERROR_DELETE);
      return false;
    }
  }
  touch(entry.id);
  removeEntry(entry.date, entry.id);
  return true;
}

/** Save the daily goal, in ml. Resolves true when it was saved; the Water card follows the signal. */
export async function saveWaterGoal(ml: number, token: string): Promise<boolean> {
  if (!isDemo()) {
    const out = await updateSetting(WATER_GOAL_KEY, ml, token);
    if (!out.ok) return false;
    const stored = Number(out.data.value);
    waterGoalMl.value = Number.isFinite(stored) && stored > 0 ? stored : ml;
    return true;
  }
  waterGoalMl.value = ml;
  return true;
}

/** Test seam: forget everything held. */
export function resetDrinks(): void {
  drinkDays.value = {};
  drinkErrors.value = {};
  drinkHistory.value = { state: 'idle' };
  historyInFlight = null;
  waterGoalMl.value = WATER_GOAL_DEFAULT_ML;
  inFlight.clear();
  drinksRefresh.invalidate();
  refreshDate = '';
  changedAt.clear();
  changeSeq = 0;
}
