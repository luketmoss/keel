// The RideWorkouts tab (#765): Thrive Spin's workout library.
//
// One row per library workout, written by the API alone: `saveRideWorkout` and
// `deleteRideWorkout`, for the Spin key, the MCP key (change-logged, #434) and the
// full key. RIDE_WORKOUT_FIELDS in types.js is the one layout on this side;
// frontend/src/api/spin-rows.ts mirrors it.
//
// The Spin key lives on a phone, so every refusal is fixed text that quotes nothing
// the caller sent, and every refusal of bad input is `code: 'bad_request'`, raised
// before anything is written, so the upload queue can tell a permanent refusal from a
// transient one.
//
// Steps JSON, v1. Targets are % of FTP and never watts:
//   {"v":1,"steps":[
//     {"label":"Warm-up","dur_s":600,"mode":"erg","pct":50,"pct_end":70},
//     {"repeat":3,"steps":[{"label":"Sweet spot","dur_s":720,"mode":"erg","pct":90,"cadence":90},
//                          {"label":"Recover","dur_s":240,"mode":"erg","pct":55}]},
//     {"label":"Climb","dur_s":300,"mode":"slope","grade":4.5},
//     {"label":"Spin","dur_s":300,"mode":"resistance","level":30},
//     {"label":"Cool-down","dur_s":360,"mode":"free"}]}

var RIDE_WORKOUTS_SHEET = 'RideWorkouts';

var RIDE_STEPS_MAX_CHARS = 5000;
var RIDE_STEPS_MAX_TOTAL_S = 21600;

var RIDE_ERRORS = {
  name: 'name must be 1 to 80 characters and not blank',
  category: 'category must be Endurance, Sweet spot, Threshold, VO2 or Recovery',
  description: 'description must be text of at most 1000 characters',
  stepsShape: 'steps must be {"v":1,"steps":[...]} with 1 to 100 blocks and no other key',
  stepsJson: 'steps must be an object, or JSON text of one',
  stepsChars: 'steps is over the 5000 character limit',
  stepsTotal: 'steps add up to more than 6 hours (21600 seconds)',
  step: 'a step needs a label of 1 to 40 characters, dur_s 1 to 14400, a mode of erg, resistance, slope or free, and only that mode\'s target and an optional cadence',
  stepTarget: 'a step\'s target is out of range: erg pct 0 to 300 (pct_end the same), resistance level 0 to 100, slope grade -10.0 to 20.0 in one decimal, cadence 40 to 150',
  repeat: 'a repeat is {"repeat": 2 to 50, "steps": [1 to 20 steps]} and does not nest',
};

/** A RideWorkouts row -> {id, ..., updated}, '' where unset. `steps` stays the stored text. */
function rowToRideWorkout(row) {
  var rw = {};
  for (var i = 0; i < RIDE_WORKOUT_FIELDS.length; i++) {
    rw[RIDE_WORKOUT_FIELDS[i]] = cell(row[i]);
  }
  return rw;
}

/** A library workout -> exactly RIDE_WORKOUT_COLUMN_COUNT cells. */
function rideWorkoutToRow(rw) {
  var row = [];
  for (var i = 0; i < RIDE_WORKOUT_FIELDS.length; i++) {
    row.push(cell(rw[RIDE_WORKOUT_FIELDS[i]]));
  }
  return row;
}

/** The stored steps text as an object, or null when a hand edit left it unreadable. */
function parseStepsCell(text) {
  try {
    var steps = JSON.parse(text);
    return isPlainObject(steps) ? steps : null;
  } catch (err) {
    return null;
  }
}

/** The sheet row of a library id: { rowNum, rw }, or null. First row wins. */
function findRideWorkout(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, RIDE_WORKOUT_COLUMN_COUNT).getDisplayValues();
  for (var i = 0; i < rows.length; i++) {
    if (cell(rows[i][0]) === id) return { rowNum: i + 2, rw: rowToRideWorkout(rows[i]) };
  }
  return null;
}

/**
 * The newest `date` of a completed `source = spin` ride of each library workout,
 * as { id: date }. Completed is anything but a plan or a workout still being done.
 */
function lastRiddenDates() {
  var rows = getAllRows(getSheet(WORKOUTS_SHEET));
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var id = cell(rows[i][COL.RIDE_WORKOUT_ID]);
    var status = cell(rows[i][COL.STATUS]);
    if (!id || cell(rows[i][COL.SOURCE]) !== 'spin' || status === 'planned' || status === 'active') continue;
    var date = cell(rows[i][COL.DATE]);
    if (date && (!out[id] || date > out[id])) out[id] = date;
  }
  return out;
}

/** The row as the API returns it: `steps` parsed, `last_ridden_date` added. */
function describeRideWorkout(rw, lastRidden) {
  var out = {};
  for (var i = 0; i < RIDE_WORKOUT_FIELDS.length; i++) {
    out[RIDE_WORKOUT_FIELDS[i]] = rw[RIDE_WORKOUT_FIELDS[i]];
  }
  out.steps = parseStepsCell(rw.steps);
  out.last_ridden_date = lastRidden[rw.id] || '';
  return out;
}

/**
 * Whether `value` may be set as a Workouts row's `ride_workout_id` (AL): '' always,
 * and otherwise an id that exists in RideWorkouts, on a `bike` row only. Fixed text.
 */
function checkRideWorkoutLink(type, value) {
  if (value === undefined || value === '') return;
  if (type !== 'bike') {
    throw new Error('ride_workout_id can be set on a bike workout only');
  }
  if (!SPIN_ID_PATTERN.test(value)) {
    throw new Error('ride_workout_id must be "" or the id of a RideWorkouts row');
  }
  var sheet = getSpreadsheet().getSheetByName(RIDE_WORKOUTS_SHEET);
  if (!sheet || !findRideWorkout(sheet, value)) {
    throw new Error('ride_workout_id must be "" or the id of a RideWorkouts row');
  }
}

// --- Steps ----------------------------------------------------------------------

/** One step's checks. Returns its seconds; throws a fixed-text bad_request. */
function validateRideStep(step) {
  if (!isPlainObject(step)) throw badRequest(RIDE_ERRORS.step);

  var targets = { erg: ['pct', 'pct_end'], resistance: ['level'], slope: ['grade'], free: [] };
  if (typeof step.mode !== 'string' || !Object.prototype.hasOwnProperty.call(targets, step.mode)) {
    throw badRequest(RIDE_ERRORS.step);
  }
  if (!hasOnlyKeys(step, ['label', 'dur_s', 'mode', 'cadence'].concat(targets[step.mode]))) {
    throw badRequest(RIDE_ERRORS.step);
  }
  if (typeof step.label !== 'string' || step.label.trim() === '' || step.label.length > 40) {
    throw badRequest(RIDE_ERRORS.step);
  }
  if (!isWholeIn(step.dur_s, 1, 14400)) throw badRequest(RIDE_ERRORS.step);

  if (hasKey(step, 'cadence') && !isWholeIn(step.cadence, 40, 150)) {
    throw badRequest(RIDE_ERRORS.stepTarget);
  }
  if (step.mode === 'erg') {
    if (!isWholeIn(step.pct, 0, 300)) throw badRequest(RIDE_ERRORS.stepTarget);
    if (hasKey(step, 'pct_end') && !isWholeIn(step.pct_end, 0, 300)) throw badRequest(RIDE_ERRORS.stepTarget);
  } else if (step.mode === 'resistance') {
    if (!isWholeIn(step.level, 0, 100)) throw badRequest(RIDE_ERRORS.stepTarget);
  } else if (step.mode === 'slope') {
    var g = step.grade;
    var oneDecimal = typeof g === 'number' && isFinite(g) && Math.abs(g * 10 - Math.round(g * 10)) < 1e-9;
    if (!oneDecimal || g < -10 || g > 20) throw badRequest(RIDE_ERRORS.stepTarget);
  }
  return step.dur_s;
}

/** One top-level block: a step or a repeat. Returns its seconds, repeats expanded. */
function validateRideBlock(block) {
  if (isPlainObject(block) && Object.prototype.hasOwnProperty.call(block, 'repeat')) {
    if (!hasOnlyKeys(block, ['repeat', 'steps']) || !isWholeIn(block.repeat, 2, 50) ||
        !Array.isArray(block.steps) || block.steps.length < 1 || block.steps.length > 20) {
      throw badRequest(RIDE_ERRORS.repeat);
    }
    var inner = 0;
    for (var i = 0; i < block.steps.length; i++) inner += validateRideStep(block.steps[i]);
    return inner * block.repeat;
  }
  return validateRideStep(block);
}

/**
 * The steps JSON of a library workout, checked whole before anything is written.
 * `value` is the object, or JSON text of it. Returns `{ json, duration_s }`: the
 * text to store and the total seconds with repeats expanded.
 */
function validateRideSteps(value) {
  var steps = value;
  if (typeof value === 'string') {
    try {
      steps = JSON.parse(value);
    } catch (err) {
      throw badRequest(RIDE_ERRORS.stepsJson);
    }
  }
  if (!isPlainObject(steps) || !hasOnlyKeys(steps, ['v', 'steps']) || steps.v !== 1 ||
      !Array.isArray(steps.steps) || steps.steps.length < 1 || steps.steps.length > 100) {
    throw badRequest(RIDE_ERRORS.stepsShape);
  }
  var total = 0;
  for (var i = 0; i < steps.steps.length; i++) total += validateRideBlock(steps.steps[i]);
  if (total > RIDE_STEPS_MAX_TOTAL_S) throw badRequest(RIDE_ERRORS.stepsTotal);

  var json = JSON.stringify(steps);
  if (json.length > RIDE_STEPS_MAX_CHARS) throw badRequest(RIDE_ERRORS.stepsChars);
  return { json: json, duration_s: total };
}

// --- Actions --------------------------------------------------------------------

/** Every library workout, ordered by name, with its `last_ridden_date`. A missing tab is no workouts. */
function getRideWorkouts() {
  var sheet = getSpreadsheet().getSheetByName(RIDE_WORKOUTS_SHEET);
  if (!sheet) return [];
  var workouts = [];
  var rows = getAllRows(sheet);
  for (var i = 0; i < rows.length; i++) {
    var rw = rowToRideWorkout(rows[i]);
    if (rw.id) workouts.push(rw);
  }
  workouts.sort(function (a, b) {
    var x = a.name.toLowerCase();
    var y = b.name.toLowerCase();
    if (x !== y) return x < y ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  var lastRidden = workouts.length ? lastRiddenDates() : {};
  return workouts.map(function (rw) { return describeRideWorkout(rw, lastRidden); });
}

/**
 * Save one library workout: a known `id` replaces that row in place and keeps
 * `created`; an unknown or absent one appends. `duration_s` is computed here from the
 * steps and is never accepted from a caller. Every refusal happens before the write.
 */
function saveRideWorkout(payload) {
  payload = spinPayload(payload);

  var id = '';
  if (payload.id !== undefined && payload.id !== null && payload.id !== '') {
    id = checkSpinId(payload.id, 'id');
  }
  if (typeof payload.name !== 'string' || payload.name.trim() === '' || payload.name.length > 80) {
    throw badRequest(RIDE_ERRORS.name);
  }
  if (RIDE_WORKOUT_CATEGORIES.indexOf(payload.category) === -1) throw badRequest(RIDE_ERRORS.category);
  var description = payload.description === undefined || payload.description === null ? '' : payload.description;
  if (typeof description !== 'string' || description.length > 1000) throw badRequest(RIDE_ERRORS.description);
  var steps = validateRideSteps(payload.steps);

  var sheet = getSheet(RIDE_WORKOUTS_SHEET);
  var found = id ? findRideWorkout(sheet, id) : null;
  if (!id) id = 'rw_' + Utilities.getUuid().slice(0, 8);

  var now = isoNow();
  var rw = {
    id: id,
    name: payload.name,
    category: payload.category,
    description: description,
    steps: steps.json,
    duration_s: String(steps.duration_s),
    created: found && found.rw.created ? found.rw.created : now,
    updated: now,
  };
  if (found) {
    sheet.getRange(found.rowNum, 1, 1, RIDE_WORKOUT_COLUMN_COUNT).setValues([asText(rideWorkoutToRow(rw))]);
  } else {
    sheet.appendRow(asText(rideWorkoutToRow(rw)));
  }
  return describeRideWorkout(rw, lastRiddenDates());
}

/**
 * Remove one library workout. An id with no row answers `deleted: false`, so a retry
 * is not an error. Plans and rides that name it keep the id.
 */
function deleteRideWorkout(payload) {
  payload = spinPayload(payload);
  var id = checkSpinId(payload.id, 'id');
  var sheet = getSheet(RIDE_WORKOUTS_SHEET);
  var found = findRideWorkout(sheet, id);
  if (!found) return { id: id, deleted: false };
  sheet.deleteRow(found.rowNum);
  return { id: id, deleted: true };
}
