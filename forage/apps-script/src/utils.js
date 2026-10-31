/**
 * A cell as a string, with unset meaning ''. `undefined` (a row written before
 * a column existed) and `null` must never become 0 or "undefined".
 */
function cell(value) {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Prefix each value with an apostrophe, Sheets' own escape.
 *
 * appendRow and setValues behave like typing into a cell: "2026-03-04"
 * becomes a date, "3720" a number, "=anything" a live formula. The apostrophe
 * makes the value stored exactly as given, and a formula can never be
 * injected. Every write goes through here. '' stays '' .
 */
function asText(values) {
  return values.map(function (v) {
    var s = cell(v);
    return s === '' ? '' : "'" + s;
  });
}

/** Append one record to a sheet, as text. */
function appendRecord(sheet, values) {
  sheet.appendRow(asText(values));
}
