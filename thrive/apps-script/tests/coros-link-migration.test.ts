// #773 - scripts/migrate-773-coros-link.mjs against a fake Sheets REST API. Proves the plan,
// the dry run, the one additive write, the idempotent second run and the refusals, and holds
// the migration's header to the API's WORKOUT_FIELDS.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi } from './apps-script-sandbox';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-773-coros-link.mjs')).href;

// A plain JS module with no types; imported by URL so tsc does not resolve it.
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

const sandbox = loadApi().sandbox;
const FIELDS: string[] = [...sandbox.WORKOUT_FIELDS];

interface Tab { rows: string[][]; columns: number }

/** A spreadsheet of named tabs behind Sheets' REST paths, with a grid width each. */
function fakeSheets(tabs: Record<string, Tab>) {
  const writes: string[] = [];
  async function api(p: string, init?: { method?: string; body?: string }) {
    const method = init?.method ?? 'GET';
    if (p === '?fields=sheets.properties') {
      return {
        sheets: Object.keys(tabs).map((title, sheetId) => ({
          properties: { title, sheetId, gridProperties: { columnCount: tabs[title].columns } },
        })),
      };
    }
    if (p === ':batchUpdate' && method === 'POST') {
      for (const r of JSON.parse(init!.body!).requests) {
        const { sheetId, dimension, length } = r.appendDimension;
        expect(dimension).toBe('COLUMNS');
        const title = Object.keys(tabs)[sheetId];
        tabs[title].columns += length;
        writes.push(`appendDimension ${title} +${length}`);
      }
      return {};
    }
    const m = p.match(/^\/values\/([^?]+)(\?.*)?$/);
    if (m) {
      const range = decodeURIComponent(m[1]);
      const [tab, cells] = range.split('!');
      if (method === 'PUT') {
        writes.push(`PUT ${range}`);
        expect(cells).toBe('AN1');
        const cell = JSON.parse(init!.body!).values[0][0] as string;
        expect(tabs[tab].columns).toBeGreaterThanOrEqual(40); // a cell past the grid is an API error
        tabs[tab].rows[0][39] = cell;
        return {};
      }
      if (cells === 'A:A') return { values: (tabs[tab]?.rows ?? []).map((r) => [r[0]]) };
      const header = tabs[tab]?.rows[0];
      return header && header.length ? { values: [header] } : {};
    }
    throw new Error(`unexpected Sheets call ${method} ${p}`);
  }
  return { tabs, writes, api };
}

async function run(tabs: Record<string, Tab>, dryRun = false) {
  const { migrate } = await load();
  const sheets = fakeSheets(tabs);
  const out: string[] = [];
  const err: string[] = [];
  const code = await migrate({
    api: sheets.api, dryRun, log: (l: string) => out.push(l), error: (l: string) => err.push(l),
  });
  return { ...sheets, code, out: out.join('\n'), err: err.join('\n') };
}

const dataRow = ['w_1', '2000-01-01', '06:00', 'walk', 'Walk'];

/** A live sheet at A:AM, as #765 left it. */
async function live(columns = 39): Promise<Record<string, Tab>> {
  const { BEFORE } = await load();
  return { Workouts: { rows: [[...BEFORE], [...dataRow]], columns } };
}

describe('#773: migrate-773 appends Workouts!AN, coros_activity_id', () => {
  it('holds HEADERS to the API field list: 40 columns, ending in coros_activity_id', async () => {
    const m = await load();
    expect(m.TAB).toBe('Workouts');
    expect(m.HEADERS).toHaveLength(40);
    expect(m.HEADERS).toHaveLength(sandbox.WORKOUT_COLUMN_COUNT);
    // A:Z carry the sheet's own display headers; from AA on the headers are the field names.
    expect(m.HEADERS.slice(26)).toEqual(FIELDS.slice(26));
    expect(m.HEADERS[39]).toBe('coros_activity_id');
    expect(m.BEFORE).toEqual(m.HEADERS.slice(0, 39));
    expect(m.BEFORE).toHaveLength(39);
  });

  it('turns an A:AM header into A:AN, widening the grid and leaving every other cell as it was', async () => {
    const { HEADERS, BEFORE } = await load();
    const r = await run(await live());
    expect(r.code).toBe(0);
    expect(r.writes).toEqual(['appendDimension Workouts +1', 'PUT Workouts!AN1']);
    expect(r.tabs.Workouts.rows[0]).toEqual(HEADERS);
    expect(r.tabs.Workouts.rows[0].slice(0, 39)).toEqual(BEFORE);
    expect(r.tabs.Workouts.rows[1]).toEqual(dataRow);
    expect(r.tabs.Workouts.columns).toBe(40);
  });

  it('--dry-run reports the header change and writes nothing', async () => {
    const r = await run(await live(), true);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Workouts.columns).toBe(39);
    expect(r.tabs.Workouts.rows[0]).toHaveLength(39);
    expect(r.out).toMatch(/plan   add 1 column\(s\) to the grid \(39 -> 40\)/);
    expect(r.out).toMatch(/plan   write AN1: coros_activity_id/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('does not widen a grid that already has room', async () => {
    const r = await run(await live(42));
    expect(r.writes).toEqual(['PUT Workouts!AN1']);
    expect(r.tabs.Workouts.columns).toBe(42);
  });

  it('a second run changes nothing', async () => {
    const first = await run(await live());
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/Nothing to do - migration already applied/);
  });

  it('refuses, never rewrites, a header that is neither A:AM nor A:AN, naming it and writing nothing', async () => {
    const { BEFORE } = await load();
    for (const other of [
      [...BEFORE.slice(0, 38), 'streams'], // AM is not streams_ref
      BEFORE.slice(0, 30), // A:AD: #765 has not run
      [...BEFORE, 'something_else'], // AN is not ours
      [...BEFORE, 'coros_activity_id', 'extra'], // past AN
    ]) {
      const r = await run({ Workouts: { rows: [other], columns: 39 } });
      expect(r.code).toBe(1);
      expect(r.writes).toEqual([]);
      expect(r.tabs.Workouts.rows[0]).toEqual(other);
      expect(r.tabs.Workouts.columns).toBe(39);
      expect(r.err).toMatch(/REFUSING/);
      expect(r.err).toContain(other[other.length - 1]);
    }
  });

  it('refuses when there is no Workouts tab', async () => {
    const r = await run({ Other: { rows: [['x']], columns: 5 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.err).toMatch(/no "Workouts" tab/);
  });
});
