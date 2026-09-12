import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fitTracksToBounds, flyToFramedGround } = vi.hoisted(() => ({
  fitTracksToBounds: vi.fn(),
  flyToFramedGround: vi.fn(),
}))
vi.mock('./fitBounds', () => ({ fitTracksToBounds, FIT_PADDING: 48 }))
vi.mock('./flyToFramedGround', () => ({ flyToFramedGround }))

const { useMapResult, useMap3DResult } = vi.hoisted(() => ({
  useMapResult: { current: { id: '2d' } as unknown },
  useMap3DResult: { current: { id: '3d' } as unknown },
}))
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => useMapResult.current,
  useMap3D: () => useMap3DResult.current,
}))

const { is3DOn } = vi.hoisted(() => ({ is3DOn: { current: false } }))
vi.mock('./Map3DControl', () => ({ useMap3DControl: () => ({ on: is3DOn.current }) }))

vi.mock('./useIsPhone', () => ({ useIsPhone: () => false }))
vi.mock('./reveal', () => ({
  columnInset: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
  toPadding: (inset: unknown) => inset,
}))

import { LocateCamera } from './LocateCamera'
import { LOCATE_MAX_ZOOM } from './locateCamera'
import type { PositionFix } from './useGeolocation'

function fix(overrides: Partial<PositionFix> = {}): PositionFix {
  return { position: { lat: 39.5, lng: -105.5 }, accuracyMeters: 50, at: 1, ...overrides }
}

beforeEach(() => {
  fitTracksToBounds.mockClear()
  flyToFramedGround.mockClear()
  is3DOn.current = false
  useMapResult.current = { id: '2d' }
  useMap3DResult.current = { id: '3d' }
})

describe('LocateCamera', () => {
  it('does nothing without a fix', () => {
    render(<LocateCamera fix={null} />)

    expect(fitTracksToBounds).not.toHaveBeenCalled()
    expect(flyToFramedGround).not.toHaveBeenCalled()
  })

  it('fits the accuracy circle, capped one step closer than a track fit', () => {
    render(<LocateCamera fix={fix()} />)

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    const [map, corners, , maxZoom] = fitTracksToBounds.mock.calls[0]
    expect(map).toEqual({ id: '2d' })
    expect(corners).toHaveLength(4)
    expect(maxZoom).toBe(LOCATE_MAX_ZOOM)
  })

  it('does not move the camera again for a fix it has already flown to', () => {
    const same = fix()
    const { rerender } = render(<LocateCamera fix={same} />)
    rerender(<LocateCamera fix={same} />)

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
  })

  it('moves again for a fresh fix at the same coordinate — a second press', () => {
    const { rerender } = render(<LocateCamera fix={fix({ at: 1 })} />)
    rerender(<LocateCamera fix={fix({ at: 2 })} />)

    expect(fitTracksToBounds).toHaveBeenCalledTimes(2)
  })

  it('flies the 3D camera instead when 3D is on, leaving heading and tilt alone', () => {
    is3DOn.current = true
    render(<LocateCamera fix={fix()} />)

    expect(fitTracksToBounds).not.toHaveBeenCalled()
    expect(flyToFramedGround).toHaveBeenCalledTimes(1)
    // `flyToFramedGround` is the reveal helper precisely because it reads
    // heading and tilt live off the element and hands them back.
    const [map3d, corners] = flyToFramedGround.mock.calls[0]
    expect(map3d).toEqual({ id: '3d' })
    expect(corners).toHaveLength(4)
  })

  it('does not re-fly an existing fix when 3D is switched on', () => {
    const same = fix()
    const { rerender } = render(<LocateCamera fix={same} />)
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)

    is3DOn.current = true
    rerender(<LocateCamera fix={same} />)

    expect(flyToFramedGround).not.toHaveBeenCalled()
  })

  it('survives a fix arriving before the map instance exists', () => {
    useMapResult.current = null

    expect(() => render(<LocateCamera fix={fix()} />)).not.toThrow()
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })
})
