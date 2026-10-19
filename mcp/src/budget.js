// The write ceilings (#410), as plain functions of a list of entries and a clock.
//
// Two ceilings, both per app:
//
//  - rows per call (`maxRowsPerCall`): enforced by each Thrive write tool from
//    the plan it has already validated, as a dry run until `confirm: true`;
//  - writes and rows per rolling hour (`maxWritesPerHour`, `maxRowsPerHour`):
//    a counter held in one Durable Object per app (budget-do.ts), which calls
//    `reserveWindow` below. There is no `confirm` past this one, because a
//    loop can send `confirm` as easily as anything else.
//
// An entry is `{ t, rows }`: a timestamp and a row count, nothing else. It
// never holds an argument or a value, so no app data reaches Cloudflare.
//
// Plain JS, not TS, because the tool modules that use it run under `node --test`.

export const DEFAULT_LIMITS = Object.freeze({
  maxRowsPerCall: 200,
  maxWritesPerHour: 40,
  maxRowsPerHour: 600,
});

export const WINDOW_MS = 60 * 60 * 1000;

const HOME_ZONE = 'America/Denver';

/** A positive whole number, or the default. A bad value never means "unlimited". */
function positiveInt(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** The ceilings from the Worker's vars (`MAX_ROWS_PER_CALL` and the two hourly ones). */
export function parseLimits(env = {}) {
  return {
    maxRowsPerCall: positiveInt(env.MAX_ROWS_PER_CALL, DEFAULT_LIMITS.maxRowsPerCall),
    maxWritesPerHour: positiveInt(env.MAX_WRITES_PER_HOUR, DEFAULT_LIMITS.maxWritesPerHour),
    maxRowsPerHour: positiveInt(env.MAX_ROWS_PER_HOUR, DEFAULT_LIMITS.maxRowsPerHour),
  };
}

/**
 * Admit one write call, or say when writing resumes.
 *
 * `entries` are the calls already admitted; the result's `entries` replace
 * them (expired ones dropped, this call added when allowed). A call is refused
 * once the window already holds `maxWritesPerHour` calls or `maxRowsPerHour`
 * rows, whatever this call would add.
 *
 * @param {{t: number, rows: number}[]} entries
 * @param {number} now - epoch milliseconds
 * @param {number} rows - what this call will write
 * @param {{maxWritesPerHour: number, maxRowsPerHour: number}} limits
 * @returns {{allowed: true, entries: {t: number, rows: number}[]} |
 *   {allowed: false, entries: {t: number, rows: number}[], reason: 'writes' | 'rows', limit: number, resumesAt: number}}
 */
export function reserveWindow(entries, now, rows, limits) {
  const live = entries.filter((e) => e.t > now - WINDOW_MS).sort((a, b) => a.t - b.t);

  if (live.length >= limits.maxWritesPerHour) {
    // The oldest call leaving the window is what brings the count under the limit.
    const drop = live.length - limits.maxWritesPerHour;
    return {
      allowed: false,
      entries: live,
      reason: 'writes',
      limit: limits.maxWritesPerHour,
      resumesAt: live[drop].t + WINDOW_MS,
    };
  }

  let total = live.reduce((sum, e) => sum + e.rows, 0);
  if (total >= limits.maxRowsPerHour) {
    // Drop calls oldest first until the rows fall under the limit.
    let i = 0;
    while (total >= limits.maxRowsPerHour) total -= live[i++].rows;
    return {
      allowed: false,
      entries: live,
      reason: 'rows',
      limit: limits.maxRowsPerHour,
      resumesAt: live[i - 1].t + WINDOW_MS,
    };
  }

  return { allowed: true, entries: [...live, { t: now, rows }] };
}

/** `HH:MM` on the 24-hour clock in the home zone. */
export function formatResume(epochMs) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HOME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(epochMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/**
 * What a refused write call says. Names what was exceeded and when writing
 * resumes; reads are not limited, and it says so.
 *
 * @param {'Thrive' | 'Hive'} app
 * @param {{reason: 'writes' | 'rows', limit: number, resumesAt: number}} denial
 */
export function limitMessage(app, denial) {
  const what = denial.reason === 'writes' ? 'writes' : 'rows';
  return (
    `Write limit reached for ${app}: ${denial.limit} ${what} in the last hour. ` +
    `Writing resumes at ${formatResume(denial.resumesAt)} (${HOME_ZONE}). Reads still work.`
  );
}

/**
 * Thrown when the hourly budget refuses a write call. Its message is the whole
 * tool error, with no "Error:" prefix: `limitMessage` is the wording agents see.
 */
export class WriteLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WriteLimitError';
  }
}
