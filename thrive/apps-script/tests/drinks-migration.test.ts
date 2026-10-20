// #519 - scripts/migrate-519-drinks-tab.mjs against a fake Sheets REST
// API. Proves the plan, the dry run, the idempotent second run and the refusal.

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-519-drinks-tab.mjs')).href;

// DRINK_FIELDS as types.js declares it: the tab's column order.
const DRINK_ORDER: string[] = (() => {
  const src = readFileSync(path.resolve(here, '..', 'src', 'types.js'), 'utf-8');
  const block = src.match(/var DRINK_FIELDS = \[([\s\S]*?)\];/)![1];
  return Array.from(block.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
})();

// A plain JS module with no types; imported by URL so tsc does not resolve it.
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

/** A spreadsheet of named tabs, each a grid of rows, behind Sheets' REST paths. */
function fakeSheets(tabs: Record<string, string[][]>) {
  const writes: string[] = [];
  async function api(p: string, init?: { method?: string; body?: string }) {
    const method = init?.method ?? 'GET';
    if (p === '?fields=sheets.properties') {
      return { sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) };
    }
    if (p === ':batchUpdate' && method === 'POST') {
      writes.push('batchUpdate');
      for (const r of JSON.parse(init!.body!).requests) tabs[r.addSheet.properties.title] = [];
      return {};
    }
    const m = p.match(/^\/values\/([^?]+)(\?.*)?$/);
    if (m) {
      const range = decodeURIComponent(m[1]);
      const [tab] = range.split('!');
      if (method === 'PUT') {
        writes.push(`PUT ${range}`);
        tabs[tab][0] = JSON.parse(init!.body!).values[0];
        return {};
      }
      const header = tabs[tab]?.[0];
      return header ? { values: [header] } : {};
    }
    throw new Error(`unexpected Sheets call ${method} ${p}`);
  }
  return { tabs, writes, api };
}

async function run(tabs: Record<string, string[][]>, dryRun = false) {
  const { migrate } = await load();
  const sheets = fakeSheets(tabs);
  const out: string[] = [];
  const err: string[] = [];
  const code = await migrate({
    api: sheets.api, dryRun, log: (l: string) => out.push(l), error: (l: string) => err.push(l),
  });
  return { ...sheets, code, out: out.join('\n'), err: err.join('\n') };
}

describe('AC1: the migration creates the tab', () => {
  it('holds HEADERS equal to DRINK_FIELDS', async () => {
    const { HEADERS, TAB } = await load();
    expect(TAB).toBe('Drinks');
    expect(HEADERS).toEqual(DRINK_ORDER);
    expect(HEADERS).toEqual(['id', 'kind', 'amount', 'date', 'time', 'logged_at_utc', 'source', 'created', 'updated']);
  });

  it('--dry-run plans the tab and writes nothing', async () => {
    const r = await run({ Workouts: [['id']] }, true);
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Drinks).toBeUndefined();
    expect(r.out).toMatch(/plan   create tab "Drinks"/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('creates the tab with exactly the A1:I1 header and leaves other tabs alone', async () => {
    const r = await run({ Workouts: [['id', 'Date']] });
    expect(r.code).toBe(0);
    expect(r.writes).toEqual(['batchUpdate', 'PUT Drinks!A1:I1']);
    expect(r.tabs.Drinks).toEqual([DRINK_ORDER]);
    expect(r.tabs.Workouts).toEqual([['id', 'Date']]);
  });

  it('a second run finds the expected header and writes nothing', async () => {
    const first = await run({});
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/already applied/);
  });

  it('refuses, never rewrites, a tab with any other header', async () => {
    const other = ['id', 'kind', 'amount', 'date', 'time', 'logged_at_utc', 'source', 'created', 'changed'];
    const r = await run({ Drinks: [other] });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.tabs.Drinks).toEqual([other]);
    expect(r.err).toMatch(/REFUSING/);
  });

  it('refuses an existing tab with an empty header', async () => {
    const r = await run({ Drinks: [] });
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
  });
});
