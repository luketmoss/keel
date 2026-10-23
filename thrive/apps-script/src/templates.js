// Templates tab (A:J). One row per exercise; a template is the group of rows
// sharing a template_id. I/J (#576) are the section's rest and switch seconds.

var TEMPLATES_SHEET = 'Templates';

/** "4-5" -> "5". Mirrors normalizeRangeToMax in templates-api.ts. */
function normalizeRangeToMax(value) {
  var trimmed = String(value === undefined || value === null ? '' : value).trim();
  if (!trimmed) return trimmed;
  var parts = trimmed.split('-')
    .map(function (s) { return Number(s.trim()); })
    .filter(function (n) { return !isNaN(n); });
  return parts.length ? String(Math.max.apply(null, parts)) : trimmed;
}

function rowToTemplateRow(row, sheetRow) {
  return {
    template_id: cell(row[0]),
    template_name: cell(row[1]),
    order: Number(row[2]) || 0,
    exercise_id: cell(row[3]),
    exercise_name: cell(row[4]),
    section: cell(row[5]),
    sets: normalizeRangeToMax(cell(row[6])),
    reps: normalizeRangeToMax(cell(row[7])),
    rest_s: cell(row[8]),   // #576: blank on a row written before the migration
    switch_s: cell(row[9]),
    sheetRow: sheetRow,
  };
}

function templateRowValues(templateId, name, ex, order) {
  return [
    templateId, name, order,
    cell(ex.exercise_id), cell(ex.exercise_name), cell(ex.section),
    String(ex.sets), String(ex.reps),
    cell(ex.rest_s), cell(ex.switch_s),
  ];
}

/** The sections that carry a rest (#576), and those of them that also carry a switch. */
var REST_SECTIONS = ['primary', 'SS1', 'SS2', 'SS3', 'burnout'];
var SWITCH_SECTIONS = ['SS1', 'SS2', 'SS3', 'burnout'];

/**
 * One rest or switch value from a caller: '' for blank (use the default), or
 * the seconds as text. Throws with the range on anything else.
 */
function templateRestValue(where, field, value, min, max) {
  if (value === undefined || value === null || value === '') return '';
  var n = wholeNumber(value);
  if (n === null || n < min || n > max) {
    throw new Error(where + ': ' + field + ' must be whole seconds, ' + min + ' to ' + max + ', or blank');
  }
  return String(n);
}

/**
 * Give every row of a section the same `rest_s` and `switch_s` (#576).
 *
 * A section's values come from the first exercise that names them (the key
 * present, even as blank), else from `inherited[section]` (replaceTemplate's
 * existing rows), else blank. Two exercises naming different values for one
 * section are refused. Sections with no rest (warmup, cooldown, none) are
 * always blank; a non-blank value there is refused.
 */
function applySectionRest(entries, resolved, inherited, errors) {
  var chosen = {};
  entries.forEach(function (e) {
    var ex = e.input;
    var section = resolved[e.index].section;
    var where = 'exercises[' + e.at + ']';
    var hasRest = ex.rest_s !== undefined;
    var hasSwitch = ex.switch_s !== undefined;
    if (!hasRest && !hasSwitch) return;

    var rest = '';
    var sw = '';
    try {
      rest = templateRestValue(where, 'rest_s', ex.rest_s, REST_SECONDS_MIN, REST_SECONDS_MAX);
      sw = templateRestValue(where, 'switch_s', ex.switch_s, SWITCH_SECONDS_MIN, SWITCH_SECONDS_MAX);
    } catch (err) {
      errors.push(err.message);
      return;
    }
    if (REST_SECTIONS.indexOf(section) === -1 && (rest !== '' || sw !== '')) {
      errors.push(where + ': section "' + (section || 'none') + '" has no rest');
      return;
    }
    if (SWITCH_SECTIONS.indexOf(section) === -1 && sw !== '') {
      errors.push(where + ': switch_s applies only to SS1, SS2, SS3 and burnout');
      return;
    }

    var mine = chosen[section] || (chosen[section] = {});
    ['rest_s', 'switch_s'].forEach(function (field) {
      var given = field === 'rest_s' ? hasRest : hasSwitch;
      if (!given) return;
      var value = field === 'rest_s' ? rest : sw;
      if (mine[field] !== undefined && mine[field] !== value) {
        errors.push(where + ': every exercise in section ' + section + ' must have the same ' + field);
        return;
      }
      mine[field] = value;
    });
  });

  for (var i = 0; i < resolved.length; i++) {
    var section = resolved[i].section;
    var own = chosen[section] || {};
    var old = (inherited && inherited[section]) || {};
    var hasRest = REST_SECTIONS.indexOf(section) !== -1;
    var hasSwitch = SWITCH_SECTIONS.indexOf(section) !== -1;
    resolved[i].rest_s = !hasRest ? '' : own.rest_s !== undefined ? own.rest_s : cell(old.rest_s);
    resolved[i].switch_s = !hasSwitch ? '' : own.switch_s !== undefined ? own.switch_s : cell(old.switch_s);
  }
}

/** { section: { rest_s, switch_s } } from a template's stored rows: the first row of each section wins. */
function sectionRestOf(rows) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i].section;
    if (!Object.prototype.hasOwnProperty.call(out, s)) {
      out[s] = { rest_s: cell(rows[i].rest_s), switch_s: cell(rows[i].switch_s) };
    }
  }
  return out;
}

/** Every template row, in sheet order. */
function getTemplateRows() {
  var rows = getAllRows(getSheet(TEMPLATES_SHEET));
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    out.push(rowToTemplateRow(rows[i], i + 2));
  }
  return out;
}

/** Rows grouped into templates, exercises by order and templates by name. */
function groupTemplateRows(rows) {
  var order = [];
  var byId = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!Object.prototype.hasOwnProperty.call(byId, row.template_id)) {
      byId[row.template_id] = { id: row.template_id, name: row.template_name, exercises: [] };
      order.push(row.template_id);
    }
    byId[row.template_id].exercises.push(row);
  }

  var templates = order.map(function (id) { return byId[id]; });
  for (var j = 0; j < templates.length; j++) {
    templates[j].exercises.sort(function (a, b) { return a.order - b.order; });
  }
  return templates.sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function getTemplates() {
  return groupTemplateRows(getTemplateRows());
}

/** A template by id or name, or a thrown error listing what is available. */
function resolveTemplate(ref, templates) {
  var q = String(ref === undefined ? '' : ref).trim().toLowerCase();
  if (q === '') throw new Error('A template reference is required.');

  var list = templates || getTemplates();
  var match = null;
  var i;
  for (i = 0; i < list.length; i++) if (list[i].id.toLowerCase() === q) { match = list[i]; break; }
  if (!match) for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase() === q) { match = list[i]; break; }
  if (!match) for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase().indexOf(q) !== -1) { match = list[i]; break; }

  if (!match) {
    throw new Error(
      'No template matching "' + ref + '". Available: ' +
      (list.map(function (t) { return t.name; }).join(', ') || '(none)')
    );
  }
  return match;
}

/**
 * Validate an exercise list against the library, resolving each reference and
 * writing the library's *current* name rather than whatever the caller sent.
 *
 * Every problem is collected rather than thrown on the first: someone fixing
 * a template should see all of them at once, not one per round trip.
 */
function resolveTemplateExercises(exercises, library, inheritedRest) {
  var resolved = [];
  var errors = [];
  var entries = [];

  exercises.forEach(function (ex, i) {
    var where = 'exercises[' + i + '] "' + (ex.exercise || ex.exercise_id || '') + '"';

    var found;
    try {
      found = resolveExercise(ex.exercise || ex.exercise_id, library);
    } catch (err) {
      errors.push(where + ': ' + (err.message || String(err)));
      return;
    }

    if (ex.section !== undefined && ex.section !== '' && SECTIONS.indexOf(ex.section) === -1) {
      errors.push(where + ': invalid section "' + ex.section + '". Expected one of: ' + SECTIONS.join(', '));
      return;
    }

    var sets = Number(ex.sets);
    if (!isFinite(sets) || Math.floor(sets) !== sets || sets < 1) {
      errors.push(where + ': sets must be a whole number of at least 1, got ' + JSON.stringify(ex.sets));
      return;
    }

    entries.push({ index: resolved.length, at: i, input: ex });
    resolved.push({
      exercise_id: found.id,
      // The library's name, never the caller's copy — that is #120.
      exercise_name: found.name,
      section: cell(ex.section),
      sets: String(sets),
      reps: normalizeRangeToMax(ex.reps),
    });
  });

  applySectionRest(entries, resolved, inheritedRest, errors);
  return { exercises: resolved, errors: errors };
}

function createTemplate(data) {
  if (!data || !data.name) throw new Error('name is required');
  if (!data.exercises || !data.exercises.length) {
    throw new Error('a template needs at least one exercise');
  }

  var resolved = resolveTemplateExercises(data.exercises, getExercises());
  if (resolved.errors.length) throw new Error(resolved.errors.join('; '));

  var templateId = data.id || 'tpl_' + Utilities.getUuid().slice(0, 8);
  var sheet = getSheet(TEMPLATES_SHEET);
  for (var i = 0; i < resolved.exercises.length; i++) {
    sheet.appendRow(asText(templateRowValues(templateId, data.name, resolved.exercises[i], i + 1)));
  }

  return { id: templateId, name: data.name, exercises: resolved.exercises };
}

/**
 * Replace a template's rows wholesale — delete, then append — as the app does.
 *
 * Deletion is bottom-to-top. Removing a row shifts every row below it up, so
 * descending order is what keeps the remaining indices valid; ascending order
 * deletes the wrong rows after the first. The same rule as everywhere else in
 * this codebase.
 */
function replaceTemplate(templateId, data) {
  if (!templateId) throw new Error('template_id is required');
  if (!data || !data.exercises || !data.exercises.length) {
    throw new Error('a template needs at least one exercise');
  }

  var existing = getTemplateRows().filter(function (r) { return r.template_id === templateId; });
  if (!existing.length) throw new Error('Template "' + templateId + '" not found');

  var name = data.name || existing[0].template_name;

  // #576: a section the payload says nothing about keeps its stored rest.
  var resolved = resolveTemplateExercises(data.exercises, getExercises(), sectionRestOf(existing));
  if (resolved.errors.length) throw new Error(resolved.errors.join('; '));

  var sheet = getSheet(TEMPLATES_SHEET);
  var rowNumbers = existing
    .map(function (r) { return r.sheetRow; })
    .sort(function (a, b) { return b - a; });
  for (var i = 0; i < rowNumbers.length; i++) {
    sheet.deleteRow(rowNumbers[i]);
  }

  for (var j = 0; j < resolved.exercises.length; j++) {
    sheet.appendRow(asText(templateRowValues(templateId, name, resolved.exercises[j], j + 1)));
  }

  return { id: templateId, name: name, exercises: resolved.exercises };
}
