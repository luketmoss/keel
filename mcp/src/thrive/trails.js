// thrive_trail_history (#691): the app's trail rules, copied for the Worker,
// and the tool's text. Pure; run with `node --test`.
//
// The rules are the frontend's: `frontend/src/api/trails-cell.ts` (the decoder),
// `src/trails/groups.ts` (names and groups), `compare.ts` (like-for-like) and
// `search.ts` (matching). mcp/ imports nothing from thrive/, so this is a second
// copy, and `test/fixtures/trails-rules-golden.json` keeps the two in step: both
// sides' tests read it, so a rule change edits the fixture and fails the other
// side until it follows (thrive/CLAUDE.md §Change both together).
//
// Blank is not "no trails". A blank `trails` on a tracked activity has not been
// looked at yet, so it is counted and said, never read as "never on this trail".
// The raw cell is never printed, and neither is anything positional.

import { metersToFeet, typeLabel } from './domain.js';

// --- the cell (Workouts!AD, #688) ---------------------------------------------

const KEYS = new Set(['v', 'm', 'u', 'n', 'p', 'x']);
const isWhole = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isWholeOrNull = (v) => v === null || isWhole(v);

/**
 * Workouts!AD decoded: `{ status: 'untagged' }` for blank, `{ status: 'unreadable' }`
 * for anything that is not a valid v1 value, else `{ status: 'tagged', matcherVersion,
 * unmatchedM, passes, omitted }`. Never throws. The checks are parseTrailsCell's.
 */
export function parseTrailsCell(cell) {
  if (cell === undefined || cell === null || cell === '') return { status: 'untagged' };
  const unreadable = { status: 'unreadable' };
  if (typeof cell !== 'string') return unreadable;
  let t;
  try {
    t = JSON.parse(cell);
  } catch {
    return unreadable;
  }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return unreadable;
  if (Object.keys(t).some((k) => !KEYS.has(k))) return unreadable;
  if (t.v !== 1 || !isWhole(t.m) || t.m < 1 || !isWhole(t.u)) return unreadable;
  if ('x' in t && (!isWhole(t.x) || t.x < 1)) return unreadable;
  if (!Array.isArray(t.n) || !Array.isArray(t.p)) return unreadable;

  const names = [];
  for (const entry of t.n) {
    if (!Array.isArray(entry) || entry.length !== 2) return unreadable;
    if (typeof entry[0] !== 'string' || entry[0] === '' || !isWhole(entry[1])) return unreadable;
    names.push(entry[0]);
  }

  const used = new Set();
  const passes = [];
  for (const pass of t.p) {
    if (!Array.isArray(pass) || pass.length !== 8) return unreadable;
    const [i, s, e, d, metres, durationS, climbM, entryOffsetS] = pass;
    if (!isWhole(i) || i >= names.length) return unreadable;
    if (!isWhole(s) || s > 100 || !isWhole(e) || e > 100) return unreadable;
    if (d !== 1 && d !== -1) return unreadable;
    if (!isWhole(metres) || !isWholeOrNull(durationS) || !isWholeOrNull(climbM) || !isWholeOrNull(entryOffsetS)) {
      return unreadable;
    }
    used.add(i);
    passes.push({
      trail: names[i],
      startPct: s,
      endPct: e,
      direction: d === 1 ? 'forward' : 'reverse',
      metres,
      durationS,
      climbM,
      entryOffsetS,
    });
  }
  if (used.size !== names.length) return unreadable;

  return { status: 'tagged', matcherVersion: t.m, unmatchedM: t.u, passes, omitted: 'x' in t ? t.x : 0 };
}

// --- names and groups (groups.ts) ---------------------------------------------

/** "Fox Hollow / Kestrel Connector" → both names. Split on `;` and on " / "; parts trimmed, empties dropped. */
export function splitTrailName(name) {
  return name
    .split(/;| \/ /)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** The grouping key: lowercase, whitespace collapsed, a trailing " trail" dropped when something is left. */
export function trailKey(variant) {
  const key = variant.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripped = key.replace(/ trail$/, '');
  return stripped === '' ? key : stripped;
}

/** Oldest first: by date, then time, then id so the order is total. */
function chronological(a, b) {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);
}

/** A pass's place in its activity: by entry offset, the listed order breaking ties and standing in for unknowns. */
function passOrder(passes) {
  return passes
    .map((pass, i) => ({ pass, i }))
    .sort((a, b) => {
      const ao = a.pass.entryOffsetS;
      const bo = b.pass.entryOffsetS;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      return a.i - b.i;
    })
    .map((x) => x.pass);
}

/**
 * Every activity's passes (`{ id, date, time, passes }`) folded into trail groups, by key.
 * A group is `{ key, name, otherNames, visits }`: `name` is the variant carried by the most
 * passes, ties to the one on the most recent pass; `visits` are oldest first, each
 * `{ activityId, date, time, passes }` with its passes (`{ activityId, date, time, variant,
 * pass }`) in time order.
 */
export function buildTrailGroups(activities) {
  const building = new Map();
  let seen = 0;

  for (const activity of [...activities].sort(chronological)) {
    const visits = new Map();
    for (const pass of passOrder(activity.passes)) {
      // A name with two parts that share a key counts once for that group.
      const keysThisPass = new Set();
      for (const variant of splitTrailName(pass.trail)) {
        const key = trailKey(variant);
        if (keysThisPass.has(key)) continue;
        keysThisPass.add(key);
        let group = building.get(key);
        if (!group) {
          group = { key, counts: new Map(), latest: new Map(), visits: [] };
          building.set(key, group);
        }
        group.counts.set(variant, (group.counts.get(variant) ?? 0) + 1);
        group.latest.set(variant, seen++);
        let visit = visits.get(key);
        if (!visit) {
          visit = { activityId: activity.id, date: activity.date, time: activity.time, passes: [] };
          visits.set(key, visit);
          group.visits.push(visit);
        }
        visit.passes.push({ activityId: activity.id, date: activity.date, time: activity.time, variant, pass });
      }
    }
  }

  const groups = new Map();
  for (const b of building.values()) {
    const variants = [...b.counts.keys()];
    const name = variants.reduce((best, v) => {
      const dc = b.counts.get(v) - b.counts.get(best);
      return dc > 0 || (dc === 0 && b.latest.get(v) > b.latest.get(best)) ? v : best;
    });
    groups.set(b.key, { key: b.key, name, otherNames: variants.filter((v) => v !== name), visits: b.visits });
  }
  return groups;
}

// --- like-for-like (compare.ts) -----------------------------------------------

/** How far apart two passes' start and end positions may be and still compare, in points, inclusive. */
export const LIKE_FOR_LIKE_POINTS = 10;

/** How far apart two passes' lengths may be and still compare, as a share of the longer one, inclusive. */
export const LIKE_FOR_LIKE_LENGTH_RATIO = 0.25;

function similarLength(a, b) {
  if (a === null || b === null) return false;
  const longer = Math.max(a, b);
  return Math.abs(a - b) <= LIKE_FOR_LIKE_LENGTH_RATIO * longer;
}

/**
 * Two passes are like-for-like: same direction, start and end each within 10 points,
 * the same OSM name as written, and lengths within 25% of the longer.
 */
export function isLikeForLike(a, b) {
  return (
    a.direction === b.direction &&
    Math.abs(a.startPct - b.startPct) <= LIKE_FOR_LIKE_POINTS &&
    Math.abs(a.endPct - b.endPct) <= LIKE_FOR_LIKE_POINTS &&
    a.trail === b.trail &&
    similarLength(a.metres, b.metres)
  );
}

/**
 * What `gp` compares with: the last like-for-like pass on the most recent earlier
 * activity that has one. Laps within one activity never compare with each other.
 */
export function compareWithEarlier(group, gp) {
  const at = group.visits.findIndex((v) => v.activityId === gp.activityId);
  let previous = null;
  for (let i = at - 1; i >= 0 && !previous; i--) {
    const matches = group.visits[i].passes.filter((p) => isLikeForLike(p.pass, gp.pass));
    previous = matches.length > 0 ? matches[matches.length - 1] : null;
  }
  if (!previous) return { previous: null, timeDiffS: null, climbDiffM: null };
  const diff = (a, b) => (a !== null && b !== null ? a - b : null);
  return {
    previous,
    timeDiffS: diff(gp.pass.durationS, previous.pass.durationS),
    climbDiffM: diff(gp.pass.climbM, previous.pass.climbM),
  };
}

// --- matching (search.ts) -----------------------------------------------------

const lastWhen = (visits) => {
  const last = visits[visits.length - 1];
  return last ? `${last.date}T${last.time}` : '';
};

/**
 * The query against the groups, each seen through `visitsOf` (the visits in range):
 * `{ kind: 'found', group }`, `{ kind: 'none' }` or `{ kind: 'ambiguous', groups }`,
 * newest last visit first, ties by name. A group whose key equals the query's key
 * wins over groups that merely contain the query.
 */
export function matchTrail(groups, query, visitsOf = (g) => g.visits) {
  const needle = query.toLowerCase();
  const live = [...groups.values()].filter((g) => visitsOf(g).length > 0);
  const exact = live.find((g) => g.key === trailKey(query));
  if (exact) return { kind: 'found', group: exact };
  const matching = live
    .filter((g) => [g.name, ...g.otherNames].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => lastWhen(visitsOf(b)).localeCompare(lastWhen(visitsOf(a))) || a.name.localeCompare(b.name));
  if (matching.length === 0) return { kind: 'none' };
  if (matching.length === 1) return { kind: 'found', group: matching[0] };
  return { kind: 'ambiguous', groups: matching };
}

// --- the tool's text ------------------------------------------------------------

/** Shown when getWorkouts answered but no row carries `trails`: an Apps Script from before #688. */
export const NOT_UPDATED =
  'The Thrive API did not send trails with the workouts, so it has not been updated to the version that ' +
  'tags trails (#688). There is nothing to search yet.';

/** Whether a getWorkouts answer comes from an API that sends `trails`. An empty list says nothing either way. */
export const apiSendsTrails = (workouts) =>
  workouts.length === 0 || workouts.some((w) => w && typeof w === 'object' && Object.hasOwn(w, 'trails'));

/** How many passes of one visit the last time shows before `… and <n> more passes`. */
export const PASSES_SHOWN = 6;
/** How many trails the ambiguous answer lists before `… and <n> more`. */
export const MATCHES_SHOWN = 10;

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "4:11" under an hour, "1:02:10" from an hour. */
export function formatDuration(seconds) {
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const hhmm = (time) => String(time ?? '').slice(0, 5);
const when = (date, time) => (time ? `${date} ${hhmm(time)}` : date);
const miles = (metres) => `${(metres / 1609.344).toFixed(1)} mi`;
const label = (w) => `${w.name || '(unnamed)'} [${typeLabel(w)}]`;
const later = (a, b) => a.date > b.date || (a.date === b.date && a.time > b.time);

/** "0 → 100% forward · 0.6 mi · 4:11 · climb 130 ft", leaving out what is unknown. */
export function passText(pass) {
  const parts = [`${pass.startPct} → ${pass.endPct}% ${pass.direction}`];
  if (pass.metres !== null) parts.push(miles(pass.metres));
  if (pass.durationS !== null) parts.push(formatDuration(pass.durationS));
  if (pass.climbM !== null) parts.push(`climb ${metersToFeet(pass.climbM)} ft`);
  return parts.join(' · ');
}

/** The line under a pass: what it was against the like-for-like pass before it. */
export function comparisonText(c) {
  if (!c.previous) return 'no earlier pass over the same stretch in the same direction';
  const parts = [];
  if (c.timeDiffS !== null) {
    if (Math.abs(c.timeDiffS) < 5) parts.push('same time');
    else parts.push(`${formatDuration(c.timeDiffS)} ${c.timeDiffS < 0 ? 'faster' : 'slower'}`);
  }
  if (c.climbDiffM !== null && Math.abs(c.climbDiffM) / 0.3048 >= 10) {
    parts.push(`${metersToFeet(Math.abs(c.climbDiffM))} ft ${c.climbDiffM > 0 ? 'more' : 'less'} climb`);
  }
  let what;
  if (c.timeDiffS === null && c.climbDiffM === null) what = 'no time or climb to compare';
  else what = parts.length ? parts.join(', ') : 'about the same';
  const was = c.previous.pass.durationS;
  const tail = was !== null ? `(was ${formatDuration(was)}, id: ${c.previous.activityId})` : `(id: ${c.previous.activityId})`;
  return `vs ${c.previous.date}: ${what} ${tail}`;
}

function rangeClause(from, to) {
  if (from && to) return ` between ${from} and ${to}`;
  if (from) return ` from ${from}`;
  if (to) return ` up to ${to}`;
  return '';
}

/** `Not tagged yet: …`, or null for none. `last` adds how many are newer than the last time shown. */
function untaggedLine(rows, ranged, last) {
  const n = rows.length;
  if (n === 0) return null;
  const where = ranged ? ' in this range' : '';
  let line = n === 1
    ? `Not tagged yet: 1 tracked activity${where} has no trails recorded, so it may include time on this trail.`
    : `Not tagged yet: ${n} tracked activities${where} have no trails recorded, so they may include time on this trail.`;
  if (last) {
    const k = rows.filter((r) => later(r, last)).length;
    if (k > 0) line += ` ${k} ${k === 1 ? 'is' : 'are'} newer than the last time shown.`;
  }
  return line;
}

function unreadableLine(n) {
  if (n === 0) return null;
  return n === 1
    ? 'Unreadable: 1 tracked activity has a trails value this tool cannot read and is left out.'
    : `Unreadable: ${n} tracked activities have trails values this tool cannot read and are left out.`;
}

/**
 * thrive_trail_history's answer for `trail` (trimmed, at least 2 characters) over
 * getWorkouts' rows. `from` and `to` (YYYY-MM-DD or '') bound the visits, the counts
 * and the untagged count; comparisons reach earlier than `from`. `limit` bounds the
 * list only.
 */
export function describeTrailHistory(workouts, { trail, from = '', to = '', limit = 10 }) {
  const inRange = (date) => (!from || date >= from) && (!to || date <= to);
  const activities = [];
  const byId = new Map();
  const untagged = [];
  let unreadable = 0;

  for (const w of workouts) {
    if (!w || w.status === 'planned') continue;
    const row = { id: String(w.id ?? ''), date: String(w.date ?? ''), time: String(w.time ?? '') };
    const cell = parseTrailsCell(w.trails ?? '');
    if (cell.status === 'untagged') {
      if (String(w.track_ref ?? '') !== '' && inRange(row.date)) untagged.push(row);
    } else if (cell.status === 'unreadable') {
      if (inRange(row.date)) unreadable++;
    } else {
      activities.push({ ...row, passes: cell.passes });
      byId.set(row.id, { workout: w, omitted: cell.omitted });
    }
  }

  const groups = buildTrailGroups(activities);
  const visitsOf = (g) => g.visits.filter((v) => inRange(v.date));
  const ranged = Boolean(from || to);
  const match = matchTrail(groups, trail, visitsOf);
  const tail = (last) => [untaggedLine(untagged, ranged, last), unreadableLine(unreadable)].filter((l) => l !== null);

  if (match.kind === 'none') {
    return [`No tagged activity has a trail matching "${trail}"${rangeClause(from, to)}.`, ...tail(null)].join('\n');
  }

  if (match.kind === 'ambiguous') {
    const lines = [`"${trail}" matches ${match.groups.length} trails; name one of them:`];
    for (const g of match.groups.slice(0, MATCHES_SHOWN)) {
      const visits = visitsOf(g);
      lines.push(`- ${g.name} (${count(visits.length, 'visit', 'visits')}, last ${visits[visits.length - 1].date})`);
    }
    if (match.groups.length > MATCHES_SHOWN) lines.push(`… and ${match.groups.length - MATCHES_SHOWN} more`);
    lines.push('Use a longer part of the name, or the full name.');
    return lines.join('\n');
  }

  const group = match.group;
  const visits = visitsOf(group);
  const first = visits[0];
  const last = visits[visits.length - 1];
  const passCount = visits.reduce((n, v) => n + v.passes.length, 0);
  const span = first.date === last.date ? first.date : `${first.date} to ${last.date}`;
  const lines = [`**${group.name}** — ${count(visits.length, 'visit', 'visits')}, ${count(passCount, 'pass', 'passes')}, ${span}.`];
  if (group.otherNames.length) lines.push(`Also mapped as: ${group.otherNames.join(', ')}.`);

  const lastRow = byId.get(last.activityId);
  lines.push(`Last time: ${when(last.date, last.time)} — ${label(lastRow.workout)} (id: ${last.activityId})`);
  last.passes.slice(0, PASSES_SHOWN).forEach((gp, i) => {
    lines.push(`  Pass ${i + 1}: ${passText(gp.pass)}`);
    lines.push(`    ${comparisonText(compareWithEarlier(group, gp))}`);
  });
  const more = last.passes.length - PASSES_SHOWN;
  if (more > 0) lines.push(`  … and ${count(more, 'more pass', 'more passes')}`);
  if (lastRow.omitted > 0) {
    const x = lastRow.omitted;
    lines.push(`  (${count(x, 'short pass was', 'short passes were')} left out when this activity was tagged)`);
  }

  lines.push(visits.length <= limit
    ? `All ${count(visits.length, 'visit', 'visits')}, newest first:`
    : `Latest ${limit} of ${visits.length} visits, newest first:`);
  for (const v of [...visits].reverse().slice(0, limit)) {
    const w = byId.get(v.activityId).workout;
    const times = v.passes.map((gp) => (gp.pass.durationS === null ? '—' : formatDuration(gp.pass.durationS)));
    lines.push(`- ${when(v.date, v.time)} — ${label(w)} — ${count(v.passes.length, 'pass', 'passes')}: ${times.join(', ')} (id: ${v.activityId})`);
  }

  lines.push(...tail(last));
  return lines.join('\n');
}
