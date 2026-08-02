import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import type { TripIndexEntry, TripRecord, TripStore } from '../store/tripStore'

const { fitTracksToBounds } = vi.hoisted(() => ({ fitTracksToBounds: vi.fn() }))
vi.mock('../map/fitBounds', () => ({ fitTracksToBounds }))

const fakeMap = { id: 'fake-map' }
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Polyline: (props: {
    strokeColor?: string
    strokeOpacity?: number
    onClick?: () => void
  }) => (
    <button
      type="button"
      data-testid="polyline"
      data-color={props.strokeColor}
      data-dashed={props.strokeOpacity === 0}
      onClick={props.onClick}
    />
  ),
  useMap: () => fakeMap,
}))

function line(coords: [number, number][]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
  }
}

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 'trip-1',
    name: 'Hokkaido',
    status: 'completed',
    startDate: null,
    endDate: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function fakeTripStore(overviews: Record<string, FeatureCollection<LineString> | null>): TripStore {
  return {
    getTrips: () => [],
    getTrip: (): TripRecord | null => null,
    createTrip: () => tripEntry(),
    updateTrip: (): TripRecord | null => null,
    deleteTrip: () => {},
    getOverview: (id: string) => overviews[id] ?? null,
    saveOverview: () => {},
    subscribe: () => () => {},
  }
}

function TripDetailStub() {
  const { id } = useParams()
  return <div>Trip detail for {id}</div>
}

async function renderWorldMap(trips: TripIndexEntry[], tripStore: TripStore, key: string) {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', key)
  vi.resetModules()
  const { WorldMap } = await import('./WorldMap')
  return render(
    <MemoryRouter initialEntries={['/world']}>
      <Routes>
        <Route path="/world" element={<WorldMap trips={trips} tripStore={tripStore} />} />
        <Route path="/trips/:id" element={<TripDetailStub />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  fitTracksToBounds.mockClear()
})

describe('WorldMap', () => {
  it('renders one polyline per route, styled by status', async () => {
    const trips = [
      tripEntry({ id: 'a', status: 'completed' }),
      tripEntry({ id: 'b', status: 'planned' }),
    ]
    const store = fakeTripStore({
      a: line([[-122, 37], [-121, 38]]),
      b: line([[-100, 40], [-99, 41]]),
    })

    const { container } = await renderWorldMap(trips, store, 'a-browser-key')

    const polylines = container.querySelectorAll('[data-testid="polyline"]')
    expect(polylines).toHaveLength(2)
    const dashed = Array.from(polylines).map((el) => el.getAttribute('data-dashed'))
    expect(dashed).toEqual(['false', 'true'])
  })

  it('fits bounds once on load to the union of all routes', async () => {
    const trips = [tripEntry({ id: 'a' }), tripEntry({ id: 'b', status: 'planned' })]
    const store = fakeTripStore({
      a: line([[-122, 37], [-121, 38]]),
      b: line([[-100, 40], [-99, 41]]),
    })

    await renderWorldMap(trips, store, 'a-browser-key')

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      fakeMap,
      expect.arrayContaining([
        { lat: 37, lng: -122 },
        { lat: 41, lng: -99 },
      ]),
    )
  })

  it('filters routes by status and re-fits bounds on the new visible set', async () => {
    const trips = [
      tripEntry({ id: 'a', status: 'completed' }),
      tripEntry({ id: 'b', status: 'planned' }),
    ]
    const store = fakeTripStore({
      a: line([[-122, 37], [-121, 38]]),
      b: line([[-100, 40], [-99, 41]]),
    })

    const { container } = await renderWorldMap(trips, store, 'a-browser-key')
    fitTracksToBounds.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

    expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(1)
    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
  })

  it('navigates to the trip detail page when a route is clicked', async () => {
    const trips = [tripEntry({ id: 'a' })]
    const store = fakeTripStore({ a: line([[-122, 37], [-121, 38]]) })

    const { container } = await renderWorldMap(trips, store, 'a-browser-key')
    fireEvent.click(container.querySelector('[data-testid="polyline"]')!)

    expect(await screen.findByText('Trip detail for a')).toBeDefined()
  })

  it('excludes a trip with no overview from the map without blocking the others', async () => {
    const trips = [tripEntry({ id: 'a' }), tripEntry({ id: 'b', name: 'No overview yet' })]
    const store = fakeTripStore({ a: line([[-122, 37], [-121, 38]]) })

    const { container } = await renderWorldMap(trips, store, 'a-browser-key')

    expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(1)
  })

  it('excludes a trip whose overview has no features, same as a missing one', async () => {
    const trips = [tripEntry({ id: 'a' })]
    const store = fakeTripStore({ a: { type: 'FeatureCollection', features: [] } })

    const { container } = await renderWorldMap(trips, store, 'a-browser-key')

    expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(0)
    expect(screen.getByText('No trips yet')).toBeDefined()
  })

  it('shows the "no trips yet" empty state, without a filter row, when there are no trips', async () => {
    const { container } = await renderWorldMap([], fakeTripStore({}), 'a-browser-key')

    expect(screen.getByText('No trips yet')).toBeDefined()
    expect(container.querySelector('.world-map__filter')).toBeNull()
  })

  it('shows the filtered empty state, with the filter row still visible, when a filter excludes everything', async () => {
    const trips = [tripEntry({ id: 'a', status: 'completed' })]
    const store = fakeTripStore({ a: line([[-122, 37], [-121, 38]]) })

    await renderWorldMap(trips, store, 'a-browser-key')
    fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

    expect(screen.getByText('No planned trips')).toBeDefined()
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined()
  })

  it('renders the setup panel when no key is configured', async () => {
    await renderWorldMap([], fakeTripStore({}), '')

    expect(screen.getByText('Map unavailable')).toBeDefined()
    expect(screen.queryByTestId('map')).toBeNull()
  })
})
