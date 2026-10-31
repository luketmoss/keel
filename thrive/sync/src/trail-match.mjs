// The trail matcher (#688): which named OpenStreetMap trails one stored track
// rode, and how far along each.
//
// Ported from scripts/spike-681-match.mjs, #681's record, with the sweep, the
// route relations and the scoring removed. The values are the ones #681
// chose (100% precision and recall on the owner's marks): a 20 m buffer, a 30°
// heading tolerance in either direction, the nearest trail only, gaps under
// 50 m bridged, and a pass kept when it covers 200 m or half its trail.
//
// Pure: no Drive, no network, no clock, no log. Every distance is in metres on
// a flat plane centred on the track's first point, which over one activity's
// extent is far inside the buffer. No error quotes a coordinate.

/**
 * Bump with any change to a rule or a value below: every tagged activity is
 * then re-tagged once, by the sync or the backfill (#688 §Settled).
 */
export const TRAILS_MATCHER_VERSION = 1;

/** Densify the track to about this spacing, in metres. */
export const SPACING_M = 5;
/** The track's heading is measured over about this many metres. */
export const HEADING_WINDOW_M = 20;
/** A point is on a trail within this distance, in metres. */
export const BUFFER_M = 20;
/** ...and when the trail runs within this angle of the track, either way. */
export const HEADING_TOLERANCE_DEG = 30;
/** Unassigned stretches shorter than this, along the track, do not end a pass. */
export const GAP_M = 50;
/** A pass is kept when it rides at least this far, or at least this share of its trail. */
export const MIN_PASS_M = 200;
export const MIN_PASS_SHARE = 0.5;

/** The `highway` values that are trails. Overpass is asked for these alone (src/overpass.mjs). */
export const TRAIL_HIGHWAYS = ['path', 'track', 'footway', 'bridleway', 'cycleway'];
const TRAIL_HIGHWAY_SET = new Set(TRAIL_HIGHWAYS);

const EARTH_RADIUS_METERS = 6_371_008.8;
const RAD = Math.PI / 180;

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
 * @returns {{ projection, points: { x, y, t, ele, cum }[] }}
 */
export function densifyTrack(feature, spacing = SPACING_M) {
  const coords = feature?.geometry?.coordinates ?? [];
  const props = feature?.properties ?? {};
  if (coords.length < 2) throw new Error('the track has fewer than two points');
  const t = props.t ?? [];
  const ele = props.ele ?? [];
  const projection = makeProjection({ lon: coords[0][0], lat: coords[0][1] });

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
  return { projection, points };
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
 * The named trails in one Overpass response (`out geom`). Ways with the same
 * `name` become one trail. Anything else (a relation, an unnamed way, a road)
 * is ignored.
 */
export function buildTrails(elements, projection) {
  const byName = new Map();
  for (const el of elements ?? []) {
    const name = el?.tags?.name;
    if (typeof name !== 'string' || !name) continue;
    if (el.type !== 'way' || !TRAIL_HIGHWAY_SET.has(el.tags.highway)) continue;
    const line = toLine(el.geometry, projection);
    if (line.length < 2) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(line);
  }
  return [...byName].map(([name, lines]) => makeTrail(name, lines));
}

function toLine(geometry, projection) {
  return (Array.isArray(geometry) ? geometry : [])
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
export function makeTrail(name, lines) {
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
  return { name, length: offset, segments };
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
 * For each point, the nearest trail within `reach` metres: its index,
 * distance, direction at the nearest point, and position along it. Null where
 * none is in reach.
 */
export function nearestTrails(points, trails, reach = BUFFER_M) {
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
 * The kept passes. A point is assigned to its nearest trail only, and only
 * when that trail is within BUFFER_M and runs within HEADING_TOLERANCE_DEG of
 * the track's own heading in either direction: crossing a trail is not riding
 * it. Consecutive points on the same trail in the same direction form a pass,
 * across gaps shorter than GAP_M; a change of trail or of direction ends it,
 * so an out-and-back is two passes.
 */
export function findPasses(track, trails, nearest, headings) {
  const { points } = track;
  const tolerance = HEADING_TOLERANCE_DEG * RAD;
  const assigned = points.map((_, i) => {
    const n = nearest[i];
    const h = headings[i];
    if (!n || n.distance > BUFFER_M || h === null) return null;
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
  const { points } = track;
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
    trailLengthM: trail.length,
    fromIndex: members[0].i,
    toIndex: members.at(-1).i,
    metres: last.cum - first.cum,
    durationS: first.t === null || last.t === null ? null : last.t - first.t,
    climbM: hasEle ? climb : null,
    entryOffsetS: first.t,
    startM,
    endM,
    startPct: pct(startM),
    endPct: pct(endM),
    share: trail.length ? covered / trail.length : 0,
    direction: endM >= startM ? 'forward' : 'reverse',
  };
}

/**
 * One activity's passes over the named trails in `elements`, unrounded and in
 * track order, and the track's whole length. The encoder (src/trail-step.mjs)
 * turns this into the Workouts!AD value.
 *
 * @param {object} feature the stored track (src/track.mjs)
 * @param {object[]} elements one Overpass `out geom` response's `elements`
 * @returns {{ totalM: number, passes: object[] }}
 */
export function matchTrails(feature, elements) {
  const track = densifyTrack(feature);
  const trails = buildTrails(elements, track.projection);
  const headings = trackHeadings(track.points);
  const nearest = nearestTrails(track.points, trails, BUFFER_M);
  return { totalM: track.points.at(-1).cum, passes: findPasses(track, trails, nearest, headings) };
}
