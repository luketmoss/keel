// #457: revert one MCP call from the Audit Log.
//
// The log is the record: each `created`/`deleted` row carries the whole item in
// `row_json`, and `updated`/`status_changed` rows carry the field's old and new
// value. `undoCall` walks one call's rows newest first, checks that every row
// is still as the call left it, and only then puts them back, all of it or none
// of it, under the script lock. It lives in the app because the API cannot
// re-create an item with its original id, or delete a label.
//
// Each revert is itself logged under a new call id, with action `undo`, so an
// undo can be undone by the same function: `auditEntryOp` reads an `undo` row
// as the opposite of what it did.

// Item fields compared when checking a created row. updated_at is left out:
// every later edit moves it.
var UNDO_COMPARE_FIELDS = [
  'title', 'description', 'status', 'owner', 'due_date', 'labels', 'parent_id',
  'created_at', 'completed_at', 'sort_order', 'created_by', 'board_id',
];

/**
 * Read one Audit Log entry as an operation to reverse, or null when it only
 * describes (`completed`, `reopened`, `parent_ready`). `kind` is what the call
 * did: create | delete | update | label_create | label_delete. A row that
 * cannot be rebuilt (logged before row_json existed) comes back `unsupported`.
 */
function auditEntryOp(entry) {
  var action = entry.action;
  var field = entry.field;
  var kind = null;
  if (action === 'created') kind = 'create';
  else if (action === 'deleted') kind = 'delete';
  else if (action === 'label_created') kind = 'label_create';
  else if (action === 'updated' || action === 'status_changed') kind = 'update';
  else if (action === 'undo') {
    if (field === 'removed') kind = 'delete';
    else if (field === 'restored') kind = 'create';
    else if (field === 'label_removed') kind = 'label_delete';
    else if (field === 'label_restored') kind = 'label_create';
    else kind = 'update';
  }
  if (!kind) return null;

  var op = { kind: kind, item_id: entry.item_id, field: field, old_value: entry.old_value, new_value: entry.new_value };
  if (kind !== 'update') {
    try {
      op.row = JSON.parse(entry.row_json);
    } catch (e) {
      op.row = null;
    }
    if (!op.row || typeof op.row !== 'object' || (kind !== 'label_create' && kind !== 'label_delete' && !op.row.id)) {
      op.unsupported = true;
    }
  }
  return op;
}

function undoLabelKey(label, boardId) {
  return String(label).toLowerCase() + '|' + (boardId || '');
}

/** A field's value as it compares and logs: a string. */
function undoText(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Work out what reverting `ops` (newest first) would do, against the sheets as
 * they are now. Returns { changes, conflicts }; nothing is written. Each step
 * is applied to an in-memory copy, so a call that touched one item twice is
 * checked against the state its later rows leave behind.
 */
function planUndo(ops) {
  var items = {};
  getAllRows(getSheet('Items')).forEach(function(row) {
    var item = rowToItem(row);
    if (item.id) items[item.id] = item;
  });
  var labels = {};
  getAllRows(getSheet('Labels')).forEach(function(row) {
    var label = { label: row[0] || '', color: row[1] || '', board_id: row[2] || '' };
    labels[undoLabelKey(label.label, label.board_id)] = label;
  });
  var archived = getArchivedBoards();

  var changes = [];
  var conflicts = [];

  function conflict(id, field, current, expected) {
    conflicts.push({ item_id: id, field: field, current: current, expected: expected });
  }
  function onArchivedBoard(item) {
    return Object.prototype.hasOwnProperty.call(archived, item.board_id);
  }

  ops.forEach(function(op) {
    if (op.unsupported) {
      conflict(op.item_id, op.field || '(row)', '(not recorded)', 'a row recorded with its whole value');
      return;
    }

    if (op.kind === 'create') {
      var made = op.row;
      var current = items[made.id];
      if (!current) {
        conflict(made.id, '(row)', '(missing)', undoText(made.title));
        return;
      }
      var drifted = false;
      UNDO_COMPARE_FIELDS.forEach(function(f) {
        if (undoText(current[f]) !== undoText(made[f])) {
          drifted = true;
          conflict(made.id, f, undoText(current[f]), undoText(made[f]));
        }
      });
      if (drifted) return;
      if (onArchivedBoard(current)) {
        conflict(made.id, 'board_id', 'archived board ' + current.board_id, 'an active board');
        return;
      }
      changes.push({ type: 'remove', item_id: made.id, title: current.title, item: current });
      delete items[made.id];
    } else if (op.kind === 'delete') {
      var gone = op.row;
      if (items[gone.id]) {
        conflict(gone.id, '(row)', 'exists again', '(absent)');
        return;
      }
      if (onArchivedBoard(gone)) {
        conflict(gone.id, 'board_id', 'archived board ' + gone.board_id, 'an active board');
        return;
      }
      changes.push({ type: 'insert', item_id: gone.id, title: undoText(gone.title), item: gone });
      items[gone.id] = gone;
    } else if (op.kind === 'update') {
      var target = items[op.item_id];
      if (!target) {
        conflict(op.item_id, op.field, '(item missing)', op.new_value);
        return;
      }
      if (undoText(target[op.field]) !== op.new_value) {
        conflict(op.item_id, op.field, undoText(target[op.field]), op.new_value);
        return;
      }
      if (onArchivedBoard(target)) {
        conflict(op.item_id, 'board_id', 'archived board ' + target.board_id, 'an active board');
        return;
      }
      changes.push({
        type: 'set', item_id: op.item_id, title: target.title,
        field: op.field, current: op.new_value, restore: op.old_value,
      });
      target[op.field] = op.field === 'sort_order' ? Number(op.old_value) || 0 : op.old_value;
    } else if (op.kind === 'label_create') {
      var key = undoLabelKey(op.row.label, op.row.board_id);
      if (!labels[key]) {
        conflict('', 'label', '(missing)', op.row.label);
        return;
      }
      changes.push({ type: 'remove_label', item_id: '', title: op.row.label, label: op.row });
      delete labels[key];
    } else if (op.kind === 'label_delete') {
      var again = undoLabelKey(op.row.label, op.row.board_id);
      if (labels[again]) {
        conflict('', 'label', 'exists again', '(absent)');
        return;
      }
      changes.push({ type: 'insert_label', item_id: '', title: op.row.label, label: op.row });
      labels[again] = op.row;
    }
  });

  return { changes: changes, conflicts: conflicts };
}

/** What the caller sees of a planned change: no whole rows. */
function describeUndoChange(change) {
  var out = { type: change.type, item_id: change.item_id, title: change.title };
  if (change.type === 'set') {
    out.field = change.field;
    out.current = change.current;
    out.restore = change.restore;
  }
  return out;
}

/** Apply one planned change to the sheets and log it under `callId`. */
function applyUndoChange(change, callId) {
  var itemsSheet = getSheet('Items');
  var rowNum;

  if (change.type === 'remove') {
    rowNum = findRowByItemId(itemsSheet, change.item_id);
    if (rowNum === -1) throw new Error('Item "' + change.item_id + '" vanished during undo');
    itemsSheet.deleteRow(rowNum);
    writeAuditEntry(change.item_id, 'undo', 'removed', change.title, '', MCP_ACTOR, callId, JSON.stringify(change.item));
  } else if (change.type === 'insert') {
    itemsSheet.appendRow(itemToRow(change.item));
    writeAuditEntry(change.item_id, 'undo', 'restored', '', change.title, MCP_ACTOR, callId, JSON.stringify(change.item));
  } else if (change.type === 'set') {
    rowNum = findRowByItemId(itemsSheet, change.item_id);
    if (rowNum === -1) throw new Error('Item "' + change.item_id + '" vanished during undo');
    var item = rowToItem(itemsSheet.getRange(rowNum, 1, 1, ITEM_COLUMN_COUNT).getValues()[0]);
    if (change.field === 'status') {
      var isTerminal = false;
      if (item.board_id) {
        var found = getStatuses(item.board_id).find(function(s) { return s.name === change.restore; });
        isTerminal = found ? found.is_terminal : false;
      }
      item = applyStatusSideEffects(item, change.restore, isTerminal);
    } else {
      item[change.field] = change.field === 'sort_order' ? Number(change.restore) || 0 : change.restore;
      item.updated_at = isoNow();
    }
    itemsSheet.getRange(rowNum, 1, 1, ITEM_COLUMN_COUNT).setValues([itemToRow(item)]);
    writeAuditEntry(change.item_id, 'undo', change.field, change.current, change.restore, MCP_ACTOR, callId);
  } else if (change.type === 'remove_label') {
    var labelsSheet = getSheet('Labels');
    var labelRows = getAllRows(labelsSheet);
    for (var i = 0; i < labelRows.length; i++) {
      if (undoLabelKey(labelRows[i][0] || '', labelRows[i][2] || '') === undoLabelKey(change.label.label, change.label.board_id)) {
        labelsSheet.deleteRow(i + 2);
        break;
      }
    }
    writeAuditEntry('', 'undo', 'label_removed', change.title, '', MCP_ACTOR, callId, JSON.stringify(change.label));
  } else if (change.type === 'insert_label') {
    getSheet('Labels').appendRow([change.label.label, change.label.color || '', change.label.board_id || '']);
    writeAuditEntry('', 'undo', 'label_restored', '', change.title, MCP_ACTOR, callId, JSON.stringify(change.label));
  }
}

/**
 * #457: Revert one MCP call. Dry-run unless `confirm` is true.
 *
 * All or nothing: if any row the call touched no longer holds what the call
 * left, nothing is reverted and the error carries every conflict as
 * `err.preview`, the way a rejected deleteItem confirm carries its preview.
 *
 * @param {string} callId
 * @param {boolean} confirm
 * @returns {Object} the preview (dry run) or the result (confirmed)
 */
function undoCall(callId, confirm) {
  return withScriptLock(function() {
    var entries = getAuditLog({ actor: MCP_ACTOR, call_id: callId });
    if (entries.length === 0) {
      throw new Error('No MCP call ' + callId + ' in the Audit Log');
    }

    // Newest first: the last thing the call did is the first thing undone.
    var ops = [];
    for (var i = entries.length - 1; i >= 0; i--) {
      var op = auditEntryOp(entries[i]);
      if (op) ops.push(op);
    }

    var plan = planUndo(ops);
    if (plan.conflicts.length > 0) {
      var err = new Error(
        'Nothing reverted: ' + plan.conflicts.length + ' conflicting field(s) changed since call ' + callId
      );
      err.preview = { dry_run: !confirm, call_id: callId, conflicts: plan.conflicts };
      throw err;
    }

    var changes = plan.changes.map(describeUndoChange);
    if (!confirm) {
      return { dry_run: true, call_id: callId, count: changes.length, changes: changes };
    }

    var undoCallId = generateUUID();
    plan.changes.forEach(function(change) {
      applyUndoChange(change, undoCallId);
    });
    return {
      dry_run: false,
      call_id: callId,
      undo_call_id: undoCallId,
      count: changes.length,
      changes: changes,
    };
  });
}
