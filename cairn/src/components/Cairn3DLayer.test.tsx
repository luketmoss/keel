import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PositionedCairn } from './CairnLayer'
import { clearCairnOcclusionCache } from '../map/cairnOcclusion'

/* jsdom implements no `PointerEvent`, the same gap `BottomSheet.test.tsx`
   and `CairnCreateGesture.test.tsx` already work around. */
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent
}

/** #293 — models the one piece of real `<gmp-map-3d>` behaviour this whole
    bug turned on: `GestureHandling.GREEDY` runs its own listener over the
    surface and, if a marker's `pointerdown` reaches it unstopped, claims
    the pointer for a possible pan or orbit. A captured pointer's later
    events are retargeted to the capturing element, not the child the
    gesture started on — which is exactly why the marker's own `click`
    never arrived. Modelled with real DOM propagation rather than a spy:
    a bubble-phase listener on `document.body` (the marker's real parent,
    since `map3d.append` below is `document.body.appendChild`) records
    which pointer got past the marker unstopped, and a capture-phase
    listener intercepts that pointer's `pointerup` before it can reach the
    marker at all — reproducing "the surface captured it, so the marker
    never sees the release" without a browser. A component that stops
    propagation on `pointerdown`, as the fix must, never reaches the first
    listener, and its own `pointerup` handler runs normally. */
let surfaceCapturedPointerId: number | null = null
document.body.addEventListener('pointerdown', (event) => {
  surfaceCapturedPointerId = (event as PointerEvent).pointerId
})
document.body.addEventListener(
  'pointerup',
  (event) => {
    if (surfaceCapturedPointerId !== null && (event as PointerEvent).pointerId === surfaceCapturedPointerId) {
      event.stopPropagation()
    }
  },
  true,
)

/* Same imperative-lifecycle stubbing strategy as Track3DLayer.test.tsx, with
   one addition: a `MarkerElement` hosts arbitrary HTML (unlike
   `Polyline3DElement`, which draws nothing React portals into), so the fake
   here is a real `<div>` wearing the extra properties the component sets on
   it — a constructor that returns an object override `this`, which is legal
   JS and lets `new MarkerElement(options)` yield an element `createPortal`
   can actually render into and tests can actually query. */
const { map3dResult, maps3dLibResult, readyLib, removeSpy, steadyHandler, samplerResult } = vi.hoisted(() => {
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

  const map3dResult = {
    current: {
      append: (marker: HTMLElement) => {
        document.body.appendChild(marker)
      },
      cameraPosition: { lat: 0, lng: 0, altitude: 3000 },
      // #285 — the occlusion hook listens for this. Captured so a test can
      // fire it directly, the same way a real camera settling would.
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (type === 'gmp-steadychange') steadyHandler.current = listener
      },
      removeEventListener: (type: string) => {
        if (type === 'gmp-steadychange') steadyHandler.current = null
      },
    } as unknown,
  }
  const readyLib = {
    MarkerElement: FakeMarkerElement,
    AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  }
  const maps3dLibResult = { current: readyLib as unknown }

  return { map3dResult, maps3dLibResult, readyLib, removeSpy, steadyHandler, samplerResult }
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
    document.body.innerHTML = ''
    maps3dLibResult.current = readyLib
    steadyHandler.current = null
    samplerResult.current = null
    surfaceCapturedPointerId = null
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
     `click`: `<gmp-map-3d>` swallows the click before it ever fires. The
     fake `MarkerElement`'s surface-capture simulation above is what makes
     this test fail for the real reason if the reconstruction (in
     particular `pointerdown`'s `stopPropagation`) is ever removed — see
     that comment. */
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
    // Released off the marker entirely — the map surface, not the pin.
    fireEvent.pointerUp(document.body, { pointerId: 1, clientX: 0, clientY: 0 })

    expect(onSelectCairn).not.toHaveBeenCalled()
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
    document.body.innerHTML = ''
    maps3dLibResult.current = readyLib
    steadyHandler.current = null
    samplerResult.current = null
    surfaceCapturedPointerId = null
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
