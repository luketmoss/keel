// #827 — scripts/migrate-827-daily-summary-water-timing.mjs against a fake
// Sheets REST API. Proves the plan, the dry run, the append-only write, the
// idempotent second run and the refusals. Follows migrate-592's test.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi } from './apps-script-sandbox';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-827-daily-summary-water-timing.mjs')).href;

// A plain JS module with no types; imported by URL so tsc does not resolve it.
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

// A:AE, the header this migration writes.
const FIELDS: string[] = [...loadApi().sandbox.DAILY_SUMMARY_FIELDS].slice(0, 31);
const A_TO_AC = FIELDS.slice(0, 29);

interface Tab { rows: string[][]; columns: number }

/** A spreadsheet of named tabs, each a grid of rows and a column count, behind Sheets' REST paths. */
function fakeSheets(tabs: Record<string, Tab>) {
  const writes: string[] = [];
  const titles = Object.keys(tabs);
  async function api(p: string, init?: { method?: string; body?: string }) {
    const method = init?.method ?? 'GET';
    if (p === '?fields=sheets.properties') {
      return {
        sheets: titles.map((title, sheetId) => ({
          properties: { title, sheetId, gridProperties: { columnCount: tabs[title].columns } },
        })),
      };
    }
    if (p === ':batchUpdate' && method === 'POST') {
      for (const r of JSON.parse(init!.body!).requests) {
        const { sheetId, dimension, length } = r.appendDimension;
        expect(dimension).toBe('COLUMNS');
        tabs[titles[sheetId]].columns += length;
        writes.push(`appendDimension ${titles[sheetId]} +${length}`);
      }
      return {};
    }
    const m = p.match(/^\/values\/([^?]+)(\?.*)?$/);
    if (m) {
      const range = decodeURIComponent(m[1]);
      const [tab, cells] = range.split('!');
      if (method === 'PUT') {
        writes.push(`PUT ${range}`);
        expect(cells).toBe('AD1');
        expect(tabs[tab].columns).toBeGreaterThanOrEqual(31); // a cell past the grid is an API error
        const added = JSON.parse(init!.body!).values[0];
        expect(added).toHaveLength(2);
        tabs[tab].rows[0][29] = added[0];
        tabs[tab].rows[0][30] = added[1];
        return {};
      }
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

const dataRow = ['2026-10-19', '1', 'weight', '', '3600'];
const live = (columns = 29): Record<string, Tab> => ({
  DailySummary: { rows: [[...A_TO_AC], [...dataRow]], columns },
});

describe('#827: migrate-827 appends DailySummary!AD:AE', () => {
  it('holds HEADERS equal to DAILY_SUMMARY_FIELDS through AE, with A:AC unchanged', async () => {
    const { HEADERS, BEFORE, TAB } = await load();
    expect(TAB).toBe('DailySummary');
    expect(HEADERS).toEqual(FIELDS);
    expect(BEFORE).toEqual(A_TO_AC);
    expect(HEADERS.slice(29)).toEqual(['water_by_noon_ml', 'water_gap_max_s']);
  });

  it('--dry-run against a header ending at unwind_mg plans the two columns as AD:AE and writes nothing', async () => {
    const r = await run(live(), true);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.tabs.DailySummary.rows[0]).toEqual(A_TO_AC);
    expect(r.out).toMatch(/plan   add 2 column\(s\) to the grid \(29 -> 31\)/);
    expect(r.out).toMatch(/plan   write AD1: water_by_noon_ml, water_gap_max_s/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('widens a 29-column grid and writes AD1:AE1 alone, leaving A:AC and every data row as they were', async () => {
    const r = await run(live());
    expect(r.code).toBe(0);
    expect(r.writes).toEqual(['appendDimension DailySummary +2', 'PUT DailySummary!AD1']);
    expect(r.tabs.DailySummary.rows[0]).toEqual(FIELDS);
    expect(r.tabs.DailySummary.rows[1]).toEqual(dataRow);
  });

  it('does not widen a grid that already has room', async () => {
    const r = await run(live(32));
    expect(r.writes).toEqual(['PUT DailySummary!AD1']);
    expect(r.tabs.DailySummary.columns).toBe(32);
  });

  it('a second run finds A:AE and writes nothing', async () => {
    const first = await run(live());
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/already applied/);
  });

  it('refuses, never rewrites, any other header', async () => {
    const older = FIELDS.slice(0, 28); // #562's A:AB, before #592 ran
    const r = await run({ DailySummary: { rows: [older], columns: 28 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.tabs.DailySummary.rows[0]).toEqual(older);
    expect(r.err).toMatch(/REFUSING/);
  });

  it('refuses an A:AC header followed by something else', async () => {
    const r = await run({ DailySummary: { rows: [[...A_TO_AC, 'water_by_noon_ml']], columns: 30 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
  });

  it('refuses an empty header, and a missing tab', async () => {
    expect((await run({ DailySummary: { rows: [[]], columns: 29 } })).code).toBe(1);
    const missing = await run({ Workouts: { rows: [['id']], columns: 31 } });
    expect(missing.code).toBe(1);
    expect(missing.writes).toEqual([]);
    expect(missing.err).toMatch(/no "DailySummary" tab/);
  });
});
