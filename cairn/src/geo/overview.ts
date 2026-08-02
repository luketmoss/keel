import type { Feature, FeatureCollection, LineString } from 'geojson'
import type { Track, TrackPoint } from '../kml/parse'

/* Mirrors kml/stats.ts: mean Earth radius, error under 0.5% at any realistic
   track scale — plenty for a decision about whether a point matters at world
   zoom. */
const EARTH_RADIUS_METERS = 6_371_008.8

/* Equirectangular projection centred implicitly at each pair of points being
   compared, rather than a true geodesic. Perpendicular distance from a point
   to a chord a few hundred kilometres long is not sensitive to the
   difference, and it keeps the algorithm free of trigonometric surprises at
   the poles or the antimeridian — neither of which this app's tracks cross. */
function toPlaneMeters(point: TrackPoint, originLat: number): { x: number; y: number } {
  const radiansPerDegree = Math.PI / 180
  const x = point.lon * radiansPerDegree * EARTH_RADIUS_METERS * Math.cos(originLat * radiansPerDegree)
  const y = point.lat * radiansPerDegree * EARTH_RADIUS_METERS
  return { x, y }
}

/* Perpendicular distance, in meters, from `point` to the line through `a` and
   `b`. Falls back to distance-to-`a` when `a` and `b` coincide, so a
   degenerate segment can't divide by zero. */
function perpendicularDistanceMeters(point: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const origin = a.lat
  const p = toPlaneMeters(point, origin)
  const start = toPlaneMeters(a, origin)
  const end = toPlaneMeters(b, origin)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    return Math.hypot(p.x - start.x, p.y - start.y)
  }

  const cross = Math.abs(dx * (p.y - start.y) - dy * (p.x - start.x))
  return cross / Math.sqrt(lengthSquared)
}

/* Ramer–Douglas–Peucker: keep only the points that bend the line by more than
   `toleranceMeters`. Recursive on the two halves either side of the point
   furthest from the chord between the current endpoints. */
function douglasPeucker(points: TrackPoint[], toleranceMeters: number): TrackPoint[] {
  if (points.length < 3) return points

  const first = points[0]
  const last = points[points.length - 1]

  let furthestIndex = -1
  let furthestDistance = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistanceMeters(points[i], first, last)
    if (distance > furthestDistance) {
      furthestDistance = distance
      furthestIndex = i
    }
  }

  if (furthestIndex === -1 || furthestDistance <= toleranceMeters) {
    return [first, last]
  }

  const left = douglasPeucker(points.slice(0, furthestIndex + 1), toleranceMeters)
  const right = douglasPeucker(points.slice(furthestIndex), toleranceMeters)

  /* `left`'s last point and `right`'s first point are both the pivot —
     drop one copy at the seam. */
  return [...left.slice(0, -1), ...right]
}

/* Default tolerance is picked for legibility at world zoom, not fidelity —
   the overview map (#37) is a "where did I go" glance, not a navigation
   tool. Callers that want a different tradeoff pass their own. */
export const DEFAULT_TOLERANCE_METERS = 50

/**
 * Simplifies a track's points with the Ramer–Douglas–Peucker algorithm.
 * Tracks with fewer than 3 points pass through unchanged — there is nothing
 * to simplify, and running the algorithm on them would either error or
 * (for 2 points) be a no-op anyway. The first and last points are always
 * preserved exactly.
 */
export function simplifyTrack(points: TrackPoint[], toleranceMeters: number): TrackPoint[] {
  if (points.length < 3) return points
  return douglasPeucker(points, toleranceMeters)
}

function toLineStringFeature(track: Track, toleranceMeters: number): Feature<LineString> {
  const simplified = simplifyTrack(track.points, toleranceMeters)
  return {
    type: 'Feature',
    properties: { name: track.name },
    geometry: {
      type: 'LineString',
      coordinates: simplified.map((point) => [point.lon, point.lat]),
    },
  }
}

/**
 * Builds a trip's overview geometry: one simplified `LineString` feature per
 * non-empty track, in the shape a trip's `overview.geojson` will eventually
 * be written as. Pure and deterministic — same tracks in, byte-identical
 * JSON out — so it is safe to call speculatively and diff against what's on
 * disk before writing.
 *
 * Regeneration contract: whichever module owns trip/track mutation calls
 * this with the trip's current tracks, and overwrites the trip's
 * `overview.geojson` with the result, whenever that set changes —
 * concretely, on trip save, and whenever a track is added to or removed from
 * a trip. This function does not persist anything itself and is not called
 * from anywhere yet; wiring it into an actual save lands with the storage
 * interface (#31) and trip storage shape (#33).
 */
export function buildOverviewGeoJSON(
  tracks: Track[],
  toleranceMeters: number = DEFAULT_TOLERANCE_METERS,
): FeatureCollection<LineString> {
  const features = tracks
    .filter((track) => track.points.length > 0)
    .map((track) => toLineStringFeature(track, toleranceMeters))

  return {
    type: 'FeatureCollection',
    features,
  }
}
