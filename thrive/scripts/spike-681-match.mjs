/**
 * spike-681-match.mjs — The matching rules for the #681 spike, with no I/O.
 *
 * Matches one stored Thrive track (the GeoJSON Feature `getWorkoutTrack`
 * serves, built by `sync/src/track.mjs`) against OpenStreetMap elements from
 * one Overpass response, and turns its marks into precision and recall. Kept
 * apart from the CLI so the build phase of #680 can reuse it, and so the rules
 * can be tested on synthetic tracks (`spike-681-match.test.mjs`).
 *
 * Every distance is in metres on a local flat-earth plane centred on the
 * track's first point: over one activity's extent the error is far below the
 * buffers being tested. Nothing here logs, and no error quotes a coordinate.
 */

const EARTH_RADIUS_METERS = 6_371_008.8;
const RAD = Math.PI / 180;

/** Defaults from the issue: densify to ~5 m, heading over ~20 m, bridge gaps under ~50 m. */
export const SPACING_M = 5;
export const HEADING_WINDOW_M = 20;
export const GAP_M = 50;
/** A pass counts when it rides at least this far, or at least this share of its trail. */
export const MIN_PASS_M = 200;
export const MIN_PASS_SHARE = 0.5;

/** The sweep: every buffer is run with every heading tolerance. */
export const BUFFERS_M = [15, 20, 25];
export const HEADINGS_DEG = [30, 45];

const TRAIL_HIGHWAYS = new Set(['path', 'track', 'footway', 'bridleway', 'cycleway']);
const ROUTE_KINDS = new Set(['mtb', 'hiking', 'bicycle', 'foot']);

/** A plane centred on `origin` ({ lat, lon }). */
export function makeProjection(origin) {
  const cos = Math.cos(origin.lat * RAD);
  return {
    toXY: (lon, lat) => ({
      x: (lon - origin.lon) * RAD * EARTH_RADIUS_METERS * cos,
      y: (lat - origin.lat) * RAD * EARTH_RADIUS_METERS,
    }),
  };
}

// --- Track ---------------------------------------------------------------

/**
 * The stored track with a point at most every `spacing` metres, `t` and `ele`
 * interpolated with it. RDP keeps only the corners, so a straight kilometre
 * is two points; matching needs the stretch between them.
 *
 * @returns {{ projection, startMs: number, points: { x, y, t, ele, cum }[] }}
 */
export function densifyTrack(feature, spacing = SPACING_M) {
  const coords = feature?.geometry?.coordinates ?? [];
  const props = feature?.properties ?? {};
  if (coords.length < 2) throw new Error('the track has fewer than two points');
  const t = props.t ?? [];
  const ele = props.ele ?? [];
  const projection = makeProjection({ lon: coords[0][0], lat: coords[0][1] });
  const startMs = Date.parse(props.start_utc);

  const vertices = coords.map(([lon, lat], i) => ({
    ...projection.toXY(lon, lat),
    t: Number.isFinite(t[i]) ? t[i] : null,
    ele: Number.isFinite(ele[i]) ? ele[i] : null,
  }));

  const points = [{ ...vertices[0], cum: 0 }];
  let cum = 0;
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      points.push({
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        t: lerp(a.t, b.t, f),
        ele: lerp(a.ele, b.ele, f),
        cum: cum + length * f,
      });
    }
    cum += length;
  }
  return { projection, startMs, points };
}

const lerp = (a, b, f) => (a === null || b === null ? null : a + (b - a) * f);

/**
 * The track's direction at each point, in radians, over a window of about
 * `window` metres centred on it; null where the track has not moved.
 */
export function trackHeadings(points, window = HEADING_WINDOW_M) {
  const half = window / 2;
  const headings = new Array(points.length);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < points.length; i++) {
    while (lo < i && points[i].cum - points[lo + 1].cum >= half) lo++;
    if (hi < i) hi = i;
    while (hi < points.length - 1 && points[hi].cum - points[i].cum < half) hi++;
    const a = points[lo];
    const b = points[hi];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    headings[i] = dx === 0 && dy === 0 ? null : Math.atan2(dy, dx);
  }
  return headings;
}

// --- Trails ----------------------------------------------------------------

/**
 * The named trails and routes in one Overpass response (`out geom`).
 *
 * Ways with the same name become one trail; a route relation is its own entry
 * under its own name, in a separate layer, so it is reported alongside its
 * member trails rather than competing with them for the same points.
 *
 * @returns {{ trails: Trail[], routes: Trail[] }}
 */
export function buildTrails(elements, projection) {
  const byName = new Map();
  const routes = [];
  for (const el of elements ?? []) {
    const name = el?.tags?.name;
    if (!name) continue;
    if (el.type === 'way' && TRAIL_HIGHWAYS.has(el.tags.highway)) {
      const line = toLine(el.geometry, projection);
      if (line.length < 2) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(line);
    } else if (el.type === 'relation' && ROUTE_KINDS.has(el.tags.route)) {
      const lines = (el.members ?? [])
        .filter((m) => m.type === 'way')
        .map((m) => toLine(m.geometry, projection))
        .filter((line) => line.length >= 2);
      if (lines.length) routes.push(makeTrail(name, lines, 'route'));
    }
  }
  const trails = [...byName].map(([name, lines]) => makeTrail(name, lines, 'trail'));
  return { trails, routes };
}

function toLine(geometry, projection) {
  return (geometry ?? [])
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => projection.toXY(p.lon, p.lat));
}

const JOIN_M = 1;

/**
 * One trail from its pieces. Pieces that share an end are chained (reversing
 * one where needed); what is left is laid end to end, nearest end first,
 * starting from the longest chain. That gives every point on the trail one
 * position, in metres from its 0% end, with the stretches between disconnected
 * pieces adding no length.
 */
export function makeTrail(name, lines, kind = 'trail') {
  const chains = chainLines(lines.map((l) => l.slice()));
  chains.sort((a, b) => lineLength(b) - lineLength(a));
  const ordered = [chains.shift()];
  while (chains.length) {
    const end = ordered.at(-1).at(-1);
    let best = 0;
    let bestDistance = Infinity;
    let reverse = false;
    chains.forEach((c, i) => {
      const toStart = dist(end, c[0]);
      const toEnd = dist(end, c.at(-1));
      if (toStart < bestDistance) [best, bestDistance, reverse] = [i, toStart, false];
      if (toEnd < bestDistance) [best, bestDistance, reverse] = [i, toEnd, true];
    });
    const next = chains.splice(best, 1)[0];
    ordered.push(reverse ? next.reverse() : next);
  }

  const segments = [];
  let offset = 0;
  for (const chain of ordered) {
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1];
      const b = chain[i];
      const length = dist(a, b);
      if (length === 0) continue;
      segments.push({ a, b, length, offset });
      offset += length;
    }
  }
  return { name, kind, length: offset, segments };
}

function chainLines(lines) {
  const chains = [];
  const rest = lines;
  while (rest.length) {
    let chain = rest.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const l = rest[i];
        if (dist(chain.at(-1), l[0]) <= JOIN_M) chain = chain.concat(l.slice(1));
        else if (dist(chain.at(-1), l.at(-1)) <= JOIN_M) chain = chain.concat(l.slice().reverse().slice(1));
        else if (dist(chain[0], l.at(-1)) <= JOIN_M) chain = l.slice(0, -1).concat(chain);
        else if (dist(chain[0], l[0]) <= JOIN_M) chain = l.slice().reverse().slice(0, -1).concat(chain);
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const lineLength = (line) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0);

// --- Nearest trail ---------------------------------------------------------

const CELL_M = 50;

/**
 * For each point, the nearest trail of `trails` within `reach` metres: its
 * index, distance, direction at the nearest point, and position along it.
 * Null where none is in reach. The nearest trail does not depend on the
 * buffer, so this runs once per activity and the sweep only filters it.
 */
export function nearestTrails(points, trails, reach = Math.max(...BUFFERS_M)) {
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  trails.forEach((trail, ti) => {
    for (const seg of trail.segments) {
      const x0 = Math.floor((Math.min(seg.a.x, seg.b.x) - reach) / CELL_M);
      const x1 = Math.floor((Math.max(seg.a.x, seg.b.x) + reach) / CELL_M);
      const y0 = Math.floor((Math.min(seg.a.y, seg.b.y) - reach) / CELL_M);
      const y1 = Math.floor((Math.max(seg.a.y, seg.b.y) + reach) / CELL_M);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = key(cx, cy);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push({ ti, seg });
        }
      }
    }
  });

  return points.map((p) => {
    const cell = grid.get(key(Math.floor(p.x / CELL_M), Math.floor(p.y / CELL_M)));
    let best = null;
    for (const { ti, seg } of cell ?? []) {
      const dx = seg.b.x - seg.a.x;
      const dy = seg.b.y - seg.a.y;
      const f = Math.max(0, Math.min(1, ((p.x - seg.a.x) * dx + (p.y - seg.a.y) * dy) / (seg.length ** 2)));
      const d = Math.hypot(seg.a.x + dx * f - p.x, seg.a.y + dy * f - p.y);
      if (d > reach || (best && d >= best.distance)) continue;
      best = { trail: ti, distance: d, direction: Math.atan2(dy, dx), position: seg.offset + seg.length * f };
    }
    return best;
  });
}

// --- Passes ----------------------------------------------------------------

/**
 * The passes on one layer for one buffer and heading tolerance.
 *
 * A point is assigned to its nearest trail only, and only when that trail is
 * within `bufferM` and runs within `headingDeg` of the track's own heading in
 * either direction: crossing a trail is not riding it. Consecutive points on
 * the same trail in the same direction form a pass, across gaps of unassigned
 * points shorter than GAP_M; a change of trail or of direction ends it, so an
 * out-and-back is two passes. A pass is kept when it meets the coverage rule.
 */
export function findPasses(track, trails, nearest, headings, { bufferM, headingDeg }) {
  const { points } = track;
  const tolerance = headingDeg * RAD;
  const assigned = points.map((_, i) => {
    const n = nearest[i];
    const h = headings[i];
    if (!n || n.distance > bufferM || h === null) return null;
    const delta = angleBetween(h, n.direction);
    if (Math.min(delta, Math.PI - delta) > tolerance) return null;
    return { trail: n.trail, sense: delta <= Math.PI / 2 ? 1 : -1, position: n.position };
  });

  const runs = [];
  let run = null;
  assigned.forEach((a, i) => {
    if (!a) return;
    if (run && run.trail === a.trail && run.sense === a.sense && points[i].cum - points[run.last].cum < GAP_M) {
      run.indices.push(i);
      run.last = i;
      return;
    }
    run = { trail: a.trail, sense: a.sense, indices: [i], last: i };
    runs.push(run);
  });

  return runs
    .map((r) => describePass(track, trails[r.trail], r.indices.map((i) => ({ i, position: assigned[i].position }))))
    .filter((p) => p.metres >= MIN_PASS_M || p.share >= MIN_PASS_SHARE);
}

function angleBetween(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

function describePass(track, trail, members) {
  const { points, startMs } = track;
  const first = points[members[0].i];
  const last = points[members.at(-1).i];
  let climb = 0;
  let hasEle = false;
  for (let i = members[0].i + 1; i <= members.at(-1).i; i++) {
    const a = points[i - 1].ele;
    const b = points[i].ele;
    if (a === null || b === null) continue;
    hasEle = true;
    if (b > a) climb += b - a;
  }
  const positions = members.map((m) => m.position);
  const covered = Math.max(...positions) - Math.min(...positions);
  const startM = positions[0];
  const endM = positions.at(-1);
  const pct = (m) => (trail.length ? (100 * m) / trail.length : 0);
  return {
    trail: trail.name,
    kind: trail.kind,
    trailLengthM: trail.length,
    fromIndex: members[0].i,
    toIndex: members.at(-1).i,
    entry: timeAt(startMs, first.t),
    exit: timeAt(startMs, last.t),
    metres: last.cum - first.cum,
    durationS: first.t === null || last.t === null ? null : last.t - first.t,
    climbM: hasEle ? climb : null,
    startM,
    endM,
    startPct: pct(startM),
    endPct: pct(endM),
    share: trail.length ? covered / trail.length : 0,
    direction: endM >= startM ? 'forward' : 'reverse',
  };
}

const timeAt = (startMs, t) =>
  Number.isFinite(startMs) && t !== null ? new Date(startMs + t * 1000).toISOString() : null;

/**
 * The activity as an ordered timeline: its passes, with the stretches between
 * them that matched no trail as gaps.
 */
export function buildSequence(track, passes) {
  const { points } = track;
  const sorted = passes.slice().sort((a, b) => a.fromIndex - b.fromIndex);
  const sequence = [];
  let at = 0;
  const gap = (from, to) => {
    const metres = points[to].cum - points[from].cum;
    if (metres <= 0) return;
    const a = points[from].t;
    const b = points[to].t;
    sequence.push({ gap: true, metres, durationS: a === null || b === null ? null : b - a });
  };
  for (const pass of sorted) {
    gap(at, pass.fromIndex);
    sequence.push(pass);
    at = pass.toIndex;
  }
  gap(at, points.length - 1);
  return sequence;
}

/**
 * Every result for one activity: for each buffer and heading tolerance, the
 * trail sequence, the route passes, and the distance no trail matched.
 */
export function matchActivity(feature, elements, { buffers = BUFFERS_M, headings: tolerances = HEADINGS_DEG } = {}) {
  const track = densifyTrack(feature);
  const { trails, routes } = buildTrails(elements, track.projection);
  const reach = Math.max(...buffers);
  const headings = trackHeadings(track.points);
  const nearestTrail = nearestTrails(track.points, trails, reach);
  const nearestRoute = nearestTrails(track.points, routes, reach);
  const totalM = track.points.at(-1).cum;

  const combos = [];
  for (const bufferM of buffers) {
    for (const headingDeg of tolerances) {
      const options = { bufferM, headingDeg };
      const passes = findPasses(track, trails, nearestTrail, headings, options);
      const routePasses = findPasses(track, routes, nearestRoute, headings, options);
      const matchedM = passes.reduce((sum, p) => sum + p.metres, 0);
      combos.push({
        bufferM,
        headingDeg,
        sequence: buildSequence(track, passes),
        routePasses,
        trailsFound: [...new Set(passes.map((p) => p.trail))],
        matchedM,
        unmatchedM: totalM - matchedM,
      });
    }
  }
  return { totalM, trailCount: trails.length, routeCount: routes.length, combos };
}

// --- Scoring ---------------------------------------------------------------

export const comboKey = (c) => `${c.bufferM}m/${c.headingDeg}°`;

/**
 * Precision and recall from the owner's marks, per combination, overall and
 * by activity type. `marks[id].trails[name]` is true (right), false (wrong) or
 * null (not marked yet); `marks[id].missed` names trails ridden that no
 * combination found. A trail ridden is one marked right or listed as missed.
 * Unmarked trails count toward neither figure and are reported as such.
 *
 * @param {{ id, type, combos }[]} activities  each with `trailsFound` per combo
 */
export function score(activities, marks) {
  const table = new Map();
  const bucket = (key, group) => {
    const k = `${key}|${group}`;
    if (!table.has(k)) table.set(k, { combo: key, group, listed: 0, right: 0, unmarked: 0, ridden: 0, found: 0, activities: 0 });
    return table.get(k);
  };
  for (const activity of activities) {
    const m = marks?.[activity.id];
    if (!m) continue;
    const trailMarks = m.trails ?? {};
    const ridden = new Set([
      ...Object.keys(trailMarks).filter((name) => trailMarks[name] === true),
      ...(m.missed ?? []),
    ]);
    for (const combo of activity.combos) {
      for (const group of ['all', activity.type]) {
        const b = bucket(comboKey(combo), group);
        b.activities++;
        for (const name of combo.trailsFound) {
          if (trailMarks[name] === true) [b.listed, b.right] = [b.listed + 1, b.right + 1];
          else if (trailMarks[name] === false) b.listed++;
          else b.unmarked++;
        }
        b.ridden += ridden.size;
        b.found += combo.trailsFound.filter((name) => ridden.has(name)).length;
      }
    }
  }
  return [...table.values()].map((b) => ({
    ...b,
    precision: b.listed ? b.right / b.listed : null,
    recall: b.ridden ? b.found / b.ridden : null,
  }));
}
