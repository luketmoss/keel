// Recipes, their lines and steps (#703). A recipe is written whole: the row
// plus its full lines and steps, replaced together. Rating and last cooked are
// not stored here; reads derive them from Cooks. Search and sort are #708's.
//
// `line_id` (L1, L2...) is stable for the life of the recipe, because
// walkthroughs cite it: a replace keeps the ids the caller sends, and a line
// sent without one gets the next number after every id the recipe has used.

var RECIPE_SORTS = ['newest', 'name', 'rating', 'last_cooked'];

/**
 * Every recipe, with per-serving nutrition, partial, rating, last cooked,
 * cook_count, unrated_cook_id and has_walkthrough (#708).
 *
 * `q` (case-insensitive) keeps the recipes whose name, an ingredient line's
 * text, or the name of the food matched to a line contains it; a match that is
 * not the name carries `matched_line`, the first such line verbatim. `sort` is
 * `newest` (the default: last added first), `name` (A to Z), `rating`
 * (highest first, unrated last) or `last_cooked` (most recent first,
 * never-cooked last); ties fall back to newest.
 */
function getRecipes(params) {
  params = params || {};
  var q = cell(params.q).trim().toLowerCase();
  var sort = cell(params.sort).trim() || 'newest';
  validateEnum('sort', sort, RECIPE_SORTS);
  var foods = foodsById();
  var lines = groupBy(listRecords('RecipeLines'), 'recipe_id');
  var cooks = groupBy(listRecords('Cooks'), 'recipe_id');
  var walked = {};
  listRecords('Walkthroughs').forEach(function (w) { walked[w.recipe_id] = true; });

  var out = [];
  listRecords('Recipes').forEach(function (recipe) {
    var own = sortLines(lines[recipe.id] || []);
    var matchedLine = '';
    if (q && recipe.name.toLowerCase().indexOf(q) === -1) {
      var hit = own.filter(function (l) { return lineMatches(l, q, foods); })[0];
      if (!hit) return;
      matchedLine = hit.text;
    }
    var nutrition = recipeNutrition(own, recipe.servings, foods);
    var row = withDerived(recipe, nutrition, cooks[recipe.id] || [], !!walked[recipe.id]);
    if (q) row.matched_line = matchedLine;
    out.push(row);
  });
  return out.sort(recipeOrder(sort));
}

/** Whether a line's text, or the name of the food matched to it, contains `q` (already lower case). */
function lineMatches(line, q, foods) {
  if (cell(line.text).toLowerCase().indexOf(q) !== -1) return true;
  var food = line.food_id ? foods[line.food_id] : null;
  return !!food && cell(food.name).toLowerCase().indexOf(q) !== -1;
}

/** The comparator for a sort, every one falling back to newest. */
function recipeOrder(sort) {
  var newest = function (a, b) { return cell(b.created).localeCompare(cell(a.created)) || a.id.localeCompare(b.id); };
  // Nulls last, whatever the direction.
  var desc = function (field) {
    return function (a, b) {
      var x = a[field];
      var y = b[field];
      if (x === null && y === null) return newest(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      if (x < y) return 1;
      if (x > y) return -1;
      return newest(a, b);
    };
  };
  if (sort === 'name') {
    return function (a, b) {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || newest(a, b);
    };
  }
  if (sort === 'rating') return desc('rating');
  if (sort === 'last_cooked') return desc('last_cooked');
  return newest;
}

/** One recipe with its lines (resolved grams and any reason), steps and nutrition, with `by_line`. */
function getRecipe(id) {
  var recipe = getRecord('Recipes', { id: cell(id) });
  if (!recipe) throw new Error('Recipe "' + cell(id) + '" not found');
  var lines = sortLines(listRecords('RecipeLines', function (l) { return l.recipe_id === recipe.id; }));
  var steps = listRecords('Steps', function (s) { return s.recipe_id === recipe.id; })
    .sort(function (a, b) { return a.position - b.position; });
  var nutrition = recipeNutrition(lines, recipe.servings, foodsById());
  var cooks = listRecords('Cooks', function (c) { return c.recipe_id === recipe.id; });
  var walked = !!getRecord('Walkthroughs', { recipe_id: recipe.id });

  var out = withDerived(recipe, nutrition, cooks, walked);
  // #707: each line's grams and its kcal a serving, so the app computes nothing.
  out.nutrition.by_line = nutrition.lines.map(function (l) {
    return { line_id: l.line_id, grams: l.grams, kcal: l.kcal };
  });
  out.lines = lines.map(function (line, i) {
    var resolved = nutrition.lines[i];
    var l = JSON.parse(JSON.stringify(line));
    l.resolved_grams = resolved.grams;
    l.reason = resolved.reason;
    return l;
  });
  out.steps = steps;
  return out;
}

/** The recipe row plus what reads derive, with nutrition's per-line detail left out. */
function withDerived(recipe, nutrition, cooks, hasWalkthrough) {
  var out = JSON.parse(JSON.stringify(recipe));
  out.nutrition = {
    per_serving: nutrition.per_serving,
    missing: nutrition.missing,
    partial: nutrition.partial,
  };
  out.partial = nutrition.partial;
  var latest = latestCooks(cooks);
  out.rating = latest.rating;
  out.last_cooked = latest.date;
  out.cook_count = cooks.length;
  // #708: the latest cook, while it has no rating, so the app can ask "How was it?".
  out.unrated_cook_id = latest.cook && latest.cook.rating === null ? latest.cook.id : null;
  out.has_walkthrough = hasWalkthrough;
  return out;
}

/** The latest non-blank rating, the latest cook date, and the latest cook itself, or null. */
function latestCooks(cooks) {
  var ordered = cooks.slice().sort(function (a, b) {
    return (a.date + a.created).localeCompare(b.date + b.created);
  });
  var rating = null;
  var date = null;
  ordered.forEach(function (c) {
    if (c.rating !== null) rating = c.rating;
    if (c.date) date = c.date;
  });
  return { rating: rating, date: date, cook: ordered.length ? ordered[ordered.length - 1] : null };
}

/**
 * Nutrition for a recipe that is not saved: what an import previews. Payload
 * `{ servings, lines: [{line_id?, qty, unit, food_id, grams, optional}] }`.
 */
function computeNutrition(payload) {
  if (!payload || !Array.isArray(payload.lines)) throw new Error('payload.lines must be a list');
  var servings = optionalNumber('servings', payload.servings, { positive: true });
  var foods = foodsById();
  var lines = payload.lines.map(function (line, i) {
    var l = normalizeLine(line, i, 'L' + (i + 1));
    if (l.food_id && !foods[l.food_id]) throw new Error('food_id "' + l.food_id + '" is not a food');
    return l;
  });
  return recipeNutrition(lines, servings, foods);
}

/**
 * Create a recipe, or replace the one with that `id`. Payload: the recipe's
 * fields plus `lines` and `steps`. Lines and steps sent replace the stored
 * ones together; left out, they are kept.
 */
function upsertRecipe(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a recipe');
  var existing = payload.id ? getRecord('Recipes', { id: cell(payload.id) }) : null;
  var recipe = existing ? JSON.parse(JSON.stringify(existing)) : {};
  recipe.id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.recipe);
  RECIPE_FIELDS.forEach(function (field) {
    if (field === 'id' || field === 'created' || field === 'updated') return;
    if (has(payload, field)) recipe[field] = payload[field];
  });

  recipe.name = requireString('name', recipe.name);
  ['source_url', 'source_site', 'notes'].forEach(function (f) { recipe[f] = optionalString(f, recipe[f]); });
  recipe.servings = optionalNumber('servings', recipe.servings, { positive: true });
  if (recipe.servings === null) throw new Error('servings is required');
  recipe.total_min = optionalNumber('total_min', recipe.total_min, { min: 0 });

  var lines = null;
  if (has(payload, 'lines')) {
    if (!Array.isArray(payload.lines)) throw new Error('lines must be a list');
    lines = assignLineIds(payload.lines, existing ? recipe.id : null);
    lines.forEach(function (l) { if (l.food_id) requireFood(l.food_id); });
  }
  var steps = null;
  if (has(payload, 'steps')) {
    if (!Array.isArray(payload.steps)) throw new Error('steps must be a list');
    steps = payload.steps.map(function (s, i) {
      if (!s || typeof s !== 'object') throw new Error('step ' + (i + 1) + ' must be an object');
      return {
        recipe_id: recipe.id,
        position: i + 1,
        section: optionalString('step section', s.section),
        name: optionalString('step name', s.name),
        text: requireString('step ' + (i + 1) + ' text', s.text),
      };
    });
  }

  return withScriptLock(function () {
    var now = isoNow();
    recipe.created = existing ? existing.created : now;
    recipe.updated = now;
    upsertRecord('Recipes', recipe);
    if (lines) {
      deleteRecordsWhere('RecipeLines', function (l) { return l.recipe_id === recipe.id; });
      lines.forEach(function (l) { l.recipe_id = recipe.id; });
      appendRecords('RecipeLines', lines);
    }
    if (steps) {
      deleteRecordsWhere('Steps', function (s) { return s.recipe_id === recipe.id; });
      appendRecords('Steps', steps);
    }
    return getRecipe(recipe.id);
  });
}

/** One line as stored, its `line_id` given or left blank for assignLineIds. */
function normalizeLine(line, i, fallbackId) {
  if (!line || typeof line !== 'object') throw new Error('line ' + (i + 1) + ' must be an object');
  var id = cell(line.line_id).trim();
  if (id && !/^L\d+$/.test(id)) throw new Error('line_id must look like L1, L2...');
  return {
    recipe_id: '',
    line_id: id || fallbackId || '',
    position: i + 1,
    section: optionalString('line section', line.section),
    text: requireString('line ' + (i + 1) + ' text', line.text),
    qty: optionalNumber('line ' + (i + 1) + ' qty', line.qty, { min: 0 }),
    unit: cell(line.unit).trim().toLowerCase(),
    food_id: cell(line.food_id).trim(),
    grams: optionalNumber('line ' + (i + 1) + ' grams', line.grams, { min: 0 }),
    optional: toBool(line.optional),
  };
}

/**
 * Lines with ids: the caller's kept, the rest numbered after the highest id
 * the recipe has stored or the caller sent, so a removed line's id is not
 * reused while a newer one exists.
 */
function assignLineIds(raw, recipeId) {
  var lines = raw.map(function (line, i) { return normalizeLine(line, i); });
  var seen = {};
  var max = 0;
  var bump = function (id) { var n = Number(id.slice(1)); if (n > max) max = n; };
  lines.forEach(function (l) {
    if (!l.line_id) return;
    if (seen[l.line_id]) throw new Error('line_id ' + l.line_id + ' is sent twice');
    seen[l.line_id] = true;
    bump(l.line_id);
  });
  if (recipeId) {
    listRecords('RecipeLines', function (l) { return l.recipe_id === recipeId; })
      .forEach(function (l) { bump(l.line_id); });
  }
  lines.forEach(function (l) { if (!l.line_id) l.line_id = 'L' + (++max); });
  return lines;
}

/**
 * Delete a recipe with its lines, steps, walkthrough and cook history (#708).
 * Refused while a plan or log entry uses it, listing them.
 */
function deleteRecipe(payload) {
  var id = requireString('id', payload && payload.id);
  if (!getRecord('Recipes', { id: id })) throw new Error('Recipe "' + id + '" not found');
  var plans = listRecords('Plan', function (p) { return p.recipe_id === id; }).map(function (p) { return p.id; });
  var logs = listRecords('FoodLog', function (l) { return l.recipe_id === id; }).map(function (l) { return l.id; });
  if (plans.length || logs.length) {
    var uses = [];
    if (plans.length) uses.push('plan entries ' + plans.join(', '));
    if (logs.length) uses.push('log entries ' + logs.join(', '));
    var err = new Error('Recipe "' + id + '" is in use, so it was not deleted: ' + uses.join('; '));
    err.code = 'in_use';
    err.extra = { uses: { plan: plans, log: logs } };
    throw err;
  }
  return withScriptLock(function () {
    deleteRecordsWhere('RecipeLines', function (l) { return l.recipe_id === id; });
    deleteRecordsWhere('Steps', function (s) { return s.recipe_id === id; });
    deleteRecordsWhere('Walkthroughs', function (w) { return w.recipe_id === id; });
    deleteRecordsWhere('Cooks', function (c) { return c.recipe_id === id; });
    deleteRecord('Recipes', { id: id });
    return { id: id, deleted: true };
  });
}

function requireRecipe(id, field) {
  if (!getRecord('Recipes', { id: cell(id) })) {
    throw new Error((field || 'recipe_id') + ' "' + cell(id) + '" is not a recipe');
  }
}

function sortLines(lines) {
  return lines.slice().sort(function (a, b) { return a.position - b.position; });
}

function groupBy(records, field) {
  var out = {};
  records.forEach(function (r) { (out[r[field]] = out[r[field]] || []).push(r); });
  return out;
}
