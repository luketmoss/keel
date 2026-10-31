/**
 * backfill-689-workouts-trails.mjs — Hand-run, re-runnable backfill for #689.
 *
 * Tags `Workouts!AD` `trails` (#688) for activities the sync's trail step never
 * visits or has not reached: every row with a stored track (`track_ref`) whose
 * `trails` cell is blank ("not tagged yet", never "no trails"), and every row
 * tagged by an older `TRAILS_MATCHER_VERSION`, which must be re-tagged to stay
 * comparable. It uses #688's code, not its own: the Overpass client
 * (sync/src/overpass.mjs), the matcher (sync/src/trail-match.mjs) and the
 * encoder with its overflow rule (sync/src/trail-step.mjs), so it writes exactly
 * what the sync writes.
 *
 * It reads each track from Drive by `track_ref`; it makes no COROS call and
 * does not use the API's `getWorkoutTrack`.
 *
 * Overpass is a public service that rate-limits, times out and returns partial
 * results, so the script is slow on purpose and cautious:
 *
 * - at least 5 s between requests, one at a time;
 * - patient attempts (#697): 5 per lookup, each given 120 s (the server's own
 *   limit 90 s), waiting 15 s / 60 s / 120 s / 180 s between them; tune with
 *   `--attempt-timeout-s` and `--attempts`. The sync keeps its short ones;
 * - at most 30 lookups a run (`--max-lookups`) and no new lookup after 20
 *   minutes (`--max-minutes`);
 * - the first lookup that fails all its attempts ends the run (exit 1): that
 *   row is not written and nothing about it is remembered;
 * - a failed or partial answer is never written as "no trails".
 *
 * Resume is the sheet itself (a tagged row is skipped), plus one small local
 * file, `scripts/.backfill-689-progress.json`, which remembers only the rows
 * whose area is over 50 km (id, track_ref, matcher version). A local cache,
 * `scripts/.backfill-689-cache/`, keeps each complete Overpass answer for 30
 * days so a matcher bump, or a run stopped before its write, does not ask
 * Overpass twice. Both are gitignored; the cache holds trail names, so nothing
 * from it ever reaches a log line, a progress entry or an error.
 *
 * Console lines carry workout ids and counts only: never a coordinate, a box,
 * a trail name, a date or text from an Overpass response.
 *
 * A COROS row it tags is also recorded in its archive file exactly as the sync
 * records it, so a later sync run over it makes no request. A Garmin row needs
 * nothing: its cell is its state.
 *
 * Run it after #688 is merged and deployed (migrate-688-workouts-trails.mjs,
 * the API version that knows `trails`, one sync run). It refuses to run when
 * `getWorkouts` does not return `trails`. `updateWorkout` does not take the
 * script lock, so do not run it during a scheduled sync run.
 *
 * Credentials are the ones backfill-421 uses: the bot account's Drive
 * credential (sync/.google-credentials.json, or the GOOGLE_* variables) and
 * THRIVE_API_URL / THRIVE_API_KEY. THRIVE_OVERPASS_URL is honoured as in the
 * sync.
 *
 * Usage:
 *   node scripts/backfill-689-workouts-trails.mjs --dry-run
 *   node scripts/backfill-689-workouts-trails.mjs --max-lookups 1
 *   node scripts/backfill-689-workouts-trails.mjs
 *   ... --max-lookups 30 --max-minutes 20 --pause-ms 1000 --ids a,b --restart --no-cache
 *   ... --attempt-timeout-s 120 --attempts 5
 */

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DriveAuthError } from '../sync/src/errors.mjs';
import { createOverpass, OverpassError, overpassUrl, paddedBox, tooLarge, trailQuery } from '../sync/src/overpass.mjs';
import { matchTrails, TRAILS_MATCHER_VERSION } from '../sync/src/trail-match.mjs';
import { encodeTrails, fitTrails, LOOKUP_SPACING_MS } from '../sync/src/trail-step.mjs';

export const DEFAULTS = { maxLookups: 30, maxMinutes: 20, pauseMs: 1000, attemptTimeoutS: 120, attempts: 5 };

/** Waits before the 2nd, 3rd... attempt; the last repeats when `--attempts` asks for more. */
export const PATIENT_WAITS_MS = [15_000, 60_000, 120_000, 180_000];

/**
 * What the backfill hands `createOverpass` (#697): far more patient than the
 * sync, which has a 3-minute run budget to keep. The server's `[timeout:N]` is
 * 75% of the client's, so the client always outlasts the server (120 s -> 90 s),
 * and no wait before a retry is under the spacing between lookups.
 */
export function patience({ attemptTimeoutS = DEFAULTS.attemptTimeoutS, attempts = DEFAULTS.attempts } = {}) {
  return {
    attemptTimeoutMs: attemptTimeoutS * 1000,
    serverTimeoutS: Math.max(1, Math.floor(attemptTimeoutS * 0.75)),
    attempts,
    retryDelaysMs: PATIENT_WAITS_MS.map((ms) => Math.max(ms, LOOKUP_SPACING_MS)),
  };
}

/** A cached answer older than this is ignored (OSM changes). */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const text = (v) => String(v ?? '').trim();
const byNewest = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1);

// --- The trails cell ----------------------------------------------------------

const KEYS = ['v', 'm', 'u', 'n', 'p', 'x'];
const whole = (v, nullable = false) =>
  v === null ? nullable : typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * A mirror of the API's `validateTrails` (apps-script/src/workouts.js): the
 * cell's state, and for a valid v1 value its matcher version `m`.
 *
 * @returns {{ state: 'blank' } | { state: 'v1', m: number } | { state: 'unreadable' }}
 */
export function readTrailsCell(raw) {
  const v = text(raw);
  if (v === '') return { state: 'blank' };
  const bad = { state: 'unreadable' };
  let t;
  try {
    t = JSON.parse(v);
  } catch {
    return bad;
  }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return bad;
  if (Object.keys(t).some((k) => !KEYS.includes(k))) return bad;
  if (!KEYS.slice(0, 5).every((k) => Object.hasOwn(t, k))) return bad;
  if (t.v !== 1 || !whole(t.m) || t.m < 1 || !whole(t.u)) return bad;
  if (Object.hasOwn(t, 'x') && (!whole(t.x) || t.x < 1)) return bad;
  if (!Array.isArray(t.n) || !Array.isArray(t.p)) return bad;
  const used = t.n.map(() => false);
  for (const n of t.n) {
    if (!Array.isArray(n) || n.length !== 2 || typeof n[0] !== 'string' || n[0] === '' || !whole(n[1])) return bad;
  }
  for (const p of t.p) {
    if (!Array.isArray(p) || p.length !== 8) return bad;
    if (!whole(p[0]) || p[0] >= t.n.length) return bad;
    if (!whole(p[1]) || p[1] > 100 || !whole(p[2]) || p[2] > 100) return bad;
    if (p[3] !== 1 && p[3] !== -1) return bad;
    if (!whole(p[4]) || !whole(p[5], true) || !whole(p[6], true) || !whole(p[7], true)) return bad;
    used[p[0]] = true;
  }
  if (used.some((u) => !u)) return bad;
  return { state: 'v1', m: t.m };
}

// --- Plan ---------------------------------------------------------------------

/**
 * Which rows to tag, from the sheet's rows alone. Pure: no Drive, no network.
 *
 * @param {{ rows: object[], matcherVersion?: number,
 *   tooLarge?: { id: string, track_ref: string, m: number }[], ids?: string[] | null,
 *   maxLookups?: number }} args
 * @returns {{ withTrack: number, counts: object, todo: object[], thisRun: object[], left: number,
 *   notTagged: { id: string, reason: string }[] }}
 */
export function planBackfill({
  rows, matcherVersion = TRAILS_MATCHER_VERSION, tooLarge: remembered = [], ids = null, maxLookups = DEFAULTS.maxLookups,
}) {
  const counts = { toTag: 0, toRetag: 0, current: 0, newer: 0, tooLarge: 0, unreadable: 0 };
  const notTagged = [];
  const todo = [];
  const withTrack = rows.filter((r) => text(r.track_ref) !== '').sort(byNewest);
  const only = ids ? new Set(ids) : null;

  for (const row of withTrack) {
    const id = text(row.id);
    const cell = readTrailsCell(row.trails);
    if (cell.state === 'unreadable') {
      counts.unreadable += 1;
      notTagged.push({ id, reason: 'cell holds a value that is not v1' });
      continue;
    }
    if (cell.state === 'v1') {
      if (cell.m === matcherVersion) { counts.current += 1; continue; }
      if (cell.m > matcherVersion) { counts.newer += 1; continue; }
    }
    if (remembered.some((r) => r.id === id && r.track_ref === text(row.track_ref) && r.m === matcherVersion)) {
      counts.tooLarge += 1;
      notTagged.push({ id, reason: 'area over 50 km' });
      continue;
    }
    counts[cell.state === 'blank' ? 'toTag' : 'toRetag'] += 1;
    if (only && !only.has(id)) continue;
    todo.push({ id, trackRef: text(row.track_ref), source: text(row.source), rawRef: text(row.raw_ref), retag: cell.state === 'v1' });
  }
  const thisRun = todo.slice(0, maxLookups);
  return { withTrack: withTrack.length, counts, todo, thisRun, left: todo.length - thisRun.length, notTagged };
}

// --- Local files ---------------------------------------------------------------

/** The too-large rows the last runs remembered; a missing or unreadable file is empty. */
export function loadProgress(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return (Array.isArray(parsed?.tooLarge) ? parsed.tooLarge : []).filter(
      (r) => r && typeof r.id === 'string' && typeof r.track_ref === 'string' && Number.isInteger(r.m),
    );
  } catch {
    return [];
  }
}

/** Written to a temp file and renamed, so a killed run cannot leave half a file. */
function writeAtomic(path, data) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

// Keyed by the query as the sync sends it, `[timeout:40]` included, whatever
// timeout this run sends: the patience flags never change a key (#697).
const cacheFile = (dir, box) => join(dir, `${createHash('sha256').update(trailQuery(box)).digest('hex')}.json`);

// --- The backfill --------------------------------------------------------------

/**
 * @param {object} deps
 * @param {{ get: Function, updateWorkout: Function }} deps.api sync/src/thrive-api.mjs's
 * @param {{ readJson: Function }} deps.drive sync/src/drive.mjs's
 * @param {{ readTrack: Function, writeTrails: Function }} deps.archive sync/src/archive.mjs's
 * @param {string} deps.cacheDir
 * @param {string} deps.progressPath
 * @returns {Promise<number>} the exit code
 */
export async function backfill({
  api, drive, archive, fetchImpl, startTimer, overpassUrl: url, cacheDir, progressPath,
  dryRun = false, restart = false, noCache = false, ids = null,
  maxLookups = DEFAULTS.maxLookups, maxMinutes = DEFAULTS.maxMinutes, pauseMs = DEFAULTS.pauseMs,
  attemptTimeoutS = DEFAULTS.attemptTimeoutS, attempts = DEFAULTS.attempts,
  matcherVersion = TRAILS_MATCHER_VERSION,
  now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = console.log, error = console.error,
}) {
  const rows = await api.get('getWorkouts', {});
  if (rows.length && !rows.every((r) => Object.hasOwn(r, 'trails'))) {
    error(
      'REFUSING: getWorkouts does not return trails, so the deployed API predates #688.\n' +
      'Run scripts/migrate-688-workouts-trails.mjs, deploy the Apps Script version that knows trails, ' +
      'and let one sync run complete, then re-run this.'
    );
    return 1;
  }

  if (restart && !dryRun) rmSync(progressPath, { force: true });
  const remembered = restart ? [] : loadProgress(progressPath);
  const plan = planBackfill({ rows, matcherVersion, tooLarge: remembered, ids, maxLookups });
  const c = plan.counts;

  log(`Workouts: ${rows.length} row(s), ${plan.withTrack} with a track`);
  log(`  tagged by this matcher version (skipped): ${c.current}`);
  log(`  tagged by a newer matcher version (left alone): ${c.newer}`);
  log(`  area over 50 km (remembered, skipped): ${c.tooLarge}`);
  log(`  cell holds a value that is not v1 (never written): ${c.unreadable}`);
  log(`  to tag: ${c.toTag}`);
  log(`  to re-tag: ${c.toRetag}`);
  log(`this run: ${plan.thisRun.length}${ids ? ` (limited by --ids)` : ''}`);
  log(`left for a later run: ${plan.left}`);
  for (const t of plan.thisRun) log(`  ${t.id}`);

  const listNotTagged = (list) => {
    if (!list.length) return;
    log(`NOT TAGGED: ${list.length}`);
    for (const n of list) log(`  ${n.id}  ${n.reason}`);
  };

  if (dryRun) {
    listNotTagged(plan.notTagged);
    log('\n--dry-run: nothing read from Drive, nothing sent, nothing written.');
    return 0;
  }
  if (!plan.todo.length) {
    listNotTagged(plan.notTagged);
    log('\nNothing to do.');
    return 0;
  }

  const startedAt = new Date(now()).toISOString();
  const client = createOverpass({
    ...(url ? { url } : {}), ...patience({ attemptTimeoutS, attempts }), wait, ...(fetchImpl ? { fetchImpl } : {}), ...(startTimer ? { startTimer } : {}),
  });
  const notTagged = [...plan.notTagged];
  const tally = { tagged: 0, noTrail: 0, tooLarge: 0, failed: 0, unreadableTrack: 0, cached: 0 };
  let lookups = 0;
  let firstRequestAt = null;
  let lastRequestAt = null;
  let stopped = null; // 'cap' | 'time' | 'failed'
  let exit = 0;
  let reached = 0; // rows the run is finished with
  let cacheWarned = false;
  const warnCache = () => {
    if (cacheWarned) return;
    cacheWarned = true;
    log('WARNING: the cache folder could not be read or written; continuing without it.');
  };

  /** A complete answer from the cache folder, or null. */
  function cacheGet(box) {
    if (noCache) return null;
    let data;
    try {
      data = JSON.parse(readFileSync(cacheFile(cacheDir, box), 'utf8'));
    } catch (err) {
      if (err?.code !== 'ENOENT' && !(err instanceof SyntaxError)) warnCache();
      return null;
    }
    const at = Date.parse(data?.at);
    if (!Array.isArray(data?.elements) || !Number.isFinite(at) || now() - at > CACHE_MAX_AGE_MS) return null;
    return data.elements;
  }

  /** Only called with an answer the client accepted: 200, JSON, `elements`, no `remark`. */
  function cachePut(box, elements) {
    if (noCache) return;
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeAtomic(cacheFile(cacheDir, box), JSON.stringify({ at: new Date(now()).toISOString(), elements }));
    } catch {
      warnCache();
    }
  }

  function remember(entry) {
    remembered.push(entry);
    try {
      writeAtomic(progressPath, JSON.stringify({ tooLarge: remembered }));
    } catch {
      log('WARNING: the progress file could not be written; continuing without it.');
    }
  }

  /** The sync's archive record for a COROS row; a failure costs only the record. */
  async function record(t, outcome) {
    if (t.source !== 'coros' || !t.rawRef) return;
    try {
      const file = await drive.readJson(t.rawRef);
      const track = file?.track;
      if (!track || track.status !== 'stored' || track.file_id !== t.trackRef) return;
      await archive.writeTrails(t.rawRef, {
        status: outcome.status, matcher_version: matcherVersion, fit_fetched_at: track.fit_fetched_at,
        track_version: track.version, at: startedAt, ...(outcome.status === 'tagged' ? { passes: outcome.passes, omitted: outcome.omitted } : {}),
      });
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      log(`  ${t.id}: outcome not recorded in the archive; a later sync run may look it up again`);
    }
  }

  try {
    for (const t of plan.todo) {
      let feature;
      let box;
      try {
        feature = await archive.readTrack(t.trackRef);
        box = paddedBox(feature);
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        tally.unreadableTrack += 1;
        notTagged.push({ id: t.id, reason: 'track could not be read' });
        reached += 1;
        continue;
      }

      if (tooLarge(box)) {
        tally.tooLarge += 1;
        notTagged.push({ id: t.id, reason: 'area over 50 km' });
        remember({ id: t.id, track_ref: t.trackRef, m: matcherVersion });
        await record(t, { status: 'too_large' });
        reached += 1;
        continue;
      }

      let elements = cacheGet(box.box);
      if (elements) {
        tally.cached += 1;
      } else {
        if (lookups >= maxLookups) { stopped = 'cap'; break; }
        if (lastRequestAt !== null) {
          const since = now() - lastRequestAt;
          if (since < LOOKUP_SPACING_MS) await wait(LOOKUP_SPACING_MS - since);
        }
        if (firstRequestAt !== null && now() - firstRequestAt >= maxMinutes * 60_000) { stopped = 'time'; break; }
        if (firstRequestAt === null) firstRequestAt = now();
        lookups += 1;
        try {
          elements = await client.lookup(box.box);
        } catch (err) {
          const reason = err instanceof OverpassError ? err.reason : 'no response';
          tally.failed += 1;
          notTagged.push({ id: t.id, reason: `OpenStreetMap lookup failed (${reason})` });
          stopped = 'failed';
          exit = 1;
          break;
        } finally {
          lastRequestAt = now();
        }
        cachePut(box.box, elements);
      }

      let fitted;
      try {
        fitted = fitTrails(encodeTrails(matchTrails(feature, elements), { matcherVersion }), t.id);
      } catch {
        tally.failed += 1;
        notTagged.push({ id: t.id, reason: 'OpenStreetMap lookup failed (unreadable response)' });
        exit = 1;
        reached += 1;
        continue;
      }

      let res;
      try {
        res = await api.updateWorkout({ id: t.id, changes: { trails: fitted.text } });
      } catch (err) {
        error(`FAILED writing ${t.id}: the API refused or could not complete the write (${err?.name ?? 'Error'}).`);
        error(`${tally.tagged + tally.noTrail} row(s) were written before it. Re-run to continue: written rows are skipped.`);
        return 1;
      }
      if (res && res.trails !== undefined && res.trails !== fitted.text) {
        error(`UNEXPECTED: ${t.id} reads back a different trails value than the one just sent. Stopping.`);
        return 1;
      }
      const kept = fitted.total - fitted.omitted;
      tally[kept ? 'tagged' : 'noTrail'] += 1;
      reached += 1;
      log(`wrote  ${t.id}  ${kept ? `${kept} passes` : 'no named trail'}${fitted.omitted ? `, ${fitted.omitted} left out to fit` : ''}`);
      await record(t, { status: 'tagged', passes: kept, omitted: fitted.omitted });
      if (pauseMs > 0) await wait(pauseMs);
    }
  } catch (err) {
    error(`${err?.name ?? 'Error'}: stopping; rows already written are kept. Re-run to continue.`);
    exit = 1;
  }

  if (stopped === 'failed') {
    error('OpenStreetMap (Overpass) is struggling: the lookup failed every attempt. Nothing was written for that row. Wait a while and re-run.');
  } else if (stopped === 'cap') {
    log(`Stopped at the per-run limit (--max-lookups ${maxLookups}).`);
  } else if (stopped === 'time') {
    log(`Stopped at the time limit (--max-minutes ${maxMinutes}).`);
  }

  listNotTagged(notTagged);
  // Rows a re-run can still finish: the ones not reached, a failed lookup's row included.
  const left = plan.todo.length - reached;
  log(
    `\nTrails: ${tally.tagged} tagged, ${tally.noTrail} no named trail, ${tally.tooLarge} too large, ` +
    `${tally.failed} failed, ${tally.unreadableTrack} unreadable track, ${tally.cached} cached answers used.`
  );
  log(left > 0 ? `Left: ${left}. Re-run to continue.` : 'Nothing to do.');
  if (tally.failed) exit = 1;
  return exit;
}

// --- Command line ---------------------------------------------------------------

const FLAGS = {
  '--dry-run': 'boolean', '--restart': 'boolean', '--no-cache': 'boolean',
  '--max-lookups': 'int', '--max-minutes': 'int', '--pause-ms': 'int0', '--ids': 'list',
  '--attempt-timeout-s': 'int', '--attempts': 'int',
};

/** @returns {{ ok: true, options: object } | { ok: false, message: string }} */
export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const kind = FLAGS[flag];
    if (!kind) return { ok: false, message: `REFUSING: unknown flag ${flag}.` };
    if (kind === 'boolean') { options[flag] = true; continue; }
    const value = args[++i];
    if (kind === 'list') {
      const list = String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!list.length) return { ok: false, message: `REFUSING: ${flag} needs a comma-separated list of workout ids.` };
      options[flag] = list;
      continue;
    }
    const n = Number(value);
    if (value === undefined || value.trim() === '' || !Number.isInteger(n) || n < (kind === 'int0' ? 0 : 1)) {
      return {
        ok: false,
        message: `REFUSING: ${flag} must be a whole number ${kind === 'int0' ? 'of 0 or more' : 'of 1 or more'}, got "${value ?? ''}".`,
      };
    }
    options[flag] = n;
  }
  return { ok: true, options };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    process.exit(1);
  }
  const o = parsed.options;

  const { createThriveApi, loadThriveApiConfig } = await import('../sync/src/thrive-api.mjs');
  const { createDrive } = await import('../sync/src/drive.mjs');
  const { createArchive } = await import('../sync/src/archive.mjs');
  const { googleTokenProvider, loadGoogleCredentials } = await import('../sync/src/google.mjs');
  const { redact } = await import('../sync/src/redact.mjs');

  try {
    const api = createThriveApi(loadThriveApiConfig());
    const drive = createDrive({ getToken: googleTokenProvider(loadGoogleCredentials()) });
    process.exitCode = await backfill({
      api, drive, archive: createArchive(drive),
      overpassUrl: overpassUrl(process.env),
      cacheDir: fileURLToPath(new URL('./.backfill-689-cache/', import.meta.url)),
      progressPath: fileURLToPath(new URL('./.backfill-689-progress.json', import.meta.url)),
      dryRun: !!o['--dry-run'], restart: !!o['--restart'], noCache: !!o['--no-cache'], ids: o['--ids'] ?? null,
      maxLookups: o['--max-lookups'] ?? DEFAULTS.maxLookups,
      maxMinutes: o['--max-minutes'] ?? DEFAULTS.maxMinutes,
      pauseMs: o['--pause-ms'] ?? DEFAULTS.pauseMs,
      attemptTimeoutS: o['--attempt-timeout-s'] ?? DEFAULTS.attemptTimeoutS,
      attempts: o['--attempts'] ?? DEFAULTS.attempts,
    });
  } catch (err) {
    console.error(`${err.name ?? 'Error'}: ${redact(err.message || String(err))}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
