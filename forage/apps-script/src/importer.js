// Recipe import (#706): one copy of reading, parsing and matching, which the
// app and the agent tool both call through `importRecipe`, so they cannot
// disagree about what "1-1/2 pounds" means. No LLM: schema.org Recipe JSON-LD,
// a plain-text format, or a recipe a caller has already structured.
//
// Ported from the #700 spike (findRecipe, flattenSteps, yieldOf, parseLine,
// matchFood) and the old Worker's extractor in docs/reference/parsing.ts.
//
// Matching is deliberately narrow. A line is matched to a food only when its
// normalised name equals the food's, or equals a learned alias; anything
// looser ("sugar" against "Sugar-apples") is only ever a suggestion.

/** Why a read gave no recipe. Each is fixed text; the app keys its copy on `code`. */
var IMPORT_REFUSALS = {
  bad_url: 'That is not an http or https link to a public site.',
  blocked: 'The site refused to let Forage read the page.',
  unreachable: 'The page could not be reached.',
  no_recipe: 'No recipe was found.',
};

var IMPORT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Config key: normalised ingredient name to food id, learned from saved imports. */
var ALIAS_CONFIG_KEY = 'ingredient_aliases';

/** An error the envelope answers with a `code` and any fields in `extra`. */
function importError(code, message, extra) {
  var err = new Error(message || IMPORT_REFUSALS[code]);
  err.code = code;
  if (extra) err.extra = extra;
  return err;
}

// ---------------------------------------------------------------- the action

/**
 * Payload: exactly one of `url`, `jsonld`, `text` or `recipe` (`url` may come
 * with `jsonld` as its source), `dry_run` (true unless false), and
 * `allow_duplicate`. A dry run answers the preview and writes nothing; a save
 * answers the stored recipe.
 */
function importRecipe(payload) {
  payload = payload || {};
  var draft = readDraft(payload);
  var foods = listRecords('Foods');
  var byId = {};
  foods.forEach(function (f) { byId[f.id] = f; });
  var preview = buildPreview(draft, foods, byId, readAliases(byId));

  if (payload.dry_run !== false && payload.dry_run !== 'false') return preview;
  return saveImport(preview, toBool(payload.allow_duplicate));
}

/** Parse `payload`, refusing an oversized `jsonld` or `text` by name before the payload as a whole. */
function parseImportPayload(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  var payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error('payload is not valid JSON');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be an object');
  ['jsonld', 'text'].forEach(function (field) {
    if (!has(payload, field)) return;
    var size = inputLength(payload[field]);
    if (size > MAX_PAYLOAD_CHARS) {
      throw importError('too_large', field + ' is ' + size + ' characters, over the ' + MAX_PAYLOAD_CHARS + ' limit');
    }
  });
  // JSON escaping can grow an input that fits; the rest of the payload is small.
  if (raw.length > 2 * MAX_PAYLOAD_CHARS) {
    throw importError('too_large', 'payload is ' + raw.length + ' characters, over the ' + 2 * MAX_PAYLOAD_CHARS + ' limit');
  }
  return payload;
}

function inputLength(value) {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) {
    return value.reduce(function (n, v) { return n + (typeof v === 'string' ? v.length : JSON.stringify(v).length); }, 0);
  }
  return value === undefined || value === null ? 0 : JSON.stringify(value).length;
}

/**
 * The recipe as read, before parsing and matching:
 * `{ name, source_url, servings, total_min, notes, lines: [{section, text} | structured], steps }`.
 */
function readDraft(payload) {
  var given = ['jsonld', 'text', 'recipe'].filter(function (f) {
    return has(payload, f) && payload[f] !== null && payload[f] !== '';
  });
  var hasUrl = typeof payload.url === 'string' && payload.url.trim() !== '';
  if (given.length > 1 || (given.length === 0 && !hasUrl) || (hasUrl && given.length && given[0] !== 'jsonld')) {
    throw new Error('send exactly one of url, jsonld, text or recipe');
  }
  if (given[0] === 'recipe') return draftFromStructured(payload.recipe);
  if (given[0] === 'text') {
    if (typeof payload.text !== 'string') throw new Error('text must be text');
    return draftFromText(payload.text);
  }
  if (given[0] === 'jsonld') {
    var source = hasUrl ? checkUrl(payload.url) : '';
    return draftFromBlocks(jsonldBlocks(payload.jsonld), source);
  }
  var url = checkUrl(payload.url);
  return draftFromBlocks(fetchBlocks(url), url);
}

/** `jsonld` as a list of blocks: strings to parse, or objects already parsed. */
function jsonldBlocks(value) {
  var list = Array.isArray(value) ? value : [value];
  var out = [];
  list.forEach(function (block) {
    if (block && typeof block === 'object') {
      out.push(block);
      return;
    }
    try {
      out.push(JSON.parse(String(block)));
    } catch (err) {
      // A bad block is skipped, as a browser skips one.
    }
  });
  return out;
}

function draftFromBlocks(blocks, sourceUrl) {
  var recipe = null;
  for (var i = 0; i < blocks.length && !recipe; i++) recipe = findRecipe(blocks[i]);
  if (!recipe) throw importError('no_recipe');
  var draft = recipeFromJsonLd(recipe);
  if (sourceUrl) draft.source_url = sourceUrl;
  return draft;
}

// ---------------------------------------------------------------- fetching

/** An http(s) URL to a named public host, or a `bad_url` refusal. */
function checkUrl(value) {
  var url = cell(value).trim();
  var m = /^https?:\/\/([^\/?#]*)/i.exec(url);
  if (!m || /\s/.test(url)) throw importError('bad_url');
  var authority = m[1];
  if (authority.indexOf('@') !== -1) throw importError('bad_url');
  var host = authority.replace(/:\d*$/, '').toLowerCase();
  if (!host || host.charAt(0) === '[' || /^[\d.]+$/.test(host) || host.indexOf('.') === -1) throw importError('bad_url');
  if (host === 'localhost' || /\.localhost$/.test(host)) throw importError('bad_url');
  return url;
}

/** The host a URL names, without `www.`. */
function siteOf(url) {
  var m = /^https?:\/\/([^\/?#:@]+)/i.exec(cell(url).trim());
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

/**
 * Fetch the page and answer its JSON-LD blocks. A refusal is `blocked`; any
 * other failure, a thrown fetch included, is `unreachable`. UrlFetchApp's own
 * message is never passed on.
 */
function fetchBlocks(url) {
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': IMPORT_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
  } catch (err) {
    throw importError('unreachable');
  }
  var status = response.getResponseCode();
  if (status === 401 || status === 402 || status === 403 || status === 429) throw importError('blocked');
  if (status < 200 || status >= 300) throw importError('unreachable');
  var html = response.getContentText();
  var blocks = [];
  var re = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  return jsonldBlocks(blocks);
}

// ---------------------------------------------------------------- JSON-LD

function isRecipeNode(node) {
  var t = node && node['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.indexOf('Recipe') !== -1);
}

/** The first Recipe node: the block itself, inside an array, or inside `@graph`. */
function findRecipe(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (var i = 0; i < data.length; i++) {
      var found = findRecipe(data[i]);
      if (found) return found;
    }
    return null;
  }
  if (isRecipeNode(data)) return data;
  return findRecipe(data['@graph']);
}

var NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  frac12: '½', frac14: '¼', frac34: '¾', frac13: '⅓', frac23: '⅔', frac18: '⅛',
  deg: '°', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

/** Text with tags and HTML entities decoded out, whitespace collapsed. */
function decodeText(value) {
  var s = cell(value).replace(/<[^>]*>/g, ' ');
  // Twice, for a page that encoded its entities again ("&amp;#8217;").
  for (var pass = 0; pass < 2; pass++) {
    s = s
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&([a-z]+\d*);/gi, function (all, name) {
        return has(NAMED_ENTITIES, name.toLowerCase()) ? NAMED_ENTITIES[name.toLowerCase()] : all;
      });
  }
  return s.replace(/[\s ]+/g, ' ').trim();
}

/** Servings: the first number in `recipeYield`, from the first entry that has one. */
function yieldOf(value) {
  var v = Array.isArray(value)
    ? value.map(String).filter(function (s) { return /\d/.test(s); })[0]
    : value;
  var m = /\d+/.exec(cell(v));
  var n = m ? Number(m[0]) : 0;
  return n > 0 ? n : null;
}

/** Minutes in an ISO 8601 duration (`PT1H30M`, `P0Y0M0DT1H5M0.000S`), or a text one (`40 minutes`). */
function durationMinutes(value) {
  var s = cell(value).trim();
  if (!s) return null;
  var m = /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(s);
  if (m) {
    var n = function (i) { return m[i] ? Number(m[i]) : 0; };
    return Math.round(n(3) * 7 * 1440 + n(4) * 1440 + n(5) * 60 + n(6) + n(7) / 60);
  }
  return timeTextMinutes(s);
}

/** `2 hours`, `45 min`, `1h 30m`, `1 1/2 hours`: minutes, or null. */
function timeTextMinutes(text) {
  var s = cell(text).toLowerCase();
  var total = 0;
  var found = false;
  var re = /(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*(hours?|hrs?|h|minutes?|mins?|m)\b/g;
  var m;
  while ((m = re.exec(s))) {
    var amount = Number(m[1]) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
    total += /^h/.test(m[4]) ? amount * 60 : amount;
    found = true;
  }
  return found ? Math.round(total) : null;
}

/**
 * Steps from `recipeInstructions`, keeping each HowToSection's name as the
 * step's `section`. A step's own `name` is kept only when it is not just the
 * start of its text, which is how most sites fill it.
 */
function flattenSteps(ins, section, out) {
  out = out || [];
  section = section || '';
  if (!ins) return out;
  if (typeof ins === 'string') {
    ins.split(/\n+/).map(decodeText).filter(Boolean).forEach(function (text) {
      out.push({ section: section, name: '', text: text });
    });
    return out;
  }
  if (Array.isArray(ins)) {
    ins.forEach(function (x) { flattenSteps(x, section, out); });
    return out;
  }
  if (typeof ins !== 'object') return out;
  var type = ins['@type'];
  if (type === 'HowToSection' || (Array.isArray(type) && type.indexOf('HowToSection') !== -1)) {
    return flattenSteps(ins.itemListElement, decodeText(ins.name) || section, out);
  }
  if (ins.text) {
    var text = decodeText(ins.text);
    var name = decodeText(ins.name);
    var stem = name.replace(/\s*…$|\.\.\.$/, '');
    if (!name || text.indexOf(stem) === 0) name = '';
    if (text) out.push({ section: section, name: name, text: text });
  } else if (ins.itemListElement) {
    flattenSteps(ins.itemListElement, section, out);
  }
  return out;
}

function recipeFromJsonLd(r) {
  var total = durationMinutes(r.totalTime);
  if (total === null) {
    var prep = durationMinutes(r.prepTime);
    var cook = durationMinutes(r.cookTime);
    if (prep !== null || cook !== null) total = (prep || 0) + (cook || 0);
  }
  var ingredients = Array.isArray(r.recipeIngredient)
    ? r.recipeIngredient
    : r.recipeIngredient ? [r.recipeIngredient] : [];
  return {
    name: decodeText(r.name),
    source_url: typeof r.url === 'string' && /^https?:/i.test(r.url) ? r.url : '',
    servings: yieldOf(r.recipeYield),
    total_min: total,
    notes: '',
    lines: ingredients.map(decodeText).filter(Boolean).map(function (text) { return { section: '', text: text }; }),
    steps: flattenSteps(r.recipeInstructions),
  };
}

// ---------------------------------------------------------------- plain text

var TEXT_BLOCKS = /^\s*#{0,3}\s*(ingredients|steps|directions|instructions|method)\s*:?\s*$/i;
var STEP_MARKER = /^\s*(?:step\s+\d+\s*[:.)]?|\d+\s*[.)])\s*/i;

/** A heading inside a block: ends in `:` or starts with `#`, and has no digits. */
function textSection(line) {
  var s = line.trim();
  if (/\d/.test(s) || !(/:$/.test(s) || /^#/.test(s))) return null;
  return s.replace(/^#+\s*/, '').replace(/\s*:$/, '').trim() || null;
}

/** The plain-text format of the issue body: a name, Serves/Time/Source lines, Ingredients and Steps. */
function draftFromText(text) {
  var rows = String(text).split(/\r?\n/);
  var draft = { name: '', source_url: '', servings: null, total_min: null, notes: '', lines: [], steps: [] };
  var block = null;
  var sawIngredients = false;
  var section = '';
  var stepRows = [];

  rows.forEach(function (raw) {
    var row = raw.replace(/ /g, ' ').trim();
    var heading = TEXT_BLOCKS.exec(row);
    if (heading) {
      block = /ingredients/i.test(heading[1]) ? 'ingredients' : 'steps';
      if (block === 'ingredients') sawIngredients = true;
      section = '';
      return;
    }
    if (!block) {
      if (!row) return;
      var meta;
      if (!draft.name) draft.name = row.replace(/^#+\s*/, '');
      else if ((meta = /^(serves|servings|makes|yield)\b\s*:?\s*(.*)$/i.exec(row))) draft.servings = yieldOf(meta[2]);
      else if ((meta = /^(total time|time)\b\s*:?\s*(.*)$/i.exec(row))) draft.total_min = timeTextMinutes(meta[2]);
      else if ((meta = /^source\b\s*:?\s*(.*)$/i.exec(row))) {
        // A link is the source; anything else ("Grandma") is kept as a note.
        if (/^https?:\/\/\S+$/i.test(meta[1])) draft.source_url = meta[1];
        else draft.notes = 'Source: ' + meta[1];
      }
      return;
    }
    if (block === 'ingredients') {
      if (!row) return;
      var s = textSection(row);
      if (s) section = s;
      else draft.lines.push({ section: section, text: row.replace(/^[-*•]\s+/, '') });
      return;
    }
    stepRows.push(row);
  });

  if (!sawIngredients) throw importError('no_recipe');
  draft.steps = splitTextSteps(stepRows);
  return draft;
}

/** Steps split on numbered markers, else on blank lines, else one per line; headings set the section. */
function splitTextSteps(rows) {
  while (rows.length && !rows[0]) rows.shift();
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  var numbered = rows.some(function (r) { return STEP_MARKER.test(r); });
  var paragraphs = !numbered && rows.some(function (r, i) { return !r && i > 0 && i < rows.length - 1; });
  var steps = [];
  var section = '';
  var current = null;
  var close = function () {
    if (current && current.text) steps.push(current);
    current = null;
  };
  rows.forEach(function (row) {
    if (!row) {
      if (paragraphs) close();
      return;
    }
    var s = textSection(row);
    if (s) {
      close();
      section = s;
      return;
    }
    var marked = STEP_MARKER.test(row);
    var text = row.replace(STEP_MARKER, '').replace(/^[-*•]\s+/, '');
    if ((numbered && marked) || (!numbered && !paragraphs) || !current) {
      close();
      current = { section: section, name: '', text: text };
    } else {
      current.text += ' ' + text;
    }
  });
  close();
  return steps;
}

// ---------------------------------------------------------------- structured

/** A recipe a caller structured: string lines are parsed, structured ones taken as given. */
function draftFromStructured(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('recipe must be an object');
  if (has(r, 'lines') && !Array.isArray(r.lines)) throw new Error('recipe.lines must be a list');
  if (has(r, 'steps') && !Array.isArray(r.steps)) throw new Error('recipe.steps must be a list');
  return {
    name: cell(r.name).trim(),
    source_url: cell(r.source_url).trim() ? checkUrl(r.source_url) : '',
    servings: optionalNumber('servings', r.servings, { positive: true }),
    total_min: optionalNumber('total_min', r.total_min, { min: 0 }),
    notes: optionalString('notes', r.notes),
    lines: (r.lines || []).map(function (line, i) {
      if (typeof line === 'string') return { section: '', text: line };
      if (!line || typeof line !== 'object') throw new Error('line ' + (i + 1) + ' must be text or an object');
      return { structured: true, raw: line };
    }),
    steps: (r.steps || []).map(function (step, i) {
      if (typeof step === 'string') return { section: '', name: '', text: step };
      if (!step || typeof step !== 'object') throw new Error('step ' + (i + 1) + ' must be text or an object');
      return { section: cell(step.section), name: cell(step.name), text: cell(step.text) };
    }),
  };
}

// ---------------------------------------------------------------- the line parser

var UNICODE_FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
};

/**
 * The unit words a line may start with, to #703's vocabulary: `[unit, factor]`
 * multiplies the quantity. Pints and quarts are cups; pinch and dash are tsp.
 * Longest spellings first, so `fl oz` is tried before `oz`.
 */
var LINE_UNITS = [
  ['fluid ounces', 'fl oz'], ['fluid ounce', 'fl oz'], ['fl. oz', 'fl oz'], ['fl oz', 'fl oz'], ['floz', 'fl oz'],
  ['tablespoons', 'tbsp'], ['tablespoon', 'tbsp'], ['tbsps', 'tbsp'], ['tbsp', 'tbsp'], ['tbs', 'tbsp'], ['tbl', 'tbsp'],
  ['teaspoons', 'tsp'], ['teaspoon', 'tsp'], ['tsps', 'tsp'], ['tsp', 'tsp'],
  ['kilograms', 'kg'], ['kilogram', 'kg'], ['kgs', 'kg'], ['kg', 'kg'],
  ['grams', 'g'], ['gram', 'g'], ['gr', 'g'], ['g', 'g'],
  ['ounces', 'oz'], ['ounce', 'oz'], ['oz', 'oz'],
  ['pounds', 'lb'], ['pound', 'lb'], ['lbs', 'lb'], ['lb', 'lb'],
  ['milliliters', 'ml'], ['milliliter', 'ml'], ['millilitres', 'ml'], ['millilitre', 'ml'], ['ml', 'ml'],
  ['liters', 'l'], ['liter', 'l'], ['litres', 'l'], ['litre', 'l'], ['l', 'l'],
  ['cups', 'cup'], ['cup', 'cup'], ['c', 'cup'],
  ['pints', 'cup', 2], ['pint', 'cup', 2], ['pt', 'cup', 2],
  ['quarts', 'cup', 4], ['quart', 'cup', 4], ['qt', 'cup', 4],
  ['pinches', 'tsp', 1 / 16], ['pinch', 'tsp', 1 / 16], ['dashes', 'tsp', 1 / 8], ['dash', 'tsp', 1 / 8],
  ['cloves', 'clove'], ['clove', 'clove'], ['cans', 'can'], ['can', 'can'], ['slices', 'slice'], ['slice', 'slice'],
  ['large', 'large'], ['medium', 'medium'], ['small', 'small'], ['sticks', 'stick'], ['stick', 'stick'],
  ['sprigs', 'sprig'], ['sprig', 'sprig'], ['bunches', 'bunch'], ['bunch', 'bunch'], ['heads', 'head'],
  ['head', 'head'], ['stalks', 'stalk'], ['stalk', 'stalk'], ['pieces', 'piece'], ['piece', 'piece'],
  ['packages', 'package'], ['package', 'package'], ['pkgs', 'package'], ['pkg', 'package'], ['jars', 'jar'],
  ['jar', 'jar'], ['whole', ''],
];

/** Units a package size can belong to: "1 (15 oz) can", or a bare count. */
var PACKAGE_UNITS = ['can', 'jar', 'package', ''];

/** Mass sizes in grams, for a package. */
var SIZE_G = { g: 1, gram: 1, grams: 1, kg: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592 };

/** Words that describe an ingredient rather than name it: a comma or "or" between them is not a note. */
var DESCRIPTORS = [
  'boneless', 'skinless', 'fresh', 'freshly', 'frozen', 'dried', 'large', 'medium', 'small', 'whole', 'raw', 'cooked',
  'ripe', 'peeled', 'seeded', 'unsalted', 'salted', 'lean', 'extra', 'organic', 'canned', 'chopped', 'minced',
  'diced', 'sliced', 'shredded', 'grated', 'softened', 'melted', 'cold', 'warm', 'hot', 'room', 'temperature',
  'light', 'dark', 'packed', 'ground', 'finely', 'roughly', 'thinly', 'coarsely', 'skin-on', 'bone-in',
  'low-sodium', 'reduced-fat', 'extra-virgin', 'large-grain', 'long', 'short', 'long-', 'short-',
];

var TO_TASTE = /\b(to taste|as needed|for serving|for garnish|for garnishing|for sprinkling)\b/i;

/** A name that is only salt and pepper words. */
var SEASONING = /^(?:(?:kosher|sea|table|flaky|coarse|fine|black|white|freshly|fresh|cracked|ground|and|&|salt|pepper)\s*)+$/i;

var NUMBER = '(?:\\d+(?:\\.\\d+)?(?:\\s*\\/\\s*\\d+)?)';
var HYPHEN_MIXED = /^(\d+)-(\d+)\/(\d+)(?![\d\/])/;
var SPACE_MIXED = /^(\d+)\s+(\d+)\/(\d+)(?![\d\/])/;
var SINGLE = new RegExp('^(' + NUMBER + ')');
var RANGE_TAIL = new RegExp('^\\s*(?:-|to|or)\\s*(' + NUMBER + ')(?![\\d\\/])', 'i');

function numberValue(token) {
  var s = String(token).replace(/\s+/g, '');
  var frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** A leading quantity: `{ qty, rest, range }`, or null. `1-1/2` is 1.5; `1-2` is 1 with a range. */
function readQuantity(s) {
  var m;
  var qty = null;
  var rest = s;
  if ((m = HYPHEN_MIXED.exec(s)) || (m = SPACE_MIXED.exec(s))) {
    qty = Number(m[1]) + (Number(m[3]) ? Number(m[2]) / Number(m[3]) : 0);
    rest = s.slice(m[0].length);
  } else if ((m = SINGLE.exec(s))) {
    qty = numberValue(m[1]);
    rest = s.slice(m[0].length);
  }
  if (qty === null) return null;
  var range = false;
  var r = RANGE_TAIL.exec(rest);
  if (r) {
    var tail = rest.slice(r[0].length);
    // "1-2 cups" or "1 to 2 tbsp"; the high end may itself be mixed ("1 to 1 1/2").
    var mixed = /^\s+\d+\/\d+/.exec(tail);
    if (mixed && /^\d+$/.test(r[1].trim())) tail = tail.slice(mixed[0].length);
    range = true;
    rest = tail;
  }
  return { qty: qty, rest: rest, range: range };
}

/** A leading unit: `{ unit, factor, rest }`, or null. */
function readUnit(s) {
  var lower = s.toLowerCase();
  for (var i = 0; i < LINE_UNITS.length; i++) {
    var word = LINE_UNITS[i][0];
    if (lower.indexOf(word) !== 0) continue;
    var after = s.slice(word.length);
    var dot = /^\./.exec(after);
    if (dot) after = after.slice(1);
    if (after && !/^[\s,;)]/.test(after)) continue;
    // A one-letter unit needs its own dot or space: "1 c. cream", never "1 cherry".
    return { unit: LINE_UNITS[i][1], factor: LINE_UNITS[i][2] || 1, rest: after.replace(/^[\s,]+/, '') };
  }
  return null;
}

function wordsOf(s) {
  return s.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

function onlyDescriptors(s) {
  var words = wordsOf(s.replace(/[*]/g, ''));
  return words.length > 0 && words.every(function (w) { return DESCRIPTORS.indexOf(w) !== -1; });
}

function round3(n) {
  return n === null ? null : Math.round(n * 1000) / 1000;
}

/** A package size in a parenthesis, `15 oz`, `14.5-ounce`, `6 ounces each`: `{ amount, unit }` or null. */
function packageSize(inner) {
  var m = /^\s*(\d+(?:\.\d+)?)\s*-?\s*(fl\.?\s*oz|fluid\s+ounces?|ounces?|oz|grams?|g|kg|lbs?|pounds?|ml)\.?(\s+each)?\s*$/i.exec(inner);
  if (!m) return null;
  var unit = m[2].toLowerCase().replace(/\s+/g, ' ');
  return { amount: Number(m[1]), unit: /^fl|^fluid/.test(unit) ? 'fl oz' : unit };
}

/**
 * One ingredient line as `{ text, qty, unit, name, note, grams, optional, flags }`.
 * `text` is the line verbatim (entities decoded); the rest is the parse. See
 * the issue body for each shape it handles.
 */
function parseLine(raw) {
  var text = decodeText(raw);
  var flags = [];
  var notes = [];
  var flag = function (f) { if (flags.indexOf(f) === -1) flags.push(f); };

  var s = text
    .replace(/⁄/g, '/')
    .replace(/(\d)\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, function (c) { return UNICODE_FRACTIONS[c]; })
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/^[^\w(]+/, '')
    .trim();

  var optional = /\boptional\b/i.test(s);
  if (TO_TASTE.test(s)) {
    flag('to_taste');
    optional = true;
  }
  s = s.replace(/^optional\b[:\s]*/i, '');

  // Parentheses go to the note; the first mass or fluid size is a package size.
  var size = null;
  s = s.replace(/\(+([^()]*(?:\([^()]*\)[^()]*)*)\)+/g, function (_, inner) {
    var clean = inner.replace(/\(|\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '');
    if (!size) size = packageSize(clean);
    if (clean) notes.push(clean);
    return ' ';
  }).replace(/\s+/g, ' ').trim();

  var qty = null;
  var unit = '';
  var q = readQuantity(s);
  if (q) {
    qty = q.qty;
    if (q.range) flag('range');
    s = q.rest.trim();
  }
  // The source's amount is rounded, then converted, so "1 pinch" is exactly 0.0625 tsp.
  qty = round3(qty);
  var u = readUnit(s);
  if (u && (qty !== null || u.factor !== 1)) {
    if (qty === null) qty = 1; // "Pinch of salt", "Dash of pepper"
    qty *= u.factor;
    unit = u.unit;
    s = u.rest;
  }
  s = s.replace(/^of\s+/i, '');

  // "/ 500g", "plus 2 tablespoons", "minus 2 tablespoons": an amount after the amount.
  var extra = new RegExp('^(?:/|plus|minus)\\s+' + NUMBER + '\\s*[a-z.]*\\s+', 'i');
  var lead;
  while ((lead = extra.exec(s))) {
    notes.push(lead[0].trim());
    s = s.slice(lead[0].length);
  }
  s = s.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();

  // What follows the first comma is a note, unless what precedes it only describes.
  var parts = s.split(',');
  while (parts.length > 1 && onlyDescriptors(parts[0])) parts.splice(0, 2, parts[0] + ',' + parts[1]);
  if (parts.length > 1) {
    var rest = parts.slice(1).join(',').trim();
    if (rest) notes.push(rest);
    s = parts[0];
  }

  // "plus 1 tbsp" after the name.
  var plus = /\s+plus\s+.*$/i.exec(s);
  if (plus) {
    notes.push(plus[0].trim());
    s = s.slice(0, plus.index);
  }

  // "fresh or frozen peas" describes; "tamari or soy sauce" is an alternative.
  var alt = /^(.*?)\s*(?:\s(?:or|and\/or)\s|\s?\/\s?)\s*(.+)$/i.exec(s);
  if (alt && alt[1] && !/\d$/.test(alt[1])) {
    if (onlyDescriptors(alt[1])) {
      var words = alt[2].split(/\s+/);
      var lift = 0;
      while (lift < words.length - 1 && DESCRIPTORS.indexOf(words[lift].toLowerCase()) !== -1) lift++;
      notes.unshift((alt[1] + ' or ' + words.slice(0, lift).join(' ')).trim());
      s = words.slice(lift).join(' ');
    } else {
      notes.push('or ' + alt[2]);
      flag('alternative');
      s = alt[1];
    }
  }

  var name = s
    .replace(TO_TASTE, ' ')
    .replace(/\b(optional|divided)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:.\-–]+|[\s,;:.\-–]+$/g, '')
    .trim();
  if (!name) name = text.replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim() || text;

  // A size beside a mass or a volume ("1 cup (200 g)") is an equivalence, not a package.
  var grams = null;
  if (size && PACKAGE_UNITS.indexOf(unit) !== -1) {
    flag('package');
    if (qty !== null && has(SIZE_G, size.unit)) grams = Math.round(qty * size.amount * SIZE_G[size.unit] * 10) / 10;
  }
  if (qty === null) {
    flag('no_qty');
    // "Kosher salt" or "Freshly ground black pepper" with no amount is seasoning to taste.
    if (SEASONING.test(name)) {
      flag('to_taste');
      optional = true;
    }
  }

  return {
    text: text,
    qty: qty === null ? null : Math.round(qty * 10000) / 10000,
    unit: unit,
    name: name,
    note: notes.join('; '),
    grams: grams,
    optional: optional,
    flags: flags,
  };
}

// ---------------------------------------------------------------- matching

var NAME_FILLER = ['fresh', 'freshly', 'chopped', 'minced', 'diced', 'sliced', 'peeled', 'cubed', 'shredded', 'softened'];

function singular(word) {
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/oes$/.test(word)) return word.slice(0, -2);
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (/[^su]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Lower case, no accents, no filler words, each word singular. `Tomatoes` is `tomato`. */
function normalizeName(name) {
  var s = cell(name).toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s
    .replace(/[^a-z0-9%]+/g, ' ')
    .split(' ')
    .filter(function (w) { return w && NAME_FILLER.indexOf(w) === -1; })
    .map(singular)
    .join(' ');
}

/** The learned aliases, without any to a food that no longer exists. */
function readAliases(foodsById) {
  var entry = getRecord('Config', { key: ALIAS_CONFIG_KEY });
  var stored = entry ? parseJsonCell(entry.value) : null;
  var out = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    Object.keys(stored).forEach(function (k) { if (foodsById[stored[k]]) out[k] = stored[k]; });
  }
  return out;
}

/**
 * `{ food_id, match, suggestions }` for a cleaned name. Only `exact` and
 * `alias` produce a food_id; word overlap only suggests.
 */
function matchFood(name, foods, aliases) {
  var key = normalizeName(name);
  var out = { food_id: '', match: null, suggestions: [] };
  if (!key) return out;
  for (var i = 0; i < foods.length; i++) {
    if (normalizeName(foods[i].name) === key) {
      out.food_id = foods[i].id;
      out.match = 'exact';
      return out;
    }
  }
  if (has(aliases, key)) {
    out.food_id = aliases[key];
    out.match = 'alias';
    return out;
  }
  out.suggestions = suggestFoods(key, foods);
  return out;
}

/** Up to three foods sharing a word with the name, closest first. Never used automatically. */
function suggestFoods(key, foods) {
  var words = key.split(' ');
  return foods
    .map(function (f) {
      var fk = normalizeName(f.name);
      var fw = fk.split(' ');
      var shared = words.filter(function (w) { return fw.indexOf(w) !== -1; }).length;
      var contains = fk.indexOf(key) !== -1 || key.indexOf(fk) !== -1;
      return { food: f, score: shared * 2 + (contains ? 1 : 0) - Math.abs(fw.length - words.length) * 0.1 };
    })
    .filter(function (s) { return s.score >= 1; })
    .sort(function (a, b) { return b.score - a.score || a.food.name.localeCompare(b.food.name); })
    .slice(0, 3)
    .map(function (s) { return { food_id: s.food.id, name: s.food.name }; });
}

// ---------------------------------------------------------------- preview and save

/** The preview the issue body specifies, from a draft. Refuses a structured line naming no food. */
function buildPreview(draft, foods, byId, aliases) {
  var lines = draft.lines.map(function (line, i) {
    var parsed;
    if (line.structured) {
      var r = line.raw;
      parsed = {
        text: requireString('line ' + (i + 1) + ' text', r.text),
        qty: optionalNumber('line ' + (i + 1) + ' qty', r.qty, { min: 0 }),
        unit: cell(r.unit).trim().toLowerCase(),
        name: cell(r.name).trim(),
        note: cell(r.note),
        grams: optionalNumber('line ' + (i + 1) + ' grams', r.grams, { min: 0 }),
        optional: toBool(r.optional),
        flags: [],
      };
      if (!parsed.name) parsed.name = parseLine(parsed.text).name;
      parsed.section = optionalString('line section', r.section);
      parsed.given_food = cell(r.food_id).trim();
    } else {
      parsed = parseLine(line.text);
      parsed.section = line.section;
      parsed.given_food = '';
    }
    var match;
    if (parsed.given_food) {
      if (!byId[parsed.given_food]) throw new Error('food_id "' + parsed.given_food + '" is not a food');
      match = { food_id: parsed.given_food, match: null, suggestions: [] };
    } else {
      match = matchFood(parsed.name, foods, aliases);
    }
    return {
      line_id: 'L' + (i + 1),
      section: parsed.section,
      text: parsed.text,
      qty: parsed.qty,
      unit: parsed.unit,
      name: parsed.name,
      note: parsed.note,
      grams: parsed.grams,
      optional: parsed.optional,
      flags: parsed.flags,
      food_id: match.food_id,
      match: match.match,
      suggestions: match.suggestions,
    };
  });

  var steps = draft.steps
    .filter(function (s) { return cell(s.text).trim() !== ''; })
    .map(function (s, i) {
      return { position: i + 1, section: cell(s.section), name: cell(s.name), text: cell(s.text).trim() };
    });

  var sourceUrl = cell(draft.source_url).trim();
  var duplicate = null;
  if (sourceUrl) {
    var existing = listRecords('Recipes', function (r) { return r.source_url === sourceUrl; })[0];
    if (existing) duplicate = { id: existing.id, name: existing.name };
  }

  var needs = [];
  if (!cell(draft.name).trim()) needs.push('name');
  if (typeof draft.servings !== 'number' || !(draft.servings > 0)) needs.push('servings');
  if (!lines.length) needs.push('lines');

  return {
    recipe: {
      name: cell(draft.name).trim(),
      source_url: sourceUrl,
      source_site: siteOf(sourceUrl),
      servings: typeof draft.servings === 'number' ? draft.servings : null,
      total_min: typeof draft.total_min === 'number' ? draft.total_min : null,
      notes: cell(draft.notes),
    },
    lines: lines,
    steps: steps,
    nutrition: recipeNutrition(lines, draft.servings, byId),
    duplicate_of: duplicate,
    needs: needs,
  };
}

var NEEDS_REFUSALS = {
  name: 'name is required',
  servings: 'servings is required',
  lines: 'a recipe needs at least one ingredient line',
};

/** Save a preview as a recipe, then learn each matched line's name. Answers the stored recipe. */
function saveImport(preview, allowDuplicate) {
  if (preview.needs.length) throw importError('incomplete', NEEDS_REFUSALS[preview.needs[0]]);
  var dup = preview.duplicate_of;
  if (dup && !allowDuplicate) {
    throw importError('duplicate', 'source_url is already the recipe "' + dup.name + '" (' + dup.id + ')', {
      duplicate_of: dup,
    });
  }
  return withScriptLock(function () {
    var saved = upsertRecipe({
      name: preview.recipe.name,
      source_url: preview.recipe.source_url,
      source_site: preview.recipe.source_site,
      servings: preview.recipe.servings,
      total_min: preview.recipe.total_min,
      notes: preview.recipe.notes,
      lines: preview.lines.map(function (l) {
        return {
          line_id: l.line_id, section: l.section, text: l.text, qty: l.qty, unit: l.unit,
          food_id: l.food_id, grams: l.grams, optional: l.optional,
        };
      }),
      steps: preview.steps.map(function (s) { return { section: s.section, name: s.name, text: s.text }; }),
    });
    learnAliases(preview.lines);
    return saved;
  });
}

/** Every saved line with a food teaches its normalised name, unless the name already matches exactly. */
function learnAliases(lines) {
  var foods = foodsById();
  var aliases = readAliases(foods);
  var changed = false;
  lines.forEach(function (l) {
    var key = normalizeName(l.name);
    if (!l.food_id || !key || !foods[l.food_id]) return;
    if (normalizeName(foods[l.food_id].name) === key || aliases[key] === l.food_id) return;
    aliases[key] = l.food_id;
    changed = true;
  });
  if (changed) upsertRecord('Config', { key: ALIAS_CONFIG_KEY, value: JSON.stringify(aliases), updated: isoNow() });
}
