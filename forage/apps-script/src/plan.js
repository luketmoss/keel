// The meal plan (#703, #709). Each entry is a recipe or a note (a night out,
// leftovers), never both. `trip_id` is the trip the meal is on; "on the list"
// (its trip open) and "shopped" (its trip closed) are derived, never stored.
//
// #709: reads add each entry's recipe name, servings, kcal a serving and
// partial (nutrition.js's rule), and its trip's status, plus `not_on_trip`,
// the Plan banner's count. This file is the only place that count is made, so
// the app and the MCP tools cannot disagree. Plan writes never touch Trips,
// TripItems or Cooks: what a trip does about a moved or removed meal is #710's.

/** How many days the Plan tab shows, today first. */
var PLAN_DAYS = 8;

/** The most entries one planWeek takes. */
var PLAN_WEEK_MAX = 28;

var PLAN_NOTE_MAX = 120;

/** The fixed text of every plan refusal (#709). Literal: no file may read another's globals at load time. */
var PLAN_ERRORS = {
  date: 'date must be a real date as YYYY-MM-DD',
  slot: 'slot must be one of Breakfast, Lunch, Dinner, Snacks',
  note: 'note must be 1 to ' + PLAN_NOTE_MAX + ' characters',
  one: 'a plan entry has exactly one of recipe_id and note',
};

/**
 * Entries from `from` to `to` inclusive (either optional), ordered by date,
 * slot, then creation, each with its derived fields; and `not_on_trip`.
 * `today` (default today in America/Denver) is the device's day, so the
 * banner counts from the day the app shows.
 *
 * @returns {{ entries: Object[], not_on_trip: number }}
 */
function getPlan(params) {
  params = params || {};
  var from = validateDate('from', params.from, true);
  var to = validateDate('to', params.to, true);
  var today = validateDate('today', params.today, true) || todayLocal();
  var all = listRecords('Plan');
  var view = planViewer(all);
  return {
    entries: all
      .filter(function (p) { return (!from || p.date >= from) && (!to || p.date <= to); })
      .sort(planOrder)
      .map(view),
    not_on_trip: notOnTrip(all, today),
  };
}

/** By date, slot, then the order they were planned: `created`, then row order (the sort is stable). */
function planOrder(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.slot !== b.slot) return SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);
  return cell(a.created).localeCompare(cell(b.created));
}

/**
 * The banner's count: recipe meals dated after `today` and within the days
 * the Plan tab shows, on no trip. A note is never counted, nor today's meals
 * (they can't be shopped for), nor a meal on any trip, open or closed.
 */
function notOnTrip(entries, today) {
  var last = addDaysTo(today, PLAN_DAYS - 1);
  return entries.filter(function (p) {
    return !!p.recipe_id && !p.trip_id && p.date > today && p.date <= last;
  }).length;
}

/** `YYYY-MM-DD` plus whole days, by calendar arithmetic. */
function addDaysTo(date, n) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/**
 * A function from a Plan row to the entry as reads answer it. Reads each tab
 * once, and works out the nutrition of only the recipes the rows use.
 */
function planViewer(rows) {
  var recipes = {};
  listRecords('Recipes').forEach(function (r) { recipes[r.id] = r; });
  var trips = {};
  listRecords('Trips').forEach(function (t) { trips[t.id] = t; });
  var used = {};
  rows.forEach(function (p) { if (p.recipe_id) used[p.recipe_id] = true; });
  var lines = groupBy(listRecords('RecipeLines', function (l) { return !!used[l.recipe_id]; }), 'recipe_id');
  var foods = Object.keys(used).length ? foodsById() : {};
  var nutrition = {};

  return function (p) {
    var out = JSON.parse(JSON.stringify(p));
    var recipe = p.recipe_id ? recipes[p.recipe_id] : null;
    if (recipe && !nutrition[recipe.id]) {
      nutrition[recipe.id] = recipeNutrition(sortLines(lines[recipe.id] || []), recipe.servings, foods);
    }
    var n = recipe ? nutrition[recipe.id] : null;
    out.recipe_name = recipe ? recipe.name : '';
    out.servings = recipe ? recipe.servings : null;
    // Unrounded but for nutrition.js's 0.1: the app rounds for display. Null is unknown, never 0.
    out.kcal_serving = n ? n.per_serving.kcal : null;
    out.partial = n ? n.partial : false;
    var trip = p.trip_id ? trips[p.trip_id] : null;
    out.trip_status = trip ? trip.status : '';
    out.on_trip = !!p.trip_id;
    out.shopped = !!trip && trip.status === 'closed';
    return out;
  };
}

/** One entry as reads answer it. */
function planEntryView(entry) {
  return planViewer([entry])(entry);
}

/**
 * Check and normalise an entry's date, slot and recipe or note, in place.
 * Every refusal is fixed text (PLAN_ERRORS, or the recipe it names).
 */
function validatePlanFields(entry) {
  if (!isRealDate(entry.date)) throw new Error(PLAN_ERRORS.date);
  if (SLOTS.indexOf(entry.slot) === -1) throw new Error(PLAN_ERRORS.slot);
  if (entry.recipe_id !== undefined && entry.recipe_id !== null && typeof entry.recipe_id !== 'string') {
    throw new Error('recipe_id must be text');
  }
  if (entry.note !== undefined && entry.note !== null && typeof entry.note !== 'string') {
    throw new Error(PLAN_ERRORS.note);
  }
  var recipeId = cell(entry.recipe_id).trim();
  var hasNote = entry.note !== undefined && entry.note !== null && entry.note !== '';
  if (!!recipeId === hasNote) throw new Error(PLAN_ERRORS.one);
  var note = cell(entry.note).trim();
  if (hasNote && (note.length < 1 || note.length > PLAN_NOTE_MAX)) throw new Error(PLAN_ERRORS.note);
  if (recipeId) requireRecipe(recipeId);
  entry.recipe_id = recipeId;
  entry.note = note;
}

function isRealDate(value) {
  try {
    validateDate('date', value);
    return true;
  } catch (err) {
    return false;
  }
}

/** The entry planned for this date and slot with this recipe, or null. Notes are never duplicates. */
function findDuplicate(entries, entry) {
  if (!entry.recipe_id) return null;
  for (var i = 0; i < entries.length; i++) {
    var p = entries[i];
    if (p.date === entry.date && p.slot === entry.slot && p.recipe_id === entry.recipe_id) return p;
  }
  return null;
}

/** A refusal for a create that would repeat a meal: the existing entry, and nothing written. */
function duplicateRefusal(existing) {
  var view = planEntryView(existing);
  var err = new Error(
    'Already planned: ' + view.recipe_name + ' on ' + view.date + ', ' + view.slot + ' (' + view.id + ')',
  );
  err.code = 'duplicate';
  err.extra = { duplicate_of: view, written: false };
  return err;
}

/**
 * Create an entry, or merge the fields sent into the one with that `id`. A
 * create with no `id` for a date, slot and recipe that already has an entry
 * writes nothing and is refused with `duplicate_of`, unless `allow_duplicate`.
 */
function upsertPlanEntry(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a plan entry');
  return withScriptLock(function () {
    var existing = payload.id ? getRecord('Plan', { id: cell(payload.id) }) : null;
    var entry = existing ? JSON.parse(JSON.stringify(existing)) : {};
    entry.id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.plan);
    ['date', 'slot', 'recipe_id', 'note', 'trip_id'].forEach(function (f) {
      if (has(payload, f)) entry[f] = payload[f];
    });
    validatePlanFields(entry);
    entry.trip_id = cell(entry.trip_id).trim();
    if (entry.trip_id) requireTrip(entry.trip_id);

    if (!payload.id && payload.allow_duplicate !== true) {
      var dup = findDuplicate(listRecords('Plan'), entry);
      if (dup) throw duplicateRefusal(dup);
    }

    var now = isoNow();
    entry.created = existing ? existing.created : now;
    entry.updated = now;
    return planEntryView(upsertRecord('Plan', entry));
  });
}

/**
 * Change an existing entry's date, slot or note, leaving the rest. Refused for
 * an id that is not in the plan, which an upsert would otherwise recreate.
 */
function movePlanEntry(payload) {
  var id = requireString('id', payload && payload.id);
  return withScriptLock(function () {
    var existing = getRecord('Plan', { id: id });
    if (!existing) throw planNotFound(id);
    var entry = JSON.parse(JSON.stringify(existing));
    ['date', 'slot', 'note'].forEach(function (f) {
      if (has(payload, f)) entry[f] = payload[f];
    });
    validatePlanFields(entry);
    entry.updated = isoNow();
    return planEntryView(upsertRecord('Plan', entry));
  });
}

/** Remove an entry. Answers it as it was, so a caller can say what went. */
function deletePlanEntry(payload) {
  var id = requireString('id', payload && payload.id);
  return withScriptLock(function () {
    var existing = getRecord('Plan', { id: id });
    if (!existing) throw planNotFound(id);
    var view = planEntryView(existing);
    deleteRecord('Plan', { id: id });
    view.deleted = true;
    return view;
  });
}

function planNotFound(id) {
  var err = new Error('Plan entry "' + id + '" not found');
  err.code = 'not_found';
  return err;
}

/**
 * Plan up to 28 meals at once: `{ entries: [{ date, slot, recipe_id | note,
 * id? }], dry_run (default true), allow_duplicate }`. Every entry is checked
 * before anything is written, and one that fails refuses them all, each
 * failure named in `problems`. An entry with no id that repeats a meal
 * already planned (or an earlier entry in the same call) is skipped, unless
 * allow_duplicate. Only adds: nothing in the range is removed or replaced.
 *
 * @returns {{ dry_run: boolean, entries: Object[], planned: number, skipped: number }}
 */
function planWeek(payload) {
  payload = payload || {};
  var list = payload.entries;
  if (!Array.isArray(list) || list.length === 0) throw new Error('entries must be a list of 1 to ' + PLAN_WEEK_MAX);
  if (list.length > PLAN_WEEK_MAX) {
    throw new Error(list.length + ' entries is over the limit of ' + PLAN_WEEK_MAX);
  }
  var dryRun = payload.dry_run !== false && payload.dry_run !== 'false';
  var allowDuplicate = payload.allow_duplicate === true;

  return withScriptLock(function () {
    var stored = listRecords('Plan');
    var problems = [];
    var seen = stored.slice();
    var now = isoNow();
    var planned = list.map(function (raw, i) {
      var entry = { date: '', slot: '', recipe_id: '', note: '' };
      try {
        if (!raw || typeof raw !== 'object') throw new Error('each entry must be an object');
        ['date', 'slot', 'recipe_id', 'note'].forEach(function (f) { if (has(raw, f)) entry[f] = raw[f]; });
        var existing = raw.id ? getRecord('Plan', { id: cell(raw.id) }) : null;
        entry.id = existing ? existing.id : idFor(raw.id, ID_PREFIXES.plan);
        validatePlanFields(entry);
        entry.trip_id = existing ? existing.trip_id : '';
        entry.created = existing ? existing.created : now;
        entry.updated = now;
        var dup = !raw.id && !allowDuplicate ? findDuplicate(seen, entry) : null;
        if (!dup) seen.push(entry);
        return { entry: entry, duplicate_of: dup ? dup.id : '', replaces: !!existing };
      } catch (err) {
        problems.push({ entry: i + 1, date: cell(raw && raw.date), error: err.message });
        return null;
      }
    });
    if (problems.length) {
      var refusal = new Error('Nothing saved: ' + problems.map(function (p) {
        return 'entry ' + p.entry + ' (' + p.date + '): ' + p.error;
      }).join('; '));
      refusal.code = 'invalid_entries';
      refusal.extra = { problems: problems };
      throw refusal;
    }

    var toWrite = planned.filter(function (p) { return !p.duplicate_of; });
    if (!dryRun) {
      appendRecords('Plan', toWrite.filter(function (p) { return !p.replaces; }).map(function (p) { return p.entry; }));
      toWrite.filter(function (p) { return p.replaces; }).forEach(function (p) { upsertRecord('Plan', p.entry); });
    }
    var view = planViewer(planned.map(function (p) { return p.entry; }));
    return {
      dry_run: dryRun,
      entries: planned.map(function (p) {
        var out = view(p.entry);
        out.duplicate_of = p.duplicate_of;
        out.skipped = !!p.duplicate_of;
        return out;
      }),
      planned: toWrite.length,
      skipped: planned.length - toWrite.length,
    };
  });
}

function requirePlanEntry(id, field) {
  if (!getRecord('Plan', { id: cell(id) })) {
    throw new Error((field || 'plan_id') + ' "' + cell(id) + '" is not a plan entry');
  }
}
