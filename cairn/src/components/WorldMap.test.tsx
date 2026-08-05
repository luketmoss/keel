import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripIndexEntry } from '../store/tripStore'
import { DEFAULT_TRIP_FILTERS, type TripFilters } from '../store/tripFilters'

const { fitTracksToBounds, zoomToFitCluster } = vi.hoisted(() => ({
  fitTracksToBounds: vi.fn(),
  zoomToFitCluster: vi.fn(),
}))
vi.mock('../map/fitBounds', () => ({ fitTracksToBounds, zoomToFitCluster }))

const fakeMap = {
  id: 'fake-map',
  getZoom: () => 2,
  getCenter: () => ({ toJSON: () => ({ lat: 12, lng: 34 }) }),
}
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  AdvancedMarker: ({
    position,
    onClick,
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    children?: React.ReactNode
  }) => (
    <div data-testid="advanced-marker" data-lat={position.lat} data-lng={position.lng} onClick={onClick}>
      {children}
    </div>
  ),
  useMap: () => fakeMap,
}))

// Captures every 'idle' listener PlaceLayer registers, so a test can fire one
// by hand to simulate the map settling — the real trigger for #79's camera
// snapshot, which nothing here drives through a genuine Google Maps instance.
let idleListeners: (() => void)[] = []

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: (_target: unknown, eventName: string, callback: () => void) => {
        if (eventName === 'idle') idleListeners.push(callback)
        return { remove: () => {} }
      },
      addListenerOnce: () => {},
    },
  },
}

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 'trip-1',
    name: 'Hokkaido',
    status: 'completed',
    startDate: null,
    endDate: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    origin: { lat: 37, lng: -122 },
    ...overrides,
  }
}

function TripDetailStub() {
  const { id } = useParams()
  return <div>Trip detail for {id}</div>
}

type WorldMapComponent = typeof import('./WorldMap').WorldMap

/** `WorldMap` is a controlled component (#80) — filters and the hovered
    trip id live in whatever mounts it (`App.tsx`, in production). This
    harness plays that role for the suite: real `useState`, not a stub, so
    a click actually round-trips through `onFiltersChange`/`onHoverTrip`
    the same way the real parent does. */
function TestWorldMap({
  WorldMapComponent,
  trips,
  hideStatusPills,
  initialHoveredTripId = null,
  disconnected,
}: {
  WorldMapComponent: WorldMapComponent
  trips: TripIndexEntry[]
  hideStatusPills?: boolean
  initialHoveredTripId?: string | null
  disconnected?: boolean
}) {
  const [filters, setFilters] = useState<TripFilters>(DEFAULT_TRIP_FILTERS)
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(initialHoveredTripId)
  return (
    <WorldMapComponent
      trips={trips}
      filters={filters}
      onFiltersChange={setFilters}
      hideStatusPills={hideStatusPills}
      hoveredTripId={hoveredTripId}
      onHoverTrip={setHoveredTripId}
      disconnected={disconnected}
    />
  )
}

async function renderWorldMap(
  trips: TripIndexEntry[],
  key: string,
  options: { hideStatusPills?: boolean; initialHoveredTripId?: string | null; disconnected?: boolean } = {},
) {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', key)
  vi.resetModules()
  const { WorldMap } = await import('./WorldMap')
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <TestWorldMap
              WorldMapComponent={WorldMap}
              trips={trips}
              hideStatusPills={options.hideStatusPills}
              initialHoveredTripId={options.initialHoveredTripId}
              disconnected={options.disconnected}
            />
          }
        />
        <Route path="/trips/:id" element={<TripDetailStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

function dots(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.world-map__dot'))
}

afterEach(() => {
  vi.unstubAllEnvs()
  fitTracksToBounds.mockClear()
  zoomToFitCluster.mockClear()
  idleListeners = []
})

describe('WorldMap', () => {
  it('renders one dot per trip with an origin, filled for completed and hollow for planned', async () => {
    const trips = [
      tripEntry({ id: 'a', status: 'completed', origin: { lat: 37, lng: -122 } }),
      tripEntry({ id: 'b', status: 'planned', origin: { lat: 60, lng: 100 } }),
    ]

    const { container } = await renderWorldMap(trips, 'a-browser-key')

    expect(dots(container)).toHaveLength(2)
    expect(container.querySelector('.world-map__dot--completed')).not.toBeNull()
    expect(container.querySelector('.world-map__dot--planned')).not.toBeNull()
  })

  it('excludes a trip with no origin from the map without blocking the others', async () => {
    const trips = [
      tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } }),
      tripEntry({ id: 'b', name: 'No geometry yet', origin: null }),
    ]

    const { container } = await renderWorldMap(trips, 'a-browser-key')

    expect(dots(container)).toHaveLength(1)
  })

  it('fits bounds once on load to the union of all places', async () => {
    const trips = [
      tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } }),
      tripEntry({ id: 'b', status: 'planned', origin: { lat: -33, lng: 151 } }),
    ]

    await renderWorldMap(trips, 'a-browser-key')

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      fakeMap,
      expect.arrayContaining([
        expect.objectContaining({ lat: 37, lng: -122 }),
        expect.objectContaining({ lat: -33, lng: 151 }),
      ]),
    )
  })

  it('does not re-fit on remount once the camera has settled, restoring it instead (#79 camera persistence)', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
    vi.resetModules()
    const { WorldMap } = await import('./WorldMap')
    const trips = [tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } })]

    function renderAt() {
      return render(
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<TestWorldMap WorldMapComponent={WorldMap} trips={trips} />} />
          </Routes>
        </MemoryRouter>,
      )
    }

    const first = renderAt()
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)

    // The map settling (a pan, a zoom, or simply the initial fit finishing)
    // is what records the camera — simulated here since nothing drives a
    // real Google Maps 'idle' event through the mock.
    idleListeners.forEach((listener) => listener())
    first.unmount()
    fitTracksToBounds.mockClear()

    // A second mount of the *same* module — i.e. navigating back to `/`
    // within the same session, not a fresh page load — restores the
    // recorded camera via `defaultCenter`/`defaultZoom` instead of fitting
    // again.
    renderAt()
    expect(fitTracksToBounds).not.toHaveBeenCalled()
  })

  it('hovering a dot shows the trip name as a label', async () => {
    const trips = [tripEntry({ id: 'a', name: 'Kepler Track', origin: { lat: 37, lng: -122 } })]

    await renderWorldMap(trips, 'a-browser-key')

    expect(screen.getByText('Kepler Track')).toBeDefined()
  })

  it('activating a dot opens that trip detail view', async () => {
    const trips = [tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } })]

    const { container } = await renderWorldMap(trips, 'a-browser-key')
    fireEvent.click(container.querySelector('.world-map__dot')!)

    expect(await screen.findByText('Trip detail for a')).toBeDefined()
  })

  it('clusters dots whose footprints overlap, showing the member count', async () => {
    // Same coordinate, world zoom (2) — well within the clustering
    // footprint regardless of exact pixel math.
    const trips = [
      tripEntry({ id: 'a', origin: { lat: 10, lng: 10 } }),
      tripEntry({ id: 'b', origin: { lat: 10.0001, lng: 10.0001 } }),
    ]

    const { container } = await renderWorldMap(trips, 'a-browser-key')

    expect(dots(container)).toHaveLength(0)
    const cluster = container.querySelector('.world-map__cluster')
    expect(cluster).not.toBeNull()
    expect(cluster?.textContent).toBe('2')
  })

  it('activating a cluster zooms the map to fit its members', async () => {
    const trips = [
      tripEntry({ id: 'a', origin: { lat: 10, lng: 10 } }),
      tripEntry({ id: 'b', origin: { lat: 10.0001, lng: 10.0001 } }),
    ]

    const { container } = await renderWorldMap(trips, 'a-browser-key')
    fireEvent.click(container.querySelector('.world-map__cluster')!)

    expect(zoomToFitCluster).toHaveBeenCalledTimes(1)
  })

  it('filters dots by status and re-fits on the new visible set', async () => {
    const trips = [
      tripEntry({ id: 'a', status: 'completed', origin: { lat: 37, lng: -122 } }),
      tripEntry({ id: 'b', status: 'planned', origin: { lat: -33, lng: 151 } }),
    ]

    const { container } = await renderWorldMap(trips, 'a-browser-key')
    fitTracksToBounds.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

    expect(dots(container)).toHaveLength(1)
    expect(container.querySelector('.world-map__dot--planned')).not.toBeNull()
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
  })

  describe('#80 status pills hidden while the trips panel owns them', () => {
    it('does not render its own status pills when hideStatusPills is set', async () => {
      const trips = [tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } })]

      const { container } = await renderWorldMap(trips, 'a-browser-key', { hideStatusPills: true })

      expect(container.querySelector('.world-map__filter')).toBeNull()
    })

    it('still renders the date-range control when status pills are hidden', async () => {
      const trips = [
        tripEntry({ id: 'a', startDate: '2020-01-01', origin: { lat: 37, lng: -122 } }),
        tripEntry({ id: 'b', startDate: '2026-01-01', origin: { lat: -33, lng: 151 } }),
      ]

      const { container } = await renderWorldMap(trips, 'a-browser-key', { hideStatusPills: true })

      expect(container.querySelector('.world-map__date-range')).not.toBeNull()
    })
  })

  describe('#80 row/dot hover emphasis', () => {
    it('applies the emphasized state to the dot matching hoveredTripId, without a pointer hovering it', async () => {
      const trips = [tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } })]

      const { container } = await renderWorldMap(trips, 'a-browser-key', { initialHoveredTripId: 'a' })

      expect(container.querySelector('.world-map__dot-hit--emphasized')).not.toBeNull()
    })

    it('hovering a dot reports its trip id back through onHoverTrip', async () => {
      const trips = [tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } })]

      const { container } = await renderWorldMap(trips, 'a-browser-key')
      const hit = container.querySelector('.world-map__dot-hit') as HTMLElement

      fireEvent.mouseEnter(hit)
      expect(container.querySelector('.world-map__dot-hit--emphasized')).not.toBeNull()

      fireEvent.mouseLeave(hit)
      expect(container.querySelector('.world-map__dot-hit--emphasized')).toBeNull()
    })
  })

  describe('date range filtering', () => {
    it('excludes a dated trip outside the selected range, and keeps an undated one visible regardless', async () => {
      const trips = [
        tripEntry({ id: 'early', startDate: '2020-01-01', origin: { lat: 10, lng: 10 } }),
        tripEntry({ id: 'late', startDate: '2026-01-01', origin: { lat: 20, lng: 20 } }),
        tripEntry({ id: 'undated', startDate: null, createdAt: '2023-06-01T00:00:00.000Z', origin: { lat: 30, lng: 30 } }),
      ]

      const { container } = await renderWorldMap(trips, 'a-browser-key')
      expect(dots(container)).toHaveLength(3)

      const startHandle = screen.getByRole('slider', { name: 'Range start' }) as HTMLInputElement
      // Narrow the range to exclude "early" — moving the start handle
      // forward past its date.
      fireEvent.change(startHandle, { target: { value: String(Number(startHandle.max) - 1) } })

      expect(dots(container)).toHaveLength(2)
      expect(container.querySelector('[data-lat="10"]')).toBeNull()
      expect(container.querySelector('[data-lat="30"]')).not.toBeNull()
    })
  })

  describe('empty states', () => {
    it('shows "No places yet", with no filter controls, when there are no trips', async () => {
      const { container } = await renderWorldMap([], 'a-browser-key')

      expect(screen.getByText('No places yet')).toBeDefined()
      expect(container.querySelector('.world-map__filter')).toBeNull()
    })

    it('shows the same empty state when trips exist but none have geometry', async () => {
      const trips = [tripEntry({ origin: null })]
      const { container } = await renderWorldMap(trips, 'a-browser-key')

      expect(screen.getByText('No places yet')).toBeDefined()
      expect(container.querySelector('.world-map__filter')).toBeNull()
    })

    // #95: `disconnected` only ever accompanies an empty `trips` array in
    // production (the caller withholds it), so this exercises exactly that
    // combination rather than one the real app never produces.
    it('shows a sign-in prompt instead of "No places yet" while disconnected', async () => {
      await renderWorldMap([], 'a-browser-key', { disconnected: true })

      expect(screen.getByText('Sign in to see your trips.')).toBeDefined()
      expect(screen.queryByText('No places yet')).toBeNull()
    })

    it('shows the filtered-empty state, with the filter row still visible, when a filter excludes everything', async () => {
      const trips = [tripEntry({ id: 'a', status: 'completed', origin: { lat: 37, lng: -122 } })]

      await renderWorldMap(trips, 'a-browser-key')
      fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

      expect(screen.getByText('Nothing in this range')).toBeDefined()
      expect(screen.getByRole('button', { name: 'All' })).toBeDefined()
    })
  })

  it('renders the setup panel when no key is configured', async () => {
    await renderWorldMap([], '')

    expect(screen.getByText('Map unavailable')).toBeDefined()
    expect(screen.queryByTestId('map')).toBeNull()
  })
})
