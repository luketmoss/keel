// #432 AC4 — scripts/migrate-421-workouts-track-ref.mjs against a fake Sheets
// REST API. Proves the plan, the dry run, the additive write, the idempotent
// second run and the refusals.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi } from './apps-script-sandbox';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-421-workouts-track-ref.mjs')).href;

// A plain JS module with no types; imported by URL so tsc does not resolve it.
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

const FIELDS: string[] = [...loadApi().sandbox.WORKOUT_FIELDS];

interface Tab { rows: string[][]; columns: number }

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
        expect(cells).toBe('AC1');
        expect(tabs[tab].columns).toBeGreaterThanOrEqual(29); // a cell past the grid is an API error
        tabs[tab].rows[0][28] = JSON.parse(init!.body!).values[0][0];
        return {};
      }
      if (cells === 'A:A') return { values: tabs[tab].rows.map((r) => [r[0]]) };
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

const dataRow = ['w_1', '2026-09-24', '11:02', 'bike', 'Mountain Bike'];

async function live(columns = 28): Promise<Record<string, Tab>> {
  const { BEFORE } = await load();
  return { Workouts: { rows: [[...BEFORE], [...dataRow]], columns } };
}

describe('#432 AC4: migrate-421 appends Workouts!AC track_ref', () => {
  it('has 29 headers, one per WORKOUT_FIELDS entry, ending in AB sport_type and AC track_ref', async () => {
    const { HEADERS, BEFORE, TAB } = await load();
    expect(TAB).toBe('Workouts');
    expect(HEADERS).toHaveLength(FIELDS.length);
    expect(HEADERS[27]).toBe('sport_type');
    expect(HEADERS[28]).toBe(FIELDS[28]);
    expect(HEADERS[28]).toBe('track_ref');
    expect(BEFORE).toEqual(HEADERS.slice(0, 28));
  });

  it('--dry-run plans the column and writes nothing', async () => {
    const r = await run(await live(), true);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Workouts.columns).toBe(28);
    expect(r.out).toMatch(/plan   add 1 column\(s\) to the grid \(28 -> 29\)/);
    expect(r.out).toMatch(/plan   write AC1: track_ref/);
    expect(r.out).toMatch(/1 existing rows keep a blank AC/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('widens a 28-column grid and writes AC1 alone, leaving A:AB and every data row as they were', async () => {
    const { HEADERS, BEFORE } = await load();
    const r = await run(await live());
    expect(r.code).toBe(0);
    expect(r.writes).toEqual(['appendDimension Workouts +1', 'PUT Workouts!AC1']);
    expect(r.tabs.Workouts.rows[0]).toEqual(HEADERS);
    expect(r.tabs.Workouts.rows[0].slice(0, 28)).toEqual(BEFORE);
    expect(r.tabs.Workouts.rows[1]).toEqual(dataRow);
    expect(r.tabs.Workouts.columns).toBe(29);
    expect(r.out).toMatch(/backfill-421-workouts-track\.mjs --dry-run/);
  });

  it('does not widen a grid that already has room', async () => {
    const r = await run(await live(30));
    expect(r.writes).toEqual(['PUT Workouts!AC1']);
    expect(r.tabs.Workouts.columns).toBe(30);
  });

  it('a second run finds A:AC and writes nothing', async () => {
    const first = await run(await live());
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/already applied/);
  });

  it('refuses, never rewrites, any header but A:AB or A:AC, naming what it found', async () => {
    const { BEFORE } = await load();
    const other = [...BEFORE.slice(0, 27), 'sport'];
    const r = await run({ Workouts: { rows: [other], columns: 28 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Workouts.rows[0]).toEqual(other);
    expect(r.err).toMatch(/REFUSING/);
    expect(r.err).toContain('sport');

    const pre260 = await run({ Workouts: { rows: [BEFORE.slice(0, 27)], columns: 27 } });
    expect(pre260.code).toBe(1);
    expect(pre260.writes).toEqual([]);

    const wrongAc = await run({ Workouts: { rows: [[...BEFORE, 'tracks']], columns: 29 } });
    expect(wrongAc.code).toBe(1);
    expect(wrongAc.writes).toEqual([]);
  });

  it('refuses when there is no Workouts tab', async () => {
    const r = await run({ Other: { rows: [['x']], columns: 5 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
  });
});
