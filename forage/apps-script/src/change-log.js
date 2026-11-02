// The MCP change log, and undo (#713), after Thrive's change-log.js (#434),
// which is the reference for its wording and conflict rules.
//
// Every write made with the key (the MCP Worker's FORAGE_API_KEY, and the
// owner's hand-run scripts) appends one `MCPChangeLog` row per sheet row it
// created, changed or deleted, with the whole row before and after.
// `getChangeLog` reads it back; `undoCall` reverts one call exactly, all or
// nothing, under the script lock. The Worker's `forage_undo` is a thin layer
// over those two. Token callers (the app) are never logged.
//
// How a write is logged. The entity files are not touched. `withChangeLog`
// holds the script lock, reads the tabs the action can write before it runs
// and after it returns or throws, and logs the difference by row key, so the
// log holds exactly the rows that landed: a call that fails before writing
// logs nothing, one that fails halfway logs the rows it got through.
//
// A row is field name to display text, in the column order of its TABS
// fields, so undo restores a row without knowing which cell changed.
//
// Stricter than Thrive: undo also refuses to remove a Foods, Recipes, Plan or
// Trips row that a row outside the call still uses, by #703's referential
// rules, so an undo can never leave a line, a meal or a log entry pointing at
// nothing.

var CHANGE_LOG_SHEET = 'MCPChangeLog';

var CHANGE_LOG_MISSING =
  'MCPChangeLog tab missing — run scripts/migrate-703-create-tabs.mjs again to add it';

/**
 * Every key-caller write action, and the tabs it can change. A write action in
 * main.js must be here or on NOT_LOGGED: `change-log.test.ts` fails otherwise,
 * so a new action cannot silently be un-undoable.
 *
 * importRecipe leaves out Config: the aliases a save learns stay learned after
 * an undo (an alias to a food that still exists is still true), and logging the
 * one shared Config row would make every import refuse to undo once a later
 * import had learned another alias. addStarterFoods leaves it out for the
 * same reason (#707).
 */
var CHANGE_LOGGED_ACTIONS = {
  upsertFood: ['Foods'],
  deleteFood: ['Foods'],
  setFoodWeight: ['Foods'],
  addStarterFoods: ['Foods'],
  upsertRecipe: ['Recipes', 'RecipeLines', 'Steps'],
  deleteRecipe: ['Recipes', 'RecipeLines', 'Steps', 'Walkthroughs', 'Cooks'],
  importRecipe: ['Foods', 'Recipes', 'RecipeLines', 'Steps'],
  setWalkthrough: ['Walkthroughs'],
  deleteWalkthrough: ['Walkthroughs'],
  upsertPlanEntry: ['Plan'],
  movePlanEntry: ['Plan'],
  deletePlanEntry: ['Plan'],
  planWeek: ['Plan'],
  createTrip: ['Trips'],
  updateTrip: ['Trips'],
  upsertTripItems: ['TripItems'],
  deleteTripItem: ['TripItems'],
  logFood: ['FoodLog'],
  updateLogEntry: ['FoodLog'],
  deleteLogEntry: ['FoodLog'],
  upsertCook: ['Cooks'],
  deleteCook: ['Cooks'],
};

/** The write actions that are never logged, and why. */
var NOT_LOGGED = [
  'ensureSchema', // the migration: creates tabs, never rows an undo could want back
  'setConfig', // the owner's configuration, set by hand
  'undoCall', // logs its own revert, as a new call that can itself be undone
];

var CHANGE_LOG_DEFAULT_LIMIT = 200;
var CHANGE_LOG_MAX_LIMIT = 1000;

/**
 * What a row's id is used by, for the undo's reference check: by tab, the
 * field in another tab that names it. `lines_json` holds plan ids in a list.
 * Recipes count their own lines, steps, walkthrough and cooks (#708): an undo removing a
 * recipe must also be removing every one of those.
 */
var CHANGE_REFERENCES = {
  Foods: [
    { tab: 'RecipeLines', field: 'food_id' },
    { tab: 'TripItems', field: 'food_id' },
    { tab: 'FoodLog', field: 'food_id' },
  ],
  Recipes: [
    { tab: 'RecipeLines', field: 'recipe_id' },
    { tab: 'Steps', field: 'recipe_id' },
    { tab: 'Walkthroughs', field: 'recipe_id' },
    { tab: 'Cooks', field: 'recipe_id' },
    { tab: 'Plan', field: 'recipe_id' },
    { tab: 'FoodLog', field: 'recipe_id' },
  ],
  Plan: [
    { tab: 'Cooks', field: 'plan_id' },
    { tab: 'TripItems', field: 'lines_json', inList: 'plan_id' },
  ],
  Trips: [
    { tab: 'Plan', field: 'trip_id' },
    { tab: 'TripItems', field: 'trip_id' },
  ],
};

/** Whether this caller's action is logged: a key caller, a logged action, and not an import's or planWeek's dry run. */
function isChangeLogged(caller, action, rawPayload) {
  if (!caller || caller.mode !== 'key') return false;
  if (!Object.prototype.hasOwnProperty.call(CHANGE_LOGGED_ACTIONS, action)) return false;
  if (action === 'importRecipe' || action === 'planWeek') {
    var dryRun = payloadField(rawPayload, 'dry_run');
    return dryRun === false || dryRun === 'false';
  }
  return true;
}

/**
 * A valid call id is 1-64 characters of [A-Za-z0-9_-]. An invalid or missing
 * one is replaced, never refused, so a write cannot fail over its log.
 */
function resolveChangeCallId(raw) {
  if (typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw)) return raw;
  return Utilities.getUuid();
}

/** One field of a raw `payload` parameter, or undefined. Never throws: the action itself refuses a bad payload. */
function payloadField(rawPayload, field) {
  if (!rawPayload || rawPayload.length > 2 * MAX_PAYLOAD_CHARS) return undefined;
  try {
    var parsed = JSON.parse(rawPayload);
    return parsed && typeof parsed === 'object' ? parsed[field] : undefined;
  } catch (err) {
    return undefined;
  }
}

/** One tab's display rows, header excluded. A tab that does not exist reads as empty. */
function displayRows(tabName) {
  var sheet = getSpreadsheet().getSheetByName(tabName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, TABS[tabName].fields.length).getDisplayValues();
}

/**
 * One tab's rows as `{ fullKey: { key, obj, rowNum } }`. A second row with the
 * same key gets `dup: n` so neither is lost. Blank rows are skipped.
 */
function readTabRows(tabName) {
  var spec = TABS[tabName];
  var map = {};
  var seen = {};
  var rows = displayRows(tabName);
  for (var i = 0; i < rows.length; i++) {
    var obj = {};
    var blank = true;
    for (var f = 0; f < spec.fields.length; f++) {
      obj[spec.fields[f]] = cell(rows[i][f]);
      if (obj[spec.fields[f]] !== '') blank = false;
    }
    if (blank) continue;
    var key = {};
    for (var k = 0; k < spec.key.length; k++) key[spec.key[k]] = obj[spec.key[k]];
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
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CHANGE_LOG_FIELDS.length).setValues(rows);
}

/**
 * Run a key-caller write and log the rows it changed, under one script lock.
 * Refuses, before writing anything, when the MCPChangeLog tab is missing: an
 * unlogged write is worse than a refused one. A throw is logged for the rows
 * that landed and then rethrown.
 *
 * @param {string} action
 * @param {Object} params - the request parameters (`payload` carries `call_id`)
 * @param {function(): *} fn - runs the action
 */
function withChangeLog(action, params, fn) {
  var tabs = CHANGE_LOGGED_ACTIONS[action];
  var callId = resolveChangeCallId(payloadField(params.payload, 'call_id'));
  return withScriptLock(function () {
    if (!getSpreadsheet().getSheetByName(CHANGE_LOG_SHEET)) throw new Error(CHANGE_LOG_MISSING);

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
  if (!getSpreadsheet().getSheetByName(CHANGE_LOG_SHEET)) throw new Error(CHANGE_LOG_MISSING);
  return displayRows(CHANGE_LOG_SHEET).map(function (row) {
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
 * The change log, newest call first. `call_id` narrows to one call, `since`
 * (ISO time) to rows logged at or after it, `limit` caps the rows returned
 * (default 200, max 1000). Key-only: not on TOKEN_ACTIONS.
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
 * now. Returns { changes, conflicts, state }; nothing is written. Each step is
 * applied to an in-memory copy (`state`, by tab), so a call that touched one
 * row twice is checked against the state its later rows leave behind.
 */
function planChangeUndo(rows) {
  var state = {};
  var changes = [];
  var conflicts = [];

  rows.forEach(function (r) {
    if (!TABS[r.tab] || r.tab === CHANGE_LOG_SHEET) {
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

  return { changes: changes, conflicts: conflicts, state: state };
}

/** A row's name for a refusal: a food's or recipe's name, a meal's date and slot, a trip's dates. */
function changeRowName(tab, obj) {
  if (tab === 'Plan') return obj.date + ' ' + obj.slot;
  if (tab === 'Trips') return 'trip through ' + obj.through;
  return obj.name || '';
}

/** Whether `obj`'s reference field names `id`. */
function referencesId(ref, obj, id) {
  if (!ref.inList) return obj[ref.field] === id;
  var list = parseJsonCell(obj[ref.field]);
  return Array.isArray(list) && list.some(function (item) { return item && cell(item[ref.inList]) === id; });
}

/**
 * The rows the undo would remove from Foods, Recipes, Plan or Trips that a row
 * left behind still names, judged against the state after the undo. Returns
 * `[{ tab, id, name, by, row }]`, one per use: `by` is the using row's tab and
 * `row` that row.
 */
function findChangeUses(plan) {
  var uses = [];
  var after = function (tab) {
    if (!plan.state[tab]) plan.state[tab] = readTabRows(tab);
    return plan.state[tab];
  };
  plan.changes.forEach(function (c) {
    if (c.restore || !c.current || !CHANGE_REFERENCES[c.tab]) return;
    var id = c.current.id;
    if (!id) return;
    CHANGE_REFERENCES[c.tab].forEach(function (ref) {
      var rows = after(ref.tab);
      Object.keys(rows).forEach(function (fk) {
        if (referencesId(ref, rows[fk].obj, id)) {
          uses.push({ tab: c.tab, id: id, name: changeRowName(c.tab, c.current), by: ref.tab, row: rows[fk].obj });
        }
      });
    });
  });
  return uses;
}

/** Put the planned rows back: in-place rewrites, then deletes bottom-up, then appends. */
function applyChangeUndo(changes) {
  var byTab = {};
  changes.forEach(function (c) {
    (byTab[c.tab] = byTab[c.tab] || []).push(c);
  });

  Object.keys(byTab).forEach(function (tabName) {
    var fields = TABS[tabName].fields;
    var sheet = getSheet(tabName);
    var live = readTabRows(tabName);
    var toDelete = [];
    var toAppend = [];
    var asRow = function (obj) {
      return fields.map(function (f) { return obj[f]; });
    };

    byTab[tabName].forEach(function (c) {
      var at = Object.prototype.hasOwnProperty.call(live, c.row_key) ? live[c.row_key] : null;
      if (c.restore && at) {
        sheet.getRange(at.rowNum, 1, 1, fields.length).setValues([asText(asRow(c.restore))]);
      } else if (c.restore) {
        toAppend.push(asText(asRow(c.restore)));
      } else if (at) {
        toDelete.push(at.rowNum);
      }
    });

    toDelete.sort(function (a, b) { return b - a; });
    for (var i = 0; i < toDelete.length; i++) sheet.deleteRow(toDelete[i]);
    if (toAppend.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, fields.length).setValues(toAppend);
    }
  });
}

/** An undo refusal: the message, and what the Worker words it from. */
function undoRefusal(message, preview) {
  var err = new Error(message);
  err.code = 'undo_refused';
  err.extra = { data: preview };
  return err;
}

/**
 * Revert one call. Dry-run unless `confirm` is true.
 *
 * All or nothing: if any row the call touched no longer holds what the call
 * left, or a row it would remove is now used by a row outside the call,
 * nothing is restored, and the refusal's `data` carries every `conflicts` or
 * `uses` entry. The revert is itself logged, as a new call with action
 * `undo`, so it can be undone the same way.
 */
function undoCall(payload) {
  var callId = requireString('call_id', payload && payload.call_id);
  var confirm = payload.confirm === true;
  return withScriptLock(function () {
    var rows = readChangeLogRows().filter(function (r) { return r.call_id === callId; });
    if (rows.length === 0) throw new Error('No call ' + callId + ' in the change log');
    rows.reverse();

    var plan = planChangeUndo(rows);
    if (plan.conflicts.length > 0) {
      throw undoRefusal('Nothing undone: ' + plan.conflicts.length + ' row(s) changed since call ' + callId, {
        dry_run: !confirm, call_id: callId, conflicts: plan.conflicts,
      });
    }
    var uses = findChangeUses(plan);
    if (uses.length > 0) {
      throw undoRefusal('Nothing undone: ' + uses.length + ' use(s) outside call ' + callId + ' of rows it would remove', {
        dry_run: !confirm, call_id: callId, uses: uses,
      });
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
