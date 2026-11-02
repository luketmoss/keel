// Who is calling, and what they may do (#703), after Thrive's auth.js.
//
// Two kinds of caller:
//
// - A **key caller** sends `key` = the `API_KEY` script property: the MCP
//   Worker, which holds it as `FORAGE_API_KEY`. It may run every action, and
//   its writes are logged for undo (change-log.js, #713).
// - A **token caller** sends `access_token`, a Google access token from the
//   app's own sign-in. The app is a browser app on GitHub Pages, so it cannot
//   hold the key. The token must be issued to `TOKEN_CLIENT_ID` (=
//   `FORAGE_GOOGLE_CLIENT_ID`) for `TOKEN_ALLOWED_EMAIL`, and the caller may
//   run only TOKEN_ACTIONS. Unlike Thrive's app, Forage's reads through the
//   API too, so the list covers reads and writes.
//
// - A **Thrive caller** (#714) is a token caller from Thrive's own OAuth client:
//   its token must be issued to `TOKEN_THRIVE_CLIENT_ID` for the same
//   `TOKEN_ALLOWED_EMAIL`, and it may run THRIVE_TOKEN_ACTIONS only, which is
//   `getFoodLogTotals`. The property unset means there is no such caller.
//
// `access_token` present makes a token caller whatever else is sent, `key`
// included: privilege must never rise by adding a parameter.
//
// The token is a live credential. It never reaches a cache key, a log line,
// an error message or a response: it is hashed before it touches the cache,
// nothing here logs, and every message below is fixed text.

/**
 * What a token caller may run: every action but Config's, ensureSchema and the
 * change log's (getChangeLog, undoCall). An
 * allow-list, never a deny-list: an action added to main.js later is refused
 * to token callers until someone names it here. `auth.test.ts` fails when a
 * `case` in main.js is on neither this list nor the test's key-only list.
 */
var TOKEN_ACTIONS = [
  'getFoods', 'getFood', 'upsertFood', 'deleteFood', 'setFoodWeight',
  'lookupBarcode', 'getStarterFoods', 'addStarterFoods',
  'getRecipes', 'getRecipe', 'upsertRecipe', 'deleteRecipe', 'computeNutrition', 'importRecipe',
  'getWalkthrough', 'setWalkthrough', 'deleteWalkthrough',
  'getPlan', 'upsertPlanEntry', 'movePlanEntry', 'deletePlanEntry', 'planWeek',
  'getTrips', 'getTrip', 'startTrip', 'setTripItem', 'closeTrip', 'discardTrip', 'addToTrip', 'removeTripItem',
  'getFoodLog', 'getFoodLogTotals', 'logFood', 'updateLogEntry', 'deleteLogEntry',
  'getCooks', 'upsertCook', 'deleteCook',
];

/**
 * What a Thrive caller (#714) may run: the daily totals and nothing else. Adding
 * a second action here is a deliberate decision, and `auth.test.ts` fails on it.
 */
var THRIVE_TOKEN_ACTIONS = ['getFoodLogTotals'];

var TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/** Namespace for cached verdicts, so they cannot collide with anything else. */
var TOKEN_CACHE_PREFIX = 'forage_tok:';

/** A refusal is remembered for five minutes, so a bad token cannot burn quota. */
var TOKEN_REFUSED_TTL_S = 300;

/** An acceptance is forgotten a minute before the token itself expires... */
var TOKEN_EXPIRY_MARGIN_S = 60;

/** ...and never kept longer than an hour, the life of a Google access token. */
var TOKEN_ACCEPTED_TTL_CAP_S = 3600;

var TOKEN_REFUSAL_MESSAGES = {
  token_invalid: 'Access token is invalid or expired. Sign in again.',
  token_forbidden:
    'Access token is not permitted: it was issued to a different OAuth client or a ' +
    'different Google account than TOKEN_CLIENT_ID / TOKEN_ALLOWED_EMAIL allow.',
  token_unavailable: 'Could not reach Google to verify the access token. Try again.',
  unauthorized_scope:
    'The script is not yet allowed to call Google to verify tokens: its owner must ' +
    're-authorize it for the script.external_request scope.',
  unconfigured:
    'Token access is not configured: TOKEN_CLIENT_ID and TOKEN_ALLOWED_EMAIL must both ' +
    'be set in script properties.',
};

/** The key lives in script properties, never in source. Unset is an error, not an open door. */
function validateApiKey(key) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!expected) throw new Error('API_KEY not configured in script properties');
  return typeof key === 'string' && key === expected;
}

/** Decide who is calling: `{ mode: 'key' }`, `{ mode: 'token' }`, or `{ refusal }`. */
function resolveCaller(params) {
  if (params.access_token !== undefined && params.access_token !== null) {
    var verdict = verifyAccessToken(params.access_token);
    if (verdict === 'ok') return { mode: 'token' };
    // Not the app's token: it may be Thrive's (#714), which is checked against its own client.
    if (verdict === 'token_forbidden' || verdict === 'unconfigured') {
      var thrive = verifyThriveToken(params.access_token);
      if (thrive === 'ok') return { mode: 'token', client: 'thrive' };
      if (thrive === 'token_unavailable') verdict = thrive;
    }
    // Both are the owner's to fix, and signing in again cannot: "set up wrong".
    var code = verdict === 'unconfigured' || verdict === 'unauthorized_scope' ? 'token_forbidden' : verdict;
    return { refusal: fail(TOKEN_REFUSAL_MESSAGES[verdict], code) };
  }
  if (!validateApiKey(params.key)) return { refusal: fail('Invalid or missing API key') };
  return { mode: 'key' };
}

/** Whether this token caller may run `action`: the app's token any allow-listed action, Thrive's only its own. */
function isTokenAction(action, caller) {
  var list = caller && caller.client === 'thrive' ? THRIVE_TOKEN_ACTIONS : TOKEN_ACTIONS;
  return list.indexOf(action) !== -1;
}

function trimmedProperty(props, name) {
  var value = props.getProperty(name);
  return value ? String(value).trim() : '';
}

/**
 * Verify a Google access token. Returns `'ok'`, `'token_invalid'`,
 * `'token_forbidden'`, `'token_unavailable'`, `'unconfigured'` or
 * `'unauthorized_scope'`. Either property unset refuses every token call
 * before anything is fetched.
 */
function verifyAccessToken(token) {
  var props = PropertiesService.getScriptProperties();
  return verifyTokenFor(token, trimmedProperty(props, 'TOKEN_CLIENT_ID'),
    trimmedProperty(props, 'TOKEN_ALLOWED_EMAIL').toLowerCase());
}

/**
 * Verify a token as Thrive's (#714): issued to `TOKEN_THRIVE_CLIENT_ID` for the
 * allowed account. The same verdicts as verifyAccessToken; the property unset is
 * `'unconfigured'`, so no Thrive caller exists until the owner sets it.
 */
function verifyThriveToken(token) {
  var props = PropertiesService.getScriptProperties();
  return verifyTokenFor(token, trimmedProperty(props, 'TOKEN_THRIVE_CLIENT_ID'),
    trimmedProperty(props, 'TOKEN_ALLOWED_EMAIL').toLowerCase());
}

function verifyTokenFor(token, clientId, allowedEmail) {
  if (!clientId || !allowedEmail) return 'unconfigured';

  if (typeof token !== 'string' || token === '') return 'token_invalid';

  // The properties are folded into the digest, so correcting a mis-set one
  // invalidates every verdict cached under the old value at once.
  var cacheKey = TOKEN_CACHE_PREFIX + sha256Hex(token + '|' + clientId + '|' + allowedEmail);
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached === 'ok' || cached === 'token_invalid' || cached === 'token_forbidden') return cached;

  var checked = checkTokenInfo(token, clientId, allowedEmail);
  // Unreachable is not a verdict on the token, and a missing scope is the
  // owner's to fix, so neither is remembered.
  if (checked.ttl > 0) cache.put(cacheKey, checked.verdict, checked.ttl);
  return checked.verdict;
}

/**
 * Ask Google about the token. Returns `{ verdict, ttl }`, `ttl` in seconds.
 * Google answers 400 for an expired, revoked or bogus token alike, so all
 * three are `token_invalid`.
 */
function checkTokenInfo(token, clientId, allowedEmail) {
  var refused = function (verdict) { return { verdict: verdict, ttl: TOKEN_REFUSED_TTL_S }; };

  var response;
  try {
    response = UrlFetchApp.fetch(TOKENINFO_URL + '?access_token=' + encodeURIComponent(token), {
      muteHttpExceptions: true,
    });
  } catch (err) {
    // UrlFetchApp's own message quotes the URL, and so the token. It is only
    // inspected here, never passed on.
    if (/permission/i.test(String((err && err.message) || err))) return { verdict: 'unauthorized_scope', ttl: 0 };
    return { verdict: 'token_unavailable', ttl: 0 };
  }

  var status = response.getResponseCode();
  if (status === 429 || status >= 500) return { verdict: 'token_unavailable', ttl: 0 };
  if (status !== 200) return refused('token_invalid');

  var info;
  try {
    info = JSON.parse(response.getContentText());
  } catch (err) {
    return refused('token_invalid');
  }
  if (!info || typeof info !== 'object' || Array.isArray(info)) return refused('token_invalid');

  if (info.aud !== clientId) return refused('token_forbidden');
  if (info.azp !== undefined && info.azp !== null && info.azp !== clientId) return refused('token_forbidden');

  var email = typeof info.email === 'string' ? info.email.trim().toLowerCase() : '';
  if (!email || email !== allowedEmail) return refused('token_forbidden');
  if (info.email_verified !== true && info.email_verified !== 'true') return refused('token_forbidden');

  var expiresIn = parseExpiresIn(info.expires_in);
  if (!(expiresIn > 0)) return refused('token_invalid');

  return { verdict: 'ok', ttl: Math.min(expiresIn - TOKEN_EXPIRY_MARGIN_S, TOKEN_ACCEPTED_TTL_CAP_S) };
}

/** tokeninfo sends `expires_in` as a string of digits. Anything else is NaN. */
function parseExpiresIn(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

/** Lowercase hex SHA-256 of a UTF-8 string. */
function sha256Hex(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

/** Cut the caller's token out of any message on its way out, in both spellings. */
function withoutToken(message, token) {
  if (typeof token !== 'string' || token === '') return message;
  return String(message)
    .split(token).join('[redacted]')
    .split(encodeURIComponent(token)).join('[redacted]');
}
