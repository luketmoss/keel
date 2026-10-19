// The MCP change log, and undo (#434).
//
// Every write made with the MCP-only key (MCP_API_KEY, held by the Keel MCP
// Worker) appends one `MCPChangeLog` row per sheet row it created, changed or
// deleted, with the whole row before and after. `getChangeLog` reads it back;
// `undoCall` reverts one call exactly, all or nothing, under the script lock.
// The Worker's `thrive_undo` (#412) is a thin layer over those two.
//
// Named "change log", never "journal": the `Journal` tab and `thrive_journal`
// are the daily notes.
//
// How a write is logged. The write modules are not touched. `withChangeLog`
// holds the script lock, reads the tabs the action can write before it runs
// and after it returns or throws, and logs the difference by row key. That is
// what makes the log hold exactly the rows that landed: a call that fails
// before writing changes nothing and logs nothing, and one that fails halfway
// logs the rows it got through. The cost is two reads of those tabs per MCP
// write, which is cheap at this sheet's size.
//
// A row is its domain object, field name to display value, in the column order
// of the tab's *_FIELDS, so undo restores a row without knowing which cell
// changed.

var CHANGE_LOG_SHEET = 'MCPChangeLog';

var CHANGE_LOG_MISSING =
  'MCPChangeLog tab missing — run scripts/migrate-423-mcp-change-log-tab.mjs';

/**
 * The MCP-key writes that are logged, and the tabs each can change. Sync-only
 * actions (upsertSyncedWorkout, upsertDailyHealth, ...) are never logged,
 * whatever key they arrive with.
 */
var CHANGE_LOGGED_ACTIONS = {
  createWorkout: ['Workouts'],
  updateWorkout: ['Workouts'],
  deleteWorkout: ['Workouts', 'Sets'],
  appendSets: ['Sets'],
  updateSets: ['Sets'],
  createExercise: ['Exercises'],
  updateExercise: ['Exercises', 'Templates', 'Sets'],
  deleteExercise: ['Exercises'],
  createTemplate: ['Templates'],
  replaceTemplate: ['Templates'],
  upsertJournal: ['Journal'],
};

var CHANGE_LOG_DEFAULT_LIMIT = 200;
var CHANGE_LOG_MAX_LIMIT = 1000;

/**
 * The tabs the log covers, by the name the log uses: the sheet, its fields in
 * column order, and the fields that identify a row. Built on demand, not at
 * load, because it reads other files' globals.
 */
function changeTabs() {
  return {
    Workouts: { sheet: 'Workouts', fields: WORKOUT_FIELDS, key: ['id'] },
    Exercises: { sheet: 'Exercises', fields: EXERCISE_FIELDS, key: ['id'] },
    Journal: { sheet: 'Journal', fields: JOURNAL_FIELDS, key: ['date'] },
    Templates: { sheet: 'Templates', fields: TEMPLATE_FIELDS, key: ['template_id', 'order'] },
    // Sets have no id: the slot, the same identity sets.js addresses them by.
    Sets: { sheet: 'Sets', fields: SET_FIELDS, key: ['workout_id', 'section', 'exercise_order', 'set_number'] },
  };
}

/**
 * Whether the log is meant to be written for this caller and action.
 * @param {{mode: string}} caller
 */
function isChangeLogged(caller, action) {
  return caller && caller.mode === 'mcp' &&
    Object.prototype.hasOwnProperty.call(CHANGE_LOGGED_ACTIONS, action);
}

/**
 * A valid call id is 1-64 characters of [A-Za-z0-9_-]. An invalid or missing
 * one is replaced, never refused, so a write cannot fail over its log.
 */
function resolveChangeCallId(raw) {
  if (typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw;
  return Utilities.getUuid();
}

/** `call_id` from a raw `payload` parameter, or undefined. Never throws. */
function payloadCallId(rawPayload) {
  if (!rawPayload || rawPayload.length > MAX_PAYLOAD_CHARS) return undefined;
  try {
    return JSON.parse(rawPayload).call_id;
  } catch (err) {
    return undefined;
  }
}

/**
 * One tab's rows as `{ fullKey: { key, obj, rowNum } }`. A row's key is its
 * identity fields; a second row with the same identity gets `dup: n` so
 * neither is lost. A tab that does not exist reads as empty.
 */
function readTabRows(tabName) {
  var tab = changeTabs()[tabName];
  var sheet = getSpreadsheet().getSheetByName(tab.sheet);
  var map = {};
  if (!sheet) return map;
  var seen = {};
  var rows = getAllRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    var obj = {};
    var blank = true;
    for (var f = 0; f < tab.fields.length; f++) {
      obj[tab.fields[f]] = cell(rows[i][f]);
      if (obj[tab.fields[f]] !== '') blank = false;
    }
    if (blank) continue;
    var key = {};
    for (var k = 0; k < tab.key.length; k++) key[tab.key[k]] = obj[tab.key[k]];
    var base = JSON.stringify(key);
    var n = seen[base] || 0;
    seen[base] = n + 1;
    if (n > 0) key.dup = n;
    map[JSON.stringify(key)] = { key: key, obj: obj, rowNum: i + 2 };
  }
  return map;
}

function snapshotTabs(tabNames) {
  var out = {};
  for (var i = 0; i < tabNames.length; i++) out[tabNames[i]] = readTabRows(tabNames[i]);
  return out;
}

function sameChangeRow(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Log entries for what differs between two snapshots: deletes, updates, creates. */
function diffSnapshots(before, after) {
  var entries = [];
  Object.keys(before).forEach(function (tab) {
    var b = before[tab];
    var a = after[tab];
    Object.keys(b).forEach(function (fk) {
      if (!Object.prototype.hasOwnProperty.call(a, fk)) {
        entries.push({ tab: tab, row_key: fk, before: b[fk].obj, after: null });
      } else if (!sameChangeRow(b[fk].obj, a[fk].obj)) {
        entries.push({ tab: tab, row_key: fk, before: b[fk].obj, after: a[fk].obj });
      }
    });
    Object.keys(a).forEach(function (fk) {
      if (!Object.prototype.hasOwnProperty.call(b, fk)) {
        entries.push({ tab: tab, row_key: fk, before: null, after: a[fk].obj });
      }
    });
  });
  return entries;
}

/** Append entries to MCPChangeLog in one write. Display text, like every write here. */
function appendChangeLog(callId, action, entries) {
  if (!entries.length) return;
  var sheet = getSheet(CHANGE_LOG_SHEET);
  var now = isoNow();
  var rows = entries.map(function (e) {
    return asText([
      now, callId, action, e.tab, e.row_key,
      e.before ? JSON.stringify(e.before) : '',
      e.after ? JSON.stringify(e.after) : '',
    ]);
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CHANGE_LOG_COLUMN_COUNT).setValues(rows);
}

/**
 * Run an MCP write and log the rows it changed, under one script lock.
 *
 * Refuses, before writing anything, when the MCPChangeLog tab is missing: an
 * unlogged write is worse than a refused one. `fn` returns the response
 * envelope; a throw is logged for the rows that landed and then rethrown.
 *
 * @param {string} action
 * @param {Object} params - the request parameters (`payload` carries `call_id`)
 * @param {function(): Object} fn - runs the action
 */
function withChangeLog(action, params, fn) {
  var tabs = CHANGE_LOGGED_ACTIONS[action];
  var callId = resolveChangeCallId(payloadCallId(params.payload));
  return withScriptLock(function () {
    if (!getSpreadsheet().getSheetByName(CHANGE_LOG_SHEET)) return fail(CHANGE_LOG_MISSING);

    var before = snapshotTabs(tabs);
    var result;
    var thrown = null;
    try {
      result = fn();
    } catch (err) {
      thrown = err;
    }
    appendChangeLog(callId, action, diffSnapshots(before, snapshotTabs(tabs)));
    if (thrown) throw thrown;
    return result;
  });
}

function parseLogCell(text) {
  return text ? JSON.parse(text) : null;
}

/** Every change-log row, in the order logged, with the JSON cells parsed. */
function readChangeLogRows() {
  var sheet = getSpreadsheet().getSheetByName(CHANGE_LOG_SHEET);
  if (!sheet) throw new Error(CHANGE_LOG_MISSING);
  return getAllRows(sheet).map(function (row) {
    return {
      logged_at: cell(row[0]),
      call_id: cell(row[1]),
      action: cell(row[2]),
      tab: cell(row[3]),
      row_key: cell(row[4]),
      before: parseLogCell(cell(row[5])),
      after: parseLogCell(cell(row[6])),
    };
  }).filter(function (r) { return r.call_id !== ''; });
}

/**
 * The change log, newest call first (#434). `call_id` narrows to one call,
 * `since` (ISO time) to rows logged at or after it, `limit` caps the rows
 * returned (default 200, max 1000). Key-only: not on TOKEN_READ_ACTIONS.
 */
function getChangeLog(filters) {
  filters = filters || {};
  var limit = Number(filters.limit);
  if (!limit || limit < 1) limit = CHANGE_LOG_DEFAULT_LIMIT;
  limit = Math.min(Math.floor(limit), CHANGE_LOG_MAX_LIMIT);

  var rows = readChangeLogRows().filter(function (r) {
    if (filters.call_id && r.call_id !== filters.call_id) return false;
    if (filters.since && r.logged_at < filters.since) return false;
    return true;
  });

  // Calls newest first, rows within a call in the order they were logged.
  var lastIndex = {};
  rows.forEach(function (r, i) { lastIndex[r.call_id] = i; });
  var callIds = Object.keys(lastIndex).sort(function (a, b) { return lastIndex[b] - lastIndex[a]; });
  var out = [];
  callIds.forEach(function (id) {
    rows.forEach(function (r) {
      if (r.call_id === id) {
        out.push({
          logged_at: r.logged_at, call_id: r.call_id, action: r.action, tab: r.tab,
          row_key: JSON.parse(r.row_key), before: r.before, after: r.after,
        });
      }
    });
  });
  return out.slice(0, limit);
}

/**
 * What reverting `rows` (newest first) would do, against the sheet as it is
 * now. Returns { changes, conflicts }; nothing is written. Each step is
 * applied to an in-memory copy, so a call that touched one row twice is
 * checked against the state its later rows leave behind.
 */
function planChangeUndo(rows) {
  var state = {};
  var changes = [];
  var conflicts = [];

  rows.forEach(function (r) {
    if (!changeTabs()[r.tab]) {
      conflicts.push({ tab: r.tab, row_key: JSON.parse(r.row_key), current: null, expected: r.after });
      return;
    }
    if (!state[r.tab]) state[r.tab] = readTabRows(r.tab);
    var map = state[r.tab];
    var cur = Object.prototype.hasOwnProperty.call(map, r.row_key) ? map[r.row_key] : null;
    var key = JSON.parse(r.row_key);

    // The row must still be exactly what the call left.
    if (r.after) {
      if (!cur || !sameChangeRow(cur.obj, r.after)) {
        conflicts.push({ tab: r.tab, row_key: key, current: cur ? cur.obj : null, expected: r.after });
        return;
      }
    } else if (cur) {
      conflicts.push({ tab: r.tab, row_key: key, current: cur.obj, expected: null });
      return;
    }

    changes.push({
      tab: r.tab, row_key: r.row_key, key: key,
      current: cur ? cur.obj : null, restore: r.before,
    });
    if (r.before) map[r.row_key] = { key: key, obj: r.before, rowNum: cur ? cur.rowNum : 0 };
    else delete map[r.row_key];
  });

  return { changes: changes, conflicts: conflicts };
}

/** Put the planned rows back: in-place rewrites, then deletes bottom-up, then appends. */
function applyChangeUndo(changes) {
  var byTab = {};
  changes.forEach(function (c) {
    (byTab[c.tab] = byTab[c.tab] || []).push(c);
  });

  Object.keys(byTab).forEach(function (tabName) {
    var tab = changeTabs()[tabName];
    var sheet = getSheet(tab.sheet);
    var live = readTabRows(tabName);
    var toDelete = [];
    var toAppend = [];
    var asRow = function (obj) {
      return tab.fields.map(function (f) { return obj[f]; });
    };

    byTab[tabName].forEach(function (c) {
      var at = Object.prototype.hasOwnProperty.call(live, c.row_key) ? live[c.row_key] : null;
      if (c.restore && at) {
        sheet.getRange(at.rowNum, 1, 1, tab.fields.length).setValues([asText(asRow(c.restore))]);
      } else if (c.restore) {
        toAppend.push(asText(asRow(c.restore)));
      } else if (at) {
        toDelete.push(at.rowNum);
      }
    });

    toDelete.sort(function (a, b) { return b - a; });
    for (var i = 0; i < toDelete.length; i++) sheet.deleteRow(toDelete[i]);
    if (toAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, tab.fields.length).setValues(toAppend);
    }
  });
}

/**
 * Revert one MCP call (#434). Dry-run unless `confirm` is true.
 *
 * All or nothing: if any row the call touched no longer holds what the call
 * left, nothing is restored and the thrown error carries every conflict as
 * `err.preview`. The revert is itself logged, as a new call with action
 * `undo`, so it can be undone the same way.
 */
function undoCall(callId, confirm) {
  return withScriptLock(function () {
    var rows = readChangeLogRows().filter(function (r) { return r.call_id === callId; });
    if (rows.length === 0) throw new Error('No MCP call ' + callId + ' in the change log');
    rows.reverse();

    var plan = planChangeUndo(rows);
    if (plan.conflicts.length > 0) {
      var err = new Error(
        'Nothing undone: ' + plan.conflicts.length + ' row(s) changed since call ' + callId
      );
      err.preview = { dry_run: !confirm, call_id: callId, conflicts: plan.conflicts };
      throw err;
    }

    var described = plan.changes.map(function (c) {
      return { tab: c.tab, row_key: c.key, current: c.current, restore: c.restore };
    });
    if (!confirm) {
      return { dry_run: true, call_id: callId, count: described.length, rows: described };
    }

    applyChangeUndo(plan.changes);
    var undoCallId = Utilities.getUuid();
    appendChangeLog(undoCallId, 'undo', plan.changes.map(function (c) {
      return { tab: c.tab, row_key: c.row_key, before: c.current, after: c.restore };
    }));
    return {
      dry_run: false, call_id: callId, undo_call_id: undoCallId,
      count: described.length, rows: described,
    };
  });
}
