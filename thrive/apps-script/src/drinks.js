// Drinks tab (#519) - Thrive Sip's water and alcohol intake. The Settings tab
// it introduced is read and written by settings.js.
//
// One Drinks row per drink, written by the API alone. DRINK_FIELDS in types.js
// is the one layout on this side; frontend/src/api/drinks.ts mirrors it.
//
// The widget key (WIDGET_API_KEY, auth.js) may run logDrink and getDrinkTotals
// and nothing else, so every refusal below is fixed text: nothing quotes the
// caller's input back to a credential that lives on a phone.

var DRINKS_SHEET = 'Drinks';
// The Settings tab (getWaterGoal, updateSetting) is settings.js's since #576.

// Literals, not types.js constants: Apps Script does not promise a file load order.
var DRINK_ERRORS = {
  id: 'id is required: 1-64 characters of letters, digits, _ and -',
  kind: 'kind must be water, alcohol or coffee',
  waterAmount: 'amount for water must be a whole number of ml, 1 to 2000',
  alcoholAmount: 'amount for alcohol or coffee must be 1',
  loggedAt: 'logged_at_utc is required: an ISO 8601 UTC time such as 2026-10-20T13:05:00Z',
  source: 'source must be widget or app',
  range: 'from and to must be given together, as YYYY-MM-DD, from no later than to',
  rangeTooLong: 'the range may be at most 400 days',
  time: 'time must be HH:MM:SS, 00:00:00 to 23:59:59',
  notFound: 'No drink with that id',
};

/** A Drinks row -> {id, ..., updated}, '' where unset. */
function rowToDrink(row) {
  var drink = {};
  for (var i = 0; i < DRINK_FIELDS.length; i++) {
    drink[DRINK_FIELDS[i]] = cell(row[i]);
  }
  return drink;
}

/** A drink -> exactly DRINK_COLUMN_COUNT cells. */
function drinkToRow(drink) {
  var row = [];
  for (var i = 0; i < DRINK_FIELDS.length; i++) {
    row.push(cell(drink[DRINK_FIELDS[i]]));
  }
  return row;
}

/** A whole number from a JSON number or a string of digits, else null. */
function wholeNumber(value) {
  if (typeof value === 'number') return isFinite(value) && Math.floor(value) === value ? value : null;
  if (typeof value === 'string' && /^\d{1,9}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** The payload as an object, or a fixed-text refusal. */
function drinkPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be an object');
  }
  return payload;
}

/** The drink id, validated: it is the key a retry relies on. */
function validateDrinkId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(DRINK_ERRORS.id);
  }
  return value;
}

/** The sheet row of a drink id: { rowNum, drink }, or null. First row wins. */
function findDrink(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, DRINK_COLUMN_COUNT).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (cell(rows[i][0]) === id) return { rowNum: i + 2, drink: rowToDrink(rows[i]) };
  }
  return null;
}

/**
 * Log one drink (#519). The caller supplies the id, so a retry after a dropped
 * connection finds its own row and writes nothing: the same row comes back
 * unchanged. `date` and `time` are the Denver local clock at `logged_at_utc`,
 * so a drink at 23:30 local is filed under that day even when UTC has already
 * rolled over. Every refusal happens before the first write.
 */
function logDrink(payload) {
  payload = drinkPayload(payload);
  var id = validateDrinkId(payload.id);

  var kind = payload.kind;
  if (DRINK_KINDS.indexOf(kind) === -1) throw new Error(DRINK_ERRORS.kind);

  var amount = wholeNumber(payload.amount);
  if (kind === 'water') {
    if (amount === null || amount < 1 || amount > WATER_AMOUNT_MAX_ML) {
      throw new Error(DRINK_ERRORS.waterAmount);
    }
  } else if (amount !== 1) {
    throw new Error(DRINK_ERRORS.alcoholAmount);
  }

  var raw = payload.logged_at_utc;
  var instant = typeof raw === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw) ? new Date(raw) : null;
  if (!instant || isNaN(instant.getTime())) throw new Error(DRINK_ERRORS.loggedAt);

  if (DRINK_SOURCES.indexOf(payload.source) === -1) throw new Error(DRINK_ERRORS.source);

  var sheet = getSheet(DRINKS_SHEET);
  var existing = findDrink(sheet, id);
  if (existing) return existing.drink;

  var now = isoNow();
  var drink = {
    id: id,
    kind: kind,
    amount: String(amount),
    date: Utilities.formatDate(instant, TIMEZONE, 'yyyy-MM-dd'),
    time: Utilities.formatDate(instant, TIMEZONE, 'HH:mm:ss'),
    logged_at_utc: instant.toISOString(),
    source: payload.source,
    created: now,
    updated: now,
  };
  sheet.appendRow(asText(drinkToRow(drink)));
  return drink;
}

/** Whole days from a YYYY-MM-DD to another, both inclusive. */
function inclusiveDays(from, to) {
  var parts = function (d) { return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))); };
  return Math.round((parts(to) - parts(from)) / 86400000) + 1;
}

/** Every Drinks row on dates in [from, to], oldest first by logged_at_utc. */
function drinkRowsBetween(from, to) {
  var sheet = getSpreadsheet().getSheetByName(DRINKS_SHEET);
  if (!sheet) return [];
  var rows = getAllRows(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var drink = rowToDrink(rows[i]);
    if (!drink.id || drink.date < from || drink.date > to) continue;
    out.push(drink);
  }
  out.sort(function (a, b) {
    var x = Date.parse(a.logged_at_utc) || 0;
    var y = Date.parse(b.logged_at_utc) || 0;
    return x - y;
  });
  return out;
}

/**
 * Drinks for an inclusive range of local dates, with the current goal (#519).
 * `from` and `to` come together or not at all; neither means today (Denver).
 * A missing tab is no drinks, not an error.
 */
function getDrinks(filters) {
  var from = filters && filters.from ? String(filters.from) : '';
  var to = filters && filters.to ? String(filters.to) : '';
  if (!from && !to) {
    from = to = todayLocal();
  } else {
    if (!from || !to) throw new Error(DRINK_ERRORS.range);
    try {
      validateDate('from', from);
      validateDate('to', to);
    } catch (err) {
      throw new Error(DRINK_ERRORS.range);
    }
    var days = inclusiveDays(from, to);
    if (days < 1) throw new Error(DRINK_ERRORS.range);
    if (days > DRINKS_MAX_RANGE_DAYS) throw new Error(DRINK_ERRORS.rangeTooLong);
  }
  return { drinks: drinkRowsBetween(from, to), water_goal_ml: getWaterGoal() };
}

/** Today's intake (Denver): what the widget reads. Zeros, never blanks. */
function getDrinkTotals() {
  var date = todayLocal();
  var rows = drinkRowsBetween(date, date);
  var water = 0;
  var alcohol = 0;
  var coffee = 0;
  for (var i = 0; i < rows.length; i++) {
    var amount = wholeNumber(rows[i].amount) || 0;
    if (rows[i].kind === 'water') water += amount;
    else if (rows[i].kind === 'alcohol') alcohol += amount;
    else if (rows[i].kind === 'coffee') coffee += amount;
  }
  return { date: date, water_ml: water, alcohol_drinks: alcohol, coffee_cups: coffee, water_goal_ml: getWaterGoal() };
}

/** Change a drink's local `time` and `updated`; nothing else (#519). */
function updateDrinkTime(payload) {
  payload = drinkPayload(payload);
  var id = validateDrinkId(payload.id);
  var time = payload.time;
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) {
    throw new Error(DRINK_ERRORS.time);
  }
  var sheet = getSheet(DRINKS_SHEET);
  var found = findDrink(sheet, id);
  if (!found) throw new Error(DRINK_ERRORS.notFound);
  var drink = found.drink;
  drink.time = time;
  drink.updated = isoNow();
  sheet.getRange(found.rowNum, 1, 1, DRINK_COLUMN_COUNT).setValues([asText(drinkToRow(drink))]);
  return drink;
}

/** Remove one drink. An unknown id is an error, not a silent success. */
function deleteDrink(payload) {
  payload = drinkPayload(payload);
  var id = validateDrinkId(payload.id);
  var sheet = getSheet(DRINKS_SHEET);
  var found = findDrink(sheet, id);
  if (!found) throw new Error(DRINK_ERRORS.notFound);
  sheet.deleteRow(found.rowNum);
  return found.drink;
}
