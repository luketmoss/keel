import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useMapResult, map3dEl, flyCameraTo, flyCameraAround, stopCameraAnimation } = vi.hoisted(() => {
  const flyCameraTo = vi.fn()
  const flyCameraAround = vi.fn()
  const stopCameraAnimation = vi.fn()
  const map3dEl = {
    center: { lat: 10, lng: 20 } as { lat: number; lng: number; altitude?: number },
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

/* Module-scoped so a test can simulate the real gap between React rendering
   `<gmp-map-3d>` and the browser finishing that custom element's upgrade —
   `map3dRef.current` exists throughout, but `.map3d` on it does not, until
   `setMapUpgraded` flips it. Defaults ready, so every other test in this
   file (none of which cares about the race) sees the element as available
   on first render, same as before this existed. */
const { mapUpgraded, setMapUpgraded } = vi.hoisted(() => {
  let upgraded = true
  let notify = () => {}
  return {
    mapUpgraded: {
      subscribe: (cb: () => void) => {
        notify = cb
        return () => {}
      },
      getSnapshot: () => upgraded,
    },
    setMapUpgraded: (value: boolean) => {
      upgraded = value
      notify()
    },
  }
})

vi.mock('@vis.gl/react-google-maps', async () => {
  const React = await import('react')
  const Map3D = React.forwardRef(function FakeMap3D(_props: unknown, ref: React.Ref<unknown>) {
    const upgraded = React.useSyncExternalStore(mapUpgraded.subscribe, mapUpgraded.getSnapshot)
    React.useImperativeHandle(
      ref,
      () => (upgraded ? { map3d: map3dEl, flyCameraTo, flyCameraAround, stopCameraAnimation } : {}),
      [upgraded],
    )
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

/* #282 — the camera's look-at is put on the terrain before it tilts, which
   makes framing asynchronous. The altitude itself is what the real
   Elevation API supplies; here it is a fixed number so the tests assert on
   "the resolved ground was used", not on Google's data. */
const GROUND_METERS = 1200
/* #306 — flippable per test so the "ground could not be resolved" path can
   be exercised without a second mock module. */
const elevationFails = { current: false }
vi.mock('../geo/elevation', () => ({
  createGoogleElevationSampler: () => ({
    sampleAlongPath: async () =>
      elevationFails.current
        ? { ok: false, reason: 'UNKNOWN_ERROR' }
        : { ok: true, samples: [{ lat: 0, lng: 0, elevationMeters: GROUND_METERS }] },
  }),
}))

import { Map3DSurface } from './Map3D'
import { clearGroundAltitudeCache } from '../map/groundAltitude'

/** Lets the awaited elevation sample settle. The framing that follows it is
    what every assertion below is actually about. */
async function settleFraming() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('Map3DSurface (#271)', () => {
  beforeEach(() => {
    flyCameraTo.mockClear()
    reducedMotion.current = false
    elevationFails.current = false
    setMapUpgraded(true)
    clearGroundAltitudeCache()
    map3dEl.tilt = 0
    map3dEl.heading = 0
    map3dEl.center = { lat: 10, lng: 20 }
    map3dEl.range = 5000
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

  /* #306 — the ground could not be resolved at all: the tilt-in stays flat
     rather than tilting down over a look-at it cannot place, since sea
     level combined with a real tilt is exactly the buried-camera failure
     #282 fixed. */
  it('stays flat and at sea level when the ground cannot be resolved', async () => {
    elevationFails.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)
    await settleFraming()

    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(0)
    expect(flyCameraTo.mock.calls[0][0].endCamera.center.altitude).toBe(0)
  })

  it('does not mount the 3D surface until first turned on', () => {
    const { container } = render(<Map3DSurface on={false} mode={'SATELLITE' as never} />)
    expect(container.querySelector('[data-testid="map3d"]')).toBeNull()
  })

  it('mounts and frames the 3D camera on the 2D map\'s own centre when turned on', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)

    // Flat and overhead first — safe at sea level, because at tilt 0 the
    // camera sits a full `range` above the look-at.
    expect(map3dEl.center).toEqual({ lat: 10, lng: 20, altitude: 0 })
    expect(map3dEl.tilt).toBe(0)

    await settleFraming()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(55)
  })

  /* #282's own bug, as an assertion: a sea-level look-at is what made
     Google collapse `range` to 0 and render 3D as a flat map. The tilted
     camera has to be aimed at the ground, not at sea level under it. */
  it('puts the tilted look-at on the terrain, not at sea level', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)
    await settleFraming()

    expect(flyCameraTo.mock.calls[0][0].endCamera.center.altitude).toBe(GROUND_METERS)
    expect(map3dEl.center.altitude).toBe(GROUND_METERS)
  })

  it('jumps straight to the tilted camera under reduced motion, without flyCameraTo', async () => {
    reducedMotion.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)
    await settleFraming()

    expect(map3dEl.tilt).toBe(55)
    expect(map3dEl.center.altitude).toBe(GROUND_METERS)
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

  it('retries until the custom element finishes upgrading, rather than silently giving up forever', async () => {
    setMapUpgraded(false)
    const pendingFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      pendingFrames.push(cb)
      return pendingFrames.length
    })

    render(<Map3DSurface on={true} mode={'SATELLITE' as never} />)

    // React has rendered `<gmp-map-3d>` (mounted), but the browser hasn't
    // finished upgrading it — `map3dRef.current.map3d` isn't there yet, so
    // nothing has been framed and a retry has been queued instead of the
    // transition being marked handled.
    expect(map3dEl.center).toEqual({ lat: 10, lng: 20 })
    expect(pendingFrames.length).toBeGreaterThan(0)

    // Flushing the queued retry while still not upgraded must queue
    // another one, not give up.
    const firstRetry = pendingFrames.shift()!
    firstRetry(0)
    expect(pendingFrames.length).toBeGreaterThan(0)
    expect(flyCameraTo).not.toHaveBeenCalled()

    // The element finishes upgrading; the next queued retry finds it and
    // proceeds exactly as the always-ready case does.
    act(() => setMapUpgraded(true))
    const secondRetry = pendingFrames.shift()!
    secondRetry(0)

    expect(map3dEl.center).toEqual({ lat: 10, lng: 20, altitude: 0 })
    // `run()`'s own "framed flat, then fade in" rAF — a third, separate
    // queued frame, unrelated to `whenReady`'s polling.
    const enteringFrame = pendingFrames.shift()!
    enteringFrame(0)
    await settleFraming()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(55)
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
    elevationFails.current = false
    setMapUpgraded(true)
    clearGroundAltitudeCache()
    map3dEl.tilt = 0
    map3dEl.heading = 0
    map3dEl.center = { lat: 10, lng: 20 }
    map3dEl.range = 5000
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

  it('turning on for a flyover skips #271\'s own tilt-in and flies to the framed geometry instead', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()

    // Never the 55° tilt-in — only the flyover's own 65° fly-in.
    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(65)
  })

  /* #282 — the flyover's own version of the sea-level bug: framed at
     altitude 0 the camera flew into the mountain and Google collapsed the
     range, which is the "spinning around a blue screen" that was reported. */
  it('aims the fly-in at the terrain under the route, not at sea level', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()

    expect(flyCameraTo.mock.calls[0][0].endCamera.center.altitude).toBe(GROUND_METERS)
  })

  /* #306 — a long track's elevation request failing (or timing out) used
     to leave the fly-in aimed at sea level, tilted to 65°: exactly the
     "inside the earth, then a blue screen" the issue reported. The fix is
     to stay flat rather than guess a ground that was never resolved. */
  it('flies in flat and overhead, not tilted over sea level, when the ground cannot be resolved', async () => {
    elevationFails.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()

    expect(flyCameraTo.mock.calls[0][0].endCamera.tilt).toBe(0)
    expect(flyCameraTo.mock.calls[0][0].endCamera.center.altitude).toBe(0)
  })

  it('the orbit follows the fly-in without a pause, for one round', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    expect(flyCameraAround).not.toHaveBeenCalled()

    vi.advanceTimersByTime(2000 + 400)

    expect(flyCameraAround).toHaveBeenCalledTimes(1)
    expect(flyCameraAround.mock.calls[0][0].durationMillis).toBe(12000)
    expect(flyCameraAround.mock.calls[0][0].rounds).toBe(1)
    // And it orbits the same ground-anchored point the fly-in aimed at.
    expect(flyCameraAround.mock.calls[0][0].camera.center.altitude).toBe(GROUND_METERS)
  })

  /* Now unconditional: `flyCameraTo` was measured landing short of the
     range it was given even when it *did* animate, so the camera is
     asserted at the end of every flight rather than only when a
     backgrounded tab left the tilt untouched. */
  it('asserts the framed camera when the fly-in ends, however the flight actually went', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    // Whatever the flight left behind in the meantime — a backgrounded tab
    // that never advanced, or a flight that landed short of its range.
    map3dEl.tilt = 12
    map3dEl.range = 37

    vi.advanceTimersByTime(2000 + 400)

    expect(map3dEl.tilt).toBe(65)
    expect(map3dEl.range).toBeGreaterThan(37)
  })

  it('under reduced motion, assigns the framed camera outright with no flight and no orbit', async () => {
    reducedMotion.current = true
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()

    expect(map3dEl.tilt).toBe(65)
    expect(map3dEl.center.altitude).toBe(GROUND_METERS)
    expect(flyCameraTo).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20000)
    expect(flyCameraAround).not.toHaveBeenCalled()
  })

  it('pressing Fly over again while one is running cancels it and starts fresh, rather than stacking', async () => {
    const { rerender } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    expect(flyCameraTo).toHaveBeenCalledTimes(1)

    rerender(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 2, points }} />)
    await settleFraming()

    expect(stopCameraAnimation).toHaveBeenCalled()
    expect(flyCameraTo).toHaveBeenCalledTimes(2)
  })

  it('input on the 3D surface cancels the running flight', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    expect(map3dEl.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function))

    const [, handler] = map3dEl.addEventListener.mock.calls.find(([type]) => type === 'pointerdown')!
    ;(handler as () => void)()

    expect(stopCameraAnimation).toHaveBeenCalledTimes(1)

    // The orbit never starts — the fly-in's own timer was cleared too.
    vi.advanceTimersByTime(20000)
    expect(flyCameraAround).not.toHaveBeenCalled()
  })

  /* Grabbing the map after a flight has already finished must not call
     `stopCameraAnimation` — that is Google's own keyboard/drag panning
     being killed a fraction of the way through, which is what "panning
     moves a tiny bit and stops" was. */
  it('leaves the camera alone on input once the flight is over', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    // Fly-in settles, orbit runs, orbit ends.
    vi.advanceTimersByTime(2000 + 400 + 12000 + 400)
    stopCameraAnimation.mockClear()

    const [, handler] = map3dEl.addEventListener.mock.calls.find(([type]) => type === 'keydown')!
    ;(handler as () => void)()
    ;(handler as () => void)()

    expect(stopCameraAnimation).not.toHaveBeenCalled()
  })

  /* The other half: input *before* the flight's end-of-flight assert fires
     must cancel that assert, or the camera snaps back to a frame the user
     has already moved away from. */
  it('cancels the pending end-of-flight assert once the user takes the camera', async () => {
    render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()

    const [, handler] = map3dEl.addEventListener.mock.calls.find(([type]) => type === 'pointerdown')!
    ;(handler as () => void)()
    map3dEl.tilt = 12

    vi.advanceTimersByTime(2000 + 400)

    expect(map3dEl.tilt).toBe(12)
  })

  it('turning 3D off mid-flight cancels it before reading the camera back into 2D', async () => {
    const { rerender } = render(<Map3DSurface on={true} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)
    await settleFraming()
    expect(flyCameraTo).toHaveBeenCalledTimes(1)

    rerender(<Map3DSurface on={false} mode={'SATELLITE' as never} flyover={{ token: 1, points }} />)

    expect(stopCameraAnimation).toHaveBeenCalled()
  })
})
