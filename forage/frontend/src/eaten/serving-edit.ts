// What the "＋ Serving" panel decides (#883): whether a food's first serving is the vague `serving`, which names are
// refused, the number a field holds, and the servings a save sends. Display arithmetic only; the API stores them.
import type { Food, Weight } from '../api/types';
import { tenth } from './format';

export const MAX_GRAMS = 5000;
export const MAX_UNIT_CHARS = 20;
export const MAX_NAME_CHARS = 40;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The food's first serving is named `serving`, in any case: an import nobody checked. */
export function vagueServing(food: Food): Weight | null {
  const first = food.servings_json?.[0];
  return first && first.name.trim().toLowerCase() === 'serving' ? first : null;
}

/** A positive number from a field, or null when blank, not a number or not above 0. A comma counts as a point. */
export function fieldNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && Number.isFinite(n) ? n : null;
}

/** Why a name can't be a new serving of the food, or null. */
export function nameProblem(food: Food, foodName: string, name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (n === 'g' || n === 'grams') return 'Grams are always there. Name a portion instead.';
  if ((food.servings_json ?? []).some((s) => s.name.trim().toLowerCase() === n)) {
    return `${foodName} already has a “${name.trim()}”.`;
  }
  return null;
}

/** The label's serving as the panel's live line and the save read it: `2 tbsp` is 1 tbsp = 16 g in a 32 g serving. */
export interface LabelServing {
  unit: string;
  /** The renamed serving's name: the quantity as typed, then the unit. */
  label: string;
  grams: number;
}

export function labelServing(vague: Weight, qtyField: string, unitField: string): LabelServing | null {
  const qty = fieldNumber(qtyField);
  const unit = unitField.trim();
  if (qty === null || !unit) return null;
  const grams = round1(vague.g / qty);
  if (grams <= 0 || grams > MAX_GRAMS) return null;
  return { unit, label: `${qtyField.trim()} ${unit}`, grams };
}

/** The servings after the label save: the vague one renamed in place, the unit appended. */
export function withLabelServing(food: Food, l: LabelServing): Weight[] {
  const list = (food.servings_json ?? []).map((s, i) => (i === 0 ? { ...s, name: l.label } : s));
  return [...list, { name: l.unit, g: l.grams }];
}

/** The servings after weighing your own: the new one appended. */
export function withOwnServing(food: Food, name: string, grams: number): Weight[] {
  return [...(food.servings_json ?? []), { name: name.trim(), g: round1(grams) }];
}

/** `1 bowl = 60 g · 234 kcal`, the kcal only for a food that has calories. */
export function ownLine(food: Food, name: string, grams: number): string {
  const kcal = food.kcal_100g === null ? '' : ` · ${Math.round((food.kcal_100g * grams) / 100)} kcal`;
  return `1 ${name.trim()} = ${tenth(grams)} g${kcal}`;
}
