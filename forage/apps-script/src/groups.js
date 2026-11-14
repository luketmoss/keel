// Groups in the food log (#878). A group is entries added together under a
// heading ("Oatmeal"): they share a `group_id` (`gr_` + 8 hex) and a
// `group_name`, and the entries a usual produced also carry `usual_id` and the
// `usual_line_id` they filled. There is no Groups tab: a group is only its
// entries' four columns, all blank on an ungrouped entry.
//
// Each action builds every entry first, through writeLogEntry's dry-run path,
// so a refusal on any of them writes nothing; the entries are then written in
// one append under the script lock. Nutrition is the same snapshot logFood
// takes, computed from the food or recipe as it is when the entry is written.

var MAX_GROUP_NAME = 120;
var MAX_GROUP_ITEMS = 30;

/**
 * Log a usual: one entry per line in position order, sharing a new group named
 * for the usual. Payload `{ usual_id, date, slot, picks?: { <line_id>:
 * <food_id> }, dry_run? }`. A pick-one logs the picked option, else its
 * `last_pick`, else its first option, at that option's own amount, and its
 * `last_pick` becomes what was logged. Answers `{ entries, group_id }`.
 */
function logUsual(payload, caller) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a usual to log');
  var usualId = requireString('usual_id', payload.usual_id);
  var usual = getRecord('Usuals', { id: usualId });
  if (!usual) throw new Error('Usual "' + usualId + '" not found');
  var date = validateDate('date', payload.date);
  var slot = validateEnum('slot', payload.slot, SLOTS);
  var lines = sortLines(listRecords('UsualLines', function (l) { return l.usual_id === usual.id; }));
  if (!lines.length) throw new Error('Usual "' + usual.name + '" has no lines to log');

  var picks = payload.picks === undefined || payload.picks === null ? {} : payload.picks;
  if (typeof picks !== 'object' || Array.isArray(picks)) throw new Error('picks must map a line_id to a food_id');
  var byLine = {};
  lines.forEach(function (l) { byLine[l.line_id] = l; });
  Object.keys(picks).forEach(function (lineId) {
    var line = byLine[lineId];
    if (!line) throw new Error('picks.' + lineId + ' is not a line of "' + usual.name + '"');
    if (!Array.isArray(line.options_json)) throw new Error('picks.' + lineId + ' is an Always line: it has nothing to pick');
    if (!optionFor(line, cell(picks[lineId]).trim())) {
      throw new Error('picks.' + lineId + ' "' + cell(picks[lineId]) + '" is not one of that line\'s options');
    }
  });

  var groupId = newId(ID_PREFIXES.group);
  var chosen = {};
  var entries = lines.map(function (line) {
    var amount;
    if (Array.isArray(line.options_json)) {
      var pick = has(picks, line.line_id) ? cell(picks[line.line_id]).trim() : line.last_pick;
      amount = optionFor(line, pick) || line.options_json[0];
      chosen[line.line_id] = amount.food_id;
    } else {
      amount = line;
    }
    return writeLogEntry(null, {
      date: date, slot: slot, food_id: amount.food_id, qty: amount.qty, unit: amount.unit,
    }, newId(ID_PREFIXES.log), caller, true, {
      group: { group_id: groupId, group_name: usual.name, usual_id: usual.id, usual_line_id: line.line_id },
    });
  });
  if (isDryRun(payload)) return { entries: entries, group_id: groupId };

  return withScriptLock(function () {
    appendRecords('FoodLog', entries);
    updateRecordsWhere('UsualLines', function (l) {
      return l.usual_id === usual.id && has(chosen, l.line_id);
    }, function (l) { l.last_pick = chosen[l.line_id]; });
    return { entries: groupEntries(groupId), group_id: groupId };
  });
}

/** The line's option for a food id, or null. */
function optionFor(line, foodId) {
  var found = null;
  (Array.isArray(line.options_json) ? line.options_json : []).forEach(function (o) {
    if (o && o.food_id === foodId) found = o;
  });
  return found;
}

/** The entries of a group, oldest first (the order they were written in). */
function groupEntries(groupId) {
  return listRecords('FoodLog', function (e) { return e.group_id === groupId; })
    .sort(function (a, b) { return a.logged_at.localeCompare(b.logged_at); });
}

/**
 * Log 1 to 30 foods under a new group that comes from no usual. Payload
 * `{ date, slot, name, items: [{ food_id, qty, unit }], dry_run? }`; `name`
 * is the heading, at most 120 characters. Answers `{ entries, group_id }`.
 */
function logGroup(payload, caller) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be a group to log');
  var date = validateDate('date', payload.date);
  var slot = validateEnum('slot', payload.slot, SLOTS);
  var name = groupName(payload.name);
  if (!Array.isArray(payload.items)) throw new Error('items must be a list');
  var n = payload.items.length;
  if (n < 1 || n > MAX_GROUP_ITEMS) throw new Error('items must have 1 to ' + MAX_GROUP_ITEMS + ' foods, not ' + n);

  var groupId = newId(ID_PREFIXES.group);
  var entries = payload.items.map(function (item, i) {
    var at = 'items[' + (i + 1) + ']';
    if (!item || typeof item !== 'object') throw new Error(at + ' must be an object');
    if (!cell(item.food_id).trim()) throw new Error(at + '.food_id is required');
    if (cell(item.recipe_id).trim()) throw new Error(at + ' is a food: a group holds foods, not recipes');
    try {
      return writeLogEntry(null, {
        date: date, slot: slot, food_id: item.food_id, qty: item.qty, unit: item.unit,
      }, newId(ID_PREFIXES.log), caller, true, {
        group: { group_id: groupId, group_name: name, usual_id: '', usual_line_id: '' },
      });
    } catch (err) {
      throw new Error(at + ': ' + err.message);
    }
  });
  if (isDryRun(payload)) return { entries: entries, group_id: groupId };
  return withScriptLock(function () {
    appendRecords('FoodLog', entries);
    return { entries: groupEntries(groupId), group_id: groupId };
  });
}

function groupName(value) {
  var name = requireString('name', value);
  if (name.length > MAX_GROUP_NAME) throw new Error('name must be at most ' + MAX_GROUP_NAME + ' characters');
  return name;
}

/**
 * Copy a meal: every entry of `from_date`'s `from_slot`, or only the ones in
 * `group_id`, onto `to_date`'s `to_slot`, after what is already there.
 * Nutrition is worked out again from the food or recipe as it is now, so a
 * food edited since gives the new figures and the source keeps its own. A
 * serving the food has renamed is resolved by #880's rule. Each source group
 * becomes a new group with the same name, usual and usual line. Refused when
 * the source has no entries or `to_date` is after today. Answers the new entries.
 */
function copyMeal(payload, caller) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must say which meal to copy');
  var fromDate = validateDate('from_date', payload.from_date);
  var fromSlot = validateEnum('from_slot', payload.from_slot, SLOTS);
  var toDate = validateDate('to_date', payload.to_date);
  var toSlot = validateEnum('to_slot', payload.to_slot, SLOTS);
  var groupId = cell(payload.group_id).trim();
  if (toDate > todayLocal()) throw new Error('to_date ' + toDate + ' is after today: a meal can only be copied to today or earlier');

  var source = listRecords('FoodLog', function (e) {
    return e.date === fromDate && e.slot === fromSlot && (!groupId || e.group_id === groupId);
  }).sort(function (a, b) { return a.logged_at.localeCompare(b.logged_at); });
  if (!source.length) {
    throw new Error(groupId ? 'Group "' + groupId + '" has no entries on ' + fromDate + ' ' + fromSlot
      : 'There is nothing logged for ' + fromSlot + ' on ' + fromDate + ' to copy');
  }

  var newGroups = {};
  var copies = source.map(function (e) {
    var group = { group_id: '', group_name: '', usual_id: '', usual_line_id: '' };
    if (e.group_id) {
      newGroups[e.group_id] = newGroups[e.group_id] || newId(ID_PREFIXES.group);
      group = {
        group_id: newGroups[e.group_id], group_name: e.group_name,
        usual_id: e.usual_id, usual_line_id: e.usual_line_id,
      };
    }
    return writeLogEntry(null, {
      date: toDate, slot: toSlot, food_id: e.food_id, recipe_id: e.recipe_id, qty: e.qty, unit: e.unit,
    }, newId(ID_PREFIXES.log), caller, true, { group: group, from: e });
  });

  return withScriptLock(function () {
    appendRecords('FoodLog', copies);
    var ids = {};
    copies.forEach(function (c) { ids[c.id] = true; });
    return listRecords('FoodLog', function (e) { return ids[e.id]; });
  });
}

/**
 * Group or ungroup entries. Payload `{ ids, group }`. `group: null` clears
 * the four group fields on those entries and changes nothing else, not even
 * `updated`. `group: { name, usual_id? }` puts them under a new group; with a
 * `usual_id`, each food entry also takes the `usual_line_id` of the usual's
 * line that has its food (a pick-one's option counts), each line used once
 * while another matches. The entries must all exist and share one date and
 * slot. Answers them, in the order sent.
 */
function setLogGroup(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be { ids, group }');
  var ids = logEntryIds(payload.ids);
  if (!has(payload, 'group')) throw new Error('group is required: null to ungroup, or { name }');
  var group = payload.group;
  if (group !== null && (typeof group !== 'object' || Array.isArray(group))) throw new Error('group must be null or { name, usual_id? }');

  var found = {};
  listRecords('FoodLog', function (e) { return ids.indexOf(e.id) !== -1; }).forEach(function (e) { found[e.id] = e; });
  var missing = ids.filter(function (i) { return !found[i]; });
  if (missing.length) {
    throw new Error((missing.length === 1 ? 'Log entry "' + missing[0] + '" not found' : 'Log entries not found: ' + missing.join(', ')) +
      '. Nothing was changed');
  }
  var first = found[ids[0]];
  ids.forEach(function (i) {
    if (found[i].date !== first.date || found[i].slot !== first.slot) {
      throw new Error('Entries must all be on the same date and meal; ' + i + ' is ' + found[i].slot + ' on ' + found[i].date +
        ', not ' + first.slot + ' on ' + first.date);
    }
  });

  var set = { group_id: '', group_name: '', usual_id: '', usual_line_id: '' };
  var lineFor = {};
  if (group !== null) {
    set.group_id = newId(ID_PREFIXES.group);
    set.group_name = groupName(group.name);
    var usualId = cell(group.usual_id).trim();
    if (usualId) {
      if (!getRecord('Usuals', { id: usualId })) throw new Error('Usual "' + usualId + '" not found');
      set.usual_id = usualId;
      var lines = sortLines(listRecords('UsualLines', function (l) { return l.usual_id === usualId; }));
      var claimed = {};
      ids.forEach(function (i) {
        var e = found[i];
        if (!e.food_id) return;
        var match = null;
        lines.forEach(function (l) {
          if (match || claimed[l.line_id]) return;
          if (l.food_id === e.food_id || optionFor(l, e.food_id)) match = l;
        });
        if (match) {
          claimed[match.line_id] = true;
          lineFor[i] = match.line_id;
        }
      });
    }
  }

  return withScriptLock(function () {
    var written = {};
    updateRecordsWhere('FoodLog', function (e) { return ids.indexOf(e.id) !== -1; }, function (e) {
      GROUP_FIELDS.forEach(function (f) { e[f] = set[f]; });
      if (set.usual_id) e.usual_line_id = lineFor[e.id] || '';
      written[e.id] = e;
    });
    return ids.map(function (i) { return written[i]; });
  });
}
