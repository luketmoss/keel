// Config (#703): key/value settings. `schema_version` is the only key so far;
// later issues add keys here rather than new tabs. Both actions are key-only.

/** Every key, as `{ key: value }`. */
function getConfig() {
  var out = {};
  listRecords('Config').forEach(function (c) { out[c.key] = c.value; });
  return out;
}

/** Payload `{ key, value }`. */
function setConfig(payload) {
  var key = requireString('key', payload && payload.key);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new Error('key must be lower case letters, digits and _');
  var value = payload.value === undefined || payload.value === null ? '' : String(payload.value);
  return upsertRecord('Config', { key: key, value: value, updated: isoNow() });
}

/**
 * Create each missing tab with its header row from FIELDS, frozen, and write
 * `schema_version` when Config is new or holds an older version. Key-only: the
 * migration script calls it against a new Sheet, and again after a release
 * that adds a tab (#713's MCPChangeLog) or columns (#755's seven nutrients).
 *
 * A tab that already exists keeps every cell it has. The one change it can
 * get (#755): when its header row is exactly a prefix of its fields, the
 * missing header names are appended after the last one. A header that is not
 * a prefix (a renamed column, say) is left alone and named in `mismatched`,
 * and the version is not raised while any tab is. A second run changes
 * nothing, and answers empty `created` and `extended`.
 *
 * Answers `{ created, existing, extended: [{ tab, added }], mismatched,
 * schema_version }`.
 */
function ensureSchema() {
  return withScriptLock(function () {
    var ss = getSpreadsheet();
    var created = [];
    var existing = [];
    var extended = [];
    var mismatched = [];
    TAB_ORDER.forEach(function (name) {
      var fields = TABS[name].fields;
      var sheet = ss.getSheetByName(name);
      if (sheet) {
        existing.push(name);
        var header = headerRow(sheet);
        var prefix = header.length <= fields.length && header.every(function (h, i) { return h === fields[i]; });
        if (!prefix) {
          mismatched.push(name);
        } else if (header.length < fields.length) {
          var added = fields.slice(header.length);
          ensureColumns(sheet, fields.length);
          sheet.getRange(1, header.length + 1, 1, added.length).setValues([asText(added)]);
          extended.push({ tab: name, added: added });
        }
        return;
      }
      sheet = ss.insertSheet(name);
      ensureColumns(sheet, fields.length);
      sheet.getRange(1, 1, 1, fields.length).setValues([asText(fields)]);
      sheet.setFrozenRows(1);
      created.push(name);
    });
    // A new Config gets the version; an older one is raised to it (#713: a
    // sheet at 1 gains MCPChangeLog and becomes 2; #755: 2 gains the seven
    // nutrient columns and becomes 3). Never lowered, and not raised while a
    // tab's header could not be brought up to date.
    var stored = Number(getConfig().schema_version) || 0;
    if (!mismatched.length && (created.indexOf('Config') !== -1 || stored < Number(SCHEMA_VERSION))) {
      upsertRecord('Config', { key: 'schema_version', value: SCHEMA_VERSION, updated: isoNow() });
    }
    return {
      created: created,
      existing: existing,
      extended: extended,
      mismatched: mismatched,
      schema_version: getConfig().schema_version || null,
    };
  });
}

/** A tab's header row as text, trailing blank cells dropped. */
function headerRow(sheet) {
  var width = sheet.getLastColumn();
  if (!width) return [];
  var header = sheet.getRange(1, 1, 1, width).getDisplayValues()[0].map(function (h) { return cell(h); });
  while (header.length && header[header.length - 1] === '') header.pop();
  return header;
}

/** Widen a sheet to at least `n` columns: a new sheet has 26, and Foods has more. */
function ensureColumns(sheet, n) {
  var max = sheet.getMaxColumns();
  if (max < n) sheet.insertColumnsAfter(max, n - max);
}
