// Barcode lookup (#707): one Open Food Facts product, by barcode, as a Foods
// row the caller can check and save. Nothing here writes: the app saves the
// food with upsertFood once the owner has checked it against the label.
//
// Open Food Facts is shared, crowd-sourced data. A food from it is `source`
// `off`, `source_ref` the code, and `verified` blank until someone ticks "I've
// checked these numbers against the label".

var OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
var OFF_FIELDS = 'code,product_name,brands,serving_size,serving_quantity,nutriments';
var OFF_USER_AGENT = 'Forage/1.0 (personal meal planner; https://github.com/luketmoss/keel)';

/** Why a lookup gave no food. Each is fixed text; the app keys its copy on `code`. */
var BARCODE_REFUSALS = {
  bad_code: 'A barcode is 8, 12, 13 or 14 digits.',
  busy: 'Open Food Facts is busy. Try again in a minute.',
  unreachable: 'Open Food Facts could not be reached.',
};

/** The digits of a barcode, spaces dropped, or null when it is not 8, 12, 13 or 14 digits. */
function normalizeBarcode(raw) {
  var code = cell(raw).replace(/\s+/g, '');
  return /^(\d{8}|\d{12,14})$/.test(code) ? code : null;
}

function barcodeError(code) {
  var err = new Error(BARCODE_REFUSALS[code]);
  err.code = code;
  return err;
}

/**
 * `lookupBarcode` (`code`). Answers `{ found, reason, food, warnings,
 * already_in_library }`:
 *
 * - a code a food in the library already has: `already_in_library` is that
 *   food (`{id, name}`), and Open Food Facts is not asked at all;
 * - a product with all four nutrition values: `food` prefilled, `reason` '';
 * - a product without them: `food` with its name, brand and code, nutrition
 *   blank, `reason` `no_nutrition`;
 * - no such product: `found` false, `reason` `not_found`.
 *
 * A malformed code, a 429 and a failed fetch are refusals with code
 * `bad_code`, `busy` and `unreachable`. `warnings` holds `energy_mismatch`
 * when the calories and the macros disagree.
 */
function lookupBarcode(params) {
  var code = normalizeBarcode(params && params.code);
  if (!code) throw barcodeError('bad_code');

  var mine = listRecords('Foods', function (f) { return f.barcode === code; })[0];
  if (mine) {
    return {
      found: true, reason: '', food: null, warnings: [],
      already_in_library: { id: mine.id, name: displayName(mine) },
    };
  }

  var response;
  try {
    response = UrlFetchApp.fetch(OFF_PRODUCT_URL + code + '.json?fields=' + OFF_FIELDS, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
    });
  } catch (err) {
    throw barcodeError('unreachable');
  }
  var status = response.getResponseCode();
  if (status === 429) throw barcodeError('busy');
  var body = null;
  try {
    body = JSON.parse(response.getContentText());
  } catch (err) {
    body = null;
  }
  if (status === 404 || (body && body.status === 0)) {
    return { found: false, reason: 'not_found', food: null, warnings: [], already_in_library: null };
  }
  if (status < 200 || status >= 300 || !body || !body.product) throw barcodeError('unreachable');

  var food = foodFromProduct(body.product, code);
  var warnings = [];
  var reason = '';
  if (food.kcal_100g === null) reason = 'no_nutrition';
  else if (energyMismatch(food)) warnings.push('energy_mismatch');
  return { found: true, reason: reason, food: food, warnings: warnings, already_in_library: null };
}

/** An Open Food Facts product as a Foods row, unsaved: no id, `verified` blank. */
function foodFromProduct(p, code) {
  var n = p.nutriments || {};
  var num = function (v) {
    var x = typeof v === 'number' ? v : Number(v);
    return v === undefined || v === null || v === '' || !isFinite(x) ? null : x;
  };
  var kcal = num(n['energy-kcal_100g']);
  if (kcal === null && num(n['energy-kj_100g']) !== null) kcal = num(n['energy-kj_100g']) / 4.184;
  var values = { kcal_100g: kcal, protein_100g: num(n.proteins_100g), carbs_100g: num(n.carbohydrates_100g), fat_100g: num(n.fat_100g) };
  var complete = NUTRITION_FIELDS.every(function (f) { return values[f] !== null && values[f] >= 0; });

  var food = {
    id: '',
    name: cell(p.product_name).trim(),
    kind: 'packaged',
    brand: cell(p.brands).split(',')[0].trim(),
    category: '',
    servings_json: null,
    source: 'off',
    source_ref: code,
    verified: false,
    barcode: code,
  };
  NUTRITION_FIELDS.forEach(function (f) {
    food[f] = complete ? Math.round(values[f] * 100) / 100 : null;
  });
  var grams = num(p.serving_quantity);
  if (grams !== null && grams > 0) food.servings_json = [{ name: servingName(p.serving_size), g: Math.round(grams * 10) / 10 }];
  return food;
}

/** The label serving's name: `1 bar (40 g)` is `bar`, `2 cookies (30g)` is `cookies`; else `serving`. */
function servingName(text) {
  var s = cell(text).replace(/\([^)]*\)/g, ' ').replace(/[\d.,/½¼¾⅓⅔]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  s = s.replace(/^(g|gr|grams?|ml|oz)\b\s*/, '').trim();
  return s && s.length <= 30 ? s : 'serving';
}

/**
 * Whether the calories and the macros disagree: kcal differs from protein × 4
 * + carbs × 4 + fat × 9 by more than 20% of that sum and by more than 20
 * kcal, per 100 g.
 */
function energyMismatch(food) {
  var macros = food.protein_100g * 4 + food.carbs_100g * 4 + food.fat_100g * 9;
  var diff = Math.abs(food.kcal_100g - macros);
  return diff > 20 && diff > 0.2 * macros;
}
