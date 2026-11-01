// Utility functions for sheet access and data mapping.

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

function generateUUID() {
  return Utilities.getUuid();
}

function isoNow() {
  return new Date().toISOString();
}

function rowToItem(row) {
  return {
    id: row[COL.ID] || '',
    title: row[COL.TITLE] || '',
    description: row[COL.DESCRIPTION] || '',
    status: row[COL.STATUS] || 'To Do',
    owner: row[COL.OWNER] || '',
    due_date: dueDateFromCell(row[COL.DUE_DATE]),
    labels: row[COL.LABELS] || '',
    parent_id: row[COL.PARENT_ID] || '',
    created_at: row[COL.CREATED_AT] ? String(row[COL.CREATED_AT]) : '',
    updated_at: row[COL.UPDATED_AT] ? String(row[COL.UPDATED_AT]) : '',
    completed_at: row[COL.COMPLETED_AT] ? String(row[COL.COMPLETED_AT]) : '',
    sort_order: Number(row[COL.SORT_ORDER]) || 0,
    created_by: row[COL.CREATED_BY] || '',
    board_id: row[COL.BOARD_ID] || '',
  };
}

/**
 * #728: a due date is text `YYYY-MM-DD`, never a date cell. A date cell reads
 * back as a `Date` whose String() is a long locale string, which the
 * due_before / due_after string compare silently drops. A stray date cell (a
 * hand edit in the sheet) is read as its local calendar date in AUDIT_TIMEZONE,
 * the zone the sheet itself is in. `toString` rather than `instanceof Date`,
 * which fails for a Date from another realm.
 */
function dueDateFromCell(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, AUDIT_TIMEZONE, 'yyyy-MM-dd');
  }
  return String(value);
}

/**
 * #728: Sheets' own text escape. appendRow and setValues parse a string the way
 * typing does, so a bare `2026-11-01` becomes a date cell; a leading apostrophe
 * keeps it text and is not stored. Empty stays empty.
 */
function asText(value) {
  if (value === '' || value === null || value === undefined) return '';
  return "'" + String(value);
}

function itemToRow(item) {
  return [
    item.id,
    item.title,
    item.description,
    item.status,
    item.owner,
    asText(item.due_date),
    item.labels,
    item.parent_id,
    item.created_at,
    item.updated_at,
    item.completed_at,
    item.sort_order,
    item.created_by,
    item.board_id,
  ];
}

/** Find the 1-based sheet row number for an item by ID. Returns -1 if not found. */
function findRowByItemId(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === id) {
      return i + 2;
    }
  }
  return -1;
}

/** Get all data rows from a sheet (skipping header row). */
function getAllRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
}

/** Get the next sort order value for a given status column. */
function getNextSortOrder(items, status) {
  var maxOrder = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].status === status && items[i].sort_order > maxOrder) {
      maxOrder = items[i].sort_order;
    }
  }
  return maxOrder + 1;
}

/**
 * #457: run `fn` holding the script lock, so a multi-row pass (`undoCall`)
 * cannot interleave with another write. Waits up to 30 s, then throws.
 */
function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
