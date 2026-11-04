#!/usr/bin/env node
/**
 * migrate-773-coros-link.mjs - One-time sheet migration for issue #773 (COROS enriches Spin rides).
 *
 * Appends one column to `Workouts`: AN, `coros_activity_id`, the COROS activity linked to a
 * Thrive Spin ride (digits as text, blank when none is linked, never 0). A:AM becomes A:AN.
 *
 * Additive only: it may widen the Workouts grid to 40 columns and writes the one header cell
 * AN1; it never touches A1:AM1 or any data row. AN stays blank on every existing row, which is
 * what blank means here: no COROS activity is linked.
 *
 * Run it **before** merging #773: the SPA then reads and writes A:AN and fails on a 39-column
 * grid ("exceeds grid limits"). The API and SPA live today address A:AM only, so running it
 * while they are live is safe.
 *
 * Idempotency: the header is the guard. A Workouts header already A:AN is left alone. A header
 * that is neither #765's A:AM nor A:AN is refused, naming what it was, and **nothing** is
 * written: the check runs before the first write. This script never rewrites a header it does
 * not recognize.
 *
 * Usage:
 *   node scripts/migrate-773-coros-link.mjs --dry-run
 *   node scripts/migrate-773-coros-link.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HEADERS as HEADERS_AM } from './migrate-765-spin.mjs';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

export const TAB = 'Workouts';

/** The column this migration adds. Must match the last entry of WORKOUT_FIELDS in apps-script/src/types.js. */
export const ADDED = 'coros_activity_id';

/**
 * A:AN. Must stay in step with WORKOUT_FIELDS in apps-script/src/types.js;
 * apps-script/tests/coros-link-migration.test.ts holds the two lists together.
 */
export const BEFORE = HEADERS_AM; // A:AM, as #765's migration leaves it
export const HEADERS = [...BEFORE, ADDED];

const same = (a, b) => a.length === b.length && a.every((h, i) => h === b[i]);

/**
 * The migration itself, over `api(path, init)` - a Sheets REST call relative
 * to the spreadsheet, answering the parsed body. Separate from the service
 * account so a test can drive it with a fake.
 *
 * @returns {Promise<number>} the exit code
 */
export async function migrate({ api, dryRun = false, log = console.log, error = console.error }) {
  const values = async (range) =>
    (await api(`/values/${encodeURIComponent(range)}`)).values ?? [];

  const meta = await api('?fields=sheets.properties');
  const workouts = meta.sheets.find((s) => s.properties.title === TAB);

  // --- Check everything first; a refusal writes nothing. ---
  if (!workouts) {
    error(`REFUSING: there is no "${TAB}" tab.`);
    return 1;
  }
  const header = (await values(`${TAB}!1:1`))[0] ?? [];
  const columns = workouts.properties.gridProperties?.columnCount ?? 0;
  log(`"${TAB}" header is ${header.length} columns, grid is ${columns} wide.`);

  if (same(header, HEADERS)) {
    log(`skip   AN1 already holds "${ADDED}"`);
    log('\nNothing to do - migration already applied.');
    return 0;
  }
  if (!same(header, BEFORE)) {
    error(
      `REFUSING: "${TAB}"'s header is not #765's A:AM (ending "${BEFORE[BEFORE.length - 1]}") or A:AN (ending "${ADDED}").\n` +
      `  found:    ${header.join(', ') || '(empty)'}\n` +
      `  expected: ${BEFORE.join(', ')}\n` +
      'Inspect it by hand. This script will not rewrite a header it does not recognize.'
    );
    return 1;
  }

  // --- Plan ---
  const lastRow = (await values(`${TAB}!A:A`)).length;
  const add = Math.max(0, HEADERS.length - columns);
  if (add) log(`plan   add ${add} column(s) to the grid (${columns} -> ${HEADERS.length})`);
  log(`plan   write AN1: ${ADDED}`);
  log(`       ${Math.max(0, lastRow - 1)} existing rows keep a blank AN: no COROS activity is linked`);

  if (dryRun) {
    log('\n--dry-run: nothing written.');
    return 0;
  }

  // --- Write ---
  if (add) {
    await api(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          appendDimension: { sheetId: workouts.properties.sheetId, dimension: 'COLUMNS', length: add },
        }],
      }),
    });
    log(`wrote  ${add} column(s)`);
  }
  await api(`/values/${encodeURIComponent(`${TAB}!AN1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[ADDED]] }),
  });
  log('wrote  AN1');

  const after = (await values(`${TAB}!1:1`))[0] ?? [];
  const metaAfter = await api('?fields=sheets.properties');
  const colsAfter = metaAfter.sheets.find((s) => s.properties.title === TAB)
    .properties.gridProperties?.columnCount;
  log(`\n"${TAB}" header is now ${after.length} columns (grid ${colsAfter} wide); AN1 = ${after[after.length - 1]}`);
  log(
    '\nAN is blank on every existing row. Next: clasp push and a new version of the web-app\n' +
    'deployment, then merge #773 (the sync ships on merge and needs the API first).'
  );
  return 0;
}

async function main() {
  const { JWT } = await import('google-auth-library');
  const creds = JSON.parse(
    readFileSync(new URL('thrive-sa.json', import.meta.url), 'utf8')
  );
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await client.getAccessToken();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

  async function api(path, init) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const body = await res.json();
    if (body.error) throw new Error(`${body.error.status}: ${body.error.message}`);
    return body;
  }

  process.exitCode = await migrate({ api, dryRun: process.argv.includes('--dry-run') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
