// One ingest pass (#152): fetch the window's COROS data and land it, unmodified,
// in the Drive archive. Nothing here writes to the sheet or calls the Thrive
// API; #153 normalizes from the archive.
//
// COROS answers every tool in prose (#133). The only prose read here is the
// activity list, and only for what the detail call needs (labelId, sportType)
// and where the file goes (the start timestamp). Everything else is stored as
// served.

import { entryIdentity } from './archive.mjs';
import { SPORT_RECORDS_LIMIT } from './config.mjs';
import { chunkRange, corosDate, localDate, syncWindow } from './dates.mjs';
import { CorosUnavailableError, DriveAuthError } from './errors.mjs';
import { redact } from './redact.mjs';
import { withRetry } from './retry.mjs';

export const LIST_TOOL = 'querySportRecords';
export const DETAIL_TOOL = 'getActivityDetail';

/**
 * Text COROS returns *as a successful result* when it is really failing.
 * The first is the May 2026 outage (sync plan §2); the second is what an
 * unknown labelId gets, with `isError: false` (seen in #152).
 */
const ANOMALY_TEXT = /Tool call anomalies detected/i;
const ERROR_TEXT = [/temporarily unavailable/i, ANOMALY_TEXT];

/**
 * COROS's anomaly guard (#860) answers a burst of calls with ANOMALY_TEXT.
 * Retrying it 2 s later lands in the same burst, so it waits longer, still
 * three attempts in all. A run spends at most ANOMALY_BUDGET_MS on these
 * waits; past that it falls back to the normal delays, so a COROS that flags
 * everything cannot push a run into the job's 20-minute timeout.
 */
export const ANOMALY_DELAYS_MS = [30_000, 90_000];
export const ANOMALY_BUDGET_MS = 5 * 60_000;

/** A run's allowance for anomaly waits, shared by every call in it. */
export const anomalyBudget = (ms = ANOMALY_BUDGET_MS) => ({ remainingMs: ms });

/**
 * An archived activity that started longer ago than this, and whose list entry
 * is unchanged, is not fetched again (#860). A recent one is, while COROS may
 * still be settling its numbers.
 */
export const REFETCH_RECENT_MS = 48 * 60 * 60 * 1000;

/** The unauthenticated FIT URL (sync plan §2) must never be archived. */
const FIT_URL = /s3\.coros\.com\/fit\//i;

/** A tool call that failed, however COROS chose to say so. */
export class CorosToolError extends Error {
  constructor(tool, detail, { anomaly = false } = {}) {
    super(`${tool}: ${detail}`);
    this.name = 'CorosToolError';
    this.tool = tool;
    this.anomaly = anomaly;
  }
}

/**
 * A result's text, exactly as served. Every COROS tool answers with a single
 * text item (#133); were there several, they are joined in order.
 */
export function resultText(result) {
  return (result?.content ?? []).filter((c) => c?.type === 'text').map((c) => c.text).join('\n');
}

/**
 * The payload of one tool call, or a CorosToolError. Errors, error results and
 * error text are retried with backoff, three attempts in all, and never
 * returned as a payload: an archived error would change the hash and be
 * normalized as data. The anomaly text waits ANOMALY_DELAYS_MS instead, while
 * `anomaly` (the run's anomalyBudget; a fresh one when omitted) has room.
 */
export async function callTool(client, tool, args, { retry = {}, anomaly = anomalyBudget(), log = () => {} } = {}) {
  const delayFor = (err, attempt, ms) => {
    const long = ANOMALY_DELAYS_MS[attempt];
    if (!err?.anomaly || long === undefined || long > anomaly.remainingMs) return ms;
    anomaly.remainingMs -= long;
    log(`  COROS anomaly guard on ${tool}, attempt ${attempt + 1} of 3: waiting ${long / 1000} s`);
    return long;
  };
  try {
    return await withRetry(async () => {
      const result = await client.callTool({ name: tool, arguments: args });
      const text = resultText(result);
      if (result?.isError) throw new CorosToolError(tool, `error result: ${text.slice(0, 200)}`);
      if (ERROR_TEXT.some((re) => re.test(text))) {
        throw new CorosToolError(tool, `error text: ${text.slice(0, 200)}`, { anomaly: ANOMALY_TEXT.test(text) });
      }
      if (!text) throw new CorosToolError(tool, 'empty result');
      return text;
    }, { isRetryable: () => true, delayFor, ...retry });
  } catch (err) {
    if (err instanceof CorosToolError) throw err;
    throw new CorosToolError(tool, redact(err.message || String(err)));
  }
}

/** COROS wraps its prose in a JSON string; unwrap it for reading, never for storing. */
export function prose(text) {
  if (!text.startsWith('"')) return text;
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * The activities in a `querySportRecords` result. A record that cannot be read
 * fails the whole list rather than being skipped: a silently dropped activity
 * is invisible forever, which is the failure sync plan §6 exists to prevent.
 *
 * @returns {{ activityId: string, sportType: number, name: string, date: string,
 *   startTimestamp: number | null, endTimestamp: number | null, text: string }[]}
 */
export function parseSportRecords(text) {
  const body = prose(text);
  const declared = body.match(/\((\d+) records?\)/);
  const blocks = body.split(/\n(?=\d+\. )/).slice(1);
  const entries = blocks.map((block) => {
    const head = block.match(/^\d+\. (.*?) — (\d{4}-\d{2}-\d{2})/);
    const ids = block.match(/LabelId:\s*(\d+)\s*\|\s*SportType:\s*(\d+)/);
    if (!head || !ids) throw new Error(`unreadable sport record: ${block.slice(0, 120)}`);
    const start = block.match(/startTimestamp=(\d+)/);
    const end = block.match(/endTimestamp=(\d+)/);
    return {
      activityId: ids[1],
      sportType: Number(ids[2]),
      name: head[1],
      date: head[2],
      startTimestamp: start ? Number(start[1]) : null,
      endTimestamp: end ? Number(end[1]) : null,
      text: block.trimEnd(),
    };
  });
  if (declared && Number(declared[1]) !== entries.length) {
    throw new Error(`the list declares ${declared[1]} records but ${entries.length} were read`);
  }
  if (!declared && entries.length === 0 && !/^No sport records found/i.test(body)) {
    throw new Error(`unrecognized sport records result: ${body.slice(0, 120)}`);
  }
  return entries;
}

/**
 * Whether the archive already holds this activity as the list now describes
 * it, long enough ago that its detail has settled. An activity with no start
 * time is always fetched.
 */
async function unchangedSinceArchived(archive, entry, now) {
  if (entry.startTimestamp == null || now - entry.startTimestamp * 1000 <= REFETCH_RECENT_MS) return false;
  const archived = await archive.readActivity(entry.activityId);
  return Boolean(archived?.data?.payload) && entryIdentity(archived.data.list_entry) === entryIdentity(entry);
}

/** The activity's local start date: its timestamp in Denver, else COROS's own date. */
const activityLocalDate = (entry) =>
  entry.startTimestamp ? localDate(entry.startTimestamp * 1000) : entry.date;

/**
 * The daily-health calls for a window (AC3). Range tools get the whole window;
 * "last N days" tools get D − 10 through D; sleep HRV is split into ranges of
 * at most 7 days. Recovery and fitness take no date: they are the state as of
 * `fetched_at` (sync plan §2).
 */
export function healthCalls({ start, end, recentDays }) {
  return [
    ['queryDailyHealthData', { days: recentDays }],
    ['querySleepOverview', { startDate: corosDate(start), endDate: corosDate(end) }],
    ['queryRestingHeartRate', { days: recentDays }],
    ['queryTrainingLoadAssessment', { days: recentDays }],
    ...chunkRange(start, end).map(([from, to]) =>
      ['querySleepHrv', { startDate: corosDate(from), endDate: corosDate(to) }]),
    ['queryRecoveryStatus', {}],
    ['queryFitnessAssessmentOverview', {}],
  ];
}

/**
 * Every tool this module calls, checked against `tools/list` before a run so a
 * renamed tool fails loudly up front. (#152's spec named `querySleepData`;
 * the live server calls it `querySleepOverview`.)
 */
export const REQUIRED_TOOLS = [
  LIST_TOOL, DETAIL_TOOL, 'queryDailyHealthData', 'querySleepOverview', 'queryRestingHeartRate',
  'queryTrainingLoadAssessment', 'querySleepHrv', 'queryRecoveryStatus', 'queryFitnessAssessmentOverview',
];

function guardPayload(tool, payload) {
  if (FIT_URL.test(payload)) throw new CorosToolError(tool, 'payload contains a FIT download URL; not archived');
}

/**
 * An archived activity whose list entry is unchanged and which started more
 * than REFETCH_RECENT_MS ago is not fetched again: it counts as `unchanged`
 * and in `detailSkipped` (#860). The list carries what an edit in COROS
 * changes (name, times, duration, distance, HR, calories), so re-fetching
 * every detail every run only fed COROS's anomaly guard.
 *
 * @returns {Promise<{ window: object, activities: { created: number, updated: number,
 *   unchanged: number }, detailSkipped: number, activityIds: string[], failures: string[],
 *   health: string | null }>}
 *   `failures` is empty on a clean run. The caller exits non-zero otherwise.
 *   `activityIds` is every activity the list named, fetched or not: #166
 *   merges each one from whatever the archive holds for it.
 * @throws CorosUnavailableError when the activity list cannot be fetched.
 */
export async function ingest({ client, archive, now = Date.now(), log = console.log, retry = {} }) {
  const window = syncWindow(now);
  const summary = {
    window, activities: { created: 0, updated: 0, unchanged: 0 }, detailSkipped: 0,
    activityIds: [], failures: [], health: null,
  };
  const anomaly = anomalyBudget();
  const call = (tool, args) => callTool(client, tool, args, { retry, anomaly, log });
  log(`Window ${window.start} to ${window.end} (run date ${window.runDate}, America/Denver).`);

  // --- activities ---------------------------------------------------------
  const listArgs = { startDate: corosDate(window.start), endDate: corosDate(window.end), limit: SPORT_RECORDS_LIMIT };
  let listText;
  try {
    listText = await call(LIST_TOOL, listArgs);
  } catch (err) {
    throw new CorosUnavailableError(`${LIST_TOOL} failed, so no activity was fetched: ${err.message}`);
  }
  // A list that cannot be read ends the run too, but it is a format change to
  // fix in parseSportRecords, not an outage to wait out.
  const entries = parseSportRecords(listText);
  if (entries.length >= SPORT_RECORDS_LIMIT) {
    summary.failures.push(`${LIST_TOOL} returned ${entries.length} records, its limit; the list may be truncated`);
  }
  log(`${entries.length} ${entries.length === 1 ? 'activity' : 'activities'} in the window.`);
  summary.activityIds = entries.map((e) => e.activityId);

  for (const entry of entries) {
    const args = { labelId: entry.activityId, sportType: entry.sportType };
    try {
      if (await unchangedSinceArchived(archive, entry, now)) {
        summary.activities.unchanged += 1;
        summary.detailSkipped += 1;
        log(`  activity ${entry.activityId} (${entry.name}, ${entry.date}): unchanged in the list, detail not re-fetched`);
        continue;
      }
      const payload = await call(DETAIL_TOOL, args);
      guardPayload(DETAIL_TOOL, payload);
      const { status, fileId } = await archive.upsertActivity({
        activityId: entry.activityId,
        localDate: activityLocalDate(entry),
        tool: DETAIL_TOOL,
        args,
        listEntry: entry,
        payload,
      });
      summary.activities[status] += 1;
      log(`  activity ${entry.activityId} (${entry.name}, ${entry.date}): ${status} ${fileId}`);
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      const message = `activity ${entry.activityId}: ${redact(err.message || String(err))}`;
      summary.failures.push(message);
      log(`  FAILED ${message}`);
    }
  }

  // --- daily health -------------------------------------------------------
  // All or nothing: a bundle missing one tool's payload would hash differently
  // and read as "no data". The next run fetches the whole bundle again.
  try {
    const calls = [];
    for (const [tool, args] of healthCalls(window)) {
      const payload = await call(tool, args);
      guardPayload(tool, payload);
      calls.push({ tool, args, payload });
    }
    const { status, fileId } = await archive.upsertHealth({
      runDate: window.runDate, window: { start: window.start, end: window.end }, calls,
    });
    summary.health = status;
    log(`  health ${window.runDate} (${calls.length} calls): ${status} ${fileId}`);
  } catch (err) {
    if (err instanceof DriveAuthError) throw err;
    const message = `health ${window.runDate}: ${redact(err.message || String(err))}; bundle not written`;
    summary.failures.push(message);
    log(`  FAILED ${message}`);
  }

  return summary;
}
