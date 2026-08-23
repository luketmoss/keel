import type { TripIndexEntry } from '../store/tripStore'
import type { LooseRecord } from '../store/looseStore'
import { trackColor } from '../map/palette'
import type { Track3D } from '../map/track3D'
import { linesFromOverview } from './overviewLines'

/** Exported so #292's `WorldTrack3DFraming` can type `tripStore`/`looseStore`
    against the same shape this function reads, rather than a second,
    locally-declared copy that could drift from it. */
export interface OverviewSource {
  getOverview(id: string): import('geojson').FeatureCollection<import('geojson').LineString> | null
}

/** #271 — the world view's 3D routes: every visible trip's and loose
    track's precomputed `overview.geojson`, at rest, the same simplified
    geometry the 2D world view reads for counts and totals. Nothing draws
    this in 2D — trips are dots there and a loose track's route only shows
    on hover or selection — but in 3D there are no markers, so the world
    view is a set of routes on terrain instead.

    A trip's own tracks carry no stored colour in its overview (only a
    track *file*, not a simplified feature, has a `colorIndex`), so each of
    a trip's features cycles the palette by its own position within that
    trip — still "the track's own colour from palette.ts", just not
    provably the same index the file itself carries. A loose track keeps
    its real `colorIndex`, which the record does store. */
export function worldTrackGeometry(
  trips: TripIndexEntry[],
  tripStore: OverviewSource,
  looseTracks: Extract<LooseRecord, { kind: 'track' }>[],
  looseStore: OverviewSource,
): Track3D[] {
  const tracks: Track3D[] = []

  for (const trip of trips) {
    const lines = linesFromOverview(tripStore.getOverview(trip.id))
    lines.forEach((points, index) => {
      tracks.push({ key: `trip-${trip.id}-${index}`, color: trackColor(index), points })
    })
  }

  for (const item of looseTracks) {
    const lines = linesFromOverview(looseStore.getOverview(item.id))
    lines.forEach((points, index) => {
      tracks.push({ key: `loose-${item.id}-${index}`, color: trackColor(item.colorIndex), points })
    })
  }

  return tracks
}
