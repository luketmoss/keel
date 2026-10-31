// Sheet access and the small helpers every file shares.

function getSpreadsheet() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set in script properties');
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  var sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found. Run the 703 migration (ensureSchema).');
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
 * A cell as a string, with unset meaning ''. `undefined` (a row written before
 * a column existed) and `null` must never become 0 or "undefined".
 */
function cell(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Prefix each value with an apostrophe, Sheets' own escape.
 *
 * appendRow and setValues behave like typing into a cell: "2026-03-04"
 * becomes a date, "0042" the number 42, "=anything" a live formula. The
 * apostrophe makes the value stored exactly as given, and a formula can never
 * be injected. Every write goes through here. '' stays ''.
 */
function asText(values) {
  return values.map(function (v) {
    var s = cell(v);
    return s === '' ? '' : "'" + s;
  });
}

/**
 * Run `fn` holding the script lock. Re-entrant: a write that calls another
 * write runs inside the outer one's hold.
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

/** `<prefix>_` + 8 hex characters, for a create that sent no id. */
function newId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
}

/**
 * The id a create uses: the caller's own, so a retry upserts one row, or a new
 * one with the entity's prefix.
 */
function idFor(given, prefix) {
  if (given === undefined || given === null || given === '') return newId(prefix);
  var id = String(given);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error('id must be 1-64 characters of letters, digits, _ and -');
  }
  return id;
}

function requireString(field, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(field + ' is required');
  return value.trim();
}

function optionalString(field, value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(field + ' must be text');
  return value;
}

function validateEnum(field, value, allowed, optional) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (allowed.indexOf(value) === -1) {
    throw new Error(field + ' must be one of ' + allowed.join(', ') + (optional ? ', or blank' : ''));
  }
  return value;
}

/** YYYY-MM-DD and a real calendar day. */
function validateDate(field, value, optional) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  var s = String(value === undefined || value === null ? '' : value);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 &&
        d.getUTCDate() === Number(m[3])) {
      return s;
    }
  }
  throw new Error(field + ' must be a date as YYYY-MM-DD');
}

/**
 * A number, or null for blank. Blank means unknown: nothing here turns it
 * into 0. `min` is inclusive; `positive` refuses 0.
 */
function optionalNumber(field, value, opts) {
  if (value === undefined || value === null || value === '') return null;
  var n = typeof value === 'number' ? value : Number(String(value).trim());
  if (typeof n !== 'number' || !isFinite(n)) throw new Error(field + ' must be a number');
  opts = opts || {};
  if (opts.positive && !(n > 0)) throw new Error(field + ' must be greater than 0');
  if (opts.min !== undefined && n < opts.min) throw new Error(field + ' must be at least ' + opts.min);
  if (opts.max !== undefined && n > opts.max) throw new Error(field + ' must be at most ' + opts.max);
  if (opts.integer && Math.floor(n) !== n) throw new Error(field + ' must be a whole number');
  return n;
}

function toBool(value) {
  return value === true || value === 'true' || value === 'TRUE';
}

/** Round to 0.1, keeping null as null. */
function round1(n) {
  return n === null || n === undefined ? null : Math.round(n * 10) / 10;
}

/** The object's own keys that the caller sent, for merging an update. */
function has(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}
