#!/usr/bin/env node
/**
 * spike-681-osm-trails.mjs — The #681 spike: do OpenStreetMap's named trails
 * match real Thrive tracks well enough for trail search (#680)?
 *
 * Hand-run and read-only. It lists tracked activities and reads their stored
 * tracks through the Apps Script API (`getWorkouts`, `getWorkout`,
 * `getWorkoutTrack` — nothing else is allowed through), asks Overpass for the
 * named trails and trail routes around each track, and matches them with
 * `spike-681-match.mjs` at every buffer and heading tolerance in the sweep.
 *
 * **The repository is public.** Everything that names a place, a trail or a
 * date goes only into `scripts/.spike-681/`, which is gitignored:
 *   cache/         Overpass responses, so a re-run makes no request
 *   report.md      per activity, per combination: the sequence and every pass
 *   results.json   the same, for --score
 *   marks.json     yours to fill in: each trail right (true) or wrong (false),
 *                  and the trails you rode that it missed
 * The console gets workout ids, types and figures only, never a coordinate,
 * a trail name or a date, and no error quotes a request or a response.
 *
 * Usage (PowerShell, from thrive/scripts):
 *   $env:THRIVE_API_URL = Read-Host 'THRIVE_API_URL'
 *   $key = Read-Host 'THRIVE_API_KEY' -AsSecureString
 *   $env:THRIVE_API_KEY = [System.Net.NetworkCredential]::new('', $key).Password
 *   node spike-681-osm-trails.mjs                       # newest 20 tracked bike/hike
 *   node spike-681-osm-trails.mjs --types bike,hike,run,walk --limit 30
 *   node spike-681-osm-trails.mjs --ids <id>,<id>       # exactly these, any type
 *   node spike-681-osm-trails.mjs --score               # after marking; no API or network
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUFFERS_M, HEADINGS_DEG, comboKey, matchActivity, score } from './spike-681-match.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const OUT = new URL('./.spike-681/', import.meta.url);
const CACHE = new URL('./cache/', OUT);
const REPORT = new URL('./report.md', OUT);
const RESULTS = new URL('./results.json', OUT);
const MARKS = new URL('./marks.json', OUT);

const ALL_TYPES = ['bike', 'hike', 'run', 'walk'];
const LIMIT = Number(value('--limit', '20'));
const TYPES = value('--types', 'bike,hike').split(',').map((t) => t.trim()).filter(Boolean);
const IDS = value('--ids', '').split(',').map((t) => t.trim()).filter(Boolean);

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'keel-thrive-spike-681/1.0 (one-off trail matching test; https://github.com/luketmoss/keel/issues/681)';
/** Overpass asks for requests one at a time and paced; a busy server gets a longer wait. */
const PAUSE_MS = Number(value('--pause-ms', '5000'));
const RETRY_WAITS_MS = [30_000, 90_000];
const PAD_M = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (m) => `${(m / 1000).toFixed(2)} km`;
const pct = (n) => (n === null ? '—' : `${Math.round(n * 100)}%`);

// --- Matching --------------------------------------------------------------

async function runMatch() {
  const API_URL = process.env.THRIVE_API_URL;
  const API_KEY = process.env.THRIVE_API_KEY;
  if (!API_URL || !API_KEY) {
    console.error(
      'REFUSING: set THRIVE_API_URL and THRIVE_API_KEY.\n' +
      'They are the deployed web app URL and the API_KEY script property — see apps-script/README.md.'
    );
    process.exit(1);
  }
  if (!IDS.length) {
    if (!Number.isInteger(LIMIT) || LIMIT < 1) refuse(`--limit must be a whole number of at least 1, got "${LIMIT}".`);
    const unknown = TYPES.filter((t) => !ALL_TYPES.includes(t));
    if (unknown.length || !TYPES.length) refuse(`--types takes any of ${ALL_TYPES.join(',')}, got "${TYPES.join(',')}".`);
  }

  /** Reads only: the spike changes nothing in the sheet, Drive or the API. */
  const READ_ACTIONS = new Set(['getWorkouts', 'getWorkout', 'getWorkoutTrack']);
  async function api(action, params = {}) {
    if (!READ_ACTIONS.has(action)) throw new Error(`${action} is not a read this script may make`);
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('key', API_KEY);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.json();
    if (!body.success) throw new Error(`${action}: ${body.error}`);
    return body.data;
  }

  // 1. Pick activities.
  let workouts;
  if (IDS.length) {
    workouts = [];
    for (const id of IDS) {
      let w = null;
      try {
        w = await api('getWorkout', { id });
      } catch {
        // Not found reads the same as no track: the id cannot be run.
      }
      if (!w) refuse(`workout ${id} was not found or could not be read.`);
      if (!w.track_ref) refuse(`workout ${id} has no GPS track (track_ref is blank).`);
      workouts.push(w);
    }
  } else {
    const all = await api('getWorkouts');
    workouts = all
      .filter((w) => w.track_ref && TYPES.includes(w.type))
      .sort((a, b) => startKey(b).localeCompare(startKey(a)))
      .slice(0, LIMIT);
  }
  console.log(`${workouts.length} activit${workouts.length === 1 ? 'y' : 'ies'} selected` +
    (IDS.length ? ' by id' : `: newest tracked ${TYPES.join('/')}, limit ${LIMIT}`));
  if (!workouts.length) return;

  mkdirSync(CACHE, { recursive: true });
  const results = [];
  let requests = 0;
  let cached = 0;

  for (const w of workouts) {
    // 2. Track and candidate trails.
    let feature;
    try {
      feature = (await api('getWorkoutTrack', { id: w.id })).track;
    } catch (err) {
      console.log(`  ${w.id} (${w.type}): skipped, the track could not be read (${err.message})`);
      continue;
    }
    let overpass;
    try {
      const got = await overpassFor(feature, () => requests++ > 0);
      if (got.fromCache) cached++;
      overpass = got.body;
    } catch (err) {
      console.log(`  ${w.id} (${w.type}): skipped, ${err.message}`);
      continue;
    }

    // 3–6. Match at every combination.
    let match;
    try {
      match = matchActivity(feature, overpass.elements ?? []);
    } catch {
      console.log(`  ${w.id} (${w.type}): skipped, the track could not be matched`);
      continue;
    }
    results.push({ id: w.id, type: w.type, date: w.date, time: w.time, name: w.name, ...match });
  }

  console.log(`Overpass: ${requests} request${requests === 1 ? '' : 's'}, ${cached} served from the local cache`);
  if (!results.length) return;

  // 7. Report, results and the marks to fill in.
  writeFileSync(REPORT, reportMarkdown(results));
  writeFileSync(RESULTS, JSON.stringify(results.map(forResults), null, 2));
  const marks = mergeMarks(results);
  writeFileSync(MARKS, JSON.stringify(marks, null, 2));

  printSweep(results);
  console.log(
    `\nWrote ${fileURLToPath(REPORT)}\n` +
    `Mark ${fileURLToPath(MARKS)}: each trail true (right) or false (wrong), and add the trails you rode\n` +
    'that it missed to "missed". Then run: node spike-681-osm-trails.mjs --score'
  );
}

function refuse(message) {
  console.error(`REFUSING: ${message}`);
  process.exit(1);
}

const startKey = (w) => String(w.started_at_utc || `${w.date || ''}T${w.time || ''}`);

/**
 * The Overpass response for the track's bounding box, padded by PAD_M, from
 * the cache when this exact query has been made before.
 *
 * @param {() => boolean} needsPause  true when a request has already gone out this run
 */
async function overpassFor(feature, needsPause) {
  const query = overpassQuery(feature);
  const file = new URL(`./${createHash('sha256').update(query).digest('hex').slice(0, 24)}.json`, CACHE);
  if (existsSync(file)) return { fromCache: true, body: JSON.parse(readFileSync(file, 'utf8')) };

  if (needsPause()) await sleep(PAUSE_MS);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) {
      const body = await res.json();
      writeFileSync(file, JSON.stringify(body));
      return { fromCache: false, body };
    }
    // Fixed text: Overpass's error page quotes the query, which holds the bounding box.
    if ((res.status === 429 || res.status === 504) && attempt < RETRY_WAITS_MS.length) {
      console.log(`  Overpass is busy (HTTP ${res.status}); waiting ${RETRY_WAITS_MS[attempt] / 1000} s`);
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }
    throw new Error(`Overpass returned HTTP ${res.status}`);
  }
}

function overpassQuery(feature) {
  const coords = feature.geometry.coordinates;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const padLat = PAD_M / 111_320;
  const padLon = PAD_M / (111_320 * Math.cos(((south + north) / 2) * (Math.PI / 180)));
  const bbox = [south - padLat, Math.min(...lons) - padLon, north + padLat, Math.max(...lons) + padLon]
    .map((n) => n.toFixed(6))
    .join(',');
  return (
    '[out:json][timeout:90];\n(\n' +
    `  way["highway"~"^(path|track|footway|bridleway|cycleway)$"]["name"](${bbox});\n` +
    `  relation["route"~"^(mtb|hiking|bicycle|foot)$"]["name"](${bbox});\n` +
    ');\nout geom;'
  );
}

// --- Output ----------------------------------------------------------------

const PASS_FIELDS = ['trail', 'entry', 'exit', 'metres', 'durationS', 'climbM', 'startM', 'endM', 'startPct', 'endPct', 'share', 'direction'];

function forResults(r) {
  const pick = (p) => Object.fromEntries(PASS_FIELDS.map((k) => [k, p[k]]));
  return {
    id: r.id, type: r.type, date: r.date, name: r.name, totalM: r.totalM,
    combos: r.combos.map((c) => ({
      bufferM: c.bufferM,
      headingDeg: c.headingDeg,
      trailsFound: c.trailsFound,
      matchedM: c.matchedM,
      unmatchedM: c.unmatchedM,
      sequence: c.sequence.map((s) => (s.gap ? s : pick(s))),
      routePasses: c.routePasses.map(pick),
    })),
  };
}

const dur = (s) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour12: false }) : '—');
const span = (p) => `${Math.round(p.startPct)}→${Math.round(p.endPct)}%`;

function sequenceLine(sequence) {
  return sequence
    .map((s) => s.gap
      ? `unmatched ${km(s.metres)}`
      : `${s.trail} ${span(s)}${s.direction === 'reverse' ? ', reverse' : ''} (${km(s.metres)})`)
    .join(' → ') || '(nothing)';
}

function passTable(passes) {
  const rows = passes.map((p, i) =>
    `| ${i + 1} | ${p.trail} | ${clock(p.entry)} | ${clock(p.exit)} | ${Math.round(p.metres)} | ${dur(p.durationS)} | ` +
    `${p.climbM === null ? '—' : Math.round(p.climbM)} | ${Math.round(p.startM)} m (${Math.round(p.startPct)}%) | ` +
    `${Math.round(p.endM)} m (${Math.round(p.endPct)}%) | ${pct(p.share)} | ${p.direction} |`);
  return [
    '| # | Trail | Entry | Exit | m | Duration | Climb m | Start | End | Share | Direction |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function reportMarkdown(results) {
  const out = [
    '# #681 trail matching report',
    '',
    'Local and gitignored: never commit, paste or post anything from this file.',
    `Combinations: buffers ${BUFFERS_M.join('/')} m × heading tolerance ${HEADINGS_DEG.join('/')}°.`,
    'A pass counts when it rides at least 200 m or at least 50% of its trail. Direction is toward',
    "the trail's 100% end (forward) or its 0% end (reverse). Routes are matched in their own layer.",
    '',
  ];
  for (const r of results) {
    out.push(`## ${r.date} ${r.time ?? ''} · ${r.type} · ${r.name || '(no name)'} (\`${r.id}\`)`, '');
    out.push(`${km(r.totalM)} tracked. Named trails in the area: ${r.trailCount}; routes: ${r.routeCount}.`, '');
    for (const c of r.combos) {
      const passes = c.sequence.filter((s) => !s.gap);
      out.push(`### ${comboKey(c)}`, '');
      out.push(`Unmatched ${km(c.unmatchedM)} of ${km(r.totalM)}.`, '');
      out.push(`**Sequence:** ${sequenceLine(c.sequence)}`, '');
      if (passes.length) out.push(passTable(passes), '');
      if (c.routePasses.length) out.push('**Routes:**', '', passTable(c.routePasses), '');
    }
  }
  return out.join('\n');
}

/** Every trail any combination found, keeping marks already made. */
function mergeMarks(results) {
  const marks = existsSync(MARKS) ? JSON.parse(readFileSync(MARKS, 'utf8')) : {};
  marks._how = 'Set each trail to true (right) or false (wrong); list trails you rode that are not here under "missed". Then run --score.';
  for (const r of results) {
    const m = (marks[r.id] ??= { label: '', trails: {}, missed: [] });
    m.label = `${r.date} · ${r.type} · ${r.name || '(no name)'}`;
    for (const c of r.combos) for (const name of c.trailsFound) if (!(name in m.trails)) m.trails[name] = null;
  }
  return marks;
}

function printSweep(results) {
  console.log('\nSweep: passes / trails / matched share, per activity and combination');
  const keys = results[0].combos.map(comboKey);
  console.log(['id'.padEnd(14), 'type'.padEnd(5), ...keys.map((k) => k.padStart(14))].join(' '));
  for (const r of results) {
    const cells = r.combos.map((c) => {
      const passes = c.sequence.filter((s) => !s.gap).length;
      const share = r.totalM ? Math.round((100 * c.matchedM) / r.totalM) : 0;
      return `${passes}/${c.trailsFound.length}/${share}%`.padStart(14);
    });
    console.log([String(r.id).slice(0, 14).padEnd(14), r.type.padEnd(5), ...cells].join(' '));
  }
}

// --- Scoring ---------------------------------------------------------------

function runScore() {
  if (!existsSync(RESULTS) || !existsSync(MARKS)) {
    refuse('run the matching first: there are no results or marks to score.');
  }
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'));
  const marks = JSON.parse(readFileSync(MARKS, 'utf8'));
  const marked = results.filter((r) => marks[r.id]);
  const byType = {};
  for (const r of marked) byType[r.type] = (byType[r.type] ?? 0) + 1;
  console.log(`Activities scored: ${marked.length} (${Object.entries(byType).map(([t, n]) => `${t} ${n}`).join(', ') || 'none'})`);

  const rows = score(results, marks);
  console.log('\ncombination   group  precision  recall  listed  unmarked  ridden');
  for (const r of rows.sort((a, b) => a.combo.localeCompare(b.combo) || (a.group === 'all' ? -1 : b.group === 'all' ? 1 : a.group.localeCompare(b.group)))) {
    console.log(
      `${r.combo.padEnd(12)}  ${r.group.padEnd(5)}  ${pct(r.precision).padStart(9)}  ${pct(r.recall).padStart(6)}  ` +
      `${String(r.listed).padStart(6)}  ${String(r.unmarked).padStart(8)}  ${String(r.ridden).padStart(6)}`
    );
  }
  const f1 = (r) => (r.precision && r.recall ? (2 * r.precision * r.recall) / (r.precision + r.recall) : 0);
  const best = rows.filter((r) => r.group === 'all').sort((a, b) => f1(b) - f1(a))[0];
  if (best) console.log(`\nBest overall by F1: ${best.combo} (precision ${pct(best.precision)}, recall ${pct(best.recall)})`);
  const unmarked = rows.filter((r) => r.group === 'all').reduce((n, r) => n + r.unmarked, 0);
  if (unmarked) console.log(`${unmarked} listed trail${unmarked === 1 ? ' is' : 's are'} still unmarked (null) and count toward neither figure.`);
}

// Last, so every helper above is defined before it runs.
if (has('--score')) {
  runScore();
} else {
  await runMatch();
}
