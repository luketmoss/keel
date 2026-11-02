// Entry point for the Forage Apps Script web app (#703).
//
// doGet and doPost share one handler over `e.parameter`. Apps Script fills it
// from a form-encoded POST body exactly as from a query string, so every
// caller may POST: `fetch` follows Apps Script's 302 as a GET, and both hops
// carry `Access-Control-Allow-Origin: *`. A POST is how a walkthrough's JSON
// fits. GET with a URL-encoded `payload` works for reads and small writes.
//
// Reads take filters as parameters; writes take `payload` JSON and answer with
// the row(s) as stored, after the API's derivation. Every answer is
// `{ success, data }` or `{ success: false, error, code? }`.
//
//   action=getFoods&key=...&q=onion          action=getFood&key=...&id=fd_1a2b3c4d
//   action=upsertFood&key=...&payload={"name":"Garlic","servings_json":[{"name":"clove","g":3}]}
//   action=getRecipe&key=...&id=rc_1a2b3c4d  — lines with resolved grams, steps, nutrition
//   action=upsertRecipe&key=...&payload={"name":"Beef Stew","servings":6,"lines":[...],"steps":[...]}
//   action=computeNutrition&key=...&payload={"servings":6,"lines":[...]}   — not saved
//   action=importRecipe&key=...&payload={"url":"https://...","dry_run":true}  — the preview; false saves
//   action=getPlan&key=...&from=2026-11-01&to=2026-11-07
//   action=logFood&access_token=...&payload={"date":"2026-11-01","slot":"Dinner","recipe_id":"rc_1","qty":1}
//   action=getFoodLogTotals&key=...&from=2026-11-01&to=2026-11-07
//   action=ensureSchema&key=...              — key-only: the 703 migration
//   action=getChangeLog&key=...&call_id=...&since=2026-11-01T00:00:00Z&limit=50   — key-only (#713)
//   action=undoCall&key=...&payload={"call_id":"abc123"}               — key-only; dry run unless confirm: true
//
// A key caller's write may carry `call_id` (1-64 of [A-Za-z0-9_-]) in its
// payload: every row it changes is logged in MCPChangeLog under that id, or
// under a new one when it sends none (#713).

/** Every response uses this shape, success, refusal and thrown error alike. */
function envelope(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * A failure. `code` is optional: `token_invalid`, `token_forbidden`,
 * `token_unavailable`, `not_permitted`, and the import's reasons (#706).
 * `extra` adds fields a caller acts on, such as `duplicate_of`.
 */
function fail(message, code, extra) {
  var result = { success: false, error: message };
  if (code) result.code = code;
  if (extra) Object.keys(extra).forEach(function (k) { result[k] = extra[k]; });
  return result;
}

/**
 * Parse `payload`, refusing one over MAX_PAYLOAD_CHARS before parsing: the
 * limit keeps a stored cell under Sheets' 50,000, and a truncated payload can
 * still parse into an object missing its last fields.
 */
function parsePayload(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  if (raw.length > MAX_PAYLOAD_CHARS) {
    throw new Error('payload is ' + raw.length + ' characters, over the ' + MAX_PAYLOAD_CHARS + ' limit');
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('payload is not valid JSON');
  }
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

/**
 * Authenticate, authorize, dispatch. The caller is resolved first, so an
 * unknown action still needs a credential, and a token caller is checked
 * against TOKEN_ACTIONS before anything runs.
 */
function handleRequest(e) {
  var params = (e && e.parameter) || {};
  var action = params.action;
  var result;
  try {
    var caller = resolveCaller(params);
    if (caller.refusal) return envelope(caller.refusal);
    if (caller.mode === 'token' && !isTokenAction(action)) {
      return envelope(fail('This action is not permitted with an access token', 'not_permitted'));
    }
    // #713: a key caller's write is logged row by row, under the script lock.
    var data = isChangeLogged(caller, action, params.payload)
      ? withChangeLog(action, params, function () { return dispatch(action, params, caller); })
      : dispatch(action, params, caller);
    result = { success: true, data: data };
  } catch (err) {
    result = fail((err && err.message) || String(err), err && err.code, err && err.extra);
  }
  if (result && result.error) result.error = withoutToken(result.error, params.access_token);
  return envelope(result);
}

/** Run one action for an authenticated, authorized caller. Writes take the script lock. */
function dispatch(action, params, caller) {
  var write = function (fn) {
    var payload = parsePayload(params.payload);
    return withScriptLock(function () { return fn(payload); });
  };
  switch (action) {
    // Foods
    case 'getFoods': return getFoods(params);
    case 'getFood': return getFood(params.id);
    case 'upsertFood': return write(upsertFood);
    case 'deleteFood': return write(deleteFood);
    // Recipes
    case 'getRecipes': return getRecipes();
    case 'getRecipe': return getRecipe(params.id);
    case 'upsertRecipe': return write(upsertRecipe);
    case 'deleteRecipe': return write(deleteRecipe);
    case 'computeNutrition': return computeNutrition(parsePayload(params.payload));
    case 'importRecipe': return importRecipe(parseImportPayload(params.payload));
    // Walkthroughs
    case 'getWalkthrough': return getWalkthrough(params.recipe_id);
    case 'setWalkthrough': return write(setWalkthrough);
    case 'deleteWalkthrough': return write(deleteWalkthrough);
    // Plan
    case 'getPlan': return getPlan(params);
    case 'upsertPlanEntry': return write(upsertPlanEntry);
    case 'deletePlanEntry': return write(deletePlanEntry);
    // Trips
    case 'getTrips': return getTrips(params);
    case 'getTrip': return getTrip(params.id);
    case 'createTrip': return write(createTrip);
    case 'updateTrip': return write(updateTrip);
    case 'upsertTripItems': return write(upsertTripItems);
    case 'deleteTripItem': return write(deleteTripItem);
    // FoodLog
    case 'getFoodLog': return getFoodLog(params);
    case 'getFoodLogTotals': return getFoodLogTotals(params);
    case 'logFood': return write(function (p) { return logFood(p, caller); });
    case 'updateLogEntry': return write(function (p) { return updateLogEntry(p, caller); });
    case 'deleteLogEntry': return write(deleteLogEntry);
    // Cooks
    case 'getCooks': return getCooks(params);
    case 'upsertCook': return write(upsertCook);
    case 'deleteCook': return write(deleteCook);
    // Config and schema: key-only
    case 'getConfig': return getConfig();
    case 'setConfig': return write(setConfig);
    case 'ensureSchema': return ensureSchema();
    // MCP change log and undo (#713): key-only. undoCall takes its own lock and logs itself.
    case 'getChangeLog':
      return getChangeLog({ call_id: params.call_id, since: params.since, limit: params.limit });
    case 'undoCall': return undoCall(parsePayload(params.payload));
    default:
      throw new Error('Unknown action "' + cell(action) + '"');
  }
}
