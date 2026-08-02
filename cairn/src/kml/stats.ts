import type { Track } from './parse'

export interface TrackStats {
  distanceMeters: number
  durationSeconds: number | undefined
  elevationGainMeters: number | undefined
}

/* Mean Earth radius. Error against a true geodesic is under 0.5% at any
   realistic track scale — well inside the acceptance criterion and far
   inside consumer GPS error. */
const EARTH_RADIUS_METERS = 6_371_008.8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

function computeDistanceMeters(points: Track['points']): number {
  let distance = 0
  for (let i = 1; i < points.length; i++) {
    distance += haversineMeters(points[i - 1], points[i])
  }
  return distance
}

/* Elapsed span as max − min rather than last − first, so a scrambled export
   cannot produce a negative duration. Undefined — not zero — when fewer than
   two points carry a timestamp. */
function computeDurationSeconds(points: Track['points']): number | undefined {
  const timestamps = points
    .map((point) => point.time)
    .filter((time): time is string => time !== undefined)
    .map((time) => new Date(time).getTime())

  if (timestamps.length < 2) return undefined

  return (Math.max(...timestamps) - Math.min(...timestamps)) / 1000
}

/* Sums only positive deltas between points that carry elevation, skipping
   gaps rather than treating a missing value as zero — which would invent a
   cliff at every gap. Undefined when fewer than two points carry elevation. */
function computeElevationGainMeters(points: Track['points']): number | undefined {
  const elevations = points
    .map((point) => point.elevation)
    .filter((elevation): elevation is number => elevation !== undefined)

  if (elevations.length < 2) return undefined

  let gain = 0
  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - elevations[i - 1]
    if (delta > 0) gain += delta
  }
  return gain
}

export function computeTrackStats(track: Track): TrackStats {
  return {
    distanceMeters: computeDistanceMeters(track.points),
    durationSeconds: computeDurationSeconds(track.points),
    elevationGainMeters: computeElevationGainMeters(track.points),
  }
}
