// Cooks (#703): one row each time a recipe is made. A recipe's rating and last
// cooked are derived from here. Recording, rating and removing a cook from the
// app and the MCP tools are #708's.

/** Cooks, newest first, optionally for one recipe, each with its `recipe_name`. */
function getCooks(params) {
  var recipeId = cell(params && params.recipe_id).trim();
  var names = recipeNames();
  return listRecords('Cooks', function (c) { return !recipeId || c.recipe_id === recipeId; })
    .sort(function (a, b) { return (b.date + b.created).localeCompare(a.date + a.created); })
    .map(function (c) { return withRecipeName(c, names); });
}

function recipeNames() {
  var names = {};
  listRecords('Recipes').forEach(function (r) { names[r.id] = r.name; });
  return names;
}

function withRecipeName(cook, names) {
  var out = JSON.parse(JSON.stringify(cook));
  out.recipe_name = names[cook.recipe_id] || '';
  return out;
}

/**
 * Create a cook, or merge the fields sent into the one with that `id`, so a
 * retry with the same id leaves one row. A new cook with no `date` is today's
 * (TIMEZONE); a date sent is kept. `rating` is 1 to 5, or blank (null or '')
 * to clear it. Answers the row as stored, with its `recipe_name`.
 */
function upsertCook(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a cook');
  var existing = payload.id ? getRecord('Cooks', { id: cell(payload.id) }) : null;
  var cook = existing ? JSON.parse(JSON.stringify(existing)) : {};
  cook.id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.cook);
  ['recipe_id', 'date', 'rating', 'note', 'plan_id'].forEach(function (f) {
    if (has(payload, f)) cook[f] = payload[f];
  });

  cook.recipe_id = requireString('recipe_id', cook.recipe_id);
  requireRecipe(cook.recipe_id);
  if (!existing && !cell(cook.date)) cook.date = todayLocal();
  cook.date = validateDate('date', cook.date);
  cook.rating = optionalNumber('rating', cook.rating, { min: 1, max: 5, integer: true });
  cook.note = optionalString('note', cook.note);
  cook.plan_id = cell(cook.plan_id).trim();
  if (cook.plan_id) requirePlanEntry(cook.plan_id);
  cook.created = existing ? existing.created : isoNow();
  return withRecipeName(upsertRecord('Cooks', cook), recipeNames());
}

function deleteCook(payload) {
  var id = requireString('id', payload && payload.id);
  if (!deleteRecord('Cooks', { id: id })) throw new Error('Cook "' + id + '" not found');
  return { id: id, deleted: true };
}
