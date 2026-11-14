// Usuals (#877): a meal the owner eats on repeat, with a part that may vary. A
// usual is written whole, like a recipe: the Usuals row plus all its
// UsualLines, replaced together.
//
// A line is **Always** (`food_id`, `qty`, `unit`; `options_json` blank) or a
// **pick-one** (`food_id`, `qty`, `unit` blank; `options_json` is 2 to 12
// `{food_id, qty, unit}` of distinct foods, each with its own amount, because
// brands and fruits come in different units). `last_pick` is the food id of the
// option picked last, the default next time; blank means the first option.
//
// `line_id` (L1, L2...) is stable for the life of the usual: a replace keeps
// the ids sent and numbers new lines after the highest the usual has used.
//
// Logging a usual, groups and the log's `usual_id` columns are #878's. Until
// they exist `used_count` is 0 and `last_used` null; deleting a usual then has
// no FoodLog rows to unlink, and #878 adds that to `deleteUsual` with the columns.

var MAX_USUAL_NAME = 120;
var MIN_USUAL_OPTIONS = 2;
var MAX_USUAL_OPTIONS = 12;

/**
 * Every usual, optionally those for `slot`, each as `getUsual` answers it,
 * most recently used first, then by name.
 */
function getUsuals(params) {
  params = params || {};
  var slot = validateEnum('slot', cell(params.slot).trim(), SLOTS, true);
  var foods = foodsById();
  var lines = groupBy(listRecords('UsualLines'), 'usual_id');
  var uses = usualUses();
  return listRecords('Usuals', function (u) { return !slot || u.slot === slot; })
    .map(function (u) { return usualShape(u, lines[u.id] || [], foods, uses[u.id]); })
    .sort(function (a, b) {
      if (a.last_used !== b.last_used) {
        if (a.last_used === null) return 1;
        if (b.last_used === null) return -1;
        return a.last_used < b.last_used ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });
}

/** One usual, with its lines, use count and starting nutrition. */
function getUsual(id) {
  var usual = getRecord('Usuals', { id: cell(id) });
  if (!usual) throw new Error('Usual "' + cell(id) + '" not found');
  var lines = listRecords('UsualLines', function (l) { return l.usual_id === usual.id; });
  return usualShape(usual, lines, foodsById(), usualUses()[usual.id]);
}

/** A usual as the API answers it. `use` is `{ count, last }` or undefined. */
function usualShape(usual, lines, foods, use) {
  var out = {
    id: usual.id,
    name: usual.name,
    slot: usual.slot,
    created: usual.created,
    updated: usual.updated,
    lines: sortLines(lines).map(function (l) {
      var options = Array.isArray(l.options_json) ? l.options_json : null;
      return {
        line_id: l.line_id,
        position: l.position,
        food_id: l.food_id,
        qty: l.qty,
        unit: l.unit,
        options: options,
        last_pick: l.last_pick,
      };
    }),
    used_count: use ? use.count : 0,
    last_used: use ? use.last : null,
  };
  out.start = usualNutrition(out.lines, foods);
  return out;
}

/**
 * How often each usual was logged, from FoodLog rows with its `usual_id`: by
 * usual id, `{ count, last }`, count being the distinct date and meal pairs it
 * was logged to. The column arrives in #878; without it nothing was used.
 */
function usualUses() {
  var out = {};
  if (FOOD_LOG_FIELDS.indexOf('usual_id') === -1) return out;
  var seen = {};
  listRecords('FoodLog', function (l) { return !!l.usual_id; }).forEach(function (l) {
    var use = out[l.usual_id] = out[l.usual_id] || { count: 0, last: null };
    var key = l.usual_id + '|' + l.date + '|' + l.slot;
    if (!seen[key]) {
      seen[key] = true;
      use.count++;
    }
    if (use.last === null || l.date > use.last) use.last = l.date;
  });
  return out;
}

/** The usuals whose lines or options name the food, as `{ id, name }`, sorted by name. */
function usualsUsing(foodId) {
  var ids = unique(listRecords('UsualLines', function (l) {
    return l.food_id === foodId ||
      (Array.isArray(l.options_json) && l.options_json.some(function (o) { return o && o.food_id === foodId; }));
  }).map(function (l) { return l.usual_id; }));
  if (!ids.length) return [];
  var names = {};
  listRecords('Usuals').forEach(function (u) { names[u.id] = u.name; });
  return ids.map(function (id) { return { id: id, name: names[id] || id }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/**
 * Create a usual, or replace the one with that `id`, and all its lines.
 * Payload `{ id?, name, slot, lines: [{ line_id?, food_id?, qty?, unit?,
 * options?: [{food_id, qty, unit}], last_pick? }] }`. Zero lines is allowed.
 * `lines` left out of a replace keeps the stored lines. Every refusal names
 * the field and nothing is written.
 */
function upsertUsual(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a usual');
  var existing = payload.id ? getRecord('Usuals', { id: cell(payload.id) }) : null;
  var id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.usual);

  var name = requireString('name', payload.name);
  if (name.length > MAX_USUAL_NAME) throw new Error('name must be at most ' + MAX_USUAL_NAME + ' characters');
  var slot = validateEnum('slot', payload.slot, SLOTS);

  var lines = null;
  if (has(payload, 'lines')) {
    if (!Array.isArray(payload.lines)) throw new Error('lines must be a list');
    var foods = foodsById();
    lines = payload.lines.map(function (line, i) { return normalizeUsualLine(line, i, foods); });
    numberUsualLines(lines, existing ? id : null);
  }

  return withScriptLock(function () {
    var now = isoNow();
    upsertRecord('Usuals', { id: id, name: name, slot: slot, created: existing ? existing.created : now, updated: now });
    if (lines) {
      deleteRecordsWhere('UsualLines', function (l) { return l.usual_id === id; });
      lines.forEach(function (l) { l.usual_id = id; });
      appendRecords('UsualLines', lines);
    }
    return getUsual(id);
  });
}

/**
 * One line as stored, checked against the foods. `i` is its place in the list,
 * so a refusal reads `lines[2].qty ...`. Its `line_id` is as sent, or blank.
 */
function normalizeUsualLine(line, i, foods) {
  var at = 'lines[' + (i + 1) + ']';
  if (!line || typeof line !== 'object') throw new Error(at + ' must be an object');
  var lineId = cell(line.line_id).trim();
  if (lineId && !/^L\d+$/.test(lineId)) throw new Error(at + '.line_id must look like L1, L2...');
  var row = {
    usual_id: '', line_id: lineId, position: i + 1,
    food_id: '', qty: null, unit: '', options_json: null, last_pick: '',
  };
  var hasOptions = line.options !== undefined && line.options !== null;
  var always = ['food_id', 'qty', 'unit'].filter(function (f) { return !isBlank(line[f]); });

  if (!hasOptions) {
    if (!isBlank(line.last_pick)) throw new Error(at + '.last_pick is only for a pick-one line (one with options)');
    var amount = usualAmount(line, at, foods);
    row.food_id = amount.food_id;
    row.qty = amount.qty;
    row.unit = amount.unit;
    return row;
  }

  if (always.length) {
    throw new Error(at + ' is a pick-one, so ' + always.join(', ') + ' must be blank: each option carries its own amount');
  }
  if (!Array.isArray(line.options)) throw new Error(at + '.options must be a list');
  var n = line.options.length;
  if (n < MIN_USUAL_OPTIONS || n > MAX_USUAL_OPTIONS) {
    throw new Error(at + '.options must have ' + MIN_USUAL_OPTIONS + ' to ' + MAX_USUAL_OPTIONS + ' options, not ' + n);
  }
  var seen = {};
  row.options_json = line.options.map(function (o, j) {
    var optAt = at + '.options[' + (j + 1) + ']';
    if (!o || typeof o !== 'object') throw new Error(optAt + ' must be an object');
    var amountOf = usualAmount(o, optAt, foods);
    if (seen[amountOf.food_id]) {
      throw new Error(optAt + '.food_id "' + amountOf.food_id + '" is already an option; options must be distinct foods');
    }
    seen[amountOf.food_id] = true;
    return amountOf;
  });
  var pick = cell(line.last_pick).trim();
  if (pick && !seen[pick]) throw new Error(at + '.last_pick "' + pick + '" is not one of its options');
  row.last_pick = pick;
  return row;
}

/**
 * `{ food_id, qty, unit }` checked: the food exists, `qty` is over 0, and
 * `unit` is one of the food's serving names exactly, or g.
 */
function usualAmount(source, at, foods) {
  var foodId = cell(source.food_id).trim();
  if (!foodId) throw new Error(at + '.food_id is required');
  var food = foods[foodId];
  if (!food) throw new Error(at + '.food_id "' + foodId + '" is not a food');
  var qty = optionalNumber(at + '.qty', source.qty, { positive: true });
  if (qty === null) throw new Error(at + '.qty is required');
  var unit = cell(source.unit).trim();
  if (!unit) throw new Error(at + '.unit is required');
  if (canonicalUnit(unit) === 'g') {
    unit = 'g';
  } else if (!foodServings(food).some(function (s) { return s.name === unit; })) {
    var names = foodServings(food).map(function (s) { return s.name; });
    throw new Error(at + '.unit "' + unit + '" is not one of ' + displayName(food) + "'s servings (" +
      (names.length ? names.join(', ') + ', ' : '') + 'or g)');
  }
  return { food_id: foodId, qty: qty, unit: unit };
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Give each line without an id the next number after the highest the caller
 * sent or the usual has stored, so a removed line's id is not reused while a
 * newer one exists.
 */
function numberUsualLines(lines, usualId) {
  var seen = {};
  var max = 0;
  var bump = function (id) { var n = Number(id.slice(1)); if (n > max) max = n; };
  lines.forEach(function (l) {
    if (!l.line_id) return;
    if (seen[l.line_id]) throw new Error('line_id ' + l.line_id + ' is sent twice');
    seen[l.line_id] = true;
    bump(l.line_id);
  });
  if (usualId) {
    listRecords('UsualLines', function (l) { return l.usual_id === usualId; })
      .forEach(function (l) { bump(l.line_id); });
  }
  lines.forEach(function (l) { if (!l.line_id) l.line_id = 'L' + (++max); });
}

/**
 * Delete a usual and its lines. Logged entries that came from it stay, with
 * their group (#878 clears their `usual_id` once the column exists).
 */
function deleteUsual(payload) {
  var id = requireString('id', payload && payload.id);
  if (!getRecord('Usuals', { id: id })) throw new Error('Usual "' + id + '" not found');
  return withScriptLock(function () {
    deleteRecordsWhere('UsualLines', function (l) { return l.usual_id === id; });
    deleteRecord('Usuals', { id: id });
    return { id: id, deleted: true };
  });
}
