// The meal plan (#703). Each entry is a recipe or a note (a night out,
// leftovers), never both. `trip_id` is the trip the meal is on; "shopped" is
// derived from that trip being closed, never stored.

/** Entries from `from` to `to` inclusive (either optional), by date then slot. */
function getPlan(params) {
  params = params || {};
  var from = validateDate('from', params.from, true);
  var to = validateDate('to', params.to, true);
  return listRecords('Plan', function (p) {
    return (!from || p.date >= from) && (!to || p.date <= to);
  }).sort(function (a, b) {
    return a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) : a.date.localeCompare(b.date);
  });
}

/** Create an entry, or merge the fields sent into the one with that `id`. */
function upsertPlanEntry(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a plan entry');
  var existing = payload.id ? getRecord('Plan', { id: cell(payload.id) }) : null;
  var entry = existing ? JSON.parse(JSON.stringify(existing)) : {};
  entry.id = existing ? existing.id : idFor(payload.id, ID_PREFIXES.plan);
  ['date', 'slot', 'recipe_id', 'note', 'trip_id'].forEach(function (f) {
    if (has(payload, f)) entry[f] = payload[f];
  });

  entry.date = validateDate('date', entry.date);
  entry.slot = validateEnum('slot', entry.slot, SLOTS);
  entry.recipe_id = cell(entry.recipe_id).trim();
  entry.note = optionalString('note', entry.note).trim();
  if (!!entry.recipe_id === !!entry.note) throw new Error('a plan entry has exactly one of recipe_id and note');
  if (entry.recipe_id) requireRecipe(entry.recipe_id);
  entry.trip_id = cell(entry.trip_id).trim();
  if (entry.trip_id) requireTrip(entry.trip_id);

  var now = isoNow();
  entry.created = existing ? existing.created : now;
  entry.updated = now;
  return upsertRecord('Plan', entry);
}

function deletePlanEntry(payload) {
  var id = requireString('id', payload && payload.id);
  if (!deleteRecord('Plan', { id: id })) throw new Error('Plan entry "' + id + '" not found');
  return { id: id, deleted: true };
}

function requirePlanEntry(id, field) {
  if (!getRecord('Plan', { id: cell(id) })) {
    throw new Error((field || 'plan_id') + ' "' + cell(id) + '" is not a plan entry');
  }
}
