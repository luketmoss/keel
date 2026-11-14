// The inline amount editor's arithmetic (#882): the units an entry offers, the stepper's steps, and how a change of
// unit keeps the weight. Display figures only: the calories and macros are always the API's (a dry run of the write).
import type { Food, FoodLogEntry } from '../api/types';
import { tenth } from './format';

/** One unit pill: its name, its grams per unit (null when unknown), and its label. */
export interface UnitOption {
  unit: string;
  grams: number | null;
  label: string;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The pills for an entry: a unit the food no longer has first, labelled with its grams from the entry, then the food's
 * servings in order, then grams. A recipe entry has none.
 */
export function unitOptions(entry: FoodLogEntry, food: Food | null): UnitOption[] {
  if (!food) return [];
  const servings = food.servings_json ?? [];
  const out: UnitOption[] = [];
  if (entry.unit !== 'g' && !servings.some((s) => s.name === entry.unit)) {
    const per = entry.grams !== null && entry.qty > 0 ? entry.grams / entry.qty : null;
    out.push({ unit: entry.unit, grams: per, label: per === null ? entry.unit : `${entry.unit} (${tenth(per)} g)` });
  }
  for (const s of servings) out.push({ unit: s.name, grams: s.g, label: `${s.name} (${tenth(s.g)} g)` });
  out.push({ unit: 'g', grams: 1, label: 'grams' });
  return out;
}

/** Grams in one of a unit, or null when not known. */
export function gramsPer(options: UnitOption[], unit: string): number | null {
  return options.find((o) => o.unit === unit)?.grams ?? null;
}

export const minQty = (unit: string) => (unit === 'g' ? 5 : 0.25);
export const maxQty = (unit: string) => (unit === 'g' ? 5000 : 99);

/** The next amount up or down: 0.25 up to 1 and 0.5 from 1 for a serving, 5 g for grams; never out of range. */
export function stepQty(qty: number, unit: string, dir: 1 | -1): number {
  const step = unit === 'g' ? 5 : dir === 1 ? (qty < 1 ? 0.25 : 0.5) : qty <= 1 ? 0.25 : 0.5;
  return Math.min(maxQty(unit), Math.max(minQty(unit), round3(qty + dir * step)));
}

/** The amount in another unit at the same weight: nearest 0.25 serving or 5 g, never below the minimum. */
export function switchUnit(qty: number, from: UnitOption | undefined, to: UnitOption): number {
  const fallback = to.unit === 'g' ? 100 : 1;
  if (!from || from.grams === null || to.grams === null) return fallback;
  const weight = qty * from.grams;
  const q = to.unit === 'g' ? Math.round(weight / 5) * 5 : Math.round(weight / to.grams / 0.25) * 0.25;
  return Math.min(maxQty(to.unit), Math.max(minQty(to.unit), round3(q)));
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** `1½`, `¾`, `3`, or up to two decimals (`0.33`). */
export function fractionQty(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const rest = round3(n - whole);
  if (rest === 0) return String(whole);
  const f = FRACTIONS[rest];
  if (f) return whole ? `${whole}${f}` : f;
  return String(Math.round(n * 100) / 100);
}
