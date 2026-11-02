// #755: scripts/backfill-755-starter-nutrition.mjs, run for real against the
// sandboxed API behind a local HTTP server, as the owner runs it against the
// deployed one.

import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { API_KEY, loadApi, SRC_DIR, type Api } from './apps-script-sandbox';

const SCRIPT = path.resolve(SRC_DIR, '..', '..', 'scripts', 'backfill-755-starter-nutrition.mjs');
const run = promisify(execFile);
const SEVEN = [
  'satfat_100g', 'transfat_100g', 'cholesterol_mg_100g', 'sodium_mg_100g', 'fiber_100g', 'sugars_100g',
  'added_sugars_100g',
];

let server: Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

/** Serve the sandbox's doPost on a local port, form-encoded like Apps Script; answer the URL. */
async function serve(api: Api): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parameter = Object.fromEntries(new URLSearchParams(body));
      const out = api.sandbox.doPost({ parameter });
      res.setHeader('Content-Type', 'application/json');
      res.end(out.getContent());
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}/`;
}

async function backfill(apiUrl: string) {
  const { stdout } = await run(process.execPath, [SCRIPT], {
    env: { ...process.env, FORAGE_API_URL: apiUrl, FORAGE_API_KEY: API_KEY },
  });
  return stdout;
}

describe('backfill-755-starter-nutrition.mjs', () => {
  it('fills only the blank values of starter foods, prints them, is undoable, and a second run changes nothing', async () => {
    const api = loadApi();
    const starters = api.sandbox.STARTER_FOODS as Record<string, any>[];
    const flour = starters.find((s) => s.id === 'flour-all-purpose')!;
    const salt = starters.find((s) => s.id === 'salt')!;
    const core = (s: Record<string, any>) => ({
      kcal_100g: s.kcal_100g, protein_100g: s.protein_100g, carbs_100g: s.carbs_100g, fat_100g: s.fat_100g,
    });
    // As #707 added them: the core four, none of the seven. Flour has its fiber set by hand already.
    api.ok('upsertFood', { payload: { id: 'fd_flour', name: 'Flour', source: 'usda', source_ref: String(flour.fdc), ...core(flour), fiber_100g: 1.5 } });
    api.ok('upsertFood', { payload: { id: 'fd_salt', name: 'Salt', source: 'usda', source_ref: String(salt.fdc), usual_store: 'ks', ...core(salt) } });
    // Not starter foods: another usda food, and an Open Food Facts one whose code happens to be an FDC id.
    api.ok('upsertFood', { payload: { id: 'fd_other', name: 'Other', source: 'usda', source_ref: '999999', kcal_100g: 1, protein_100g: 0, carbs_100g: 0, fat_100g: 0 } });
    api.ok('upsertFood', { payload: { id: 'fd_off', name: 'Off', source: 'off', source_ref: String(salt.fdc), kcal_100g: 1, protein_100g: 0, carbs_100g: 0, fat_100g: 0 } });
    const before = {
      flour: api.ok('getFood', { id: 'fd_flour' }),
      salt: api.ok('getFood', { id: 'fd_salt' }),
      other: JSON.stringify(api.rows('Foods').filter((r) => r[0] === 'fd_other' || r[0] === 'fd_off')),
    };

    const apiUrl = await serve(api);
    const out = await backfill(apiUrl);
    expect(out).toMatch(/Flour \(fd_flour\): satfat_100g/);
    expect(out).toMatch(/Salt \(fd_salt\): .*sodium_mg_100g/);
    expect(out).toMatch(/Changed 2 foods\./);
    const callId = /Undo it all with forage_undo, call (backfill-755-\d+)\./.exec(out)![1];

    const flourAfter = api.ok('getFood', { id: 'fd_flour' });
    const saltAfter = api.ok('getFood', { id: 'fd_salt' });
    expect(flourAfter.fiber_100g).toBe(1.5); // set before, kept
    for (const f of SEVEN.filter((f) => f !== 'fiber_100g')) expect(flourAfter[f], f).toBe(flour[f] ?? null);
    for (const f of SEVEN) expect(saltAfter[f], f).toBe(salt[f] ?? null);
    expect(flourAfter.added_sugars_100g).toBeNull();
    // Nothing else on the foods changed.
    const rest = (f: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(f).filter(([k]) => !SEVEN.includes(k) && k !== 'updated'));
    expect(rest(flourAfter)).toEqual(rest(before.flour));
    expect(rest(saltAfter)).toEqual(rest(before.salt));
    expect(JSON.stringify(api.rows('Foods').filter((r) => r[0] === 'fd_other' || r[0] === 'fd_off'))).toBe(before.other);

    // In the change log under one call, which undoes.
    const log = api.ok('getChangeLog', { call_id: callId });
    expect(log.map((r: { tab: string; row_key: { id: string } }) => `${r.tab} ${r.row_key.id}`).sort()).toEqual([
      'Foods fd_flour',
      'Foods fd_salt',
    ]);

    const again = await backfill(apiUrl);
    expect(again).toMatch(/Changed nothing/);
    expect(api.ok('getFood', { id: 'fd_salt' })).toEqual(saltAfter);

    api.ok('undoCall', { payload: { call_id: callId, confirm: true } });
    expect(api.ok('getFood', { id: 'fd_salt' }).sodium_mg_100g).toBeNull();
    expect(api.ok('getFood', { id: 'fd_flour' }).fiber_100g).toBe(1.5);
  }, 30000);
});
