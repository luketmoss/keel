// #576 - scripts/migrate-576-rest-times.mjs against a fake Sheets REST API.
// Proves where the headers land, the refusals, the dry run and the idempotent
// second run, and that the plan matches TEMPLATE_FIELDS / SET_FIELDS.

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = pathToFileURL(
  path.resolve(here, '..', '..', 'scripts', 'migrate-576-rest-times.mjs')).href;

const fieldsOf = (name: string): string[] => {
  const src = readFileSync(path.resolve(here, '..', 'src', 'types.js'), 'utf-8');
  const block = src.match(new RegExp(`var ${name} = \\[([\\s\\S]*?)\\];`))![1];
  return Array.from(block.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
};

// A plain JS module with no types; imported by URL so tsc does not resolve it.
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

type Grid = string[][];

/** Named tabs, each a grid of rows, behind Sheets' REST paths. */
function fakeSheets(tabs: Record<string, Grid>, columnCount: Record<string, number> = {}) {
  const writes: string[] = [];
  const colIndex = (letters: string) =>
    letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  async function api(p: string, init?: { method?: string; body?: string }) {
    const method = init?.method ?? 'GET';
    if (p === '?fields=sheets.properties') {
      return {
        sheets: Object.keys(tabs).map((title, i) => ({
          properties: { title, sheetId: i, gridProperties: { columnCount: columnCount[title] ?? 26 } },
        })),
      };
    }
    if (p === ':batchUpdate' && method === 'POST') {
      for (const r of JSON.parse(init!.body!).requests) {
        const title = Object.keys(tabs)[r.appendDimension.sheetId];
        writes.push(`append ${r.appendDimension.length} ${title}`);
        columnCount[title] = (columnCount[title] ?? 26) + r.appendDimension.length;
      }
      return {};
    }
    const m = p.match(/^\/values\/([^?]+)(\?.*)?$/);
    if (m) {
      const range = decodeURIComponent(m[1]);
      const [tab, cells] = range.split('!');
      if (method === 'PUT') {
        writes.push(`PUT ${range}`);
        const start = colIndex(cells.match(/^([A-Z]+)1/)![1]);
        if (start + JSON.parse(init!.body!).values[0].length > (columnCount[tab] ?? 26)) {
          throw new Error('exceeds grid limits');
        }
        const header = tabs[tab][0] ?? (tabs[tab][0] = []);
        JSON.parse(init!.body!).values[0].forEach((v: string, i: number) => { header[start + i] = v; });
        return {};
      }
      return tabs[tab]?.length ? { values: tabs[tab] } : {};
    }
    throw new Error(`unexpected Sheets call ${method} ${p}`);
  }
  return { tabs, writes, api };
}

async function run(tabs: Record<string, Grid>, opts: { dryRun?: boolean; columns?: Record<string, number> } = {}) {
  const { migrate } = await load();
  const sheets = fakeSheets(tabs, opts.columns);
  const out: string[] = [];
  const err: string[] = [];
  const code = await migrate({
    api: sheets.api, dryRun: opts.dryRun ?? false, log: (l: string) => out.push(l), error: (l: string) => err.push(l),
  });
  return { ...sheets, code, out: out.join('\n'), err: err.join('\n') };
}

const TEMPLATES_HEADER = ['template_id', 'Template Name', 'Order', 'exercise_id', 'Exercise Name', 'Section', 'Sets', 'Reps'];
const SETS_HEADER = ['workout_id', 'exercise_id', 'Exercise Name', 'Section', 'Exercise Order', 'Set #',
  'Planned Reps', 'Weight (lbs)', 'Reps', 'Effort'];
const live = (): Record<string, Grid> => ({
  Templates: [[...TEMPLATES_HEADER], ['tpl_1', 'Push', '1', 'ex_1', 'Bench', 'primary', '4', '6']],
  Sets: [[...SETS_HEADER], ['w_1', 'ex_1', 'Bench', 'primary', '1', '1', '6', '185', '6', 'Hard']],
  Workouts: [['id']],
});

describe('the plan matches the mirrors', () => {
  it('appends at the index TEMPLATE_FIELDS and SET_FIELDS read', async () => {
    const { PLAN } = await load();
    const tpl = fieldsOf('TEMPLATE_FIELDS');
    const sets = fieldsOf('SET_FIELDS');
    expect(PLAN).toEqual([
      { tab: 'Templates', at: tpl.indexOf('rest_s'), headers: tpl.slice(tpl.indexOf('rest_s')) },
      { tab: 'Sets', at: sets.indexOf('rest_target_s'), headers: sets.slice(sets.indexOf('rest_target_s')) },
    ]);
    expect(PLAN[0]).toMatchObject({ at: 8, headers: ['rest_s', 'switch_s'] });
    expect(PLAN[1]).toMatchObject({ at: 10, headers: ['rest_target_s', 'set_s', 'rest_s'] });
  });
});

describe('Migration', () => {
  it('adds the Templates and Sets headers after each tab last used column, and nothing else', async () => {
    const r = await run(live());
    expect(r.code, r.err).toBe(0);
    expect(r.writes).toEqual(['PUT Templates!I1:J1', 'PUT Sets!K1:M1']);
    expect(r.tabs.Templates[0]).toEqual([...TEMPLATES_HEADER, 'rest_s', 'switch_s']);
    expect(r.tabs.Sets[0]).toEqual([...SETS_HEADER, 'rest_target_s', 'set_s', 'rest_s']);
    expect(r.tabs.Sets[1]).toHaveLength(10);
    expect(r.tabs.Workouts).toEqual([['id']]);
  });

  it('a second run changes nothing and says so', async () => {
    const first = await run(live());
    const second = await run(first.tabs);
    expect(second.code).toBe(0);
    expect(second.writes).toEqual([]);
    expect(second.out).toMatch(/skip   Templates!I1:J1 already holds rest_s, switch_s/);
    expect(second.out).toMatch(/skip   Sets!K1:M1 already holds rest_target_s, set_s, rest_s/);
    expect(second.out).toMatch(/Nothing to do — migration already applied/);
  });

  it('a later run with rest values in the data rows still changes nothing', async () => {
    const first = await run(live());
    first.tabs.Sets.push(['w_2', 'ex_1', 'Bench', 'primary', '1', '1', '6', '', '', '', '90', '41', '88']);
    const again = await run(first.tabs);
    expect(again.code).toBe(0);
    expect(again.writes).toEqual([]);
  });

  it('refuses when an old value sits in Sets!K, writing nothing to either tab', async () => {
    const tabs = live();
    tabs.Sets.push(['w_2', 'ex_1', 'Bench', 'primary', '1', '1', '6', '', '', '', 'an old note']);
    const r = await run(tabs);
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.err).toMatch(/REFUSING: Sets's last used column is K, so the new columns would land at L, but .* read them at K/);
    expect(r.err).toMatch(/Nothing written/);
    expect(r.tabs.Templates[0]).toEqual(TEMPLATES_HEADER);
  });

  it('refuses when a header already sits in a target cell', async () => {
    const tabs = live();
    tabs.Templates[0] = [...TEMPLATES_HEADER, 'Created'];
    const r = await run(tabs);
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
    expect(r.err).toMatch(/Templates's last used column is I/);
  });

  it('refuses a half-applied tab rather than finishing it', async () => {
    const tabs = live();
    tabs.Sets[0] = [...SETS_HEADER, 'rest_target_s'];
    const r = await run(tabs);
    expect(r.code).toBe(1);
    expect(r.writes).toEqual([]);
  });

  it('refuses a missing tab', async () => {
    const tabs = live();
    delete (tabs as Partial<typeof tabs>).Sets;
    const r = await run(tabs);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no "Sets" tab/);
    expect(r.writes).toEqual([]);
  });

  it('--dry-run plans both tabs and writes nothing', async () => {
    const r = await run(live(), { dryRun: true });
    expect(r.code).toBe(0);
    expect(r.writes).toEqual([]);
    expect(r.out).toMatch(/plan   write Templates!I1:J1: rest_s, switch_s/);
    expect(r.out).toMatch(/plan   write Sets!K1:M1: rest_target_s, set_s, rest_s/);
    expect(r.out).toMatch(/--dry-run: nothing written/);
  });

  it('widens a grid too narrow for the new columns first', async () => {
    const r = await run(live(), { columns: { Templates: 8, Sets: 10 } });
    expect(r.code, r.err).toBe(0);
    expect(r.writes).toEqual(['append 2 Templates', 'PUT Templates!I1:J1', 'append 3 Sets', 'PUT Sets!K1:M1']);
  });
});
