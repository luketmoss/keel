import type { Track } from './parse'

export interface TrackStats {
  distanceMeters: number
  durationSeconds: number | undefined
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
  /** #224 — set to `'sampled'` when the four elevation fields above came
      from the Elevation API rather than the track's own points. Absent
      (not `'recorded'`) for the common case, so every existing caller that
      built a `TrackStats` before this field existed is still a valid one —
      the mark is additive, not a new required choice. */
  elevationSource?: 'sampled'
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

export interface ElevationStats {
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
export function computeElevationStats(points: Track['points']): ElevationStats {
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

/** #224 — the same test `computeElevationStats` uses to decide "nothing to
    show", exposed so the sampling pipeline can decide "nothing to sample"
    with the identical rule. A track sampling would call unavailable and a
    track the grid renders as unavailable must always agree, or the two
    surfaces disagree about what an em dash means. */
export function hasUsableElevation(points: Track['points']): boolean {
  return computeElevationStats(points).elevationGainMeters !== undefined
}

/** #224's persisted shape for one track's sampled elevation: the four
    stats plus the profile series, computed once from the sampled points and
    stored so a reload never re-samples. Deliberately not a `Track` or a
    `TrackStats` — neither carries a profile, and this needs one alongside
    the stats it was computed from. */
export interface StoredTrackElevation {
  elevationGainMeters: number
  elevationLossMeters: number
  highPointMeters: number
  lowPointMeters: number
  profile: ElevationProfilePoint[]
}

/** #224 — folds sampled elevation into an already-computed `TrackStats`
    when it has none of its own. Sampling never overwrites a track that
    carries its own elevation (`own.elevationGainMeters` already
    non-`undefined`), so the overlay only ever applies where #218's grid
    would otherwise be four em dashes. `sampled` is the trip's current
    cache entry for this track's key, or `undefined` when nothing has been
    sampled (or sampling failed) for it.
 *
 * Takes the stats rather than the `Track` itself so a caller that already
    has them (every UI surface — `useTripImport` computes `TrackStats` once
    at parse time) never recomputes distance and duration just to reach the
    elevation fields. `effectiveTrackStats` below is the `Track`-taking
    convenience for the one caller (`geo/tripTotals.ts`) that doesn't have
    them cached. */
export function overlaySampledElevation(own: TrackStats, sampled: StoredTrackElevation | undefined): TrackStats {
  if (own.elevationGainMeters !== undefined || !sampled) return own
  return {
    ...own,
    elevationGainMeters: sampled.elevationGainMeters,
    elevationLossMeters: sampled.elevationLossMeters,
    highPointMeters: sampled.highPointMeters,
    lowPointMeters: sampled.lowPointMeters,
    elevationSource: 'sampled',
  }
}

/** #224 — `overlaySampledElevation`, computing `own` from the track first.
    For `geo/tripTotals.ts`, which works from raw `Track[]` and has no
    precomputed `TrackStats` to reuse. */
export function effectiveTrackStats(track: Track, sampled: StoredTrackElevation | undefined): TrackStats {
  return overlaySampledElevation(computeTrackStats(track), sampled)
}

/** #224 — the sampled counterpart to `computeElevationProfile`, for a track
    whose own points carry no elevation. `undefined` when nothing has been
    sampled for this track (or sampling failed), matching the "no profile"
    treatment `TrackFaceBody` already gives an unavailable one. */
export function effectiveElevationProfile(
  track: Track,
  sampled: StoredTrackElevation | undefined,
): ElevationProfilePoint[] | undefined {
  const own = computeElevationProfile(track.points)
  if (own || !sampled) return own
  return sampled.profile
}

export interface ElevationSummary {
  elevationGainMeters: number | undefined
  elevationLossMeters: number | undefined
  highPointMeters: number | undefined
  lowPointMeters: number | undefined
  elevationTrackCount: number
  /** #224 — set when at least one of the tracks summed into this total
      carries sampled rather than recorded elevation. The weaker claim
      governs a mixed total, the same way a partial-coverage total already
      gets a footnote rather than a silent sum. */
  elevationSource?: 'sampled'
}

/** #218's totals-block arithmetic (ascent/descent/high/low summed, or
    maxed/minned, over only the tracks that carry elevation) plus #224's
    mixed-source rule, shared by the trip totals block and the persisted
    trip totals so the two cannot compute a different number — or a
    different `~` — for the same trip. */
export function summarizeElevation(
  stats: Pick<TrackStats, 'elevationGainMeters' | 'elevationLossMeters' | 'highPointMeters' | 'lowPointMeters' | 'elevationSource'>[],
): ElevationSummary {
  const withElevation = stats.filter((s) => s.elevationGainMeters !== undefined)

  if (withElevation.length === 0) {
    return {
      elevationGainMeters: undefined,
      elevationLossMeters: undefined,
      highPointMeters: undefined,
      lowPointMeters: undefined,
      elevationTrackCount: 0,
    }
  }

  return {
    elevationGainMeters: withElevation.reduce((sum, s) => sum + (s.elevationGainMeters ?? 0), 0),
    elevationLossMeters: withElevation.reduce((sum, s) => sum + (s.elevationLossMeters ?? 0), 0),
    highPointMeters: Math.max(...withElevation.map((s) => s.highPointMeters ?? -Infinity)),
    lowPointMeters: Math.min(...withElevation.map((s) => s.lowPointMeters ?? Infinity)),
    elevationTrackCount: withElevation.length,
    ...(withElevation.some((s) => s.elevationSource === 'sampled') ? { elevationSource: 'sampled' as const } : {}),
  }
}

/** #226 — a loose item is one row per dropped *file*, and a file can hold
    more than one placemark (`useLooseImport`'s "one dropped file is one
    row" stance). The loose store has nowhere to keep per-track numbers, so
    its face needs one `TrackStats` for the whole file: distance and the two
    elevation extremes are summed/maxed/minned across every track's own
    stats (avoiding a false climb at the seam between two placemarks, which
    concatenating raw points before filtering would introduce), while
    duration spans every timestamped point in the file, not just one
    track's. */
export function aggregateTrackStats(tracks: Track[]): TrackStats {
  const perTrack = tracks.map(computeTrackStats)
  const distanceMeters = perTrack.reduce((total, s) => total + s.distanceMeters, 0)
  const durationSeconds = computeDurationSeconds(tracks.flatMap((track) => track.points))

  const gains = perTrack.map((s) => s.elevationGainMeters).filter((v): v is number => v !== undefined)
  const losses = perTrack.map((s) => s.elevationLossMeters).filter((v): v is number => v !== undefined)
  const highs = perTrack.map((s) => s.highPointMeters).filter((v): v is number => v !== undefined)
  const lows = perTrack.map((s) => s.lowPointMeters).filter((v): v is number => v !== undefined)

  return {
    distanceMeters,
    durationSeconds,
    elevationGainMeters: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) : undefined,
    elevationLossMeters: losses.length > 0 ? losses.reduce((a, b) => a + b, 0) : undefined,
    highPointMeters: highs.length > 0 ? Math.max(...highs) : undefined,
    lowPointMeters: lows.length > 0 ? Math.min(...lows) : undefined,
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

/** #226 — the loose face's mirror of `aggregateTrackStats`: one profile for
    a whole file, each track's own profile appended after the last, offset
    by that track's total distance so the x axis still reads left-to-right
    across the file rather than resetting to zero at every placemark.
    `undefined` when nothing in the file has usable elevation, matching
    `computeElevationProfile`'s own unavailability rule. */
export function aggregateElevationProfile(tracks: Track[]): ElevationProfilePoint[] | undefined {
  let offsetMeters = 0
  const combined: ElevationProfilePoint[] = []
  for (const track of tracks) {
    const profile = computeElevationProfile(track.points)
    if (profile) {
      for (const point of profile) {
        combined.push({ distanceMeters: point.distanceMeters + offsetMeters, elevationMeters: point.elevationMeters })
      }
    }
    offsetMeters += computeDistanceMeters(track.points)
  }
  return combined.length >= 2 ? combined : undefined
}
