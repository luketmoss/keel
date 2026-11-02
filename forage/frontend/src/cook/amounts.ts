// Amounts in a walkthrough (#711). A walkthrough holds no quantities: an amount
// is the recipe line's qty × the entry's share × cook servings ÷ recipe
// servings, shown in the recipe's own unit. Times never scale.
import type { RecipeLine } from '../api/types';

export interface ShownAmount {
  /** `1½ cups`, `2`, `Some`, `A little`. */
  amount: string;
  /** The line's name, `beef broth`, with ` (optional)` for an optional line. */
  name: string;
}

const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];

/** Units that take an `s`, and the odd plurals. Everything else (`tbsp`, `lb`, `g`) stays as it is. */
const PLURALS: Record<string, string> = {
  cup: 'cups',
  clove: 'cloves',
  can: 'cans',
  slice: 'slices',
  stick: 'sticks',
  sprig: 'sprigs',
  bunch: 'bunches',
  head: 'heads',
  stalk: 'stalks',
  piece: 'pieces',
  package: 'packages',
  jar: 'jars',
  serving: 'servings',
};

/** The unit spellings a line's text may start with, as the API's line parser reads them. */
const UNIT_WORDS =
  'fluid ounces?|fl\\.? oz|tablespoons?|tbsps?|tbs|tbl|teaspoons?|tsps?|kilograms?|kgs?|grams?|gr|g|ounces?|oz|' +
  'pounds?|lbs?|lb|milliliters?|millilitres?|ml|liters?|litres?|l|cups?|c|pints?|pt|quarts?|qt|pinch(?:es)?|' +
  'dash(?:es)?|cloves?|cans?|slices?|large|medium|small|sticks?|sprigs?|bunch(?:es)?|heads?|stalks?|pieces?|' +
  'packages?|pkgs?|jars?|whole';
const LEADING_AMOUNT = new RegExp(
  `^(?:[\\d½⅓⅔¼¾⅛⅜⅝⅞]+(?:[\\s./-]+[\\d½⅓⅔¼¾⅛⅜⅝⅞]+)*(?:\\s*(?:-|to)\\s*[\\d./]+)?\\s*)` +
    `(?:(?:${UNIT_WORDS})\\.?\\b\\s*)?(?:of\\s+)?`,
  'i',
);

/** A line's name: its text up to the first comma or parenthesis, without the amount and unit. */
export function lineName(line: Pick<RecipeLine, 'text' | 'unit'>): string {
  const head = line.text.split(/[,(]/)[0].trim();
  let name = head.replace(LEADING_AMOUNT, '').trim();
  // "2 garlic cloves": the unit is written after the name.
  const unit = line.unit.trim().toLowerCase();
  if (unit) name = name.replace(new RegExp(`\\s+(?:${unit}|${PLURALS[unit] ?? unit})$`, 'i'), '').trim();
  return name || head || line.text;
}

/** `1½`, `⅔`, `4`, `12`: to the nearest ⅛ below 4 (⅓ and ⅔ recognised), ½ from 4 to 10, whole from 10. */
export function quantityText(q: number): string {
  if (q >= 10) return String(Math.round(q));
  if (q >= 4) {
    const halves = Math.round(q * 2);
    return `${Math.floor(halves / 2)}${halves % 2 ? '½' : ''}`;
  }
  let whole = Math.floor(q);
  const frac = q - whole;
  for (const [value, glyph] of [
    [1 / 3, '⅓'],
    [2 / 3, '⅔'],
  ] as const) {
    if (Math.abs(frac - value) < 0.02) return `${whole || ''}${glyph}`;
  }
  let eighths = Math.round(frac * 8);
  if (eighths === 8) {
    whole += 1;
    eighths = 0;
  }
  return `${whole || (eighths ? '' : '0')}${EIGHTHS[eighths]}`;
}

/** The value `quantityText` shows, for choosing singular or plural. */
function shownValue(text: string): number {
  const glyphs: Record<string, number> = { '⅓': 1 / 3, '⅔': 2 / 3 };
  EIGHTHS.forEach((g, i) => g && (glyphs[g] = i / 8));
  const m = /^(\d*)(.?)$/.exec(text);
  if (!m) return Number(text);
  return Number(m[1] || 0) + (glyphs[m[2]] ?? 0);
}

/**
 * What one `uses` entry of a line reads as, at `servings` for a recipe written
 * for `recipeServings`. A line with no qty reads `Some`; under ⅛ reads `A
 * little`; a line that is gone (a stale walkthrough already open) reads `Some`.
 */
export function shownAmount(
  line: Pick<RecipeLine, 'text' | 'unit' | 'qty' | 'optional'> | undefined,
  share: number | undefined,
  servings: number,
  recipeServings: number | null,
): ShownAmount {
  if (!line) return { amount: 'Some', name: 'an ingredient no longer in the recipe' };
  const name = `${lineName(line)}${line.optional ? ' (optional)' : ''}`;
  if (line.qty === null || line.qty === undefined) return { amount: 'Some', name };
  const base = recipeServings && recipeServings > 0 ? recipeServings : servings;
  const q = line.qty * (share ?? 1) * (servings / base);
  if (q < 0.125 - 1e-9) return { amount: 'A little', name };
  const text = quantityText(q);
  const unit = line.unit.trim();
  if (!unit) return { amount: text, name };
  const plural = shownValue(text) > 1 ? (PLURALS[unit] ?? unit) : unit;
  return { amount: `${text} ${plural}`, name };
}

/** `19 min`, `1 h 30 min`, `2 h`. */
export function minutesText(min: number): string {
  if (min <= 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
