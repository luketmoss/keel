// Shopping trips (#703, #718): a trip is built from planned recipe meals, one
// item per food, and each item is sorted to Have it or a store, then bought.
// The rules are #710's, carried in #718's body; #719 adds added items, buying
// amounts and late meals on top of these same functions (addToTrip,
// removeTripItem, `buy` on setTripItem, the last-buy write in closeTrip).
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
//   the MCP tools only show them. So are late meals (#719): recipe meals
//   after today and through the open trip's `through`, on no trip.
//
// At most one trip is open.

/** The trip writes, whose stale lines change-log.js prunes before it takes its snapshot. */
var TRIP_WRITES = ['startTrip', 'setTripItem', 'closeTrip', 'discardTrip', 'addToTrip', 'removeTripItem'];

/** The longest buying amount (#719). */
var TRIP_BUY_MAX = 60;

/** The longest name a free-text item gets (#719). */
var TRIP_ITEM_NAME_MAX = 80;

/** #719's fixed refusals. */
var TRIP_CLOSED = 'That trip is closed.';
var TRIP_ADD_ONE = 'Give one of food_id, text or late_meals.';
var TRIP_ITEM_NAME = 'Give the item a name of 1 to ' + TRIP_ITEM_NAME_MAX + ' characters.';

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

/** Refuse a closed trip: #718's `Trip tr_… is closed.`, or `message` (#719's `That trip is closed.`). */
function requireOpen(trip, message) {
  if (trip.status !== 'open') throw tripError(message || 'Trip ' + trip.id + ' is closed.', 'trip_closed');
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
 * An item added by hand (#719): `mine`, no lines, the food's usual store as a
 * suggested choice (never Have it: you added it because you want it), and its
 * last bought amount as the buying amount.
 */
function newAddedItem(tripId, food) {
  var choice = STORES.indexOf(food.usual_store) !== -1 ? food.usual_store : '';
  return {
    trip_id: tripId, food_id: food.id, lines_json: [], mine: true,
    choice: choice, suggested: choice !== '', buy: cell(food.last_buy).trim(), bought: false,
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
 * The late meals of an open trip (#719): recipe meals dated after `today` and
 * on or before its `through`, on no trip, by date then slot. None for a closed
 * trip. `plans` are Plan rows; `recipes` by id. Answers the Plan rows.
 */
function lateMealRows(trip, today, plans) {
  if (!trip || trip.status !== 'open') return [];
  return plans.filter(function (p) {
    return !!p.recipe_id && !p.trip_id && p.date > today && p.date <= trip.through;
  }).sort(planOrder);
}

/** Late meals as getTrip and getPlan answer them: `[{plan_id, recipe_name, date, slot}]`. */
function lateMealsView(rows, recipes) {
  return rows.map(function (p) {
    return { plan_id: p.id, recipe_name: recipes[p.recipe_id] ? recipes[p.recipe_id].name : '', date: p.date, slot: p.slot };
  });
}

/** A food's pack sizes as a list of text, or []. */
function foodPacks(food) {
  return food && Array.isArray(food.packs_json) ? food.packs_json.map(cell) : [];
}

/**
 * A trip as getTrip answers it, from its row, its meals and its item rows.
 * `meals` are Plan rows; `items` TripItems rows. Nothing here writes.
 */
function tripShape(trip, meals, items, data, today) {
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
      // #719: copied from the food, so the buying amount sheet needs no second call.
      packs: foodPacks(food),
      last_buy: food ? cell(food.last_buy) : '',
      last_bought_on: food ? cell(food.last_bought_on) : '',
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
    late_meals: lateMealsView(lateMealRows(trip, today || todayLocal(), Object.keys(data.plans).map(function (k) {
      return data.plans[k];
    }).filter(function (p) { return meals.indexOf(p) === -1; })), data.recipes),
  };
}

/** A stored trip as getTrip answers it. `today` (default today in America/Denver) dates its late meals. */
function tripView(trip, today) {
  var data = tripData();
  var meals = Object.keys(data.plans)
    .map(function (id) { return data.plans[id]; })
    .filter(function (p) { return p.trip_id === trip.id; })
    .sort(planOrder);
  return tripShape(trip, meals, listRecords('TripItems', function (i) { return i.trip_id === trip.id; }), data, today);
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
 * `today` (the device's, as getPlan) dates its late meals.
 */
function getTrip(params) {
  var id = cell(params && params.id).trim();
  var today = validateDate('today', params && params.today, true);
  var trip = id ? getRecord('Trips', { id: id }) : openTrip();
  if (id && !trip) throw tripError('No trip ' + id + '.', 'not_found');
  if (!trip) return { trip: null };
  pruneTrip(trip);
  return { trip: tripView(trip, today) };
}

/** getPlan's `late_meals` (#719): the open trip's, or [] with no trip open. */
function planLateMeals(plans, today) {
  var trip = openTrip();
  if (!trip) return [];
  var recipes = {};
  listRecords('Recipes').forEach(function (r) { recipes[r.id] = r; });
  return lateMealsView(lateMealRows(trip, today, plans), recipes);
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
    return { trip: tripShape(trip, chosen, items, data, today), written: !dryRun, dry_run: dryRun };
  });
}

/**
 * Sort or tick one item: `{ trip_id?, food_id, choice?, bought?, buy? }`, the
 * open trip when `trip_id` is left out. A choice clears `suggested`; `have`
 * clears `bought` and never changes the food (nor the buying amount); a store
 * that differs from the food's `usual_store` becomes it, and the answer says
 * `remembered: true`. `bought` needs a store. `buy` (#719) is the buying
 * amount, free text up to 60 characters, trimmed; blank clears it, and it
 * writes nothing else. Refused, writing nothing, on a closed trip or a food
 * not on it.
 *
 * @returns {{ item: Object, remembered?: true }}
 */
function setTripItem(payload) {
  payload = payload || {};
  var foodId = requireString('food_id', payload.food_id);
  var hasChoice = has(payload, 'choice');
  var hasBought = has(payload, 'bought');
  var hasBuy = has(payload, 'buy');
  if (!hasChoice && !hasBought && !hasBuy) throw new Error('Send choice, bought or buy.');
  var choice = hasChoice ? validateEnum('choice', payload.choice, TRIP_CHOICES) : null;
  if (hasBought && typeof payload.bought !== 'boolean') throw new Error('bought must be true or false');
  var buy = hasBuy ? tripBuy(payload.buy) : null;

  return withScriptLock(function () {
    var trip = findTrip(payload.trip_id);
    requireOpen(trip, hasBuy ? TRIP_CLOSED : '');
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
    if (buy !== null) item.buy = buy;
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

/** A buying amount as sent: text up to 60 characters, trimmed; blank, spaces or null clear it. */
function tripBuy(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error('buy must be text');
  var buy = value.trim();
  if (buy.length > TRIP_BUY_MAX) throw new Error('buy must be at most ' + TRIP_BUY_MAX + ' characters');
  return buy;
}

/**
 * Close the open trip (or `trip_id`): `closed`, `closed_at` now. Unbought
 * items stay as they are; its meals read Shopped. #719: each item that was
 * bought, from a store, with a buying amount first writes that amount to its
 * food's `last_buy` and the closing date (`today`, default today in
 * America/Denver) to `last_bought_on`. The foods are written before the
 * status, so a failure leaves the trip open; both are in one change-log call.
 */
function closeTrip(payload) {
  return withScriptLock(function () {
    var trip = findTrip(payload && payload.trip_id);
    if (trip.status !== 'open') throw tripError('Trip ' + trip.id + ' is already closed.', 'trip_closed');
    var today = validateDate('today', payload && payload.today, true) || todayLocal();
    pruneTrip(trip);
    var now = isoNow();
    listRecords('TripItems', function (i) { return i.trip_id === trip.id; }).forEach(function (item) {
      var buy = cell(item.buy).trim();
      if (!item.bought || STORES.indexOf(item.choice) === -1 || !buy) return;
      var food = getRecord('Foods', { id: item.food_id });
      if (!food || (food.last_buy === buy && food.last_bought_on === today)) return;
      food.last_buy = buy;
      food.last_bought_on = today;
      food.updated = now;
      upsertRecord('Foods', food);
    });
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

/** A free-text item's name: trimmed, inner spaces collapsed, the first letter capitalised, 1 to 80 characters. */
function tripItemName(text) {
  if (typeof text !== 'string') throw tripError(TRIP_ITEM_NAME, 'bad_name');
  var name = text.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > TRIP_ITEM_NAME_MAX) throw tripError(TRIP_ITEM_NAME, 'bad_name');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The food whose name (or brand and name) is `name`, ignoring case and spaces either side, or null. */
function foodNamed(name) {
  var want = name.trim().toLowerCase();
  return listRecords('Foods', function (f) {
    return cell(f.name).trim().toLowerCase() === want || displayName(f).toLowerCase() === want;
  })[0] || null;
}

function refuseNeverShop(food) {
  if (food.never_shop) {
    throw tripError(displayName(food) + ' is set to never go on a list. Change that on the food first.', 'never_shop');
  }
}

/**
 * Add to the open trip (or `trip_id`), #719: exactly one of `food_id` (a
 * library food), `text` (a name: the food with that name, or a new name-only
 * food, kind ingredient, source manual) or `late_meals: true` (every late
 * meal, with `today`). An added food becomes an item with `mine` set, its
 * usual store and its last bought amount; one already on the list changes
 * nothing. Late meals get the trip's id and their items are built as
 * startTrip builds them: new items take #710's defaults, and an item already
 * on the list gains the lines, keeping its choice and bought tick. Every add
 * is idempotent.
 *
 * @returns {{ trip: Object, added: string[], joined: string[], meals: string[], food: Object|null }}
 */
function addToTrip(payload) {
  payload = payload || {};
  var byId = typeof payload.food_id === 'string' && payload.food_id.trim() !== '';
  var byText = has(payload, 'text') && payload.text !== null && payload.text !== undefined;
  var late = payload.late_meals === true || payload.late_meals === 'true';
  if ((byId ? 1 : 0) + (byText ? 1 : 0) + (late ? 1 : 0) !== 1) throw tripError(TRIP_ADD_ONE, 'bad_input');
  var today = validateDate('today', payload.today, true) || todayLocal();
  var name = byText ? tripItemName(payload.text) : '';

  return withScriptLock(function () {
    var trip = findTrip(payload.trip_id);
    requireOpen(trip, TRIP_CLOSED);
    pruneTrip(trip);
    var out = { trip: null, added: [], joined: [], meals: [], food: null };

    if (late) {
      var data = tripData();
      var meals = lateMealRows(trip, today, Object.keys(data.plans).map(function (k) { return data.plans[k]; }));
      var now = isoNow();
      var existing = {};
      listRecords('TripItems', function (i) { return i.trip_id === trip.id; }).forEach(function (i) {
        existing[i.food_id] = i;
      });
      buildTripItems(trip.id, meals, data.foods, data.linesByRecipe).forEach(function (built) {
        var item = existing[built.food_id];
        if (!item) {
          upsertRecord('TripItems', built);
          out.added.push(built.food_id);
          return;
        }
        var lines = Array.isArray(item.lines_json) ? item.lines_json : [];
        var seen = {};
        lines.forEach(function (l) { seen[cell(l.plan_id) + ' ' + cell(l.line_id)] = true; });
        var fresh = built.lines_json.filter(function (l) { return !seen[l.plan_id + ' ' + l.line_id]; });
        if (!fresh.length) return;
        item.lines_json = lines.concat(fresh);
        upsertRecord('TripItems', item);
        out.joined.push(built.food_id);
      });
      meals.forEach(function (p) {
        p.trip_id = trip.id;
        p.updated = now;
        upsertRecord('Plan', p);
        out.meals.push(p.id);
      });
    } else {
      var food = null;
      var created = false;
      var matched = false;
      if (byId) {
        food = getRecord('Foods', { id: payload.food_id.trim() });
        if (!food) throw tripError('No such food: ' + payload.food_id.trim(), 'not_found');
        refuseNeverShop(food);
      } else {
        food = foodNamed(name);
        matched = !!food;
        if (food) refuseNeverShop(food);
        else {
          food = upsertFood({ name: name, kind: 'ingredient', source: 'manual' });
          created = true;
        }
      }
      out.food = { id: food.id, name: displayName(food), created: created, matched_existing: matched };
      if (!getRecord('TripItems', { trip_id: trip.id, food_id: food.id })) {
        upsertRecord('TripItems', newAddedItem(trip.id, food));
        out.added.push(food.id);
      }
    }
    out.trip = tripView(trip, today);
    return out;
  });
}

/**
 * Take an added item off the open trip (or `trip_id`), #719: `{ food_id }`.
 * Only an item with no meal lines; the food stays in the library. Refused on
 * a closed trip, an item with lines (naming how many meals), or a food not on
 * the list.
 *
 * @returns {{ removed: string, name: string, trip: Object }}
 */
function removeTripItem(payload) {
  payload = payload || {};
  var foodId = requireString('food_id', payload.food_id);
  return withScriptLock(function () {
    var trip = findTrip(payload.trip_id);
    requireOpen(trip, TRIP_CLOSED);
    pruneTrip(trip);
    var food = getRecord('Foods', { id: foodId });
    var name = food ? displayName(food) : foodId;
    var item = getRecord('TripItems', { trip_id: trip.id, food_id: foodId });
    if (!item) throw tripError(name + " isn't on the list.", 'not_on_trip');
    var lines = Array.isArray(item.lines_json) ? item.lines_json : [];
    if (lines.length) {
      var meals = unique(lines.map(function (l) { return cell(l.plan_id); })).length;
      throw tripError(name + ' is on the list for ' + meals + ' planned meal' + (meals === 1 ? '' : 's') + '.', 'has_meals', {
        meals: meals,
      });
    }
    deleteRecord('TripItems', { trip_id: trip.id, food_id: foodId });
    return { removed: foodId, name: name, trip: tripView(trip) };
  });
}

function requireTrip(id, field) {
  if (!getRecord('Trips', { id: cell(id) })) {
    throw new Error((field || 'trip_id') + ' "' + cell(id) + '" is not a trip');
  }
}
