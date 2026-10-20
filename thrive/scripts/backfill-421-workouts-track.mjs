/**
 * backfill-421-workouts-track.mjs — One-time, re-runnable backfill for #432.
 *
 * Builds the simplified GPS track (and fills `Workouts!AC` `track_ref`) for
 * COROS activities synced before the sync built tracks: every `source = coros`
 * row with a `fit_ref` and a blank `track_ref`. It reads the activity's
 * archive file (`raw_ref`) for its list entry, and the FIT already in Drive
 * (`fit_ref`), then builds, stores and records the track with the sync's own
 * code (sync/src/track-step.mjs), exactly as a run does.
 *
 * **It makes no COROS call**, so the FIT allowance is untouched: every byte
 * it reads is already in the bot's Drive.
 *
 * A single-field patch, never a re-sync:
 *
 * - Each row is written through the API's `updateWorkout` as `{ track_ref }`
 *   alone. That action changes only the keys it is sent, so no other cell
 *   moves, `synced_at` included.
 * - Hand-logged rows are never touched: they have no FIT. `garmin_import` rows
 *   are candidates from #510 on, once the FIT import
 *   (import-510-garmin-fits.mjs) has given them a `fit_ref`. Their archive
 *   file is the Garmin summary, not a COROS list entry, so a Garmin row is
 *   treated as outdoor (the import keeps only FITs with positions) and the
 *   FIT is confirmed by the Garmin archive's tag. Their tracks are stored
 *   beside COROS's, in `Thrive COROS/tracks/`, because the API reads a track
 *   only from there.
 * - The archive file's `activity_id` must equal the row's
 *   `source_activity_id`, and the FIT is confirmed by its `fit_activity_id`
 *   tag to be the one the row names, or the row is left alone and listed.
 * - Capped per run (`--max-rows`, default 20) and paced (`--batch` writes,
 *   default 5, then `--pause-ms`, default 1000). Re-run until it says there is
 *   nothing to do; each run starts from what the sheet holds. A `none` result
 *   (no `Start Coordinates`, fewer than 2 positions) or an unreadable FIT is
 *   recorded in the archive and is not retried.
 *
 * Every row it cannot fill is listed by workout id and date, with why. No
 * coordinate is ever printed.
 *
 * Run it **after** `migrate-421-workouts-track-ref.mjs` and after the API
 * version that knows `track_ref` is deployed: it refuses to write when
 * `getWorkouts` does not return the field. `updateWorkout` does not take the
 * script lock, so run it outside a scheduled sync run.
 *
 * Credentials are the ones the sync already uses: the bot account's Drive
 * credential (sync/.google-credentials.json locally, or the GOOGLE_* env
 * variables), and THRIVE_API_URL / THRIVE_API_KEY.
 *
 * Usage:
 *   node scripts/backfill-421-workouts-track.mjs --dry-run
 *   node scripts/backfill-421-workouts-track.mjs
 *   ... --max-rows 40 --batch 5 --pause-ms 1000
 */

import { pathToFileURL } from 'node:url';

export const DEFAULTS = { maxRows: 20, batch: 5, pauseMs: 1000 };

const text = (v) => String(v ?? '').trim();
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 200);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);

export const SOURCES = ['coros', 'garmin_import'];

/** A row the backfill considers: COROS-synced or Garmin-imported, with a FIT, and no track yet. */
export const isCandidate = (row) =>
  SOURCES.includes(text(row.source)) && text(row.fit_ref) !== '' && text(row.track_ref) === '';

// A COROS archive file carries its `list_entry`, a Garmin one its `payload`.
const isActivityFile = (f) =>
  !!f && typeof f === 'object' && typeof f.activity_id === 'string' &&
  (typeof f.list_entry === 'object' || typeof f.payload === 'object');

/**
 * Which rows need a track, from the sheet's rows and the archive. Reads only:
 * no FIT is downloaded and nothing is written.
 *
 * @param {{ rows: object[], readFile: (id: string) => Promise<object>,
 *   settled: (file: object, row: object) => boolean }} deps
 *   `settled` says the archive already holds this FIT's outcome at this format
 *   version (a `none` or `unreadable` result, which is not retried).
 * @returns {Promise<{ todo: { id: string, date: string, activityId: string, file: object, fileId: string }[],
 *   settled: { id: string, date: string, status: string }[], problems: { id: string, date: string, reason: string }[] }>}
 */
export async function planBackfill({ rows, readFile, settled }) {
  const todo = [];
  const done = [];
  const problems = [];
  const cache = new Map();

  for (const row of rows.filter(isCandidate).sort(byDate)) {
    const id = text(row.id);
    const date = text(row.date);
    const problem = (reason) => problems.push({ id, date, reason });
    const ref = text(row.raw_ref);
    if (!ref) { problem('no raw_ref: the row names no archived activity'); continue; }

    if (!cache.has(ref)) cache.set(ref, readFile(ref).then((f) => ({ f }), (err) => ({ err })));
    const { f, err } = await cache.get(ref);
    if (err) { problem(`raw_ref ${ref} is unreadable: ${oneLine(err.message || err)}`); continue; }
    if (!isActivityFile(f)) { problem(`raw_ref ${ref} is not an activity file`); continue; }
    const want = text(row.source_activity_id);
    if (f.activity_id !== want) {
      problem(`raw_ref ${ref} is activity ${f.activity_id}, but the row is activity ${want}`);
      continue;
    }
    if (settled(f, row)) {
      done.push({ id, date, status: f.track.status });
      continue;
    }
    todo.push({ id, date, activityId: want, file: f, fileId: ref });
  }
  return { todo, settled: done, problems };
}

/**
 * The backfill, over the sync's own clients: `api` is sync/src/thrive-api.mjs's
 * (`get`, `write`), `drive` its drive.mjs's (`readJson`), `archive` its
 * archive.mjs's, and `createTrackStep` its track-step.mjs's.
 *
 * @returns {Promise<number>} the exit code: 1 if the API is not ready or a write failed
 */
export async function backfill({
  api, drive, archive, garminArchive, createTrackStep, trackVersion, dryRun = false,
  maxRows = DEFAULTS.maxRows, batch = DEFAULTS.batch, pauseMs = DEFAULTS.pauseMs,
  now = () => new Date(), wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log, error = console.error,
}) {
  const rows = await api.get('getWorkouts', {});
  const coros = rows.filter((r) => text(r.source) === 'coros');
  const garmin = rows.filter((r) => text(r.source) === 'garmin_import');
  log(`Workouts: ${rows.length} row(s), ${coros.length} COROS-synced, ${garmin.length} Garmin-imported`);
  if (rows.length && !rows.every((r) => Object.prototype.hasOwnProperty.call(r, 'track_ref'))) {
    error(
      'REFUSING: getWorkouts does not return track_ref, so the deployed API predates #432.\n' +
      'Run scripts/migrate-421-workouts-track-ref.mjs, deploy the API, then re-run this.'
    );
    return 1;
  }

  const { todo, settled, problems } = await planBackfill({
    rows,
    readFile: (id) => drive.readJson(id),
    settled: (file, row) =>
      !!file.track && file.track.version === trackVersion &&
      file.track.fit_fetched_at === text(row.fit_fetched_at) &&
      ['none', 'unreadable'].includes(file.track.status),
  });
  const thisRun = todo.slice(0, maxRows);
  const later = todo.length - thisRun.length;

  log(`already tried, nothing to build (none or unreadable, not retried): ${settled.length}`);
  log(`to build: ${todo.length}${later ? ` (${thisRun.length} this run, capped by --max-rows ${maxRows}; ${later} for a later run)` : ''}`);
  for (const t of thisRun) log(`  ${t.id}  ${t.date}`);
  if (problems.length) {
    log(`NOT BUILT, needs a look: ${problems.length}`);
    for (const p of problems) log(`  ${p.id}  ${p.date}  ${p.reason}`);
  }

  if (!thisRun.length) {
    log('\nNothing to do.');
    return 0;
  }
  if (dryRun) {
    log('\n--dry-run: nothing written, no FIT read.');
    return 0;
  }

  const step = createTrackStep({ archive, startedAt: now().toISOString(), log: () => {} });
  const notBuilt = [];
  let written = 0;
  let attempted = 0;
  for (const t of thisRun) {
    const row = rows.find((r) => text(r.id) === t.id);
    // The FIT must be the one the row names, confirmed by its tag, never by trusting fit_ref alone.
    const isGarmin = text(row.source) === 'garmin_import';
    if (isGarmin && !garminArchive) {
      error('REFUSING: a Garmin row needs the Garmin archive to confirm its FIT.');
      return 1;
    }
    let tagged;
    try {
      tagged = await (isGarmin ? garminArchive : archive).findFit(t.activityId);
    } catch (err) {
      notBuilt.push({ ...t, reason: `the FIT could not be looked up: ${oneLine(err.message || err)}` });
      continue;
    }
    if (!tagged || tagged.id !== text(row.fit_ref)) {
      notBuilt.push({ ...t, reason: `fit_ref ${text(row.fit_ref)} is not the FIT tagged for activity ${t.activityId}` });
      continue;
    }

    attempted += 1;
    const failuresBefore = step.failures.length;
    let result;
    try {
      result = await step.ensure({
        activityId: t.activityId, fileId: t.fileId, record: t.file.track,
        fitRef: text(row.fit_ref), fitFetchedAt: text(row.fit_fetched_at),
        listEntry: t.file.list_entry, localDate: text(row.date),
        // A Garmin FIT was kept only because it holds positions; buildTrack still decides.
        ...(isGarmin ? { outdoor: true } : {}),
      });
    } catch (err) {
      error(`FAILED building the track for ${t.id} (${t.date}): ${oneLine(err.name || 'Error')}`);
      return 1;
    }
    if (step.failures.length > failuresBefore) {
      notBuilt.push({ ...t, reason: oneLine(step.failures.at(-1)) });
      continue;
    }
    if (!result.track_ref) {
      const archived = await drive.readJson(t.fileId).catch(() => null);
      const status = archived?.track?.status;
      notBuilt.push({
        ...t,
        reason: status === 'unreadable' ? 'the FIT could not be decoded (recorded, not retried)'
          : 'no track: no Start Coordinates, or fewer than 2 valid positions (recorded, not retried)',
      });
      continue;
    }

    if (written > 0 && written % batch === 0 && pauseMs > 0) await wait(pauseMs);
    try {
      const res = await api.write('updateWorkout', { id: t.id, changes: { track_ref: result.track_ref } });
      if (res && res.track_ref !== undefined && res.track_ref !== result.track_ref) {
        error(`UNEXPECTED: ${t.id} reads back track_ref "${res.track_ref}", not the one just stored.`);
        return 1;
      }
    } catch (err) {
      error(`FAILED writing ${t.id} (${t.date}): ${oneLine(err.message || err)}`);
      error(`${written} row(s) were written before it. Re-run to continue: written rows are skipped.`);
      return 1;
    }
    written += 1;
    log(`wrote  ${t.id}  ${t.date}  track_ref ${result.track_ref}`);
  }

  if (notBuilt.length) {
    log(`NOT BUILT, needs a look: ${notBuilt.length}`);
    for (const p of notBuilt) log(`  ${p.id}  ${p.date}  ${p.reason}`);
  }
  const c = step.counts;
  log(`\nTracks: ${c.built} built, ${c.rebuilt} rebuilt, ${c.none} none, ${c.unreadable} unreadable, ${c.failed} failed (${attempted} tried).`);
  log(`Filled ${written} row(s).${later ? ` ${later} left: re-run to continue.` : ''}`);
  return step.counts.failed ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);
  const num = (flag, fallback) => {
    const i = args.indexOf(flag);
    if (i === -1) return fallback;
    const n = Number(args[i + 1]);
    if (!Number.isInteger(n) || n < (flag === '--pause-ms' ? 0 : 1)) {
      console.error(`REFUSING: ${flag} must be a whole number, got "${args[i + 1]}".`);
      process.exit(1);
    }
    return n;
  };
  const maxRows = num('--max-rows', DEFAULTS.maxRows);
  const batch = num('--batch', DEFAULTS.batch);
  const pauseMs = num('--pause-ms', DEFAULTS.pauseMs);

  const { createThriveApi, loadThriveApiConfig } = await import('../sync/src/thrive-api.mjs');
  const { createDrive } = await import('../sync/src/drive.mjs');
  const { createArchive } = await import('../sync/src/archive.mjs');
  const { createGarminArchive } = await import('../sync/src/garmin-archive.mjs');
  const { googleTokenProvider, loadGoogleCredentials } = await import('../sync/src/google.mjs');
  const { createTrackStep } = await import('../sync/src/track-step.mjs');
  const { TRACK_VERSION } = await import('../sync/src/track.mjs');
  const { redact } = await import('../sync/src/redact.mjs');

  try {
    const api = createThriveApi(loadThriveApiConfig());
    const drive = createDrive({ getToken: googleTokenProvider(loadGoogleCredentials()) });
    process.exitCode = await backfill({
      api, drive, archive: createArchive(drive), garminArchive: createGarminArchive(drive), createTrackStep, trackVersion: TRACK_VERSION,
      dryRun: args.includes('--dry-run'), maxRows, batch, pauseMs,
    });
  } catch (err) {
    console.error(`${err.name ?? 'Error'}: ${redact(err.message || String(err))}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
