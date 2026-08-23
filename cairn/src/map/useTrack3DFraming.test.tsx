import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrack3DFraming } from './useTrack3DFraming'
import type { LatLng } from './geo'

/* #292 — the shared hook both `Track3DLayer` mounts (`TripDetail`'s and the
   world view's `WorldTrack3DFraming`) call. Exercised directly here, the
   same way #274's `frameGeometry` gets its own `flyover.test.ts` rather
   than only being proven through a component — a fake `Map3DElement` is
   plenty; nothing here needs the real Maps API. */
const { reducedMotion } = vi.hoisted(() => ({ reducedMotion: { current: false } }))
vi.mock('./motion', () => ({ prefersReducedMotion: () => reducedMotion.current }))

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
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useTrack3DFraming (#292)', () => {
  it('frames on the very first render, even with a zero-track, zero-cairn signal to start from', () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
    const call = map3d.flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(12)
    expect(call.endCamera.tilt).toBe(47)
    expect(call.endCamera.center.lat).toBeCloseTo(10.01)
    expect(call.endCamera.center.lng).toBeCloseTo(20.01)
    expect(call.durationMillis).toBeGreaterThan(0)
  })

  it('a trip with neither tracks nor cairns leaves the camera alone — nothing to frame', () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={0} visibleKey="" points={[]} />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
    expect(map3d.center).toBeNull()
  })

  it('re-frames when the item count grows — an import', () => {
    const map3d = fakeMap3d()
    const { rerender } = render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    map3d.flyCameraTo.mockClear()

    rerender(<Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />)

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
  })

  it('re-frames when the same count of items has a different visible set — a toggle', () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />,
    )
    map3d.flyCameraTo.mockClear()

    // file-b hidden, file-a still visible: same total, different visible key.
    rerender(<Probe map3d={map3d} totalCount={2} visibleKey="file-a" points={ONE_TRACK} />)

    expect(map3d.flyCameraTo).toHaveBeenCalledTimes(1)
  })

  it('does not re-frame when an item is removed — the count shrinks with no toggle', () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={2} visibleKey="file-a,file-b" points={ONE_TRACK} />,
    )
    map3d.flyCameraTo.mockClear()

    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not re-frame on a render where neither the count nor the visible key changed', () => {
    const map3d = fakeMap3d()
    const { rerender } = render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    map3d.flyCameraTo.mockClear()

    // A fresh `points` array reference for the same content — #288's own
    // "never on `tripImport.tracks` re-rendering with a new array
    // reference" reasoning, one hook over.
    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={[...ONE_TRACK]} />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while a decision owns the map', () => {
    const map3d = fakeMap3d()
    render(
      <Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} revealSuspended />,
    )

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while 3D is off', () => {
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn={false} />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame before the 3D surface has mounted', () => {
    render(<Probe map3d={null} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)
    // No throw is the assertion — there is no `map3d.flyCameraTo` to check.
  })

  it('flipping is3DOn on with unchanged content does not itself fire a flight', () => {
    const map3d = fakeMap3d()
    const { rerender } = render(
      <Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn={false} />,
    )
    expect(map3d.flyCameraTo).not.toHaveBeenCalled()

    rerender(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} is3DOn />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
  })

  it('under reduced motion, assigns center and range directly instead of flying', () => {
    reducedMotion.current = true
    const map3d = fakeMap3d()
    render(<Probe map3d={map3d} totalCount={1} visibleKey="file-a" points={ONE_TRACK} />)

    expect(map3d.flyCameraTo).not.toHaveBeenCalled()
    const center = map3d.center as { lat: number; lng: number; altitude: number }
    expect(center.lat).toBeCloseTo(10.01)
    expect(center.lng).toBeCloseTo(20.01)
    expect(center.altitude).toBe(0)
    expect(map3d.range).toBeGreaterThan(0)
  })
})
