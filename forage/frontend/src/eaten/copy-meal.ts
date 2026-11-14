// Copy a meal (#884): which earlier days have a meal to bring in, how they and the targets are worded, and the
// lookback read that finds them. The copy itself is the API's `copyMeal`, which works the numbers out again.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry, RecipeSummary, Slot } from '../api/types';
import { localDate } from '../cook/format';
import { displayName } from '../library/food-math';
import { addDays } from '../plan/dates';
import { dayTitle, entryName, wholeKcal } from './format';

/** How many days before the one shown the "Same as…" suggestion and Copy from another day… look back. */
export const LOOKBACK_DAYS = 7;
/** Copy to… offers today and the 6 days before it as chips; a date picker reaches further back. */
export const COPY_CHIP_DAYS = 7;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The earlier days' log: the 7 days before `date`, read once when the day loads and kept for the page load. */
export const lookback = signal<{ date: string; entries: FoodLogEntry[] } | null>(null);
let lookbackSeq = 0;

/** Read the 7 days before `date` (one range call). A failure leaves no lookback, so no suggestion shows. */
export async function loadLookback(api: ForageApi, date: string): Promise<void> {
  const seq = ++lookbackSeq;
  if (lookback.value?.date !== date) lookback.value = null;
  try {
    const entries = await api.getFoodLog(addDays(date, -LOOKBACK_DAYS), addDays(date, -1));
    if (seq === lookbackSeq) lookback.value = { date, entries };
  } catch {
    if (seq === lookbackSeq) lookback.value = null;
  }
}

/** Forget what was read (tests and sign-out). */
export function _resetLookback(): void {
  lookbackSeq++;
  lookback.value = null;
}

/** One earlier day's meal: its entries in the order they were logged. */
export interface DayMeal {
  date: string;
  entries: FoodLogEntry[];
}

/** The days before `date` (up to 7) that have entries in `slot`, newest first. Empty until the lookback is read. */
export function mealsBefore(date: string, slot: Slot): DayMeal[] {
  const lb = lookback.value;
  if (!lb || lb.date !== date) return [];
  const out: DayMeal[] = [];
  for (let i = 1; i <= LOOKBACK_DAYS; i++) {
    const d = addDays(date, -i);
    const entries = lb.entries
      .filter((e) => e.date === d && e.slot === slot)
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    if (entries.length) out.push({ date: d, entries });
  }
  return out;
}

/** `yesterday`, or the weekday (`Thursday`): #712's day words, for a day within the lookback. */
export function dayWord(date: string, today: string): string {
  return date === addDays(today, -1) ? 'yesterday' : WEEKDAYS[weekdayOf(date)];
}

/** `Same as yesterday`, `Same as Thursday`. */
export const sameAsLabel = (date: string, today: string) => `Same as ${dayWord(date, today)}`;

/** `1 item`, `4 items`. */
export const itemCount = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/** `Copied yesterday's breakfast · 4 items`. */
export function pulledToast(date: string, today: string, slot: Slot, n: number): string {
  return `Copied ${dayWord(date, today)}'s ${slot.toLowerCase()} · ${itemCount(n)}`;
}

/** The day as a sentence has it: `today`, `yesterday`, `Tuesday`, and past a week `Mon 19 Oct`. */
export function targetWord(date: string, today: string): string {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  const ago = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  return ago < COPY_CHIP_DAYS ? WEEKDAYS[weekdayOf(date)] : dayTitle(date, today);
}

/** `Copied 4 items to today's lunch`. */
export function copiedToast(date: string, today: string, slot: Slot, n: number): string {
  return `Copied ${itemCount(n)} to ${targetWord(date, today)}'s ${slot.toLowerCase()}`;
}

/** A Copy sheet day chip: `Today`, `Yesterday`, `Wed 12`. */
export function chipLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${Number(date.slice(8))}`;
}

/** The chips' days: today, then each earlier day, 7 in all. */
export function chipDays(today: string): string[] {
  return Array.from({ length: COPY_CHIP_DAYS }, (_, i) => addDays(today, -i));
}

/** A food's name for a tight place: its short name when set (#880), else brand and name. */
function shortName(e: FoodLogEntry, foods: Food[], recipes: RecipeSummary[]): string {
  const f = e.food_id ? foods.find((x) => x.id === e.food_id) : undefined;
  const short = f?.short_name?.trim();
  if (f && short) return short;
  if (f) return displayName(f);
  return entryName(e, foods, recipes);
}

/** The group names then the food names, comma-separated, for a list of entries: `Oatmeal · Oats, Milk`. */
export function mealNames(entries: FoodLogEntry[], foods: Food[], recipes: RecipeSummary[]): string {
  const groups = [...new Set(entries.map((e) => e.group_name ?? '').filter(Boolean))];
  const names = entries.map((e) => shortName(e, foods, recipes));
  return [groups.join(', '), names.join(', ')].filter(Boolean).join(' · ');
}

/** The total of the entries' stored calories, or null when none is known (the app sums only to describe a source). */
export function mealKcal(entries: FoodLogEntry[]): number | null {
  const known = entries.filter((e) => e.kcal !== null);
  return known.length ? known.reduce((t, e) => t + e.kcal!, 0) : null;
}

/** `Oatmeal · Oats, Milk · 418 kcal`, with no kcal when none is known. */
export function mealSummary(entries: FoodLogEntry[], foods: Food[], recipes: RecipeSummary[]): string {
  const kcal = mealKcal(entries);
  const names = mealNames(entries, foods, recipes);
  return kcal === null ? names : `${names} · ${wholeKcal(kcal)} kcal`;
}

/** `Yesterday`, `Thu 12 Nov`: a day in the Copy from another day… list. */
export function listDay(date: string, today: string): string {
  if (date === addDays(today, -1)) return 'Yesterday';
  const [, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${d} ${month}`;
}

/** Whether `date` is a real YYYY-MM-DD no later than today. */
export function pickable(date: string, today = localDate()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
}
