// Combos (#888): food sets #879 finds in the log, for the Add sheet and Library's Usuals segment. The API detects and
// orders them; this file holds the Library's list, the words, and the two things a combo turns into (a group's items,
// a usual's input). The kcal on a row is worked out from the foods for display, the one figure the combo does not carry.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { Combo, ComboLine, Food, Slot, UsualInput, UsualLineInput } from '../api/types';
import { optionKcal } from '../eaten/usual-group';
import type { LoadState } from './recipes-store';
import { newUsualId } from './usuals-store';

/** Library's combos, how many are hidden (for `Show <n> hidden`), and whether they loaded. */
export const combos = signal<Combo[]>([]);
export const hiddenCombos = signal(0);
export const combosState = signal<LoadState>('idle');

let latest = 0;

export async function loadCombos(api: ForageApi): Promise<void> {
  const seq = ++latest;
  if (combosState.value !== 'ready') combosState.value = 'loading';
  try {
    const result = await api.getCombos();
    if (seq !== latest) return;
    combos.value = result.combos;
    hiddenCombos.value = result.stats?.hidden ?? 0;
    combosState.value = 'ready';
  } catch {
    if (seq !== latest) return;
    combosState.value = 'error';
  }
}

export function dropCombo(key: string): void {
  combos.value = combos.value.filter((c) => c.key !== key);
}

export function _resetCombos(): void {
  latest++;
  combos.value = [];
  hiddenCombos.value = 0;
  combosState.value = 'idle';
}

// ---- words

const MEAL_PLURAL: Record<Slot, string> = {
  Breakfast: 'breakfasts',
  Lunch: 'lunches',
  Dinner: 'dinners',
  'After dinner': 'after-dinner meals',
  Snacks: 'snacks',
};
const MEAL_WORD: Record<Slot, string> = {
  Breakfast: 'breakfast',
  Lunch: 'lunch',
  Dinner: 'dinner',
  'After dinner': 'after-dinner',
  Snacks: 'snack',
};

/** `today`, `yesterday`, or `4 days ago`. */
export function lastText(date: string, today: string): string {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The Add sheet's sub-line: `In 7 meals · last yesterday`. */
export const addSheetMeta = (c: Combo, today: string) => `In ${c.meals} meals · last ${lastText(c.last_date, today)}`;

/** Library's sub-line: `9 breakfasts · last 4 days ago`. */
export const libraryMeta = (c: Combo, today: string) =>
  `${c.meals} ${MEAL_PLURAL[c.slot]} · last ${lastText(c.last_date, today)}`;

/** The sheet's first line: `In 7 lunch meals over the last 60 days · last yesterday`. */
export const sheetMeta = (c: Combo, today: string) =>
  `In ${c.meals} ${MEAL_WORD[c.slot]} meals over the last 60 days · last ${lastText(c.last_date, today)}`;

type PickLine = Extract<ComboLine, { options: unknown[] }>;

/** The names of a pick-one's foods. */
export const optionNames = (line: PickLine, foods: Map<string, Food>) =>
  line.options.map((o) => foods.get(o.food_id)?.name ?? 'A removed food');

/** `2 combos that differ only by Cheddar or Swiss cheese were joined, so that's a pick-one.` Null with no pick-one. */
export function joinLine(c: Combo, foods: Map<string, Food>): string | null {
  const line = c.lines.find((l): l is PickLine => !!l.options);
  if (!line) return null;
  const names = optionNames(line, foods);
  const n = names.length;
  const list = n === 2 ? `${names[0]} or ${names[1]}` : `${names.slice(0, -1).join(', ')} or ${names[n - 1]}`;
  return `${n} combos that differ only by ${list} were joined, so that's a pick-one.`;
}

/** The option a line logs: an Always line itself, a pick-one's default. */
export function chosen(l: ComboLine): { food_id: string; qty: number; unit: string } {
  if (!l.options) return { food_id: l.food_id, qty: l.qty, unit: l.unit };
  return l.options.find((o) => o.food_id === l.default) ?? l.options[0];
}

/** A combo's kcal with each pick-one at its default; `partial` when a food lacks nutrition, null when none is known. */
export function comboKcal(c: Combo, foods: Map<string, Food>): { kcal: number; partial: boolean } | null {
  let kcal = 0;
  let known = 0;
  let partial = false;
  for (const l of c.lines) {
    const o = chosen(l);
    const k = optionKcal(foods.get(o.food_id), o);
    if (k === null) partial = true;
    else {
      kcal += k;
      known++;
    }
  }
  return known ? { kcal, partial } : null;
}

/** `412 kcal`, `about 412 kcal` when a food lacks nutrition, null when nothing is known. */
export function comboKcalText(c: Combo, foods: Map<string, Food>): string | null {
  const k = comboKcal(c, foods);
  return k ? `${k.partial ? 'about ' : ''}${Math.round(k.kcal)} kcal` : null;
}

/** Does the Add sheet's search text match the combo's name? Case-insensitive, anywhere in it. */
export const comboMatches = (c: Combo, q: string) => c.name.toLowerCase().includes(q.trim().toLowerCase());

// ---- what a combo turns into

/** The foods `logGroup` takes: each pick-one at its default. */
export const groupItems = (c: Combo) => c.lines.map(chosen);

/** `upsertUsual`'s input: the combo's lines and slot, a pick-one keeping its default as `last_pick`. */
export function usualFromCombo(c: Combo, name: string): UsualInput {
  const lines: UsualLineInput[] = c.lines.map((l) =>
    l.options
      ? { options: l.options.map((o) => ({ ...o })), last_pick: l.default }
      : { food_id: l.food_id, qty: l.qty, unit: l.unit },
  );
  return { id: newUsualId(), name: name.trim(), slot: c.slot, lines };
}

/** The meals a combo came from, newest first. */
export const mealsFrom = (c: Combo) => [...c.meal_dates].sort((a, b) => b.date.localeCompare(a.date));
