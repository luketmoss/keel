// #691 — the trail rules against the shared golden fixture, and
// thrive_trail_history's text. Pure; run with `node --test`. Synthetic only:
// invented trail names and 2000-01-01-style dates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  parseTrailsCell, splitTrailName, trailKey, buildTrailGroups, isLikeForLike, compareWithEarlier,
  describeTrailHistory, apiSendsTrails, comparisonText, formatDuration,
} from './trails.js';

const GOLDEN = JSON.parse(readFileSync(new URL('../../test/fixtures/trails-rules-golden.json', import.meta.url), 'utf8'));

// --- the golden fixture -------------------------------------------------------

test('golden: the example cell decodes to the passes the fixture lists', () => {
  const { cell, matcherVersion, unmatchedM, omitted, passes } = GOLDEN.example;
  assert.deepEqual(parseTrailsCell(cell), { status: 'tagged', matcherVersion, unmatchedM, omitted, passes });
});

test('golden: blank is untagged; anything not a valid v1 value is unreadable; neither throws', () => {
  assert.deepEqual(parseTrailsCell(''), { status: 'untagged' });
  assert.deepEqual(parseTrailsCell(undefined), { status: 'untagged' });
  const ok = '{"v":1,"m":1,"u":0,"n":[["Heron Loop",900]],"p":[[0,0,100,1,900,300,20,0]]}';
  assert.equal(parseTrailsCell(ok).status, 'tagged');
  for (const bad of [
    'not json',
    '[]',
    '{"v":2,"m":1,"u":0,"n":[],"p":[]}',
    '{"v":1,"m":1,"u":0,"n":[["Heron Loop",900]],"p":[[1,0,100,1,900,300,20,0]]}',
    '{"v":1,"m":1,"u":0,"n":[["Heron Loop",900]],"p":[[0,0,100,1,900,300,20]]}',
    '{"v":1,"m":1,"u":0,"n":[["Heron Loop",900]],"p":[[0,0,100,1,900,300,20,0,0]]}',
    '{"v":1,"m":1,"u":0,"n":[["Heron Loop",900]],"p":[]}',
    '{"v":1,"m":1,"u":0,"n":[],"p":[],"q":1}',
    '{"v":1,"m":1,"u":0,"n":[],"p":[],"x":0}',
  ]) {
    assert.deepEqual(parseTrailsCell(bad), { status: 'unreadable' }, bad);
  }
  assert.deepEqual(parseTrailsCell('{"v":1,"m":1,"u":4210,"n":[],"p":[]}'),
    { status: 'tagged', matcherVersion: 1, unmatchedM: 4210, passes: [], omitted: 0 });
});

test('golden: names split into variants, and each variant has its key', () => {
  for (const { name, variants, keys } of GOLDEN.names) {
    assert.deepEqual(splitTrailName(name), variants, name);
    assert.deepEqual(variants.map(trailKey), keys, name);
  }
});

test('golden: like-for-like pairs, both ways round', () => {
  for (const { case: what, a, b, like } of GOLDEN.likeForLike) {
    assert.equal(isLikeForLike(a, b), like, what);
    assert.equal(isLikeForLike(b, a), like, `${what} (reversed)`);
  }
});

test('golden: the history groups as the fixture says', () => {
  const groups = buildTrailGroups(GOLDEN.history.activities);
  assert.deepEqual([...groups.keys()].sort(), GOLDEN.history.groups.map((g) => g.key).sort());
  for (const want of GOLDEN.history.groups) {
    const g = groups.get(want.key);
    assert.equal(g.name, want.name, want.key);
    assert.deepEqual(g.otherNames, want.otherNames, want.key);
    assert.deepEqual(g.visits.map((v) => v.activityId), want.visits, want.key);
  }
});

test('golden: each pass in the history compares with the pass the fixture names, or none', () => {
  const { activities, comparisons } = GOLDEN.history;
  const groups = buildTrailGroups(activities);
  const passOf = (id, i) => activities.find((a) => a.id === id).passes[i];
  for (const want of comparisons) {
    const what = `${want.group}: ${want.activity} pass ${want.pass}`;
    const group = groups.get(want.group);
    const gp = group.visits.find((v) => v.activityId === want.activity).passes.find((p) => p.pass === passOf(want.activity, want.pass));
    assert.ok(gp, what);
    const c = compareWithEarlier(group, gp);
    if (want.previous === null) {
      assert.equal(c.previous, null, what);
      continue;
    }
    assert.equal(c.previous.activityId, want.previous.activity, what);
    assert.equal(c.previous.pass, passOf(want.previous.activity, want.previous.pass), what);
    assert.equal(c.timeDiffS, want.timeDiffS, what);
    assert.equal(c.climbDiffM, want.climbDiffM, what);
  }
  // Every pass of every group is covered, so a new rule cannot slip past the list.
  const covered = [...groups.values()].reduce((n, g) => n + g.visits.reduce((m, v) => m + v.passes.length, 0), 0);
  assert.equal(comparisons.length, covered);
});

test('a comparison only ever points at an earlier activity, never at a lap of the same one', () => {
  const groups = buildTrailGroups(GOLDEN.history.activities);
  for (const g of groups.values()) {
    g.visits.forEach((v, i) => {
      for (const gp of v.passes) {
        const c = compareWithEarlier(g, gp);
        if (c.previous) assert.ok(g.visits.findIndex((x) => x.activityId === c.previous.activityId) < i);
      }
    });
  }
});

// --- the tool's text ------------------------------------------------------------

/** A Workouts row as getWorkouts returns it, with only the fields the tool reads. */
const row = (o) => ({
  id: o.id, date: o.date, time: o.time ?? '08:00', type: o.type ?? 'bike', sub_type: o.sub_type ?? 'mtb',
  name: o.name ?? 'Morning ride', status: o.status ?? '', track_ref: o.track_ref ?? 'trk', trails: o.trails ?? '',
});

/** A pass as the cell stores it: [name, s, e, metres, durationS, climbM, entryOffsetS]; direction from s and e. */
function cell(passes, extra = {}) {
  const names = [...new Set(passes.map((p) => p[0]))];
  return JSON.stringify({
    v: 1, m: 1, u: 0,
    n: names.map((n) => [n, 1000]),
    p: passes.map(([name, s, e, metres, dur, climb, off]) => [names.indexOf(name), s, e, e >= s ? 1 : -1, metres, dur, climb, off]),
    ...extra,
  });
}

// Heron Loop's history: 7 visits, 9 passes, from 2000-01-02 to 2000-03-20.
const HERON = [
  row({ id: 'w01', date: '2000-01-02', name: 'First loop', trails: cell([['Heron Loop', 0, 100, 1000, 300, 40, 0]]) }),
  row({ id: 'w02', date: '2000-01-09', name: 'Second loop', trails: cell([['Heron Loop Trail', 0, 100, 1000, 290, 40, 0]]) }),
  row({ id: 'w03', date: '2000-01-16', name: 'Third loop', trails: cell([['Heron Loop', 0, 100, 1000, null, null, 0]]) }),
  row({ id: 'w04', date: '2000-02-06', name: 'Fourth loop', trails: cell([['Heron Loop', 100, 0, 1000, 245, 0, 0]]) }),
  row({ id: 'w05', date: '2000-02-20', name: 'Fifth loop', trails: cell([['Heron Loop', 0, 100, 1000, 285, 33, 0]]) }),
  row({ id: 'w06', date: '2000-03-05', time: '17:30', name: 'Evening ride', trails: cell([['Heron Loop', 0, 100, 1000, 291, 34, 0]]) }),
  row({
    id: 'w07', date: '2000-03-20', name: 'Morning ride',
    trails: cell([['Heron Loop', 0, 100, 1000, 251, 40, 0], ['Heron Loop', 100, 0, 1000, 238, 0, 600], ['Heron Loop Trail', 40, 100, 1000, 400, 40, 900]]),
  }),
  // Other trails, a planned row, an untracked row, an untagged row older than the last visit.
  row({ id: 'w08', date: '2000-02-01', trails: cell([['Lower Heron', 0, 100, 500, 120, 5, 0]]) }),
  row({ id: 'w09', date: '2000-03-25', status: 'planned', trails: '' }),
  row({ id: 'w10', date: '2000-03-26', track_ref: '', trails: '' }),
  row({ id: 'w11', date: '2000-02-10', trails: '' }),
];

test('Found: the last visit, its passes and comparisons in time order, then the list newest first', () => {
  assert.equal(describeTrailHistory(HERON, { trail: 'heron loop', limit: 3 }), [
    '**Heron Loop** — 7 visits, 9 passes, 2000-01-02 to 2000-03-20.',
    'Also mapped as: Heron Loop Trail.',
    'Last time: 2000-03-20 08:00 — Morning ride [bike:mtb] (id: w07)',
    '  Pass 1: 0 → 100% forward · 0.6 mi · 4:11 · climb 130 ft',
    '    vs 2000-03-05: 0:40 faster, 20 ft more climb (was 4:51, id: w06)',
    '  Pass 2: 100 → 0% reverse · 0.6 mi · 3:58 · climb 0 ft',
    '    vs 2000-02-06: 0:07 faster (was 4:05, id: w04)',
    '  Pass 3: 40 → 100% forward · 0.6 mi · 6:40 · climb 130 ft',
    '    no earlier pass over the same stretch in the same direction',
    'Latest 3 of 7 visits, newest first:',
    '- 2000-03-20 08:00 — Morning ride [bike:mtb] — 3 passes: 4:11, 3:58, 6:40 (id: w07)',
    '- 2000-03-05 17:30 — Evening ride [bike:mtb] — 1 pass: 4:51 (id: w06)',
    '- 2000-02-20 08:00 — Fifth loop [bike:mtb] — 1 pass: 4:45 (id: w05)',
    'Not tagged yet: 1 tracked activity has no trails recorded, so it may include time on this trail.',
  ].join('\n'));
});

test('the newest tracked activity untagged: "1 is newer than the last time shown"', () => {
  const rows = [...HERON, row({ id: 'w12', date: '2000-03-21', trails: '' })];
  const out = describeTrailHistory(rows, { trail: 'Heron Loop' });
  assert.match(out, /\nNot tagged yet: 2 tracked activities have no trails recorded, so they may include time on this trail\. 1 is newer than the last time shown\.$/);
  // Same day, later time is newer too; an earlier time is not.
  const sameDay = [...HERON, row({ id: 'w12', date: '2000-03-20', time: '09:00' }), row({ id: 'w13', date: '2000-03-20', time: '07:00' })];
  assert.match(describeTrailHistory(sameDay, { trail: 'Heron Loop' }), /3 tracked activities .* 1 is newer than the last time shown\.$/);
});

test('nothing tagged and 14 untagged: the no-match text with the Not tagged yet line, never a bare no', () => {
  const rows = Array.from({ length: 14 }, (_, i) => row({ id: `u${i}`, date: `2000-01-${String(i + 1).padStart(2, '0')}` }));
  rows.push(row({ id: 'p1', date: '2000-01-20', status: 'planned' }), row({ id: 'n1', date: '2000-01-21', track_ref: '' }));
  assert.equal(describeTrailHistory(rows, { trail: 'heron' }), [
    'No tagged activity has a trail matching "heron".',
    'Not tagged yet: 14 tracked activities have no trails recorded, so they may include time on this trail.',
  ].join('\n'));
  assert.equal(describeTrailHistory([], { trail: 'heron' }), 'No tagged activity has a trail matching "heron".');
});

test('the untagged count leaves out planned rows, rows with no track and tagged rows', () => {
  const rows = [
    row({ id: 't1', date: '2000-01-01', trails: cell([['Heron Loop', 0, 100, 1000, 300, 40, 0]]) }),
    row({ id: 't2', date: '2000-01-02', trails: '{"v":1,"m":1,"u":900,"n":[],"p":[]}' }),
    row({ id: 'p1', date: '2000-01-03', status: 'planned' }),
    row({ id: 'n1', date: '2000-01-04', track_ref: '' }),
  ];
  const out = describeTrailHistory(rows, { trail: 'heron loop' });
  assert.ok(!out.includes('Not tagged yet'), out);
  assert.ok(!out.includes('Unreadable'), out);
  // A planned row with trails is not a visit either.
  const planned = [...rows, row({ id: 'p2', date: '2000-01-05', status: 'planned', trails: cell([['Heron Loop', 0, 100, 1000, 1, 1, 0]]) })];
  assert.match(describeTrailHistory(planned, { trail: 'heron loop' }), /^\*\*Heron Loop\*\* — 1 visit, 1 pass, 2000-01-01\./);
});

test('an unreadable value is counted in Unreadable and nowhere else, and is never printed', () => {
  const raw = '{"v":1,"m":1,"u":0,"n":[["Secret Spur",9]],"p":[[3,0,100,1,9,9,9,9]]}';
  const rows = [
    row({ id: 't1', date: '2000-01-01', trails: cell([['Heron Loop', 0, 100, 1000, 300, 40, 0]]) }),
    row({ id: 'x1', date: '2000-01-02', trails: raw }),
    row({ id: 'x2', date: '2000-01-03', track_ref: '', trails: 'garbage' }),
  ];
  const found = describeTrailHistory(rows, { trail: 'heron loop' });
  assert.match(found, /\nUnreadable: 2 tracked activities have trails values this tool cannot read and are left out\.$/);
  assert.ok(!found.includes('Not tagged yet'));
  const none = describeTrailHistory(rows.slice(0, 2), { trail: 'secret' });
  assert.equal(none, 'No tagged activity has a trail matching "secret".\n' +
    'Unreadable: 1 tracked activity has a trails value this tool cannot read and is left out.');
  for (const out of [found, none]) {
    assert.ok(!out.includes(raw) && !out.includes('garbage') && !out.includes('Secret Spur'));
  }
});

test('a visit tagged with left-out passes says so; more than 6 passes show 6 and how many more', () => {
  const laps = Array.from({ length: 8 }, (_, i) => ['Heron Loop', 0, 100, 1000, 300 + i, 40, i * 400]);
  const rows = [row({ id: 'w1', date: '2000-01-01', trails: cell(laps, { x: 3 }) })];
  const out = describeTrailHistory(rows, { trail: 'heron loop' });
  assert.equal((out.match(/^ {2}Pass \d:/gm) ?? []).length, 6);
  assert.match(out, /\n {2}Pass 6: [^\n]*\n {4}no earlier pass[^\n]*\n {2}… and 2 more passes\n {2}\(3 short passes were left out when this activity was tagged\)\n/);
  assert.match(out, /^\*\*Heron Loop\*\* — 1 visit, 8 passes, 2000-01-01\.\n/);
  assert.match(out, /\nAll 1 visit, newest first:\n- 2000-01-01 08:00 — Morning ride \[bike:mtb\] — 8 passes: 5:00, 5:01, 5:02, 5:03, 5:04, 5:05, 5:06, 5:07 \(id: w1\)$/);
  // A tagged value with no named trail is tagged: not untagged, not unreadable.
  const none = [...rows, row({ id: 'w2', date: '2000-01-02', trails: '{"v":1,"m":1,"u":900,"n":[],"p":[]}' })];
  assert.ok(!/Not tagged yet|Unreadable/.test(describeTrailHistory(none, { trail: 'heron loop' })));
});

// --- matching -------------------------------------------------------------------

const MANY = [
  row({ id: 'm1', date: '2000-01-01', trails: cell([['Heron Loop', 0, 100, 1000, 300, 40, 0]]) }),
  row({ id: 'm2', date: '2000-01-05', trails: cell([['Heron Loop', 0, 100, 1000, 300, 40, 0]]) }),
  row({ id: 'm3', date: '2000-02-02', trails: cell([['Heron Ridge Trail', 0, 100, 800, 200, 30, 0]]) }),
  row({ id: 'm4', date: '2000-01-09', trails: cell([['Heron Ridge Trail', 0, 100, 800, 200, 30, 0]]) }),
  row({ id: 'm5', date: '2000-01-10', trails: cell([['Lower Heron', 0, 100, 500, 100, 5, 0]]) }),
  row({ id: 'm6', date: '2000-01-11', trails: cell([['Heron Ridge Trail', 0, 100, 800, 200, 30, 0]]) }),
];

test('ambiguous: each matching trail with its visits and last date, newest first', () => {
  assert.equal(describeTrailHistory(MANY, { trail: 'heron' }), [
    '"heron" matches 3 trails; name one of them:',
    '- Heron Ridge Trail (3 visits, last 2000-02-02)',
    '- Lower Heron (1 visit, last 2000-01-10)',
    '- Heron Loop (2 visits, last 2000-01-05)',
    'Use a longer part of the name, or the full name.',
  ].join('\n'));
});

test('ambiguous: ties by name, and at most 10 lines then how many more', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row({
    id: `r${i}`, date: '2000-01-01', trails: cell([[`Spur ${String.fromCharCode(65 + i)}`, 0, 100, 100, 30, 1, 0]]),
  }));
  const out = describeTrailHistory(rows, { trail: 'spur' }).split('\n');
  assert.equal(out[0], '"spur" matches 12 trails; name one of them:');
  assert.equal(out[1], '- Spur A (1 visit, last 2000-01-01)');
  assert.equal(out[10], '- Spur J (1 visit, last 2000-01-01)');
  assert.equal(out[11], '… and 2 more');
  assert.equal(out.length, 13);
});

test('an exact key wins over trails that merely contain it, and a trailing " Trail" still matches', () => {
  const rows = [...MANY, row({ id: 'm7', date: '2000-01-12', trails: cell([['Upper Heron Loop', 0, 100, 500, 100, 5, 0]]) })];
  for (const q of ['Heron Loop', 'heron  loop', 'Heron Loop Trail']) {
    assert.match(describeTrailHistory(rows, { trail: q }), /^\*\*Heron Loop\*\* — 2 visits, 2 passes, 2000-01-01 to 2000-01-05\./, q);
  }
  assert.match(describeTrailHistory(rows, { trail: 'Heron Ridge' }), /^\*\*Heron Ridge Trail\*\* — 3 visits/);
});

test('a query matching a variant other than the display name finds the group and lists the rest', () => {
  const rows = [
    row({ id: 'v1', date: '2000-01-01', trails: cell([['Kestrel Connector', 0, 100, 160, 60, 5, 0]]) }),
    row({ id: 'v2', date: '2000-01-02', trails: cell([['Kestrel Connector', 0, 100, 160, 58, 5, 0]]) }),
    row({ id: 'v3', date: '2000-01-03', trails: cell([['Aspen Draw;kestrel  connector', 0, 100, 160, 61, 5, 0]]) }),
  ];
  const out = describeTrailHistory(rows, { trail: 'kestrel  conn' });
  assert.match(out, /^\*\*Kestrel Connector\*\* — 3 visits, 3 passes, 2000-01-01 to 2000-01-03\.\nAlso mapped as: kestrel {2}connector\.\n/);
  // The pass on "Aspen Draw;kestrel  connector" is not like-for-like with "Kestrel Connector".
  assert.match(out, /Pass 1: [^\n]*\n {4}no earlier pass over the same stretch in the same direction\n/);
});

// --- dates and limit ------------------------------------------------------------

test('a date range bounds the list, the counts, the header and the untagged count; comparisons reach earlier', () => {
  const out = describeTrailHistory(HERON, { trail: 'heron loop', from: '2000-02-15', to: '2000-03-10' });
  assert.equal(out, [
    '**Heron Loop** — 2 visits, 2 passes, 2000-02-20 to 2000-03-05.',
    'Also mapped as: Heron Loop Trail.',
    'Last time: 2000-03-05 17:30 — Evening ride [bike:mtb] (id: w06)',
    '  Pass 1: 0 → 100% forward · 0.6 mi · 4:51 · climb 110 ft',
    '    vs 2000-02-20: 0:06 slower (was 4:45, id: w05)',
    'All 2 visits, newest first:',
    '- 2000-03-05 17:30 — Evening ride [bike:mtb] — 1 pass: 4:51 (id: w06)',
    '- 2000-02-20 08:00 — Fifth loop [bike:mtb] — 1 pass: 4:45 (id: w05)',
  ].join('\n'));
  // The first visit in range still compares with a pass from before date_from.
  assert.match(describeTrailHistory(HERON, { trail: 'heron loop', from: '2000-02-20', to: '2000-02-20' }),
    /^\*\*Heron Loop\*\* — 1 visit, 1 pass, 2000-02-20\.\n[^\n]*\nLast time: [^\n]*\n[^\n]*\n {4}vs 2000-01-16: no time or climb to compare \(id: w03\)\n/);
  // The untagged row on 2000-02-10 is in this range, and said with the range.
  assert.match(describeTrailHistory(HERON, { trail: 'heron loop', from: '2000-02-01', to: '2000-02-28' }),
    /\nNot tagged yet: 1 tracked activity in this range has no trails recorded, so it may include time on this trail\.$/);
});

test('a range with no visits gives the no-match text with the range clause', () => {
  assert.equal(describeTrailHistory(HERON, { trail: 'heron loop', from: '2001-01-01', to: '2001-06-30' }),
    'No tagged activity has a trail matching "heron loop" between 2001-01-01 and 2001-06-30.');
  assert.equal(describeTrailHistory(HERON, { trail: 'heron loop', from: '2001-01-01' }),
    'No tagged activity has a trail matching "heron loop" from 2001-01-01.');
  const upTo = describeTrailHistory(HERON, { trail: 'heron loop', to: '1999-12-31' });
  assert.equal(upTo, 'No tagged activity has a trail matching "heron loop" up to 1999-12-31.');
  const withUntagged = describeTrailHistory(HERON, { trail: 'lower heron', from: '2000-02-05', to: '2000-02-15' });
  assert.equal(withUntagged, 'No tagged activity has a trail matching "lower heron" between 2000-02-05 and 2000-02-15.\n' +
    'Not tagged yet: 1 tracked activity in this range has no trails recorded, so it may include time on this trail.');
});

test('limit changes only the list: the last time and its comparisons are the same at 1 and 50', () => {
  const head = (out) => out.slice(0, out.indexOf('\nAll ') === -1 ? out.indexOf('\nLatest ') : out.indexOf('\nAll '));
  const one = describeTrailHistory(HERON, { trail: 'heron loop', limit: 1 });
  const fifty = describeTrailHistory(HERON, { trail: 'heron loop', limit: 50 });
  assert.equal(head(one), head(fifty));
  assert.match(one, /\nLatest 1 of 7 visits, newest first:\n- 2000-03-20 [^\n]*\nNot tagged yet/);
  assert.match(fifty, /\nAll 7 visits, newest first:\n/);
  assert.equal((fifty.match(/^- /gm) ?? []).length, 7);
});

// --- wording pieces -------------------------------------------------------------

test('comparison wording: same time under 5 s, climb only from 10 ft, about the same, and no was when unknown', () => {
  const prev = (durationS, climbM) => ({ activityId: 'w0', date: '2000-01-01', pass: { durationS, climbM } });
  assert.equal(comparisonText({ previous: prev(300, 40), timeDiffS: 4, climbDiffM: 2 }), 'vs 2000-01-01: same time (was 5:00, id: w0)');
  assert.equal(comparisonText({ previous: prev(300, 40), timeDiffS: -5, climbDiffM: -6 }), 'vs 2000-01-01: 0:05 faster, 20 ft less climb (was 5:00, id: w0)');
  assert.equal(comparisonText({ previous: prev(null, 40), timeDiffS: null, climbDiffM: 1 }), 'vs 2000-01-01: about the same (id: w0)');
  assert.equal(comparisonText({ previous: prev(null, 40), timeDiffS: null, climbDiffM: 9 }), 'vs 2000-01-01: 30 ft more climb (id: w0)');
  assert.equal(comparisonText({ previous: prev(null, null), timeDiffS: null, climbDiffM: null }), 'vs 2000-01-01: no time or climb to compare (id: w0)');
  assert.equal(comparisonText({ previous: null, timeDiffS: null, climbDiffM: null }), 'no earlier pass over the same stretch in the same direction');
  assert.equal(formatDuration(3730), '1:02:10');
  assert.equal(formatDuration(251), '4:11');
});

test('the API sends trails when any row carries the field; an empty list is not a refusal', () => {
  assert.equal(apiSendsTrails([]), true);
  assert.equal(apiSendsTrails([{ id: 'w1' }, { id: 'w2', trails: '' }]), true);
  assert.equal(apiSendsTrails([{ id: 'w1' }, { id: 'w2' }]), false);
});

test('no output carries a coordinate, a bounding box or a raw cell', () => {
  const outs = [
    describeTrailHistory(HERON, { trail: 'heron loop' }),
    describeTrailHistory(MANY, { trail: 'heron' }),
    describeTrailHistory(HERON, { trail: 'nowhere' }),
  ];
  for (const out of outs) {
    assert.ok(!/"v":|\[\[|bbox|-?\d+\.\d{4,}/.test(out), out);
  }
});
