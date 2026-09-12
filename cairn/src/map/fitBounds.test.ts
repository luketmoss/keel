import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fitTracksToBounds, zoomToFitCluster } from './fitBounds'

interface FakeLatLng {
  lat: number
  lng: number
}

class FakeLatLngBounds {
  private points: FakeLatLng[] = []

  extend(point: FakeLatLng) {
    this.points.push(point)
  }

  getNorthEast() {
    return {
      equals: (other: ReturnType<FakeLatLngBounds['getSouthWest']>) =>
        this.points.every((p) => p.lat === other.lat && p.lng === other.lng),
    }
  }

  getSouthWest() {
    return this.points[0]
  }

  getCenter() {
    return this.points[0]
  }
}

function installFakeGoogleMaps() {
  const addListenerOnce = vi.fn()
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      LatLngBounds: FakeLatLngBounds,
      event: { addListenerOnce },
    },
  }
  return { addListenerOnce }
}

function fakeMap() {
  return {
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    getZoom: vi.fn(() => 10),
    fitBounds: vi.fn(),
  }
}

describe('fitTracksToBounds', () => {
  beforeEach(() => {
    installFakeGoogleMaps()
  })

  /* #335 — the locate fit stops one step closer in than a track fit. The
     parameter is the whole reason `LOCATE_MAX_ZOOM` does not need a third
     near-copy of this function beside `zoomToFitCluster`. */
  it('caps a degenerate box at the given maxZoom rather than the default', () => {
    const map = fakeMap()

    fitTracksToBounds(map as unknown as google.maps.Map, [{ lat: 1, lng: 2 }], 48, 17)

    expect(map.setZoom).toHaveBeenCalledWith(17)
  })

  it('defaults to the track cap when no maxZoom is given', () => {
    const map = fakeMap()

    fitTracksToBounds(map as unknown as google.maps.Map, [{ lat: 1, lng: 2 }])

    expect(map.setZoom).toHaveBeenCalledWith(16)
  })

  it('clamps a multi-point fit back to the given maxZoom once it settles', () => {
    const { addListenerOnce } = installFakeGoogleMaps()
    const map = fakeMap()
    map.getZoom.mockReturnValue(20)

    fitTracksToBounds(
      map as unknown as google.maps.Map,
      [
        { lat: 1, lng: 2 },
        { lat: 3, lng: 4 },
      ],
      48,
      17,
    )
    // The clamp runs on the map's own `idle`, not synchronously.
    addListenerOnce.mock.calls[0][2]()

    expect(map.setZoom).toHaveBeenCalledWith(17)
  })

  it('does nothing when there are no points', () => {
    const map = fakeMap()

    fitTracksToBounds(map as unknown as google.maps.Map, [])

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setCenter).not.toHaveBeenCalled()
  })

  it('centers and caps the zoom for a single point rather than calling fitBounds', () => {
    const map = fakeMap()

    fitTracksToBounds(map as unknown as google.maps.Map, [{ lat: 37, lng: -122 }])

    expect(map.setCenter).toHaveBeenCalledWith({ lat: 37, lng: -122 })
    expect(map.setZoom).toHaveBeenCalledWith(16)
    expect(map.fitBounds).not.toHaveBeenCalled()
  })

  it('fits the bounds of several points with padding', () => {
    const map = fakeMap()
    const points = [
      { lat: 37, lng: -122 },
      { lat: 38, lng: -121 },
    ]

    fitTracksToBounds(map as unknown as google.maps.Map, points)

    expect(map.fitBounds).toHaveBeenCalledWith(expect.any(FakeLatLngBounds), 48)
  })

  it('caps the zoom after the fit settles, once it exceeds the maximum', () => {
    const map = fakeMap()
    map.getZoom.mockReturnValue(19)
    const { addListenerOnce } = installFakeGoogleMaps()

    fitTracksToBounds(map as unknown as google.maps.Map, [
      { lat: 37, lng: -122 },
      { lat: 38, lng: -121 },
    ])

    expect(addListenerOnce).toHaveBeenCalledWith(map, 'idle', expect.any(Function))
    const idleCallback = addListenerOnce.mock.calls[0][2]
    idleCallback()
    expect(map.setZoom).toHaveBeenCalledWith(16)
  })

  it('does not touch zoom on idle when the fit already landed within the cap', () => {
    const map = fakeMap()
    map.getZoom.mockReturnValue(12)
    const { addListenerOnce } = installFakeGoogleMaps()

    fitTracksToBounds(map as unknown as google.maps.Map, [
      { lat: 37, lng: -122 },
      { lat: 38, lng: -121 },
    ])

    const idleCallback = addListenerOnce.mock.calls[0][2]
    idleCallback()
    expect(map.setZoom).not.toHaveBeenCalled()
  })
})

describe('zoomToFitCluster', () => {
  beforeEach(() => {
    installFakeGoogleMaps()
  })

  it('does nothing for an empty member list', () => {
    const map = fakeMap()

    zoomToFitCluster(map as unknown as google.maps.Map, [])

    expect(map.fitBounds).not.toHaveBeenCalled()
  })

  it('fits the bounds of the cluster members with padding', () => {
    const map = fakeMap()
    const points = [
      { lat: 10, lng: 20 },
      { lat: 10.001, lng: 20.001 },
    ]

    zoomToFitCluster(map as unknown as google.maps.Map, points)

    expect(map.fitBounds).toHaveBeenCalledWith(expect.any(FakeLatLngBounds), 48)
  })

  it('does nothing for two identical coordinates — a cluster that can never separate (edge case)', () => {
    const map = fakeMap()

    zoomToFitCluster(map as unknown as google.maps.Map, [
      { lat: 10, lng: 20 },
      { lat: 10, lng: 20 },
    ])

    expect(map.fitBounds).not.toHaveBeenCalled()
    expect(map.setZoom).not.toHaveBeenCalled()
  })

  it('caps the zoom once the fit settles beyond the cluster maximum', () => {
    const map = fakeMap()
    map.getZoom.mockReturnValue(21)
    const { addListenerOnce } = installFakeGoogleMaps()

    zoomToFitCluster(map as unknown as google.maps.Map, [
      { lat: 10, lng: 20 },
      { lat: 10.001, lng: 20.001 },
    ])

    const idleCallback = addListenerOnce.mock.calls[0][2]
    idleCallback()
    expect(map.setZoom).toHaveBeenCalledWith(20)
  })
})
