// Sets tab (A:M) — reads, slot resolution, the atomic bulk update, and the
// planned rest a new set is written with (#576).
//
// This module is where #134's shaping principle bites hardest: callers name a
// set by workout, exercise, section, order and set number, and the *server*
// works out which row that is. An API that took a row index would leave every
// caller knowing the sheet shape, and the mirror would survive the refactor.

var SETS_SHEET = 'Sets';

function rowToSet(row, sheetRow) {
  return {
    workout_id: cell(row[0]),
    exercise_id: cell(row[1]),
    exercise_name: cell(row[2]),
    section: cell(row[3]),
    exercise_order: Number(row[4]) || 0,
    set_number: Number(row[5]) || 0,
    planned_reps: cell(row[6]),
    weight: cell(row[7]),
    reps: cell(row[8]),
    effort: cell(row[9]),
    // #576. Blank on a row written before the migration, and blank for a set
    // with no planned rest (warmup, cooldown) or nothing measured yet.
    rest_target_s: cell(row[10]),
    set_s: cell(row[11]),
    rest_s: cell(row[12]),
    sheetRow: sheetRow,
  };
}

/** Exactly SET_COLUMN_COUNT cells, A:M (#576). */
function setToRow(s) {
  var row = [];
  for (var i = 0; i < SET_FIELDS.length; i++) {
    row.push(cell(s[SET_FIELDS[i]]));
  }
  return row;
}

function getSets(filters) {
  var rows = getAllRows(getSheet(SETS_SHEET));
  var sets = [];
  for (var i = 0; i < rows.length; i++) {
    sets.push(rowToSet(rows[i], i + 2));
  }

  if (filters && filters.workout_id) {
    var wid = filters.workout_id;
    sets = sets.filter(function (s) { return s.workout_id === wid; });
  }
  if (filters && filters.exercise_id) {
    var eid = filters.exercise_id;
    sets = sets.filter(function (s) { return s.exercise_id === eid; });
  }
  return sets;
}

/**
 * The same exercise can legitimately appear twice in a workout — a warmup and
 * a primary of the same lift are separate slots with their own set numbering.
 * `exercise_id` alone is therefore not an identity.
 */
function slotKey(s) {
  return s.exercise_id + '__' + s.exercise_order;
}

/**
 * A warmup row is a placeholder (set 1, usually no data), so counting it would
 * overstate the session (#146). Only `warmup` is excluded: a row with a blank
 * or unrecognised section is still work, and still counts.
 */
function isWarmupSet(s) {
  return String(s.section).trim().toLowerCase() === 'warmup';
}

/**
 * `{ exercise_count, set_count }` per workout_id, warmups excluded (#146).
 *
 * A slot is what `slotKey` says it is — the same exercise in two sections is
 * two slots, exactly as `groupSetsByExercise` groups them. Takes every set in
 * one pass, so a caller reads the tab once however many workouts it answers
 * for. A workout with no non-warmup rows is simply absent here; the caller
 * reports that as zero.
 */
function countSetsByWorkout(sets) {
  var counts = {};
  var seen = {};
  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    if (isWarmupSet(s)) continue;
    // Prefixed so a workout id can never collide with an Object.prototype key.
    var wkey = 'w:' + s.workout_id;
    if (!Object.prototype.hasOwnProperty.call(counts, wkey)) {
      counts[wkey] = { exercise_count: 0, set_count: 0 };
    }
    counts[wkey].set_count += 1;
    var skey = wkey + '|' + slotKey(s);
    if (!Object.prototype.hasOwnProperty.call(seen, skey)) {
      seen[skey] = true;
      counts[wkey].exercise_count += 1;
    }
  }
  return {
    get: function (workoutId) {
      var wkey = 'w:' + workoutId;
      return Object.prototype.hasOwnProperty.call(counts, wkey)
        ? counts[wkey]
        : { exercise_count: 0, set_count: 0 };
    },
  };
}

/** Group a workout's sets into slots, ordered by exercise_order. */
function groupSetsByExercise(sets) {
  var order = [];
  var byKey = {};

  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    var key = slotKey(s);
    if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
      byKey[key] = {
        exercise_id: s.exercise_id,
        exercise_name: s.exercise_name,
        section: s.section,
        exercise_order: s.exercise_order,
        sets: [],
      };
      order.push(key);
    }
    byKey[key].sets.push(s);
  }

  var slots = order.map(function (k) { return byKey[k]; });
  for (var j = 0; j < slots.length; j++) {
    slots[j].sets.sort(function (a, b) { return a.set_number - b.set_number; });
  }
  return slots.sort(function (a, b) { return a.exercise_order - b.exercise_order; });
}

/**
 * Slots for one exercise within one workout, optionally narrowed.
 *
 * Returns *every* match, so the caller can refuse to guess when an exercise
 * appears in two sections.
 */
function findSetSlots(sets, query) {
  var mine = sets.filter(function (s) {
    return s.workout_id === query.workout_id && s.exercise_id === query.exercise_id;
  });
  var slots = groupSetsByExercise(mine);

  if (query.section) {
    var q = String(query.section).toLowerCase();
    slots = slots.filter(function (g) { return String(g.section).toLowerCase() === q; });
  }
  if (query.exercise_order !== undefined && query.exercise_order !== null && query.exercise_order !== '') {
    var ord = Number(query.exercise_order);
    slots = slots.filter(function (g) { return g.exercise_order === ord; });
  }
  return slots;
}

/** Describe repeated slots so a caller can pick one. */
function describeSlots(slots) {
  return slots.map(function (g) {
    return '[' + (g.section || 'no section') + '] exercise_order ' + g.exercise_order +
      ', ' + g.sets.length + ' sets';
  }).join('; ');
}

/**
 * The one set row an update means, or a thrown error saying how to narrow it.
 *
 * Never falls back to a guess, and never appends when nothing matches —
 * silently creating a set the caller did not ask for is worse than refusing.
 */
function resolveSetTarget(sets, ex, query) {
  var slots = findSetSlots(sets, {
    workout_id: query.workout_id,
    exercise_id: ex.id,
    section: query.section,
    exercise_order: query.exercise_order,
  });

  if (!slots.length) {
    var all = findSetSlots(sets, { workout_id: query.workout_id, exercise_id: ex.id });
    throw new Error(
      'No ' + ex.name +
      (query.section ? ' in section ' + query.section : '') +
      (query.exercise_order ? ' at exercise_order ' + query.exercise_order : '') +
      ' in workout ' + query.workout_id +
      (all.length ? ' — it appears as ' + describeSlots(all) + '.' : '.')
    );
  }
  if (slots.length > 1) {
    throw new Error(
      ex.name + ' appears ' + slots.length + ' times in workout ' + query.workout_id +
      ' — ' + describeSlots(slots) + '. Pass section or exercise_order to say which set ' +
      query.set_number + ' you mean.'
    );
  }

  var slot = slots[0];
  var wanted = Number(query.set_number);
  var target = null;
  for (var i = 0; i < slot.sets.length; i++) {
    if (slot.sets[i].set_number === wanted) { target = slot.sets[i]; break; }
  }
  if (!target) {
    throw new Error(
      'No set ' + query.set_number + ' of ' + ex.name + ' [' + (slot.section || 'no section') +
      '] in workout ' + query.workout_id + ' — that slot has sets 1..' + slot.sets.length + '.'
    );
  }
  return { slot: slot, target: target };
}

/**
 * Resolve a batch of set corrections against one workout **without writing**.
 *
 * Every entry is checked and every problem collected: a half-applied batch is
 * worse than a rejected one, because the caller cannot tell which sets are
 * live without re-reading.
 *
 * This is also the whole of #134 AC4 — `previewSetUpdates` is this function
 * and nothing else, so a dry run and a real write resolve identically by
 * construction rather than by two code paths agreeing.
 */
function planSetUpdates(sets, workoutId, updates, library) {
  var changes = [];
  var errors = [];
  var claimed = {}; // sheetRow -> index of the entry that took it

  var allowed = ['exercise', 'set_number', 'section', 'exercise_order'].concat(SET_UPDATE_FIELDS);

  updates.forEach(function (u, i) {
    function fail(msg) {
      errors.push('updates[' + i + '] "' + (u.exercise || '') + '" set ' + u.set_number + ': ' + msg);
    }

    var unknown = Object.keys(u).filter(function (k) { return allowed.indexOf(k) === -1; });
    if (unknown.length) {
      return fail(
        'unknown field ' + unknown.map(function (k) { return '"' + k + '"'; }).join(', ') +
        ' — accepted: ' + allowed.join(', ')
      );
    }

    var touches = SET_UPDATE_FIELDS.some(function (f) { return u[f] !== undefined; });
    if (!touches) {
      return fail('nothing to change — pass at least one of ' + SET_UPDATE_FIELDS.join(', '));
    }

    if (u.effort !== undefined && u.effort !== '' && EFFORTS.indexOf(u.effort) === -1) {
      return fail('invalid effort "' + u.effort + '". Expected one of: ' + EFFORTS.join(', '));
    }

    var ex;
    var resolved;
    try {
      ex = resolveExercise(u.exercise, library);
      resolved = resolveSetTarget(sets, ex, {
        workout_id: workoutId,
        set_number: u.set_number,
        section: u.section,
        exercise_order: u.exercise_order,
      });
    } catch (err) {
      return fail(err.message || String(err));
    }

    var row = resolved.target.sheetRow;
    if (Object.prototype.hasOwnProperty.call(claimed, row)) {
      return fail('targets the same set as updates[' + claimed[row] + '] — combine them into one entry');
    }
    claimed[row] = i;

    var after = {};
    for (var key in resolved.target) {
      if (Object.prototype.hasOwnProperty.call(resolved.target, key)) after[key] = resolved.target[key];
    }
    for (var f = 0; f < SET_UPDATE_FIELDS.length; f++) {
      var field = SET_UPDATE_FIELDS[f];
      if (u[field] !== undefined) after[field] = cell(u[field]);
    }

    changes.push({
      index: i,
      exercise: { id: ex.id, name: ex.name },
      slot: { section: resolved.slot.section, exercise_order: resolved.slot.exercise_order },
      before: resolved.target,
      after: after,
    });
  });

  return { changes: changes, errors: errors };
}

/**
 * AC4: what a batch *would* change, writing nothing.
 *
 * Deliberately a thin wrapper rather than a parallel implementation — the
 * preview must resolve exactly as the write does, and the only way to
 * guarantee that is for them to be the same code.
 */
function previewSetUpdates(workoutId, updates) {
  if (!workoutId) throw new Error('workout_id is required');
  if (!updates || !updates.length) throw new Error('updates are required');

  var plan = planSetUpdates(getSets({ workout_id: workoutId }), workoutId, updates, getExercises());
  if (plan.errors.length) throw new Error(plan.errors.join('; '));
  return { changes: plan.changes, applied: false };
}

/**
 * Rows whose freshly read A..F no longer hold the workout, exercise and set
 * number they were resolved with — a row above was deleted and the index now
 * points at a different set (cf. #95).
 */
function findStaleSetRows(sets, freshRows) {
  return sets.filter(function (s, i) {
    var r = freshRows[i] || [];
    return cell(r[0]) !== s.workout_id ||
      cell(r[1]) !== s.exercise_id ||
      Number(r[5]) !== s.set_number;
  });
}

/**
 * Apply a batch of set corrections, all or nothing (#134 AC2).
 *
 * Resolution happens first and must succeed for *every* entry — one bad
 * target rejects the batch untouched. Each target row is then re-read and
 * checked before any write: within a single Apps Script execution the sheet
 * is unlikely to move underneath us, but "unlikely" is not the standard this
 * codebase holds for a write that could land on someone else's row.
 */
function applySetUpdates(workoutId, updates) {
  if (!workoutId) throw new Error('workout_id is required');
  if (!updates || !updates.length) throw new Error('updates are required');

  var sheet = getSheet(SETS_SHEET);
  var plan = planSetUpdates(getSets({ workout_id: workoutId }), workoutId, updates, getExercises());
  if (plan.errors.length) throw new Error(plan.errors.join('; '));

  var targets = plan.changes.map(function (c) { return c.after; });

  var fresh = targets.map(function (t) {
    return sheet.getRange(t.sheetRow, 1, 1, SET_IDENTITY_COLUMN_COUNT).getDisplayValues()[0];
  });
  var stale = findStaleSetRows(targets, fresh);
  if (stale.length) {
    throw new Error(
      stale.length + ' set row' + (stale.length > 1 ? 's' : '') + ' moved since ' +
      (stale.length > 1 ? 'they were' : 'it was') + ' read (sheet rows ' +
      stale.map(function (s) { return s.sheetRow; }).join(', ') + ') — the sheet changed ' +
      'underneath this call. Nothing was written; re-read the workout and retry.'
    );
  }

  for (var i = 0; i < targets.length; i++) {
    sheet.getRange(targets[i].sheetRow, 1, 1, SET_COLUMN_COUNT).setValues([asText(setToRow(targets[i]))]);
  }

  return { changes: plan.changes, applied: true };
}

/** Which Settings default each timed section falls back to (#576). */
var REST_KINDS = {
  primary: { rest: 'rest_primary_s' },
  SS1: { rest: 'rest_superset_s', sw: 'switch_superset_s' },
  SS2: { rest: 'rest_superset_s', sw: 'switch_superset_s' },
  SS3: { rest: 'rest_superset_s', sw: 'switch_superset_s' },
  burnout: { rest: 'rest_burnout_s', sw: 'switch_burnout_s' },
};

/**
 * Which of its section's values each set takes, parallel to `sets` (one
 * workout's rows): 'rest_s', 'switch_s', or '' for a section with no rest.
 *
 * A round is one section's sets with the same set number; an exercise with
 * fewer sets drops out of later rounds. In a superset or burnout every
 * exercise but the last in its round (by exercise_order) takes the switch and
 * the last takes the round rest. A primary set always takes the rest. Warmup,
 * cooldown and anything else take nothing.
 */
function restFieldsOf(sets) {
  // The highest exercise_order in each round.
  var lastInRound = {};
  sets.forEach(function (s) {
    var k = s.section + '\u0000' + Number(s.set_number);
    var order = Number(s.exercise_order) || 0;
    if (!(k in lastInRound) || order > lastInRound[k]) lastInRound[k] = order;
  });

  return sets.map(function (s) {
    var kind = Object.prototype.hasOwnProperty.call(REST_KINDS, s.section) ? REST_KINDS[s.section] : null;
    if (!kind) return '';
    if (!kind.sw) return 'rest_s';
    var last = lastInRound[s.section + '\u0000' + Number(s.set_number)] === (Number(s.exercise_order) || 0);
    return last ? 'rest_s' : 'switch_s';
  });
}

/**
 * The rest planned after each set (#576), as text parallel to `sets`, which
 * are one workout's rows: the round rule of `restFieldsOf`, then each value
 * from `sectionRest[section]` (a template section, with any #583 overrides
 * laid over it), else the Settings default. Mirrors resolveRestTargets in
 * frontend/src/api/rest-times.ts.
 */
function resolveRestTargets(sets, sectionRest, defaults) {
  var fields = restFieldsOf(sets);
  return sets.map(function (s, i) {
    var field = fields[i];
    if (!field) return '';
    var kind = REST_KINDS[s.section];
    var own = sectionRest && sectionRest[s.section] ? cell(sectionRest[s.section][field]) : '';
    return own !== '' ? own : String(defaults[field === 'rest_s' ? kind.rest : kind.sw]);
  });
}

/**
 * A caller's per-section rest (#583): a list of `{ section, rest_s?, switch_s? }`
 * in whole seconds, the MCP's `rest` parameter. Returns
 * `{ sections: { SS1: { rest_s: '60' } }, errors }`: a field left out stays
 * out, and `null` (or '') becomes '', the Settings default. Every problem is
 * collected, each naming the entry and its section.
 */
function parseRestOverrides(list) {
  var sections = {};
  var errors = [];
  if (list === undefined || list === null) return { sections: sections, errors: errors };
  if (!Array.isArray(list)) return { sections: sections, errors: ['rest must be a list of sections'] };

  list.forEach(function (entry, i) {
    var where = 'rest[' + i + ']';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(where + ': must be { section, rest_s, switch_s }');
      return;
    }
    var section = entry.section;
    where += ' (' + (section === undefined ? 'no section' : String(section)) + ')';
    var unknown = Object.keys(entry).filter(function (k) {
      return ['section', 'rest_s', 'switch_s'].indexOf(k) === -1;
    });
    if (unknown.length) {
      errors.push(where + ': unknown field ' + unknown.map(function (k) { return '"' + k + '"'; }).join(', ') +
        ' — accepted: section, rest_s, switch_s');
      return;
    }
    if (REST_SECTIONS.indexOf(section) === -1) {
      errors.push(where + ': section must be one of ' + REST_SECTIONS.join(', '));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(sections, section)) {
      errors.push(where + ': section ' + section + ' is named twice');
      return;
    }
    if (entry.rest_s === undefined && entry.switch_s === undefined) {
      errors.push(where + ': nothing to change — pass rest_s, switch_s or both');
      return;
    }
    if (entry.switch_s !== undefined && SWITCH_SECTIONS.indexOf(section) === -1) {
      errors.push(where + ': switch_s applies only to SS1, SS2, SS3 and burnout');
      return;
    }
    var mine = {};
    try {
      if (entry.rest_s !== undefined) {
        mine.rest_s = templateRestValue(where, 'rest_s', entry.rest_s, REST_SECONDS_MIN, REST_SECONDS_MAX);
      }
      if (entry.switch_s !== undefined) {
        mine.switch_s = templateRestValue(where, 'switch_s', entry.switch_s, SWITCH_SECONDS_MIN, SWITCH_SECONDS_MAX);
      }
    } catch (err) {
      errors.push(err.message);
      return;
    }
    sections[section] = mine;
  });
  return { sections: sections, errors: errors };
}

/** `base` (a template's section rest) with `overrides` laid over it, field by field (#583). */
function mergeSectionRest(base, overrides) {
  var out = {};
  Object.keys(base || {}).forEach(function (s) {
    out[s] = { rest_s: base[s].rest_s, switch_s: base[s].switch_s };
  });
  Object.keys(overrides || {}).forEach(function (s) {
    var mine = out[s] || (out[s] = {});
    if (overrides[s].rest_s !== undefined) mine.rest_s = overrides[s].rest_s;
    if (overrides[s].switch_s !== undefined) mine.switch_s = overrides[s].switch_s;
  });
  return out;
}

/**
 * Check `rest_plans` (#583) before anything is written: `{ <workout_id>:
 * { template_id?, rest? } }`. Returns each workout's template and parsed
 * overrides, or throws with every problem.
 */
function parseRestPlans(restPlans) {
  var out = {};
  if (restPlans === undefined || restPlans === null) return out;
  if (typeof restPlans !== 'object' || Array.isArray(restPlans)) {
    throw new Error('rest_plans must be an object keyed by workout_id');
  }
  var errors = [];
  Object.keys(restPlans).forEach(function (id) {
    var plan = restPlans[id] || {};
    var parsed = parseRestOverrides(plan.rest);
    parsed.errors.forEach(function (e) { errors.push('rest_plans.' + id + ' ' + e); });
    out[id] = {
      hasTemplate: Object.prototype.hasOwnProperty.call(plan, 'template_id'),
      template_id: cell(plan.template_id),
      sections: parsed.sections,
    };
  });
  if (errors.length) throw new Error(errors.join('; '));
  return out;
}

/**
 * Fill `rest_target_s` on new sets (#576) for every workout none of whose sets
 * in this call names it. A caller that sends the field, even blank, keeps it.
 *
 * Precedence, per section and field (#583): the workout's `rest_plans` entry,
 * then its template's section rest, then the Settings default. The template is
 * the plan's `template_id` when the plan names one (blank: no template), else
 * the workout row's. The MCP appends sets before the workout row exists, so it
 * names the template here.
 */
function withRestTargets(sets, restPlans) {
  var plans = restPlans || {};
  var byWorkout = {};
  sets.forEach(function (s) {
    var id = cell(s.workout_id);
    (byWorkout[id] = byWorkout[id] || []).push(s);
  });

  var workouts = null;
  var templates = null;
  var defaults = null;
  var out = sets.map(function (s) { return s; });

  Object.keys(byWorkout).forEach(function (id) {
    var group = byWorkout[id];
    if (group.some(function (s) { return s.rest_target_s !== undefined; })) return;

    if (defaults === null) defaults = getRestSettings();
    var plan = Object.prototype.hasOwnProperty.call(plans, id) ? plans[id] : null;
    var templateId = '';
    if (plan && plan.hasTemplate) {
      templateId = plan.template_id;
    } else {
      if (workouts === null) workouts = getWorkouts({});
      var workout = workouts.filter(function (w) { return w.id === id; })[0];
      if (workout) templateId = workout.template_id;
    }
    var sectionRest = {};
    if (templateId) {
      if (templates === null) templates = getTemplates();
      var tpl = templates.filter(function (t) { return t.id === templateId; })[0];
      if (tpl) sectionRest = sectionRestOf(tpl.exercises);
    }
    if (plan) sectionRest = mergeSectionRest(sectionRest, plan.sections);

    var targets = resolveRestTargets(group, sectionRest, defaults);
    group.forEach(function (s, i) {
      var copy = {};
      Object.keys(s).forEach(function (k) { copy[k] = s[k]; });
      copy.rest_target_s = targets[i];
      out[sets.indexOf(s)] = copy;
    });
  });
  return out;
}

/**
 * Append set rows. Used when a workout is scheduled or built. `restPlans`
 * (#583) is optional, and checked before anything is written.
 */
function appendSets(sets, restPlans) {
  if (!sets || !sets.length) throw new Error('sets are required');
  sets = withRestTargets(sets, parseRestPlans(restPlans));
  var sheet = getSheet(SETS_SHEET);
  var appended = [];
  for (var i = 0; i < sets.length; i++) {
    var row = setToRow(sets[i]);
    sheet.appendRow(asText(row));
    appended.push(rowToSet(row, sheet.getLastRow()));
  }
  return appended;
}

/** A set already done (#583): reps or set_s recorded. A weight alone is a prescription. */
function isSetDone(s) {
  return cell(s.reps) !== '' || cell(s.set_s) !== '';
}

/**
 * Re-resolve `rest_target_s` on one planned or active workout (#583), in the
 * sections `rest` names. A dry run unless `confirm` is true.
 *
 * Only the named sections change, and in them only the sets that take a field
 * the entry gives: a rest given alone leaves the switch sets as they are. A
 * done set (reps or set_s) keeps the target it ran against. `null` means the
 * Settings default. The round rule is appendSets', over the workout's sets.
 *
 * @param {{workout_id: string, rest: Array, confirm?: boolean}} payload
 */
function setWorkoutRest(payload) {
  payload = payload || {};
  var workoutId = cell(payload.workout_id);
  if (!workoutId) throw new Error('workout_id is required');
  if (!Array.isArray(payload.rest) || !payload.rest.length) {
    throw new Error('rest is required: a list of { section, rest_s, switch_s }');
  }
  var confirm = payload.confirm === true;

  var workout = getWorkouts({}).filter(function (w) { return w.id === workoutId; })[0];
  if (!workout) throw new Error('Workout "' + workoutId + '" not found');
  if (workout.status !== 'planned' && workout.status !== 'active') {
    throw new Error(
      'Workout ' + workoutId + ' is ' + (workout.status || 'completed') + ': rest can be changed only on a ' +
      'planned or active workout. Nothing was written.'
    );
  }

  var parsed = parseRestOverrides(payload.rest);
  var sets = getSets({ workout_id: workoutId });
  payload.rest.forEach(function (e, i) {
    if (!e || !Object.prototype.hasOwnProperty.call(parsed.sections, e.section)) return;
    if (!sets.some(function (s) { return s.section === e.section; })) {
      parsed.errors.push('rest[' + i + '] (' + e.section + '): workout ' + workoutId + ' has no ' + e.section + ' sets');
    }
  });
  if (parsed.errors.length) throw new Error(parsed.errors.join('; '));

  var fields = restFieldsOf(sets);
  var targets = resolveRestTargets(sets, parsed.sections, getRestSettings());
  var changes = [];
  var keptDone = 0;
  sets.forEach(function (s, i) {
    var mine = parsed.sections[s.section];
    if (!mine || !fields[i] || mine[fields[i]] === undefined) return;
    if (cell(s.rest_target_s) === targets[i]) return;
    if (isSetDone(s)) {
      keptDone++;
      return;
    }
    changes.push({ set: s, before: cell(s.rest_target_s), after: targets[i] });
  });

  var result = {
    dry_run: !confirm, workout_id: workoutId, count: changes.length, kept_done: keptDone,
    changes: changes.map(function (c) {
      return {
        exercise_id: c.set.exercise_id, exercise_name: c.set.exercise_name, section: c.set.section,
        exercise_order: c.set.exercise_order, set_number: c.set.set_number,
        before: c.before, after: c.after,
      };
    }),
  };
  if (!confirm || !changes.length) return result;

  var sheet = getSheet(SETS_SHEET);
  var targetSets = changes.map(function (c) { return c.set; });
  var fresh = targetSets.map(function (s) {
    return sheet.getRange(s.sheetRow, 1, 1, SET_IDENTITY_COLUMN_COUNT).getDisplayValues()[0];
  });
  var stale = findStaleSetRows(targetSets, fresh);
  if (stale.length) {
    throw new Error(
      'Set rows moved since they were read (sheet rows ' +
      stale.map(function (s) { return s.sheetRow; }).join(', ') + '). Nothing was written; retry.'
    );
  }
  // Column K alone: the rest of the row, Lift Mode's L:M included, is left as it is.
  var restColumn = SET_FIELDS.indexOf('rest_target_s') + 1;
  for (var j = 0; j < changes.length; j++) {
    sheet.getRange(changes[j].set.sheetRow, restColumn, 1, 1).setValues([asText([changes[j].after])]);
  }
  return result;
}

/**
 * Every logged set of one exercise, newest workout first (#134 AC6).
 *
 * Served as an action rather than by fetching whole ranges and filtering
 * client-side: `thrive_exercise_history` is the query, and answering it here
 * is what stops the caller needing the sheet shape.
 */
function getExerciseHistory(ref, options) {
  var opts = options || {};
  var ex = resolveExercise(ref, getExercises());
  var mine = getSets({ exercise_id: ex.id });

  var workouts = getWorkouts();
  var byId = {};
  for (var i = 0; i < workouts.length; i++) byId[workouts[i].id] = workouts[i];

  var sessions = {};
  var order = [];
  for (var j = 0; j < mine.length; j++) {
    var s = mine[j];
    var w = byId[s.workout_id];
    if (!w) continue; // an orphaned set row has no session to report
    var key = s.workout_id + '__' + s.exercise_order;
    if (!Object.prototype.hasOwnProperty.call(sessions, key)) {
      sessions[key] = {
        workout_id: w.id,
        date: w.date,
        workout_name: w.name,
        section: s.section,
        exercise_order: s.exercise_order,
        sets: [],
      };
      order.push(key);
    }
    sessions[key].sets.push(s);
  }

  var history = order.map(function (k) { return sessions[k]; });
  for (var n = 0; n < history.length; n++) {
    history[n].sets.sort(function (a, b) { return a.set_number - b.set_number; });
  }
  history.sort(function (a, b) { return b.date.localeCompare(a.date); });

  var limit = Number(opts.limit);
  if (isFinite(limit) && limit > 0) history = history.slice(0, limit);

  return { exercise: { id: ex.id, name: ex.name }, history: history };
}
