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

// Reading a tab (#932). A request reads each tab from the Sheet at most once:
// the display values are held in TAB_MEMO until this request writes to the tab.
// The Foods tab, which the app reads on every Add sheet open, is also kept in
// the script cache between requests, in chunks under the 100 KB per-key limit,
// for FOODS_CACHE_TTL_S seconds, so a hand edit in the Sheet shows within that
// time. Any write through the API clears it. The cache is never trusted for a
// row number: a write finds its row in a fresh read of the Sheet.
var TAB_MEMO = {};
var FOODS_CACHE_TTL_S = 300;
var FOODS_CACHE_CHUNK = 30000;
var FOODS_CACHE_META = 'forage_foods:meta';

/** Forget what this request has read. A request starts with nothing. */
function resetTabMemo() {
  TAB_MEMO = {};
}

/** A tab's display rows straight from the Sheet, header excluded. */
function readSheetValues(tab) {
  var spec = tabSpec(tab);
  var sheet = getSheet(tab);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, spec.fields.length).getDisplayValues();
}

/**
 * A tab's display rows. `fresh` says the caller will write by row number, so
 * the rows must come from the Sheet in this request and never from the cache.
 */
function tabValues(tab, fresh) {
  var memo = TAB_MEMO[tab];
  if (memo && (!fresh || !memo.cached)) return memo.values;
  var cached = !fresh && tab === 'Foods' ? readFoodsCache() : null;
  var values = cached || readSheetValues(tab);
  if (!cached && !fresh && tab === 'Foods') writeFoodsCache(values);
  TAB_MEMO[tab] = { values: values, cached: cached !== null };
  return values;
}

/** This request is changing a tab: drop what it holds, and the Foods cache for Foods. */
function invalidateTab(tab) {
  delete TAB_MEMO[tab];
  if (tab === 'Foods') clearFoodsCache();
}

/** A schema change touched every tab. */
function invalidateAllTabs() {
  TAB_MEMO = {};
  clearFoodsCache();
}

/** The cached Foods rows, or null when absent, expired, partial or corrupt. */
function readFoodsCache() {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(FOODS_CACHE_META);
    if (!raw) return null;
    var meta = JSON.parse(raw);
    if (!meta || typeof meta.gen !== 'string' || typeof meta.hash !== 'string') return null;
    if (meta.width !== TABS.Foods.fields.length || !(meta.chunks >= 1 && meta.chunks <= 100) ||!(meta.length >= 0)) return null;
    var keys = foodsChunkKeys(meta);
    var got = cache.getAll(keys);
    var json = '';
    for (var i = 0; i < keys.length; i++) {
      var part = got[keys[i]];
      if (typeof part !== 'string') return null;
      json += part;
    }
    if (json.length !== meta.length || sha256Hex(json) !== meta.hash) return null;
    var values = JSON.parse(json);
    if (!Array.isArray(values) || values.length !== meta.rows) return null;
    for (var r = 0; r < values.length; r++) {
      if (!Array.isArray(values[r]) || values[r].length !== meta.width) return null;
    }
    return values;
  } catch (err) {
    return null;
  }
}

function foodsChunkKeys(meta) {
  var keys = [];
  var n = Math.min(Number(meta.chunks) || 0, 100);
  for (var i = 0; i < n; i++) keys.push('forage_foods:' + meta.gen + ':' + i);
  return keys;
}

/**
 * Keep the Foods rows for the next request. The chunks go in first, under a
 * new generation, and the meta that names them last, so a reader never joins
 * chunks of two reads. A failure to cache never fails the request.
 */
function writeFoodsCache(values) {
  try {
    var json = JSON.stringify(values);
    var meta = {
      gen: Utilities.getUuid().slice(0, 8),
      chunks: Math.max(1, Math.ceil(json.length / FOODS_CACHE_CHUNK)),
      length: json.length,
      rows: values.length,
      width: TABS.Foods.fields.length,
      hash: sha256Hex(json),
    };
    var entries = {};
    foodsChunkKeys(meta).forEach(function (key, i) {
      entries[key] = json.slice(i * FOODS_CACHE_CHUNK, (i + 1) * FOODS_CACHE_CHUNK);
    });
    var cache = CacheService.getScriptCache();
    cache.putAll(entries, FOODS_CACHE_TTL_S);
    cache.put(FOODS_CACHE_META, JSON.stringify(meta), FOODS_CACHE_TTL_S);
  } catch (err) {
    // Too large, or the cache is unavailable: the next read goes to the Sheet.
  }
}

/** Remove the cached Foods rows. Never throws. */
function clearFoodsCache() {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get(FOODS_CACHE_META);
    var keys = [FOODS_CACHE_META];
    if (raw) {
      try {
        keys = keys.concat(foodsChunkKeys(JSON.parse(raw)));
      } catch (err) {
        // A corrupt meta still goes; its chunks expire on their own.
      }
    }
    cache.removeAll(keys);
  } catch (err) {
    // Nothing more to do: the entry expires within FOODS_CACHE_TTL_S.
  }
}

/** Every row of a tab as `{ record, rowNum }`, rowNum 1-based with the header as row 1. */
function readTab(tab, fresh) {
  var values = tabValues(tab, fresh);
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

function findEntry(tab, key, fresh) {
  var rows = readTab(tab, fresh);
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
    var entry = findEntry(tab, record, true);
    try {
      if (entry) {
        sheet.getRange(entry.rowNum, 1, 1, spec.fields.length).setValues([values]);
      } else {
        sheet.appendRow(values);
      }
    } finally {
      invalidateTab(tab);
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
    try {
      sheet.getRange(start, 1, values.length, spec.fields.length).setValues(values);
    } finally {
      invalidateTab(tab);
    }
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
    var doomed = readTab(tab, true).filter(function (r) { return predicate(r.record); });
    try {
      for (var i = doomed.length - 1; i >= 0; i--) sheet.deleteRow(doomed[i].rowNum);
    } finally {
      invalidateTab(tab);
    }
    return doomed.length;
  });
}

/**
 * Change the rows the predicate picks: `mutate` gets each record and edits it
 * in place, and each changed row is written back, from one read of the tab.
 * Returns the records as written, in sheet order. For a bulk edit that must
 * not read the whole tab once per row (#878).
 */
function updateRecordsWhere(tab, predicate, mutate) {
  return withScriptLock(function () {
    var spec = tabSpec(tab);
    var sheet = getSheet(tab);
    var out = [];
    try {
      readTab(tab, true).forEach(function (r) {
        if (!predicate(r.record)) return;
        mutate(r.record);
        sheet.getRange(r.rowNum, 1, 1, spec.fields.length).setValues([asText(recordToRow(tab, r.record))]);
        out.push(r.record);
      });
    } finally {
      invalidateTab(tab);
    }
    return out;
  });
}
