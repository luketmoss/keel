// COROS and Thrive Spin recorded the same indoor ride (#773): `enrichRide`, and the helpers
// `saveRide`'s merge shares with it.
//
// A trainer ride is recorded on the phone (Thrive Spin, source `spin`) and, as the epic
// recommends, on the COROS watch as Indoor Bike (sport code 201). The watch has the heart
// rate and calories the phone may not. Whichever device reaches Thrive first, the end state
// is one Workouts row, `source = spin`, with `coros_activity_id` (AN) naming the COROS
// activity:
//
// - Spin first: the COROS sync calls `enrichRide` for the 201 activity before it writes a
//   row. It finds the one Spin row starting within RIDE_MATCH_TOLERANCE_MINUTES of the
//   activity, links it and fills its blanks.
// - COROS first: the sync wrote a `source = coros` row. `saveRide` (rides.js) finds it and
//   writes the ride onto it.
//
// Matching is by instant (`started_at_utc`, compared as milliseconds), never by the date or
// time columns, so a ride across midnight matches. Two or more candidates never match, even
// when one is nearer: they are surfaced, not guessed.

/** `started_at_utc` as milliseconds since the epoch, or null when it is blank or unreadable. */
function rideInstant(value) {
  var text = cell(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  var ms = new Date(text).getTime();
  return isNaN(ms) ? null : ms;
}

/** Whether two instants (milliseconds) are within RIDE_MATCH_TOLERANCE_MINUTES, inclusive. */
function withinRideTolerance(a, b) {
  return Math.abs(a - b) <= RIDE_MATCH_TOLERANCE_MINUTES * 60 * 1000;
}

/**
 * A Spin row `enrichRide` may link: `source = spin`, bike, indoor, finished (`status`
 * blank), not linked to a COROS activity, with a readable start. Not yet within the
 * tolerance: the caller compares the instant.
 */
function isLinkableSpinRow(row) {
  return cell(row[COL.SOURCE]) === 'spin' &&
    cell(row[COL.TYPE]) === 'bike' &&
    cell(row[COL.SUB_TYPE]) === 'indoor' &&
    cell(row[COL.STATUS]) === '' &&
    cell(row[COL.COROS_ACTIVITY_ID]) === '' &&
    rideInstant(row[COL.STARTED_AT_UTC]) !== null;
}

/**
 * A COROS row a Spin ride may be written onto (`saveRide`'s merge): `source = coros`,
 * bike, indoor, finished, with a readable start. Not yet within the tolerance.
 */
function isMergeableCorosRow(row) {
  return cell(row[COL.SOURCE]) === 'coros' &&
    cell(row[COL.TYPE]) === 'bike' &&
    cell(row[COL.SUB_TYPE]) === 'indoor' &&
    cell(row[COL.STATUS]) === '' &&
    rideInstant(row[COL.STARTED_AT_UTC]) !== null;
}

/** The COROS activity as the sync sends it: its start and ENRICH_FIELDS. */
function normalizeRideActivity(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('activity must be an object keyed by field name');
  }
  var allowed = ['date', 'time', 'started_at_utc'].concat(ENRICH_FIELDS);
  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    if (allowed.indexOf(key) === -1) {
      throw new Error('activity: "' + key + '" is not a ride field. Valid fields: ' + allowed.join(', '));
    }
  }
  var out = {};
  for (var i = 0; i < allowed.length; i++) out[allowed[i]] = cell(data[allowed[i]]);
  if (rideInstant(out.started_at_utc) === null) {
    throw new Error('activity.started_at_utc must be an ISO 8601 instant such as 2026-11-07T15:02:11Z, got "' + out.started_at_utc + '"');
  }
  if (out.date) validateDate('activity.date', out.date);
  if (out.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.time)) {
    throw new Error('activity.time must be local HH:MM or blank, got "' + out.time + '"');
  }
  for (var j = 0; j < ENRICH_FIELDS.length; j++) {
    var n = ENRICH_FIELDS[j];
    if (out[n] && !/^\d+$/.test(out[n])) {
      throw new Error('activity.' + n + ' must be a whole number or blank, got "' + out[n] + '"');
    }
  }
  return out;
}

/**
 * Link a COROS indoor-bike activity (sport code 201) to its Spin ride and fill the ride's
 * blanks from the watch (#773). Never creates a row. Finding, filling and writing are one
 * execution, under the script lock, like `enrichWorkout`, which it is built from.
 *
 * 1. **Already linked.** A row whose `coros_activity_id` is this activity's id is its row.
 *    More than one is refused, naming them.
 * 2. **Not linked.** If a row with `source = coros` and this `source_activity_id` exists, the
 *    watch synced first and Spin has not uploaded yet (or it is an old duplicate): `unmatched`,
 *    reason `own row`. Otherwise a candidate is an isLinkableSpinRow whose start is within
 *    RIDE_MATCH_TOLERANCE_MINUTES (inclusive) of the activity's `started_at_utc`. Exactly one
 *    is linked. None: `unmatched`, reason `no match`. Two or more, even if one is nearer:
 *    `unmatched`, reason `ambiguous`, with their ids and start times. No unmatched answer
 *    writes anything.
 * 3. **Fill.** The row gains `coros_activity_id`, `sport_type` (`201`) and `synced_at`. Each
 *    ENRICH_FIELDS field is filled only where the row is blank, COROS has a value and this
 *    activity has not filled it before (`last_written.filled`, for the same `workout_id`),
 *    so a clearing in Thrive sticks. A call that links nothing new and fills nothing writes
 *    nothing, `synced_at` included: `unchanged`.
 *
 * Nothing else is written: not AE:AM, the FIT, track or trails, `raw_ref`, `source`,
 * `source_activity_id`, `name`, `notes`, `effort`, `status`, `date`, `time`, `started_at_utc`,
 * `distance_m` or any other column. The row keeps `source = spin`.
 *
 * @returns {{ status: 'enriched' | 'unchanged' | 'unmatched', id?: string,
 *   sheetRow?: number, linked?: boolean, filled?: string[], reason?: string,
 *   candidates?: { id: string, started_at_utc: string }[],
 *   written?: { workout_id: string, filled: string[] } }}
 *   `filled` is what this call filled; `written.filled` every field this activity has filled
 *   on the row, for the sync to store as the next `last_written`. `linked` is true when this
 *   call made the link.
 */
function enrichRide(payload) {
  payload = payload || {};
  var activityId = cell(payload.source_activity_id);
  var syncedAt = cell(payload.synced_at);
  if (!/^\d+$/.test(activityId)) throw new Error('source_activity_id is required: the COROS activity id, digits only');
  if (!syncedAt) throw new Error('synced_at is required');

  var sportType = normalizeSyncedSportType(payload);
  if (sportType !== undefined && sportType !== COROS_INDOOR_BIKE_SPORT) {
    throw new Error('enrichRide serves COROS sport code ' + COROS_INDOOR_BIKE_SPORT + ' (indoor bike) only, got "' + sportType + '"');
  }
  var activity = normalizeRideActivity(payload.activity);
  var previous = normalizeEnrichLastWritten(payload.last_written);

  var sheet = getSheet(WORKOUTS_SHEET);
  var rows = getAllRows(sheet);

  var links = [];
  var ownRow = false;
  for (var i = 0; i < rows.length; i++) {
    if (cell(rows[i][COL.COROS_ACTIVITY_ID]) === activityId) {
      links.push({ rowNum: i + 2, id: cell(rows[i][COL.ID]) });
    }
    if (cell(rows[i][COL.SOURCE]) === 'coros' && cell(rows[i][COL.SOURCE_ACTIVITY_ID]) === activityId) {
      ownRow = true;
    }
  }
  if (links.length > 1) {
    throw new Error(
      links.length + ' Workouts rows are linked to COROS activity ' + activityId + ' (' +
      links.map(function (m) { return m.id + ' at row ' + m.rowNum; }).join(', ') +
      '). Clear coros_activity_id on all but one; nothing was written.'
    );
  }

  var target;
  var linked = false;
  var alreadyFilled = [];
  if (links.length === 1) {
    target = links[0];
    if (previous && previous.workout_id === target.id) alreadyFilled = previous.filled;
  } else {
    if (ownRow) return { status: 'unmatched', reason: 'own row', candidates: [] };

    var start = rideInstant(activity.started_at_utc);
    var within = [];
    for (var r = 0; r < rows.length; r++) {
      if (!isLinkableSpinRow(rows[r])) continue;
      if (!withinRideTolerance(rideInstant(rows[r][COL.STARTED_AT_UTC]), start)) continue;
      within.push({ rowNum: r + 2, id: cell(rows[r][COL.ID]), started_at_utc: cell(rows[r][COL.STARTED_AT_UTC]) });
    }
    if (within.length !== 1) {
      return {
        status: 'unmatched',
        reason: within.length ? 'ambiguous' : 'no match',
        candidates: within.map(function (c) { return { id: c.id, started_at_utc: c.started_at_utc }; }),
      };
    }
    target = within[0];
    linked = true;
  }

  // Row-index drift (sync plan §10): confirm the row is still the one chosen.
  var current = rowToWorkout(
    sheet.getRange(target.rowNum, 1, 1, WORKOUT_COLUMN_COUNT).getDisplayValues()[0],
    target.rowNum
  );
  var expectedLink = linked ? '' : activityId;
  if (current.id !== target.id || current.source !== 'spin' || current.coros_activity_id !== expectedLink) {
    throw new Error(
      'Workouts row ' + target.rowNum + ' was expected to be ' + target.id + ' but changed during ' +
      'the write; nothing was written. Re-run the sync.'
    );
  }

  var filledNow = [];
  for (var f = 0; f < ENRICH_FIELDS.length; f++) {
    var field = ENRICH_FIELDS[f];
    if (alreadyFilled.indexOf(field) !== -1) continue;
    if (current[field] !== '' || activity[field] === '') continue;
    current[field] = activity[field];
    filledNow.push(field);
  }
  var allFilled = ENRICH_FIELDS.filter(function (x) {
    return alreadyFilled.indexOf(x) !== -1 || filledNow.indexOf(x) !== -1;
  });
  var written = { workout_id: current.id, filled: allFilled };

  if (!linked && filledNow.length === 0) {
    return { status: 'unchanged', id: current.id, sheetRow: target.rowNum, linked: false, filled: [], written: written };
  }

  current.coros_activity_id = activityId;
  current.sport_type = COROS_INDOOR_BIKE_SPORT;
  current.synced_at = syncedAt;
  sheet.getRange(target.rowNum, 1, 1, WORKOUT_COLUMN_COUNT).setValues([asText(workoutToRow(current))]);
  return {
    status: 'enriched', id: current.id, sheetRow: target.rowNum,
    linked: linked, filled: filledNow, written: written,
  };
}
