import { useMemo } from 'react'
import { useMap3D } from '@vis.gl/react-google-maps'
import { useMap3DControl } from '../map/Map3DControl'
import { useTrack3DFraming } from '../map/useTrack3DFraming'
import { worldTrackGeometry } from '../geo/world3DRoutes'
import { MAP3D_ID } from '../map/track3D'
import type { LooseRecord } from '../store/looseStore'
import type { TripIndexEntry } from '../store/tripStore'
import type { PositionedCairn } from './CairnLayer'

interface OverviewSource {
  getOverview(id: string): import('geojson').FeatureCollection<import('geojson').LineString> | null
}

interface WorldTrack3DFramingProps {
  trips: TripIndexEntry[]
  tripStore: OverviewSource
  looseTracks: Extract<LooseRecord, { kind: 'track' }>[]
  looseStore: OverviewSource
  /** #292's fallback for the world view, mirroring `TripDetail`'s own: the
      loose cairns `Cairn3DLayer` draws beside this layer, framed when the
      world has no track geometry to show instead. */
  cairns: PositionedCairn[]
  revealSuspended: boolean
}

/** #292 — the world view's half of `Track3DLayer`'s bounds fit. Exists as
    its own component, rendered only for `App.tsx`'s `!openTripId` block,
    so that mounting and unmounting *with* that block is what gives
    `useTrack3DFraming` a fresh "nothing seen yet" start every time the user
    returns to the world view — the same reset `TripDetail` gets for free
    from its own `key={openTripId}`. Renders nothing; it only owns the
    effect, exactly like `PlacementClickCatcher`/`CairnCreateGesture`
    beside it in `App.tsx`. */
export function WorldTrack3DFraming({
  trips,
  tripStore,
  looseTracks,
  looseStore,
  cairns,
  revealSuspended,
}: WorldTrack3DFramingProps) {
  const map3d = useMap3D(MAP3D_ID)
  const { on: is3DOn } = useMap3DControl()

  const tracks = useMemo(
    () => worldTrackGeometry(trips, tripStore, looseTracks, looseStore),
    [trips, tripStore, looseTracks, looseStore],
  )

  const points = useMemo(() => {
    const trackPoints = tracks.filter((track) => track.points.length >= 2).flatMap((track) => track.points)
    if (trackPoints.length > 0) return trackPoints
    return cairns.map((cairn) => ({ lat: cairn.latitude, lng: cairn.longitude }))
  }, [tracks, cairns])

  const visibleKey = useMemo(
    () =>
      [...trips.map((trip) => trip.id), ...looseTracks.map((item) => item.id)].sort().join(','),
    [trips, looseTracks],
  )

  useTrack3DFraming({
    map3d,
    is3DOn,
    revealSuspended,
    totalCount: trips.length + looseTracks.length,
    visibleKey,
    points,
  })

  return null
}
