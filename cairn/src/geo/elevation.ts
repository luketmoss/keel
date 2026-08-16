import type { TrackPoint } from '../kml/parse'
import { computeElevationProfile, computeElevationStats, type StoredTrackElevation } from '../kml/stats'

/* `getElevationAlongPath`'s own cap — see the design note's "one call per
   track". A track's actual point count is passed when it's smaller, since
   asking for more samples than points exist buys nothing. */
export const MAX_SAMPLES = 512

/** What the Elevation API hands back, trimmed to the fields this module
    uses — kept independent of `google.maps.ElevationResult` so the merge
    logic below (and its tests) don't need the Maps JS API loaded. */
export interface RawElevationSample {
  lat: number
  lng: number
  elevationMeters: number
}

/** The seam a fake implementation swaps in for tests, and the real
    `google.maps.ElevationService` swaps in for the app — see
    `createGoogleElevationSampler` below. `null` return means the call
    failed (quota, network, no result) rather than "zero samples"; the
    caller treats that identically to "nothing to sample". */
export interface ElevationSampler {
  sampleAlongPath(path: { lat: number; lng: number }[], samples: number): Promise<RawElevationSample[] | null>
}

/** `google.maps.ElevationService` needs no map instance, only the `maps`
    library script loaded — which today only happens once `MapCanvas`'s
    `APIProvider` has mounted and resolved. `null` when the script hasn't
    loaded (or there's no API key at all), which the caller treats as a
    quiet no-op — the same "nothing attempted" state as offline or signed
    out, not a failure the reader is told about. */
export function createGoogleElevationSampler(): ElevationSampler | null {
  const maps = (globalThis as { google?: { maps?: typeof google.maps } }).google?.maps
  if (!maps?.ElevationService) return null

  const service = new maps.ElevationService()

  return {
    sampleAlongPath(path, samples) {
      return new Promise((resolve) => {
        service.getElevationAlongPath({ path, samples }, (results, status) => {
          if (status !== maps.ElevationStatus.OK || !results) {
            resolve(null)
            return
          }
          resolve(
            results.map((result) => ({
              lat: result.location?.lat() ?? 0,
              lng: result.location?.lng() ?? 0,
              elevationMeters: result.elevation,
            })),
          )
        })
      })
    },
  }
}

/** Samples one track's elevation and reduces the result to the shape
    `StoredTrackElevation` persists — #218's stats and #219's profile,
    computed over the sampled series exactly as they would be over a
    recorded one (`computeElevationStats`/`computeElevationProfile`, the
    same functions and thresholds, so a DEM series is held to the same
    "is this actually a climb" standard a barometer's is).
 *
 * `undefined` — never sampled, or sampled but unusable — covers every one
    of the design note's silent-failure cases in one return: fewer than two
    points (nothing to sample along), the API call itself failing, and a
    sampled series that still comes back unavailable (fewer than two
    distinct elevations — a degenerate path, or a call that returned but
    found nothing). None of these are told apart to the caller; all of them
    leave the track exactly as #218 already renders "no elevation". */
export async function sampleTrackElevation(
  points: TrackPoint[],
  sampler: ElevationSampler,
): Promise<StoredTrackElevation | undefined> {
  if (points.length < 2) return undefined

  const raw = await sampler.sampleAlongPath(
    points.map((point) => ({ lat: point.lat, lng: point.lon })),
    Math.min(MAX_SAMPLES, points.length),
  )
  if (!raw || raw.length < 2) return undefined

  const sampledPoints: TrackPoint[] = raw.map((sample) => ({
    lat: sample.lat,
    lon: sample.lng,
    elevation: sample.elevationMeters,
  }))

  const stats = computeElevationStats(sampledPoints)
  if (stats.elevationGainMeters === undefined) return undefined

  const profile = computeElevationProfile(sampledPoints)
  if (!profile) return undefined

  return {
    elevationGainMeters: stats.elevationGainMeters,
    elevationLossMeters: stats.elevationLossMeters ?? 0,
    highPointMeters: stats.highPointMeters as number,
    lowPointMeters: stats.lowPointMeters as number,
    profile,
  }
}

/** The stable per-track key the sampled-elevation cache is keyed by — the
    owning file's `driveFileId` alone for the common single-track file, and
    `driveFileId#index` for a multi-track one so two placemarks in the same
    KML don't collide. Exported so `useTripImport` (which builds it) and any
    test constructing fixtures agree on the same shape. */
export function trackKey(driveFileId: string, trackIndex: number, tracksInFile: number): string {
  return tracksInFile > 1 ? `${driveFileId}#${trackIndex}` : driveFileId
}
