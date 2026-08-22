import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useMapResult, map3dEl, flyCameraTo, flyCameraAround, stopCameraAnimation } = vi.hoisted(() => {
  const flyCameraTo = vi.fn()
  const flyCameraAround = vi.fn()
  const stopCameraAnimation = vi.fn()
  const map3dEl = {
    center: { lat: 10, lng: 20 } as { lat: number; lng: number },
    range: 5000 as number | null,
    tilt: 0,
    heading: 0,
    // #274's gesture-cancel listener registers directly on the element —
    // the real `MarkerElement`/`Map3DElement` both extend `HTMLElement`, so
    // this stub carries the same two methods rather than a full DOM node.
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const fakeMap2d = {
    getCenter: () => ({ lat: () => 10, lng: () => 20 }),
    getZoom: () => 10,
    getDiv: () => ({ clientHeight: 800 }),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  }
  return {
    useMapResult: { current: fakeMap2d as unknown },
    map3dEl,
    flyCameraTo,
    flyCameraAround,
    stopCameraAnimation,
  }
})

vi.mock('@vis.gl/react-google-maps', async () => {
  const React = await import('react')
  const Map3D = React.forwardRef(function FakeMap3D(_props: unknown, ref: React.Ref<unknown>) {
    React.useImperativeHandle(ref, () => ({
      map3d: map3dEl,
      flyCameraTo,
      flyCameraAround,
      stopCameraAnimation,
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

  it('a fast on-then-off, before the entering frame lands, does not resurrect the surface', () => {
    const pendingFrame: { current: FrameRequestCallback | null } = { current: null }
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pendingFrame.current = cb
      return 0
    })

    const { rerender, container } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)
    // Turned off again before the deferred frame ("first tiles up") fires.
    rerender(<Map3DSurface on={false} mode={'SATELLITE' as never} />)
    flyCameraTo.mockClear()

    pendingFrame.current?.(0)

    expect(container.querySelector('.map3d-surface--visible')).toBeNull()
    expect(flyCameraTo).not.toHaveBeenCalled()
  })
})

describe('Map3DSurface flyover (#274)', () => {
  const points = [
    { lat: 10, lng: 20 },
    { lat: 10.01, lng: 20.01 },
  ]

  beforeEach(() => {
    flyCameraTo.mockClear()
    flyCameraAround.mockClear()
    stopCameraAnimation.mockClear()
    reducedMotion.current = false
    map3dEl.tilt = 0
    map3dEl.heading = 0
    map3dEl.addEventListener.mockClear()
    map3dEl.removeEventListener.mockClear()
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('turning on for a flyover skips #271\'s own tilt-in and flies to the framed geometry instead', () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)

    // Never the 55° tilt-in — only the flyover's own 65° fly-in.
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(65)
  })

  it('the orbit follows the fly-in without a pause, for one round', () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    expect(flyCameraAround).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000 + 400)

    expect(flyCameraAround).toHaveBeenCalledTimes(1)
    expect(flyCameraAround.mock.calls[0][0].durationMillis).toBe(12000)
    expect(flyCameraAround.mock.calls[0][0].rounds).toBe(1)
  })

  it('lands the camera on the framed target if the fly-in never visibly arrived — the compositor gotcha', () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    // A backgrounded tab: `flyCameraTo` never advances `tilt` at all.
    map3dEl.tilt = 0

    vi.advanceTimersByTime(2000 + 400)

    expect(map3dEl.tilt).toBe(65)
  })

  it('under reduced motion, assigns the framed camera outright with no flight and no orbit', () => {
    reducedMotion.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)

    expect(map3dEl.tilt).toBe(65)
    expect(flyCameraTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20000)
    expect(flyCameraAround).not.toHaveBeenCalled()
  })

  it('pressing Fly over again while one is running cancels it and starts fresh, rather than stacking', () => {
    const { rerender } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    expect(flyCameraTo).toHaveBeenCalledTimes(1)

    rerender(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 2, points }} />)

    expect(stopCameraAnimation).toHaveBeenCalled()
    expect(flyCameraTo).toHaveBeenCalledTimes(2)
  })

  it('input on the 3D surface cancels the running flight', () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    expect(map3dEl.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function))

    const [, handler] = map3dEl.addEventListener.mock.calls.find(([type]) => type === 'pointerdown')!
    ;(handler as () => void)()

    expect(stopCameraAnimation).toHaveBeenCalledTimes(1)

    // The orbit never starts — the fly-in's own timer was cleared too.
    vi.advanceTimersByTime(20000)
    expect(flyCameraAround).not.toHaveBeenCalled()
  })

  it('turning 3D off mid-flight cancels it before reading the camera back into 2D', () => {
    const { rerender } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    expect(flyCameraTo).toHaveBeenCalledTimes(1)

    rerender(<Map3DSurface on={false} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)

    expect(stopCameraAnimation).toHaveBeenCalled()
  })
})
