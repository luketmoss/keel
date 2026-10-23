// Settings tab (#519, #576) - key/value, one row per key.
//
// Six keys: water_goal_ml (#519) and the five rest defaults (#576,
// REST_SETTINGS in types.js). The API supplies every default, never the
// migration, so a missing row, a missing tab and a stored value outside the
// accepted range all read the same: the default.
//
// Every refusal is fixed text naming the key and its range: nothing quotes the
// caller's value back.

var SETTINGS_SHEET = 'Settings';

/** The rest setting a key names, or null. */
function restSetting(key) {
  for (var i = 0; i < REST_SETTINGS.length; i++) {
    if (REST_SETTINGS[i].key === key) return REST_SETTINGS[i];
  }
  return null;
}

/** Every key updateSetting accepts, in the order the refusal names them. */
function settingKeys() {
  return [SETTING_WATER_GOAL].concat(REST_SETTINGS.map(function (s) { return s.key; }));
}

/** { key: stored text } for every row of the tab; {} when it is absent. */
function storedSettings() {
  var sheet = getSpreadsheet().getSheetByName(SETTINGS_SHEET);
  if (!sheet) return {};
  var rows = getAllRows(sheet);
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var key = cell(rows[i][0]);
    if (key && !Object.prototype.hasOwnProperty.call(out, key)) out[key] = cell(rows[i][1]);
  }
  return out;
}

/** A stored value as a whole number within [min, max], else the default. */
function settingOrDefault(stored, key, min, max, def) {
  if (!Object.prototype.hasOwnProperty.call(stored, key)) return def;
  var n = wholeNumber(stored[key]);
  return n !== null && n >= min && n <= max ? n : def;
}

/** The current water goal in ml. */
function getWaterGoal() {
  return settingOrDefault(storedSettings(), SETTING_WATER_GOAL,
    WATER_GOAL_MIN_ML, WATER_GOAL_MAX_ML, WATER_GOAL_DEFAULT_ML);
}

/** The five rest defaults (#576), { rest_primary_s: 90, ... }, whole seconds. */
function getRestSettings(stored) {
  var values = stored || storedSettings();
  var out = {};
  for (var i = 0; i < REST_SETTINGS.length; i++) {
    var s = REST_SETTINGS[i];
    out[s.key] = settingOrDefault(values, s.key, s.min, s.max, s.def);
  }
  return out;
}

/** Every setting with its default filled in: what the app's Settings screen reads. */
function getSettings() {
  var stored = storedSettings();
  var out = getRestSettings(stored);
  out[SETTING_WATER_GOAL] = settingOrDefault(stored, SETTING_WATER_GOAL,
    WATER_GOAL_MIN_ML, WATER_GOAL_MAX_ML, WATER_GOAL_DEFAULT_ML);
  return out;
}

/**
 * Set one setting. Returns the stored { key, value, updated }. An unknown key
 * or a value outside its range is refused before anything is written.
 */
function updateSetting(payload) {
  payload = drinkPayload(payload);
  var key = payload.key;
  var value = wholeNumber(payload.value);

  var rest = restSetting(key);
  if (rest) {
    if (value === null || value < rest.min || value > rest.max) {
      throw new Error(key + ' must be whole seconds, ' + rest.min + ' to ' + rest.max);
    }
  } else if (key === SETTING_WATER_GOAL) {
    if (value === null || value < WATER_GOAL_MIN_ML || value > WATER_GOAL_MAX_ML) {
      throw new Error('water_goal_ml must be a whole number of ml, 250 to 10000');
    }
  } else {
    throw new Error('only ' + settingKeys().join(', ') + ' can be set');
  }

  var sheet = getSheet(SETTINGS_SHEET);
  var setting = { key: key, value: String(value), updated: isoNow() };
  var row = [setting.key, setting.value, setting.updated];

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, SETTING_COLUMN_COUNT).getDisplayValues();
    for (var i = 0; i < rows.length; i++) {
      if (cell(rows[i][0]) === key) {
        sheet.getRange(i + 2, 1, 1, SETTING_COLUMN_COUNT).setValues([asText(row)]);
        return setting;
      }
    }
  }
  sheet.appendRow(asText(row));
  return setting;
}
