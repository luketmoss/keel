#!/usr/bin/env node
/**
 * migrate-703-create-tabs.mjs - One-time Sheet migration for issue #703.
 *
 * Creates Forage's tabs in a new Sheet by calling the deployed API's
 * key-only `ensureSchema` action: each missing tab gets its header row from
 * `apps-script/src/types.js`, frozen, and Config gets `schema_version`.
 *
 * Additive only: no existing cell is changed or moved, so a second run changes
 * nothing and says so. Run it again after a release that adds a tab or
 * columns:
 *   - #713's MCPChangeLog (the 12th) is created on a Sheet at version 1, which
 *     becomes 2, and no other tab changes.
 *   - #755: run it after the release that ships #755. Foods and FoodLog get
 *     the seven nutrient columns appended after `updated`, and the Sheet goes
 *     from version 2 to 3. A tab whose header row is not exactly a prefix of
 *     its columns (one renamed by hand, say) is left alone and named, and the
 *     version stays until it is fixed and this is run again. Then run
 *     backfill-755-starter-nutrition.mjs.
 *
 * Usage (PowerShell; the values are prompted for, never typed into the command):
 *   $env:FORAGE_API_URL = Read-Host 'FORAGE_API_URL'
 *   $key = Read-Host 'FORAGE_API_KEY' -AsSecureString
 *   $env:FORAGE_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
 *   node scripts/migrate-703-create-tabs.mjs
 */

const url = process.env.FORAGE_API_URL;
const key = process.env.FORAGE_API_KEY;
if (!url || !key) {
  console.error('Set FORAGE_API_URL and FORAGE_API_KEY first (see the usage at the top of this file).');
  process.exit(1);
}

// POST, form-encoded: the key stays out of the URL, and fetch follows Apps
// Script's 302 to the answer.
const res = await fetch(url, {
  method: 'POST',
  body: new URLSearchParams({ action: 'ensureSchema', key }),
});
const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  console.error(`The API answered HTTP ${res.status} with something other than JSON. Is FORAGE_API_URL the web-app URL?`);
  process.exit(1);
}
if (!body.success) {
  console.error('ensureSchema refused: ' + body.error);
  process.exit(1);
}

const { created, existing, extended = [], mismatched = [], schema_version: version } = body.data;
console.log(created.length ? `Created: ${created.join(', ')}` : 'Created nothing: every tab already exists.');
for (const e of extended) console.log(`Added columns to ${e.tab}: ${e.added.join(', ')}`);
if (!extended.length) console.log('Added no columns: every existing tab has all of its columns.');
const untouched = existing.filter((t) => !extended.some((e) => e.tab === t) && !mismatched.includes(t));
if (untouched.length) console.log(`Left untouched: ${untouched.join(', ')}`);
for (const t of mismatched) {
  console.log(`NOT CHANGED ${t}: its header row is not the start of its columns in apps-script/src/types.js. Fix it by hand, then run this again.`);
}
console.log(`schema_version: ${version ?? '(none)'}`);
