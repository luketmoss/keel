#!/usr/bin/env node
/**
 * migrate-519-drinks-tab.mjs - One-time sheet migration for issue #519.
 *
 * Creates the `Drinks` tab and writes its A1:I1 header row: one row per drink
 * (Thrive Sip, #518), written by the Apps Script API alone through logDrink and
 * its siblings (apps-script/src/drinks.js). Nothing else appends to it.
 *
 * Additive only: it creates one tab and one header row, and never touches
 * another tab or any existing row.
 *
 * Idempotency: the tab's existence is the guard. A second run finds it with the
 * expected header and exits without writing. A tab with any other header is
 * refused, never rewritten: this script does not own rows it did not create.
 *
 * Usage:
 *   node scripts/migrate-519-drinks-tab.mjs --dry-run
 *   node scripts/migrate-519-drinks-tab.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

export const TAB = 'Drinks';

/**
 * A:I. Must stay in step with DRINK_FIELDS in apps-script/src/types.js and
 * DRINK_FIELDS in frontend/src/api/drinks.ts.
 */
export const HEADERS = [
  'id',            // A  a UUID the caller generates; logging it twice leaves one row
  'kind',          // B  water | alcohol
  'amount',        // C  water in whole ml, alcohol in standard drinks; never blank or 0
  'date',          // D  local America/Denver YYYY-MM-DD
  'time',          // E  local America/Denver HH:MM:SS
  'logged_at_utc', // F  ISO 8601 UTC, when the caller says it was taken; never rewritten
  'source',        // G  widget | app
  'created',       // H  ISO 8601, server clock
  'updated',       // I  ISO 8601, server clock
];

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
  const existing = meta.sheets.find((s) => s.properties.title === TAB);

  log(`Tabs: ${meta.sheets.map((s) => s.properties.title).join(', ')}\n`);

  if (existing) {
    const header = (await values(`${TAB}!1:1`))[0] ?? [];
    const matches =
      header.length === HEADERS.length && HEADERS.every((h, i) => header[i] === h);

    if (matches) {
      log(`skip   "${TAB}" already exists with the expected A1:I1 header`);
      log('\nNothing to do — migration already applied.');
      return 0;
    }

    error(
      `REFUSING: "${TAB}" exists but its header is not the expected one.\n` +
      `  found:    ${header.join(', ') || '(empty)'}\n` +
      `  expected: ${HEADERS.join(', ')}\n` +
      'Inspect it by hand. This script will not rewrite a tab it did not create.'
    );
    return 1;
  }

  log(`plan   create tab "${TAB}"`);
  log(`plan   write A1:I1: ${HEADERS.join(', ')}`);

  if (dryRun) {
    log('\n--dry-run: nothing written.');
    return 0;
  }

  await api(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [{
        addSheet: {
          properties: {
            title: TAB,
            gridProperties: { rowCount: 1000, columnCount: HEADERS.length, frozenRowCount: 1 },
          },
        },
      }],
    }),
  });
  log(`wrote  tab "${TAB}"`);

  await api(`/values/${encodeURIComponent(`${TAB}!A1:I1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADERS] }),
  });
  log('wrote  headers A1:I1');

  const after = (await values(`${TAB}!1:1`))[0] ?? [];
  log(`\n"${TAB}" header is now ${after.length} columns:\n  ${after.join(', ')}`);
  log('\nThe tab is empty. The API appends drinks to it.');
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
