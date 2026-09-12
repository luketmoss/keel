import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Same shape `Cairn3DLayer.test.tsx` uses, and for the same reason: a
   `MarkerElement` hosts arbitrary HTML, so the fake has to be a real
   element `createPortal` can render into. A constructor returning an object
   overrides `this`, which is legal JS. */
type FakeMarker = HTMLElement & { position: unknown; altitudeMode: unknown; remove: ReturnType<typeof vi.fn> }

class FakeMarkerElement {
  constructor(options: Record<string, unknown>) {
    const el = document.createElement('div') as unknown as FakeMarker
    Object.assign(el, options)
    const nativeRemove = el.remove.bind(el)
    el.remove = vi.fn(() => nativeRemove())
    created.push(el)
    return el as unknown as FakeMarkerElement
  }
}

const created: FakeMarker[] = []
const appended: unknown[] = []

const { map3dResult, maps3dResult } = vi.hoisted(() => ({
  map3dResult: { current: null as unknown },
  maps3dResult: { current: null as unknown },
}))
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap3D: () => map3dResult.current,
  useMapsLibrary: () => maps3dResult.current,
}))

import { Position3DMarker } from './Position3DMarker'
import type { PositionFix } from '../map/useGeolocation'

function fix(overrides: Partial<PositionFix> = {}): PositionFix {
  return { position: { lat: 39.5, lng: -105.5 }, accuracyMeters: 12, at: 1, ...overrides }
}

beforeEach(() => {
  created.length = 0
  appended.length = 0
  map3dResult.current = {
    append: (marker: unknown) => {
      appended.push(marker)
      // The real element hosts its marker in the document, which is what the
      // portal needs a live node to target.
      document.body.append(marker as Node)
    },
  }
  maps3dResult.current = {
    MarkerElement: FakeMarkerElement,
    AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  }
})

describe('Position3DMarker', () => {
  it('draws nothing until the 3D surface exists', () => {
    map3dResult.current = null

    render(<Position3DMarker fix={fix()} />)

    expect(created).toHaveLength(0)
  })

  it('draws nothing until the maps3d library has loaded', () => {
    maps3dResult.current = null

    render(<Position3DMarker fix={fix()} />)

    expect(created).toHaveLength(0)
  })

  it('clamps the dot to the ground, the same way cairns already are', () => {
    render(<Position3DMarker fix={fix()} />)

    expect(created).toHaveLength(1)
    expect(created[0].altitudeMode).toBe('CLAMP_TO_GROUND')
    expect(created[0].position).toEqual({ lat: 39.5, lng: -105.5, altitude: 0 })
    expect(appended).toEqual([created[0]])
  })

  it('portals the same dot markup the 2D marker draws', () => {
    render(<Position3DMarker fix={fix()} />)

    const host = created[0]
    expect(host.querySelector('.position-marker__dot')).not.toBeNull()
    expect(host.querySelector('.position-marker')?.getAttribute('aria-label')).toBe(
      'Your location, accurate to about 39 ft',
    )
  })

  it('replaces the marker when a fresh fix lands, rather than leaving two', () => {
    const { rerender } = render(<Position3DMarker fix={fix({ at: 1 })} />)
    rerender(<Position3DMarker fix={fix({ position: { lat: 1, lng: 2 }, at: 2 })} />)

    expect(created).toHaveLength(2)
    expect(created[0].remove).toHaveBeenCalled()
    expect(created[1].position).toEqual({ lat: 1, lng: 2, altitude: 0 })
  })

  it('takes its marker away on unmount', () => {
    const { unmount } = render(<Position3DMarker fix={fix()} />)

    unmount()

    expect(created[0].remove).toHaveBeenCalled()
  })
})
