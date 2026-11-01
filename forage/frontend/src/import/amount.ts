// The amount field of line edit (#706) takes what a recipe writes: `1 1/2`,
// `½`, `1½`, `1-1/2`, and a range `1-2`, which keeps its low end as the API's
// line parser does. Only the amount: the line's text is never reparsed.

const FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '⅕': '1/5',
  '⅙': '1/6',
};

function value(token: string): number | null {
  const frac = /^(\d+)\/(\d+)$/.exec(token);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  return /^\d+(\.\d+)?$/.test(token) ? Number(token) : null;
}

/** The amount as a number rounded to three decimals, null for blank, or undefined when it can't be read. */
export function parseAmount(raw: string): number | null | undefined {
  const s = raw
    .trim()
    .replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅙])/g, '$1 $2')
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅙]/g, (c) => FRACTIONS[c])
    .replace(/\s*[–—]\s*/g, '-');
  if (!s) return null;
  let m = /^(\d+)[\s-]+(\d+\/\d+)$/.exec(s);
  let n: number | null;
  if (m) {
    const f = value(m[2]);
    n = f === null ? null : Number(m[1]) + f;
  } else {
    m = /^([\d./]+)(?:\s*(?:-|to)\s*[\d./]+)?$/.exec(s);
    n = m ? value(m[1]) : null;
  }
  return n === null ? undefined : Math.round(n * 1000) / 1000;
}

/** An amount for the field: `1.5` as `1 1/2` is not attempted; the number reads back as typed. */
export function formatAmount(qty: number | null): string {
  return qty === null ? '' : String(qty);
}
