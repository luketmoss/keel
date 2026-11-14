// #864: the arithmetic behind the macro bars, with no view library in it so it is tested without rendering.
// Nothing here adds up entries: it only turns figures the API already gave into shares and percentages.

/** Kcal in a gram of each macro. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

export type MacroKey = 'protein' | 'carbs' | 'fat';
export const MACRO_KEYS: MacroKey[] = ['protein', 'carbs', 'fat'];
export const MACRO_NAMES: Record<MacroKey, string> = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };

export interface MacroGrams {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

/**
 * - `unknown`: a macro is `null`, so no share is worked out (a share of a partial set would be wrong)
 * - `empty`: all three are 0, so there is nothing to share (a share of nothing is not 0%)
 * - `shares`: every macro has a share
 */
export type MacroShares =
  | { state: 'unknown' | 'empty' }
  | {
      state: 'shares';
      /** Calories from each macro: the width a segment takes. */
      kcal: Record<MacroKey, number>;
      /** Whole percentages that add to exactly 100. */
      pct: Record<MacroKey, number>;
      /** The text under a column: `27%`, or `<1%` for a share above 0 that rounds to 0. */
      text: Record<MacroKey, string>;
    };

/** Whole percentages of `parts` that add to exactly 100, by the largest-remainder rule. */
export function largestRemainder(parts: number[]): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total <= 0) return parts.map(() => 0);
  const exact = parts.map((p) => (p / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

/** The share of the macros' calories each macro is: grams times 4, 4 and 9. */
export function macroShares(g: MacroGrams): MacroShares {
  if (g.protein === null || g.carbs === null || g.fat === null) return { state: 'unknown' };
  const kcal = {
    protein: g.protein * KCAL_PER_G.protein,
    carbs: g.carbs * KCAL_PER_G.carbs,
    fat: g.fat * KCAL_PER_G.fat,
  };
  if (kcal.protein + kcal.carbs + kcal.fat <= 0) return { state: 'empty' };
  const rounded = largestRemainder(MACRO_KEYS.map((k) => kcal[k]));
  const pct = { protein: rounded[0], carbs: rounded[1], fat: rounded[2] };
  const text = Object.fromEntries(
    MACRO_KEYS.map((k) => [k, kcal[k] > 0 && pct[k] === 0 ? '<1%' : `${pct[k]}%`]),
  ) as Record<MacroKey, string>;
  return { state: 'shares', kcal, pct, text };
}

/** `Calories by macro: protein 27%, carbs 45%, fat 28%.` */
export function macroLabel(g: MacroGrams): string {
  const s = macroShares(g);
  if (s.state === 'unknown') return 'Calories by macro: not known.';
  if (s.state !== 'shares') return 'Calories by macro: none.';
  return `Calories by macro: ${MACRO_KEYS.map((k) => `${k} ${s.text[k]}`).join(', ')}.`;
}

/** A part's share of its parent as a whole percentage, `<1%` below one; null when there is nothing to divide by. */
export function partShare(part: number | null | undefined, parent: number | null | undefined): string | null {
  if (typeof part !== 'number' || typeof parent !== 'number' || parent <= 0) return null;
  const pct = Math.round((part / parent) * 100);
  return part > 0 && pct === 0 ? '<1%' : `${pct}%`;
}

/**
 * The scale of a parts bar: the parent's grams, or the parts added together when they come to more (they come from
 * different entries, so the API does not forbid it), so every slice fits.
 */
export function partsScale(parent: number | null | undefined, parts: (number | null | undefined)[]): number {
  const sum = parts.reduce<number>((a, p) => a + (typeof p === 'number' ? p : 0), 0);
  return Math.max(typeof parent === 'number' ? parent : 0, sum);
}
