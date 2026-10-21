/**
 * migrate-562-daily-summary-coffee.mjs — One-time sheet migration for #562.
 *
 * Appends column AB, `coffee_cups`, to the `DailySummary` tab: the day's
 * coffee in cups, rolled up from `Drinks` rows of kind `coffee` (#558).
 *
 * Appended after `alcohol_drinks` (AA): almanac (luketmoss/keel), the API and
 * the MCP Worker read this tab by column, and no letter A:AA may move.
 *
 * Additive only: it may widen the grid by one column and writes one header
 * cell, AB1. It never touches A1:AA1 or any data row; AB stays blank on every
 * existing row until the rebuild fills it.
 *
 * Run it **before** deploying the API version that writes 28 columns. That
 * version rewrites a row with `getRange(row, 1, 1, 28).setValues`, which fails
 * on a 27-column grid. The old version keeps writing A:AA and leaves AB
 * blank, so running this while it is live is safe (the `migrate-181` rule).
 *
 * Idempotency: the header is the guard. A tab whose header is already A:AB is
 * left alone. A header other than #522's A:AA, or A:AB, is refused, never
 * rewritten.
 *
 * Usage:
 *   node scripts/migrate-562-daily-summary-coffee.mjs --dry-run
 *   node scripts/migrate-562-daily-summary-coffee.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

export const TAB = 'DailySummary';

/**
 * A:AB. Must stay in step with DAILY_SUMMARY_FIELDS in
 * apps-script/src/types.js; apps-script/tests/daily-summary.test.ts holds the
 * two lists together.
 */
export const HEADERS = [
  'date',                  // A
  'activity_count',        // B
  'activity_types',        // C
  'total_moving_s',        // D
  'total_elapsed_s',       // E
  'total_distance_m',      // F  outdoor only
  'total_ascent_m',        // G  outdoor only
  'cardio_activity_count', // H
  'distance_withdata',     // I
  'ascent_withdata',       // J
  'max_effort',            // K
  'effort_counts',         // L
  'steps',                 // M  from DailyHealth
  'resting_hr',            // N
  'hrv',                   // O
  'sleep_total_s',         // P
  'training_load',         // Q
  'computed_at',           // R
  'moving_withdata',       // S  #181
  'elapsed_withdata',      // T  #181
  'weight_kg',             // U  #203
  'fat_ratio_pct',         // V  #203
  'systolic_mmhg',         // W  #203
  'diastolic_mmhg',        // X  #203
  'bp_count',              // Y  #203
  'water_ml',              // Z  #522
  'alcohol_drinks',        // AA #522
  'coffee_cups',           // AB #562
];
export const BEFORE = HEADERS.slice(0, 27);
const ADDED = HEADERS.slice(27);

/**
 * The migration itself, over `api(path, init)` — a Sheets REST call relative
 * to the spreadsheet, answering the parsed body. Separate from the service
 * account so a test can drive it with a fake.
 *
 * @returns {Promise<number>} the exit code
 */
export async function migrate({ api, dryRun = false, log = console.log, error = console.error }) {
  const values = async (range) =>
    (await api(`/values/${encodeURIComponent(range)}`)).values ?? [];

  const meta = await api('?fields=sheets.properties');
  const tab = meta.sheets.find((s) => s.properties.title === TAB);
  if (!tab) {
    error(`REFUSING: there is no "${TAB}" tab. Run scripts/migrate-131-daily-summary-tab.mjs first.`);
    return 1;
  }

  const same = (a, b) => a.length === b.length && a.every((h, i) => h === b[i]);
  const header = (await values(`${TAB}!1:1`))[0] ?? [];

  if (same(header, HEADERS)) {
    log(`skip   "${TAB}" already has the A1:AB1 header`);
    log('\nNothing to do — migration already applied.');
    return 0;
  }
  if (!same(header, BEFORE)) {
    error(
      `REFUSING: "${TAB}"'s header is not #522's A:AA.\n` +
      `  found:    ${header.join(', ') || '(empty)'}\n` +
      `  expected: ${BEFORE.join(', ')}\n` +
      'Inspect it by hand. This script will not rewrite a header it does not recognize.'
    );
    return 1;
  }

  const columns = tab.properties.gridProperties?.columnCount ?? 0;
  const add = Math.max(0, HEADERS.length - columns);
  log(`grid   ${columns} columns`);
  if (add) log(`plan   add ${add} column(s) to the grid (${columns} -> ${HEADERS.length})`);
  log(`plan   write AB1: ${ADDED.join(', ')}`);

  if (dryRun) {
    log('\n--dry-run: nothing written.');
    return 0;
  }

  if (add) {
    await api(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          appendDimension: { sheetId: tab.properties.sheetId, dimension: 'COLUMNS', length: add },
        }],
      }),
    });
    log(`wrote  ${add} column(s)`);
  }

  await api(`/values/${encodeURIComponent(`${TAB}!AB1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [ADDED] }),
  });
  log('wrote  AB1');

  const after = (await values(`${TAB}!1:1`))[0] ?? [];
  log(`\n"${TAB}" header is now ${after.length} columns:\n  ${after.join(', ')}`);
  log(
    '\nAB is blank on every existing row until the rebuild. Deploy the API, then run:\n' +
    '  THRIVE_API_URL=... THRIVE_API_KEY=... node scripts/backfill-131-daily-summary.mjs --restart'
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
