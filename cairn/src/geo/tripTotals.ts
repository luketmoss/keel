import type { FeatureCollection, LineString } from 'geojson'
import type { Track } from '../kml/parse'
import { effectiveTrackStats, summarizeElevation, type StoredTrackElevation } from '../kml/stats'

/** #225's sidecar version stamp, shared with #224: #218's constants
    (`ELEVATION_MEDIAN_WINDOW`, `ELEVATION_THRESHOLD_METERS`) live in code, so
    retuning either would leave every persisted total computed under the old
    value with nothing to reveal it. Bumping this invalidates every trip's
    stored totals on next read — whichever of #225/#224 lands first defines
    the stamp; the other reads it rather than inventing a second one. */
export const SIDECAR_VERSION = 1

export interface TripTotals {
  distanceMeters: number
  elevationGainMeters: number | undefined
  /** #224 — set when at least one track contributing to `elevationGainMeters`
      carries sampled rather than recorded elevation. The mixed-total rule:
      a total that is part measured and part inferred is inferred, so the
      row's `~` has to travel with the ascent figure even when most of the
      trip's tracks recorded their own. */
  elevationSource?: 'sampled'
}

/** The extra shape `overview.geojson` carries once #225 lands: the trip's
    totals and the version they were computed under, alongside the geometry
    `buildOverviewGeoJSON` already produces. Persisting into the sidecar that
    already exists, rather than a second file, is the point of the issue —
    see the design note. */
export interface StoredOverview extends FeatureCollection<LineString> {
  version?: number
  /** `null` for a trip with no tracks — the same "nothing to total" state
      `computeTripTotals` returns for that case, persisted rather than left
      to be re-derived. */
  totals?: TripTotals | null
  /** #224 — every track's sampled elevation this trip has ever computed,
      keyed by `geo/elevation.ts`'s `trackKey`. Read back so opening the
      trip again makes no further Elevation API call; a track missing here
      either carries its own elevation, has never been sampled, or was
      sampled and failed — the three states this map cannot and does not
      tell apart, matching #218's own silent-failure stance. */
  sampledElevation?: Record<string, StoredTrackElevation>
}

/** Distance summed over every track; ascent summed over only the tracks that
    carry elevation (recorded, or sampled per `sampledElevationByKey`),
    `undefined` when none do — the same subset rule `TripStats`'s totals
    block applies, via the same `effectiveTrackStats`/`summarizeElevation`
    both now share, so the two surfaces cannot compute a different number —
    or a different `~` — for the same trip. `null` for a trip with no tracks
    at all, so the row shows no meta line segment rather than a distance of
    zero. */
export function computeTripTotals(
  tracks: Track[],
  sampledElevationByKey?: Record<string, StoredTrackElevation>,
): TripTotals | null {
  if (tracks.length === 0) return null

  const stats = tracks.map((track) =>
    effectiveTrackStats(track, track.key ? sampledElevationByKey?.[track.key] : undefined),
  )
  const distanceMeters = stats.reduce((sum, s) => sum + s.distanceMeters, 0)
  const { elevationGainMeters, elevationSource } = summarizeElevation(stats)

  return { distanceMeters, elevationGainMeters, ...(elevationSource ? { elevationSource } : {}) }
}

/** Reads a trip's totals back out of its `overview.geojson` sidecar
    (#225). `null` when there is nothing to show on the row: the trip has no
    tracks, the sidecar hasn't loaded or doesn't parse, or it was written
    under an older `SIDECAR_VERSION` — every one of those reads identically
    on the row (dates alone, no error) until the trip is next opened and the
    sidecar is rewritten under the current version. */
export function readTripTotals(overview: FeatureCollection<LineString> | null): TripTotals | null {
  if (!overview) return null
  const stored = overview as StoredOverview
  if (stored.version !== SIDECAR_VERSION) return null
  return stored.totals ?? null
}

/** #224's read side of `sampledElevation`, mirroring `readTripTotals`: a
    missing, unreadable or stale-version sidecar reads as "nothing sampled
    yet" — the same silent-failure stance the rest of this cache takes —
    rather than a caller having to reach into `StoredOverview` itself and
    reimplement the version check. */
export function readSampledElevation(
  overview: FeatureCollection<LineString> | null,
): Record<string, StoredTrackElevation> {
  if (!overview) return {}
  const stored = overview as StoredOverview
  if (stored.version !== SIDECAR_VERSION) return {}
  return stored.sampledElevation ?? {}
}
