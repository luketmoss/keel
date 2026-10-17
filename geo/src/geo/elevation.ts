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

/** A sampling call's outcome — success with its raw samples, or failure
    carrying the reason a developer can read. `reason` is never the API's
    literal status leaking to the UI (#232's acceptance criteria keep the
    reader's copy unchanged); it is logged once per settled batch by
    whichever caller is running the batch. */
export type ElevationSampleResult =
  | { ok: true; samples: RawElevationSample[] }
  | { ok: false; reason: string }

/** The seam a fake implementation swaps in for tests, and the real
    `google.maps.ElevationService` swaps in for the app — see
    `createGoogleElevationSampler` below. */
export interface ElevationSampler {
  sampleAlongPath(path: { lat: number; lng: number }[], samples: number): Promise<ElevationSampleResult>
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
          /* #232: compared against the literal `'OK'` the API's callback
             actually hands back, not `maps.ElevationStatus.OK` — that enum
             lives in the `elevation` library, and when it wasn't loaded
             (the bug this issue fixes) the comparison was `'OK' !==
             undefined`, which is true for every response and discarded
             every successful call as a failure. */
          if (status !== 'OK' || !results) {
            resolve({ ok: false, reason: status })
            return
          }
          resolve({
            ok: true,
            samples: results.map((result) => ({
              lat: result.location?.lat() ?? 0,
              lng: result.location?.lng() ?? 0,
              elevationMeters: result.elevation,
            })),
          })
        })
      })
    },
  }
}

/** `sampleTrackElevation`'s result — success carries the stored shape;
    failure carries the reason a developer can read (#232). `reason` is
    never shown to the reader: #224's copy stays "Couldn't estimate
    elevation for N tracks", and the reason is what a caller logs once per
    settled batch instead. Local reasons (`'no-samples'`, `'degenerate-
    series'`) name the cases that never touched the network, alongside
    whatever status the API itself returned. */
export type TrackSampleOutcome =
  | { ok: true; elevation: StoredTrackElevation }
  | { ok: false; reason: string }

/** Samples one track's elevation and reduces the result to the shape
    `StoredTrackElevation` persists — #218's stats and #219's profile,
    computed over the sampled series exactly as they would be over a
    recorded one (`computeElevationStats`/`computeElevationProfile`, the
    same functions and thresholds, so a DEM series is held to the same
    "is this actually a climb" standard a barometer's is).
 *
 * Every one of the design note's silent-failure cases returns `ok: false`:
    fewer than two points (nothing to sample along), the API call itself
    failing, and a sampled series that still comes back unavailable (fewer
    than two distinct elevations — a degenerate path, or a call that
    returned but found nothing). To the *reader* none of these are told
    apart — all of them leave the track exactly as #218 already renders "no
    elevation" — but `reason` tells them apart for whoever is debugging. */
export async function sampleTrackElevation(
  points: TrackPoint[],
  sampler: ElevationSampler,
): Promise<TrackSampleOutcome> {
  if (points.length < 2) return { ok: false, reason: 'no-samples' }

  const raw = await sampler.sampleAlongPath(
    points.map((point) => ({ lat: point.lat, lng: point.lon })),
    Math.min(MAX_SAMPLES, points.length),
  )
  if (!raw.ok) return raw
  if (raw.samples.length < 2) return { ok: false, reason: 'no-samples' }

  const sampledPoints: TrackPoint[] = raw.samples.map((sample) => ({
    lat: sample.lat,
    lon: sample.lng,
    elevation: sample.elevationMeters,
  }))

  const stats = computeElevationStats(sampledPoints)
  if (stats.elevationGainMeters === undefined) return { ok: false, reason: 'degenerate-series' }

  const profile = computeElevationProfile(sampledPoints)
  if (!profile) return { ok: false, reason: 'degenerate-series' }

  return {
    ok: true,
    elevation: {
      elevationGainMeters: stats.elevationGainMeters,
      elevationLossMeters: stats.elevationLossMeters ?? 0,
      highPointMeters: stats.highPointMeters as number,
      lowPointMeters: stats.lowPointMeters as number,
      profile,
    },
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
