import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LatLng } from './geo'

/* #292 — the shared hook both `Track3DLayer` mounts (`TripDetail`'s and the
   world view's `WorldTrack3DFraming`) call. Exercised directly here, the
   same way #274's `frameGeometry` gets its own `flyover.test.ts` rather
   than only being proven through a component — a fake `Map3DElement` is
   plenty; nothing here needs the real Maps API.

   #303 — the fit now resolves the ground through `flyToFramedGround`
   before it moves the camera, the same as `Map3D.test.tsx`'s own harness:
   a fixed elevation stands in for the real Elevation API so assertions are
   about "the resolved ground was used", not about Google's data, and
   `elevationFails` flips the ground-unresolved fail-safe on for the one
   test that needs it. */
const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { current: false } }))
vi.mock('./motion', () => ({ prefersReducedMotion: () => reducedMotion.current }))

const GROUND_METERS = 1200
const elevationFails = { current: false }
vi.mock('../geo/elevation', () => ({
  createGoogleElevationSampler: () => ({
    sampleAlongPath: async () =>
      elevationFails.current
        ? { ok: false, reason: 'UNKNOWN_ERROR' }
        : { ok: true, samples: [{ lat: 0, lng: 0, elevationMeters: GROUND_METERS }] },
  }),
}))

import { useTrack3DFraming } from './useTrack3DFraming'
import { clearGroundAltitudeCache } from './groundAltitude'

/** Lets the awaited ground request settle — the framing that follows it is
    what every assertion below is actually about, `Map3D.test.tsx`'s own
    helper. */
async function settleFraming() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function fakeMap3d() {
  return {
    heading: 12,
    tilt: 47,
    center: null as unknown,
    range: null as unknown,
    flyCameraTo: vi.fn(),
  }
}

const ONE_TRACK: LatLng[] = [
  { lat: 10, lng: 20 },
  { lat: 10.02, lng: 20.02 },
]

function Probe({
  map3d,
  is3DOn = true,
  revealSuspended = false,
  totalCount,
  visibleKey,
  points,
}: {
  map3d: ReturnType<typeof fakeMap3d> | null
  is3DOn?: boolean
  revealSuspended?: boolean
  totalCount: number
  visibleKey: string
  points: LatLng[]
}) {
  useTrack3DFraming({
    map3d: map3d as unknown as google.maps.maps3d.Map3DElement | null,
    is3DOn,
    revealSuspended,
    totalCount,
    visibleKey,
    points,
  })
  return null
}

beforeEach(() => {
  reducedMotion.current = false
  elevationFails.current = false
  clearGroundAltitudeCache()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useTrack3DFraming (#292)', () => {
  it('frames on the very first render, even with a zero-track, zero-cairn signal to start from', async () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(12)
    expect(call.endCamera.tilt).toBe(47)
    expect(call.endCamera.center.lat).toBeCloseTo(10.01)
    expect(call.endCamera.center.lng).toBeCloseTo(20.01)
    expect(call.endCamera.center.altitude).toBe(GROUND_METERS)
    expect(call.durationMillis).toBeGreaterThan(0)
  })

  it('a trip with neither tracks nor cairns leaves the camera alone — nothing to frame', async () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={0} visibleKey="" points={[]} />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
    expect(map3d.center).toBeNull()
  })

  it('re-frames when the item count grows — an import', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()
    map3d.flyCameraTo.mockClear()

    rerender(<Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
  })

  it('re-frames when the same count of items has a different visible set — a toggle', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />,
    )
    await settleFraming()
    map3d.flyCameraTo.mockClear()

    // file-b hidden, file-a still visible: same total, different visible key.
    rerender(<Probe map3d={map3d} totalCount={2} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
  })

  it('does not re-frame when an item is removed — the count shrinks with no toggle', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />,
    )
    await settleFraming()
    map3d.flyCameraTo.mockClear()

    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not re-frame on a render where neither the count nor the visible key changed', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()
    map3d.flyCameraTo.mockClear()

    // A fresh `points` array reference for the same content — #288's own
    // "never on `tripImport.tracks` re-rendering with a new array
    // reference" reasoning, one hook over.
    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={[...ONE_TRACK]} />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while a decision owns the map', async () => {
    const map3d = fakeMap3d()
    render(
      <Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} revealSuspended />,
    )
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while 3D is off', async () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn={false} />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame before the 3D surface has mounted', async () => {
    render(<Probe map3d={null} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()
    // No throw is the assertion — there is no `map3d.flyCameraTo` to check.
  })

  it('flipping is3DOn on with unchanged content does not itself fire a flight', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn={false} />,
    )
    await settleFraming()
    expect(map3d.flyCameraTo).not.toHaveBeenCalled()

    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('under reduced motion, assigns center and range directly instead of flying', async () => {
    reducedMotion.current = true
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
    const center = map3d.center as { lat: number; lng: number; altitude: number }
    expect(center.lat).toBeCloseTo(10.01)
    expect(center.lng).toBeCloseTo(20.01)
    expect(center.altitude).toBe(GROUND_METERS)
    expect(map3d.range).toBeGreaterThan(0)
  })

  /* #303 — over terrain that #306's request could not resolve (no sampler,
     a failed call, a timeout), the fit still lands but flattens to tilt 0
     rather than tilting a live camera down over a look-at that might be
     buried — the same fail-safe `Map3D.test.tsx` proves for the tilt-in. */
  it('flattens to tilt 0 when the ground cannot be resolved', async () => {
    elevationFails.current = true
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    await settleFraming()

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.tilt).toBe(0)
    expect(call.endCamera.center.altitude).toBe(0)
    // Heading stays live even when the ground could not be resolved — only
    // tilt is the fail-safe's concern.
    expect(call.endCamera.heading).toBe(12)
  })

  /* #303's own edge case: "selecting a second track before the first
     flight lands" — generalized to the arrival fit, which can retrigger
     just as fast (an import followed immediately by a toggle). The later
     move's ground request is the one that gets to land. */
  it('does not let a stale ground request land after a newer one replaced it', async () => {
    const map3d = fakeMap3d()
    const { rerender } = render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    // Before the first fit's ground request settles, the content changes
    // again — the effect's cleanup cancels the first one.
    rerender(<Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />)
    await settleFraming()

    // Only the second fit ever reaches `flyCameraTo` — the first's ground
    // request resolved into a cancelled effect and applied nothing.
    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
  })
})
