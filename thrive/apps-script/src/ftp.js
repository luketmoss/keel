// The FtpHistory tab (#765): one row per FTP setting, for Thrive Spin.
//
// The current FTP is the newest row, by `date` and then `created`. Rows are only
// ever added: editing or deleting one is by hand in the sheet. `addFtp` is keyed by
// the caller's id, so a retry after a dropped connection leaves one row.
//
// Fixed-text refusals that quote nothing the caller sent, all `code: 'bad_request'`
// (utils.js badRequest): the Spin key lives on a phone.

var FTP_HISTORY_SHEET = 'FtpHistory';

var FTP_ERRORS = {
  date: 'date must be a real calendar date, YYYY-MM-DD',
  ftp: 'ftp_w must be a whole number of watts, 50 to 1000',
  source: 'source must be ramp_test or manual',
  rampRide: 'ride_id is required for a ramp_test: 1 to 64 characters of letters, digits, _ and -',
  manualRide: 'ride_id must be blank for a manual FTP',
};

/** An FtpHistory row -> {id, ..., created}, '' where unset. */
function rowToFtp(row) {
  var ftp = {};
  for (var i = 0; i < FTP_HISTORY_FIELDS.length; i++) {
    ftp[FTP_HISTORY_FIELDS[i]] = cell(row[i]);
  }
  return ftp;
}

/** An FTP row -> exactly FTP_HISTORY_COLUMN_COUNT cells. */
function ftpToRow(ftp) {
  var row = [];
  for (var i = 0; i < FTP_HISTORY_FIELDS.length; i++) {
    row.push(cell(ftp[FTP_HISTORY_FIELDS[i]]));
  }
  return row;
}

/**
 * Every FTP setting, newest first by `date`, then `created`, then position in the
 * sheet (a later row is newer). A missing tab is no history, not an error.
 */
function ftpRowsNewestFirst() {
  var sheet = getSpreadsheet().getSheetByName(FTP_HISTORY_SHEET);
  if (!sheet) return [];
  var rows = getAllRows(sheet);
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var ftp = rowToFtp(rows[i]);
    if (ftp.id) list.push({ ftp: ftp, at: i });
  }
  list.sort(function (a, b) {
    if (a.ftp.date !== b.ftp.date) return a.ftp.date < b.ftp.date ? 1 : -1;
    if (a.ftp.created !== b.ftp.created) return a.ftp.created < b.ftp.created ? 1 : -1;
    return b.at - a.at;
  });
  return list.map(function (e) { return e.ftp; });
}

/** `{ current, history }`: `current` is the newest row, or null on an empty tab. */
function getFtp() {
  var history = ftpRowsNewestFirst();
  return { current: history.length ? history[0] : null, history: history };
}

/**
 * Add one FTP setting. A known `id` returns the existing row unchanged. Every refusal
 * happens before the write: `ramp_test` needs the test ride's `ride_id`, `manual` has
 * none, and the watts are a whole number from 50 to 1000.
 */
function addFtp(payload) {
  payload = spinPayload(payload);
  var id = checkSpinId(payload.id, 'id');
  if (!isRealLocalDate(payload.date)) throw badRequest(FTP_ERRORS.date);
  var watts = spinWhole(payload.ftp_w, FTP_MIN_W, FTP_MAX_W);
  if (watts === null) throw badRequest(FTP_ERRORS.ftp);
  if (FTP_SOURCES.indexOf(payload.source) === -1) throw badRequest(FTP_ERRORS.source);

  var rideId = payload.ride_id === undefined || payload.ride_id === null ? '' : payload.ride_id;
  if (payload.source === 'ramp_test') {
    if (typeof rideId !== 'string' || !SPIN_ID_PATTERN.test(rideId)) throw badRequest(FTP_ERRORS.rampRide);
  } else if (rideId !== '') {
    throw badRequest(FTP_ERRORS.manualRide);
  }

  var sheet = getSheet(FTP_HISTORY_SHEET);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, FTP_HISTORY_COLUMN_COUNT).getDisplayValues();
    for (var i = 0; i < rows.length; i++) {
      if (cell(rows[i][0]) === id) return rowToFtp(rows[i]);
    }
  }

  var ftp = {
    id: id,
    date: payload.date,
    ftp_w: String(watts),
    source: payload.source,
    ride_id: rideId,
    created: isoNow(),
  };
  sheet.appendRow(asText(ftpToRow(ftp)));
  return ftp;
}
