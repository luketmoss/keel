// Walkthroughs (#703): one JSON document per recipe. This checks only that it
// is JSON with `format` 1 and the right `recipe` id; its structure (that its
// line ids exist) is #711's.

function getWalkthrough(recipeId) {
  var row = getRecord('Walkthroughs', { recipe_id: cell(recipeId) });
  if (!row) return null;
  return { recipe_id: row.recipe_id, format: row.format, walkthrough: row.walkthrough_json, updated: row.updated };
}

/** Payload `{ recipe_id, walkthrough }`, the walkthrough as an object or as JSON text. */
function setWalkthrough(payload) {
  var recipeId = requireString('recipe_id', payload && payload.recipe_id);
  requireRecipe(recipeId);
  var doc = payload.walkthrough;
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch (err) {
      throw new Error('walkthrough is not valid JSON');
    }
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('walkthrough must be a JSON object');
  if (doc.format !== 1) throw new Error('walkthrough format must be 1');
  if (doc.recipe !== recipeId) throw new Error('walkthrough recipe must be "' + recipeId + '"');
  upsertRecord('Walkthroughs', { recipe_id: recipeId, format: 1, walkthrough_json: doc, updated: isoNow() });
  return getWalkthrough(recipeId);
}

function deleteWalkthrough(payload) {
  var recipeId = requireString('recipe_id', payload && payload.recipe_id);
  if (!deleteRecord('Walkthroughs', { recipe_id: recipeId })) {
    throw new Error('Recipe "' + recipeId + '" has no walkthrough');
  }
  return { recipe_id: recipeId, deleted: true };
}
