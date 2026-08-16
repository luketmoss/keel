import type { Track } from './parse'

export interface TrackStats {
  distanceMeters: number
  durationSeconds: number | undefined
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
}

/* Mean Earth radius. Error against a true geodesic is under 0.5% at any
   realistic track scale — well inside the acceptance criterion and far
   inside consumer GPS error. */
const EARTH_RADIUS_METERS = 6_371_008.8

/* #218 — filter first, then accumulate. A single spike sample otherwise
   *sets* the high point outright, and a mean would smear a real summit down
   instead of rejecting the spike; a median rejects it. The threshold is
   hysteresis against a reference elevation rather than a sum of every
   positive delta: consumer GPS vertical error runs 5-15m and barometric
   1-3m, and KML does not say which you got, so 3m is the conservative
   floor — it also disposes of a device recording at 1Hz through a lunch
   stop, hundreds of deltas and zero distance, none of which leave the
   band. */
const ELEVATION_MEDIAN_WINDOW = 5
const ELEVATION_THRESHOLD_METERS = 3

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

/* Centered window, clamped at the ends rather than padded — a shorter
   window at the boundary is still a median of real samples, where padding
   would invent one. */
function medianFilter(values: number[], window: number): number[] {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(values.length, i + half + 1)
    const slice = values.slice(start, end).slice().sort((a, b) => a - b)
    const mid = Math.floor(slice.length / 2)
    return slice.length % 2 === 0 ? (slice[mid - 1] + slice[mid]) / 2 : slice[mid]
  })
}

/* Hysteresis against a reference elevation: a change only commits — and
   only then moves the reference — once the series leaves the ±threshold
   band. Everything inside the band is noise the reference absorbs rather
   than a climb or a descent. */
function computeAscentDescentMeters(
  filtered: number[],
  thresholdMeters: number,
): { ascentMeters: number; descentMeters: number } {
  let reference = filtered[0]
  let ascentMeters = 0
  let descentMeters = 0

  for (let i = 1; i < filtered.length; i++) {
    const delta = filtered[i] - reference
    if (delta >= thresholdMeters) {
      ascentMeters += delta
      reference = filtered[i]
    } else if (delta <= -thresholdMeters) {
      descentMeters += -delta
      reference = filtered[i]
    }
  }

  return { ascentMeters, descentMeters }
}

interface ElevationStats {
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
}

const UNAVAILABLE_ELEVATION: ElevationStats = {
  elevationGainMeters: undefined,
  elevationLossMeters: undefined,
  highPointMeters: undefined,
  lowPointMeters: undefined,
}

/* KML's default altitudeMode is clampToGround, and exporters that intend
   clamping (Google My Maps) write 0 for every point rather than omitting
   the component — altitudeMode itself is discarded by togeojson before the
   parser sees it, so it cannot be inspected directly. The rule that works
   on the geometry actually available: a real GPS track, even a dead-flat
   one, never produces identical consecutive values, so a series that is
   entirely one value — 0 or otherwise — is unavailable rather than flat. */
function computeElevationStats(points: Track['points']): ElevationStats {
  const elevations = points
    .map((point) => point.elevation)
    .filter((elevation): elevation is number => elevation !== undefined)

  if (elevations.length < 2) return UNAVAILABLE_ELEVATION
  if (elevations.every((elevation) => elevation === elevations[0])) return UNAVAILABLE_ELEVATION

  const filtered = medianFilter(elevations, ELEVATION_MEDIAN_WINDOW)
  const { ascentMeters, descentMeters } = computeAscentDescentMeters(
    filtered,
    ELEVATION_THRESHOLD_METERS,
  )

  return {
    elevationGainMeters: ascentMeters,
    elevationLossMeters: descentMeters,
    highPointMeters: Math.max(...filtered),
    lowPointMeters: Math.min(...filtered),
  }
}

export function computeTrackStats(track: Track): TrackStats {
  return {
    distanceMeters: computeDistanceMeters(track.points),
    durationSeconds: computeDurationSeconds(track.points),
    ...computeElevationStats(track.points),
  }
}

export interface ElevationProfilePoint {
  /** Cumulative distance along the track, not point index — a track sampled
      densely on one leg is not stretched along it (#219). */
  distanceMeters: number
  /** Median-filtered, same series and window `computeElevationStats` uses,
      so a single-sample spike does not appear as a peak. */
  elevationMeters: number
}

/* #219's profile — same unavailability rule as `computeElevationStats`
   (fewer than two elevation samples, or a series that is entirely one
   value), computed over the same filtered series, but distance-aligned
   rather than reduced to a summary. Points lacking elevation are skipped
   rather than treated as gaps, matching #7's rule for gain. */
export function computeElevationProfile(points: Track['points']): ElevationProfilePoint[] | undefined {
  const withElevation = points
    .map((point, index) => ({ index, elevation: point.elevation }))
    .filter((point): point is { index: number; elevation: number } => point.elevation !== undefined)

  if (withElevation.length < 2) return undefined
  if (withElevation.every((point) => point.elevation === withElevation[0].elevation)) return undefined

  const cumulativeDistance = [0]
  for (let i = 1; i < points.length; i++) {
    cumulativeDistance.push(cumulativeDistance[i - 1] + haversineMeters(points[i - 1], points[i]))
  }

  const filtered = medianFilter(
    withElevation.map((point) => point.elevation),
    ELEVATION_MEDIAN_WINDOW,
  )

  return withElevation.map((point, i) => ({
    distanceMeters: cumulativeDistance[point.index],
    elevationMeters: filtered[i],
  }))
}
