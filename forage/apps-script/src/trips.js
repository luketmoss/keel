// Shopping trips and their items (#703), as rows. Building a trip from the
// plan, default choices and buying amounts are #710's; these are the row-level
// reads and writes it builds on. At most one trip is open.

function getTrips(params) {
  var status = validateEnum('status', params && params.status, TRIP_STATUSES, true);
  return listRecords('Trips', function (t) { return !status || t.status === status; })
    .sort(function (a, b) { return b.created.localeCompare(a.created); });
}

/** One trip with its items. */
function getTrip(id) {
  var trip = getRecord('Trips', { id: cell(id) });
  if (!trip) throw new Error('Trip "' + cell(id) + '" not found');
  var out = JSON.parse(JSON.stringify(trip));
  out.items = listRecords('TripItems', function (i) { return i.trip_id === trip.id; });
  return out;
}

/** Open a trip. Refused while another trip is open; the same `id` again is a retry. */
function createTrip(payload) {
  payload = payload || {};
  return withScriptLock(function () {
    var id = idFor(payload.id, ID_PREFIXES.trip);
    var existing = getRecord('Trips', { id: id });
    if (existing) {
      if (existing.status !== 'open') throw new Error('Trip "' + id + '" exists and is closed');
      return existing;
    }
    var open = listRecords('Trips', function (t) { return t.status === 'open'; });
    if (open.length) throw new Error('Trip "' + open[0].id + '" is open; close it before starting another');
    return upsertRecord('Trips', {
      id: id,
      status: 'open',
      through: validateDate('through', payload.through, true),
      created: isoNow(),
      closed_at: '',
    });
  });
}

/** Payload `{ id, changes: { status?, through? } }`. Closing stamps closed_at; reopening is refused while another is open. */
function updateTrip(payload) {
  var id = requireString('id', payload && payload.id);
  var changes = (payload && payload.changes) || {};
  return withScriptLock(function () {
    var trip = getRecord('Trips', { id: id });
    if (!trip) throw new Error('Trip "' + id + '" not found');
    if (has(changes, 'through')) trip.through = validateDate('through', changes.through, true);
    if (has(changes, 'status')) {
      var status = validateEnum('status', changes.status, TRIP_STATUSES);
      if (status === 'open' && trip.status !== 'open') {
        var open = listRecords('Trips', function (t) { return t.status === 'open' && t.id !== id; });
        if (open.length) throw new Error('Trip "' + open[0].id + '" is open; close it before reopening another');
        trip.closed_at = '';
      }
      if (status === 'closed' && trip.status !== 'closed') trip.closed_at = isoNow();
      trip.status = status;
    }
    return upsertRecord('Trips', trip);
  });
}

/**
 * Write a trip's items, each keyed by food. Payload `{ trip_id, items: [{
 * food_id, lines?: [{plan_id, line_id, amt, grams}], mine?, choice?,
 * suggested?, buy?, bought? }] }`. Fields left out of an item keep their
 * stored value.
 */
function upsertTripItems(payload) {
  var tripId = requireString('trip_id', payload && payload.trip_id);
  if (!Array.isArray(payload.items)) throw new Error('items must be a list');
  requireTrip(tripId);
  var items = payload.items.map(function (item, i) {
    if (!item || typeof item !== 'object') throw new Error('item ' + (i + 1) + ' must be an object');
    var foodId = requireString('item ' + (i + 1) + ' food_id', item.food_id);
    requireFood(foodId);
    var stored = getRecord('TripItems', { trip_id: tripId, food_id: foodId });
    var row = stored ? JSON.parse(JSON.stringify(stored)) : { trip_id: tripId, food_id: foodId };
    if (has(item, 'lines')) row.lines_json = validateTripLines(item.lines);
    ['mine', 'suggested', 'bought'].forEach(function (f) {
      if (has(item, f)) row[f] = toBool(item[f]);
    });
    if (has(item, 'choice')) row.choice = validateEnum('choice', item.choice, TRIP_CHOICES, true);
    if (has(item, 'buy')) row.buy = optionalString('buy', item.buy);
    return row;
  });
  return withScriptLock(function () {
    return items.map(function (row) { return upsertRecord('TripItems', row); });
  });
}

function validateTripLines(lines) {
  if (lines === null || lines === undefined) return null;
  if (!Array.isArray(lines)) throw new Error('lines must be a list');
  return lines.map(function (l) {
    if (!l || typeof l !== 'object') throw new Error('each line must be an object');
    var planId = cell(l.plan_id);
    if (planId) requirePlanEntry(planId);
    return {
      plan_id: planId,
      line_id: cell(l.line_id),
      amt: cell(l.amt),
      grams: optionalNumber('grams', l.grams, { min: 0 }),
    };
  });
}

function deleteTripItem(payload) {
  var tripId = requireString('trip_id', payload && payload.trip_id);
  var foodId = requireString('food_id', payload && payload.food_id);
  if (!deleteRecord('TripItems', { trip_id: tripId, food_id: foodId })) {
    throw new Error('Trip "' + tripId + '" has no item for food "' + foodId + '"');
  }
  return { trip_id: tripId, food_id: foodId, deleted: true };
}

function requireTrip(id, field) {
  if (!getRecord('Trips', { id: cell(id) })) {
    throw new Error((field || 'trip_id') + ' "' + cell(id) + '" is not a trip');
  }
}
