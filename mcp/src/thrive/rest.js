// Rest and switch times an agent sets (#583): the `rest` parameter shared by
// the scheduling, template and planned-workout tools.
//
// The API resolves rest: which set takes a section's rest and which its switch
// is `resolveRestTargets` in apps-script/src/sets.js, and nothing here repeats
// it. This module checks the parameter before anything is written, shapes it
// for the API, and words it for the agent.

/** The sections that carry a rest, and those of them that also carry a switch (#576). */
export const REST_SECTIONS = ['primary', 'SS1', 'SS2', 'SS3', 'burnout'];
export const SWITCH_SECTIONS = ['SS1', 'SS2', 'SS3', 'burnout'];

/** Whole seconds, the ranges of the Settings defaults (#576). */
export const REST_RANGE = { min: 15, max: 600 };
export const SWITCH_RANGE = { min: 0, max: 120 };

const LABELS = { primary: 'Primary', SS1: 'Superset 1', SS2: 'Superset 2', SS3: 'Superset 3', burnout: 'Burnout' };

/** A section as the app names it: "Superset 1". */
export const sectionLabel = (section) => LABELS[section] ?? section;

/** Whole seconds as m:ss: 90 -> "1:30". */
export const mss = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ENTRY_FIELDS = ['section', 'rest_s', 'switch_s'];

function checkValue(value, field, { min, max }) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return `${field} must be whole seconds, ${min} to ${max}, or null for the Settings default`;
  }
  return null;
}

/**
 * Check a `rest` list: `{ section, rest_s?, switch_s? }` entries, whole seconds,
 * rest 15-600, switch 0-120 and only on SS1-SS3 and burnout, each section once.
 * When `present` (the sections the workout or template has) is given, a section
 * not in it is refused too. Returns every problem, each naming its entry and
 * section, so nothing is written until all are fixed.
 *
 * @param {Array<Record<string, unknown>> | undefined} rest
 * @param {Set<string>} [present]
 * @param {string} [noun] - what `present` belongs to, for the message
 * @returns {string[]}
 */
export function checkRest(rest, present, noun = 'workout') {
  if (rest === undefined) return [];
  if (!Array.isArray(rest)) return ['rest must be a list of { section, rest_s, switch_s }'];
  const errors = [];
  const seen = new Set();
  rest.forEach((entry, i) => {
    const section = entry?.section;
    const where = `rest[${i}] (${section === undefined ? 'no section' : section})`;
    const unknown = Object.keys(entry ?? {}).filter((k) => !ENTRY_FIELDS.includes(k));
    if (unknown.length) {
      errors.push(`${where}: unknown field ${unknown.map((k) => `"${k}"`).join(', ')} — accepted: ${ENTRY_FIELDS.join(', ')}`);
      return;
    }
    if (!REST_SECTIONS.includes(section)) {
      errors.push(`${where}: section must be one of ${REST_SECTIONS.join(', ')} (warmup and cooldown have no rest)`);
      return;
    }
    if (seen.has(section)) {
      errors.push(`${where}: section ${section} is named twice`);
      return;
    }
    seen.add(section);
    if (entry.rest_s === undefined && entry.switch_s === undefined) {
      errors.push(`${where}: nothing to change — pass rest_s, switch_s or both`);
      return;
    }
    if (entry.switch_s !== undefined && !SWITCH_SECTIONS.includes(section)) {
      errors.push(`${where}: switch_s applies only to SS1, SS2, SS3 and burnout`);
      return;
    }
    const problem = (entry.rest_s !== undefined && checkValue(entry.rest_s, 'rest_s', REST_RANGE)) ||
      (entry.switch_s !== undefined && checkValue(entry.switch_s, 'switch_s', SWITCH_RANGE));
    if (problem) {
      errors.push(`${where}: ${problem}`);
      return;
    }
    if (present && !present.has(section)) {
      errors.push(`${where}: the ${noun} has no ${section} exercises`);
    }
  });
  return errors;
}

/** The checked list, keyed by section: `{ SS1: { rest_s: 60 } }`. A field left out stays out. */
export function restBySection(rest = []) {
  const out = {};
  for (const { section, ...values } of rest) out[section] = values;
  return out;
}

/** The timed sections of an ordered exercise list, in the order they first appear. */
export function timedSections(rows) {
  return [...new Set(rows.map((r) => r.section))].filter((s) => REST_SECTIONS.includes(s));
}

/** A template's stored rest, `{ SS1: { rest_s: '60', switch_s: '' } }`: the first row of each section. */
export function templateRestOf(rows) {
  const out = {};
  for (const r of rows) {
    if (!(r.section in out)) out[r.section] = { rest_s: r.rest_s ?? '', switch_s: r.switch_s ?? '' };
  }
  return out;
}

const DEFAULT_KEYS = {
  primary: { rest_s: 'rest_primary_s' },
  SS1: { rest_s: 'rest_superset_s', switch_s: 'switch_superset_s' },
  SS2: { rest_s: 'rest_superset_s', switch_s: 'switch_superset_s' },
  SS3: { rest_s: 'rest_superset_s', switch_s: 'switch_superset_s' },
  burnout: { rest_s: 'rest_burnout_s', switch_s: 'switch_burnout_s' },
};

/**
 * One section's rest and switch for the agent to read back, by the API's
 * precedence: the entry's value (null: the Settings default), then the
 * template's, then the default. Words only; what is written is what the API
 * resolves.
 */
function sectionValues(section, own, stored, defaults) {
  const pick = (field) => {
    if (own && own[field] !== undefined) return own[field] === null ? defaults[DEFAULT_KEYS[section][field]] : own[field];
    const kept = stored?.[field];
    return kept !== undefined && kept !== '' ? kept : defaults[DEFAULT_KEYS[section][field]];
  };
  return { rest: pick('rest_s'), switch: SWITCH_SECTIONS.includes(section) ? pick('switch_s') : undefined };
}

/** "Superset 1 — rest 1:00, switch 0:15". */
export function describeSectionRest(section, { rest, switch: sw }) {
  return `${sectionLabel(section)} — rest ${mss(rest)}${sw !== undefined ? `, switch ${mss(sw)}` : ''}`;
}

/**
 * Each timed section's resolved rest, one line each, for a schedule's summary.
 *
 * @param {Array<{section: string}>} plan - the exercises, in order
 * @param {Record<string, {rest_s?: unknown, switch_s?: unknown}>} stored - the template's rest, or {}
 * @param {Array} rest - the checked `rest` parameter, or undefined
 * @param {Record<string, number>} defaults - getSettings
 */
export function resolvedRestLines(plan, stored, rest, defaults) {
  const own = restBySection(rest);
  return timedSections(plan).map(
    (section) => describeSectionRest(section, sectionValues(section, own[section], stored[section], defaults)),
  );
}

/** A template value for reading: "1:30", or "default" for blank. */
const templateValue = (v) => (v === undefined || v === '' || v === null ? 'default' : mss(v));

/**
 * A template's rest as rows will be written: every row of a named section gets
 * the entry's values (null as blank, the Settings default). A field left out is
 * not sent, so the API keeps the section's stored value (#576).
 */
export function withTemplateRest(rows, rest) {
  const own = restBySection(rest);
  return rows.map((r) => {
    const mine = own[r.section];
    if (!mine) return r;
    const out = { ...r };
    if (mine.rest_s !== undefined) out.rest_s = mine.rest_s === null ? '' : String(mine.rest_s);
    if (mine.switch_s !== undefined) out.switch_s = mine.switch_s === null ? '' : String(mine.switch_s);
    return out;
  });
}

/**
 * A template's rest before and after a replace, one line per timed section of
 * either, as the API will store it: a field the entry gives, else the section's
 * stored value. "default" is blank, the Settings default.
 */
export function templateRestChanges(beforeRows, afterRows, rest) {
  const stored = templateRestOf(beforeRows);
  const own = restBySection(rest);
  const sections = timedSections([...beforeRows, ...afterRows]);
  const afterSections = new Set(timedSections(afterRows));
  return sections.map((section) => {
    const was = stored[section];
    const field = (f) => {
      const before = was ? templateValue(was[f]) : null;
      if (!afterSections.has(section)) return { before, after: null };
      const given = own[section]?.[f];
      const after = given !== undefined ? templateValue(given) : templateValue(was?.[f]);
      return { before, after };
    };
    const show = ({ before, after }) => {
      if (after === null) return `${before} (section removed)`;
      if (before === null) return after;
      return before === after ? `${after} (unchanged)` : `${before} -> ${after}`;
    };
    const parts = [`rest ${show(field('rest_s'))}`];
    if (SWITCH_SECTIONS.includes(section)) parts.push(`switch ${show(field('switch_s'))}`);
    return `${sectionLabel(section)} — ${parts.join(', ')}`;
  });
}

/** A template's rest as it will be created: one line per named section, others default. */
export function templateRestLines(rows, rest) {
  const own = restBySection(rest);
  return timedSections(rows).map((section) => {
    const mine = own[section] ?? {};
    const parts = [`rest ${templateValue(mine.rest_s)}`];
    if (SWITCH_SECTIONS.includes(section)) parts.push(`switch ${templateValue(mine.switch_s)}`);
    return `${sectionLabel(section)} — ${parts.join(', ')}`;
  });
}
