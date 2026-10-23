/**
 * migrate-576-rest-times.mjs — One-time sheet migration for #576.
 *
 * Appends the rest columns:
 *   Templates  I:J  rest_s, switch_s                 (a section's rest, blank = default)
 *   Sets       K:M  rest_target_s, set_s, rest_s     (the planned rest, and #577's actuals)
 *
 * Each tab's new headers go after its last used column: the last one holding a
 * header or any value in any row. #100 deleted Sets!K "Notes" and Templates!I/J
 * outright, so those are I and K, which is where the API (apps-script/src/
 * types.js), the app (frontend/src/api/) and the MCP Worker read them. If the
 * live sheet says otherwise (an old value left in Sets!K, say), the columns
 * would land somewhere those mirrors do not read, so the script refuses and
 * writes nothing rather than put headers on top of old contents or out of step
 * with the code.
 *
 * Additive only: it may widen a grid, and writes header cells I1:J1 and K1:M1.
 * It never touches another cell. Every existing row reads back with blank rest.
 *
 * Run it **before** deploying the API version that reads and writes these
 * columns, and before merging the app that does: old code writes A:H and A:J
 * and leaves the new columns blank, so running this while it is live is safe.
 *
 * Idempotency: the headers are the guard. A tab that already has them is left
 * alone; a second run writes nothing and says so. Both tabs are checked before
 * either is written, so a refusal writes nothing at all.
 *
 * Usage:
 *   node scripts/migrate-576-rest-times.mjs --dry-run
 *   node scripts/migrate-576-rest-times.mjs
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPREADSHEET_ID =
  process.env.THRIVE_SPREADSHEET_ID || '1YvFnJsY9KlKmbRZ4CrFc67pFwGgjUpHc_LgMVQm2zeQ';

/**
 * The columns each tab gains and the 0-based index the code reads them at.
 * Must stay in step with TEMPLATE_FIELDS and SET_FIELDS in
 * apps-script/src/types.js; apps-script/tests/rest-times-migration.test.ts
 * holds them together.
 */
export const PLAN = [
  { tab: 'Templates', at: 8, headers: ['rest_s', 'switch_s'] },
  { tab: 'Sets', at: 10, headers: ['rest_target_s', 'set_s', 'rest_s'] },
];

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function col(i) {
  let n = i + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The index of the first column after the last one with any value, in any row. */
function firstFree(rows) {
  let free = 0;
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] !== undefined && row[i] !== null && String(row[i]) !== '') {
        free = Math.max(free, i + 1);
        break;
      }
    }
  }
  return free;
}

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
  const work = [];
  let refused = false;

  for (const step of PLAN) {
    const tab = meta.sheets.find((s) => s.properties.title === step.tab);
    if (!tab) {
      error(`REFUSING: there is no "${step.tab}" tab.`);
      refused = true;
      continue;
    }
    const rows = await values(step.tab);
    const header = rows[0] ?? [];
    const end = step.at + step.headers.length;
    const range = `${col(step.at)}1:${col(end - 1)}1`;

    const already = step.headers.every((h, i) => header[step.at + i] === h);
    if (already && firstFree(rows) <= end) {
      log(`skip   ${step.tab}!${range} already holds ${step.headers.join(', ')}`);
      continue;
    }

    const free = firstFree(rows);
    if (free !== step.at) {
      const lastUsed = free === 0 ? '(none)' : col(free - 1);
      error(
        `REFUSING: ${step.tab}'s last used column is ${lastUsed}, so the new columns would land at ` +
        `${col(free)}, but the API, the app and the MCP Worker read them at ${col(step.at)}.\n` +
        `  Inspect ${step.tab}!${col(step.at)}:${col(Math.max(free, end))} by hand. If something there is ` +
        'old data, the mirrors (apps-script/src/types.js, frontend/src/api/, mcp/src/thrive/) must move ' +
        'with the columns before this runs; this script will not write on top of it.'
      );
      refused = true;
      continue;
    }

    const columns = tab.properties.gridProperties?.columnCount ?? 0;
    work.push({ ...step, range, sheetId: tab.properties.sheetId, add: Math.max(0, end - columns), columns });
  }

  if (refused) {
    error('\nNothing written.');
    return 1;
  }
  if (work.length === 0) {
    log('\nNothing to do — migration already applied.');
    return 0;
  }

  for (const w of work) {
    if (w.add) log(`plan   add ${w.add} column(s) to ${w.tab}'s grid (${w.columns} -> ${w.columns + w.add})`);
    log(`plan   write ${w.tab}!${w.range}: ${w.headers.join(', ')}`);
  }

  if (dryRun) {
    log('\n--dry-run: nothing written.');
    return 0;
  }

  for (const w of work) {
    if (w.add) {
      await api(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ appendDimension: { sheetId: w.sheetId, dimension: 'COLUMNS', length: w.add } }],
        }),
      });
      log(`wrote  ${w.add} column(s) to ${w.tab}`);
    }
    await api(`/values/${encodeURIComponent(`${w.tab}!${w.range}`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [w.headers] }),
    });
    log(`wrote  ${w.tab}!${w.range}`);
  }

  log('\nEvery existing row reads back with blank rest. Deploy the API next, then merge the app.');
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
