// The food log (#703). Each entry is a food or a recipe, never both. Its kcal,
// protein, carbs, fat and partial are a snapshot the API computes when the
// entry is written, and recomputes only when that entry is edited: changing a
// food or a recipe later does not rewrite past days. Blank means unknown.

function getFoodLog(params) {
  var range = dateRange(params);
  return listRecords('FoodLog', function (e) { return inRange(e.date, range); })
    .sort(function (a, b) {
      return a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || a.logged_at.localeCompare(b.logged_at)
        : a.date.localeCompare(b.date);
    });
}

/**
 * Per date: `{ date, entries, kcal, protein_g, carbs_g, fat_g, partial }`,
 * oldest first. A sum is null when no entry on the day has the value; partial
 * when any entry is partial or unknown.
 */
function getFoodLogTotals(params) {
  var range = dateRange(params);
  var byDate = {};
  getFoodLog(params).forEach(function (e) {
    var day = byDate[e.date] = byDate[e.date] ||
      { date: e.date, entries: 0, kcal: null, protein_g: null, carbs_g: null, fat_g: null, partial: false };
    day.entries++;
    ['kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(function (f) {
      if (e[f] !== null) day[f] = (day[f] || 0) + e[f];
    });
    if (e.partial || e.kcal === null) day.partial = true;
  });
  var days = Object.keys(byDate).sort().map(function (d) {
    var day = byDate[d];
    ['kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(function (f) { day[f] = round1(day[f]); });
    return day;
  });
  return { from: range.from || null, to: range.to || null, days: days };
}

/**
 * Log a food or a recipe. Payload `{ id?, date, slot, food_id | recipe_id,
 * qty, unit }`: a food's unit is one of its serving names or `g`; a recipe's
 * is `serving`. The same `id` again replaces that entry, so a retry leaves one.
 */
function logFood(payload, caller) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a log entry');
  var id = idFor(payload.id, ID_PREFIXES.log);
  var existing = getRecord('FoodLog', { id: id });
  return writeLogEntry(existing, payload, id, caller);
}

/** Payload `{ id, changes: {date?, slot?, food_id?, recipe_id?, qty?, unit?} }`. Recomputes the snapshot. */
function updateLogEntry(payload, caller) {
  var id = requireString('id', payload && payload.id);
  var existing = getRecord('FoodLog', { id: id });
  if (!existing) throw new Error('Log entry "' + id + '" not found');
  var changes = (payload && payload.changes) || {};
  var merged = {};
  ['date', 'slot', 'food_id', 'recipe_id', 'qty', 'unit'].forEach(function (f) {
    merged[f] = has(changes, f) ? changes[f] : existing[f];
  });
  // Switching between a food and a recipe clears the other side.
  if (has(changes, 'food_id') && !has(changes, 'recipe_id') && cell(changes.food_id)) merged.recipe_id = '';
  if (has(changes, 'recipe_id') && !has(changes, 'food_id') && cell(changes.recipe_id)) merged.food_id = '';
  return writeLogEntry(existing, merged, id, caller);
}

function writeLogEntry(existing, fields, id, caller) {
  var entry = {
    id: id,
    date: validateDate('date', fields.date),
    slot: validateEnum('slot', fields.slot, SLOTS),
    food_id: cell(fields.food_id).trim(),
    recipe_id: cell(fields.recipe_id).trim(),
    qty: optionalNumber('qty', fields.qty, { positive: true }),
    unit: cell(fields.unit).trim(),
  };
  if (!!entry.food_id === !!entry.recipe_id) throw new Error('a log entry has exactly one of food_id and recipe_id');
  if (entry.qty === null) throw new Error('qty is required');

  var snapshot;
  if (entry.food_id) {
    var food = getRecord('Foods', { id: entry.food_id });
    if (!food) throw new Error('food_id "' + entry.food_id + '" is not a food');
    if (!entry.unit) throw new Error('unit is required: one of the food\'s servings, or g');
    snapshot = foodEntryNutrition(food, entry.qty, entry.unit);
  } else {
    var recipe = getRecord('Recipes', { id: entry.recipe_id });
    if (!recipe) throw new Error('recipe_id "' + entry.recipe_id + '" is not a recipe');
    if (entry.unit && entry.unit !== 'serving') throw new Error('a recipe is logged in servings: unit is serving');
    entry.unit = 'serving';
    var lines = sortLines(listRecords('RecipeLines', function (l) { return l.recipe_id === recipe.id; }));
    snapshot = recipeEntryNutrition(recipeNutrition(lines, recipe.servings, foodsById()), entry.qty);
  }

  entry.grams = snapshot.grams;
  entry.kcal = snapshot.kcal;
  entry.protein_g = snapshot.protein_g;
  entry.carbs_g = snapshot.carbs_g;
  entry.fat_g = snapshot.fat_g;
  entry.partial = snapshot.partial;
  entry.source = existing ? existing.source : callerSource(caller);
  var now = isoNow();
  entry.logged_at = existing ? existing.logged_at : now;
  entry.created = existing ? existing.created : now;
  entry.updated = now;
  return upsertRecord('FoodLog', entry);
}

function deleteLogEntry(payload) {
  var id = requireString('id', payload && payload.id);
  if (!deleteRecord('FoodLog', { id: id })) throw new Error('Log entry "' + id + '" not found');
  return { id: id, deleted: true };
}

/** `app` for the app's token, `mcp` for the key. */
function callerSource(caller) {
  return caller && caller.mode === 'token' ? 'app' : 'mcp';
}

function dateRange(params) {
  params = params || {};
  return { from: validateDate('from', params.from, true), to: validateDate('to', params.to, true) };
}

function inRange(date, range) {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}
