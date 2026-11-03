// Sheet access and row <-> object mapping.

function getSpreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set in script properties');
  return id;
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(getSpreadsheetId());
}

function getSheet(name) {
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found');
  return sheet;
}

function isoNow() {
  return new Date().toISOString();
}

/** Today's date in TIMEZONE as YYYY-MM-DD. Never slice an ISO timestamp. */
function todayLocal() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
}

/**
 * All data rows from a sheet, header row skipped, as the cells DISPLAY.
 *
 * Display values, not getValues(): that is what the SPA reads (the REST API's
 * default FORMATTED_VALUE), so both sides see the same thing. getValues()
 * hands back a Date object for any cell Sheets parsed as a date, and
 * String(date) is "Thu Jan 01 2099 00:00:00 GMT-0700" — which an update then
 * wrote back over the date. Every read in this project goes through display
 * values for that reason (#132).
 */
function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
}

/**
 * A row made safe to hand to appendRow / setValues: every value stored as
 * literal text.
 *
 * Those two methods behave like typing into the cell, not like the RAW writes
 * the SPA makes through the REST API. Typed, "2026-03-04" becomes a date,
 * "07:00" a time, "3720" a number and "=anything" a live formula. A leading
 * apostrophe is Sheets' own escape: the rest is stored exactly as given and
 * the apostrophe is not part of the value, so a later read sees "2026-03-04".
 *
 * That also closes formula injection — a note beginning with "=" is text.
 *
 * '' stays '' — an escaped empty string would be a cell holding "", which
 * reads back as unset anyway, but there is no reason to write one.
 */
function asText(values) {
  return values.map(function (v) {
    var s = cell(v);
    return s === '' ? '' : "'" + s;
  });
}

/**
 * A cell as a string, with unset meaning ''.
 *
 * The whole nullable discipline rests here (#101, #128 AC2/AC3): a row
 * written before a column existed comes back short, so the cell is
 * `undefined`; an empty cell comes back as `''`. Neither may become `0`, and
 * `String(undefined)` must never be allowed to produce "undefined".
 *
 * A genuine `0` in the sheet survives as `'0'`, which is the distinction the
 * activity columns exist to preserve — nobody said is not the same as zero.
 */
function cell(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

/**
 * A Workouts row -> the API's workout object, all 28 fields present.
 *
 * Derived from WORKOUT_FIELDS rather than written out, so the read and write
 * mappers cannot disagree about which columns exist.
 */
function rowToWorkout(row, sheetRow) {
  var workout = {};
  for (var i = 0; i < WORKOUT_FIELDS.length; i++) {
    workout[WORKOUT_FIELDS[i]] = cell(row[i]);
  }
  // Not a column — the 1-based sheet row, so a caller can write back to the
  // row it read without re-scanning. Mirrors `sheetRow` in the other two.
  workout.sheetRow = sheetRow;
  return workout;
}

/**
 * A workout object -> a 28-cell row.
 *
 * Always exactly WORKOUT_COLUMN_COUNT cells: Sheets writes every value it is
 * handed regardless of the range, so a short row leaves stale cells behind
 * and an `undefined` writes the string "undefined".
 */
function workoutToRow(workout) {
  var row = [];
  for (var i = 0; i < WORKOUT_FIELDS.length; i++) {
    row.push(cell(workout[WORKOUT_FIELDS[i]]));
  }
  return row;
}

/** The 1-based sheet row holding this workout id, or -1. */
function findWorkoutRow(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

/** Rejects a value not in `allowed`. '' is always permitted — unset is legal. */
function validateEnum(field, value, allowed) {
  if (value === undefined || value === '') return '';
  var v = String(value);
  if (allowed.indexOf(v) === -1) {
    throw new Error(
      'Invalid ' + field + ': "' + v + '". Expected one of: ' + allowed.join(', ')
    );
  }
  return v;
}

/** A local calendar date, or throws. Format only — any real date is allowed. */
function validateDate(field, value) {
  var v = String(value === undefined ? '' : value);
  if (v === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error('Invalid ' + field + ': "' + v + '". Expected YYYY-MM-DD.');
  }
  return v;
}

/**
 * Run `fn` holding the script lock, so two API callers cannot interleave a
 * read-then-write (#156). A scheduled sync overlapping a local one would
 * otherwise both see "no row" and both append. The SPA writes Sheets directly
 * and is not covered; the sync's writes are the ones that race each other.
 *
 * Re-entrant within one execution (#434): an MCP write is logged under the lock
 * `withChangeLog` already holds, and some of those writes (`upsertJournal`) take
 * it themselves. The inner call runs inside the outer one's hold.
 */
var SCRIPT_LOCK_DEPTH = 0;

function withScriptLock(fn) {
  if (SCRIPT_LOCK_DEPTH > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  SCRIPT_LOCK_DEPTH++;
  try {
    return fn();
  } finally {
    SCRIPT_LOCK_DEPTH--;
    lock.releaseLock();
  }
}

// --- Refusals and checks shared by the Spin actions (#765) ---------------------
//
// The Spin key lives on a phone, so none of these quotes the caller's input back:
// every message is fixed text. Spin's upload queue reads `code: 'bad_request'` as a
// permanent refusal (drop it and show it) against a transient failure (`Lock
// timeout`, a network error), which it retries.

/** An error that goes back as `code: 'bad_request'`. handleRequest reads `.code`. */
function badRequest(message) {
  var err = new Error(message);
  err.code = 'bad_request';
  return err;
}

/** What a Spin action answers when `payload` is over the length limit or not JSON. */
var SPIN_BAD_PAYLOAD =
  'payload must be JSON of at most 6000 characters. A longer one is truncated in transit, so it is refused.';

/** An id a caller generates: 1-64 of letters, digits, `_` and `-`. */
var SPIN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A plain JSON object, never null, an array or a scalar. */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Whether `obj` has no key outside `allowed`. */
function hasOnlyKeys(obj, allowed) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && allowed.indexOf(key) === -1) return false;
  }
  return true;
}

/** Whether `obj` has `key` set to something other than undefined. */
function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined;
}

/** A JSON number that is a whole number in [min, max]. Strings are not numbers here. */
function isWholeIn(value, min, max) {
  return typeof value === 'number' && isFinite(value) && Math.floor(value) === value &&
    value >= min && value <= max;
}

/**
 * A whole number in [min, max] from a JSON number or a string of digits, else null:
 * the forms a phone or the MCP Worker sends. Not a way to send a decimal.
 */
function spinWhole(value, min, max) {
  var n = value;
  if (typeof value === 'string' && /^\d{1,9}$/.test(value.trim())) n = Number(value.trim());
  return isWholeIn(n, min, max) ? n : null;
}

/** A real local calendar date, YYYY-MM-DD: 2026-02-30 is not one. */
function isRealLocalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  var y = Number(value.slice(0, 4));
  var m = Number(value.slice(5, 7));
  var d = Number(value.slice(8, 10));
  var date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The payload as an object, or a fixed-text refusal. */
function spinPayload(payload) {
  if (!isPlainObject(payload)) throw badRequest('payload must be a JSON object');
  return payload;
}

/** A caller-supplied id, or a fixed-text refusal that names the field and nothing else. */
function checkSpinId(value, field) {
  if (typeof value !== 'string' || !SPIN_ID_PATTERN.test(value)) {
    throw badRequest(field + ' must be 1 to 64 characters of letters, digits, _ and -');
  }
  return value;
}
