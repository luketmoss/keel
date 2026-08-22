import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useMapResult, map3dEl, flyCameraTo } = vi.hoisted(() => {
  const flyCameraTo = vi.fn()
  const map3dEl = {
    center: { lat: 10, lng: 20 } as { lat: number; lng: number },
    range: 5000 as number | null,
    tilt: 0,
    heading: 0,
  }
  const fakeMap2d = {
    getCenter: () => ({ lat: () => 10, lng: () => 20 }),
    getZoom: () => 10,
    getDiv: () => ({ clientHeight: 800 }),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  }
  return { useMapResult: { current: fakeMap2d as unknown }, map3dEl, flyCameraTo }
})

vi.mock('@vis.gl/react-google-maps', async () => {
  const React = await import('react')
  const Map3D = React.forwardRef(function FakeMap3D(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      map3d: map3dEl,
      flyCameraTo,
      flyCameraAround: vi.fn(),
      stopCameraAnimation: vi.fn(),
    }))
    return React.createElement('div', { 'data-testid': 'map3d' })
  })
  return {
    useMap: () => useMapResult.current,
    GestureHandling: { GREEDY: 'GREEDY' },
    Map3D,
  }
})

vi.mock('../map/motion', () => ({ prefersReducedMotion: () => reducedMotion.current }))
const reducedMotion = { current: false }

import { Map3DSurface } from './Map3D'

describe('Map3DSurface (#271)', () => {
  beforeEach(() => {
    flyCameraTo.mockClear()
    reducedMotion.current = false
    map3dEl.tilt = 0
    map3dEl.heading = 0
    // jsdom's real rAF is throttled/async; the entry animation is gated on
    // one frame so the "framed flat and invisible" moment actually paints
    // before the fade starts — run it synchronously here so the assertions
    // below don't need to await a real frame.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not mount the 3D surface until first turned on', () => {
    const { container } = render(<Map3DSurface on={false} mode={'SATELLITE' as never} />)
    expect(container.querySelector('[data-testid="map3d"]')).toBeNull()
  })

  it('mounts and frames the 3D camera on the 2D map\'s own centre when turned on', () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)

    expect(map3dEl.center).toEqual({ lat: 10, lng: 20, altitude: 0 })
    expect(map3dEl.tilt).toBe(0) // set flat first, then flown to 55 via flyCameraTo
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(55)
  })

  it('jumps straight to the tilted camera under reduced motion, without flyCameraTo', () => {
    reducedMotion.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)

    expect(map3dEl.tilt).toBe(55)
    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('stays mounted after being turned off, and syncs the 2D map to where 3D got to', () => {
    const fakeMap2d = useMapResult.current as { setCenter: ReturnType<typeof vi.fn>; setZoom: ReturnType<typeof vi.fn> }

    const { rerender, container } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)
    // The user navigates the 3D camera while it's on — read live, not the
    // place it started, when the switch turns off.
    map3dEl.center = { lat: 37.5, lng: -119.5 }
    map3dEl.range = 8000
    rerender(<Map3DSurface on={false} mode={'SATELLITE' as never} />)

    expect(fakeMap2d.setCenter).toHaveBeenCalledWith({ lat: 37.5, lng: -119.5 })
    expect(fakeMap2d.setZoom).toHaveBeenCalled()
    // Never destroyed and remounted — the edge case's own words.
    expect(container.querySelector('[data-testid="map3d"]')).not.toBeNull()
  })
})
