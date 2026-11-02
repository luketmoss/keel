// Shopping trips (#703, #718): a trip is built from planned recipe meals, one
// item per food, and each item is sorted to Have it or a store, then bought.
// The rules are #710's, carried in #718's body; #719 adds added items, buying
// amounts and late meals on top of these same functions.
//
// - A meal is on a trip when its Plan row's `trip_id` is the trip's id.
//   startTrip sets it, discardTrip clears it, closeTrip leaves it (closed is
//   "Shopped", #709).
// - Stale lines: every read of an open trip, and every trip write, first drops
//   the item lines whose meal is gone or no longer on the trip, and deletes an
//   item left with no lines that is not `mine`. That drop is written, under the
//   lock, but not change-logged (change-log.js runs it before its snapshot). A
//   closed trip is history and is never pruned.
// - What the meals need (`need`), the per-meal breakdown, the counts and the
//   unmatched lines are derived on read, here and nowhere else: the app and
//   the MCP tools only show them.
//
// At most one trip is open.

/** The trip writes, whose stale lines change-log.js prunes before it takes its snapshot. */
var TRIP_WRITES = ['startTrip', 'setTripItem', 'closeTrip', 'discardTrip'];

var TRIP_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A refusal with a code (and fields) the app and the Worker act on. */
function tripError(message, code, extra) {
  var err = new Error(message);
  err.code = code;
  if (extra) err.extra = extra;
  return err;
}

/** `Fri 2026-11-07`. */
function tripDay(date) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell(date));
  if (!m) return cell(date);
  return TRIP_WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] + ' ' + date;
}

function openTrip() {
  return listRecords('Trips', function (t) { return t.status === 'open'; })[0] || null;
}

/** The trip named, or the open one when none is named. Refused when there is no such trip. */
function findTrip(tripId) {
  var id = cell(tripId).trim();
  if (id) {
    var trip = getRecord('Trips', { id: id });
    if (!trip) throw tripError('No trip ' + id + '.', 'not_found');
    return trip;
  }
  var open = openTrip();
  if (!open) throw tripError('No shopping trip is open.', 'no_open_trip');
  return open;
}

function requireOpen(trip) {
  if (trip.status !== 'open') throw tripError('Trip ' + trip.id + ' is closed.', 'trip_closed');
}

// ---------------------------------------------------------------- stale lines

/** What pruning would do to an open trip: items to rewrite with fewer lines, and food ids to delete. */
function staleLines(trip) {
  var onTrip = {};
  listRecords('Plan', function (p) { return p.trip_id === trip.id; }).forEach(function (p) { onTrip[p.id] = true; });
  var changed = [];
  var doomed = [];
  listRecords('TripItems', function (i) { return i.trip_id === trip.id; }).forEach(function (item) {
    var lines = Array.isArray(item.lines_json) ? item.lines_json : [];
    var kept = lines.filter(function (l) { return !!l && onTrip[cell(l.plan_id)]; });
    if (kept.length === lines.length) return;
    if (!kept.length && !item.mine) {
      doomed.push(item.food_id);
    } else {
      item.lines_json = kept;
      changed.push(item);
    }
  });
  return { changed: changed, doomed: doomed };
}

/** Drop an open trip's stale lines (above), writing only when there is something to drop. Answers how many items changed. */
function pruneTrip(trip) {
  if (!trip || trip.status !== 'open') return 0;
  if (!staleCount(staleLines(trip))) return 0;
  return withScriptLock(function () {
    var stale = staleLines(trip);
    stale.changed.forEach(function (item) { upsertRecord('TripItems', item); });
    if (stale.doomed.length) {
      deleteRecordsWhere('TripItems', function (i) {
        return i.trip_id === trip.id && stale.doomed.indexOf(i.food_id) !== -1;
      });
    }
    return staleCount(stale);
  });
}

function staleCount(stale) {
  return stale.changed.length + stale.doomed.length;
}

/** Prune the open trip, if there is one: change-log.js calls this before a trip write's snapshot. */
function pruneOpenTrip() {
  return pruneTrip(openTrip());
}

// ---------------------------------------------------------------- building

/**
 * Why a meal can't join a trip through `through`, or '' when it can: a recipe
 * meal dated after `today` and on or before `through`, on no trip.
 */
function tripIneligible(p, today, through) {
  if (!p.recipe_id) return p.id + ' is a note, not a recipe meal.';
  if (p.trip_id) return p.id + ' is already on trip ' + p.trip_id + '.';
  if (p.date <= today) return p.id + ' is dated ' + p.date + ', today or earlier.';
  if (p.date > through) return p.id + ' is dated ' + p.date + ', after ' + tripDay(through) + '.';
  return '';
}

/** A food's starting choice: Have it for a "usually have" food, else its usual store, else unsorted. */
function defaultTripChoice(food) {
  if (food.usually_have) return 'have';
  return STORES.indexOf(food.usual_store) !== -1 ? food.usual_store : '';
}

/** A line's amount as the source gave it: `2 tbsp`, `1.5 cup`, `2`, or its text when it has no qty. */
function tripLineAmount(line) {
  if (typeof line.qty !== 'number') return cell(line.text).trim();
  var qty = String(Math.round(line.qty * 100) / 100);
  return cell(line.unit).trim() ? qty + ' ' + cell(line.unit).trim() : qty;
}

/** The snapshot a line leaves on its item: `{plan_id, line_id, amt, grams}`, grams blank (null) when unknown. */
function tripLineSnapshot(meal, line, food) {
  var grams = lineGrams(line, food);
  return {
    plan_id: meal.id,
    line_id: line.line_id,
    amt: tripLineAmount(line),
    grams: grams === null ? null : Math.round(grams * 100) / 100,
  };
}

/** A new item for `food` on trip `tripId`, with its default choice and no lines yet. */
function newTripItem(tripId, food) {
  var choice = defaultTripChoice(food);
  return {
    trip_id: tripId, food_id: food.id, lines_json: [], mine: false,
    choice: choice, suggested: choice !== '', buy: '', bought: false,
  };
}

/**
 * The TripItems rows `meals` make on trip `tripId`: one per food, combined
 * across meals, each with its default choice. A line joins its food's item
 * when it has a food, isn't optional, and the food isn't `never_shop`. #719's
 * late meals build with this too.
 *
 * @param {Object[]} meals - Plan rows, in plan order
 * @param {Object} foods - by id
 * @param {Object} linesByRecipe - RecipeLines rows, by recipe id
 */
function buildTripItems(tripId, meals, foods, linesByRecipe) {
  var byFood = {};
  var order = [];
  meals.forEach(function (meal) {
    sortLines(linesByRecipe[meal.recipe_id] || []).forEach(function (line) {
      if (!line.food_id || line.optional) return;
      var food = foods[line.food_id];
      if (!food || food.never_shop) return;
      if (!byFood[food.id]) {
        byFood[food.id] = newTripItem(tripId, food);
        order.push(food.id);
      }
      byFood[food.id].lines_json.push(tripLineSnapshot(meal, line, food));
    });
  });
  return order.map(function (id) { return byFood[id]; });
}

// ---------------------------------------------------------------- reading

/**
 * What the meals need of a food (#710's rule, the prototype's amountText):
 * lines with grams combine to `about N <buy unit>`, N = max(1, ceil(grams ÷
 * buy_unit_g − 0.15)), plural above 1, and lines without grams follow as
 * ` + <amt>`. No shopping unit, or no line with grams: the amounts joined by
 * ` + `. Null for an item with no lines (#719's added items).
 */
function tripNeed(lines, food) {
  if (!lines.length) return null;
  var unit = food ? cell(food.buy_unit).trim() : '';
  var unitG = food && typeof food.buy_unit_g === 'number' && food.buy_unit_g > 0 && unit ? food.buy_unit_g : 0;
  var weighed = lines.filter(function (l) { return typeof l.grams === 'number'; });
  var amounts = function (ls) { return ls.map(function (l) { return cell(l.amt); }); };
  if (!unitG || !weighed.length) return amounts(lines).join(' + ');
  var grams = weighed.reduce(function (sum, l) { return sum + l.grams; }, 0);
  // Rounded before the ceiling, so 1.15 units is 1 and not the float's 1.0000000000000002.
  var n = Math.max(1, Math.ceil(Math.round((grams / unitG - 0.15) * 1e6) / 1e6));
  var name = n > 1 ? cell(food.buy_unit_plural).trim() || unit : unit;
  var rest = amounts(lines.filter(function (l) { return typeof l.grams !== 'number'; }));
  return ['about ' + n + ' ' + name].concat(rest).join(' + ');
}

/** Everything a trip's shape reads, each tab once. */
function tripData() {
  var plans = {};
  listRecords('Plan').forEach(function (p) { plans[p.id] = p; });
  var recipes = {};
  listRecords('Recipes').forEach(function (r) { recipes[r.id] = r; });
  return {
    plans: plans,
    recipes: recipes,
    foods: foodsById(),
    linesByRecipe: groupBy(listRecords('RecipeLines'), 'recipe_id'),
  };
}

function tripItemOrder(a, b) {
  if (!a.category !== !b.category) return a.category ? -1 : 1;
  return a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.food_id.localeCompare(b.food_id);
}

/**
 * A trip as getTrip answers it, from its row, its meals and its item rows.
 * `meals` are Plan rows; `items` TripItems rows. Nothing here writes.
 */
function tripShape(trip, meals, items, data) {
  var recipeName = function (p) { return p && data.recipes[p.recipe_id] ? data.recipes[p.recipe_id].name : ''; };
  var recipeLine = function (p, lineId) {
    var lines = p ? data.linesByRecipe[p.recipe_id] || [] : [];
    for (var i = 0; i < lines.length; i++) if (lines[i].line_id === lineId) return lines[i];
    return null;
  };

  var shaped = items.map(function (item) {
    var food = data.foods[item.food_id] || null;
    var lines = Array.isArray(item.lines_json) ? item.lines_json : [];
    return {
      food_id: item.food_id,
      name: food ? displayName(food) : item.food_id,
      category: food ? cell(food.category).trim() : '',
      choice: cell(item.choice),
      suggested: !!item.suggested,
      bought: !!item.bought,
      buy: cell(item.buy),
      mine: !!item.mine,
      need: tripNeed(lines, food),
      lines: lines.map(function (l) {
        var p = data.plans[cell(l.plan_id)] || null;
        var source = recipeLine(p, cell(l.line_id));
        return {
          plan_id: cell(l.plan_id),
          date: p ? p.date : '',
          slot: p ? p.slot : '',
          recipe_name: recipeName(p),
          line_id: cell(l.line_id),
          text: source ? source.text : '',
          amt: cell(l.amt),
        };
      }),
    };
  }).sort(tripItemOrder);

  var counts = { all: shaped.length, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 };
  shaped.forEach(function (i) {
    if (!i.choice) counts.todo++;
    else counts[i.choice]++;
    if (STORES.indexOf(i.choice) !== -1) {
      counts.to_buy++;
      if (i.bought) counts.bought++;
    }
  });

  var unmatched = [];
  meals.forEach(function (p) {
    sortLines(data.linesByRecipe[p.recipe_id] || []).forEach(function (l) {
      if (l.food_id || l.optional) return;
      unmatched.push({ plan_id: p.id, recipe_name: recipeName(p), line_id: l.line_id, text: l.text });
    });
  });

  return {
    id: trip.id,
    status: trip.status,
    through: trip.through,
    created: trip.created,
    closed_at: cell(trip.closed_at),
    meals: meals.map(function (p) {
      return { plan_id: p.id, date: p.date, slot: p.slot, recipe_id: p.recipe_id, recipe_name: recipeName(p) };
    }),
    items: shaped,
    counts: counts,
    unmatched: unmatched,
  };
}

/** A stored trip as getTrip answers it. */
function tripView(trip) {
  var data = tripData();
  var meals = Object.keys(data.plans)
    .map(function (id) { return data.plans[id]; })
    .filter(function (p) { return p.trip_id === trip.id; })
    .sort(planOrder);
  return tripShape(trip, meals, listRecords('TripItems', function (i) { return i.trip_id === trip.id; }), data);
}

/**
 * Trips, newest first, each row with `items` (how many), `bought` (bought
 * items with a store) and `stores` (the stores with at least one item, in
 * King Soopers, Costco, Other order), for "Last trip".
 */
function getTrips(params) {
  var status = validateEnum('status', params && params.status, TRIP_STATUSES, true);
  var items = groupBy(listRecords('TripItems'), 'trip_id');
  return listRecords('Trips', function (t) { return !status || t.status === status; })
    .sort(function (a, b) { return b.created.localeCompare(a.created); })
    .map(function (t) {
      var mine = items[t.id] || [];
      var out = JSON.parse(JSON.stringify(t));
      out.items = mine.length;
      out.bought = mine.filter(function (i) { return i.bought && STORES.indexOf(i.choice) !== -1; }).length;
      out.stores = STORES.filter(function (s) { return mine.some(function (i) { return i.choice === s; }); });
      return out;
    });
}

/**
 * `{ trip }`: the trip `id` names, or the open one when none is named, which
 * may be `null`. An open trip's stale lines are dropped first (written).
 */
function getTrip(params) {
  var id = cell(params && params.id).trim();
  var trip = id ? getRecord('Trips', { id: id }) : openTrip();
  if (id && !trip) throw tripError('No trip ' + id + '.', 'not_found');
  if (!trip) return { trip: null };
  pruneTrip(trip);
  return { trip: tripView(trip) };
}

// ---------------------------------------------------------------- writes

/**
 * Start a trip: `{ through, plan_ids?, today?, id?, dry_run? }`. `plan_ids`
 * defaults to every eligible meal through that date; naming one that isn't
 * eligible refuses the call, every failure named in `problems`. Builds the
 * items with their defaults and sets the meals' `trip_id`. `dry_run` answers
 * the trip it would make and writes nothing. The same `id` again answers the
 * existing trip with `written: false`.
 *
 * @returns {{ trip: Object, written: boolean, dry_run: boolean }}
 */
function startTrip(payload) {
  payload = payload || {};
  var through = validateDate('through', payload.through);
  var today = validateDate('today', payload.today, true) || todayLocal();
  var dryRun = payload.dry_run === true || payload.dry_run === 'true';
  if (payload.plan_ids !== undefined && payload.plan_ids !== null && !Array.isArray(payload.plan_ids)) {
    throw new Error('plan_ids must be a list');
  }

  return withScriptLock(function () {
    var id = idFor(payload.id, ID_PREFIXES.trip);
    var existing = getRecord('Trips', { id: id });
    if (existing) {
      pruneTrip(existing);
      return { trip: tripView(existing), written: false, dry_run: dryRun };
    }
    var open = openTrip();
    if (open) {
      throw tripError('A trip is already open (' + open.id + '). Close it or throw it away first.', 'trip_open', {
        open_trip: open.id,
      });
    }

    var data = tripData();
    var all = Object.keys(data.plans).map(function (k) { return data.plans[k]; });
    var chosen = [];
    if (!Array.isArray(payload.plan_ids)) {
      chosen = all.filter(function (p) { return !tripIneligible(p, today, through); });
    } else {
      var problems = [];
      var seen = {};
      payload.plan_ids.forEach(function (raw) {
        var planId = cell(raw).trim();
        if (seen[planId]) return;
        seen[planId] = true;
        var p = data.plans[planId];
        var why = p ? tripIneligible(p, today, through) : planId + ' is not in the plan.';
        if (why) problems.push({ plan_id: planId, error: why });
        else chosen.push(p);
      });
      if (problems.length) {
        throw tripError(problems.map(function (p) { return p.error; }).join(' '), 'ineligible', { problems: problems });
      }
    }
    chosen.sort(planOrder);

    var now = isoNow();
    var trip = { id: id, status: 'open', through: through, created: now, closed_at: '' };
    var items = buildTripItems(id, chosen, data.foods, data.linesByRecipe);
    if (!dryRun) {
      upsertRecord('Trips', trip);
      appendRecords('TripItems', items);
      chosen.forEach(function (p) {
        p.trip_id = id;
        p.updated = now;
        upsertRecord('Plan', p);
      });
    }
    return { trip: tripShape(trip, chosen, items, data), written: !dryRun, dry_run: dryRun };
  });
}

/**
 * Sort or tick one item: `{ trip_id?, food_id, choice?, bought? }`, the open
 * trip when `trip_id` is left out. An object of named fields, so #719 adds
 * `buy` without changing the shape. A choice clears `suggested`; `have`
 * clears `bought` and never changes the food; a store that differs from the
 * food's `usual_store` becomes it, and the answer says `remembered: true`.
 * `bought` needs a store. Refused, writing nothing, on a closed trip or a
 * food not on it.
 *
 * @returns {{ item: Object, remembered?: true }}
 */
function setTripItem(payload) {
  payload = payload || {};
  var foodId = requireString('food_id', payload.food_id);
  var hasChoice = has(payload, 'choice');
  var hasBought = has(payload, 'bought');
  if (!hasChoice && !hasBought) throw new Error('Send choice or bought.');
  var choice = hasChoice ? validateEnum('choice', payload.choice, TRIP_CHOICES) : null;
  if (hasBought && typeof payload.bought !== 'boolean') throw new Error('bought must be true or false');

  return withScriptLock(function () {
    var trip = findTrip(payload.trip_id);
    requireOpen(trip);
    pruneTrip(trip);
    var stored = getRecord('TripItems', { trip_id: trip.id, food_id: foodId });
    var food = getRecord('Foods', { id: foodId });
    if (!stored) {
      throw tripError((food ? displayName(food) : foodId) + " isn't on trip " + trip.id + '.', 'not_on_trip');
    }
    var item = JSON.parse(JSON.stringify(stored));
    if (choice !== null) {
      item.choice = choice;
      item.suggested = false;
      if (choice === 'have') item.bought = false;
    }
    if (hasBought) {
      if (payload.bought && STORES.indexOf(item.choice) === -1) {
        throw tripError('Only an item with a store can be bought.', 'no_store');
      }
      item.bought = payload.bought;
    }
    var remembered = !!food && STORES.indexOf(choice) !== -1 && food.usual_store !== choice;
    if (remembered) {
      food.usual_store = choice;
      food.updated = isoNow();
      upsertRecord('Foods', food);
    }
    upsertRecord('TripItems', item);
    var out = { item: tripView(trip).items.filter(function (i) { return i.food_id === foodId; })[0] };
    if (remembered) out.remembered = true;
    return out;
  });
}

/** Close the open trip (or `trip_id`): `closed`, `closed_at` now. Unbought items stay as they are; its meals read Shopped. */
function closeTrip(payload) {
  return withScriptLock(function () {
    var trip = findTrip(payload && payload.trip_id);
    if (trip.status !== 'open') throw tripError('Trip ' + trip.id + ' is already closed.', 'trip_closed');
    pruneTrip(trip);
    trip.status = 'closed';
    trip.closed_at = isoNow();
    upsertRecord('Trips', trip);
    return { trip: tripView(trip) };
  });
}

/**
 * Throw the open trip (or `trip_id`) away: its row and items are deleted and
 * its meals' `trip_id` cleared, so they are planned with no trip. A closed
 * trip is history and is refused.
 *
 * @returns {{ discarded: string, meals_cleared: number }}
 */
function discardTrip(payload) {
  return withScriptLock(function () {
    var trip = findTrip(payload && payload.trip_id);
    if (trip.status !== 'open') {
      throw tripError('Trip ' + trip.id + ' is closed; only an open trip can be thrown away.', 'trip_closed');
    }
    var meals = listRecords('Plan', function (p) { return p.trip_id === trip.id; });
    var now = isoNow();
    deleteRecordsWhere('TripItems', function (i) { return i.trip_id === trip.id; });
    meals.forEach(function (p) {
      p.trip_id = '';
      p.updated = now;
      upsertRecord('Plan', p);
    });
    deleteRecord('Trips', { id: trip.id });
    return { discarded: trip.id, meals_cleared: meals.length };
  });
}

function requireTrip(id, field) {
  if (!getRecord('Trips', { id: cell(id) })) {
    throw new Error((field || 'trip_id') + ' "' + cell(id) + '" is not a trip');
  }
}
