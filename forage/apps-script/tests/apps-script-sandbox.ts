// Sandboxed loader for Forage's Apps Script sources, after Thrive's.
//
// Apps Script files are plain `.js` evaluated into one shared global scope. A
// test that transcribes a function stays green when the real source breaks,
// so the real `src/*.js` files are evaluated into a `node:vm` context with the
// Google globals stubbed. That is safe because no source file touches a Google
// global at load time.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// The sandbox holds the globals the sources declared. Its shape is only
// knowable at runtime, so `any` is the honest type.
export type Sandbox = Record<string, any>;

/** What a cell holds when a write began with `=`: a live formula, not text. */
export class SheetFormula {
  constructor(public source: string) {}
}

export type CellValue = string | number | boolean | Date | SheetFormula;

// A parsed date remembers how it was typed, because that is what Sheets displays.
const typedAs = new WeakMap<Date, string>();

/**
 * What Sheets stores when a script writes `value` with appendRow/setValues:
 * like typing into the cell. A date-shaped string becomes a date, a
 * number-shaped one a number ("0042" is 42), a leading `=` a formula. A
 * leading apostrophe is the escape: the rest is stored as text.
 */
export function storeAsTyped(value: CellValue): CellValue {
  if (typeof value !== 'string') return value;
  if (value.startsWith("'")) return value.slice(1);
  if (value.startsWith('=')) return new SheetFormula(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    typedAs.set(d, value);
    return d;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'TRUE' || value === 'FALSE') return value === 'TRUE';
  return value;
}

/** What getDisplayValues shows. A formula shows its result, never its source. */
export function displayOf(value: CellValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (value instanceof SheetFormula) return '#FORMULA';
  if (value instanceof Date) return typedAs.get(value) ?? value.toString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/** A fake sheet. `rows` is the live backing array, header row included: rows[0] is sheet row 1. */
export function makeSheet(name: string, rows: CellValue[][] = []) {
  const sheet = {
    name,
    rows,
    frozenRows: 0,
    getName: () => name,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((max, r) => Math.max(max, r.length), 0),
    appendRow(row: CellValue[]) {
      rows.push(row.map(storeAsTyped));
    },
    deleteRow(rowNum: number) {
      if (rowNum < 1 || rowNum > rows.length) throw new Error('deleteRow out of range');
      rows.splice(rowNum - 1, 1);
    },
    setFrozenRows(n: number) {
      sheet.frozenRows = n;
    },
    getRange(startRow: number, startCol: number, numRows: number, numCols: number) {
      const slice = () =>
        Array.from({ length: numRows }, (_, i) => rows[startRow - 1 + i] ?? []).map((r) =>
          Array.from({ length: numCols }, (_, c) => r[startCol - 1 + c]),
        );
      return {
        getValues: () => slice(),
        getDisplayValues: () => slice().map((r) => r.map(displayOf)),
        setValues(values: CellValue[][]) {
          for (let i = 0; i < numRows; i++) {
            const target = startRow - 1 + i;
            while (rows.length <= target) rows.push([]);
            for (let c = 0; c < numCols; c++) rows[target][startCol - 1 + c] = storeAsTyped(values[i][c]);
          }
        },
      };
    },
  };
  return sheet;
}

export type FakeSheet = ReturnType<typeof makeSheet>;

/** A fake spreadsheet holding named sheets. */
export function makeSpreadsheet(tabs: Record<string, CellValue[][]> = {}) {
  const sheets = new Map<string, FakeSheet>();
  for (const [name, rows] of Object.entries(tabs)) sheets.set(name, makeSheet(name, rows));
  return {
    sheets,
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet(name: string) {
      if (sheets.has(name)) throw new Error(`A sheet with the name "${name}" already exists`);
      const sheet = makeSheet(name);
      sheets.set(name, sheet);
      return sheet;
    },
  };
}

export type FakeSpreadsheet = ReturnType<typeof makeSpreadsheet>;

/** What a fake tokeninfo answers: an HTTP status and a body, or a throw. */
export type FetchReply = { status: number; body: string } | { throws: string };

export interface ApiOptions {
  /** Script properties. Defaults give SPREADSHEET_ID and API_KEY. */
  properties?: Record<string, string>;
  /** Answers each tokeninfo fetch. Absent: UrlFetchApp is not stubbed. */
  tokeninfo?: (url: string) => FetchReply;
  /** Start with no tabs at all, for ensureSchema. */
  empty?: boolean;
}

export const API_KEY = 'test-api-key';

/** Every `src/*.js`, types.js first, the rest in name order. */
export function sourceFiles(): string[] {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.js'));
  return ['types.js', ...files.filter((f) => f !== 'types.js').sort()];
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

export interface Envelope {
  success: boolean;
  data?: any;
  error?: string;
  code?: string;
}

/**
 * The whole API over a fake spreadsheet. Unless `empty`, every tab exists with
 * its header row, as the migration leaves it.
 */
export function loadApi(options: ApiOptions = {}) {
  const ss = makeSpreadsheet();
  const properties: Record<string, string> = { SPREADSHEET_ID: 'sheet-1', API_KEY, ...(options.properties ?? {}) };
  const lock = { acquired: 0, held: false };
  const cache = new Map<string, { value: string; ttl: number }>();
  const fetches: string[] = [];
  let uuid = 0;

  const globals: Sandbox = {
    SpreadsheetApp: {
      openById(id: string) {
        if (id !== properties.SPREADSHEET_ID) throw new Error('Unexpected spreadsheet id');
        return ss;
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (Object.prototype.hasOwnProperty.call(properties, k) ? properties[k] : null),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (lock.held) throw new Error('Lock timeout: the script lock is already held');
          lock.held = true;
          lock.acquired += 1;
        },
        releaseLock() {
          lock.held = false;
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k)?.value ?? null,
        put(k: string, value: string, ttl: number) {
          if (k.length > 250) throw new Error('Cache key over 250 characters');
          cache.set(k, { value, ttl });
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_a: string, value: string) =>
        Array.from(createHash('sha256').update(value, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => {
        uuid += 1;
        return `${uuid.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
      },
      formatDate(date: Date, timeZone: string, format: string) {
        if (format !== 'yyyy-MM-dd') throw new Error('formatDate stub supports yyyy-MM-dd only');
        return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
          date,
        );
      },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text: string) {
        const out = { getContent: () => text, setMimeType: () => out };
        return out;
      },
    },
  };
  if (options.tokeninfo) {
    const reply = options.tokeninfo;
    globals.UrlFetchApp = {
      fetch(url: string) {
        fetches.push(url);
        const r = reply(url);
        if ('throws' in r) throw new Error(r.throws);
        return { getResponseCode: () => r.status, getContentText: () => r.body };
      },
    };
  }

  const sandbox = loadSources(sourceFiles(), globals);
  if (!options.empty) {
    for (const name of sandbox.TAB_ORDER as string[]) {
      ss.sheets.set(name, makeSheet(name, [[...sandbox.TABS[name].fields]]));
    }
  }

  /** POST `action` with these parameters; an object `payload` is sent as JSON. */
  function post(params: Record<string, unknown>): Envelope {
    const parameter: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      parameter[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    const out = sandbox.doPost({ parameter });
    return JSON.parse(out.getContent());
  }

  /** A key caller's call. */
  function call(action: string, params: Record<string, unknown> = {}): Envelope {
    return post({ action, key: API_KEY, ...params });
  }

  /** A key caller's call that must succeed; answers its data. */
  function ok(action: string, params: Record<string, unknown> = {}): any {
    const res = call(action, params);
    if (!res.success) throw new Error(`${action} failed: ${res.error}`);
    return res.data;
  }

  /** The live rows of a tab, header excluded. */
  function rows(tab: string): CellValue[][] {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) throw new Error(`No tab ${tab}`);
    return sheet.rows.slice(1);
  }

  return { sandbox, ss, properties, lock, cache, fetches, post, call, ok, rows };
}

export type Api = ReturnType<typeof loadApi>;
