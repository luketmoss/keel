#!/usr/bin/env node
/**
 * migrate-703-create-tabs.mjs - One-time Sheet migration for issue #703.
 *
 * Creates Forage's 11 tabs in a new Sheet by calling the deployed API's
 * key-only `ensureSchema` action: each missing tab gets its header row from
 * `apps-script/src/types.js`, frozen, and Config gets `schema_version` = 1.
 *
 * Additive only: a tab that already exists is never touched, so a second run
 * changes nothing and says so.
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

const { created, existing, schema_version: version } = body.data;
console.log(created.length ? `Created: ${created.join(', ')}` : 'Created nothing: every tab already exists.');
if (existing.length) console.log(`Left untouched: ${existing.join(', ')}`);
console.log(`schema_version: ${version ?? '(none)'}`);
