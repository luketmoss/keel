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
 * `schema_version` when Config is new or holds an older version. A tab that
 * already exists is never touched otherwise, so a second run changes nothing.
 * Key-only: the migration script calls it against a new Sheet, and again
 * after a release that adds a tab (#713's MCPChangeLog).
 */
function ensureSchema() {
  return withScriptLock(function () {
    var ss = getSpreadsheet();
    var created = [];
    var existing = [];
    TAB_ORDER.forEach(function (name) {
      if (ss.getSheetByName(name)) {
        existing.push(name);
        return;
      }
      var fields = TABS[name].fields;
      var sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, fields.length).setValues([asText(fields)]);
      sheet.setFrozenRows(1);
      created.push(name);
    });
    // A new Config gets the version; an older one is raised to it (#713: a
    // sheet at 1 gains MCPChangeLog and becomes 2). Never lowered.
    var stored = Number(getConfig().schema_version) || 0;
    if (created.indexOf('Config') !== -1 || stored < Number(SCHEMA_VERSION)) {
      upsertRecord('Config', { key: 'schema_version', value: SCHEMA_VERSION, updated: isoNow() });
    }
    return { created: created, existing: existing, schema_version: getConfig().schema_version || null };
  });
}
