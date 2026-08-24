import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripIndexEntry } from '../store/tripStore'
import { DEFAULT_TRIP_FILTERS, type TripFilters } from '../store/tripFilters'
import { WorldLayer } from './WorldMap'

const { fitTracksToBounds, zoomToFitCluster } = vi.hoisted(() => ({
  fitTracksToBounds: vi.fn(),
  zoomToFitCluster: vi.fn(),
}))
// #312 — `../map/reveal`'s `toPadding` reads the real `FIT_PADDING` from
// this same mocked module, so it has to stay exported.
vi.mock('../map/fitBounds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../map/fitBounds')>()
  return { ...actual, fitTracksToBounds, zoomToFitCluster }
})

const fakeMap = {
  id: 'fake-map',
  getZoom: () => 2,
  getCenter: () => ({ toJSON: () => ({ lat: 12, lng: 34 }) }),
}
vi.mock('@vis.gl/react-google-maps', () => ({
  AdvancedMarker: ({
    position,
    onClick,
    children,
  }: {
    position: { lat: number; lng: number }
    onClick?: () => void
    children?: React.ReactNode
  }) => (
    <div
      data-testid="advanced-marker"
      data-lat={position.lat}
      data-lng={position.lng}
      onClick={onClick}
    >
      {children}
    </div>
  ),
  Polyline: () => <div data-testid="polyline" />,
  useMap: () => fakeMap,
}))

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: () => ({ remove: () => {} }),
      addListenerOnce: () => {},
    },
  },
}

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 'trip-1',
    name: 'Hokkaido',
    startDate: null,
    endDate: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    origin: { lat: 37, lng: -122 },
    cairnCount: null,
    ...overrides,
  }
}

/** `WorldLayer` is a controlled component — filters and the hovered trip id
    live in the shell. This harness plays that role with real `useState`, so
    a change actually round-trips the way the real parent does. */
function TestWorldLayer({
  trips,
  initialFilters = DEFAULT_TRIP_FILTERS,
  initialHoveredTripId = null,
  onSelectTrip = () => {},
}: {
  trips: TripIndexEntry[]
  initialFilters?: TripFilters
  initialHoveredTripId?: string | null
  onSelectTrip?: (tripId: string) => void
}) {
  const [filters] = useState<TripFilters>(initialFilters)
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(initialHoveredTripId)
  return (
    <WorldLayer
      trips={trips}
      filters={filters}
      hoveredTripId={hoveredTripId}
      onHoverTrip={setHoveredTripId}
      onSelectTrip={onSelectTrip}
    />
  )
}

function renderLayer(props: Parameters<typeof TestWorldLayer>[0]) {
  return render(
    <MemoryRouter>
      <TestWorldLayer {...props} />
    </MemoryRouter>,
  )
}

function dots(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.world-map__dot'))
}

afterEach(() => {
  fitTracksToBounds.mockClear()
  zoomToFitCluster.mockClear()
  window.localStorage.clear()
})

describe('WorldLayer', () => {
  it('renders one dot per trip with an origin, filled for completed and hollow for planned', () => {
    const { container } = renderLayer({
      trips: [
        tripEntry({
          id: 'a',
          startDate: '2020-01-01',
          endDate: '2020-01-05',
          origin: { lat: 37, lng: -122 },
        }),
        tripEntry({ id: 'b', origin: { lat: 60, lng: 100 } }),
      ],
    })

    expect(dots(container)).toHaveLength(2)
    expect(container.querySelector('.world-map__dot--completed')).not.toBeNull()
    expect(container.querySelector('.world-map__dot--planned')).not.toBeNull()
  })

  it('excludes a trip with no origin without blocking the others', () => {
    const { container } = renderLayer({
      trips: [
        tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } }),
        tripEntry({ id: 'b', name: 'No geometry yet', origin: null }),
      ],
    })

    expect(dots(container)).toHaveLength(1)
  })

  it('fits bounds once on mount to the union of all places', () => {
    renderLayer({
      trips: [
        tripEntry({ id: 'a', origin: { lat: 37, lng: -122 } }),
        tripEntry({ id: 'b', origin: { lat: -33, lng: 151 } }),
      ],
    })

    expect(fitTracksToBounds).toHaveBeenCalledTimes(1)
    expect(fitTracksToBounds).toHaveBeenCalledWith(
      fakeMap,
      expect.arrayContaining([
        expect.objectContaining({ lat: 37, lng: -122 }),
        expect.objectContaining({ lat: -33, lng: 151 }),
      ]),
      expect.anything(),
    )
  })

  it('hovering a dot shows the trip name as a label', () => {
    renderLayer({ trips: [tripEntry({ id: 'a', name: 'Kepler Track' })] })

    expect(screen.getByText('Kepler Track')).toBeDefined()
  })

  it('activating a dot reports the trip id back to the shell', () => {
    const onSelectTrip = vi.fn()
    const { container } = renderLayer({ trips: [tripEntry({ id: 'a' })], onSelectTrip })

    fireEvent.click(container.querySelector('.world-map__dot')!)

    expect(onSelectTrip).toHaveBeenCalledWith('a')
  })

  it('clusters dots whose footprints overlap, showing the member count', () => {
    const { container } = renderLayer({
      trips: [
        tripEntry({ id: 'a', origin: { lat: 10, lng: 10 } }),
        tripEntry({ id: 'b', origin: { lat: 10.0001, lng: 10.0001 } }),
      ],
    })

    expect(dots(container)).toHaveLength(0)
    const cluster = container.querySelector('.world-map__cluster')
    expect(cluster?.textContent).toBe('2')
  })

  it('activating a cluster zooms the map to fit its members', () => {
    const { container } = renderLayer({
      trips: [
        tripEntry({ id: 'a', origin: { lat: 10, lng: 10 } }),
        tripEntry({ id: 'b', origin: { lat: 10.0001, lng: 10.0001 } }),
      ],
    })

    fireEvent.click(container.querySelector('.world-map__cluster')!)

    expect(zoomToFitCluster).toHaveBeenCalledTimes(1)
    // #312 — the inset-aware padding, not the bare `FIT_PADDING` default.
    expect(zoomToFitCluster).toHaveBeenCalledWith(fakeMap, expect.anything(), expect.anything())
  })

  it('draws only the trips the shell filters admit', () => {
    const { container } = renderLayer({
      trips: [
        tripEntry({
          id: 'a',
          startDate: '2020-01-01',
          endDate: '2020-01-05',
          origin: { lat: 37, lng: -122 },
        }),
        tripEntry({ id: 'b', origin: { lat: -33, lng: 151 } }),
      ],
      initialFilters: { ...DEFAULT_TRIP_FILTERS, status: 'planned' },
    })

    expect(dots(container)).toHaveLength(1)
    expect(container.querySelector('.world-map__dot--planned')).not.toBeNull()
  })

  it('applies the emphasized state to the dot matching hoveredTripId, with no pointer over it', () => {
    const { container } = renderLayer({
      trips: [tripEntry({ id: 'a' })],
      initialHoveredTripId: 'a',
    })

    expect(container.querySelector('.world-map__dot-hit--emphasized')).not.toBeNull()
  })

  it('hovering a dot reports its trip id back through onHoverTrip', () => {
    const { container } = renderLayer({ trips: [tripEntry({ id: 'a' })] })
    const hit = container.querySelector('.world-map__dot-hit') as HTMLElement

    fireEvent.mouseEnter(hit)
    expect(container.querySelector('.world-map__dot-hit--emphasized')).not.toBeNull()

    fireEvent.mouseLeave(hit)
    expect(container.querySelector('.world-map__dot-hit--emphasized')).toBeNull()
  })

  it('draws a draft import as a route alongside the saved dots (#81)', () => {
    const { container } = renderLayer({
      trips: [tripEntry({ id: 'a' })],
    })
    expect(container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(0)

    const withDraft = render(
      <MemoryRouter>
        <WorldLayer
          trips={[]}
          filters={DEFAULT_TRIP_FILTERS}
          hoveredTripId={null}
          onHoverTrip={() => {}}
          onSelectTrip={() => {}}
          draftTracks={[
            {
              name: 'day1',
              points: [
                { lat: 1, lon: 2 },
                { lat: 3, lon: 4 },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    )

    expect(withDraft.container.querySelectorAll('[data-testid="polyline"]')).toHaveLength(1)
  })
})
