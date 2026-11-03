// Thrive Spin's ride workouts and FTP (#774): the steps rules and the wording of
// thrive_list_ride_workouts, thrive_get_ride_workout, thrive_ftp and the four write tools.
//
// Pure; run with `node --test`. The Worker holds no row mapping: the API's
// getRideWorkouts, saveRideWorkout, deleteRideWorkout, getFtp and addFtp (#765)
// answer domain objects. What lives here is the Worker's copy of the steps v1
// rules, checked before any request so a mistake is named by position ("block 2,
// step 1: pct 301 is over 300"). The API stays the authority and re-checks. The
// copy is `thrive/apps-script/src/ride-workouts.js` (validateRideSteps), pinned by
// `test/fixtures/ride-steps-golden.json`: a rule change edits both and the fixture.
//
// Targets are % of FTP and never watts. The Worker never sends `duration_s` or a
// timestamp: the API works the total out itself.

import { mss } from './rest.js';

export const CATEGORIES = ['Endurance', 'Sweet spot', 'Threshold', 'VO2', 'Recovery'];

export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const STEPS_MAX_CHARS = 5000;
export const STEPS_MAX_TOTAL_S = 21600;
export const FTP_MIN_W = 50;
export const FTP_MAX_W = 1000;

/** Shown when the API answers one of these actions as unknown: an Apps Script from before #765's deploy. */
export const NOT_UPDATED =
  "The Thrive API does not know the ride workout and FTP actions, so its Apps Script has not been updated to " +
  "#765's version (Thrive Spin's library). Nothing was written. Deploy that update, then try again.";

/** Whether an API refusal is the script saying it has never heard of the action. */
export const isUnknownAction = (err) => /^Unknown action\b/.test(String(err?.message ?? ''));

const MODES = ['erg', 'resistance', 'slope', 'free'];
const TARGETS = { erg: ['pct', 'pct_end'], resistance: ['level'], slope: ['grade'], free: [] };
const TARGET_NAMES = [...new Set(Object.values(TARGETS).flat())];

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** A short, single-line rendering of a value for an error message. */
const shown = (v) => {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 37)}...` : s;
};

// --- time ------------------------------------------------------------------------

/** 4440 -> "1:14:00". */
export const hms = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** 4440 -> "1:14", to the nearest minute. */
export const hm = (seconds) => {
  const m = Math.max(0, Math.round(Number(seconds) / 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

// --- the steps rules --------------------------------------------------------------

/**
 * One number field. `whole` demands an integer. Out of range says which side, so the
 * refusal reads "pct 301 is over 300".
 */
function number(where, key, value, lo, hi, whole = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${where}: ${key} must be a number${whole ? ', a whole one' : ''} (got ${shown(value)}).`);
  }
  if (whole && !Number.isInteger(value)) {
    throw new Error(`${where}: ${key} must be a whole number (got ${value}).`);
  }
  if (value > hi) throw new Error(`${where}: ${key} ${value} is over ${hi}.`);
  if (value < lo) throw new Error(`${where}: ${key} ${value} is under ${lo}.`);
}

/** One step's checks, `where` naming its place. Returns its seconds. */
function checkStep(step, where) {
  if (!isPlain(step)) throw new Error(`${where}: a step is an object like {"label": "...", "dur_s": 60, "mode": "free"}.`);
  if (has(step, 'repeat')) {
    // A top-level repeat never gets here (checkBlock reads it), so this is one inside a repeat.
    throw new Error(`${where}: a repeat cannot sit inside another repeat. Write the rounds out or use one repeat.`);
  }
  if (!MODES.includes(step.mode)) {
    throw new Error(`${where}: mode must be one of ${MODES.join(', ')} (got ${shown(step.mode)}).`);
  }
  const targets = TARGETS[step.mode];
  for (const key of Object.keys(step)) {
    if (['label', 'dur_s', 'mode', 'cadence', ...targets].includes(key)) continue;
    if (TARGET_NAMES.includes(key)) {
      throw new Error(
        `${where}: ${key} is not a target in ${step.mode} mode; ${step.mode} mode ` +
        `${targets.length ? `takes ${targets.join(' and ')}` : 'takes no target'}.`,
      );
    }
    throw new Error(`${where}: unknown key "${key}". A step has label, dur_s, mode, optional cadence and its mode's target.`);
  }
  if (typeof step.label !== 'string' || step.label.trim() === '') {
    throw new Error(`${where}: label must be 1 to 40 characters and not blank.`);
  }
  if (step.label.length > 40) throw new Error(`${where}: label is ${step.label.length} characters, over 40.`);
  number(where, 'dur_s', step.dur_s, 1, 14400);
  if (step.cadence !== undefined) number(where, 'cadence', step.cadence, 40, 150);
  if (step.mode === 'erg') {
    if (step.pct === undefined) throw new Error(`${where}: an erg step needs pct, the % of FTP.`);
    number(where, 'pct', step.pct, 0, 300);
    if (step.pct_end !== undefined) number(where, 'pct_end', step.pct_end, 0, 300);
  } else if (step.mode === 'resistance') {
    if (step.level === undefined) throw new Error(`${where}: a resistance step needs level, 0 to 100.`);
    number(where, 'level', step.level, 0, 100);
  } else if (step.mode === 'slope') {
    if (step.grade === undefined) throw new Error(`${where}: a slope step needs grade, -10 to 20 %.`);
    number(where, 'grade', step.grade, -10, 20, false);
    if (Math.abs(step.grade * 10 - Math.round(step.grade * 10)) >= 1e-9) {
      throw new Error(`${where}: grade must have at most one decimal (got ${step.grade}).`);
    }
  }
  return step.dur_s;
}

/** One top-level block, a step or a repeat. Returns its seconds, repeats expanded. */
function checkBlock(block, index) {
  const where = `block ${index + 1}`;
  if (isPlain(block) && has(block, 'repeat')) {
    for (const key of Object.keys(block)) {
      if (key !== 'repeat' && key !== 'steps') {
        throw new Error(`${where}: unknown key "${key}". A repeat is {"repeat": 2 to 50, "steps": [...]} and has no other key.`);
      }
    }
    number(where, 'repeat', block.repeat, 2, 50);
    if (!Array.isArray(block.steps) || block.steps.length < 1 || block.steps.length > 20) {
      throw new Error(`${where}: a repeat's steps are a list of 1 to 20 steps.`);
    }
    let inner = 0;
    block.steps.forEach((s, i) => { inner += checkStep(s, `${where}, step ${i + 1}`); });
    return inner * block.repeat;
  }
  return checkStep(block, where);
}

/**
 * The steps a tool was given, checked whole: `{v?, steps: [...]}` or the bare array.
 * Returns `{ steps: {v: 1, steps}, duration_s }`, the object to send and the total
 * seconds with repeats expanded. Throws an Error naming the first problem and where.
 */
export function checkRideSteps(input) {
  let blocks;
  if (Array.isArray(input)) {
    blocks = input;
  } else if (isPlain(input)) {
    for (const key of Object.keys(input)) {
      if (key !== 'v' && key !== 'steps') {
        throw new Error(`steps: unknown key "${key}". Give {"v": 1, "steps": [...]} or just the list of blocks.`);
      }
    }
    if (input.v !== undefined && input.v !== 1) throw new Error(`steps: v must be 1 (got ${shown(input.v)}).`);
    blocks = input.steps;
  } else {
    throw new Error('steps: give the list of blocks, or {"v": 1, "steps": [...]}.');
  }
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 100) {
    throw new Error('steps: a workout has 1 to 100 blocks.');
  }
  let total = 0;
  blocks.forEach((b, i) => { total += checkBlock(b, i); });
  if (total > STEPS_MAX_TOTAL_S) {
    throw new Error(
      `steps: the workout adds up to ${hms(total)} (${total} seconds), over the 6 hour limit (${STEPS_MAX_TOTAL_S} seconds).`,
    );
  }
  const steps = { v: 1, steps: blocks };
  const chars = JSON.stringify(steps).length;
  if (chars > STEPS_MAX_CHARS) {
    throw new Error(`steps: ${chars} characters as JSON, over the ${STEPS_MAX_CHARS} limit. Use fewer or shorter steps.`);
  }
  return { steps, duration_s: total };
}

/** The same steps with keys in a fixed order, as text: what "unchanged" means. */
export function canonicalSteps(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (isPlain(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]));
    return v;
  };
  return JSON.stringify(sort(value));
}

// --- the other fields ---------------------------------------------------------------

export function checkName(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > NAME_MAX) {
    throw new Error(`name must be 1 to ${NAME_MAX} characters and not blank.`);
  }
  return value;
}

/** The category as the API spells it; the match ignores case. */
export function checkCategory(value) {
  const found = typeof value === 'string' ? CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase()) : undefined;
  if (!found) throw new Error(`category ${shown(value)} is not one of ${CATEGORIES.join(', ')}.`);
  return found;
}

export function checkDescription(value) {
  if (typeof value !== 'string' || value.length > DESCRIPTION_MAX) {
    throw new Error(`description must be text of at most ${DESCRIPTION_MAX} characters.`);
  }
  return value;
}

/** An FTP in watts, as the API takes it: whole, 50 to 1000. */
export function checkFtpWatts(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < FTP_MIN_W || value > FTP_MAX_W) {
    throw new Error(`ftp_w must be a whole number of watts, ${FTP_MIN_W} to ${FTP_MAX_W} (got ${shown(value)}).`);
  }
  return value;
}

/** A real calendar date that is not after `today`, both YYYY-MM-DD. */
export function checkFtpDate(date, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
  const d = m && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (!d || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`date ${shown(date)} is not a real date. Use YYYY-MM-DD, today, yesterday or an offset such as -3d.`);
  }
  if (date > today) {
    throw new Error(
      `date ${date} is after today (${today}). A future FTP would silently become current that day, so it is refused.`,
    );
  }
  return date;
}

// --- wording ----------------------------------------------------------------------

/** One step in plain words: `Sweet spot 12:00 ERG 90% FTP, 90 rpm`. */
export function describeStep(step) {
  let target;
  if (step.mode === 'erg') {
    target = `ERG ${step.pct_end !== undefined ? `${step.pct} -> ${step.pct_end}` : step.pct}% FTP`;
  } else if (step.mode === 'resistance') {
    target = `resistance level ${step.level}`;
  } else if (step.mode === 'slope') {
    target = `slope ${step.grade}%`;
  } else {
    target = 'free ride';
  }
  return `${step.label} ${mss(step.dur_s)} ${target}${step.cadence !== undefined ? `, ${step.cadence} rpm` : ''}`;
}

/**
 * The blocks in words, one numbered line each, a repeat as `3 x [` with its steps
 * under it. Checked steps only: see describeStoredSteps for what the sheet holds.
 */
export function describeBlocks(steps) {
  const out = [];
  steps.steps.forEach((block, i) => {
    const n = `${i + 1}.`;
    if (has(block, 'repeat')) {
      const round = block.steps.reduce((sum, s) => sum + s.dur_s, 0);
      out.push(`${n} ${block.repeat} x [`);
      for (const s of block.steps) out.push(`   - ${describeStep(s)}`);
      out.push(`   ] (${mss(round)} a round, ${mss(round * block.repeat)} in all)`);
    } else {
      out.push(`${n} ${describeStep(block)}`);
    }
  });
  return out;
}

/** The stored steps in words and their total, or a line saying they cannot be read (a hand edit). */
export function describeStoredSteps(stored) {
  try {
    const { steps, duration_s: total } = checkRideSteps(stored);
    return { lines: describeBlocks(steps), total };
  } catch (err) {
    return { lines: [`(the stored steps cannot be read: ${err.message.replace(/^steps: /, '')})`], total: undefined };
  }
}

const byName = (a, b) => {
  const x = String(a.name).toLowerCase();
  const y = String(b.name).toLowerCase();
  return x < y ? -1 : x > y ? 1 : String(a.id) < String(b.id) ? -1 : 1;
};

const lastRidden = (w) => (w.last_ridden_date ? `last ridden ${w.last_ridden_date}` : 'never ridden');

/** One library line: id, name, category, duration (h:mm) and last ridden date. */
export const workoutLine = (w) =>
  `${w.id} · ${w.name} · ${w.category} · ${hm(w.duration_s)} · ${lastRidden(w)}`;

/** thrive_list_ride_workouts: the workouts ordered by name, filtered by category and search. */
export function describeLibrary(workouts, { category, search } = {}) {
  if (!workouts.length) return "No ride workouts in Thrive Spin's library.";
  const q = search ? search.trim().toLowerCase() : '';
  const shown_ = workouts
    .filter((w) => !category || w.category === category)
    .filter((w) => !q || `${w.name}\n${w.description ?? ''}`.toLowerCase().includes(q))
    .sort(byName);
  const filters = [category && `category ${category}`, q && `search "${search.trim()}"`].filter(Boolean).join(', ');
  if (!shown_.length) {
    return `No ride workouts match ${filters}. The library has ${workouts.length}.`;
  }
  const head = filters
    ? `${shown_.length} of ${workouts.length} ride workouts (${filters}):`
    : `${shown_.length} ride workout${shown_.length === 1 ? '' : 's'}:`;
  return [head, ...shown_.map(workoutLine)].join('\n');
}

/** thrive_get_ride_workout: header, description, steps in words, the total and the steps JSON to edit and send back. */
export function describeWorkout(w) {
  const { lines, total } = describeStoredSteps(w.steps);
  const out = [
    `${w.name} (${w.id}) · ${w.category} · ${total === undefined ? hm(w.duration_s) : hms(total)} · ${lastRidden(w)}`,
  ];
  if (w.description) out.push(`Description: ${w.description}`);
  out.push('', 'Steps (targets are % of FTP, never watts):', ...lines);
  if (total !== undefined) out.push('', `Total: ${hms(total)}`);
  if (w.steps) {
    out.push(
      '', 'Steps JSON (v1). Edit it and send it back as steps to thrive_update_ride_workout; the whole list is replaced:',
      JSON.stringify(w.steps),
    );
  }
  return out.join('\n');
}

/** thrive_create_ride_workout's reply. */
export function describeCreated(w, steps, total) {
  const blocks = steps.steps.length;
  return (
    `Created ride workout "${w.name}" (${w.id}): ${w.category}, ${hms(total)}, ${blocks} block${blocks === 1 ? '' : 's'}. ` +
    "It is in Thrive Spin's library. thrive_undo removes it."
  );
}

// --- update -----------------------------------------------------------------------

/**
 * What a thrive_update_ride_workout call would change on `stored`, from the fields it
 * was given (already checked). `fields` is everything a save sends: each of name,
 * category, description and steps, the new value where one changes and the stored
 * one as read where not. Steps are replaced whole, never patched.
 */
export function planUpdate(stored, given) {
  const changes = [];
  const fields = {
    name: stored.name,
    category: stored.category,
    description: stored.description ?? '',
    steps: stored.steps,
  };
  for (const key of ['name', 'category', 'description']) {
    if (given[key] !== undefined && given[key] !== fields[key]) {
      changes.push({ key, from: fields[key], to: given[key] });
      fields[key] = given[key];
    }
  }
  if (given.steps !== undefined) {
    if (!stored.steps || canonicalSteps(stored.steps) !== canonicalSteps(given.steps)) {
      changes.push({ key: 'steps', from: stored.steps, to: given.steps });
      fields.steps = given.steps;
    }
  } else if (!stored.steps) {
    throw new Error(
      `The stored steps of ${stored.id} cannot be read (edited by hand?), so a change that keeps them cannot be sent. ` +
      'Give steps to replace them. Nothing was written.',
    );
  }
  return { fields, changes };
}

const quoted = (v) => (typeof v === 'string' && v.length > 200 ? `"${v.slice(0, 197)}..."` : JSON.stringify(v));

/** The dry run of an update: only what changes, old to new, steps in words. */
export function describeUpdatePreview(stored, plan) {
  const out = [`DRY RUN — nothing written. This would change ${stored.name} (${stored.id}):`];
  for (const c of plan.changes) {
    if (c.key !== 'steps') out.push(`- ${c.key}: ${quoted(c.from)} -> ${quoted(c.to)}`);
  }
  const steps = plan.changes.find((c) => c.key === 'steps');
  if (steps) {
    const before = describeStoredSteps(steps.from);
    const after = describeStoredSteps(steps.to);
    out.push('- steps (replaced whole):');
    out.push(`  Now${before.total === undefined ? '' : ` (${hms(before.total)})`}:`, ...before.lines.map((l) => `    ${l}`));
    out.push(`  Would be${after.total === undefined ? '' : ` (${hms(after.total)})`}:`, ...after.lines.map((l) => `    ${l}`));
  }
  out.push('', 'Call again with confirm: true to write it. thrive_undo reverts it.');
  return out.join('\n');
}

/** thrive_update_ride_workout's reply after the write. */
export function describeUpdated(stored, plan, saved) {
  const keys = plan.changes.map((c) => c.key).join(', ');
  const total = saved?.duration_s !== undefined && saved.duration_s !== '' ? ` Now ${hms(saved.duration_s)}.` : '';
  return `Updated ride workout ${plan.fields.name} (${stored.id}): ${keys}.${total} thrive_undo reverts it.`;
}

// --- delete -----------------------------------------------------------------------

/** The dry run of a delete: the workout and its last ridden date, and what keeps its id. */
export function describeDeletePreview(w) {
  return [
    'DRY RUN — nothing deleted. This would remove:',
    `- ${workoutLine(w)}`,
    '',
    'Planned bike days and rides that name it keep its id and show no workout name. thrive_undo can restore it.',
    'Call again with confirm: true to delete.',
  ].join('\n');
}

// --- FTP --------------------------------------------------------------------------

const sourceWords = (e) =>
  e.source === 'ramp_test' ? `ramp test${e.ride_id ? ` (ride ${e.ride_id})` : ''}` : e.source || 'unknown source';

/** One FTP entry: `2026-03-02 · 240 W · ramp test (ride r1)`. */
export const ftpLine = (e) => `${e.date} · ${e.ftp_w} W · ${sourceWords(e)}`;

/** thrive_ftp: the current FTP, always, then the history newest first within from/to. */
export function describeFtp({ current, history }, { from = '', to = '' } = {}) {
  if (!current && !history.length) return 'No FTP is recorded.';
  const out = [
    current ? `Current FTP: ${current.ftp_w} W, set ${current.date} (${sourceWords(current)})` : 'Current FTP: none recorded.',
  ];
  const inRange = history.filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const range = from || to ? ` from ${from || 'the start'} to ${to || 'today'}` : '';
  if (!inRange.length) {
    out.push('', `No FTP entries${range}.`);
  } else {
    out.push('', `History${range}, newest first (${inRange.length} of ${history.length}):`, ...inRange.map((e) => `- ${ftpLine(e)}`));
  }
  return out.join('\n');
}

/** thrive_add_ftp's dry run: the current FTP beside the new one. */
export function describeFtpPreview(current, { ftp_w: watts, date }) {
  const out = [
    'DRY RUN — nothing written.',
    current ? `FTP now: ${current.ftp_w} W (set ${current.date}, ${sourceWords(current)}).` : 'FTP now: none recorded.',
    `New: ${watts} W on ${date}, source manual.`,
  ];
  if (current && date < current.date) {
    out.push(`That date is older than the current FTP's, so ${current.ftp_w} W stays current and this only adds to the history.`);
  } else {
    out.push("A new FTP rescales every future workout's watts, since targets are % of FTP. Rides already ridden keep the FTP they were ridden at and are never rescored.");
  }
  out.push('Call again with confirm: true to write it. thrive_undo reverts it.');
  return out.join('\n');
}

/** thrive_add_ftp's reply after the write. */
export const describeFtpAdded = (e) =>
  `Set FTP to ${e.ftp_w} W on ${e.date} (manual). Rides already ridden keep the FTP they were ridden at and are not rescored. thrive_undo removes it.`;
