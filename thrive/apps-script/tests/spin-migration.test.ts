// #765 - scripts/migrate-765-spin.mjs against a fake Sheets REST API. Proves the plan,
// the dry run, the additive writes, the idempotent second run and the refusals, and
// holds the migration's headers to the API's field lists.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi } from './apps-script-sandbox';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-765-spin.mjs')).href;

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
        if (r.appendDimension) {
          const { sheetId, dimension, length } = r.appendDimension;
          expect(dimension).toBe('COLUMNS');
          const title = Object.keys(tabs)[sheetId];
          tabs[title].columns += length;
          writes.push(`appendDimension ${title} +${length}`);
        } else {
          const { title, gridProperties } = r.addSheet.properties;
          tabs[title] = { rows: [], columns: gridProperties.columnCount };
          writes.push(`addSheet ${title}`);
        }
      }
      return {};
    }
    const m = p.match(/^\/values\/([^?]+)(\?.*)?$/);
    if (m) {
      const range = decodeURIComponent(m[1]);
      const [tab, cells] = range.split('!');
      if (method === 'PUT') {
        writes.push(`PUT ${range}`);
        const row = JSON.parse(init!.body!).values[0] as string[];
        const first = cells === 'AE1:AM1' ? 30 : 0;
        expect(tabs[tab].columns).toBeGreaterThanOrEqual(first + row.length); // a cell past the grid is an API error
        row.forEach((v, i) => { tabs[tab].rows[0] = tabs[tab].rows[0] ?? []; tabs[tab].rows[0][first + i] = v; });
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

/** A live sheet at A:AD, as #688 left it. */
async function live(columns = 30): Promise<Record<string, Tab>> {
  const { BEFORE } = await load();
  return { Workouts: { rows: [[...BEFORE], [...dataRow]], columns } };
}

describe('#765: migrate-765 appends Workouts!AE:AM and creates RideWorkouts and FtpHistory', () => {
  it('holds HEADERS, RideWorkouts and FtpHistory equal to the API field lists', async () => {
    const m = await load();
    expect(m.TAB).toBe('Workouts');
    // A:AM is this migration's; #773 appended AN after it, so the API's list is one longer.
    expect(m.HEADERS).toHaveLength(39);
    expect(m.HEADERS).toHaveLength(sandbox.WORKOUT_COLUMN_COUNT - 1);
    // A:Z carry the sheet's own display headers; A:AA onward match the field names, and so do AE:AM.
    expect(m.HEADERS.slice(26)).toEqual(FIELDS.slice(26, 39));
    expect(m.HEADERS.slice(30)).toEqual([
      'avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w',
      'intensity_pct', 'ride_workout_id', 'streams_ref',
    ]);
    expect(m.BEFORE).toEqual(m.HEADERS.slice(0, 30));
    expect(m.RIDE_WORKOUT_HEADERS).toEqual([...sandbox.RIDE_WORKOUT_FIELDS]);
    expect(m.RIDE_WORKOUT_HEADERS).toEqual(
      ['id', 'name', 'category', 'description', 'steps', 'duration_s', 'created', 'updated']);
    expect(m.FTP_HISTORY_HEADERS).toEqual([...sandbox.FTP_HISTORY_FIELDS]);
    expect(m.FTP_HISTORY_HEADERS).toEqual(['id', 'date', 'ftp_w', 'source', 'ride_id', 'created']);
  });

  it('--dry-run prints its plan and writes nothing', async () => {
    const r = await run(await live(), true);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Workouts.columns).toBe(30);
    expect(r.tabs.RideWorkouts).toBeUndefined();
    expect(r.tabs.FtpHistory).toBeUndefined();
    expect(r.out).toMatch(/plan   add 9 column\(s\) to the grid \(30 -> 39\)/);
    expect(r.out).toMatch(/plan   write AE1:AM1: avg_power_w, .*streams_ref/);
    expect(r.out).toMatch(/plan   create tab "RideWorkouts"/);
    expect(r.out).toMatch(/plan   create tab "FtpHistory"/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('widens the grid, writes AE1:AM1 and creates both tabs, leaving A:AD and every data row as they were', async () => {
    const { HEADERS, BEFORE, RIDE_WORKOUT_HEADERS, FTP_HISTORY_HEADERS } = await load();
    const r = await run(await live());
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([
      'appendDimension Workouts +9', 'PUT Workouts!AE1:AM1',
      'addSheet RideWorkouts', 'PUT RideWorkouts!A1:H1',
      'addSheet FtpHistory', 'PUT FtpHistory!A1:F1',
    ]);
    expect(r.tabs.Workouts.rows[0]).toEqual(HEADERS);
    expect(r.tabs.Workouts.rows[0].slice(0, 30)).toEqual(BEFORE);
    expect(r.tabs.Workouts.rows[1]).toEqual(dataRow);
    expect(r.tabs.Workouts.columns).toBe(39);
    expect(r.tabs.RideWorkouts.rows).toEqual([RIDE_WORKOUT_HEADERS]);
    expect(r.tabs.FtpHistory.rows).toEqual([FTP_HISTORY_HEADERS]);
  });

  it('does not widen a grid that already has room', async () => {
    const r = await run(await live(42));
    expect(r.writes[0]).toBe('PUT Workouts!AE1:AM1');
    expect(r.tabs.Workouts.columns).toBe(42);
  });

  it('a second run changes nothing', async () => {
    const first = await run(await live());
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/Nothing to do - migration already applied/);
  });

  it('finishes a half-applied run: Workouts done, the tabs missing, creates only the tabs', async () => {
    const first = await run(await live());
    delete first.tabs.FtpHistory;
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual(['addSheet FtpHistory', 'PUT FtpHistory!A1:F1']);
  });

  it('refuses, never rewrites, a Workouts header that is neither A:AD nor A:AM, writing nothing at all', async () => {
    const { BEFORE } = await load();
    for (const other of [
      [...BEFORE.slice(0, 29), 'tags'], // AD is not trails
      BEFORE.slice(0, 29), // A:AC: #688 has not run
      [...BEFORE, 'avg_power_w'], // part-way to AM
    ]) {
      const r = await run({ Workouts: { rows: [other], columns: 30 } });
      expect(r.code).toBe(1);
      expect(r.writes).toEqual([]);
      expect(r.tabs.Workouts.rows[0]).toEqual(other);
      expect(r.tabs.RideWorkouts).toBeUndefined();
      expect(r.err).toMatch(/REFUSING/);
      expect(r.err).toContain(other[other.length - 1]);
    }
  });

  it('refuses an existing RideWorkouts or FtpHistory with another header, and writes nothing, Workouts included', async () => {
    const tabs = await live();
    tabs.FtpHistory = { rows: [['id', 'date', 'watts']], columns: 6 };
    const r = await run(tabs);
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Workouts.columns).toBe(30);
    expect(r.tabs.FtpHistory.rows).toEqual([['id', 'date', 'watts']]);
    expect(r.err).toMatch(/REFUSING: "FtpHistory"/);

    const empty = await live();
    empty.RideWorkouts = { rows: [], columns: 8 };
    const e = await run(empty);
    expect(e.code).toBe(1);
    expect(e.writes).toEqual([]);
  });

  it('refuses when there is no Workouts tab', async () => {
    const r = await run({ Other: { rows: [['x']], columns: 5 } });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.err).toMatch(/no "Workouts" tab/);
  });
});
