#!/usr/bin/env node
/**
 * backfill-755-starter-nutrition.mjs - One-time fill of #755's seven nutrients
 * for foods already added from the starter list.
 *
 * #755 gives Foods seven optional columns (saturated and trans fat,
 * cholesterol, sodium, fiber, sugars, added sugars) and the starter list the
 * SR Legacy values for six of them. A food added from the starter list before
 * that has them blank. This fills each one that is blank on every food with
 * source `usda` whose `source_ref` is a starter food's FDC id, from that
 * starter food, through the deployed API's `upsertFood`:
 *
 *   - it never changes a value that is set, or any other field;
 *   - a value the starter food has blank (added sugars always) stays blank;
 *   - it prints each food it changed, and the ones it could not;
 *   - a second run finds nothing blank it can fill, and changes nothing.
 *
 * Every write is a key-caller write under one call id, so it is in
 * MCPChangeLog and `forage_undo` (or `undoCall`) reverts the whole run.
 *
 * Run it after the Apps Script deploy that ships #755 and after
 * migrate-703-create-tabs.mjs has added the columns.
 *
 * Usage (PowerShell, from forage/; the values are prompted for, never typed into the command):
 *   $env:FORAGE_API_URL = Read-Host 'FORAGE_API_URL'
 *   $key = Read-Host 'FORAGE_API_KEY' -AsSecureString
 *   $env:FORAGE_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
 *   node scripts/backfill-755-starter-nutrition.mjs
 */

const url = process.env.FORAGE_API_URL;
const key = process.env.FORAGE_API_KEY;
if (!url || !key) {
  console.error('Set FORAGE_API_URL and FORAGE_API_KEY first (see the usage at the top of this file).');
  process.exit(1);
}

/** The seven, as Foods columns, in #755's order. */
const SEVEN = [
  'satfat_100g', 'transfat_100g', 'cholesterol_mg_100g', 'sodium_mg_100g', 'fiber_100g', 'sugars_100g',
  'added_sugars_100g',
];

/** One call. POST, form-encoded: the key stays out of the URL, and fetch follows Apps Script's 302. */
async function call(action, params = {}) {
  const body = new URLSearchParams({ action, key });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetch(url, { method: 'POST', body });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: `HTTP ${res.status}, not JSON. Is FORAGE_API_URL the web-app URL?` };
  }
}

async function read(action, params) {
  const body = await call(action, params);
  if (!body.success) {
    console.error(`${action} refused: ${body.error}`);
    process.exit(1);
  }
  return body.data;
}

const blank = (v) => v === undefined || v === null || v === '';

const starters = await read('getStarterFoods');
if (!starters.length || !SEVEN.some((f) => f in starters[0])) {
  console.error('The API has no #755 starter values yet. Deploy the Apps Script first, then run the migration.');
  process.exit(1);
}
const byFdc = new Map(starters.map((s) => [String(s.fdc), s]));
const foods = await read('getFoods');

// One id for the whole run, so one undo reverts it.
const callId = `backfill-755-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
let changed = 0;
let failed = 0;
for (const food of foods) {
  const s = food.source === 'usda' ? byFdc.get(String(food.source_ref)) : undefined;
  if (!s) continue;
  const fill = {};
  for (const f of SEVEN) if (blank(food[f]) && typeof s[f] === 'number') fill[f] = s[f];
  const fields = Object.keys(fill);
  if (!fields.length) continue;
  const name = [food.brand, food.name].filter(Boolean).join(' ');
  const res = await call('upsertFood', { payload: { id: food.id, ...fill, call_id: callId } });
  if (!res.success) {
    failed++;
    console.log(`NOT CHANGED ${name} (${food.id}): ${res.error}`);
    continue;
  }
  changed++;
  console.log(`${name} (${food.id}): ${fields.map((f) => `${f} ${fill[f]}`).join(', ')}`);
}

console.log(changed ? `Changed ${changed} foods.` : 'Changed nothing: no starter food has a blank value it can fill.');
if (failed) console.log(`${failed} could not be changed; see NOT CHANGED above.`);
if (changed) console.log(`Undo it all with forage_undo, call ${callId}.`);
