import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PositionedCairn } from './CairnLayer'
import { clearCairnOcclusionCache } from '../map/cairnOcclusion'

/* jsdom implements no `PointerEvent`, the same gap `BottomSheet.test.tsx`
   and `CairnCreateGesture.test.tsx` already work around. */
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent
}

/* Same imperative-lifecycle stubbing strategy as Track3DLayer.test.tsx, with
   one addition: a `MarkerElement` hosts arbitrary HTML (unlike
   `Polyline3DElement`, which draws nothing React portals into), so the fake
   here is a real `<div>` wearing the extra properties the component sets on
   it — a constructor that returns an object override `this`, which is legal
   JS and lets `new MarkerElement(options)` yield an element `createPortal`
   can actually render into and tests can actually query. */
const { map3dResult, map3dElement, maps3dLibResult, readyLib, removeSpy, steadyHandler, samplerResult } =
  vi.hoisted(() => {
    const removeSpy = vi.fn()
    const steadyHandler: { current: ((event: Event) => void) | null } = { current: null }
    const samplerResult: { current: unknown } = { current: null }

    class FakeMarkerElement {
      constructor(options: Record<string, unknown>) {
        const el = document.createElement('div')
        el.dataset.fakeMarker = 'true'
        Object.assign(el, options)
        const nativeRemove = el.remove.bind(el)
        el.remove = () => {
          removeSpy(el)
          nativeRemove()
        }
        return el as unknown as FakeMarkerElement
      }
    }

    /* #305 — `Cairn3DLayer` now attaches its own capture-phase pointer
       listeners directly onto the `<gmp-map-3d>` element `useMap3D` returns,
       to intercept a marker press before the map's own gesture handling can
       claim it. For that interception to be provable at all — not just
       trusted — the fake map here has to be a real DOM element the markers
       are real descendants of, so jsdom's own capture/bubble propagation
       does the work, the same way it would in a browser against the real
       `<gmp-map-3d>`. A plain mock object with a spied `addEventListener`
       could not tell a real stop from a no-op one. `gmp-steadychange` (#285)
       is the one event type the fake still intercepts itself, rather than
       relying on native dispatch, since nothing in these tests fires a real
       `Event` for it — a test calls `steadyHandler.current?.(...)` directly. */
    const map3dElement = document.createElement('div')
    document.body.appendChild(map3dElement)
    const nativeAddEventListener = map3dElement.addEventListener.bind(map3dElement)
    const nativeRemoveEventListener = map3dElement.removeEventListener.bind(map3dElement)
    const map3dResult = {
      current: Object.assign(map3dElement, {
        append: (marker: HTMLElement) => {
          map3dElement.appendChild(marker)
        },
        cameraPosition: { lat: 0, lng: 0, altitude: 3000 },
        addEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ) => {
          if (type === 'gmp-steadychange') {
            steadyHandler.current = listener as (event: Event) => void
            return
          }
          nativeAddEventListener(type, listener, options)
        },
        removeEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | EventListenerOptions,
        ) => {
          if (type === 'gmp-steadychange') {
            steadyHandler.current = null
            return
          }
          nativeRemoveEventListener(type, listener, options)
        },
      }) as unknown,
    }
    const readyLib = {
      MarkerElement: FakeMarkerElement,
      AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
    }
    const maps3dLibResult = { current: readyLib as unknown }

    return { map3dResult, map3dElement, maps3dLibResult, readyLib, removeSpy, steadyHandler, samplerResult }
  })

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap3D: () => map3dResult.current,
  useMapsLibrary: () => maps3dLibResult.current,
}))

// #285 — the occlusion hook builds its own `ElevationSampler` lazily via
// this factory. Stubbed per test so occlusion can be asserted without a
// real `google.maps.ElevationService`.
vi.mock('../geo/elevation', () => ({
  createGoogleElevationSampler: () => samplerResult.current,
}))

import { Cairn3DLayer } from './Cairn3DLayer'

const PIN: PositionedCairn = {
  id: 'cairn-1',
  name: 'Lookout',
  thumbnailDriveFileId: null,
  icon: null,
  latitude: 1,
  longitude: 2,
  source: 'placed',
}

const OTHER: PositionedCairn = {
  id: 'cairn-2',
  name: 'Camp',
  thumbnailDriveFileId: null,
  icon: null,
  latitude: 3,
  longitude: 4,
  source: 'placed',
}

describe('Cairn3DLayer (#273)', () => {
  beforeEach(() => {
    removeSpy.mockClear()
    // Clear the map surface's own children, not the whole body — `map3dElement`
    // itself must stay attached to the document for capture-phase propagation
    // to reach it on the next render.
    map3dElement.innerHTML = ''
    maps3dLibResult.current = readyLib
    steadyHandler.current = null
    samplerResult.current = null
    clearCairnOcclusionCache()
  })

  it('draws one MarkerElement per cairn, clamped to the ground, carrying its name', () => {
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    const markers = document.body.querySelectorAll('[data-fake-marker]')
    expect(markers).toHaveLength(1)
    const marker = markers[0] as unknown as { altitudeMode: string; title: string }
    expect(marker.altitudeMode).toBe('CLAMP_TO_GROUND')
    expect(marker.title).toBe('Lookout')
  })

  it('removes a marker whose cairn is no longer in the list', () => {
    const { rerender } = render(
      <Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />,
    )
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(1)

    rerender(<Cairn3DLayer cairns={[]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    expect(removeSpy).toHaveBeenCalled()
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(0)
  })

  /* #293 — the tap is reconstructed from `pointerdown`/`pointerup`, not
     `click`: `<gmp-map-3d>` swallows the click before it ever fires. #305
     moved the reconstruction from the marker's own React handlers to
     `Cairn3DLayer`'s native capture-phase listener on `map3dElement` — real
     DOM events fired on the real `marker` div, propagating up through the
     real `map3dElement` the fake `useMap3D` returns, are what makes this
     test (and the ones below) exercise the actual interception rather than
     a mocked stand-in for it. */
  it('portals CairnMarker in, and a tap selects then opens the cairn, in that order', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )
    const marker = screen.getByTestId('cairn-marker-3d')

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 100, clientY: 100 })

    expect(onSelectCairn).toHaveBeenCalledWith('cairn-1')
    expect(onOpenCairn).toHaveBeenCalledWith('cairn-1')
    const selectOrder = onSelectCairn.mock.invocationCallOrder[0]
    const openOrder = onOpenCairn.mock.invocationCallOrder[0]
    expect(selectOrder).toBeLessThan(openOrder)
  })

  it('does the same for pointerType: touch, the reported case', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )
    const marker = screen.getByTestId('cairn-marker-3d')

    fireEvent.pointerDown(marker, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 40 })
    fireEvent.pointerUp(marker, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 40 })

    expect(onSelectCairn).toHaveBeenCalledWith('cairn-1')
    expect(onOpenCairn).toHaveBeenCalledWith('cairn-1')
  })

  it('does not select when the lift travels past CAIRN3D_TAP_SLOP — a drag, not a tap', () => {
    const onSelectCairn = vi.fn()
    const onOpenCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={onSelectCairn}
        onOpenCairn={onOpenCairn}
      />,
    )
    const marker = screen.getByTestId('cairn-marker-3d')

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 30, clientY: 0 })

    expect(onSelectCairn).not.toHaveBeenCalled()
    expect(onOpenCairn).not.toHaveBeenCalled()
  })

  it('does not select on pointercancel, and the cancelled press does not linger', () => {
    const onSelectCairn = vi.fn()
    render(
      <Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={onSelectCairn} />,
    )
    const marker = screen.getByTestId('cairn-marker-3d')

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 0, clientY: 0 })
    fireEvent.pointerCancel(marker, { pointerId: 1 })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 0, clientY: 0 })

    expect(onSelectCairn).not.toHaveBeenCalled()
  })

  it('does not select a press that lands on the marker and lifts elsewhere', () => {
    const onSelectCairn = vi.fn()
    render(
      <Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={onSelectCairn} />,
    )
    const marker = screen.getByTestId('cairn-marker-3d')

    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 0, clientY: 0 })
    // Released off the marker entirely — the map surface itself, not the pin.
    fireEvent.pointerUp(map3dElement, { pointerId: 1, clientX: 0, clientY: 0 })

    expect(onSelectCairn).not.toHaveBeenCalled()
  })

  /* #305's actual bug: a press on a marker used to select the cairn *and*
     leave the map latched onto the pointer as a pan/orbit, because the stop
     that #293 wrote never reached the map before its own gesture handling
     had already claimed the press. `mapGestureSpy` stands in for that
     handling — a plain bubble-phase listener on `map3dElement`, the
     ancestor a real `<gmp-map-3d>`'s own greedy handler would sit behind.
     If the layer's capture-phase stop is doing its job, this spy never
     sees a press that started on a marker, whether it resolves as a tap or
     a drag; if the stop is removed, the event reaches it exactly the way
     it reached the real map before this fix. */
  it('stops a marker press from ever reaching the map surface, tap or drag alike', () => {
    const mapGestureSpy = vi.fn()
    map3dElement.addEventListener('pointerdown', mapGestureSpy)
    try {
      render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)
      const marker = screen.getByTestId('cairn-marker-3d')

      fireEvent.pointerDown(marker, { pointerId: 1, clientX: 0, clientY: 0 })
      expect(mapGestureSpy).not.toHaveBeenCalled()

      fireEvent.pointerUp(marker, { pointerId: 1, clientX: 50, clientY: 50 })
      fireEvent.pointerDown(marker, { pointerId: 2, clientX: 0, clientY: 0 })
      expect(mapGestureSpy).not.toHaveBeenCalled()
    } finally {
      map3dElement.removeEventListener('pointerdown', mapGestureSpy)
    }
  })

  /* The flip side: a press that never touches a marker is not this layer's
     business at all, and must reach the map surface exactly as it would
     without `Cairn3DLayer` mounted — acceptance criterion "pressing on
     empty map still pans and orbits the 3D camera normally". */
  it('leaves a press on empty map alone', () => {
    const mapGestureSpy = vi.fn()
    map3dElement.addEventListener('pointerdown', mapGestureSpy)
    try {
      render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)
      const empty = document.createElement('div')
      map3dElement.appendChild(empty)

      fireEvent.pointerDown(empty, { pointerId: 1, clientX: 0, clientY: 0 })

      expect(mapGestureSpy).toHaveBeenCalledTimes(1)
    } finally {
      map3dElement.removeEventListener('pointerdown', mapGestureSpy)
    }
  })

  it('writes hoveredCairnIds on pointerenter/pointerleave', () => {
    const onHoverCairn = vi.fn()
    render(
      <Cairn3DLayer
        cairns={[PIN]}
        accessToken={null}
        selectedCairnId={null}
        onSelectCairn={vi.fn()}
        onHoverCairn={onHoverCairn}
      />,
    )

    const hit = screen.getByTestId('cairn-marker-3d')
    fireEvent.pointerEnter(hit)
    expect(onHoverCairn).toHaveBeenLastCalledWith(new Set(['cairn-1']))

    fireEvent.pointerLeave(hit)
    expect(onHoverCairn).toHaveBeenLastCalledWith(new Set())
  })

  it('re-appends the selected marker so it is last in the surface child order', () => {
    const { rerender } = render(
      <Cairn3DLayer cairns={[PIN, OTHER]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />,
    )
    function lastMarker() {
      const markers = document.body.querySelectorAll('[data-fake-marker]')
      return markers[markers.length - 1] as unknown as { title: string }
    }
    expect(lastMarker().title).toBe('Camp')

    rerender(
      <Cairn3DLayer cairns={[PIN, OTHER]} accessToken={null} selectedCairnId="cairn-1" onSelectCairn={vi.fn()} />,
    )

    expect(lastMarker().title).toBe('Lookout')
  })

  it('renders nothing until the maps3d library is ready', () => {
    maps3dLibResult.current = null
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)
    expect(document.body.querySelectorAll('[data-fake-marker]')).toHaveLength(0)
  })
})

describe('Cairn3DLayer occlusion (#285)', () => {
  beforeEach(() => {
    removeSpy.mockClear()
    // Clear the map surface's own children, not the whole body — `map3dElement`
    // itself must stay attached to the document for capture-phase propagation
    // to reach it on the next render.
    map3dElement.innerHTML = ''
    maps3dLibResult.current = readyLib
    steadyHandler.current = null
    samplerResult.current = null
    clearCairnOcclusionCache()
  })

  it('draws every cairn before the camera has settled even once', () => {
    samplerResult.current = {
      sampleAlongPath: async () => ({ ok: true, samples: [{ lat: 0, lng: 0, elevationMeters: 0 }] }),
    }
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    expect(screen.getByTestId('cairn-marker-3d').className).not.toContain('cairn-layer__hit--occluded')
  })

  it('hides a cairn whose line of sight is blocked once the camera settles', async () => {
    samplerResult.current = {
      sampleAlongPath: async () => ({
        ok: true,
        samples: [
          { lat: 0, lng: 0, elevationMeters: 0 },
          { lat: 0, lng: 0, elevationMeters: 9000 },
          { lat: 0, lng: 0, elevationMeters: 0 },
        ],
      }),
    }
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    await act(async () => {
      steadyHandler.current?.({ isSteady: true } as unknown as Event)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('cairn-marker-3d').className).toContain('cairn-layer__hit--occluded')
  })

  it('never hides the selected cairn, even when terrain occludes it', async () => {
    samplerResult.current = {
      sampleAlongPath: async () => ({
        ok: true,
        samples: [
          { lat: 0, lng: 0, elevationMeters: 0 },
          { lat: 0, lng: 0, elevationMeters: 9000 },
          { lat: 0, lng: 0, elevationMeters: 0 },
        ],
      }),
    }
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId="cairn-1" onSelectCairn={vi.fn()} />)

    await act(async () => {
      steadyHandler.current?.({ isSteady: true } as unknown as Event)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId('cairn-marker-3d').className).not.toContain('cairn-layer__hit--occluded')
  })

  it('does not test occlusion while the camera is moving', async () => {
    const sampleAlongPath = vi.fn(async () => ({ ok: true, samples: [] }))
    samplerResult.current = { sampleAlongPath }
    render(<Cairn3DLayer cairns={[PIN]} accessToken={null} selectedCairnId={null} onSelectCairn={vi.fn()} />)

    await act(async () => {
      steadyHandler.current?.({ isSteady: false } as unknown as Event)
      await Promise.resolve()
    })

    expect(sampleAlongPath).not.toHaveBeenCalled()
  })
})
