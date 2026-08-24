import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUSTER_MAX_ZOOM } from './fitBounds'
import { columnInset, revealPoint, revealPoints } from './reveal'

/* cairn/docs/design/270-selecting-reveals-it-on-the-map.md — "The reveal
   rule". Tested against a fake map exposing exactly what `revealPoints`
   reads (`getBounds`, `getDiv`, `panTo`, `setCenter`) rather than a real
   Google Maps instance, the same style `fitBounds.test.ts` already uses. */

const { fitTracksToBounds } = vi.hoisted(() => ({ fitTracksToBounds: vi.fn() }))
vi.mock('./fitBounds', async () => {
  const actual = await vi.importActual<typeof import('./fitBounds')>('./fitBounds')
  return { ...actual, fitTracksToBounds }
})

function stubReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia
}

const VIEWPORT = { north: 10, south: -10, west: -10, east: 10 }

function fakeMap({
  width = 1000,
  height = 1000,
  bounds = VIEWPORT,
  zoom = 10,
}: { width?: number; height?: number; bounds?: typeof VIEWPORT | null; zoom?: number } = {}) {
  return {
    getBounds: vi.fn(() =>
      bounds === null
        ? null
        : {
            getNorthEast: () => ({ lat: () => bounds.north, lng: () => bounds.east }),
            getSouthWest: () => ({ lat: () => bounds.south, lng: () => bounds.west }),
          },
    ),
    getDiv: vi.fn(() => ({ clientWidth: width, clientHeight: height })),
    getZoom: vi.fn(() => zoom),
    panTo: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
  }
}

describe('columnInset', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--space-4', '16px')
    document.documentElement.style.setProperty('--panel-width', '380px')
    document.documentElement.style.setProperty('--sheet-current', '250px')
  })
  afterEach(() => {
    document.documentElement.style.removeProperty('--space-4')
    document.documentElement.style.removeProperty('--panel-width')
    document.documentElement.style.removeProperty('--sheet-current')
  })

  it('desktop: the column inset, left edge only', () => {
    expect(columnInset(false)).toEqual({ left: 412, right: 0, top: 0, bottom: 0 })
  })

  it('phone: the sheet inset, bottom edge only', () => {
    expect(columnInset(true)).toEqual({ left: 0, right: 0, top: 0, bottom: 250 })
  })
})

describe('revealPoints', () => {
  const NO_INSET = { left: 0, right: 0, top: 0, bottom: 0 }

  beforeEach(() => {
    fitTracksToBounds.mockClear()
  })
  afterEach(() => {
    // @ts-expect-error -- removing the stub installed per-test
    delete window.matchMedia
  })

  it('does nothing with no points', () => {
    const map = fakeMap()
    revealPoints(map as unknown as google.maps.Map, [], NO_INSET)
    expect(map.panTo).not.toHaveBeenCalled()
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('does nothing before the map has ever reported a viewport', () => {
    const map = fakeMap({ bounds: null })
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: 0 }], NO_INSET)
    expect(map.panTo).not.toHaveBeenCalled()
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('does nothing when the item is already inside the visible area', () => {
    const map = fakeMap()
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: 0 }], NO_INSET)
    expect(map.panTo).not.toHaveBeenCalled()
    expect(map.setCenter).not.toHaveBeenCalled()
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('pans to centre an item that would fit after a pan, keeping the current zoom', () => {
    const map = fakeMap()
    // lng -8 projects to pixel x=100 in a 1000-wide map over this viewport —
    // left of a visible area inset 200px (visibleLeft = 248) on the left.
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: -8 }], { ...NO_INSET, left: 200 })
    expect(map.panTo).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('never takes the zoom for a single point — the pan branch always applies', () => {
    const map = fakeMap()
    // Insets that leave only a 4px sliver of visible area on each axis — a
    // single point's own zero-size bounds still fit inside it, so even a
    // point nowhere near that sliver still pans rather than fits.
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: 0 }], { left: 900, right: 0, top: 900, bottom: 0 })
    expect(map.panTo).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('fits bounds, with the inset folded into the padding, when the item cannot fit at the current zoom', () => {
    const map = fakeMap()
    const points = [{ lat: 9, lng: -9 }, { lat: -9, lng: 9 }]
    revealPoints(map as unknown as google.maps.Map, points, { left: 400, right: 0, top: 0, bottom: 0 })
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      map,
      points,
      expect.objectContaining({ left: 448 }),
    )
    expect(map.panTo).not.toHaveBeenCalled()
  })

  it('jumps instead of gliding under prefers-reduced-motion', () => {
    stubReducedMotion(true)
    const map = fakeMap()
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: -8 }], { ...NO_INSET, left: 200 })
    expect(map.setCenter).toHaveBeenCalledTimes(1)
    expect(map.panTo).not.toHaveBeenCalled()
  })

  it('fits when there is no visible rect left between opposing insets', () => {
    const map = fakeMap({ width: 100, height: 100 })
    revealPoints(map as unknown as google.maps.Map, [{ lat: 0, lng: 0 }], { left: 60, right: 60, top: 0, bottom: 0 })
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
  })
})

/* cairn/docs/design/302-revealing-a-cairn-closes-in.md — a cairn's own
   reveal: unlike `revealPoints`, it always centres the point and closes the
   zoom in to `CLUSTER_MAX_ZOOM`, never past it and never back out. */
describe('revealPoint', () => {
  const NO_INSET = { left: 0, right: 0, top: 0, bottom: 0 }

  afterEach(() => {
    // @ts-expect-error -- removing the stub installed per-test
    delete window.matchMedia
  })

  it('does nothing before the map has ever reported a viewport', () => {
    const map = fakeMap({ bounds: null })
    revealPoint(map as unknown as google.maps.Map, { lat: 0, lng: 0 }, NO_INSET)
    expect(map.panTo).not.toHaveBeenCalled()
    expect(map.setZoom).not.toHaveBeenCalled()
  })

  it('from a wide view, centres the cairn and closes in to the cluster cap', () => {
    const map = fakeMap({ zoom: 4 })
    revealPoint(map as unknown as google.maps.Map, { lat: 0, lng: 0 }, NO_INSET)
    expect(map.panTo).toHaveBeenCalledTimes(1)
    expect(map.setZoom).toHaveBeenCalledWith(CLUSTER_MAX_ZOOM)
  })

  it('moves the camera to the cairn even when it is already inside the visible area, because arrival is the point', () => {
    const map = fakeMap({ zoom: 4 })
    // Centre of the viewport at NO_INSET is already inside the visible area.
    revealPoint(map as unknown as google.maps.Map, { lat: 0, lng: 0 }, NO_INSET)
    expect(map.panTo).toHaveBeenCalledTimes(1)
  })

  it('never zooms back out when the map is already closer than the cluster cap', () => {
    const map = fakeMap({ zoom: CLUSTER_MAX_ZOOM + 3 })
    revealPoint(map as unknown as google.maps.Map, { lat: 0, lng: -8 }, { ...NO_INSET, left: 200 })
    expect(map.setZoom).toHaveBeenCalledWith(CLUSTER_MAX_ZOOM + 3)
  })

  it('jumps instead of gliding under prefers-reduced-motion', () => {
    stubReducedMotion(true)
    const map = fakeMap({ zoom: 4 })
    revealPoint(map as unknown as google.maps.Map, { lat: 0, lng: -8 }, { ...NO_INSET, left: 200 })
    expect(map.setCenter).toHaveBeenCalledTimes(1)
    expect(map.panTo).not.toHaveBeenCalled()
    expect(map.setZoom).toHaveBeenCalledWith(CLUSTER_MAX_ZOOM)
  })
})
