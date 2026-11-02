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

/**
 * #755: each of the seven's Open Food Facts nutriment, and what to multiply it
 * by. Open Food Facts gives cholesterol and sodium in g per 100 g; Forage
 * stores mg.
 */
var OFF_EXTRA_NUTRIENTS = {
  satfat_100g: { off: 'saturated-fat_100g', times: 1 },
  transfat_100g: { off: 'trans-fat_100g', times: 1 },
  cholesterol_mg_100g: { off: 'cholesterol_100g', times: 1000 },
  sodium_mg_100g: { off: 'sodium_100g', times: 1000 },
  fiber_100g: { off: 'fiber_100g', times: 1 },
  sugars_100g: { off: 'sugars_100g', times: 1 },
  added_sugars_100g: { off: 'added-sugars_100g', times: 1 },
};

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
 * - a product with all four nutrition values: `food` prefilled, `reason` '',
 *   with each of the seven (#755) the product has, the rest blank;
 * - a product without them: `food` with its name, brand and code, nutrition
 *   blank, the seven included, `reason` `no_nutrition`;
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
  // The seven only with the four, each on its own: one the product lacks is blank.
  EXTRA_NUTRIENTS.forEach(function (x) {
    var source = OFF_EXTRA_NUTRIENTS[x.per100];
    var v = num(n[source.off]);
    food[x.per100] = complete && v !== null && v >= 0 ? Math.round(v * source.times * 100) / 100 : null;
  });
  var grams = num(p.serving_quantity);
  if (grams !== null && grams > 0) food.servings_json = labelServings(p.serving_size, grams);
  return food;
}

/** The vulgar fractions a label may print, as numbers. */
var LABEL_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * #775: the servings an Open Food Facts label serving gives, `grams` being its
 * `serving_quantity`. The first is always the label serving with the label's
 * own weight, which the food form shows as the Default and "Per serving":
 *
 * - `1 bar (40 g)` is `[{bar, 40}]`: a quantity of exactly 1 names the unit;
 * - `0.75 cup (56 g)` is `[{0.75 cup, 56}, {cup, 74.7}]` and `2 cookies
 *   (30 g)` is `[{2 cookies, 30}, {cookie, 15}]`: any other quantity keeps its
 *   text in the first name and adds the weight of one unit, which is what a
 *   recipe line in cups finds;
 * - a mass or ml unit, no unit, or a quantity that cannot be read cleanly
 *   (`2-3 cookies`, `about 3 pieces`) gives no second entry; the first is named
 *   `serving` for a mass, ml or no unit, and as written for an unreadable one.
 *
 * A name over 30 characters is `serving`.
 */
function labelServings(text, grams) {
  var g = Math.round(grams * 10) / 10;
  var outside = cell(text).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  var fit = function (name) { return name && name.length <= 30 ? name : 'serving'; };
  var parsed = parseLabelQuantity(outside);
  if (!parsed) return [{ name: fit(outside), g: g }];

  var unit = parsed.unit;
  var lead = leadingUnit(unit);
  if (unit === '' || has(MASS_G, lead) || lead === 'ml') return [{ name: 'serving', g: g }];
  if (parsed.qty === 1) return [{ name: fit(unit), g: g }];

  var one = singularFirstWord(unit);
  var servings = [{ name: fit(outside), g: g }];
  if (one.length <= 30) servings.push({ name: one, g: Math.round(grams / parsed.qty * 10) / 10 });
  return servings;
}

/**
 * `{qty, unit}` for a label's text outside its parentheses (trimmed, lower
 * case): an integer, a decimal, a fraction, a mixed number or a vulgar
 * fraction, then a unit that holds no digit. Null when the quantity is not
 * over 0 or the text is not read cleanly.
 */
function parseLabelQuantity(text) {
  var m = /^(\d+\s+\d+\/\d+|\d+\s*[½¼¾⅓⅔⅛]|\d+\/\d+|[½¼¾⅓⅔⅛]|\d*[.,]?\d+)\s*(.*)$/.exec(text);
  if (!m) return null;
  var unit = m[2];
  if (/[\d\/]/.test(unit) || /^[^a-z]/.test(unit) || /\b(or|to|and)\b/.test(unit)) return null;
  var q = m[1];
  var qty;
  var v = /[½¼¾⅓⅔⅛]$/.exec(q);
  var f;
  if (v) {
    qty = LABEL_FRACTIONS[v[0]] + (q.length > 1 ? Number(q.slice(0, -1)) : 0);
  } else if ((f = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(q))) {
    qty = Number(f[1] || 0) + Number(f[2]) / Number(f[3]);
  } else {
    qty = Number(q.replace(',', '.'));
  }
  if (!isFinite(qty) || !(qty > 0)) return null;
  return { qty: qty, unit: unit };
}

/** The unit text with its first word singular: `cups` is `cup`, `cookies` is `cookie`, `fl oz` stays. */
function singularFirstWord(unit) {
  var fl = /^(fl\.? oz\.?|fluid ounces?)(?=$|\s)/.exec(unit);
  if (fl) return ('fl oz' + unit.slice(fl[0].length)).trim();
  var words = unit.split(' ');
  var canon = canonicalUnit(words[0]);
  words[0] = canon !== words[0] ? canon : words[0].length > 1 && /s$/.test(words[0]) && !/ss$/.test(words[0]) ? words[0].slice(0, -1) : words[0];
  return words.join(' ');
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
