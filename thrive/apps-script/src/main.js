// Entry point for the Thrive Apps Script web app.
//
// doGet and doPost share one handler over `e.parameter` (#144). Apps Script
// fills `e.parameter` from a form-encoded POST body exactly as it does from a
// query string, so a POST behaves identically to a GET.
//
// Key callers — the MCP server and the COROS sync — use GET for everything,
// writes included: Apps Script answers every call with a 302, and a client
// that does not follow a POST's redirect never sees the answer. Writes pass
// their data as a URL-encoded `payload` query parameter, which is why that
// parameter has a length ceiling — see MAX_PAYLOAD_CHARS in types.js.
//
// The SPA (#410; almanac, retired, before it), a browser app, POSTs
// form-encoded with `access_token` instead of `key`, so a live token never
// sits in a URL. `fetch` follows the 302 as a GET, and both hops carry
// `Access-Control-Allow-Origin: *`. A token caller may run only the reads in
// TOKEN_READ_ACTIONS and the one write in TOKEN_WRITE_ACTIONS — see auth.js.
//
// Token examples (POST body, or a query string from a terminal):
//   action=getWorkouts&access_token=...&from=2026-09-21&to=2026-09-27
//   action=requestSync&access_token=...&payload={"request_ids":["sr_1a2b3c4d"]}
//     — dispatch the named SyncRequests rows now, under the poller's rules (#410)
//
// Read examples:
//   ?action=getWorkouts&key=...
//   ?action=getWorkouts&key=...&from=2026-09-01&to=2026-09-30&type=bike
//   ?action=getWorkout&key=...&id=w_1a2b3c4d
//   ?action=getPlannedWorkouts&key=...&date=2026-09-21   — adds exercise_count/set_count (#146)
//   ?action=getWorkoutPayload&key=...&id=w_1a2b3c4d&offset=0   — key only (#179)
//   ?action=getWorkoutTrack&key=...&id=w_1a2b3c4d   — the route; a token caller too (#432)
//
// Write examples:
//   ?action=createWorkout&key=...&payload={"data":{"type":"bike","name":"Evening Ride"}}
//   ?action=updateWorkout&key=...&payload={"id":"w_1a2b3c4d","changes":{"effort":"Hard"}}
//
// Sets are addressed by domain identifiers, never by row (#134):
//   ?action=updateSets&key=...&payload={"workout_id":"w_1","updates":[
//     {"exercise":"Bench Press","set_number":1,"weight":"185","reps":"6"}]}
//   ?action=previewSetUpdates&key=...&payload={...}   — resolves, writes nothing
//
// DailyHealth rows are read and addressed by date (#165, #158):
//   ?action=getDailyHealth&key=...&from=2026-09-01&to=2026-09-30   — oldest first
//   ?action=upsertDailyHealth&key=...&payload={"rows":[{"date":"2026-09-23",
//     "steps":"2617","raw_ref":"<drive id>"}],"synced_at":"2026-09-24T13:25:32.000Z"}
//
// Journal: one note per local date (#234). Key-only. A blank note deletes the day:
//   ?action=getJournal&key=...&from=2026-09-01&to=2026-09-30   — oldest first
//   ?action=upsertJournal&key=...&payload={"date":"2026-09-23","note":"Slept badly."}
//
// BodyMeasurements rows are read by local date range and optional kind (#201):
//   ?action=getBodyMeasurements&key=...&from=2026-09-01&to=2026-09-30&kind=scale
//
// BodyMeasurements rows are addressed by Withings grpid and rewritten whole (#198):
//   ?action=upsertBodyMeasurements&key=...&payload={"rows":[{"grpid":"123456",
//     "date":"2026-09-24","time":"06:41","measured_at_utc":"2026-09-24T06:41:12-06:00",
//     "kind":"scale","weight_kg":"81.234",...,"source":"withings","raw_ref":"<drive id>"}],
//     "synced_at":"2026-09-24T13:25:32.000Z"}
//   ?action=reconcileBodyMeasurements&key=...&payload={"from":"2026-08-26",
//     "to":"2026-09-26","present_grpids":["101","103"],"max_deletions":5}
//     — deletes in-window rows whose grpid is absent (#215), capped
//
// Synced activities are addressed by vendor ID, and merged (#166):
//   ?action=upsertSyncedWorkout&key=...&payload={"source":"coros",
//     "source_activity_id":"471166302945817201","incoming":{"date":"2026-09-24",
//     "type":"bike","sub_type":"gravel","name":"Gravel Bike",...},
//     "last_written":null,"raw_ref":"<drive id>","synced_at":"2026-09-24T17:41:10.000Z",
//     "sport_type":"203"}
//     — `sport_type` (#260) is top-level, optional, sync-owned: absent leaves AB alone
//
// A strength session enriches its hand-logged weight row (#155):
//   ?action=enrichWorkout&key=...&payload={"source_activity_id":"471093115402967310",
//     "activity":{"date":"2026-09-23","time":"07:30","avg_hr":"88",...},
//     "last_written":null,"raw_ref":"<drive id>","synced_at":"...","sport_type":"402"}
//
// One row per sync run (#156):
//   ?action=appendSyncLog&key=...&payload={"row":{"run_id":"schedule-123-1",
//     "started_at":"...","finished_at":"...","status":"ok",...}}
//   ?action=getSyncLog&key=...&limit=1   — newest first by started_at
//
// MCP writes are logged row by row when they arrive with MCP_API_KEY (#434):
//   ?action=getChangeLog&key=...&call_id=...&since=2026-10-01T00:00:00Z&limit=50
//   ?action=undoCall&key=<MCP key>&payload={"call_id":"abc123"}   — dry run
//   ?action=undoCall&key=<MCP key>&payload={"call_id":"abc123","confirm":true}
// A write's payload may carry `call_id` (1-64 of [A-Za-z0-9_-]) to group its rows.
//
// Drinks (#519): one row per drink, the caller's UUID as id so a retry is safe.
//   ?action=logDrink&key=...&payload={"id":"<uuid>","kind":"water","amount":250,
//     "logged_at_utc":"2026-10-20T13:05:00Z","source":"widget"}
//   ?action=getDrinks&key=...&from=2026-10-01&to=2026-10-31   - no range means today
//   ?action=getDrinkTotals&key=...   - today's water_ml, alcohol_drinks, coffee_cups, water_goal_ml
//   ?action=updateDrinkTime&key=...&payload={"id":"<uuid>","time":"14:30:00"}
//   ?action=deleteDrink&key=...&payload={"id":"<uuid>"}
//   ?action=updateSetting&key=...&payload={"key":"water_goal_ml","value":2000}
//   ?action=updateSetting&key=...&payload={"key":"rest_primary_s","value":120}   - #576
//   ?action=getSettings&key=...   - every setting, defaults filled in (#576)
// WIDGET_API_KEY may run logDrink and getDrinkTotals only.
//
// Rest (#576): Templates rows carry a section's `rest_s`/`switch_s` (blank =
// the Settings default); replaceTemplate keeps a section's values when the
// payload leaves them out. appendSets resolves `rest_target_s` for a workout
// whose sets all leave it out, from the workout's template and the defaults.
//
// The Withings sync's runs go to WithingsSyncLog, same layout (#200): add
// "log":"withings" to appendSyncLog's payload, or &log=withings to getSyncLog.

/**
 * Every response uses this shape — success, rejection and thrown error alike
 * (#130 AC1), so a caller never has to guess which of three shapes it got.
 */
function envelope(result) {
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * A failure. `code` is optional and additive (#144): `token_invalid`,
 * `token_forbidden`, `token_unavailable`, `read_only`, `widget_forbidden` (#519), or `bad_request`
 * (requestSync's malformed `request_ids`, #410), so a caller can tell
 * the cases apart without matching English. Without one, the envelope is
 * exactly what it was before #144.
 */
function fail(message, code) {
  var result = { success: false, error: message };
  if (code) result.code = code;
  return result;
}

/**
 * Parse the `payload` parameter, refusing one too long to have survived the
 * URL intact (#130 AC5).
 *
 * The check is on the way in rather than after parsing because the dangerous
 * case is not a parse failure — it is a truncated payload that still parses,
 * into an object missing its last fields. Refusing by length catches that
 * before it can be written.
 */
function parsePayload(raw) {
  if (!raw) return {};
  if (raw.length > MAX_PAYLOAD_CHARS) {
    throw new Error(
      'payload is ' + raw.length + ' characters, over the ' + MAX_PAYLOAD_CHARS +
      ' limit. Writes travel in the URL, so an over-long payload is truncated ' +
      'in transit rather than delivered. Split the request into batches.'
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      'payload is not valid JSON (' + (err.message || String(err)) + '). ' +
      'If it is near the ' + MAX_PAYLOAD_CHARS + ' character limit it may have ' +
      'been truncated in transit.'
    );
  }
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

/**
 * Authenticate, authorize, dispatch — for GET and POST alike.
 *
 * The caller is resolved before anything else, so an unknown action still
 * needs a credential. A token caller is checked against the read and write
 * allow-lists before dispatch, so a refused action never runs.
 */
function handleRequest(e) {
  var params = (e && e.parameter) || {};
  var action = params.action;
  var result;

  try {
    var caller = resolveCaller(params);
    if (caller.refusal) return envelope(caller.refusal);

    // #519: the widget key runs two actions. Fixed text, so an action name is not echoed.
    if (caller.mode === 'widget' && !isWidgetAction(action)) {
      return envelope(fail('Widget caller: this action is not permitted', 'widget_forbidden'));
    }

    if (caller.mode === 'token' && !isTokenReadAction(action) && !isTokenWriteAction(action)) {
      return envelope(fail(
        'Read-only caller: action "' + (action || '') + '" is not permitted', 'read_only'));
    }

    // #434: an MCP-key write is logged row by row, under the script lock.
    result = isChangeLogged(caller, action)
      ? withChangeLog(action, params, function () { return dispatch(action, params, caller); })
      : dispatch(action, params, caller);
  } catch (err) {
    result = fail(err.message || String(err));
  }

  // No message goes back carrying the caller's token, whatever echoed it.
  if (result && result.error) result.error = withoutToken(result.error, params.access_token);
  return envelope(result);
}

/** Run one action for an authenticated, authorized caller. */
function dispatch(action, params, caller) {
  var result;
  var payload;
  try {
    payload = parsePayload(params.payload);
  } catch (err) {
    // requestSync's refusals are fixed text that never quotes the input (#410).
    if (action === 'requestSync') return fail(SYNC_REQUEST_BAD_REQUEST, 'bad_request');
    throw err;
  }

  switch (action) {
    // --- Reads ---
    case 'getWorkouts':
      result = {
        success: true,
        data: getWorkouts({
          date: params.date,
          from: params.from,
          to: params.to,
          type: params.type,
          status: params.status,
        }),
      };
      break;

    case 'getWorkout':
      if (!params.id) {
        result = fail('id parameter required');
        break;
      }
      var found = getWorkout(params.id);
      result = found
        ? { success: true, data: found }
        : fail('Workout "' + params.id + '" not found');
      break;

    // A synced activity's archived COROS payload, one page at a time (#179).
    // Addressed by workout id, never by Drive ID. A read, but key-only: no
    // token caller needs raw vendor text, so it is not on TOKEN_READ_ACTIONS.
    case 'getWorkoutPayload':
      if (!params.id) {
        result = fail('id parameter required');
        break;
      }
      result = { success: true, data: getWorkoutPayload(params.id, params.offset) };
      break;

    // A synced activity's simplified GPS track (#432), by workout id. A read, and
    // on TOKEN_READ_ACTIONS: the signed-in app draws it. Token callers are already
    // limited to the owner's account.
    case 'getWorkoutTrack':
      if (!params.id) {
        result = fail('id parameter required');
        break;
      }
      result = { success: true, data: getWorkoutTrack(params.id) };
      break;

    // A date with nothing planned returns [], not an error.
    case 'getPlannedWorkouts':
      result = { success: true, data: getPlannedWorkouts(params.date) };
      break;

    // --- Writes ---
    case 'createWorkout':
      if (!payload.data) {
        result = fail('payload.data field required');
        break;
      }
      result = { success: true, data: createWorkout(payload.data) };
      break;

    case 'updateWorkout':
      if (!payload.id) {
        result = fail('payload.id field required');
        break;
      }
      if (!payload.changes) {
        result = fail('payload.changes field required');
        break;
      }
      result = { success: true, data: updateWorkout(payload.id, payload.changes) };
      break;

    // Dry-run lives in the caller: the MCP tool previews from reads, and only
    // calls this once confirmed (#132 AC6).
    case 'deleteWorkout':
      if (!payload.id) {
        result = fail('payload.id field required');
        break;
      }
      result = { success: true, data: deleteWorkout(payload.id) };
      break;

    // --- Exercises (#134) ---
    case 'getExercises':
      result = { success: true, data: getExercises({ tag: params.tag }) };
      break;

    case 'getExercise':
      if (!params.ref) {
        result = fail('ref parameter required');
        break;
      }
      result = { success: true, data: resolveExercise(params.ref, getExercises()) };
      break;

    case 'createExercise':
      if (!payload.data) {
        result = fail('payload.data field required');
        break;
      }
      result = { success: true, data: createExercise(payload.data) };
      break;

    // A rename cascades into Templates!E and Sets!C in the same call — #120.
    case 'updateExercise':
      if (!payload.id) {
        result = fail('payload.id field required');
        break;
      }
      if (!payload.changes) {
        result = fail('payload.changes field required');
        break;
      }
      result = { success: true, data: updateExercise(payload.id, payload.changes) };
      break;

    // Library row only; referencing rows are left in place (#132 AC6).
    case 'deleteExercise':
      if (!payload.id) {
        result = fail('payload.id field required');
        break;
      }
      result = { success: true, data: deleteExercise(payload.id) };
      break;

    case 'getExerciseHistory':
      if (!params.ref) {
        result = fail('ref parameter required');
        break;
      }
      result = { success: true, data: getExerciseHistory(params.ref, { limit: params.limit }) };
      break;

    // --- Templates (#134) ---
    case 'getTemplates':
      result = { success: true, data: getTemplates() };
      break;

    case 'getTemplate':
      if (!params.ref) {
        result = fail('ref parameter required');
        break;
      }
      result = { success: true, data: resolveTemplate(params.ref, getTemplates()) };
      break;

    case 'createTemplate':
      if (!payload.data) {
        result = fail('payload.data field required');
        break;
      }
      result = { success: true, data: createTemplate(payload.data) };
      break;

    case 'replaceTemplate':
      if (!payload.template_id) {
        result = fail('payload.template_id field required');
        break;
      }
      if (!payload.data) {
        result = fail('payload.data field required');
        break;
      }
      result = { success: true, data: replaceTemplate(payload.template_id, payload.data) };
      break;

    // --- Sets (#134) ---
    case 'getSets':
      result = {
        success: true,
        data: getSets({ workout_id: params.workout_id, exercise_id: params.exercise_id }),
      };
      break;

    case 'getWorkoutSets':
      if (!params.workout_id) {
        result = fail('workout_id parameter required');
        break;
      }
      result = {
        success: true,
        data: groupSetsByExercise(getSets({ workout_id: params.workout_id })),
      };
      break;

    case 'appendSets':
      if (!payload.sets) {
        result = fail('payload.sets field required');
        break;
      }
      result = { success: true, data: appendSets(payload.sets) };
      break;

    // AC4: resolution without writing, for a destructive-by-default dry run.
    case 'previewSetUpdates':
      if (!payload.workout_id) {
        result = fail('payload.workout_id field required');
        break;
      }
      if (!payload.updates) {
        result = fail('payload.updates field required');
        break;
      }
      result = { success: true, data: previewSetUpdates(payload.workout_id, payload.updates) };
      break;

    // AC2: all-or-nothing. One bad target rejects the batch untouched.
    case 'updateSets':
      if (!payload.workout_id) {
        result = fail('payload.workout_id field required');
        break;
      }
      if (!payload.updates) {
        result = fail('payload.updates field required');
        break;
      }
      result = { success: true, data: applySetUpdates(payload.workout_id, payload.updates) };
      break;

    // --- DailySummary (#131) ---
    case 'getDailySummary':
      result = {
        success: true,
        data: getDailySummaries({ from: params.from, to: params.to }),
      };
      break;

    // The range is a parameter: the nightly job and the historical backfill
    // are the same call with different bounds.
    case 'rebuildDailySummary':
      if (!payload.from || !payload.to) {
        result = fail('payload.from and payload.to are required (YYYY-MM-DD)');
        break;
      }
      result = {
        success: true,
        data: rebuildDailySummary(payload.from, payload.to, { computed_at: payload.computed_at }),
      };
      break;

    case 'getHistoryDateRange':
      result = { success: true, data: historyDateRange() };
      break;

    // --- DailyHealth (#165) ---
    // A read: from/to exactly as getDailySummary. A missing tab is [], not an
    // error. It is on the token read allow-list (#144).
    case 'getDailyHealth':
      result = {
        success: true,
        data: getDailyHealthRows({ from: params.from, to: params.to }),
      };
      break;

    // Written by the COROS sync alone. A write, so key-only: it must never be
    // added to the token read allow-list (#144).
    case 'upsertDailyHealth':
      if (!Array.isArray(payload.rows)) {
        result = fail('payload.rows field required (an array of rows keyed by field name)');
        break;
      }
      if (!payload.synced_at) {
        result = fail('payload.synced_at field required');
        break;
      }
      result = {
        success: true,
        data: withScriptLock(function () { return upsertDailyHealth(payload.rows, payload.synced_at); }),
      };
      break;

    // --- Journal (#234) ---
    // A read: from/to exactly as getDailyHealth, a missing tab is []. Key-only:
    // journal text is personal and no token caller needs it, so it is NOT on
    // TOKEN_READ_ACTIONS.
    case 'getJournal':
      result = { success: true, data: getJournalRows({ from: params.from, to: params.to }) };
      break;

    // One day's note: create, replace in place, or (blank note) delete. A
    // write, so key-only.
    case 'upsertJournal':
      result = {
        success: true,
        data: withScriptLock(function () { return upsertJournal(payload); }),
      };
      break;

    // --- BodyMeasurements (#198) ---
    // A read: from/to exactly as getDailyHealth, plus an optional kind. A
    // missing tab is [], not an error. It is on the token read allow-list
    // (#144, #201).
    case 'getBodyMeasurements':
      result = {
        success: true,
        data: getBodyMeasurementsRows({ from: params.from, to: params.to, kind: params.kind }),
      };
      break;

    // Written by the Withings sync alone. A write, so key-only: it must never
    // be added to the token read allow-list (#144).
    case 'upsertBodyMeasurements':
      if (!Array.isArray(payload.rows)) {
        result = fail('payload.rows field required (an array of rows keyed by field name)');
        break;
      }
      if (!payload.synced_at) {
        result = fail('payload.synced_at field required');
        break;
      }
      result = {
        success: true,
        data: withScriptLock(function () { return upsertBodyMeasurements(payload.rows, payload.synced_at); }),
      };
      break;

    // Rows the Withings sync's complete fetch no longer returns: readings
    // deleted in the app (#215). Compare and delete in one call, under the
    // lock, capped. A write, so key-only: never on the token read allow-list.
    case 'reconcileBodyMeasurements':
      result = {
        success: true,
        data: withScriptLock(function () { return reconcileBodyMeasurements(payload); }),
      };
      break;

    // --- Synced workouts (#166) ---
    // The COROS sync's merge, by (source, source_activity_id). A write, so
    // key-only: it must never be added to the token read allow-list (#144).
    case 'upsertSyncedWorkout':
      if (!payload.incoming) {
        result = fail('payload.incoming field required');
        break;
      }
      if (!Object.prototype.hasOwnProperty.call(payload, 'last_written')) {
        result = fail('payload.last_written field required (null when nothing was written before)');
        break;
      }
      result = {
        success: true,
        data: withScriptLock(function () { return upsertSyncedWorkout(payload); }),
      };
      break;

    // --- Strength enrichment (#155) ---
    // A COROS strength session fills blanks on its hand-logged weight row.
    // A write, so key-only, like the sync's others.
    case 'enrichWorkout':
      if (!payload.activity) {
        result = fail('payload.activity field required');
        break;
      }
      if (!Object.prototype.hasOwnProperty.call(payload, 'last_written')) {
        result = fail('payload.last_written field required (null when nothing was written before)');
        break;
      }
      result = {
        success: true,
        data: withScriptLock(function () { return enrichWorkout(payload); }),
      };
      break;

    // --- SyncLog (#156) ---
    // One row per sync run. A write, so key-only, like the sync's others.
    case 'appendSyncLog':
      if (!payload.row) {
        result = fail('payload.row field required (the run, keyed by field name)');
        break;
      }
      result = {
        success: true,
        data: withScriptLock(function () { return appendSyncLog(payload.row, payload.log); }),
      };
      break;

    // Newest first by started_at. The dead-man's switch reads limit=1.
    // `log=withings` reads WithingsSyncLog (#200); absent, SyncLog.
    case 'getSyncLog':
      result = { success: true, data: getSyncLog({ limit: params.limit, log: params.log }) };
      break;

    // --- MCP change log (#434) ---
    // Key-only: not on TOKEN_READ_ACTIONS. `limit` defaults to 200, max 1000.
    case 'getChangeLog':
      result = {
        success: true,
        data: getChangeLog({ call_id: params.call_id, since: params.since, limit: params.limit }),
      };
      break;

    // Dry-run until `confirm` is true; all or nothing. The MCP key only: a sync
    // or script holding API_KEY has no business reverting the Worker's writes.
    case 'undoCall':
      if (!caller || caller.mode !== 'mcp') {
        result = fail('undoCall requires the MCP key');
        break;
      }
      if (!payload.call_id) {
        result = fail('payload.call_id field required');
        break;
      }
      try {
        result = { success: true, data: undoCall(String(payload.call_id), payload.confirm === true) };
      } catch (err) {
        if (!err || !err.preview) throw err;
        result = fail(err.message);
        result.data = err.preview;
      }
      break;

    // --- SyncRequests (#410) ---
    // Sync now: dispatch the named rows at once, under the poller's lock and
    // rules. The one write a token caller may run (TOKEN_WRITE_ACTIONS). It
    // takes its own lock, so not withScriptLock: a busy lock is an answer here.
    case 'requestSync':
      result = requestSync(payload);
      break;

    // --- Drinks and Settings (#519) ---
    // Reads take from/to as parameters, like getJournal. Writes are payloads and
    // take the script lock: logDrink reads for its id, then appends. The widget
    // key runs logDrink and getDrinkTotals only (WIDGET_ACTIONS).
    case 'getDrinks':
      result = { success: true, data: getDrinks({ from: params.from, to: params.to }) };
      break;

    case 'getDrinkTotals':
      result = { success: true, data: getDrinkTotals() };
      break;

    case 'logDrink':
      result = { success: true, data: withScriptLock(function () { return logDrink(payload); }) };
      break;

    case 'updateDrinkTime':
      result = { success: true, data: withScriptLock(function () { return updateDrinkTime(payload); }) };
      break;

    case 'deleteDrink':
      result = { success: true, data: withScriptLock(function () { return deleteDrink(payload); }) };
      break;

    case 'updateSetting':
      result = { success: true, data: withScriptLock(function () { return updateSetting(payload); }) };
      break;

    // Every setting with its default filled in (#576): the app's Settings screen.
    case 'getSettings':
      result = { success: true, data: getSettings() };
      break;

    default:
      result = fail('Unknown action: "' + (action || '') + '"');
  }

  return result;
}
