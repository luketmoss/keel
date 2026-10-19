/**
 * migrate-421-workouts-track-ref.mjs — One-time sheet migration for #432.
 *
 * Appends column AC, `track_ref`, to the `Workouts` tab: the Drive file ID of
 * an outdoor activity's simplified GPS track, which the sync builds from its
 * FIT and the API's `getWorkoutTrack` serves to the app. Nullable: blank means
 * no map, whatever the reason.
 *
 * Additive only: it may widen the grid to 29 columns and writes one header
 * cell, AC1. It never touches A1:AB1 or any data row; AC stays blank on every
 * existing row until the sync or `backfill-421-workouts-track.mjs` fills it.
 *
 * Run it **before** deploying the API version that reads and writes 29
 * columns, and before merging the SPA that reads A:AC: both address AC, and
 * both fail on a 28-column grid ("exceeds grid limits"). The API and SPA live
 * today address A:AB only, so running this while they are live is safe.
 *
 * Idempotency: the header is the guard. A tab whose header is already A:AC
 * ending `track_ref` is left alone. A header other than #260's A:AB, or A:AC,
 * is refused, naming what it found, never rewritten.
 *
 * Usage:
 *   node scripts/migrate-421-workouts-track-ref.mjs --dry-run
 *   node scripts/migrate-421-workouts-track-ref.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

export const TAB = 'Workouts';

/**
 * A:AC. Must stay in step with WORKOUT_FIELDS in apps-script/src/types.js;
 * apps-script/tests/track-ref-migration.test.ts holds the two lists together.
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
];
export const BEFORE = HEADERS.slice(0, 28);
const ADDED = HEADERS.slice(28);

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
    error(`REFUSING: there is no "${TAB}" tab.`);
    return 1;
  }

  const same = (a, b) => a.length === b.length && a.every((h, i) => h === b[i]);
  const header = (await values(`${TAB}!1:1`))[0] ?? [];
  const columns = tab.properties.gridProperties?.columnCount ?? 0;
  log(`"${TAB}" header is ${header.length} columns, grid is ${columns} wide.`);

  if (same(header, HEADERS) && columns >= HEADERS.length) {
    log(`skip   AC1 is already "${ADDED[0]}"`);
    log('\nNothing to do — migration already applied.');
    return 0;
  }
  if (!same(header, BEFORE) && !same(header, HEADERS)) {
    error(
      `REFUSING: "${TAB}"'s header is not #260's A:AB (or A:AC ending "${ADDED[0]}").\n` +
      `  found:    ${header.join(', ') || '(empty)'}\n` +
      `  expected: ${BEFORE.join(', ')}\n` +
      'Inspect it by hand. This script will not rewrite a header it does not recognize.'
    );
    return 1;
  }

  const lastRow = (await values(`${TAB}!A:A`)).length;
  const add = Math.max(0, HEADERS.length - columns);
  if (add) log(`plan   add ${add} column(s) to the grid (${columns} -> ${HEADERS.length})`);
  if (!same(header, HEADERS)) log(`plan   write AC1: ${ADDED.join(', ')}`);
  log(`       ${Math.max(0, lastRow - 1)} existing rows keep a blank AC: no map until the sync or the backfill`);

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

  if (!same(header, HEADERS)) {
    await api(`/values/${encodeURIComponent(`${TAB}!AC1`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [ADDED] }),
    });
    log('wrote  AC1');
  }

  const after = (await values(`${TAB}!1:1`))[0] ?? [];
  const metaAfter = await api('?fields=sheets.properties');
  const colsAfter = metaAfter.sheets.find((s) => s.properties.title === TAB)
    .properties.gridProperties?.columnCount;
  log(`\n"${TAB}" header is now ${after.length} columns (grid ${colsAfter} wide); AB1..AC1 = ${after.slice(27).join(', ')}`);
  log(
    '\nAC is blank on every existing row. Deploy the API, then build the tracks from the FITs already in Drive:\n' +
    '  node scripts/backfill-421-workouts-track.mjs --dry-run'
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
