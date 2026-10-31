// The run's trail step (#688): for every activity with a stored track whose
// trails are not settled, look up the named OpenStreetMap trails in its box
// (src/overpass.mjs), match the track against them (src/trail-match.mjs) and
// write the result to Workouts!AD `trails` with `updateWorkout`.
//
// It never fails the sync. Nothing here adds to the run's failures: every
// problem is a SyncLog note, and the activity's row has already landed. The
// one exception is a DriveAuthError, which is rethrown as every other step
// rethrows it.
//
// A failure never looks like "no trails". A lookup that fails writes nothing
// and records nothing, so the next run (or #689's backfill) looks again. Only
// a written value, or a box too large to look up, settles an activity, and
// only for the track and matcher that produced it.
//
// No coordinate, box, trail name or Overpass text appears in a log line, a
// note or an error: the messages here name the activity ID only.

import { DriveAuthError } from './errors.mjs';
import { MAX_ENCODED_PAYLOAD } from './thrive-api.mjs';
import { createOverpass, OverpassError, overpassUrl, paddedBox, tooLarge } from './overpass.mjs';
import { redact } from './redact.mjs';
import { matchTrails, TRAILS_MATCHER_VERSION } from './trail-match.mjs';

/** Workouts!AD's format version. */
export const TRAILS_FORMAT_VERSION = 1;

/** The run budget (#688 §Run budget). */
export const MAX_LOOKUPS = 5;
export const LOOKUP_SPACING_MS = 5_000;
export const LOOKUP_WINDOW_MS = 3 * 60_000;

const nullableInt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v));

/**
 * The full Workouts!AD value for one match, as an object in the column's key
 * order: `v`, `m`, `u`, `n`, `p` (and `x` only once passes are left out).
 * Passes in activity time order, names in order of each trail's first pass.
 *
 * @param {{ totalM: number, passes: object[] }} match from matchTrails
 */
export function encodeTrails(match, { matcherVersion = TRAILS_MATCHER_VERSION } = {}) {
  const ordered = match.passes
    .map((p, order) => ({ p, order, entry: nullableInt(p.entryOffsetS) }))
    .sort((a, b) =>
      a.entry !== null && b.entry !== null && a.entry !== b.entry ? a.entry - b.entry : a.p.fromIndex - b.p.fromIndex,
    );
  const matched = match.passes.reduce((sum, p) => sum + p.metres, 0);
  const names = [];
  const index = new Map();
  const p = ordered.map(({ p: pass, entry }) => {
    if (!index.has(pass.trail)) {
      index.set(pass.trail, names.length);
      names.push([pass.trail, Math.round(pass.trailLengthM)]);
    }
    return [
      index.get(pass.trail),
      Math.round(pass.startPct),
      Math.round(pass.endPct),
      pass.endM >= pass.startM ? 1 : -1,
      Math.max(0, Math.round(pass.metres)),
      nullableInt(pass.durationS) === null ? null : Math.max(0, nullableInt(pass.durationS)),
      nullableInt(pass.climbM),
      entry === null ? null : Math.max(0, entry),
    ];
  });
  return {
    v: TRAILS_FORMAT_VERSION,
    m: matcherVersion,
    u: Math.max(0, Math.round(match.totalM - matched)),
    n: names,
    p,
  };
}

/** `value` with only the passes at `keep` (indices into value.p), names renumbered, `x` set. */
function withPasses(value, keep) {
  const kept = keep.map((i) => value.p[i]);
  const names = [];
  const renumber = new Map();
  const p = kept.map((pass) => {
    if (!renumber.has(pass[0])) {
      renumber.set(pass[0], names.length);
      names.push(value.n[pass[0]]);
    }
    return [renumber.get(pass[0]), ...pass.slice(1)];
  });
  const omitted = value.p.length - kept.length;
  return { v: value.v, m: value.m, u: value.u, n: names, p, ...(omitted ? { x: omitted } : {}) };
}

/** The `updateWorkout` payload's URL-encoded length, as the API client measures it. */
export const encodedPayloadSize = (id, text) =>
  encodeURIComponent(JSON.stringify({ id, changes: { trails: text } })).length;

/**
 * The text to write for `value`, made to fit the sync's GET payload cap.
 * When the whole value does not fit, passes are left out, the shortest
 * `metres` first and, between equal ones, the later pass first; the rest stay
 * in time order, names no pass uses are dropped and `x` counts what was left
 * out. `u` is unchanged. A value is never cut mid-pass.
 *
 * @returns {{ text: string, omitted: number, total: number }}
 */
export function fitTrails(value, id, limit = MAX_ENCODED_PAYLOAD) {
  const total = value.p.length;
  let text = JSON.stringify(value);
  if (encodedPayloadSize(id, text) <= limit) return { text, omitted: 0, total };

  const dropOrder = value.p.map((pass, i) => i).sort((a, b) => value.p[a][4] - value.p[b][4] || b - a);
  const keep = new Set(value.p.map((_, i) => i));
  for (const i of dropOrder) {
    keep.delete(i);
    text = JSON.stringify(withPasses(value, [...keep].sort((a, b) => a - b)));
    if (encodedPayloadSize(id, text) <= limit) break;
  }
  return { text, omitted: total - keep.size, total };
}

/**
 * Whether the activity's trails need no work: an outcome that settles it
 * (`tagged`, `too_large`), made by this matcher from the track the archive
 * holds now.
 */
export const trailsSettled = (record, track, matcherVersion = TRAILS_MATCHER_VERSION) =>
  !!record && !!track &&
  (record.status === 'tagged' || record.status === 'too_large') &&
  record.matcher_version === matcherVersion &&
  record.fit_fetched_at === track.fit_fetched_at &&
  record.track_version === track.version;

/** The trail step's account, counts only, so it is safe in a summary-mode log. */
export function trailSummary(step) {
  const c = step.counts;
  return `Trails: ${c.tagged} tagged, ${c.noTrail} no named trail, ${c.tooLarge} too large, ${c.failed} failed, ${c.deferred} deferred.`;
}

/**
 * @param {{ archive: object, api: object, startedAt: string, env?: object,
 *   overpass?: ReturnType<typeof createOverpass>, now?: () => number,
 *   wait?: (ms: number) => Promise<void>, fetchImpl?: typeof fetch, featureFor?: (activityId: string) => object | undefined,
 *   matcherVersion?: number, log?: (line: string) => void }} opts
 *   `featureFor` is the track step's memory of a track it built this run.
 */
export function createTrailStep({
  archive, api, startedAt, env = process.env, now = () => Date.now(),
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  overpass, fetchImpl, featureFor = () => undefined, matcherVersion = TRAILS_MATCHER_VERSION, log = console.log,
}) {
  const client = overpass ?? createOverpass({ url: overpassUrl(env), wait, ...(fetchImpl ? { fetchImpl } : {}) });
  const counts = { tagged: 0, noTrail: 0, tooLarge: 0, failed: 0, deferred: 0 };
  const notes = [];
  let lookups = 0;
  let firstRequestAt = null;
  let lastRequestAt = null;
  let stopped = null; // why no further lookups start this run

  const note = (text) => {
    notes.push(text);
  };
  const detail = (activityId, what) => log(`  activity ${activityId}: trails ${what}`);

  /** Record the outcome in the archive file. A failure costs only the record: the next run redoes it. */
  async function record(fileId, activityId, trails) {
    try {
      await archive.writeTrails(fileId, trails);
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      detail(activityId, 'outcome not recorded in the archive; a later run redoes it');
    }
  }

  /** Why the next lookup may not start, or null. Waits out the spacing first. */
  async function blocked() {
    if (stopped) return stopped;
    if (lookups >= MAX_LOOKUPS) return (stopped = 'the per-run limit');
    if (lastRequestAt !== null) {
      const since = now() - lastRequestAt;
      if (since < LOOKUP_SPACING_MS) await wait(LOOKUP_SPACING_MS - since);
    }
    if (firstRequestAt !== null && now() - firstRequestAt >= LOOKUP_WINDOW_MS) return (stopped = 'the time limit');
    return null;
  }

  /**
   * One activity, after its row has landed.
   *
   * @param {{ activityId: string, fileId: string, rowId: string,
   *   track: object | undefined, record: object | undefined }} activity
   *   `track` is the archive's track record as the track step left it this
   *   run; `record` the archive's trails record.
   */
  async function ensure({ activityId, fileId, rowId, track, record: current }) {
    if (track?.status !== 'stored' || !track.file_id) return;
    if (trailsSettled(current, track, matcherVersion)) return;

    const base = {
      matcher_version: matcherVersion,
      fit_fetched_at: track.fit_fetched_at,
      track_version: track.version,
      at: startedAt,
    };

    let feature = featureFor(activityId);
    if (!feature) {
      try {
        feature = await archive.readTrack(track.file_id);
      } catch (err) {
        if (err instanceof DriveAuthError) throw err;
        counts.failed += 1;
        note(`trails ${activityId}: not tagged, its track could not be read from Drive; a later run retries`);
        detail(activityId, 'not tagged: the track could not be read from Drive');
        return;
      }
    }

    let box;
    try {
      box = paddedBox(feature);
    } catch {
      counts.failed += 1;
      note(`trails ${activityId}: not tagged, its track could not be read from Drive; a later run retries`);
      detail(activityId, 'not tagged: the track has no coordinates');
      return;
    }
    if (tooLarge(box)) {
      counts.tooLarge += 1;
      note(`trails ${activityId}: not tagged, its area is over 50 km across; not retried until its track or the matcher changes`);
      detail(activityId, 'not tagged: the area is over 50 km across');
      await record(fileId, activityId, { status: 'too_large', ...base });
      return;
    }

    if (await blocked()) {
      counts.deferred += 1;
      detail(activityId, `deferred (${stopped})`);
      return;
    }

    if (firstRequestAt === null) firstRequestAt = now();
    lookups += 1;
    let elements;
    try {
      elements = await client.lookup(box.box);
    } catch (err) {
      const reason = err instanceof OverpassError ? err.reason : 'no response';
      counts.failed += 1;
      stopped = 'a failed lookup';
      note(`trails ${activityId}: not tagged, the OpenStreetMap lookup failed (${reason}); a later run retries`);
      detail(activityId, `not tagged: the lookup failed (${reason})`);
      return;
    } finally {
      lastRequestAt = now();
    }

    let fitted;
    try {
      fitted = fitTrails(encodeTrails(matchTrails(feature, elements), { matcherVersion }), rowId);
    } catch {
      counts.failed += 1;
      note(`trails ${activityId}: not tagged, the OpenStreetMap lookup failed (unreadable response); a later run retries`);
      detail(activityId, 'not tagged: the response could not be matched');
      return;
    }

    try {
      await api.updateWorkout({ id: rowId, changes: { trails: fitted.text } });
    } catch (err) {
      counts.failed += 1;
      note(`trails ${activityId}: tagged but not written (${redact(err.message || String(err))}); a later run retries`);
      detail(activityId, 'tagged but not written');
      return;
    }

    const kept = fitted.total - fitted.omitted;
    counts[kept ? 'tagged' : 'noTrail'] += 1;
    if (fitted.omitted) {
      note(`trails ${activityId}: tagged, but ${fitted.omitted} of ${fitted.total} passes were left out to fit the column`);
    }
    detail(activityId, kept ? `tagged (${kept} passes)` : 'tagged, no named trail');
    await record(fileId, activityId, { status: 'tagged', ...base, passes: kept, omitted: fitted.omitted });
  }

  return {
    ensure,
    counts,
    /** Every note for SyncLog: the per-activity ones, then the run's one deferral note. */
    notes() {
      const out = [...notes];
      if (counts.deferred) {
        out.push(`trails: ${counts.deferred} activities not looked up this run (${stopped}); a later run retries`);
      }
      return out;
    },
  };
}
