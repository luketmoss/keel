// The generic row layer (#703): list, get, upsert and delete by key, for any
// tab in TABS. The entity files add validation and derived fields, and never
// touch a sheet themselves.
//
// Reads use getDisplayValues(): what a cell shows is what every caller sees,
// and a parsed date or number never round-trips back as something else.
// Writes go through asText and hold the script lock.

function tabSpec(tab) {
  var spec = TABS[tab];
  if (!spec) throw new Error('Unknown tab "' + tab + '"');
  return spec;
}

/** One display row as a record, each column read by its kind. */
function rowToRecord(tab, row) {
  var spec = tabSpec(tab);
  var record = {};
  for (var i = 0; i < spec.fields.length; i++) {
    var field = spec.fields[i];
    var raw = cell(row[i]);
    var kind = spec.kinds[field];
    if (kind === 'num') {
      record[field] = raw === '' || !isFinite(Number(raw)) ? null : Number(raw);
    } else if (kind === 'bool') {
      record[field] = raw === 'TRUE';
    } else if (kind === 'json') {
      record[field] = parseJsonCell(raw);
    } else {
      record[field] = raw;
    }
  }
  return record;
}

function parseJsonCell(raw) {
  if (raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

/** A record as the cells to write, in column order. Blank stays blank. */
function recordToRow(tab, record) {
  var spec = tabSpec(tab);
  return spec.fields.map(function (field) {
    var value = record[field];
    var kind = spec.kinds[field];
    if (value === undefined || value === null || value === '') return '';
    if (kind === 'bool') return value === true ? 'TRUE' : '';
    if (kind === 'json') return JSON.stringify(value);
    return String(value);
  });
}

/** Every row of a tab as `{ record, rowNum }`, rowNum 1-based with the header as row 1. */
function readTab(tab) {
  var spec = tabSpec(tab);
  var sheet = getSheet(tab);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, spec.fields.length).getDisplayValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out.push({ record: rowToRecord(tab, values[i]), rowNum: i + 2 });
  }
  return out;
}

/** Every record of a tab, optionally filtered. */
function listRecords(tab, predicate) {
  return readTab(tab)
    .map(function (r) { return r.record; })
    .filter(function (record) { return !predicate || predicate(record); });
}

function keyMatches(tab, record, key) {
  return tabSpec(tab).key.every(function (field) {
    return cell(record[field]) === cell(key[field]);
  });
}

function findEntry(tab, key) {
  var rows = readTab(tab);
  for (var i = 0; i < rows.length; i++) {
    if (keyMatches(tab, rows[i].record, key)) return rows[i];
  }
  return null;
}

/** The record with this key, or null. `key` names every key column. */
function getRecord(tab, key) {
  var entry = findEntry(tab, key);
  return entry ? entry.record : null;
}

/** Write `record` over the row with its key, or append it. Returns it as stored. */
function upsertRecord(tab, record) {
  return withScriptLock(function () {
    var spec = tabSpec(tab);
    var sheet = getSheet(tab);
    var values = asText(recordToRow(tab, record));
    var entry = findEntry(tab, record);
    if (entry) {
      sheet.getRange(entry.rowNum, 1, 1, spec.fields.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    return getRecord(tab, record);
  });
}

/**
 * Append records in one write, for rows the caller knows are new (a recipe's
 * replaced lines, just deleted). Returns how many.
 */
function appendRecords(tab, records) {
  if (!records.length) return 0;
  return withScriptLock(function () {
    var spec = tabSpec(tab);
    var sheet = getSheet(tab);
    var start = sheet.getLastRow() + 1;
    var values = records.map(function (r) { return asText(recordToRow(tab, r)); });
    sheet.getRange(start, 1, values.length, spec.fields.length).setValues(values);
    return values.length;
  });
}

/** Delete the row with this key. Returns whether one was there. */
function deleteRecord(tab, key) {
  return deleteRecordsWhere(tab, function (record) { return keyMatches(tab, record, key); }) > 0;
}

/** Delete every row the predicate picks, bottom to top so row numbers stay true. */
function deleteRecordsWhere(tab, predicate) {
  return withScriptLock(function () {
    var sheet = getSheet(tab);
    var doomed = readTab(tab).filter(function (r) { return predicate(r.record); });
    for (var i = doomed.length - 1; i >= 0; i--) sheet.deleteRow(doomed[i].rowNum);
    return doomed.length;
  });
}
