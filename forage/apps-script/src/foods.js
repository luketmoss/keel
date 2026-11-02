// Foods (#703, #707): the food library. Nutrition is per 100 g, all four
// values set or all blank; blank means "no nutrition yet", never 0. The seven
// beyond them (#755, EXTRA_NUTRIENTS in nutrition.js) are each blank or a
// number, independently, and only on a food with the four.

var NUTRITION_FIELDS = ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'];

/** The most energy 100 g of anything holds: pure fat, 100 g at 9.02 kcal/g. */
var MAX_KCAL_100G = 902;

/** The most cholesterol or sodium 100 g can hold, in mg: all of it (#755). */
var MAX_MG_100G = 100000;

/** A food's name as the app shows it: brand, then name. Unique, case-insensitively. */
function displayName(food) {
  return (cell(food.brand).trim() + ' ' + cell(food.name).trim()).trim();
}

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

/** One food, with `used_by`: the recipes (id, name) whose lines use it (#707). */
function getFood(id) {
  var food = getRecord('Foods', { id: cell(id) });
  if (!food) throw new Error('Food "' + cell(id) + '" not found');
  food.used_by = recipesUsing(food.id);
  return food;
}

/** The recipes whose lines name the food, as `{ id, name }`, sorted by name. */
function recipesUsing(foodId) {
  var ids = unique(listRecords('RecipeLines', function (l) { return l.food_id === foodId; })
    .map(function (l) { return l.recipe_id; }));
  if (!ids.length) return [];
  var names = {};
  listRecords('Recipes').forEach(function (r) { names[r.id] = r.name; });
  return ids.map(function (id) { return { id: id, name: names[id] || id }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
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
 * Create a food, or merge the fields sent into the food with that `id`: a
 * column the payload does not name keeps its stored value. Payload: `{ id?,
 * name, kind?, brand?, ..., servings_json?: [{name, g}] }`. #707's checks:
 * the display name is unique, nutrition is plausible per 100 g, and a food's
 * weights have distinct names.
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
  if (set === 4) {
    if (food.kcal_100g > MAX_KCAL_100G) throw new Error('kcal_100g must be at most ' + MAX_KCAL_100G);
    if (food.protein_100g + food.carbs_100g + food.fat_100g > 100) {
      throw new Error('protein, carbs and fat add up to more than 100 g per 100 g');
    }
  }
  validateExtraNutrients(food, set === 4);
  food.servings_json = validateServings(food.servings_json);
  food.buy_unit_g = optionalNumber('buy_unit_g', food.buy_unit_g, { positive: true });
  food.usual_store = validateEnum('usual_store', food.usual_store, STORES, true);
  food.source = validateEnum('source', food.source, FOOD_SOURCES, true);
  food.packs_json = validatePacks(food.packs_json);
  food.last_bought_on = validateDate('last_bought_on', food.last_bought_on, true);
  ['usually_have', 'regular', 'never_shop', 'verified'].forEach(function (f) { food[f] = toBool(food[f]); });
  requireUniqueName(food);

  var now = isoNow();
  food.created = existing ? existing.created : now;
  food.updated = now;
  return upsertRecord('Foods', food);
}

/**
 * The seven (#755): each blank or a number at least 0, set only when the core
 * four are, and inside what contains it. Each containment rule is checked only
 * when both sides are set: saturated + trans fat at most fat, fiber at most
 * carbs, added sugars at most sugars at most carbs. Cholesterol and sodium are
 * at most 100,000 mg per 100 g. Refusals name the fields.
 */
function validateExtraNutrients(food, hasCore) {
  EXTRA_NUTRIENTS.forEach(function (x) { food[x.per100] = optionalNumber(x.per100, food[x.per100], { min: 0 }); });
  var set = EXTRA_NUTRIENTS.filter(function (x) { return food[x.per100] !== null; })
    .map(function (x) { return x.per100; });
  if (!set.length) return;
  if (!hasCore) {
    throw new Error(set.join(', ') + ' can be set only on a food with kcal_100g, protein_100g, carbs_100g and fat_100g');
  }
  var v = function (f) { return food[f]; };
  var known = function (f) { return v(f) !== null; };
  if (known('satfat_100g') || known('transfat_100g')) {
    var fats = (v('satfat_100g') || 0) + (v('transfat_100g') || 0);
    if (fats > food.fat_100g + 1e-9) {
      throw new Error('saturated and trans fat add up to more than fat (satfat_100g + transfat_100g > fat_100g)');
    }
  }
  if (known('fiber_100g') && v('fiber_100g') > food.carbs_100g) {
    throw new Error('fiber is more than carbs (fiber_100g > carbs_100g)');
  }
  if (known('sugars_100g') && v('sugars_100g') > food.carbs_100g) {
    throw new Error('sugars are more than carbs (sugars_100g > carbs_100g)');
  }
  if (known('added_sugars_100g') && known('sugars_100g') && v('added_sugars_100g') > v('sugars_100g')) {
    throw new Error('added sugars are more than sugars (added_sugars_100g > sugars_100g)');
  }
  if (known('added_sugars_100g') && v('added_sugars_100g') > food.carbs_100g) {
    throw new Error('added sugars are more than carbs (added_sugars_100g > carbs_100g)');
  }
  ['cholesterol_mg_100g', 'sodium_mg_100g'].forEach(function (f) {
    if (known(f) && v(f) > MAX_MG_100G) throw new Error(f + ' must be at most ' + MAX_MG_100G + ' mg per 100 g');
  });
}

/** Refuse a second food with the same display name, naming the one that has it. */
function requireUniqueName(food) {
  var name = displayName(food).toLowerCase();
  var clash = listRecords('Foods', function (f) {
    return f.id !== food.id && displayName(f).toLowerCase() === name;
  })[0];
  if (clash) {
    var err = new Error('a food named ' + displayName(clash) + ' already exists');
    err.code = 'duplicate';
    err.extra = { duplicate_of: { id: clash.id, name: displayName(clash) } };
    throw err;
  }
}

/** `[{name, g}]`, names non-empty and distinct, grams over 0. Blank or empty is no servings. */
function validateServings(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value)) throw new Error('servings_json must be a list of {name, g}');
  var seen = {};
  return value.map(function (s) {
    if (!s || typeof s.name !== 'string' || s.name.trim() === '') {
      throw new Error('each serving needs a name');
    }
    var g = optionalNumber('serving "' + s.name + '" g', s.g, { positive: true });
    if (g === null) throw new Error('serving "' + s.name + '" needs g');
    var key = s.name.trim().toLowerCase();
    if (seen[key]) throw new Error('two servings are named "' + s.name.trim() + '"');
    seen[key] = true;
    return { name: s.name.trim(), g: g };
  });
}

/**
 * Set one named weight on a food (#707's "Set a weight"): `{ food_id, unit,
 * grams }`. A weight of that name (case-insensitive) is replaced in place;
 * otherwise it is added after the others. Every other column is left alone.
 */
function setFoodWeight(payload) {
  var id = requireString('food_id', payload && payload.food_id);
  var unit = requireString('unit', payload.unit).toLowerCase();
  var grams = optionalNumber('grams', payload.grams, { positive: true });
  if (grams === null) throw new Error('grams is required');
  var food = getRecord('Foods', { id: id });
  if (!food) throw new Error('Food "' + id + '" not found');

  var servings = Array.isArray(food.servings_json) ? food.servings_json.slice() : [];
  var at = -1;
  servings.forEach(function (s, i) { if (at === -1 && cell(s.name).trim().toLowerCase() === unit) at = i; });
  var weight = { name: unit, g: Math.round(grams * 10) / 10 };
  if (at === -1) servings.push(weight);
  else servings[at] = weight;
  food.servings_json = servings;
  food.updated = isoNow();
  return upsertRecord('Foods', food);
}

function validatePacks(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!Array.isArray(value) || value.some(function (p) { return typeof p !== 'string'; })) {
    throw new Error('packs_json must be a list of text');
  }
  return value;
}

/**
 * Delete a food no recipe line or trip item uses; otherwise refuse with code
 * `in_use`, naming the recipes and trips, and `uses: { recipes: [{id, name}],
 * trips: [id] }` for the app to word.
 */
function deleteFood(payload) {
  var id = requireString('id', payload && payload.id);
  if (!getRecord('Foods', { id: id })) throw new Error('Food "' + id + '" not found');
  var recipes = recipesUsing(id);
  var trips = unique(listRecords('TripItems', function (t) { return t.food_id === id; })
    .map(function (t) { return t.trip_id; }));
  if (recipes.length || trips.length) {
    var uses = [];
    if (recipes.length) {
      uses.push('recipes ' + recipes.map(function (r) { return r.name + ' (' + r.id + ')'; }).join(', '));
    }
    if (trips.length) uses.push('trips ' + trips.join(', '));
    var err = new Error('Food "' + id + '" is in use, so it was not deleted: ' + uses.join('; '));
    err.code = 'in_use';
    err.extra = { uses: { recipes: recipes, trips: trips } };
    throw err;
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
