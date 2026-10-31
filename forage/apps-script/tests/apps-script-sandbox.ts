import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// The sandbox holds the globals the sources declared. Its shape is only
// knowable at runtime, so `any` is the honest type.
export type Sandbox = Record<string, any>;

/** What a cell holds when a write began with `=`: a live formula, not text. */
export class SheetFormula {
  constructor(public source: string) {}
}

export type CellValue = string | number | boolean | Date | SheetFormula;

/**
 * What Sheets stores when a script writes `value` with appendRow/setValues.
 * A date- or time-shaped string becomes a date, a number-shaped one a number,
 * a leading `=` a formula. A leading apostrophe is the escape: the rest is
 * stored as literal text and the apostrophe dropped.
 */
export function storeAsTyped(value: CellValue): CellValue {
  if (typeof value !== 'string') return value;
  if (value.startsWith("'")) return value.slice(1);
  if (value.startsWith('=')) return new SheetFormula(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/** A fake Sheet. `rows` is the live backing array: assert on it after a write. */
export function makeSheet(rows: CellValue[][]) {
  return {
    rows,
    appendRow(row: CellValue[]) {
      rows.push(row.map(storeAsTyped));
    },
  };
}

/** Evaluate the named `src` files into one shared sandbox, in order. */
export function loadSources(files: string[], globals: Sandbox = {}): Sandbox {
  const context = createContext({ Logger: { log() {} }, console, ...globals });
  for (const file of files) {
    const filename = path.join(SRC_DIR, file);
    runInContext(readFileSync(filename, 'utf8'), context, { filename, displayErrors: true });
  }
  return context;
}
