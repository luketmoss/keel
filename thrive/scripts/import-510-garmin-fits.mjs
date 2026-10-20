/**
 * import-510-garmin-fits.mjs — One-time, re-runnable import of the Garmin
 * export's activity FIT files, so `garmin_import` rows can get a Route map
 * (#510). It follows import-159, which brought in the JSON summaries only.
 *
 * Reads the export's FIT zips (`--export <folder of zips, or one zip>`, the
 * `DI_CONNECT/DI-Connect-Uploaded-Files` folder) without extracting them.
 * The FIT file names are upload ids, NOT activity ids, so a FIT is matched to
 * its row by START TIME: the FIT's session start equals the row's
 * `started_at_utc` exactly, or is the single nearest within 120 s (and no
 * other FIT claims that row). Zero or several candidates: nothing is
 * attached, and the FIT is listed.
 *
 * Only `activity` FITs that hold at least two valid positions are stored (the
 * export's ~28,000 wellness files, and indoor sessions, have no map). Each is
 * archived in the bot account's Drive (`Thrive Garmin/fit/<YYYY>/<MM>/`), then
 * the row gets `{ fit_ref, fit_fetched_at }` through `updateWorkout`, which
 * changes only the keys it is sent. No schema change.
 *
 * Idempotent: a row that already has a `fit_ref` is skipped; a FIT already in
 * Drive for the activity (a run that stopped between the upload and the
 * sheet write) is reused, not uploaded twice. `--max-rows` caps rows written
 * per run (default 100); re-run until it says nothing is left.
 *
 * Then run `backfill-421-workouts-track.mjs`, which builds the tracks. No
 * coordinate is ever printed.
 *
 * Credentials are the sync's: the bot account's Drive credential
 * (sync/.google-credentials.json, or GOOGLE_* env) and THRIVE_API_URL /
 * THRIVE_API_KEY. `updateWorkout` does not take the script lock, so run it
 * outside a scheduled sync run.
 *
 * Usage:
 *   node scripts/import-510-garmin-fits.mjs --export <folder|zip> --dry-run
 *   node scripts/import-510-garmin-fits.mjs --export <folder|zip> --max-rows 5
 *   node scripts/import-510-garmin-fits.mjs --export <folder|zip>
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { inspectFit, MIN_POSITIONS } from '../sync/src/garmin-fit.mjs';
import { listZip, readEntry } from '../sync/src/zip-read.mjs';

export const DEFAULTS = { maxRows: 100, pauseMs: 300, nearS: 120 };

const text = (v) => String(v ?? '').trim();
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 200);
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const bump = (o, k) => { o[k] = (o[k] ?? 0) + 1; };

/** The zips under `path` (a zip, or a folder holding zips), in name order. */
export function zipPaths(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).filter((n) => /\.zip$/i.test(n)).sort().map((n) => join(path, n));
}

/**
 * Every `.fit` entry across the zips, once per entry name (the export's parts
 * overlap), as `{ name, zip, entry }`.
 */
export function listFits(paths) {
  const seen = new Set();
  const fits = [];
  for (const zip of paths) {
    for (const entry of listZip(zip).entries) {
      if (!/\.fit$/i.test(entry.name) || seen.has(entry.name)) continue;
      seen.add(entry.name);
      fits.push({ name: entry.name, zip, entry });
    }
  }
  return fits;
}

/** A garmin_import row's start, in whole epoch seconds, or null. */
const rowStartS = (row) => {
  const ms = Date.parse(text(row.started_at_utc));
  return Number.isFinite(ms) ? Math.round(ms / 1000) : null;
};

/**
 * Which row each GPS activity FIT belongs to. Pure: no I/O.
 *
 * @param {{ name: string, startMs: number }[]} fits  activity FITs with positions
 * @param {object[]} rows  the Workouts rows
 * @returns {{ matched: { fit: object, row: object }[], ambiguous: object[], unmatched: object[],
 *   linked: { fit: object, row: object }[] }}
 *   `linked` are FITs whose row already has a `fit_ref`; `ambiguous` are FITs
 *   with several candidate rows, or whose row another FIT claims too.
 */
export function matchFits(fits, rows, nearS = DEFAULTS.nearS) {
  const garmin = rows
    .filter((r) => text(r.source) === 'garmin_import' && text(r.source_activity_id) !== '')
    .map((row) => ({ row, s: rowStartS(row) }))
    .filter((r) => r.s !== null);

  const claims = fits.map((fit) => {
    const s = Math.round(fit.startMs / 1000);
    const exact = garmin.filter((g) => g.s === s);
    const rowsFor = exact.length ? exact : garmin.filter((g) => Math.abs(g.s - s) <= nearS);
    return { fit, rows: rowsFor.map((g) => g.row) };
  });

  const claimedBy = new Map();
  for (const c of claims) for (const r of c.rows) claimedBy.set(r, (claimedBy.get(r) ?? 0) + 1);

  const out = { matched: [], ambiguous: [], unmatched: [], linked: [] };
  for (const { fit, rows: candidates } of claims) {
    if (candidates.length === 0) out.unmatched.push(fit);
    else if (candidates.length > 1 || claimedBy.get(candidates[0]) > 1) out.ambiguous.push(fit);
    else if (text(candidates[0].fit_ref) !== '') out.linked.push({ fit, row: candidates[0] });
    else out.matched.push({ fit, row: candidates[0] });
  }
  return out;
}

/**
 * Reads every FIT, keeping `activity` FITs with positions.
 *
 * @returns {{ gps: { name: string, startMs: number, zip: string, entry: object, size: number }[],
 *   counts: Record<string, number> }}
 */
export function scanFits(fits, { read = readEntry, log = () => {} } = {}) {
  const counts = { total: fits.length, notActivity: 0, activityNoGps: 0, unreadable: 0, gps: 0 };
  const gps = [];
  fits.forEach((f, i) => {
    if (i > 0 && i % 5000 === 0) log(`  scanned ${i} of ${fits.length}`);
    let info;
    try {
      info = inspectFit(read(f.zip, f.entry));
    } catch {
      counts.unreadable += 1; // a damaged zip entry
      return;
    }
    if (info.kind === 'unreadable') counts.unreadable += 1;
    else if (info.kind === 'other') counts.notActivity += 1;
    else if (info.positions < MIN_POSITIONS) counts.activityNoGps += 1;
    else {
      counts.gps += 1;
      gps.push({ name: f.name, startMs: info.startMs, zip: f.zip, entry: f.entry, size: f.entry.size });
    }
  });
  return { gps, counts };
}

/** @returns {Promise<number>} the exit code */
export async function importFits({
  api, archive, paths, dryRun = false, maxRows = DEFAULTS.maxRows, pauseMs = DEFAULTS.pauseMs,
  read = readEntry, now = () => new Date().toISOString(), wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log, error = console.error,
}) {
  const rows = await api.get('getWorkouts', {});
  const garminRows = rows.filter((r) => text(r.source) === 'garmin_import');
  log(`Workouts: ${rows.length} row(s), ${garminRows.length} Garmin-imported`);
  if (rows.length && !rows.every((r) => Object.prototype.hasOwnProperty.call(r, 'fit_ref'))) {
    error('REFUSING: getWorkouts does not return fit_ref, so the deployed API predates #154.');
    return 1;
  }

  const fits = listFits(paths);
  log(`FIT files in ${paths.length} zip(s): ${fits.length}`);
  const { gps, counts } = scanFits(fits, { read, log });
  log(`  not activities (wellness, monitoring): ${counts.notActivity}`);
  log(`  activities with no usable positions (indoor, strength): ${counts.activityNoGps}`);
  log(`  unreadable: ${counts.unreadable}`);
  log(`  activities with positions: ${counts.gps}`);

  const m = matchFits(gps, rows);
  const todo = m.matched;
  const bytes = todo.reduce((n, t) => n + t.fit.size, 0);
  log(`already linked (row has a fit_ref): ${m.linked.length}`);
  log(`matched by start time, to attach: ${todo.length} (${mb(bytes)})`);
  log(`ambiguous, attached to nothing: ${m.ambiguous.length}`);
  log(`no row at that start time, attached to nothing: ${m.unmatched.length}`);
  for (const f of m.ambiguous) log(`  ambiguous  ${f.name}  start ${new Date(f.startMs).toISOString()}`);
  for (const f of m.unmatched) log(`  unmatched  ${f.name}  start ${new Date(f.startMs).toISOString()}`);

  if (!todo.length) { log('\nNothing to write.'); return 0; }
  if (dryRun) { log('\n--dry-run: nothing written.'); return 0; }

  const fetchedAt = now();
  let written = 0;
  let reused = 0;
  let uploaded = 0;
  let uploadedBytes = 0;
  for (const { fit, row } of todo) {
    if (written >= maxRows) break;
    const activityId = text(row.source_activity_id);
    try {
      if (written > 0 && pauseMs > 0) await wait(pauseMs);
      let fitRef;
      const existing = await archive.findFit(activityId);
      if (existing) {
        fitRef = existing.id;
        reused += 1;
      } else {
        fitRef = await archive.storeFit({ activityId, localDate: text(row.date), bytes: read(fit.zip, fit.entry) });
        uploaded += 1;
        uploadedBytes += fit.size;
      }
      await api.write('updateWorkout', { id: text(row.id), changes: { fit_ref: fitRef, fit_fetched_at: fetchedAt } });
    } catch (err) {
      error(`FAILED activity ${activityId} (${text(row.date)}): ${oneLine(err.message || err)}`);
      error(`${written} row(s) were written before it. Re-run to continue: linked rows are skipped.`);
      return 1;
    }
    written += 1;
  }
  const left = todo.length - written;
  log(`\nlinked ${written} row(s): uploaded ${uploaded} FIT(s), ${mb(uploadedBytes)}; reused ${reused} already in Drive.`);
  if (left > 0) log(`${left} left: re-run to continue.`);
  else log('Next: node scripts/backfill-421-workouts-track.mjs --dry-run, then without it.');
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const val = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
  const num = (flag, fallback) => {
    const v = val(flag);
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < (flag === '--pause-ms' ? 0 : 1)) {
      console.error(`REFUSING: ${flag} must be a whole number, got "${v}".`);
      process.exit(1);
    }
    return n;
  };
  const dir = val('--export');
  if (!dir) {
    console.error('REFUSING: --export <folder of Garmin export zips, or one zip> is required.');
    process.exit(1);
  }

  const { createThriveApi, loadThriveApiConfig } = await import('../sync/src/thrive-api.mjs');
  const { createDrive } = await import('../sync/src/drive.mjs');
  const { googleTokenProvider, loadGoogleCredentials } = await import('../sync/src/google.mjs');
  const { createGarminArchive } = await import('../sync/src/garmin-archive.mjs');
  const { redact } = await import('../sync/src/redact.mjs');
  try {
    const dryRun = args.includes('--dry-run');
    const paths = zipPaths(dir);
    if (!paths.length) throw new Error('no .zip file found under --export');
    const archive = dryRun
      ? null
      : createGarminArchive(createDrive({ getToken: googleTokenProvider(loadGoogleCredentials(process.env)) }));
    process.exitCode = await importFits({
      api: createThriveApi(loadThriveApiConfig()), archive, paths, dryRun,
      maxRows: num('--max-rows', DEFAULTS.maxRows), pauseMs: num('--pause-ms', DEFAULTS.pauseMs),
    });
  } catch (err) {
    console.error(`${err.name ?? 'Error'}: ${redact(err.message || String(err))}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
