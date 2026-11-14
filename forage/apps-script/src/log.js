// The food log (#703, #712). Each entry is a food or a recipe, never both. Its
// kcal, protein, carbs, fat and partial are a snapshot the API computes when
// the entry is written, and recomputes only when that entry's amount, unit or
// food changes (#712): changing a food or a recipe later does not rewrite past
// days, and moving an entry to another meal keeps its numbers. Blank means
// unknown. logFood and updateLogEntry take `dry_run`: the entry as it would be
// stored, nothing written, which is the app's amount preview. #755's seven
// nutrients are part of the snapshot, by the same rule.

function getFoodLog(params) {
  var range = dateRange(params);
  return listRecords('FoodLog', function (e) { return inRange(e.date, range); })
    .sort(function (a, b) {
      return a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || a.logged_at.localeCompare(b.logged_at)
        : a.date.localeCompare(b.date);
    });
}

/**
 * The daily totals, the one contract Thrive's Day screen reads (#712, #714):
 * `{ from, to, days: [{ date, entries, unknown_entries, kcal, protein_g,
 * carbs_g, fat_g, partial }] }`, oldest first. A date with no entries is absent,
 * never present with zeros. A sum covers the entries that have the value and is
 * null only when none on the date does; `unknown_entries` counts entries whose
 * snapshot is blank; partial when any entry is partial or unknown. To 0.1.
 *
 * #755 adds the seven (`satfat_g` ... `added_sugars_g`), each summed over the
 * entries that have it and null when none does, and `unknown: { satfat_g, ...
 * }`, for each the entries with a kcal but not that value. They change none
 * of the fields above, `partial` included.
 *
 * #865: `by_meal` (true or "true") adds `meals` to each day, last, one object
 * per slot with an entry that date, in SLOTS order, with the day's fields
 * minus `date` and plus `slot`, accumulated by the same functions. The day
 * stays the sum over its entries, rounded once. Without it nothing changes.
 */
function getFoodLogTotals(params) {
  var range = dateRange(params);
  var byMeal = params && (params.by_meal === true || params.by_meal === 'true');
  var byDate = {};
  getFoodLog(params).forEach(function (e) {
    var day = byDate[e.date] = byDate[e.date] || newTotals('date', e.date);
    addToTotals(day, e);
    if (byMeal) {
      var meals = day.meals = day.meals || [];
      var meal = null;
      meals.forEach(function (m) { if (m.slot === e.slot) meal = m; });
      if (!meal) meals.push(meal = newTotals('slot', e.slot));
      addToTotals(meal, e);
    }
  });
  var days = Object.keys(byDate).sort().map(function (d) {
    var day = byDate[d];
    roundTotals(day);
    if (day.meals) {
      // SLOTS order; a slot from before a rename is kept, after the known ones, in first-seen order.
      var seen = day.meals;
      var known = SLOTS.map(function (s) { return seen.filter(function (m) { return m.slot === s; })[0]; })
        .filter(function (m) { return m; });
      var other = seen.filter(function (m) { return SLOTS.indexOf(m.slot) === -1; });
      day.meals = known.concat(other);
      day.meals.forEach(roundTotals);
    }
    return day;
  });
  return { from: range.from || null, to: range.to || null, days: days };
}

/** An empty accumulator for a day (`date`) or one of its meals (`slot`); both share the rules below (#865). */
function newTotals(keyName, keyValue) {
  var t = {};
  t[keyName] = keyValue;
  t.entries = 0; t.unknown_entries = 0;
  t.kcal = null; t.protein_g = null; t.carbs_g = null; t.fat_g = null; t.partial = false;
  EXTRA_NUTRIENTS.forEach(function (x) { t[x.key] = null; });
  t.unknown = extraNutrientMap(0);
  return t;
}

/** Add one entry: the unknown, partial and sum rules, once, for a day and a meal alike. */
function addToTotals(t, e) {
  t.entries++;
  if (e.kcal === null) t.unknown_entries++;
  ['kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(function (f) {
    if (e[f] !== null) t[f] = (t[f] || 0) + e[f];
  });
  if (e.partial || e.kcal === null) t.partial = true;
  EXTRA_NUTRIENTS.forEach(function (x) {
    if (e[x.key] !== null) t[x.key] = (t[x.key] || 0) + e[x.key];
    else if (e.kcal !== null) t.unknown[x.key]++;
  });
}

function roundTotals(t) {
  ['kcal', 'protein_g', 'carbs_g', 'fat_g'].forEach(function (f) { t[f] = round1(t[f]); });
  EXTRA_NUTRIENTS.forEach(function (x) { t[x.key] = round1(t[x.key]); });
}

/**
 * Log a food or a recipe. Payload `{ id?, date, slot, food_id | recipe_id,
 * qty, unit, dry_run? }`: a food's unit is one of its serving names or `g`; a
 * recipe's is `serving`. The same `id` again replaces that entry, so a retry
 * leaves one. `dry_run: true` answers the entry as it would be stored.
 */
function logFood(payload, caller) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a log entry');
  var id = idFor(payload.id, ID_PREFIXES.log);
  var existing = getRecord('FoodLog', { id: id });
  return writeLogEntry(existing, payload, id, caller, isDryRun(payload));
}

/**
 * Payload `{ id, changes: {date?, slot?, food_id?, recipe_id?, qty?, unit?}, dry_run? }`.
 * The snapshot is recomputed, from the food or recipe as it is now, only when
 * the amount, the unit or the food or recipe differs from what is stored (#712).
 */
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
  return writeLogEntry(existing, merged, id, caller, isDryRun(payload));
}

/** `dry_run` as the app and the Worker send it: true, or the text "true". */
function isDryRun(payload) {
  return !!payload && (payload.dry_run === true || payload.dry_run === 'true');
}

/** Whether an edit leaves the snapshot's inputs as stored: the same food or recipe, amount and unit. */
function sameAmount(existing, entry) {
  return existing.food_id === entry.food_id && existing.recipe_id === entry.recipe_id &&
    existing.qty === entry.qty && existing.unit === entry.unit;
}

var SNAPSHOT_FIELDS = [
  'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'partial',
  // #755: the seven, written with the rest and kept with them. An entry from before has them blank.
  'satfat_g', 'transfat_g', 'cholesterol_mg', 'sodium_mg', 'fiber_g', 'sugars_g', 'added_sugars_g',
];

function writeLogEntry(existing, fields, id, caller, dryRun) {
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

  // The food or recipe must still exist even when the stored numbers are kept.
  var snapshot;
  if (entry.food_id) {
    var food = getRecord('Foods', { id: entry.food_id });
    if (!food) throw new Error('food_id "' + entry.food_id + '" is not a food');
    if (!entry.unit) throw new Error('unit is required: one of the food\'s servings, or g');
    snapshot = existing && sameAmount(existing, entry) ? existing : foodEntryNutrition(food, entry.qty, entry.unit);
  } else {
    var recipe = getRecord('Recipes', { id: entry.recipe_id });
    if (!recipe) throw new Error('recipe_id "' + entry.recipe_id + '" is not a recipe');
    if (entry.unit && entry.unit !== 'serving') throw new Error('a recipe is logged in servings: unit is serving');
    entry.unit = 'serving';
    if (existing && sameAmount(existing, entry)) {
      snapshot = existing;
    } else {
      var lines = sortLines(listRecords('RecipeLines', function (l) { return l.recipe_id === recipe.id; }));
      snapshot = recipeEntryNutrition(recipeNutrition(lines, recipe.servings, foodsById()), entry.qty);
    }
  }

  SNAPSHOT_FIELDS.forEach(function (f) { entry[f] = snapshot[f]; });
  entry.source = existing ? existing.source : callerSource(caller);
  var now = isoNow();
  entry.logged_at = existing ? existing.logged_at : now;
  entry.created = existing ? existing.created : now;
  entry.updated = now;
  if (dryRun) return entry;
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
