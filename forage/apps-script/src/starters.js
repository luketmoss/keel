// The starter list (#707): about 75 USDA SR Legacy pantry staples in
// starter.js, which the owner adds to the library in a tap, and which the
// import's "Which food is this?" chooser offers as suggestions. A starter food
// is only ever a suggestion: nothing here matches a recipe line by itself.
//
// A starter food is "in the library" once a food carries its FDC id as
// `source_ref`, or a food with its exact name has nutrition. It "can fill" a
// name-only food (#706 makes those) whose name is the starter's name or one of
// its aliases: adding it fills that food in, keeping its id, so the recipes
// that use it are not rewired.

function starterById(id) {
  for (var i = 0; i < STARTER_FOODS.length; i++) {
    if (STARTER_FOODS[i].id === id) return STARTER_FOODS[i];
  }
  return null;
}

/** The normalised names that mean the starter food: its own, then its aliases. */
function starterKeys(s) {
  var keys = [normalizeName(s.name)];
  s.aliases.forEach(function (a) {
    var k = normalizeName(a);
    if (k && keys.indexOf(k) === -1) keys.push(k);
  });
  return keys;
}

/** `{ in_library, can_fill }` for a starter food against the library: a food id or ''. */
function starterStatus(s, foods) {
  var ref = String(s.fdc);
  var name = s.name.toLowerCase();
  var keys = null;
  var fill = '';
  for (var i = 0; i < foods.length; i++) {
    var f = foods[i];
    if (f.source !== 'off' && f.source_ref === ref) return { in_library: f.id, can_fill: '' };
    if (displayName(f).toLowerCase() === name && hasNutrition(f)) return { in_library: f.id, can_fill: '' };
    if (!fill && !f.brand && !hasNutrition(f)) {
      keys = keys || starterKeys(s);
      if (keys.indexOf(normalizeName(f.name)) !== -1) fill = f.id;
    }
  }
  return { in_library: '', can_fill: fill };
}

/**
 * `getStarterFoods` (optional `q`, a substring of the name or an alias): the
 * starter list sorted by name, each with `in_library` and `can_fill`.
 */
function getStarterFoods(params) {
  var q = cell(params && params.q).trim().toLowerCase();
  var foods = listRecords('Foods');
  return STARTER_FOODS.filter(function (s) {
    if (!q) return true;
    return [s.name].concat(s.aliases).some(function (n) { return n.toLowerCase().indexOf(q) !== -1; });
  }).map(function (s) {
    var out = JSON.parse(JSON.stringify(s));
    var status = starterStatus(s, foods);
    out.in_library = status.in_library;
    out.can_fill = status.can_fill;
    return out;
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/** A blank value: what "already set" is not. */
function isBlank(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * `addStarterFoods` (`ids`). Each starter food becomes a Foods row (`source`
 * `usda`, `source_ref` its FDC id, `kind` ingredient), or fills in the
 * name-only food it can fill without overwriting anything already set, or is
 * left alone when it is already in the library. Its aliases are merged into
 * Config `ingredient_aliases`, never over an alias pointing at another food.
 * Answers `{ added, filled, existing }`, each `[{ starter_id, id, name }]`, so
 * a second call leaves one row per food.
 */
function addStarterFoods(payload) {
  var ids = payload && payload.ids;
  if (!Array.isArray(ids) || !ids.length) throw new Error('ids must be a list of starter food ids');
  var chosen = [];
  ids.forEach(function (id) {
    var s = starterById(cell(id));
    if (!s) throw new Error('"' + cell(id) + '" is not on the starter list');
    if (chosen.indexOf(s) === -1) chosen.push(s);
  });

  var out = { added: [], filled: [], existing: [] };
  var taught = [];
  chosen.forEach(function (s) {
    var foods = listRecords('Foods');
    var status = starterStatus(s, foods);
    var now = isoNow();
    if (status.in_library) {
      var have = foods.filter(function (f) { return f.id === status.in_library; })[0];
      out.existing.push({ starter_id: s.id, id: have.id, name: displayName(have) });
      return;
    }
    var food;
    if (status.can_fill) {
      food = foods.filter(function (f) { return f.id === status.can_fill; })[0];
      NUTRITION_FIELDS.forEach(function (f) { if (isBlank(food[f])) food[f] = s[f]; });
      if (isBlank(food.servings_json) && s.servings.length) food.servings_json = s.servings;
      if (isBlank(food.category)) food.category = s.category;
      if (isBlank(food.source)) food.source = 'usda';
      if (isBlank(food.source_ref)) food.source_ref = String(s.fdc);
      food.updated = now;
      upsertRecord('Foods', food);
      out.filled.push({ starter_id: s.id, id: food.id, name: displayName(food) });
    } else {
      food = {
        id: newId(ID_PREFIXES.food),
        name: s.name,
        kind: 'ingredient',
        category: s.category,
        kcal_100g: s.kcal_100g,
        protein_100g: s.protein_100g,
        carbs_100g: s.carbs_100g,
        fat_100g: s.fat_100g,
        servings_json: s.servings.length ? s.servings : null,
        source: 'usda',
        source_ref: String(s.fdc),
        created: now,
        updated: now,
      };
      upsertRecord('Foods', food);
      out.added.push({ starter_id: s.id, id: food.id, name: food.name });
    }
    taught.push({ starter: s, id: food.id, name: food.name });
  });
  if (taught.length) teachStarterAliases(taught);
  return out;
}

/** Point each starter food's aliases at its food, keeping any alias that already points elsewhere. */
function teachStarterAliases(taught) {
  var aliases = readAliases(foodsById());
  var changed = false;
  taught.forEach(function (t) {
    var own = normalizeName(t.name);
    starterKeys(t.starter).forEach(function (k) {
      if (!k || k === own || has(aliases, k)) return;
      aliases[k] = t.id;
      changed = true;
    });
  });
  if (changed) upsertRecord('Config', { key: ALIAS_CONFIG_KEY, value: JSON.stringify(aliases), updated: isoNow() });
}

/** The starter foods not yet in the library, with their keys, for the import's suggestions. */
function availableStarters(foods) {
  return STARTER_FOODS.filter(function (s) { return !starterStatus(s, foods).in_library; })
    .map(function (s) { return { starter: s, keys: starterKeys(s) }; });
}

/**
 * Up to `limit` starter foods for a cleaned ingredient name, closest first, as
 * `{ starter_id, name }`: one whose name or alias is the name outranks one
 * that only shares a word. Never used automatically.
 */
function starterSuggestions(key, available, limit) {
  if (!key || limit <= 0) return [];
  var words = key.split(' ');
  return available
    .map(function (a) {
      var best = 0;
      a.keys.forEach(function (k) {
        if (k === key) { best = Math.max(best, 10); return; }
        var kw = k.split(' ');
        var shared = words.filter(function (w) { return kw.indexOf(w) !== -1; }).length;
        var contains = k.indexOf(key) !== -1 || key.indexOf(k) !== -1;
        best = Math.max(best, shared * 2 + (contains ? 1 : 0) - Math.abs(kw.length - words.length) * 0.1);
      });
      return { starter: a.starter, score: best };
    })
    .filter(function (s) { return s.score >= 1; })
    .sort(function (a, b) { return b.score - a.score || a.starter.name.localeCompare(b.starter.name); })
    .slice(0, limit)
    .map(function (s) { return { starter_id: s.starter.id, name: s.starter.name }; });
}
