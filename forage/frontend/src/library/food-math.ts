// The food form's arithmetic (#707): a label's per-serving figures to the
// per-100 g ones the API stores and back, and the "Set a weight" field. Recipe
// nutrition is never computed here: that is the API's (nutrition.js).
import type { Food, Store } from '../api/types';

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

/** The Foods column each form field is stored in. */
export const COLUMN: Record<Nutrient, 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g'> = {
  kcal: 'kcal_100g',
  protein: 'protein_100g',
  carbs: 'carbs_100g',
  fat: 'fat_100g',
};

export const STORE_LABELS: Record<Exclude<Store, ''>, string> = {
  ks: 'King Soopers',
  costco: 'Costco',
  other: 'Other',
};

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** A label's per-serving value as stored: per 100 g, to two decimals. 5 g in 30 g is 16.67. */
export function per100(value: number, servingG: number): number {
  return round((value * 100) / servingG, 2);
}

/** A stored per-100 g value in one serving, to 0.1, as the form shows it. 16.67 in 30 g is 5. */
export function perServing(value100: number, servingG: number): number {
  return round((value100 * servingG) / 100, 1);
}

/** What protein, carbs and fat come to in kcal: P×4 + C×4 + F×9. */
export function macroKcal(protein: number, carbs: number, fat: number): number {
  return protein * 4 + carbs * 4 + fat * 9;
}

export function hasNutrition(f: Pick<Food, 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g'>): boolean {
  return [f.kcal_100g, f.protein_100g, f.carbs_100g, f.fat_100g].every((v) => typeof v === 'number');
}

/** Brand, then name: `KIND Dark Chocolate Nuts & Sea Salt bar`. */
export function displayName(f: Pick<Food, 'brand' | 'name'>): string {
  return [f.brand, f.name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** A Foods row's line two: `180 kcal a bar` for a packaged food with a serving, else `364 kcal / 100 g`, or null. */
export function kcalLine(f: Food): string | null {
  if (!hasNutrition(f)) return null;
  const serving = f.servings_json?.[0];
  if (f.kind === 'packaged' && serving) return `${Math.round((f.kcal_100g! * serving.g) / 100)} kcal a ${serving.name}`;
  return `${Math.round(f.kcal_100g!)} kcal / 100 g`;
}

/** The heaviest weight the "Set a weight" field takes. */
export const MAX_WEIGHT_G = 5000;

/** `425`, `425 g` or `15 oz` as grams (oz × 28.3495, to 0.1), or null when it is not a weight above 0 and up to 5,000 g. */
export function parseWeight(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(g|grams?|oz|ounces?)?\s*$/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const grams = m[2] && /^o/i.test(m[2]) ? round(n * 28.3495, 1) : n;
  return grams > 0 && grams <= MAX_WEIGHT_G ? grams : null;
}

/** A number field's text as a number, or null when blank or not a number. */
export function numberOf(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** A barcode's digits, spaces dropped, or null unless 8, 12, 13 or 14 of them. */
export function barcodeDigits(text: string): string | null {
  const code = text.replace(/\s+/g, '');
  return /^(\d{8}|\d{12,14})$/.test(code) ? code : null;
}

/** A plural noun made singular, simply: `chicken breasts` asks about `chicken breast`. */
export function singular(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.pop() ?? '';
  const one = /ies$/i.test(last)
    ? last.slice(0, -3) + 'y'
    : /(ch|sh|x|ss)es$/i.test(last)
      ? last.slice(0, -2)
      : /[^su]s$/i.test(last)
        ? last.slice(0, -1)
        : last;
  return [...words, one].join(' ');
}
