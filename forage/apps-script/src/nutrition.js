// Nutrition, once (#703). Unit-to-gram conversion, the per-serving sums and
// the partial rule live here and nowhere else: the app, the import preview
// and agents all get their figures from these functions, through the API.
//
// A line's grams: its own `grams` if set, else its `qty` converted through its
// food:
//   1. mass units exactly;
//   2. volume units through the food's first serving that leads with a volume
//      unit, scaled between units. No density guess, water included;
//   3. any other unit through the first serving whose leading word matches,
//      then the food's buy unit;
//   4. no unit: a serving named `each`, else the food's first serving;
//   5. otherwise unknown.

var MASS_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

/** Each volume unit as a fraction of a cup. */
var VOLUME_CUPS = { tsp: 1 / 48, tbsp: 1 / 16, cup: 1, 'fl oz': 1 / 8, ml: 1 / 236.588, l: 1000 / 236.588 };

/** Spellings and plurals that mean one unit. A unit not here is matched as written, then singular. */
var UNIT_ALIASES = {
  gram: 'g', grams: 'g', kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  cups: 'cup', c: 'cup',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl. oz': 'fl oz', 'fl. oz.': 'fl oz', 'fl oz.': 'fl oz',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  cloves: 'clove', slices: 'slice', cans: 'can', pieces: 'piece', leaves: 'leaf',
};

/** A unit as its one spelling: lower case, trimmed, aliased. */
function canonicalUnit(unit) {
  var u = cell(unit).trim().toLowerCase().replace(/\s+/g, ' ');
  return has(UNIT_ALIASES, u) ? UNIT_ALIASES[u] : u;
}

/** The serving name up to its first comma, space or parenthesis; `fl oz` whole. */
function leadingUnit(name) {
  var s = cell(name).trim().toLowerCase();
  var fl = /^(fl\.? oz\.?|fluid ounces?)(?=$|[\s,(])/.exec(s);
  if (fl) return 'fl oz';
  return canonicalUnit(s.split(/[\s,(]/)[0]);
}

/** Whether two units name the same thing, allowing a plural `s`. */
function sameUnit(a, b) {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  var sing = function (u) { return u.length > 1 && /s$/.test(u) ? u.slice(0, -1) : u; };
  return sing(a) === sing(b);
}

function foodServings(food) {
  return Array.isArray(food && food.servings_json) ? food.servings_json.filter(function (s) {
    return s && typeof s.name === 'string' && typeof s.g === 'number' && s.g > 0;
  }) : [];
}

/** Whether the food has all four per-100 g values. Blank means no nutrition yet. */
function hasNutrition(food) {
  return !!food && ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'].every(function (f) {
    return typeof food[f] === 'number';
  });
}

/**
 * Grams for `qty` of `unit` of `food`, or null when the weight is unknown.
 * `food` may be null only for a mass unit.
 */
function gramsFor(qty, unit, food) {
  if (typeof qty !== 'number') return null;
  var u = canonicalUnit(unit);

  if (has(MASS_G, u)) return qty * MASS_G[u];

  var servings = foodServings(food);

  if (has(VOLUME_CUPS, u)) {
    for (var i = 0; i < servings.length; i++) {
      var lead = leadingUnit(servings[i].name);
      if (has(VOLUME_CUPS, lead)) return qty * VOLUME_CUPS[u] / VOLUME_CUPS[lead] * servings[i].g;
    }
    return null;
  }

  if (u === '') {
    for (var e = 0; e < servings.length; e++) {
      if (leadingUnit(servings[e].name) === 'each') return qty * servings[e].g;
    }
    return servings.length ? qty * servings[0].g : null;
  }

  for (var j = 0; j < servings.length; j++) {
    if (sameUnit(leadingUnit(servings[j].name), u)) return qty * servings[j].g;
  }
  if (food && typeof food.buy_unit_g === 'number' && food.buy_unit_g > 0 &&
      sameUnit(leadingUnit(food.buy_unit), u)) {
    return qty * food.buy_unit_g;
  }
  return null;
}

/** A line's grams: its explicit `grams`, else its qty converted. */
function lineGrams(line, food) {
  if (typeof line.grams === 'number') return line.grams;
  return gramsFor(line.qty, line.unit, food);
}

/** kcal, protein, carbs and fat in `grams` of `food`, unrounded. */
function nutrientsOf(food, grams) {
  return {
    kcal: food.kcal_100g * grams / 100,
    protein_g: food.protein_100g * grams / 100,
    carbs_g: food.carbs_100g * grams / 100,
    fat_g: food.fat_100g * grams / 100,
  };
}

/**
 * A recipe's nutrition, per serving, from its lines and the foods they name.
 *
 * Returns `{ per_serving: {kcal, protein_g, carbs_g, fat_g}, missing:
 * [{line_id, reason}], partial, lines: [{line_id, grams, reason}] }`. Optional
 * lines count toward nothing and are left out of `missing`.
 *
 * `reason` is `no_food` (not matched), `no_nutrition` (the food has none) or
 * `no_weight`. Partial is any `no_food`, or `no_weight` on a food with
 * nutrition: a spice with no nutrition is reported but does not make it
 * partial. Each value is rounded to 0.1, and null when no line counted.
 */
function recipeNutrition(lines, servings, foodsById) {
  var total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  var missing = [];
  var perLine = [];
  var partial = false;
  var counted = 0;

  lines.forEach(function (line) {
    var food = line.food_id ? foodsById[line.food_id] || null : null;
    var grams = food || typeof line.grams === 'number' ? lineGrams(line, food) : null;
    var reason = '';

    if (!line.optional) {
      if (!line.food_id || !food) {
        reason = 'no_food';
      } else if (!hasNutrition(food)) {
        reason = 'no_nutrition';
      } else if (grams === null) {
        reason = 'no_weight';
      } else {
        var n = nutrientsOf(food, grams);
        total.kcal += n.kcal;
        total.protein_g += n.protein_g;
        total.carbs_g += n.carbs_g;
        total.fat_g += n.fat_g;
        counted++;
      }
      if (reason) {
        missing.push({ line_id: line.line_id, reason: reason });
        if (reason !== 'no_nutrition') partial = true;
      }
    }
    perLine.push({ line_id: line.line_id, grams: round1(grams), reason: reason });
  });

  // Nothing counted is unknown, not zero.
  var by = typeof servings === 'number' && servings > 0 ? servings : 1;
  var per = function (v) { return counted ? round1(v / by) : null; };
  return {
    per_serving: {
      kcal: per(total.kcal),
      protein_g: per(total.protein_g),
      carbs_g: per(total.carbs_g),
      fat_g: per(total.fat_g),
    },
    missing: missing,
    partial: partial,
    lines: perLine,
  };
}

/**
 * A food log entry's snapshot: `qty` of a named serving or grams of a food.
 * Returns `{ grams, kcal, protein_g, carbs_g, fat_g, partial }`; the values
 * are null and partial true when the food has no nutrition.
 */
function foodEntryNutrition(food, qty, unit) {
  var grams;
  if (canonicalUnit(unit) === 'g') {
    grams = qty;
  } else {
    var serving = foodServings(food).filter(function (s) { return s.name === unit; })[0];
    if (!serving) throw new Error('unit "' + unit + '" is not one of this food\'s servings, or g');
    grams = qty * serving.g;
  }
  if (!hasNutrition(food)) {
    return { grams: round1(grams), kcal: null, protein_g: null, carbs_g: null, fat_g: null, partial: true };
  }
  var n = nutrientsOf(food, grams);
  return {
    grams: round1(grams),
    kcal: round1(n.kcal),
    protein_g: round1(n.protein_g),
    carbs_g: round1(n.carbs_g),
    fat_g: round1(n.fat_g),
    partial: false,
  };
}

/** A recipe entry's snapshot: `qty` servings of the recipe's per-serving values. */
function recipeEntryNutrition(nutrition, qty) {
  var per = nutrition.per_serving;
  var times = function (v) { return v === null ? null : round1(v * qty); };
  return {
    grams: null,
    kcal: times(per.kcal),
    protein_g: times(per.protein_g),
    carbs_g: times(per.carbs_g),
    fat_g: times(per.fat_g),
    partial: nutrition.partial || per.kcal === null,
  };
}
