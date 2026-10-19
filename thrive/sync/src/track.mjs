// A simplified GPS track from an activity's FIT (#432).
//
// The FIT stays the source of truth. This file's output is display geometry
// derived from it: a small, versioned GeoJSON Feature the signed-in app can read
// through the API's `getWorkoutTrack`, because the FIT itself is second-by-second
// and sits in the bot's Drive under `drive.file`, which the app cannot read.
// Nothing here changes a row's values: distance, ascent and the rest still come
// from the detail prose (docs/data-architecture.md §4).
//
// `buildTrack` is a pure function of the FIT bytes and the activity id, and the
// output is deterministic: the same FIT and TRACK_VERSION give byte-identical
// JSON. No coordinate may reach a log line, a note or an error message: every
// error here is fixed text.
//
// Simplification is Ramer-Douglas-Peucker over the equirectangular projection
// cairn uses (geo/src/geo/overview.ts, ported here because the sync cannot
// import the web package until Thrive moves into it).

import { Decoder, Stream } from '@garmin/fitsdk';

/** Bump when the file's contents change: every track is then rebuilt from its stored FIT. */
export const TRACK_VERSION = 1;
export const TRACK_FORMAT = 'thrive-track';

/** First tolerance, in metres, and the most points a track may keep. */
export const BASE_TOLERANCE_M = 5;
export const MAX_POINTS = 5000;
const TOLERANCE_GROWTH = 1.5;

const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;
const EARTH_RADIUS_METERS = 6_371_008.8;

/** The FIT could not be decoded. Fixed text: a decoder message may quote the file. */
export class TrackUnreadableError extends Error {
  constructor() {
    super('the FIT could not be decoded');
    this.name = 'TrackUnreadableError';
  }
}

const round = (n, places) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Every `record` message with a usable position, in file order. A record with
 * no position, no timestamp, the FIT's invalid sentinel (which the decoder
 * leaves out) or `0, 0` is dropped; a pause becomes a straight line between
 * the points either side of it, as cairn's track parser draws it.
 *
 * @returns {{ lat: number, lon: number, ms: number, ele: number | null }[]}
 */
export function decodePositions(bytes) {
  let messages;
  try {
    const decoder = new Decoder(Stream.fromBuffer(bytes));
    if (!decoder.isFIT() || !decoder.checkIntegrity()) throw new Error('not a whole FIT');
    const read = decoder.read({ convertDateTimesToDates: true });
    // Strict, like every parser here: a file the SDK reports errors for is not trusted.
    if (read.errors?.length) throw new Error('decoder errors');
    messages = read.messages;
  } catch {
    throw new TrackUnreadableError();
  }

  const points = [];
  for (const record of messages?.recordMesgs ?? []) {
    const { positionLat, positionLong, timestamp } = record;
    if (!Number.isFinite(positionLat) || !Number.isFinite(positionLong)) continue;
    const when = timestamp instanceof Date ? timestamp.getTime() : NaN;
    if (!Number.isFinite(when)) continue;
    const lat = positionLat * SEMICIRCLE_TO_DEGREES;
    const lon = positionLong * SEMICIRCLE_TO_DEGREES;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (round(lat, 5) === 0 && round(lon, 5) === 0) continue;
    const altitude = record.enhancedAltitude ?? record.altitude;
    points.push({ lat, lon, ms: when, ele: Number.isFinite(altitude) ? round(altitude, 1) : null });
  }
  return points;
}

// --- Ramer-Douglas-Peucker, as cairn's simplifier --------------------------

function toPlaneMeters(point, originLat) {
  const rad = Math.PI / 180;
  return {
    x: point.lon * rad * EARTH_RADIUS_METERS * Math.cos(originLat * rad),
    y: point.lat * rad * EARTH_RADIUS_METERS,
  };
}

function perpendicularDistanceMeters(point, a, b) {
  const origin = a.lat;
  const p = toPlaneMeters(point, origin);
  const start = toPlaneMeters(a, origin);
  const end = toPlaneMeters(b, origin);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - start.x, p.y - start.y);
  return Math.abs(dx * (p.y - start.y) - dy * (p.x - start.x)) / Math.sqrt(lengthSquared);
}

/**
 * The indices RDP keeps. Cairn's recursive form, made iterative so a long
 * activity cannot overflow the stack; the pivot choice is the same (the first
 * point at the greatest distance), so the two agree on the same input.
 */
export function simplifyIndices(points, toleranceMeters) {
  const n = points.length;
  if (n < 3) return points.map((_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let furthest = -1;
    let furthestDistance = 0;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpendicularDistanceMeters(points[i], points[lo], points[hi]);
      if (d > furthestDistance) {
        furthestDistance = d;
        furthest = i;
      }
    }
    if (furthest !== -1 && furthestDistance > toleranceMeters) {
      keep[furthest] = 1;
      stack.push([lo, furthest], [furthest, hi]);
    }
  }
  const indices = [];
  for (let i = 0; i < n; i++) if (keep[i]) indices.push(i);
  return indices;
}

/**
 * The stored Feature, or `{ status: 'none' }` for a FIT with fewer than two
 * valid positions. Throws TrackUnreadableError for bytes that cannot be decoded.
 *
 * @param {Buffer} bytes
 * @param {string} activityId
 * @returns {{ status: 'none' } | { status: 'stored', feature: object, points: number }}
 */
export function buildTrack(bytes, activityId) {
  const all = decodePositions(bytes);
  if (all.length < 2) return { status: 'none' };

  let tolerance = BASE_TOLERANCE_M;
  let indices = simplifyIndices(all, tolerance);
  while (indices.length > MAX_POINTS) {
    tolerance *= TOLERANCE_GROWTH;
    indices = simplifyIndices(all, tolerance);
  }
  const kept = indices.map((i) => all[i]);

  const startMs = kept[0].ms;
  const coordinates = kept.map((p) => [round(p.lon, 5), round(p.lat, 5)]);
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);

  return {
    status: 'stored',
    points: kept.length,
    feature: {
      type: 'Feature',
      bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      properties: {
        format: TRACK_FORMAT,
        version: TRACK_VERSION,
        source: 'coros',
        activity_id: String(activityId),
        start_utc: new Date(startMs).toISOString(),
        t: kept.map((p) => Math.round((p.ms - startMs) / 1000)),
        ele: kept.map((p) => p.ele),
        simplify: { algorithm: 'rdp', tolerance_m: round(tolerance, 3) },
        points_in: all.length,
      },
      geometry: { type: 'LineString', coordinates },
    },
  };
}
