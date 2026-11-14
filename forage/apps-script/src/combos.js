// Combos (#879): food sets the owner keeps eating together, found in the food
// log and offered as a starting point for a usual. Nothing is stored: every
// `getCombos` reads FoodLog again. The only thing written is the list of keys the
// owner hid, `Config.hidden_combos` (a JSON array of text).
//
// Detection, in order (`stats` carries the count after each step):
//   1. meals: entries of the last `days` days, today excluded, grouped by date
//      and slot into a set of distinct foods; recipe entries are ignored. A meal
//      with more than 12 foods keeps its 12 most-logged, to bound the work.
//   2. sets: every set of 2 to 5 of a meal's foods, counted by the distinct
//      meals it appears in.
//   3. kept: the sets in 3 or more meals.
//   4. after_inner: a kept set is dropped when a larger kept set contains it and
//      appears in at least 80% as many meals.
//   5. joined: sets of the same size, 3 or more foods, that share all but one
//      food become one combo, the shared foods fixed and the differing foods a
//      pick-one. The joined sets, and the shared set itself, are removed. The
//      count is the combos left after this step.
//   6. covered: combos whose every food is in one usual's lines or options.
//   7. hidden: combos whose key is in `Config.hidden_combos`.
//   `returned` is what is left, after `limit`.

var COMBO_DEFAULT_DAYS = 60;
var COMBO_MIN_MEALS = 3;
var COMBO_MIN_SET = 2;
var COMBO_MAX_SET = 5;
var COMBO_MIN_JOIN_SET = 3;
var COMBO_MAX_MEAL_FOODS = 12;
var COMBO_MAX_KEY = 1000;
var HIDDEN_COMBOS_KEY = 'hidden_combos';

/**
 * The combos found in the log. Params `{ slot?, days? = 60, limit? }`. Answers
 * `{ combos, stats }`: most meals first, then latest first, those for `slot` ahead of the rest.
 */
function getCombos(params) {
  params = params || {};
  var slot = validateEnum('slot', cell(params.slot).trim(), SLOTS, true);
  var days = optionalNumber('days', params.days, { min: 1, integer: true });
  if (days === null) days = COMBO_DEFAULT_DAYS;
  var limit = optionalNumber('limit', params.limit, { min: 1, integer: true });

  var today = todayLocal();
  var meals = comboMeals(addDaysTo(today, -days), today);
  var stats = { meals: meals.length, sets: 0, kept: 0, after_inner: 0, joined: 0, covered: 0, hidden: 0, returned: 0 };

  var counted = countSets(meals);
  stats.sets = counted.length;
  var kept = counted.filter(function (s) { return s.meals.length >= COMBO_MIN_MEALS; });
  stats.kept = kept.length;
  var closed = dropInnerSets(kept);
  stats.after_inner = closed.length;
  var candidates = joinSets(closed);
  stats.joined = candidates.length;

  var foods = foodsById();
  var found = candidates.map(function (c) { return buildCombo(c, meals, foods); });

  var covers = usualFoodSets();
  var hidden = {};
  readHiddenCombos().forEach(function (k) { hidden[k] = true; });
  var shown = [];
  found.forEach(function (c) {
    if (isCovered(c, covers)) stats.covered++;
    else if (hidden[c.key]) stats.hidden++;
    else shown.push(c);
  });

  shown.sort(function (a, b) {
    if (slot && (a.slot === slot) !== (b.slot === slot)) return a.slot === slot ? -1 : 1;
    if (a.meals !== b.meals) return b.meals - a.meals;
    if (a.last_date !== b.last_date) return a.last_date < b.last_date ? 1 : -1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  if (limit !== null) shown = shown.slice(0, limit);
  stats.returned = shown.length;
  return { combos: shown, stats: stats };
}

/**
 * The food meals in `[from, to)` as `{ date, slot, foodIds, entries }`, newest
 * first. `foodIds` are the distinct foods in log order and `entries` the
 * `{ qty, unit }` logged for each, in log order.
 */
function comboMeals(from, to) {
  var byMeal = {};
  var order = [];
  listRecords('FoodLog', function (e) {
    return !!e.food_id && e.date >= from && e.date < to;
  }).forEach(function (e) {
    var key = e.date + '|' + e.slot;
    var meal = byMeal[key];
    if (!meal) {
      meal = byMeal[key] = { date: e.date, slot: e.slot, foodIds: [], entries: {}, has: {} };
      order.push(meal);
    }
    if (!meal.has[e.food_id]) {
      meal.has[e.food_id] = true;
      meal.foodIds.push(e.food_id);
      meal.entries[e.food_id] = [];
    }
    meal.entries[e.food_id].push({ qty: e.qty, unit: e.unit });
  });
  return order.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
  });
}

/**
 * Every set of 2 to 5 foods any meal holds, as `{ key, foods, meals }`: `foods`
 * sorted ids, `meals` the indexes (into `meals`) of the distinct meals holding it.
 */
function countSets(meals) {
  var perFood = {};
  meals.forEach(function (m) {
    m.foodIds.forEach(function (f) { perFood[f] = (perFood[f] || 0) + 1; });
  });
  var bySet = {};
  var out = [];
  meals.forEach(function (meal, mi) {
    var foods = meal.foodIds.slice();
    if (foods.length > COMBO_MAX_MEAL_FOODS) {
      foods.sort(function (a, b) { return perFood[b] - perFood[a] || (a < b ? -1 : 1); });
      foods = foods.slice(0, COMBO_MAX_MEAL_FOODS);
    }
    foods.sort();
    var chosen = [];
    var walk = function (start) {
      if (chosen.length >= COMBO_MIN_SET) {
        var key = chosen.join('+');
        var s = bySet[key];
        if (!s) {
          s = bySet[key] = { key: key, foods: chosen.slice(), meals: [] };
          out.push(s);
        }
        s.meals.push(mi);
      }
      if (chosen.length === COMBO_MAX_SET) return;
      for (var i = start; i < foods.length; i++) {
        chosen.push(foods[i]);
        walk(i + 1);
        chosen.pop();
      }
    };
    walk(0);
  });
  return out;
}

/** Drop each set a larger set contains that appears in at least 80% as many meals. */
function dropInnerSets(kept) {
  var byFood = {};
  kept.forEach(function (s) {
    s.has = {};
    s.foods.forEach(function (f) {
      s.has[f] = true;
      (byFood[f] = byFood[f] || []).push(s);
    });
  });
  return kept.filter(function (x) {
    var rare = x.foods[0];
    x.foods.forEach(function (f) { if (byFood[f].length < byFood[rare].length) rare = f; });
    var supers = byFood[rare];
    for (var i = 0; i < supers.length; i++) {
      var t = supers[i];
      if (t.foods.length > x.foods.length && t.meals.length * 5 >= x.meals.length * 4 &&
          x.foods.every(function (f) { return t.has[f]; })) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Join sets of the same size, 3 or more foods, that share all but one food.
 * Answers candidates `{ fixed, options, meals }`: `options` is null for a set
 * left alone, `meals` the sorted meal indexes (the union for a join).
 */
function joinSets(closed) {
  var buckets = {};
  var order = [];
  closed.forEach(function (s) {
    if (s.foods.length < COMBO_MIN_JOIN_SET) return;
    s.foods.forEach(function (f, i) {
      var core = s.foods.slice(0, i).concat(s.foods.slice(i + 1));
      var ck = core.join('+');
      var b = buckets[ck];
      if (!b) {
        b = buckets[ck] = { key: ck, core: core, members: [] };
        order.push(b);
      }
      b.members.push({ set: s, option: f });
    });
  });

  var used = {};
  var out = [];
  order.forEach(function (b) {
    if (b.members.length < 2) return;
    used[b.key] = true;
    var union = {};
    b.members.forEach(function (m) {
      used[m.set.key] = true;
      m.set.meals.forEach(function (mi) { union[mi] = true; });
    });
    out.push({
      fixed: b.core,
      options: b.members.map(function (m) { return m.option; }),
      meals: Object.keys(union).map(Number).sort(function (x, y) { return x - y; }),
    });
  });
  closed.forEach(function (s) {
    if (!used[s.key]) out.push({ fixed: s.foods, options: null, meals: s.meals });
  });
  return out;
}

/** A candidate as the API answers a combo. `meals` are newest first, so index 0 is the latest. */
function buildCombo(c, meals, foods) {
  var idx = c.meals;
  var latest = meals[idx[0]];
  var label = function (id) {
    var food = foods[id];
    return (food && (cell(food.short_name).trim() || displayName(food))) || id;
  };

  var fixed = c.fixed.slice().sort(function (a, b) {
    return latest.foodIds.indexOf(a) - latest.foodIds.indexOf(b);
  });
  var lines = fixed.map(function (f) { return comboAmount(f, idx, meals); });

  var key = c.fixed.slice().sort().join('+');
  var name = fixed.map(label).join(' + ');
  if (c.options) {
    var counts = {};
    c.options.forEach(function (o) {
      counts[o] = idx.filter(function (mi) { return meals[mi].has[o]; }).length;
    });
    var options = c.options.slice().sort(function (a, b) {
      return counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0);
    });
    var pick = options[0];
    for (var i = 0; i < idx.length; i++) {
      var inMeal = options.filter(function (o) { return meals[idx[i]].has[o]; });
      if (inMeal.length) {
        pick = inMeal[0];
        break;
      }
    }
    lines.push({ options: options.map(function (o) { return comboAmount(o, idx, meals); }), default: pick });
    key += '|' + options.slice().sort().join('/');
    name += ' + ' + options.map(label).join(' / ');
  }

  var slots = {};
  var slotOrder = [];
  idx.forEach(function (mi) {
    var s = meals[mi].slot;
    if (!slots[s]) {
      slots[s] = 0;
      slotOrder.push(s);
    }
    slots[s]++;
  });
  var slot = slotOrder[0];
  slotOrder.forEach(function (s) { if (slots[s] > slots[slot]) slot = s; });

  return {
    key: key,
    name: name,
    slot: slot,
    meals: idx.length,
    last_date: latest.date,
    lines: lines,
    meal_dates: idx.map(function (mi) { return { date: meals[mi].date, slot: meals[mi].slot }; }),
  };
}

/**
 * A food's `{ food_id, qty, unit }` over these meals: the unit it was most often
 * logged in (a tie goes to the more recent), and its median amount in that unit.
 */
function comboAmount(foodId, idx, meals) {
  var byUnit = {};
  var units = [];
  idx.forEach(function (mi) {
    (meals[mi].entries[foodId] || []).forEach(function (e) {
      if (e.qty === null || !(e.qty > 0) || !e.unit) return;
      if (!byUnit[e.unit]) {
        byUnit[e.unit] = [];
        units.push(e.unit);
      }
      byUnit[e.unit].push(e.qty);
    });
  });
  var unit = units[0];
  units.forEach(function (u) { if (byUnit[u].length > byUnit[unit].length) unit = u; });
  if (unit === undefined) return { food_id: foodId, qty: 1, unit: 'g' };
  return { food_id: foodId, qty: medianOf(byUnit[unit]), unit: unit };
}

/** The median, the mean of the middle two for an even count, to 3 decimals. */
function medianOf(values) {
  var v = values.slice().sort(function (a, b) { return a - b; });
  var m = v.length >> 1;
  var mid = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return Math.round(mid * 1000) / 1000;
}

/** Each usual's foods, its lines' and their options', as a set: only usuals with lines. */
function usualFoodSets() {
  var sets = {};
  listRecords('UsualLines').forEach(function (l) {
    var set = sets[l.usual_id] = sets[l.usual_id] || {};
    if (l.food_id) set[l.food_id] = true;
    if (Array.isArray(l.options_json)) {
      l.options_json.forEach(function (o) { if (o && o.food_id) set[o.food_id] = true; });
    }
  });
  return Object.keys(sets).map(function (id) { return sets[id]; });
}

/** Whether one usual's lines and options hold every food of the combo. */
function isCovered(combo, covers) {
  var ids = [];
  combo.lines.forEach(function (l) {
    if (l.options) l.options.forEach(function (o) { ids.push(o.food_id); });
    else ids.push(l.food_id);
  });
  return covers.some(function (set) {
    return ids.every(function (id) { return set[id]; });
  });
}

/** The hidden keys, from `Config.hidden_combos`; anything that is not a list of text reads as none. */
function readHiddenCombos() {
  var row = getRecord('Config', { key: HIDDEN_COMBOS_KEY });
  var list = row ? parseJsonCell(row.value) : null;
  if (!Array.isArray(list)) return [];
  return list.filter(function (k) { return typeof k === 'string' && k !== ''; });
}

function writeHiddenCombos(keys) {
  upsertRecord('Config', { key: HIDDEN_COMBOS_KEY, value: JSON.stringify(keys), updated: isoNow() });
}

/** Hide a combo: add its key to `Config.hidden_combos`. Payload `{ key }`. Answers `{ hidden }`, every hidden key. */
function hideCombo(payload) {
  var key = requireString('key', payload && payload.key);
  if (key.length > COMBO_MAX_KEY) throw new Error('key must be at most ' + COMBO_MAX_KEY + ' characters');
  return withScriptLock(function () {
    var hidden = readHiddenCombos();
    if (hidden.indexOf(key) === -1) {
      hidden.push(key);
      writeHiddenCombos(hidden);
    }
    return { hidden: hidden };
  });
}

/**
 * Show hidden combos again: the `keys` given, or every one when `keys` is left
 * out. A key that is not hidden is ignored. Answers `{ hidden }`, what is still hidden.
 */
function unhideCombos(payload) {
  var keys = payload && payload.keys;
  if (keys !== undefined && keys !== null) {
    if (!Array.isArray(keys) || keys.some(function (k) { return typeof k !== 'string'; })) {
      throw new Error('keys must be a list of combo keys');
    }
  }
  return withScriptLock(function () {
    var hidden = readHiddenCombos();
    var left = keys === undefined || keys === null
      ? []
      : hidden.filter(function (k) { return keys.indexOf(k) === -1; });
    if (left.length !== hidden.length) writeHiddenCombos(left);
    return { hidden: left };
  });
}
