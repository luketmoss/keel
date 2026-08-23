import type { FeatureCollection, LineString } from 'geojson'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorldTrack3DFraming } from './WorldTrack3DFraming'
import type { TripIndexEntry } from '../store/tripStore'
import type { LooseRecord } from '../store/looseStore'
import type { PositionedCairn } from './CairnLayer'

/* #292 — the world view's own arrival: returning to it (or a filtered set
   changing while already there) flies the 3D camera to frame the visible
   trips and loose tracks, falling back to the loose cairns beside them.
   `worldTrackGeometry` is left real; only the Maps API underneath it is
   faked, the same split `world3DRoutes.test.ts` and
   `TripDetail.track3DFraming.test.tsx` both take. */
const { fakeMap3d, flyCameraTo } = vi.hoisted(() => {
  const flyCameraTo = vi.fn()
  const fakeMap3d = {
    heading: 5,
    tilt: 30,
    center: null as unknown,
    range: null as unknown,
    flyCameraTo,
  }
  return { fakeMap3d, flyCameraTo }
})

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap3D: () => fakeMap3d,
}))

const { is3DOnRef } = vi.hoisted(() => ({ is3DOnRef: { current: true } }))
vi.mock('../map/Map3DControl', () => ({
  useMap3DControl: () => ({ on: is3DOnRef.current }),
}))

function overview(coords: [number, number][][]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: coords.map((line) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    })),
  }
}

function trip(id: string): TripIndexEntry {
  return { id, name: id, status: 'planned' } as unknown as TripIndexEntry
}

function looseTrack(id: string, colorIndex: number): Extract<LooseRecord, { kind: 'track' }> {
  return { id, kind: 'track', colorIndex } as unknown as Extract<LooseRecord, { kind: 'track' }>
}

function cairn(id: string, lat: number, lng: number): PositionedCairn {
  return { id, name: id, thumbnailDriveFileId: null, icon: null, latitude: lat, longitude: lng, source: 'exif' }
}

const TRIP_STORE_WITH_ROUTE = {
  getOverview: () =>
    overview([
      [
        [10, 20],
        [10.02, 20.02],
      ],
    ]),
}
const EMPTY_STORE = { getOverview: () => null }

beforeEach(() => {
  flyCameraTo.mockClear()
  fakeMap3d.center = null
  fakeMap3d.range = null
  is3DOnRef.current = true
})

describe('WorldTrack3DFraming (#292)', () => {
  it('frames the world’s visible trips and loose tracks on arrival', () => {
    render(
      <WorldTrack3DFraming
        trips={[trip('t1')]}
        tripStore={TRIP_STORE_WITH_ROUTE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[]}
        revealSuspended={false}
      />,
    )

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(5)
    expect(call.endCamera.tilt).toBe(30)
    expect(call.endCamera.center.lat).toBeCloseTo(20.01)
    expect(call.endCamera.center.lng).toBeCloseTo(10.01)
  })

  it('falls back to the loose cairns when there is no track geometry', () => {
    render(
      <WorldTrack3DFraming
        trips={[]}
        tripStore={EMPTY_STORE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[cairn('c1', 40, -70)]}
        revealSuspended={false}
      />,
    )

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.center.lat).toBeCloseTo(40)
    expect(call.endCamera.center.lng).toBeCloseTo(-70)
  })

  it('leaves the camera alone with nothing to frame', () => {
    render(
      <WorldTrack3DFraming
        trips={[]}
        tripStore={EMPTY_STORE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[]}
        revealSuspended={false}
      />,
    )

    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while a decision owns the map', () => {
    render(
      <WorldTrack3DFraming
        trips={[trip('t1')]}
        tripStore={TRIP_STORE_WITH_ROUTE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[]}
        revealSuspended
      />,
    )

    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('re-frames when a loose track is added, and not when the set only shrinks', () => {
    const { rerender } = render(
      <WorldTrack3DFraming
        trips={[]}
        tripStore={EMPTY_STORE}
        looseTracks={[looseTrack('l1', 0)]}
        looseStore={TRIP_STORE_WITH_ROUTE}
        cairns={[]}
        revealSuspended={false}
      />,
    )
    flyCameraTo.mockClear()

    rerender(
      <WorldTrack3DFraming
        trips={[]}
        tripStore={EMPTY_STORE}
        looseTracks={[looseTrack('l1', 0), looseTrack('l2', 1)]}
        looseStore={TRIP_STORE_WITH_ROUTE}
        cairns={[]}
        revealSuspended={false}
      />,
    )
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    flyCameraTo.mockClear()

    rerender(
      <WorldTrack3DFraming
        trips={[]}
        tripStore={EMPTY_STORE}
        looseTracks={[looseTrack('l1', 0)]}
        looseStore={TRIP_STORE_WITH_ROUTE}
        cairns={[]}
        revealSuspended={false}
      />,
    )
    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('frames again every time it remounts — returning to the world view', () => {
    const { unmount } = render(
      <WorldTrack3DFraming
        trips={[trip('t1')]}
        tripStore={TRIP_STORE_WITH_ROUTE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[]}
        revealSuspended={false}
      />,
    )
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    unmount()
    flyCameraTo.mockClear()

    render(
      <WorldTrack3DFraming
        trips={[trip('t1')]}
        tripStore={TRIP_STORE_WITH_ROUTE}
        looseTracks={[]}
        looseStore={EMPTY_STORE}
        cairns={[]}
        revealSuspended={false}
      />,
    )
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
  })
})
