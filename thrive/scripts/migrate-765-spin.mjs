#!/usr/bin/env node
/**
 * migrate-765-spin.mjs - One-time sheet migration for issue #765 (Thrive Spin).
 *
 * Does three things, each skipped when it is already applied:
 *
 *   1. Appends nine columns to `Workouts`, AE:AM (A:AD becomes A:AM): the indoor
 *      ride's power, load, FTP, intensity setting, the Spin workout it rode or a
 *      plan names, and its streams file. Each header is its field name.
 *   2. Creates the `RideWorkouts` tab (A1:H1): Spin's workout library.
 *   3. Creates the `FtpHistory` tab (A1:F1): one row per FTP setting.
 *
 * Additive only: it may widen the Workouts grid to 39 columns and writes the header
 * cells AE1:AM1; it creates two tabs and their header rows; it never touches A1:AD1
 * or any data row. AE:AM stay blank on every existing row, which is what blank means
 * here: not a Spin ride, or nobody said.
 *
 * Run it **before** merging #765 and before deploying the API version that reads 39
 * columns: the SPA then reads A:AM and fails on a 30-column grid ("exceeds grid
 * limits"). The API and SPA live today address A:AD only, so running it while they are
 * live is safe.
 *
 * Idempotency: the headers are the guard. A Workouts header already A:AM, and tabs that
 * exist with the expected header, are left alone. Anything else is refused, naming what
 * it was, and **nothing** is written: every check runs before the first write. This
 * script never rewrites a header it does not recognize.
 *
 * Usage:
 *   node scripts/migrate-765-spin.mjs --dry-run
 *   node scripts/migrate-765-spin.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

export const TAB = 'Workouts';
export const RIDE_WORKOUTS_TAB = 'RideWorkouts';
export const FTP_HISTORY_TAB = 'FtpHistory';

/**
 * A:AM. Must stay in step with WORKOUT_FIELDS in apps-script/src/types.js;
 * apps-script/tests/spin-migration.test.ts holds the two lists together.
 */
export const HEADERS = [
  'id', 'Date', 'Time', 'Type', 'Name', 'template_id', 'Notes', 'Elapsed (s)',
  'Created', 'copied_from', 'status',
  'Moving (s)', 'Effort', 'Distance (m)', 'Ascent (m)', 'Descent (m)', 'Avg HR (bpm)',
  'sub_type', 'source', 'source_activity_id', 'raw_ref', 'fit_ref', 'fit_fetched_at',
  'synced_at', 'started_at_utc', 'calories',
  'estimated_seconds', // AA  #145
  'sport_type',        // AB  #260
  'track_ref',         // AC  #432
  'trails',            // AD  #688
  'avg_power_w',       // AE  #765  whole W
  'np_w',              // AF        normalized power, whole W
  'intensity_factor',  // AG        NP / FTP, text with 2 decimals
  'tss',               // AH        whole number
  'work_kj',           // AI        whole kJ
  'ftp_w',             // AJ        the FTP the ride was ridden at, whole W
  'intensity_pct',     // AK        the ride's intensity setting, whole %
  'ride_workout_id',   // AL        a RideWorkouts id: the workout ridden, or a plan's link
  'streams_ref',       // AM        Drive file ID of the ride's streams JSON
];
export const BEFORE = HEADERS.slice(0, 30);
const ADDED = HEADERS.slice(30);

/** RideWorkouts A:H. Must match RIDE_WORKOUT_FIELDS in types.js. */
export const RIDE_WORKOUT_HEADERS = [
  'id', 'name', 'category', 'description', 'steps', 'duration_s', 'created', 'updated',
];

/** FtpHistory A:F. Must match FTP_HISTORY_FIELDS in types.js. */
export const FTP_HISTORY_HEADERS = ['id', 'date', 'ftp_w', 'source', 'ride_id', 'created'];

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
  const lastCol = (n) => String.fromCharCode(64 + n); // A..Z: every tab here is under 26 wide

  const meta = await api('?fields=sheets.properties');
  const find = (title) => meta.sheets.find((s) => s.properties.title === title);

  // --- Check everything first; a refusal writes nothing. ---
  const workouts = find(TAB);
  if (!workouts) {
    error(`REFUSING: there is no "${TAB}" tab.`);
    return 1;
  }
  const header = (await values(`${TAB}!1:1`))[0] ?? [];
  const columns = workouts.properties.gridProperties?.columnCount ?? 0;
  log(`"${TAB}" header is ${header.length} columns, grid is ${columns} wide.`);

  let refused = false;
  const widenWorkouts = !same(header, HEADERS);
  if (!same(header, BEFORE) && !same(header, HEADERS)) {
    error(
      `REFUSING: "${TAB}"'s header is not #688's A:AD (or A:AM ending "${ADDED[ADDED.length - 1]}").\n` +
      `  found:    ${header.join(', ') || '(empty)'}\n` +
      `  expected: ${BEFORE.join(', ')}\n` +
      'Inspect it by hand. This script will not rewrite a header it does not recognize.'
    );
    refused = true;
  }

  const tabs = [
    { title: RIDE_WORKOUTS_TAB, headers: RIDE_WORKOUT_HEADERS },
    { title: FTP_HISTORY_TAB, headers: FTP_HISTORY_HEADERS },
  ];
  for (const tab of tabs) {
    tab.exists = !!find(tab.title);
    if (!tab.exists) continue;
    const found = (await values(`${tab.title}!1:1`))[0] ?? [];
    if (same(found, tab.headers)) {
      tab.done = true;
    } else {
      error(
        `REFUSING: "${tab.title}" exists but its header is not the expected one.\n` +
        `  found:    ${found.join(', ') || '(empty)'}\n` +
        `  expected: ${tab.headers.join(', ')}\n` +
        'Inspect it by hand. This script will not rewrite a tab it did not create.'
      );
      refused = true;
    }
  }
  if (refused) return 1;

  if (!widenWorkouts && tabs.every((t) => t.done)) {
    log(`skip   AE1:AM1 already end "${ADDED[ADDED.length - 1]}"`);
    for (const tab of tabs) log(`skip   "${tab.title}" already exists with the expected header`);
    log('\nNothing to do - migration already applied.');
    return 0;
  }

  // --- Plan ---
  const lastRow = (await values(`${TAB}!A:A`)).length;
  const add = widenWorkouts ? Math.max(0, HEADERS.length - columns) : 0;
  if (!widenWorkouts) log(`skip   AE1:AM1 already end "${ADDED[ADDED.length - 1]}"`);
  if (add) log(`plan   add ${add} column(s) to the grid (${columns} -> ${HEADERS.length})`);
  if (widenWorkouts) {
    log(`plan   write AE1:AM1: ${ADDED.join(', ')}`);
    log(`       ${Math.max(0, lastRow - 1)} existing rows keep a blank AE:AM: not a Spin ride`);
  }
  for (const tab of tabs) {
    if (tab.done) log(`skip   "${tab.title}" already exists with the expected header`);
    else {
      log(`plan   create tab "${tab.title}"`);
      log(`plan   write A1:${lastCol(tab.headers.length)}1: ${tab.headers.join(', ')}`);
    }
  }

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
  if (widenWorkouts) {
    await api(`/values/${encodeURIComponent(`${TAB}!AE1:AM1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [ADDED] }),
    });
    log('wrote  AE1:AM1');
  }
  for (const tab of tabs) {
    if (tab.done) continue;
    await api(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: tab.title,
              gridProperties: { rowCount: 1000, columnCount: tab.headers.length, frozenRowCount: 1 },
            },
          },
        }],
      }),
    });
    log(`wrote  tab "${tab.title}"`);
    await api(`/values/${encodeURIComponent(`${tab.title}!A1:${lastCol(tab.headers.length)}1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [tab.headers] }),
    });
    log(`wrote  headers A1:${lastCol(tab.headers.length)}1`);
  }

  const after = (await values(`${TAB}!1:1`))[0] ?? [];
  const metaAfter = await api('?fields=sheets.properties');
  const colsAfter = metaAfter.sheets.find((s) => s.properties.title === TAB)
    .properties.gridProperties?.columnCount;
  log(`\n"${TAB}" header is now ${after.length} columns (grid ${colsAfter} wide); AE1..AM1 = ${after.slice(30).join(', ')}`);
  log(
    '\nAE:AM are blank on every existing row, and RideWorkouts and FtpHistory are empty. Next: set\n' +
    'SPIN_API_KEY in Script Properties, clasp push and a new version of the web-app deployment,\n' +
    'then merge #765.'
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
