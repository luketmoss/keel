// Walkthroughs (#711): one JSON document per recipe, format 1, written in
// Claude sessions and saved through MCP. `validateWalkthrough` is the only
// copy of the format's rules: `setWalkthrough` refuses a document that fails
// it and saves nothing, and recipe reads run it again against the current
// lines, so a later recipe edit marks the walkthrough stale instead of being
// refused. The format reference is forage/docs/design/711-walkthroughs.md.

/** At most this many problems are listed, then `and N more`. */
var WALKTHROUGH_MAX_PROBLEMS = 20;
/** Shares of one line may add up to 1 within this (⅓ is written 0.3333). */
var SHARE_TOLERANCE = 0.02;

var WALKTHROUGH_FIELDS_V1 = ['format', 'recipe', 'note', 'equipment', 'prep', 'cook'];
var PREP_GROUP_FIELDS = ['id', 'title', 'when', 'uses', 'tasks', 'makes'];
var COOK_STEP_FIELDS = ['id', 'title', 'do', 'uses', 'heat', 'lookFor', 'timer', 'wait', 'meanwhile'];
var USE_LINE_FIELDS = ['line', 'share'];
var CLOCK_FIELDS = ['min', 'label'];
var WALKTHROUGH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A number followed by a unit, in free text that would not scale: `2 tbsp`,
 * `1/2 cup`, `1½ cups`, `3 cloves`. "90 minutes", "1-inch" and "medium heat"
 * do not match.
 */
var TEXT_AMOUNT = new RegExp(
  '(?:\\d+(?:\\.\\d+)?(?:\\s*-\\s*\\d+)?(?:\\s*\\/\\s*\\d+)?\\s*[½⅓⅔¼¾⅛⅜⅝⅞]?|[½⅓⅔¼¾⅛⅜⅝⅞])\\s*-?\\s*' +
    '(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|ml|milliliters?|millilitres?|cloves?)\\b',
  'i',
);

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isText(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** A line's name for a message: its text without the amount, up to the first comma or parenthesis. `salt`. */
function walkthroughLineName(line) {
  var name = '';
  try {
    name = parseLine(line.text).name;
  } catch (err) {
    name = '';
  }
  return name || cell(line.text).replace(/[,(].*$/, '').trim();
}

/** `1`, `0.5`, `0.6667`: at most four decimals, no trailing zeros. */
function shareText(n) {
  return String(Math.round(n * 10000) / 10000);
}

/**
 * Check a walkthrough against a recipe's lines. Returns `{ ok, problems,
 * warnings, summary }`: `problems` in document order, at most 20 then `and N
 * more`, each starting with the part at fault; `ok` is no problems at all.
 * `summary` is what Before you start and the saved answer read.
 */
function validateWalkthrough(recipeId, lines, doc) {
  var problems = [];
  var warnings = [];
  var add = function (msg) { problems.push(msg); };
  var summary = { prep_groups: 0, tasks: 0, cook_steps: 0, active: 0, waited: 0 };

  if (!isPlainObject(doc)) {
    return { ok: false, problems: ['walkthrough: must be a JSON object'], warnings: [], summary: summary };
  }

  var unknownFields = function (where, obj, allowed) {
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) add(where + ': unknown field "' + k + '"');
    });
  };

  if (doc.format !== 1) add('format: expected 1, got ' + JSON.stringify(doc.format === undefined ? null : doc.format));
  if (doc.recipe !== recipeId) {
    add('recipe: this walkthrough is for ' + JSON.stringify(doc.recipe === undefined ? null : doc.recipe) +
      ', not "' + recipeId + '"');
  }
  unknownFields('walkthrough', doc, WALKTHROUGH_FIELDS_V1);
  if (doc.note !== undefined && typeof doc.note !== 'string') add('note: must be text');
  if (doc.equipment !== undefined) {
    if (!Array.isArray(doc.equipment)) add('equipment: must be a list of text');
    else doc.equipment.forEach(function (e, i) { if (!isText(e)) add('equipment[' + i + ']: must be text'); });
  }

  var prep = Array.isArray(doc.prep) ? doc.prep : [];
  var cook = Array.isArray(doc.cook) ? doc.cook : [];
  if (!Array.isArray(doc.prep)) add('prep: must be a list of prep groups');
  if (!Array.isArray(doc.cook)) add('cook: must be a list of cook steps');
  else if (!cook.length) add('cook: needs at least one step');

  var byLine = {};
  lines.forEach(function (l) { byLine[l.line_id] = l; });

  // Ids first, so later checks can name groups and steps.
  var seen = {};
  var prepIndex = {};
  var cookIndex = {};
  var checkId = function (kind, x, i) {
    if (!isPlainObject(x)) {
      add(kind + '[' + i + ']: must be an object');
      return null;
    }
    if (x.id === undefined || x.id === null || x.id === '') {
      add(kind + ': ' + (kind === 'prep' ? 'a group' : 'a step') + ' has no id');
      return null;
    }
    if (typeof x.id !== 'string' || !WALKTHROUGH_ID.test(x.id)) {
      add(kind + ' ' + String(x.id) + ': id must be lowercase words joined by hyphens, such as "veg-in"');
      return null;
    }
    if (seen[x.id]) {
      add(kind + ' ' + x.id + ': id is used twice');
      return null;
    }
    seen[x.id] = true;
    return x.id;
  };
  prep.forEach(function (p, i) { var id = checkId('prep', p, i); if (id) prepIndex[id] = i; });
  cook.forEach(function (c, i) { var id = checkId('cook', c, i); if (id) cookIndex[id] = i; });

  var isWaitStep = function (id) {
    return typeof id === 'string' && has(cookIndex, id) && isPlainObject(cook[cookIndex[id]].wait);
  };
  var named = function (kind, x) {
    var id = isPlainObject(x) && typeof x.id === 'string' ? x.id : '?';
    return isPlainObject(x) && isText(x.title) ? kind + ' ' + id + ' "' + x.title + '"' : kind + ' ' + id;
  };
  var plain = function (kind, x, i) {
    return isPlainObject(x) && typeof x.id === 'string' && x.id ? kind + ' ' + x.id : kind + '[' + i + ']';
  };

  // Where each line is measured, for the shares check: [{where, share}].
  var takes = {};
  var take = function (where, path, u) {
    if (!isText(u.line)) {
      add(path + ': "line" must be a line id such as "L3"');
      return;
    }
    if (!has(byLine, u.line)) {
      add(where + ': no ingredient line ' + u.line);
      return;
    }
    var share = u.share === undefined ? 1 : u.share;
    if (typeof share !== 'number' || !(share > 0 && share <= 1)) {
      add(where + ': share of ' + u.line + ' must be above 0 and at most 1');
      return;
    }
    (takes[u.line] = takes[u.line] || []).push({ where: where, share: share });
  };
  var usesList = function (where, x) {
    if (x.uses === undefined) return [];
    if (!Array.isArray(x.uses)) {
      add(where + ': "uses" must be a list');
      return [];
    }
    return x.uses;
  };
  var freeText = function (where, what, value) {
    var m = typeof value === 'string' ? TEXT_AMOUNT.exec(value) : null;
    if (m) {
      warnings.push(where + ': ' + what + ' seems to give an amount ("' + m[0].trim() +
        '"); amounts come from the recipe lines and would not scale');
    }
  };

  prep.forEach(function (p, i) {
    if (!isPlainObject(p)) return;
    var where = plain('prep', p, i);
    unknownFields(where, p, PREP_GROUP_FIELDS);
    if (!isText(p.title)) add(where + ': "title" must be text');
    if (!isText(p.makes)) add(where + ': "makes" must be text');
    if (p.when !== 'start' && !isWaitStep(p.when)) {
      add(where + ': when must be "start" or the id of a cook step with a wait, not ' +
        JSON.stringify(p.when === undefined ? null : p.when));
    }
    usesList(where, p).forEach(function (u, j) {
      var path = where + '.uses[' + j + ']';
      if (!isPlainObject(u)) return add(path + ': must be {"line": ...} or {"prep": ...}');
      if (has(u, 'prep')) return add(where + ': prep groups use ingredient lines, not other groups');
      unknownFields(path, u, USE_LINE_FIELDS);
      take(where, path, u);
    });
    if (!Array.isArray(p.tasks) || !p.tasks.length) {
      add(where + ': needs at least one task');
    } else {
      p.tasks.forEach(function (t, j) {
        if (!isText(t)) add(where + '.tasks[' + j + ']: must be text');
        else freeText(where, 'task ' + (j + 1), t);
      });
      summary.tasks += p.tasks.length;
    }
  });

  var usedIn = {};
  cook.forEach(function (c, i) {
    if (!isPlainObject(c)) return;
    var where = plain('cook', c, i);
    unknownFields(where, c, COOK_STEP_FIELDS);
    if (!isText(c.title)) add(where + ': "title" must be text');
    if (!isText(c.do)) add(where + ': needs "do" text');
    else freeText(where, '"do"', c.do);
    ['heat', 'lookFor'].forEach(function (f) {
      if (c[f] !== undefined && !isText(c[f])) add(where + ': "' + f + '" must be text');
    });
    if (c.timer !== undefined && c.wait !== undefined) add(where + ': a step has a timer or a wait, not both');
    ['timer', 'wait'].forEach(function (f) {
      var t = c[f];
      if (t === undefined) return;
      if (!isPlainObject(t)) return add(where + ': "' + f + '" must be {"min", "label"}');
      unknownFields(where + '.' + f, t, CLOCK_FIELDS);
      if (typeof t.min !== 'number' || !(t.min > 0)) add(where + ': ' + f + ' minutes must be above 0');
      else if (c.timer === undefined || c.wait === undefined) summary[f === 'timer' ? 'active' : 'waited'] += t.min;
      if (!isText(t.label)) add(where + '.' + f + ': "label" must be text');
    });

    usesList(where, c).forEach(function (u, j) {
      var path = where + '.uses[' + j + ']';
      if (!isPlainObject(u)) return add(path + ': must be {"line": ...} or {"prep": ...}');
      if (!has(u, 'prep')) {
        unknownFields(path, u, USE_LINE_FIELDS);
        return take(where, path, u);
      }
      unknownFields(path, u, ['prep']);
      if (typeof u.prep !== 'string' || !has(prepIndex, u.prep)) {
        return add(where + ': no prep group ' + JSON.stringify(u.prep));
      }
      if (has(usedIn, u.prep)) {
        add(named('cook', c) + ': prep ' + u.prep + ' was already used in cook ' + usedIn[u.prep]);
      } else {
        usedIn[u.prep] = c.id;
      }
      // A group made during a wait is ready only after that wait.
      var when = prep[prepIndex[u.prep]].when;
      if (when !== 'start' && isWaitStep(when) && cookIndex[when] >= i) {
        add(named('cook', c) + ': uses prep ' + u.prep + ', which is only made during ' + when +
          (cookIndex[when] === i ? ', this step' : ', a later step'));
      }
    });

    if (c.meanwhile !== undefined) {
      if (!isPlainObject(c.wait)) add(where + ': meanwhile is only for steps with a wait');
      if (!Array.isArray(c.meanwhile)) {
        add(where + ': "meanwhile" must be a list of prep group ids');
      } else {
        c.meanwhile.forEach(function (m) {
          if (typeof m !== 'string' || !has(prepIndex, m)) return add(where + ': meanwhile names no prep group ' + JSON.stringify(m));
          var when = prep[prepIndex[m]].when;
          if (when !== c.id) add(where + ': meanwhile lists ' + m + ', whose when is ' + JSON.stringify(when === undefined ? null : when));
        });
      }
    }
  });

  prep.forEach(function (p) {
    if (!isPlainObject(p) || typeof p.id !== 'string' || !has(prepIndex, p.id)) return;
    if (!has(usedIn, p.id)) add(named('prep', p) + ': made but never used in a cook step');
    if (p.when !== 'start' && isWaitStep(p.when)) {
      var listed = cook[cookIndex[p.when]].meanwhile;
      if (!Array.isArray(listed) || listed.indexOf(p.id) === -1) {
        add(named('prep', p) + ': its wait step ' + p.when + " doesn't list it under meanwhile");
      }
    }
  });

  lines.forEach(function (l) {
    var list = takes[l.line_id] || [];
    var total = list.reduce(function (a, t) { return a + t.share; }, 0);
    var label = 'line ' + l.line_id + ' (' + walkthroughLineName(l) + ')';
    if (!list.length) {
      if (!l.optional) add(label + ': never used in any prep group or cook step');
      return;
    }
    if (Math.abs(total - 1) > SHARE_TOLERANCE) {
      add(label + ': shares add up to ' + shareText(Math.round(total * 1000) / 1000) + ', not 1 (used in ' +
        list.map(function (t) { return t.where + ' ' + shareText(t.share); }).join(', ') + ')');
    }
  });

  if (cook.length && !cook.some(function (c) { return isPlainObject(c) && isText(c.lookFor); })) {
    warnings.push('no step says what to look for');
  }

  summary.prep_groups = prep.length;
  summary.cook_steps = cook.length;
  var shown = problems;
  if (problems.length > WALKTHROUGH_MAX_PROBLEMS) {
    shown = problems.slice(0, WALKTHROUGH_MAX_PROBLEMS);
    shown.push('and ' + (problems.length - WALKTHROUGH_MAX_PROBLEMS) + ' more');
  }
  return { ok: problems.length === 0, problems: shown, warnings: warnings, summary: summary };
}

/** A recipe's lines in order, for the validator. */
function walkthroughLines(recipeId) {
  return sortLines(listRecords('RecipeLines', function (l) { return l.recipe_id === recipeId; }));
}

/** The stored document checked against the current lines: `{ ok, problems, warnings }`. */
function walkthroughCheck(recipeId, doc, lines) {
  var v = validateWalkthrough(recipeId, lines || walkthroughLines(recipeId), doc);
  return { ok: v.ok, problems: v.problems, warnings: v.warnings };
}

function getWalkthrough(recipeId) {
  var row = getRecord('Walkthroughs', { recipe_id: cell(recipeId) });
  if (!row) return null;
  return { recipe_id: row.recipe_id, format: row.format, walkthrough: row.walkthrough_json, updated: row.updated };
}

/**
 * Payload `{ recipe_id, walkthrough }`, the walkthrough as an object or as JSON
 * text. Refused with every problem (`code: invalid_walkthrough`, `problems`,
 * `warnings`), saving nothing; saved, it answers the row with `recipe_name`,
 * `warnings` and `summary`.
 */
function setWalkthrough(payload) {
  var recipeId = requireString('recipe_id', payload && payload.recipe_id);
  var recipe = getRecord('Recipes', { id: recipeId });
  if (!recipe) {
    var missing = new Error('There is no recipe ' + recipeId);
    missing.code = 'not_found';
    throw missing;
  }
  var doc = payload.walkthrough;
  if (typeof doc === 'string') {
    try {
      doc = JSON.parse(doc);
    } catch (err) {
      throw new Error('walkthrough is not valid JSON');
    }
  }
  var v = validateWalkthrough(recipeId, walkthroughLines(recipeId), doc);
  if (!v.ok) {
    var count = v.problems.length - (/^and \d+ more$/.test(v.problems[v.problems.length - 1]) ? 1 : 0);
    var refused = new Error('Nothing saved. The walkthrough has problems: ' + v.problems.join('; '));
    refused.code = 'invalid_walkthrough';
    refused.extra = { problems: v.problems, warnings: v.warnings, shown: count };
    throw refused;
  }
  upsertRecord('Walkthroughs', { recipe_id: recipeId, format: 1, walkthrough_json: doc, updated: isoNow() });
  var out = getWalkthrough(recipeId);
  out.recipe_name = recipe.name;
  out.warnings = v.warnings;
  out.summary = v.summary;
  return out;
}

function deleteWalkthrough(payload) {
  var recipeId = requireString('recipe_id', payload && payload.recipe_id);
  if (!deleteRecord('Walkthroughs', { recipe_id: recipeId })) {
    throw new Error('Recipe "' + recipeId + '" has no walkthrough');
  }
  return { recipe_id: recipeId, deleted: true };
}
