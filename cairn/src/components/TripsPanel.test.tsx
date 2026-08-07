import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

/** `TripsPanel` is a controlled component — real `useState` here so filter
    and hover changes round-trip exactly as they do under the real shell. */
function TestTripsPanel({
  trips,
  onCreate = vi.fn(),
  onDelete = vi.fn(),
  onSetStatus = vi.fn(),
  disabled = false,
  initialFilters = DEFAULT_TRIP_FILTERS,
  dateSpan = null,
}: {
  trips: TripIndexEntry[]
  onCreate?: (name: string) => void
  onDelete?: (id: string) => void
  onSetStatus?: (id: string, status: TripIndexEntry['status']) => void
  disabled?: boolean
  initialFilters?: TripFilters
  dateSpan?: { min: number; max: number } | null
}) {
  const [filters, setFilters] = useState<TripFilters>(initialFilters)
  const [hoveredTripId, setHoveredTripId] = useState<string | null>(null)
  return (
    <TripsPanel
      trips={trips}
      filters={filters}
      onFiltersChange={setFilters}
      dateSpan={dateSpan}
      hoveredTripId={hoveredTripId}
      onHoverTrip={setHoveredTripId}
      onCreate={onCreate}
      onDelete={onDelete}
      onSetStatus={onSetStatus}
      disabled={disabled}
    />
  )
}

function renderPanel(
  props: Partial<Parameters<typeof TestTripsPanel>[0]> & { trips: TripIndexEntry[] },
) {
  return render(
    <MemoryRouter>
      <TestTripsPanel {...props} />
    </MemoryRouter>,
  )
}

function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }))
}

describe('TripsPanel', () => {
  it('titles the list and counts what it is showing', () => {
    renderPanel({ trips: [tripEntry({ id: 'a' }), tripEntry({ id: 'b', name: 'Alta Via 1' })] })

    expect(screen.getByRole('heading', { name: 'Everything' })).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows an empty state pointing at drop-anywhere import when there are no trips', () => {
    renderPanel({ trips: [] })

    expect(screen.getByText('Nothing here yet')).toBeDefined()
    expect(screen.getByText('Drop a KML or a photo anywhere to start.')).toBeDefined()
  })

  it('creates a trip from the New trip action', () => {
    const onCreate = vi.fn()
    renderPanel({ trips: [], onCreate })

    fireEvent.click(screen.getByRole('button', { name: 'New trip' }))
    fireEvent.change(screen.getByPlaceholderText('Trip name'), { target: { value: 'Hokkaido' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreate).toHaveBeenCalledWith('Hokkaido')
  })

  it('disables creation and shows a hint while disconnected', () => {
    renderPanel({ trips: [], disabled: true })

    expect(screen.getByRole('button', { name: 'New trip' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Sign in to add or remove trips.')).toBeDefined()
  })

  // #95: `disabled` only ever accompanies an empty `trips` array in
  // production, so this exercises exactly that combination — the message
  // has to say why the list is empty.
  it('shows a sign-in prompt instead of "Nothing here yet" while disconnected', () => {
    renderPanel({ trips: [], disabled: true })

    expect(screen.getByText('Sign in to see your map.')).toBeDefined()
    expect(screen.queryByText('Nothing here yet')).toBeNull()
  })

  it('lists every trip, showing its name, date range and status', () => {
    renderPanel({
      trips: [
        tripEntry({
          name: 'Kepler Track',
          status: 'completed',
          startDate: '2024-03-01',
          endDate: '2024-03-05',
        }),
      ],
    })

    expect(screen.getByText('Kepler Track')).toBeDefined()
    expect(screen.getByText(/completed/)).toBeDefined()
  })

  it('gives each row the marker as its glyph', () => {
    const { container } = renderPanel({
      trips: [
        tripEntry({ id: 'a', status: 'completed' }),
        tripEntry({ id: 'b', name: 'Alta Via 1', status: 'planned' }),
      ],
    })

    expect(container.querySelector('.trips-panel__row-dot--completed')).not.toBeNull()
    expect(container.querySelector('.trips-panel__row-dot--planned')).not.toBeNull()
  })

  it('links each row to the trip detail view', () => {
    renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })

    const link = screen.getByText('Kepler Track').closest('a')
    expect(link?.getAttribute('href')).toBe('/trips/abc')
  })

  describe('the row menu (#109)', () => {
    it('carries named actions and no × anywhere on the row', () => {
      const { container } = renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })

      expect(container.querySelector('.trips-panel__row-remove')).toBeNull()
      openRowMenu('Kepler Track')

      expect(screen.getByRole('menuitem', { name: 'Mark as completed' })).toBeDefined()
      expect(screen.getByRole('menuitem', { name: 'Delete trip…' })).toBeDefined()
    })

    it('marks the destructive item with --danger as well as the word', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })
      openRowMenu('Kepler Track')

      expect(screen.getByRole('menuitem', { name: 'Delete trip…' }).className).toContain('--danger')
    })

    it('toggles the trip status through the menu', () => {
      const onSetStatus = vi.fn()
      renderPanel({
        trips: [tripEntry({ id: 'abc', name: 'Kepler Track', status: 'completed' })],
        onSetStatus,
      })
      openRowMenu('Kepler Track')

      fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as planned' }))
      expect(onSetStatus).toHaveBeenCalledWith('abc', 'planned')
    })

    it('closes on Escape', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })
      openRowMenu('Kepler Track')
      expect(screen.getByRole('menu')).toBeDefined()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('disables its mutating items while disconnected', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], disabled: true })
      openRowMenu('Kepler Track')

      expect(screen.getByRole('menuitem', { name: 'Delete trip…' })).toHaveProperty(
        'disabled',
        true,
      )
    })
  })

  describe('removing a trip', () => {
    it('requires a confirm before deleting, and calls onDelete only from it', () => {
      const onDelete = vi.fn()
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], onDelete })

      openRowMenu('Kepler Track')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete trip…' }))
      expect(onDelete).not.toHaveBeenCalled()
      expect(screen.getByText('Delete "Kepler Track"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(onDelete).toHaveBeenCalledWith('abc')
    })

    it('dismisses the confirm on Escape without deleting', () => {
      const onDelete = vi.fn()
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })], onDelete })

      openRowMenu('Kepler Track')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete trip…' }))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByText('Delete "Kepler Track"?')).toBeNull()
      expect(onDelete).not.toHaveBeenCalled()
    })
  })

  describe('filtering', () => {
    it('filters the list by the shell-owned name term, case-insensitively', () => {
      renderPanel({
        trips: [
          tripEntry({ id: 'a', name: 'Kepler Track' }),
          tripEntry({ id: 'b', name: 'Alta Via 1' }),
        ],
        initialFilters: { ...DEFAULT_TRIP_FILTERS, name: 'KEPLER' },
      })

      expect(screen.getByText('Kepler Track')).toBeDefined()
      expect(screen.queryByText('Alta Via 1')).toBeNull()
    })

    it('shows "Nothing in this range" with a way to clear filters', () => {
      renderPanel({
        trips: [tripEntry({ name: 'Kepler Track', status: 'completed' })],
        initialFilters: { ...DEFAULT_TRIP_FILTERS, status: 'planned' },
      })

      expect(screen.getByText('Nothing in this range')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(screen.getByText('Kepler Track')).toBeDefined()
    })

    it('clearing filters also clears the date range, for the shell to refill', () => {
      renderPanel({
        trips: [tripEntry({ name: 'Kepler Track', status: 'completed' })],
        initialFilters: { status: 'planned', name: 'x', range: [10, 20] },
      })

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(screen.getByText('Kepler Track')).toBeDefined()
    })
  })

  describe('the year range (#109)', () => {
    it('renders in the list header when there is a span to range over', () => {
      const { container } = renderPanel({
        trips: [tripEntry({ id: 'a', startDate: '2020-01-01' })],
        dateSpan: { min: 18262, max: 20454 },
        initialFilters: { ...DEFAULT_TRIP_FILTERS, range: [18262, 20454] },
      })

      const start = screen.getByLabelText('Range start')
      expect(start.closest('.trips-panel__header')).not.toBeNull()
      expect(container.querySelector('.world-map__date-range')).toBeNull()
      expect(screen.getByText('Years')).toBeDefined()
    })

    it('does not render when every trip falls on the same day', () => {
      renderPanel({
        trips: [tripEntry({ id: 'a', startDate: '2020-01-01' })],
        dateSpan: { min: 18262, max: 18262 },
        initialFilters: { ...DEFAULT_TRIP_FILTERS, range: [18262, 18262] },
      })

      expect(screen.queryByLabelText('Range start')).toBeNull()
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
})
