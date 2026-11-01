// Foods (#703): the food library. Nutrition is per 100 g, all four values set
// or all blank; blank means "no nutrition yet", never 0.

var NUTRITION_FIELDS = ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'];

/**
 * Foods, optionally narrowed: `q` matches a substring of the name or brand,
 * `regular` keeps the regulars, `barcode` the one with that barcode.
 */
function getFoods(params) {
  params = params || {};
  var q = cell(params.q).trim().toLowerCase();
  var regular = params.regular !== undefined && params.regular !== '' ? toBool(params.regular) : null;
  var barcode = cell(params.barcode).trim();
  return listRecords('Foods', function (food) {
    if (q && (food.name + ' ' + food.brand).toLowerCase().indexOf(q) === -1) return false;
    if (regular !== null && food.regular !== regular) return false;
    if (barcode && food.barcode !== barcode) return false;
    return true;
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function getFood(id) {
  var food = getRecord('Foods', { id: cell(id) });
  if (!food) throw new Error('Food "' + cell(id) + '" not found');
  return food;
}

/** Every food, by id, for the nutrition reads. */
function foodsById() {
  var byId = {};
  listRecords('Foods').forEach(function (f) { byId[f.id] = f; });
  return byId;
}

/** Refuse a write naming a food that does not exist, naming it. */
function requireFood(id, field) {
  if (!getRecord('Foods', { id: cell(id) })) {
    throw new Error((field || 'food_id') + ' "' + cell(id) + '" is not a food');
  }
}

/**
 * Create a food, or merge the fields sent into the food with that `id`.
 * Payload: `{ id?, name, kind?, brand?, ..., servings_json?: [{name, g}] }`.
 */
function upsertFood(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a food');
  var existing = payload.id ? getRecord('Foods', { id: cell(payload.id) }) : null;
  var food = existing ? JSON.parse(JSON.stringify(existing)) : { kind: 'ingredient' };
  food.id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.food);

  FOOD_FIELDS.forEach(function (field) {
    if (field === 'id' || field === 'created' || field === 'updated') return;
    if (has(payload, field)) food[field] = payload[field];
  });

  food.name = requireString('name', food.name);
  food.kind = validateEnum('kind', food.kind, FOOD_KINDS);
  ['brand', 'category', 'buy_unit', 'buy_unit_plural', 'last_buy', 'source_ref', 'barcode'].forEach(function (f) {
    food[f] = optionalString(f, food[f]);
  });
  NUTRITION_FIELDS.forEach(function (f) { food[f] = optionalNumber(f, food[f], { min: 0 }); });
  var set = NUTRITION_FIELDS.filter(function (f) { return food[f] !== null; }).length;
  if (set !== 0 && set !== 4) {
    throw new Error('kcal_100g, protein_100g, carbs_100g and fat_100g are all set or all blank');
  }
  food.servings_json = validateServings(food.servings_json);
  food.buy_unit_g = optionalNumber('buy_unit_g', food.buy_unit_g, { positive: true });
  food.usual_store = validateEnum('usual_store', food.usual_store, STORES, true);
  food.source = validateEnum('source', food.source, FOOD_SOURCES, true);
  food.packs_json = validatePacks(food.packs_json);
  food.last_bought_on = validateDate('last_bought_on', food.last_bought_on, true);
  ['usually_have', 'regular', 'never_shop', 'verified'].forEach(function (f) { food[f] = toBool(food[f]); });

  var now = isoNow();
  food.created = existing ? existing.created : now;
  food.updated = now;
  return upsertRecord('Foods', food);
}

/** `[{name, g}]`, names non-empty, grams over 0. Blank or empty is no servings. */
function validateServings(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value)) throw new Error('servings_json must be a list of {name, g}');
  return value.map(function (s) {
    if (!s || typeof s.name !== 'string' || s.name.trim() === '') {
      throw new Error('each serving needs a name');
    }
    var g = optionalNumber('serving "' + s.name + '" g', s.g, { positive: true });
    if (g === null) throw new Error('serving "' + s.name + '" needs g');
    return { name: s.name.trim(), g: g };
  });
}

function validatePacks(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value) || value.some(function (p) { return typeof p !== 'string'; })) {
    throw new Error('packs_json must be a list of text');
  }
  return value;
}

/** Delete a food no recipe line or trip item uses; otherwise refuse, listing the uses. */
function deleteFood(payload) {
  var id = requireString('id', payload && payload.id);
  getFood(id);
  var recipes = unique(listRecords('RecipeLines', function (l) { return l.food_id === id; })
    .map(function (l) { return l.recipe_id; }));
  var trips = unique(listRecords('TripItems', function (t) { return t.food_id === id; })
    .map(function (t) { return t.trip_id; }));
  if (recipes.length || trips.length) {
    var uses = [];
    if (recipes.length) uses.push('recipes ' + recipes.join(', '));
    if (trips.length) uses.push('trips ' + trips.join(', '));
    throw new Error('Food "' + id + '" is in use, so it was not deleted: ' + uses.join('; '));
  }
  deleteRecord('Foods', { id: id });
  return { id: id, deleted: true };
}

function unique(values) {
  var seen = {};
  return values.filter(function (v) {
    if (seen[v]) return false;
    seen[v] = true;
    return true;
  });
}
