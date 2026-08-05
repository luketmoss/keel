import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TripsPanel } from './TripsPanel'
import type { TripIndexEntry } from '../store/tripStore'
import { DEFAULT_TRIP_FILTERS, type TripFilters } from '../store/tripFilters'

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 't1',
    name: 'Hokkaido',
    status: 'planned',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    origin: null,
    ...overrides,
  }
}

/** `TripsPanel` is a controlled component (#80), same as `WorldMap` — real
    `useState` here so filter/hover changes round-trip exactly as they do
    under the real parent (`App.tsx`). */
function TestTripsPanel({
  trips,
  onCreate = vi.fn(),
  onDelete = vi.fn(),
  disabled = false,
  initialFilters = DEFAULT_TRIP_FILTERS,
}: {
  trips: TripIndexEntry[]
  onCreate?: (name: string) => void
  onDelete?: (id: string) => void
  disabled?: boolean
  initialFilters?: TripFilters
}) {
  const [filters, setFilters] = useState<TripFilters>(initialFilters)
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(null)
  return (
    <TripsPanel
      trips={trips}
      filters={filters}
      onFiltersChange={setFilters}
      hoveredTripId={hoveredTripId}
      onHoverTrip={setHoveredTripId}
      onCreate={onCreate}
      onDelete={onDelete}
      disabled={disabled}
    />
  )
}

function renderPanel(props: Partial<Parameters<typeof TestTripsPanel>[0]> & { trips: TripIndexEntry[] }) {
  return render(
    <MemoryRouter>
      <TestTripsPanel {...props} />
    </MemoryRouter>,
  )
}

describe('TripsPanel', () => {
  it('shows an empty state pointing at drop-anywhere import, with no filter controls, when there are no trips', () => {
    renderPanel({ trips: [] })

    expect(screen.getByText('No trips yet')).toBeDefined()
    expect(screen.getByText('Drop a KML anywhere to start one.')).toBeDefined()
    expect(screen.queryByPlaceholderText('Filter trips')).toBeNull()
  })

  it('creates a trip from the name field', () => {
    const onCreate = vi.fn()
    renderPanel({ trips: [], onCreate })

    fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: 'Hokkaido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledWith('Hokkaido')
  })

  it('disables creation and shows a hint while disconnected', () => {
    renderPanel({ trips: [], disabled: true })

    expect(screen.getByPlaceholderText('Trip name')).toHaveProperty('disabled', true)
    expect(screen.getByText('Sign in to add or remove trips.')).toBeDefined()
  })

  // #95: `disabled` only ever accompanies an empty `trips` array in
  // production (App.tsx withholds it), so this exercises exactly that
  // combination — the empty-list message has to say why it's empty, not
  // repeat the ordinary "No trips yet" that's wrong when trips exist but
  // are hidden.
  it('shows a sign-in prompt instead of "No trips yet" when the empty list is caused by being disconnected', () => {
    renderPanel({ trips: [], disabled: true })

    expect(screen.getByText('Sign in to see your trips.')).toBeDefined()
    expect(screen.queryByText('No trips yet')).toBeNull()
  })

  it('lists every trip, showing its name, date range and status', () => {
    renderPanel({
      trips: [tripEntry({ name: 'Kepler Track', status: 'completed', startDate: '2024-03-01', endDate: '2024-03-05' })],
    })

    expect(screen.getByText('Kepler Track')).toBeDefined()
    expect(screen.getByText(/completed/)).toBeDefined()
  })

  it('links each row to the trip detail view', () => {
    renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })

    const link = screen.getByText('Kepler Track').closest('a')
    expect(link?.getAttribute('href')).toBe('/trips/abc')
  })

  describe('removing a trip', () => {
    it('requires a confirm before deleting, and calls onDelete only from it', () => {
      const onDelete = vi.fn()
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], onDelete })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Kepler Track' }))
      expect(onDelete).not.toHaveBeenCalled()
      expect(screen.getByText('Delete "Kepler Track"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(onDelete).toHaveBeenCalledWith('abc')
    })

    it('dismisses the confirm on Escape without deleting', () => {
      const onDelete = vi.fn()
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], onDelete })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Kepler Track' }))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByText('Delete "Kepler Track"?')).toBeNull()
      expect(onDelete).not.toHaveBeenCalled()
    })

    it('disables the remove control while disconnected', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], disabled: true })

      expect(screen.getByRole('button', { name: 'Delete Kepler Track' })).toHaveProperty('disabled', true)
    })
  })

  describe('filtering', () => {
    it('filters the list by name, case-insensitively on any part of it', () => {
      renderPanel({
        trips: [tripEntry({ id: 'a', name: 'Kepler Track' }), tripEntry({ id: 'b', name: 'Alta Via 1' })],
      })

      fireEvent.change(screen.getByPlaceholderText('Filter trips'), { target: { value: 'KEPLER' } })

      expect(screen.getByText('Kepler Track')).toBeDefined()
      expect(screen.queryByText('Alta Via 1')).toBeNull()
    })

    it('filters by status', () => {
      renderPanel({
        trips: [
          tripEntry({ id: 'a', name: 'Kepler Track', status: 'completed' }),
          tripEntry({ id: 'b', name: 'Alta Via 1', status: 'planned' }),
        ],
      })

      fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

      expect(screen.getByText('Alta Via 1')).toBeDefined()
      expect(screen.queryByText('Kepler Track')).toBeNull()
    })

    it('the clear (✕) control appears only once the name field has content, and empties it', () => {
      renderPanel({ trips: [tripEntry({ name: 'Kepler Track' })] })

      expect(screen.queryByRole('button', { name: 'Clear name filter' })).toBeNull()

      fireEvent.change(screen.getByPlaceholderText('Filter trips'), { target: { value: 'Kepler' } })
      expect(screen.getByRole('button', { name: 'Clear name filter' })).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Clear name filter' }))
      expect(screen.getByPlaceholderText('Filter trips')).toHaveProperty('value', '')
    })

    it('shows "No trips match" with a way to clear filters when nothing matches, keeping the filter controls', () => {
      renderPanel({ trips: [tripEntry({ name: 'Kepler Track', status: 'completed' })] })

      fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

      expect(screen.getByText('No trips match')).toBeDefined()
      expect(screen.getByPlaceholderText('Filter trips')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(screen.getByText('Kepler Track')).toBeDefined()
    })

    it('clearing filters also clears the date range, for the map to refill', () => {
      renderPanel({
        trips: [tripEntry({ name: 'Kepler Track', status: 'completed' })],
        initialFilters: { status: 'planned', name: 'x', range: [10, 20] },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

      expect(screen.getByText('Kepler Track')).toBeDefined()
      expect(screen.getByPlaceholderText('Filter trips')).toHaveProperty('value', '')
    })
  })

  describe('row/dot hover emphasis', () => {
    it('hovering a row applies the emphasized class and reports the trip id', () => {
      const { container } = renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })

      const row = screen.getByText('Kepler Track').closest('li')!
      fireEvent.mouseEnter(row)
      expect(container.querySelector('.trips-panel__row--emphasized')).not.toBeNull()

      fireEvent.mouseLeave(row)
      expect(container.querySelector('.trips-panel__row--emphasized')).toBeNull()
    })
  })

  it('the close control navigates to /', () => {
    function LocationDisplay() {
      const { pathname } = useLocation()
      return <div data-testid="location">{pathname}</div>
    }
    render(
      <MemoryRouter initialEntries={['/trips']}>
        <TestTripsPanel trips={[]} />
        <LocationDisplay />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close trips' }))

    expect(screen.getByTestId('location').textContent).toBe('/')
  })
})
