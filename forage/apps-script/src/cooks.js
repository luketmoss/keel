// Cooks (#703): one row each time a recipe is made. A recipe's rating and last
// cooked are derived from here. Recording a cook from cooking mode is #708's.

/** Cooks, newest first, optionally for one recipe. */
function getCooks(params) {
  var recipeId = cell(params && params.recipe_id).trim();
  return listRecords('Cooks', function (c) { return !recipeId || c.recipe_id === recipeId; })
    .sort(function (a, b) { return (b.date + b.created).localeCompare(a.date + a.created); });
}

/** Create a cook, or merge the fields sent into the one with that `id`. */
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
  cook.date = validateDate('date', cook.date);
  cook.rating = optionalNumber('rating', cook.rating, { min: 1, max: 5, integer: true });
  cook.note = optionalString('note', cook.note);
  cook.plan_id = cell(cook.plan_id).trim();
  if (cook.plan_id) requirePlanEntry(cook.plan_id);
  cook.created = existing ? existing.created : isoNow();
  return upsertRecord('Cooks', cook);
}

function deleteCook(payload) {
  var id = requireString('id', payload && payload.id);
  if (!deleteRecord('Cooks', { id: id })) throw new Error('Cook "' + id + '" not found');
  return { id: id, deleted: true };
}
