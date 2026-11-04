// An indoor ride from Thrive Spin (#765): `saveRide`, and `getWorkoutStreams` to read
// its streams back.
//
// `saveRide` is a form-encoded POST with four fields: `key`, `payload` (JSON, inside
// the usual 6000-character cap), `fit` (the FIT file, standard base64, at most 5 MB
// decoded) and `streams` (the streams JSON text, at most 4 MB). The two files travel
// outside `payload` because a ride is far over 6000 characters. Truncation is caught
// by hash: `payload` carries `fit_sha256` and `streams_sha256`. Nothing in the FIT file
// is parsed here beyond its `.FIT` signature.
//
// The ride is the Workouts row with `source = spin` and `source_activity_id = ride_id`.
// If it exists, nothing is written (no row, no Drive file) and the answer is `exists`.
// Every other refusal happens before the first Drive write or row write, so the
// phone's upload queue sees a permanent `bad_request` before anything has changed.
// Drive files are written before the row, and by name: an earlier attempt that died
// between the two leaves at most one file of each name, replaced rather than added
// beside. The files live in the Drive of the account the script runs as, under
// `Thrive Spin/fit/<YYYY>/<MM>/` and `Thrive Spin/streams/<YYYY>/<MM>/`.
//
// Like every Spin refusal the text is fixed and quotes nothing the caller sent.

var SPIN_ROOT_FOLDER = 'Thrive Spin';
var SPIN_FIT_FOLDER = 'fit';
var SPIN_STREAMS_FOLDER = 'streams';

var RIDE_FIT_MAX_BYTES = 5 * 1024 * 1024;
var RIDE_STREAMS_MAX_CHARS = 4 * 1024 * 1024;
var STREAMS_FORMAT = 'thrive-spin-streams';
var STREAMS_MAX_SECONDS = 43200;

var RIDE_ERRORS_SAVE = {
  field: 'a ride field is missing or out of range',
  startedAt: 'started_at_utc must be an ISO 8601 instant such as 2026-11-07T15:02:11Z',
  effort: 'effort must be Easy, Medium, Hard or blank',
  hash: 'fit_sha256 and streams_sha256 must each be 64 lowercase hex characters',
  fitMissing: 'fit is required: the FIT file as standard base64',
  fitBase64: 'fit is not standard base64',
  fitSize: 'fit is over the 5 MB limit',
  fitSignature: 'fit is not a FIT file: it lacks .FIT at bytes 8 to 11',
  fitHash: 'fit does not match fit_sha256, so it was truncated or changed in transit',
  streamsMissing: 'streams is required: the streams JSON text',
  streamsSize: 'streams is over the 4 MB limit',
  streamsHash: 'streams does not match streams_sha256, so it was truncated or changed in transit',
  streamsShape: 'streams is not a thrive-spin-streams v1 file for this ride',
};

var NOT_A_STREAMS_FILE =
  'streams_ref on this workout does not name its ride streams, so nothing was read from it.';

/** `value` as whole text of a number in [min, max]: avg_hr, calories and distance_m may also be null. */
function rideWhole(value, min, max, nullable) {
  if (value === null || value === undefined) {
    if (nullable) return '';
    throw badRequest(RIDE_ERRORS_SAVE.field);
  }
  var n = spinWhole(value, min, max);
  if (n === null) throw badRequest(RIDE_ERRORS_SAVE.field);
  return String(n);
}

/**
 * The payload's ride fields, checked: types and ranges only (the phone computes NP,
 * IF, TSS and kJ). `ride_workout_id` is not checked for existence, so a workout deleted
 * before the upload does not block the queue.
 */
function validateRidePayload(payload) {
  var rideId = checkSpinId(payload.ride_id, 'ride_id');

  var startedAt = payload.started_at_utc;
  if (typeof startedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(startedAt) ||
      isNaN(new Date(startedAt).getTime())) {
    throw badRequest(RIDE_ERRORS_SAVE.startedAt);
  }
  if (typeof payload.name !== 'string' || payload.name.trim() === '' || payload.name.length > 80) {
    throw badRequest(RIDE_ERRORS_SAVE.field);
  }
  var rideWorkoutId = payload.ride_workout_id === undefined || payload.ride_workout_id === null
    ? '' : payload.ride_workout_id;
  if (rideWorkoutId !== '') checkSpinId(rideWorkoutId, 'ride_workout_id');

  var effort = payload.effort === undefined || payload.effort === null ? '' : payload.effort;
  if (effort !== '' && EFFORTS.indexOf(effort) === -1) throw badRequest(RIDE_ERRORS_SAVE.effort);
  var notes = payload.notes === undefined || payload.notes === null ? '' : payload.notes;
  if (typeof notes !== 'string' || notes.length > 2000) throw badRequest(RIDE_ERRORS_SAVE.field);

  var factor = payload.intensity_factor;
  if (typeof factor === 'string' && /^\d+(\.\d+)?$/.test(factor.trim())) factor = Number(factor.trim());
  if (typeof factor !== 'number' || !isFinite(factor) || factor < 0 || factor > 5) {
    throw badRequest(RIDE_ERRORS_SAVE.field);
  }

  if (typeof payload.fit_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(payload.fit_sha256) ||
      typeof payload.streams_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(payload.streams_sha256)) {
    throw badRequest(RIDE_ERRORS_SAVE.hash);
  }

  return {
    ride_id: rideId,
    started_at_utc: startedAt,
    name: payload.name,
    ride_workout_id: rideWorkoutId,
    elapsed_seconds: rideWhole(payload.elapsed_seconds, 0, 172800, false),
    moving_seconds: rideWhole(payload.moving_seconds, 0, 172800, false),
    avg_hr: rideWhole(payload.avg_hr, 0, 300, true),
    calories: rideWhole(payload.calories, 0, 100000, true),
    distance_m: rideWhole(payload.distance_m, 0, 1000000, true),
    avg_power_w: rideWhole(payload.avg_power_w, 0, 3000, false),
    np_w: rideWhole(payload.np_w, 0, 3000, false),
    intensity_factor: factor.toFixed(2),
    tss: rideWhole(payload.tss, 0, 5000, false),
    work_kj: rideWhole(payload.work_kj, 0, 50000, false),
    ftp_w: rideWhole(payload.ftp_w, FTP_MIN_W, FTP_MAX_W, false),
    intensity_pct: rideWhole(payload.intensity_pct, 1, 300, false),
    effort: effort,
    notes: notes,
    fit_sha256: payload.fit_sha256,
    streams_sha256: payload.streams_sha256,
  };
}

/**
 * The FIT file's bytes, or a bad_request: standard base64, at most 5 MB decoded,
 * `.FIT` at bytes 8 to 11, and the hash the payload named.
 */
function decodeRideFit(fit, expectedSha) {
  if (typeof fit !== 'string' || fit === '') throw badRequest(RIDE_ERRORS_SAVE.fitMissing);
  if (fit.length % 4 !== 0 || !/^[A-Za-z0-9+\/]*={0,2}$/.test(fit)) throw badRequest(RIDE_ERRORS_SAVE.fitBase64);
  var padding = fit.charAt(fit.length - 1) === '=' ? (fit.charAt(fit.length - 2) === '=' ? 2 : 1) : 0;
  if ((fit.length / 4) * 3 - padding > RIDE_FIT_MAX_BYTES) throw badRequest(RIDE_ERRORS_SAVE.fitSize);

  var bytes = Utilities.base64Decode(fit);
  if (bytes.length < 12 || bytes[8] !== 0x2e || bytes[9] !== 0x46 || bytes[10] !== 0x49 || bytes[11] !== 0x54) {
    throw badRequest(RIDE_ERRORS_SAVE.fitSignature);
  }
  if (sha256HexOfBytes(bytes) !== expectedSha) throw badRequest(RIDE_ERRORS_SAVE.fitHash);
  return bytes;
}

/** An array of 1 to 43200 whole numbers (at least 0) or null. */
function isStreamArray(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > STREAMS_MAX_SECONDS) return false;
  for (var i = 0; i < value.length; i++) {
    if (value[i] !== null && !isWholeIn(value[i], 0, 1000000)) return false;
  }
  return true;
}

/** The streams file's shape (v1), for `saveRide`: the parsed object, or false. */
function isStreamsFile(streams, rideId) {
  if (!isPlainObject(streams) || streams.format !== STREAMS_FORMAT || streams.v !== 1) return false;
  if (streams.ride_id !== rideId) return false;
  if (typeof streams.started_at_utc !== 'string' || streams.interval_s !== 1) return false;
  if (!isWholeIn(streams.ftp_w, 0, 100000) || !isWholeIn(streams.intensity_pct, 0, 100000)) return false;

  var arrays = ['power_w', 'target_w', 'hr_bpm', 'cadence_rpm'];
  for (var i = 0; i < arrays.length; i++) {
    if (!isStreamArray(streams[arrays[i]])) return false;
    if (streams[arrays[i]].length !== streams.power_w.length) return false;
  }
  if (!Array.isArray(streams.steps) || streams.steps.length > 1000) return false;
  for (var s = 0; s < streams.steps.length; s++) {
    var step = streams.steps[s];
    if (!isPlainObject(step) || !isWholeIn(step.start_s, 0, 1000000) || !isWholeIn(step.end_s, 0, 1000000) ||
        typeof step.label !== 'string' || typeof step.mode !== 'string') return false;
  }
  if (!Array.isArray(streams.pauses) || streams.pauses.length > 1000) return false;
  for (var p = 0; p < streams.pauses.length; p++) {
    var pause = streams.pauses[p];
    if (!isPlainObject(pause) || !isWholeIn(pause.at_s, 0, 1000000) || !isWholeIn(pause.duration_s, 0, 1000000)) {
      return false;
    }
  }
  return true;
}

/** The streams text, checked: size, hash and shape. Throws a bad_request. */
function checkRideStreams(streams, ride) {
  if (typeof streams !== 'string' || streams === '') throw badRequest(RIDE_ERRORS_SAVE.streamsMissing);
  if (streams.length > RIDE_STREAMS_MAX_CHARS) throw badRequest(RIDE_ERRORS_SAVE.streamsSize);
  if (sha256Hex(streams) !== ride.streams_sha256) throw badRequest(RIDE_ERRORS_SAVE.streamsHash);
  var parsed;
  try {
    parsed = JSON.parse(streams);
  } catch (err) {
    throw badRequest(RIDE_ERRORS_SAVE.streamsShape);
  }
  if (!isStreamsFile(parsed, ride.ride_id)) throw badRequest(RIDE_ERRORS_SAVE.streamsShape);
}

/** The child folder of `parent` named `name`, created when there is none. */
function spinChildFolder(parent, name) {
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

/** The folder at `Thrive Spin/<kind>/<YYYY>/<MM>/`, created as needed. */
function spinFolder(kind, localDate) {
  var folder = spinChildFolder(DriveApp.getRootFolder(), SPIN_ROOT_FOLDER);
  var parts = [kind, localDate.slice(0, 4), localDate.slice(5, 7)];
  for (var i = 0; i < parts.length; i++) folder = spinChildFolder(folder, parts[i]);
  return folder;
}

/** Write `blob` into `folder`, replacing any file of its name, and return the new file's id. */
function replaceDriveFile(folder, name, blob) {
  var existing = folder.getFilesByName(name);
  while (existing.hasNext()) existing.next().setTrashed(true);
  return folder.createFile(blob).getId();
}

/** A ride's fields as Workouts values, shared by an append and a plan claim. */
function rideWorkoutFields(ride, refs, local) {
  return {
    date: local.date,
    time: local.time,
    type: 'bike',
    sub_type: 'indoor',
    source: 'spin',
    source_activity_id: ride.ride_id,
    status: '',
    elapsed_seconds: ride.elapsed_seconds,
    moving_seconds: ride.moving_seconds,
    avg_hr: ride.avg_hr,
    calories: ride.calories,
    distance_m: ride.distance_m,
    started_at_utc: ride.started_at_utc,
    fit_ref: refs.fit_ref,
    fit_fetched_at: refs.at,
    synced_at: refs.at,
    streams_ref: refs.streams_ref,
    avg_power_w: ride.avg_power_w,
    np_w: ride.np_w,
    intensity_factor: ride.intensity_factor,
    tss: ride.tss,
    work_kj: ride.work_kj,
    ftp_w: ride.ftp_w,
    intensity_pct: ride.intensity_pct,
    ride_workout_id: ride.ride_workout_id,
  };
}

/** A planned bike workout of the ride's day that no activity has claimed (#403's rule). */
function isClaimableRidePlan(row, date) {
  return cell(row[COL.STATUS]) === 'planned' &&
    cell(row[COL.TYPE]) === 'bike' &&
    cell(row[COL.DATE]) === date &&
    cell(row[COL.SOURCE]) === '' &&
    cell(row[COL.SOURCE_ACTIVITY_ID]) === '';
}

/**
 * Save one ride. Returns `{ status, id, fit_ref, streams_ref, ambiguous_plans? }`:
 *
 * - `exists`: the ride's row is already there; nothing was written, whatever else
 *   the payload says.
 * - `claimed`: exactly one planned bike row on the ride's date, with `source` and
 *   `source_activity_id` blank, took the ride. It keeps its `name`, `template_id` and
 *   `estimated_seconds`; the ride's `notes` and `effort` win when non-blank; and
 *   `ride_workout_id` becomes the workout ridden, because the row now records that.
 * - `created`: a new row. With two or more candidate plans, none is touched and their
 *   ids come back as `ambiguous_plans`.
 * - `merged` (#773): the COROS watch got there first. Exactly one `source = coros` bike/indoor
 *   row starts within RIDE_MATCH_TOLERANCE_MINUTES of the ride, so the ride is written onto
 *   it (`mergeRideOntoCorosRow`) and the answer adds `coros_activity_id`. It is checked
 *   before the plan claim, because the COROS row may itself have claimed the day's plan. With
 *   two or more such rows nothing is merged: the ride is created or claims a plan as above,
 *   and `ambiguous_coros` names the rows. A ride is never refused or lost for this.
 */
function saveRide(payload, fit, streams) {
  payload = spinPayload(payload);
  var rideId = checkSpinId(payload.ride_id, 'ride_id');

  var sheet = getSheet(WORKOUTS_SHEET);
  var rows = getAllRows(sheet);
  var matches = [];
  for (var i = 0; i < rows.length; i++) {
    if (cell(rows[i][COL.SOURCE]) === 'spin' && cell(rows[i][COL.SOURCE_ACTIVITY_ID]) === rideId) {
      matches.push({ rowNum: i + 2, row: rows[i] });
    }
  }
  if (matches.length > 1) {
    throw new Error(
      matches.length + ' Workouts rows are the same Thrive Spin ride (' +
      matches.map(function (m) { return cell(m.row[COL.ID]) + ' at row ' + m.rowNum; }).join(', ') +
      '). Delete all but one in Thrive; nothing was written.'
    );
  }
  if (matches.length === 1) {
    var existing = matches[0].row;
    return {
      status: 'exists', id: cell(existing[COL.ID]),
      fit_ref: cell(existing[COL.FIT_REF]), streams_ref: cell(existing[COL.STREAMS_REF]),
    };
  }

  // Everything is checked before the first write.
  var ride = validateRidePayload(payload);
  var fitBytes = decodeRideFit(fit, ride.fit_sha256);
  checkRideStreams(streams, ride);

  var instant = new Date(ride.started_at_utc);
  var local = {
    date: Utilities.formatDate(instant, TIMEZONE, 'yyyy-MM-dd'),
    time: Utilities.formatDate(instant, TIMEZONE, 'HH:mm'),
  };

  var refs = { at: isoNow() };
  try {
    refs.fit_ref = replaceDriveFile(
      spinFolder(SPIN_FIT_FOLDER, local.date),
      ride.ride_id + '.fit',
      Utilities.newBlob(fitBytes, 'application/octet-stream', ride.ride_id + '.fit'));
    refs.streams_ref = replaceDriveFile(
      spinFolder(SPIN_STREAMS_FOLDER, local.date),
      ride.ride_id + '.json',
      Utilities.newBlob(streams, 'application/json', ride.ride_id + '.json'));
  } catch (err) {
    if (isDrivePermissionError(err)) throw new Error(DRIVE_UNAUTHORIZED);
    throw err;
  }

  var values = rideWorkoutFields(ride, refs, local);

  var rideStart = rideInstant(ride.started_at_utc);
  var corosRows = [];
  for (var c = 0; c < rows.length; c++) {
    if (!isMergeableCorosRow(rows[c])) continue;
    if (!withinRideTolerance(rideInstant(rows[c][COL.STARTED_AT_UTC]), rideStart)) continue;
    corosRows.push({ rowNum: c + 2, id: cell(rows[c][COL.ID]) });
  }
  if (corosRows.length === 1) return mergeRideOntoCorosRow(sheet, corosRows[0], ride, values, refs, rideStart);

  var plans = [];
  for (var r = 0; r < rows.length; r++) {
    if (isClaimableRidePlan(rows[r], local.date)) plans.push({ rowNum: r + 2, id: cell(rows[r][COL.ID]) });
  }

  if (plans.length === 1) {
    // Row-index drift: confirm the row is still that plan before writing onto it.
    var range = sheet.getRange(plans[0].rowNum, 1, 1, WORKOUT_COLUMN_COUNT);
    var planRow = range.getDisplayValues()[0];
    if (cell(planRow[COL.ID]) !== plans[0].id || !isClaimableRidePlan(planRow, local.date)) {
      throw new Error(
        'Workouts row ' + plans[0].rowNum + ' was expected to hold workout ' + plans[0].id +
        '. The sheet changed during the write; nothing was written to it. Retry the upload.'
      );
    }
    var current = rowToWorkout(planRow, plans[0].rowNum);
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) current[key] = values[key];
    }
    if (ride.notes !== '') current.notes = ride.notes;
    if (ride.effort !== '') current.effort = ride.effort;
    range.setValues([asText(workoutToRow(current))]);
    var claimedResult = { status: 'claimed', id: current.id, fit_ref: refs.fit_ref, streams_ref: refs.streams_ref };
    if (corosRows.length > 1) claimedResult.ambiguous_coros = corosRows.map(function (m) { return m.id; });
    return claimedResult;
  }

  values.name = ride.name;
  values.notes = ride.notes;
  values.effort = ride.effort;
  var created = createWorkout(values, 'spin');
  var result = { status: 'created', id: created.id, fit_ref: refs.fit_ref, streams_ref: refs.streams_ref };
  if (plans.length > 1) {
    result.ambiguous_plans = plans.map(function (p) { return p.id; });
  }
  if (corosRows.length > 1) {
    result.ambiguous_coros = corosRows.map(function (m) { return m.id; });
  }
  return result;
}

/**
 * Write a ride onto the COROS row the watch already added for it (#773), in one row write,
 * after the files. From then on the row is a Spin row, found by `source_activity_id = ride_id`
 * and carrying the COROS activity id in `coros_activity_id`.
 *
 * Kept: `id`, `created`, `copied_from`, `template_id`, `estimated_seconds`, `sport_type`,
 * `track_ref`, `trails`, and the watch's `ascent_m` and `descent_m`. Spin is the authority for
 * the ride: `date`, `time`, `started_at_utc`, `elapsed_seconds`, `moving_seconds`, `avg_hr`,
 * `calories` and `distance_m` take Spin's value where it sent one and keep the row's where it
 * sent none; `effort` and `notes` take Spin's when non-blank. `name` is Spin's unless the row
 * carries `template_id` or `estimated_seconds`, the marks of a claimed plan, whose name is the
 * owner's. `raw_ref` is cleared: the row no longer holds a COROS activity id for
 * `getWorkoutPayload` to check it against. The COROS FIT and archive stay in Drive.
 */
function mergeRideOntoCorosRow(sheet, target, ride, values, refs, rideStart) {
  // Row-index drift: confirm the row is still that COROS candidate before writing onto it.
  var range = sheet.getRange(target.rowNum, 1, 1, WORKOUT_COLUMN_COUNT);
  var row = range.getDisplayValues()[0];
  if (cell(row[COL.ID]) !== target.id || !isMergeableCorosRow(row) ||
      !withinRideTolerance(rideInstant(row[COL.STARTED_AT_UTC]), rideStart)) {
    throw new Error(
      'Workouts row ' + target.rowNum + ' was expected to hold workout ' + target.id +
      '. The sheet changed during the write; nothing was written to it. Retry the upload.'
    );
  }
  var current = rowToWorkout(row, target.rowNum);
  var corosId = current.source_activity_id;
  var planned = current.template_id !== '' || current.estimated_seconds !== '';

  var spinWins = ['date', 'time', 'started_at_utc', 'elapsed_seconds', 'moving_seconds', 'avg_hr', 'calories', 'distance_m'];
  for (var i = 0; i < spinWins.length; i++) {
    if (values[spinWins[i]] !== '') current[spinWins[i]] = values[spinWins[i]];
  }
  var spinOwned = [
    'fit_ref', 'fit_fetched_at', 'streams_ref', 'synced_at',
    'avg_power_w', 'np_w', 'intensity_factor', 'tss', 'work_kj', 'ftp_w', 'intensity_pct', 'ride_workout_id',
  ];
  for (var o = 0; o < spinOwned.length; o++) current[spinOwned[o]] = values[spinOwned[o]];

  current.source = 'spin';
  current.source_activity_id = ride.ride_id;
  current.coros_activity_id = corosId;
  current.raw_ref = '';
  current.status = '';
  if (!planned) current.name = ride.name;
  if (ride.notes !== '') current.notes = ride.notes;
  if (ride.effort !== '') current.effort = ride.effort;

  range.setValues([asText(workoutToRow(current))]);
  return {
    status: 'merged', id: current.id, coros_activity_id: corosId,
    fit_ref: refs.fit_ref, streams_ref: refs.streams_ref,
  };
}

// --- Reading a ride's streams back -------------------------------------------------

/**
 * A ride's streams: `{ workout_id, ride_id, streams_ref, streams }`, `streams` being
 * the stored file parsed. Addressed by workout, never by Drive ID, like `getWorkoutTrack`:
 * `streams_ref` is a column and the same Drive holds files that are not ride streams, so
 * the file must be, by name, place, size and content, this ride's. Every refusal is fixed
 * text that quotes nothing from the file or the request.
 */
function getWorkoutStreams(id) {
  var workout = getWorkout(id);
  if (!workout) throw new Error('No workout with that id');
  if (workout.source !== 'spin') {
    throw new Error('That workout is not a Thrive Spin ride, so it has no streams.');
  }
  if (!workout.streams_ref) {
    throw new Error('That ride has no streams (streams_ref is blank).');
  }
  if (!workout.source_activity_id) {
    throw new Error('That ride has a streams_ref but no source_activity_id, so its streams cannot be confirmed. Nothing was read.');
  }
  return {
    workout_id: workout.id,
    ride_id: workout.source_activity_id,
    streams_ref: workout.streams_ref,
    streams: readStreamsFile(workout.streams_ref, workout.source_activity_id),
  };
}

/**
 * The streams object at `fileId`, confirmed to be `rideId`'s: named `<rideId>.json`, at
 * `Thrive Spin/streams/<YYYY>/<MM>/` with each folder the only parent at its level, at
 * most 4 MB, `format: "thrive-spin-streams"` and a `ride_id` equal to the row's. Throws
 * NOT_A_STREAMS_FILE for anything else, and DRIVE_UNAUTHORIZED while the scope is missing.
 */
function readStreamsFile(fileId, rideId) {
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    // Drive's own message is not passed on: it can name the file.
    if (isDrivePermissionError(err)) throw new Error(DRIVE_UNAUTHORIZED);
    throw new Error(NOT_A_STREAMS_FILE);
  }

  var streams;
  try {
    if (file.isTrashed()) throw new Error('trashed');
    if (file.getName() !== rideId + '.json') throw new Error('name');
    if (file.getSize() > RIDE_STREAMS_MAX_CHARS) throw new Error('size');
    if (!isInStreamsArchive(file)) throw new Error('place');
    streams = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  } catch (err) {
    if (isDrivePermissionError(err)) throw new Error(DRIVE_UNAUTHORIZED);
    throw new Error(NOT_A_STREAMS_FILE);
  }

  if (!isPlainObject(streams) || streams.format !== STREAMS_FORMAT || String(streams.ride_id) !== String(rideId)) {
    throw new Error(NOT_A_STREAMS_FILE);
  }
  return streams;
}

/**
 * Whether the file sits at `Thrive Spin/streams/<YYYY>/<MM>/`. Each folder must be the
 * only parent at its level, as `saveRide` makes them.
 */
function isInStreamsArchive(file) {
  var month = onlyParent(file);
  if (!month || !/^\d{2}$/.test(month.getName())) return false;
  var year = onlyParent(month);
  if (!year || !/^\d{4}$/.test(year.getName())) return false;
  var streams = onlyParent(year);
  if (!streams || streams.getName() !== SPIN_STREAMS_FOLDER) return false;
  var root = onlyParent(streams);
  return !!root && root.getName() === SPIN_ROOT_FOLDER;
}
