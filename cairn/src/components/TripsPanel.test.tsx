import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { TripsPanel } from './TripsPanel'
import type { TripIndexEntry } from '../store/tripStore'
import type { TripTotals } from '../geo/tripTotals'
import type { LooseRecord } from '../store/looseStore'
import type { KindFilter } from './FilterChips'
import type { CairnFacet } from '../store/cairnRules'
import { formatDistance, formatElevationGain } from '../format/units'
import { formatTripDateRange, lowercaseFirst } from '../format/dates'
import { DEFAULT_TRIP_FILTERS, type TripFilters } from '../store/tripFilters'

function tripEntry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 't1',
    name: 'Hokkaido',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    origin: null,
    cairnCount: null,
    ...overrides,
  }
}

/** `TripsPanel` is a controlled component — real `useState` here so filter
    and hover changes round-trip exactly as they do under the real shell. */
function TestTripsPanel({
  trips,
  trackCounts = new Map(),
  tripTotals = new Map(),
  looseItems = [],
  kind = 'all',
  initialFacet = 'any',
  onCreate = vi.fn(),
  onDelete = vi.fn(),
  onDeleteLoose = vi.fn(),
  onAddLooseToTrip = vi.fn(),
  onRenameLoose = vi.fn().mockResolvedValue(true),
  onRecolorLoose = vi.fn().mockResolvedValue(true),
  onExportLoose = vi.fn(),
  exportingIds = new Set(),
  disabled = false,
  initialFilters = DEFAULT_TRIP_FILTERS,
  dateSpan = null,
}: {
  trips: TripIndexEntry[]
  trackCounts?: ReadonlyMap<string, number>
  tripTotals?: ReadonlyMap<string, TripTotals | null>
  looseItems?: LooseRecord[]
  kind?: KindFilter
  initialFacet?: CairnFacet
  onCreate?: (name: string) => void
  onDelete?: (id: string) => void
  onDeleteLoose?: (id: string) => void
  onAddLooseToTrip?: (id: string) => void
  onRenameLoose?: (id: string, name: string) => Promise<boolean>
  onRecolorLoose?: (id: string, color: number) => Promise<boolean>
  onExportLoose?: (id: string) => void
  exportingIds?: ReadonlySet<string>
  disabled?: boolean
  initialFilters?: TripFilters
  dateSpan?: { min: number; max: number } | null
}) {
  const [filters, setFilters] = useState<TripFilters>(initialFilters)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [facet, setFacet] = useState<CairnFacet>(initialFacet)
  return (
    <TripsPanel
      trips={trips}
      trackCounts={trackCounts}
      tripTotals={tripTotals}
      looseItems={looseItems}
      kind={kind}
      facet={facet}
      onFacetChange={setFacet}
      filters={filters}
      onFiltersChange={setFilters}
      dateSpan={dateSpan}
      hoveredId={hoveredId}
      onHover={setHoveredId}
      onCreate={onCreate}
      onDelete={onDelete}
      onDeleteLoose={onDeleteLoose}
      onAddLooseToTrip={onAddLooseToTrip}
      onRenameLoose={onRenameLoose}
      onRecolorLoose={onRecolorLoose}
      onExportLoose={onExportLoose}
      exportingIds={exportingIds}
      disabled={disabled}
    />
  )
}

function looseTrack(overrides: Partial<Extract<LooseRecord, { kind: 'track' }>> = {}): LooseRecord {
  return {
    kind: 'track',
    id: 'track-1',
    name: 'Mount Rosea',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2024-03-09T00:00:00.000Z',
    distanceMeters: 14200,
    ascentMeters: 690,
    elevationLossMeters: 620,
    highPointMeters: 2100,
    lowPointMeters: 1500,
    durationSeconds: 19_200,
    elevationProfile: null,
    pointCount: 512,
    sourceName: 'rosea.kml',
    colorIndex: 0,
    position: { lat: -37, lng: 142 },
    driveFileId: null,
    uploadState: 'ok',
    ...overrides,
  }
}

function looseCairn(overrides: Partial<Extract<LooseRecord, { kind: 'cairn' }>> = {}): LooseRecord {
  return {
    kind: 'cairn',
    id: 'cairn-1',
    name: 'sapporo.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: '2024-11-03T00:00:00.000Z',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    uploadState: 'ok',
    ...overrides,
  }
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

/** Distances and ascents are formatted for the run's locale, so the tests
    match on whatever `format/units` produced rather than on a unit. */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

  it('lists every trip, showing its name, date range and both counts', () => {
    renderPanel({
      trips: [
        tripEntry({
          id: 't1',
          name: 'Kepler Track',
          startDate: '2024-03-01',
          endDate: '2024-03-05',
          cairnCount: 128,
        }),
      ],
      trackCounts: new Map([['t1', 4]]),
    })

    expect(screen.getByText('Kepler Track')).toBeDefined()
    expect(screen.getByText(new RegExp(`${escapeRe(formatTripDateRange('2024-03-01', '2024-03-05'))} · 4 tracks · 128 photos`))).toBeDefined()
  })

  // #131: the row's glyph carries status visually and is `aria-hidden`, so
  // the word moved into the row link's accessible name rather than being
  // dropped for a screen reader along with the visible text.
  it('leaves status out of the visible meta line but keeps it in the accessible name', () => {
    renderPanel({
      trips: [
        tripEntry({
          id: 't1',
          name: 'Kepler Track',
          startDate: '2024-03-01',
          endDate: '2024-03-05',
          cairnCount: 128,
        }),
      ],
      trackCounts: new Map([['t1', 4]]),
    })

    expect(screen.queryByText(/completed/)).toBeNull()
    const link = screen.getByText('Kepler Track').closest('a')
    expect(link?.getAttribute('aria-label')).toBe(
      `Kepler Track, completed, ${lowercaseFirst(formatTripDateRange('2024-03-01', '2024-03-05'))}, 4 tracks, 128 photos`,
    )
  })

  it('omits the photo count from the meta line when it has never been counted', () => {
    renderPanel({
      trips: [tripEntry({ id: 't1', name: 'Kepler Track', cairnCount: null })],
      trackCounts: new Map([['t1', 4]]),
    })

    expect(screen.getByText(/4 tracks$/)).toBeDefined()
    expect(screen.queryByText(/photos/)).toBeNull()
  })

  it('shows a genuine zero photo count rather than omitting it', () => {
    renderPanel({
      trips: [tripEntry({ id: 't1', name: 'Kepler Track', cairnCount: 0 })],
      trackCounts: new Map([['t1', 4]]),
    })

    expect(screen.getByText(/4 tracks · 0 photos$/)).toBeDefined()
  })

  it('keeps counts singular at one', () => {
    renderPanel({
      trips: [tripEntry({ id: 't1', name: 'Kepler Track', cairnCount: 1 })],
      trackCounts: new Map([['t1', 1]]),
    })

    expect(screen.getByText(/1 track · 1 photo$/)).toBeDefined()
  })

  // #225
  describe('trip totals', () => {
    it('appends distance and ascent to the meta line when totals are known', () => {
      renderPanel({
        trips: [tripEntry({ id: 't1', name: 'Kepler Track', startDate: '2024-03-01', endDate: '2024-03-05' })],
        trackCounts: new Map([['t1', 4]]),
        tripTotals: new Map([['t1', { distanceMeters: 42_806, elevationGainMeters: 2_121 }]]),
      })

      expect(
        screen.getByText(
          new RegExp(
            `4 tracks · ${escapeRe(formatDistance(42_806))} · ${escapeRe(formatElevationGain(2_121)!)}$`,
          ),
        ),
      ).toBeDefined()
    })

    it('shows distance without ascent when no track in the trip carries elevation', () => {
      renderPanel({
        trips: [tripEntry({ id: 't1', name: 'Kepler Track' })],
        trackCounts: new Map([['t1', 2]]),
        tripTotals: new Map([['t1', { distanceMeters: 18_300, elevationGainMeters: undefined }]]),
      })

      const detail = screen.getByText(new RegExp(`2 tracks · ${escapeRe(formatDistance(18_300))}$`))
      expect(detail).toBeDefined()
      expect(detail.textContent).not.toMatch(/ft ↑/)
    })

    it('adds no distance or ascent segment for a trip with no totals', () => {
      renderPanel({
        trips: [tripEntry({ id: 't1', name: 'Kepler Track' })],
        trackCounts: new Map([['t1', 0]]),
        tripTotals: new Map([['t1', null]]),
      })

      expect(screen.getByText(/0 tracks$/)).toBeDefined()
    })

    it('adds no distance or ascent segment when the trip has no entry in the totals map at all', () => {
      // The same state a missing/unreadable/stale sidecar produces upstream
      // in `readTripTotals` — the row never sees the difference.
      renderPanel({
        trips: [tripEntry({ id: 't1', name: 'Kepler Track' })],
        trackCounts: new Map([['t1', 3]]),
        tripTotals: new Map(),
      })

      expect(screen.getByText(/3 tracks$/)).toBeDefined()
    })
  })

  it('falls back to 0 tracks when the track count map has no entry for the trip', () => {
    renderPanel({ trips: [tripEntry({ id: 't1', name: 'Kepler Track' })] })

    expect(screen.getByText(/0 tracks$/)).toBeDefined()
  })

  it('gives each row the marker as its glyph', () => {
    const { container } = renderPanel({
      trips: [
        tripEntry({ id: 'a', startDate: '2020-01-01', endDate: '2020-01-05' }),
        tripEntry({ id: 'b', name: 'Alta Via 1' }),
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

      expect(screen.getByRole('menuitem', { name: 'Delete trip…' })).toBeDefined()
    })

    // #147: status is derived from dates, so the menu that used to toggle it
    // holds only Delete — a one-item menu is the guard a destructive action
    // needs to stay two deliberate steps away, not an oversight to promote
    // onto the row.
    it('holds only Delete trip… now that status is not a control', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })
      openRowMenu('Kepler Track')

      expect(screen.getAllByRole('menuitem')).toHaveLength(1)
      expect(screen.queryByRole('menuitem', { name: /mark as/i })).toBeNull()
    })

    it('marks the destructive item with --danger as well as the word', () => {
      renderPanel({ trips: [tripEntry({ id: 'abc', name: 'Kepler Track' })] })
      openRowMenu('Kepler Track')

      expect(screen.getByRole('menuitem', { name: 'Delete trip…' }).className).toContain('--danger')
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
        trips: [tripEntry({ name: 'Kepler Track', startDate: '2020-01-01', endDate: '2020-01-05' })],
        initialFilters: { ...DEFAULT_TRIP_FILTERS, status: 'planned' },
      })

      expect(screen.getByText('Nothing in this range')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      expect(screen.getByText('Kepler Track')).toBeDefined()
    })

    it('clearing filters also clears the date range, for the shell to refill', () => {
      renderPanel({
        trips: [tripEntry({ name: 'Kepler Track', startDate: '2020-01-01', endDate: '2020-01-05' })],
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

  describe('loose tracks and photos (#110)', () => {
    it('lists them alongside trips, each with its own glyph', () => {
      const { container } = renderPanel({
        trips: [tripEntry({ id: 'a', name: 'Larapinta', startDate: '2020-01-01', endDate: '2020-01-05' })],
        looseItems: [looseTrack(), looseCairn()],
      })

      expect(screen.getByText('Larapinta')).toBeDefined()
      expect(screen.getByText('Mount Rosea')).toBeDefined()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
      expect(container.querySelector('.trips-panel__row-dot--completed')).not.toBeNull()
      expect(container.querySelector('.trips-panel__row-tile')).not.toBeNull()
      expect(container.querySelector('.trips-panel__row-photo')).not.toBeNull()
    })

    it('gives a loose track its stats and a loose photo its kind', () => {
      renderPanel({ trips: [], looseItems: [looseTrack(), looseCairn()] })

      expect(screen.getByText(new RegExp(escapeRe(formatDistance(14200))))).toBeDefined()
      expect(screen.getByText(new RegExp(escapeRe(formatElevationGain(690)!)))).toBeDefined()
      expect(screen.getByText(/· photo/)).toBeDefined()
    })

    it('marks a cairn that never made it to Drive as not on Drive, in --danger', () => {
      const { container } = renderPanel({
        trips: [],
        looseItems: [looseCairn({ uploadState: 'failed' })],
      })

      expect(screen.getByText(/not on Drive/)).toBeDefined()
      expect(container.querySelector('.trips-panel__row-detail--unplaced')).not.toBeNull()
    })

    it('links a track and a photo to their own faces', () => {
      renderPanel({ trips: [], looseItems: [looseTrack(), looseCairn()] })

      expect(screen.getByText('Mount Rosea').closest('a')?.getAttribute('href')).toBe(
        '/tracks/track-1',
      )
      expect(screen.getByText('sapporo.jpg').closest('a')?.getAttribute('href')).toBe(
        '/cairns/cairn-1',
      )
    })

    it('offers Add to a trip and a separate Delete on a loose row', () => {
      const onAddLooseToTrip = vi.fn()
      renderPanel({ trips: [], looseItems: [looseTrack()], onAddLooseToTrip })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Delete…' }).className).toContain('--danger')

      fireEvent.click(screen.getByRole('menuitem', { name: 'Add to a trip…' }))
      expect(onAddLooseToTrip).toHaveBeenCalledWith('track-1')
    })

    it('requires the inline confirm before deleting a loose item', () => {
      const onDeleteLoose = vi.fn()
      renderPanel({ trips: [], looseItems: [looseTrack()], onDeleteLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
      expect(onDeleteLoose).not.toHaveBeenCalled()
      expect(screen.getByText('Delete "Mount Rosea"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      expect(onDeleteLoose).toHaveBeenCalledWith('track-1')
    })

    // #120 — the row is honest about where its file is.
    it('says a row is uploading, and holds Add to a trip until the file lands', () => {
      renderPanel({ trips: [], looseItems: [looseTrack({ uploadState: 'uploading' })] })

      expect(screen.getByText('uploading…')).toBeDefined()
      expect(screen.queryByText(new RegExp(formatDistance(14200)))).toBeNull()

      openRowMenu('Mount Rosea')
      // A move is a file move, and there is nothing there yet to move.
      expect(screen.getByRole('menuitem', { name: 'Add to a trip…' })).toHaveProperty(
        'disabled',
        true,
      )
      // Deleting stays available: an item that failed to upload is exactly
      // the one a user most wants rid of.
      expect(screen.getByRole('menuitem', { name: 'Delete…' })).toHaveProperty('disabled', false)
    })

    it('says a row never reached Drive, in --danger, and disables its move', () => {
      const { container } = renderPanel({
        trips: [],
        looseItems: [looseTrack({ uploadState: 'failed' })],
      })

      const meta = screen.getByText('not on Drive')
      expect(meta.className).toContain('--unplaced')
      expect(container.querySelector('.trips-panel__row-detail--unplaced')).not.toBeNull()

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Add to a trip…' })).toHaveProperty(
        'disabled',
        true,
      )
    })
  })

  describe('export a loose item (#140)', () => {
    it('offers Export for a track on Drive, and calls back with its id', () => {
      const onExportLoose = vi.fn()
      renderPanel({
        trips: [],
        looseItems: [looseTrack({ driveFileId: 'file-1' })],
        onExportLoose,
      })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
      expect(onExportLoose).toHaveBeenCalledWith('track-1')
    })

    it('omits Export for an item whose source file was never kept', () => {
      renderPanel({ trips: [], looseItems: [looseTrack({ driveFileId: null })] })

      openRowMenu('Mount Rosea')
      expect(screen.queryByRole('menuitem', { name: 'Export' })).toBeNull()
    })

    it('shows Export, disabled, while uploading, even with no file id yet', () => {
      renderPanel({
        trips: [],
        looseItems: [looseTrack({ uploadState: 'uploading', driveFileId: null })],
      })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Export' })).toHaveProperty('disabled', true)
    })

    it('disables Export while this item is already exporting', () => {
      renderPanel({
        trips: [],
        looseItems: [looseTrack({ driveFileId: 'file-1' })],
        exportingIds: new Set(['track-1']),
      })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Export' })).toHaveProperty('disabled', true)
    })

    it('omits Export for an icon-only cairn — there is no image to download', () => {
      renderPanel({
        trips: [],
        looseItems: [looseCairn({ image: null, icon: 'campsite' })],
      })

      openRowMenu('sapporo.jpg')
      expect(screen.queryByRole('menuitem', { name: 'Export' })).toBeNull()
    })
  })

  describe('rename and recolour a loose item (#133)', () => {
    it('offers Rename and Change colour on a loose track', () => {
      renderPanel({ trips: [], looseItems: [looseTrack()] })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeDefined()
      expect(screen.getByRole('menuitem', { name: 'Change colour' })).toBeDefined()
    })

    // A photo's marker is its thumbnail, not a palette entry — there is
    // nothing for "Change colour" to change.
    it('offers Rename but not Change colour on a loose photo', () => {
      renderPanel({ trips: [], looseItems: [looseCairn()] })

      openRowMenu('sapporo.jpg')
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeDefined()
      expect(screen.queryByRole('menuitem', { name: 'Change colour' })).toBeNull()
    })

    it('renames on Enter, calling onRenameLoose with the trimmed value', async () => {
      const onRenameLoose = vi.fn().mockResolvedValue(true)
      renderPanel({ trips: [], looseItems: [looseTrack()], onRenameLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: '  Rosea East  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => expect(onRenameLoose).toHaveBeenCalledWith('track-1', 'Rosea East'))
    })

    it('cancels on Escape without renaming', () => {
      const onRenameLoose = vi.fn()
      renderPanel({ trips: [], looseItems: [looseTrack()], onRenameLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: 'Something else' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(onRenameLoose).not.toHaveBeenCalled()
      expect(screen.getByText('Mount Rosea')).toBeDefined()
    })

    it('cancels an empty commit rather than saving it', () => {
      const onRenameLoose = vi.fn()
      renderPanel({ trips: [], looseItems: [looseTrack()], onRenameLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onRenameLoose).not.toHaveBeenCalled()
    })

    it('shows a failure line beneath the list when a rename fails, without losing the row', async () => {
      const onRenameLoose = vi.fn().mockResolvedValue(false)
      renderPanel({ trips: [], looseItems: [looseTrack()], onRenameLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: 'New name' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() =>
        expect(screen.getByText("Couldn't rename Mount Rosea — try again.")).toBeDefined(),
      )
      expect(screen.getByText('Mount Rosea')).toBeDefined()
    })

    it('opens the colour popover from Change colour and recolours on selection', async () => {
      const onRecolorLoose = vi.fn().mockResolvedValue(true)
      renderPanel({ trips: [], looseItems: [looseTrack({ colorIndex: 0 })], onRecolorLoose })

      openRowMenu('Mount Rosea')
      fireEvent.click(screen.getByRole('menuitem', { name: 'Change colour' }))

      expect(screen.getByRole('group', { name: 'Colours for Mount Rosea' })).toBeDefined()
      const options = screen.getAllByRole('button', { name: /./ }).filter((el) =>
        el.className.includes('color-popover__option'),
      )
      fireEvent.click(options[2])

      await waitFor(() => expect(onRecolorLoose).toHaveBeenCalledWith('track-1', 2))
    })

    it('disables Rename and Change colour while the file is still uploading', () => {
      renderPanel({ trips: [], looseItems: [looseTrack({ uploadState: 'uploading' })] })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveProperty('disabled', true)
      expect(screen.getByRole('menuitem', { name: 'Change colour' })).toHaveProperty(
        'disabled',
        true,
      )
    })

    it('disables Rename while disconnected', () => {
      renderPanel({ trips: [], looseItems: [looseTrack()], disabled: true })

      openRowMenu('Mount Rosea')
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveProperty('disabled', true)
    })
  })

  describe('the kind chips (#110)', () => {
    const everything = {
      trips: [tripEntry({ id: 'a', name: 'Larapinta' })],
      looseItems: [looseTrack(), looseCairn()],
    }

    it('All shows every kind, under "Everything"', () => {
      renderPanel({ ...everything, kind: 'all' })

      expect(screen.getByRole('heading', { name: 'Everything' })).toBeDefined()
      expect(screen.getByText('3')).toBeDefined()
    })

    it('Trips shows only trips', () => {
      renderPanel({ ...everything, kind: 'trips' })

      expect(screen.getByRole('heading', { name: 'Trips' })).toBeDefined()
      expect(screen.getByText('Larapinta')).toBeDefined()
      expect(screen.queryByText('Mount Rosea')).toBeNull()
      expect(screen.queryByText('sapporo.jpg')).toBeNull()
    })

    it('Tracks shows only loose tracks, and says "loose" in the heading', () => {
      renderPanel({ ...everything, kind: 'tracks' })

      expect(screen.getByRole('heading', { name: 'Loose tracks' })).toBeDefined()
      expect(screen.getByText('Mount Rosea')).toBeDefined()
      expect(screen.queryByText('Larapinta')).toBeNull()
      expect(screen.queryByText('sapporo.jpg')).toBeNull()
    })

    it('Cairns shows only loose cairns', () => {
      renderPanel({ ...everything, kind: 'cairns' })

      expect(screen.getByRole('heading', { name: 'Cairns' })).toBeDefined()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
      expect(screen.queryByText('Mount Rosea')).toBeNull()
    })
  })

  describe('the cairn facet chips (#159)', () => {
    const campsitePhoto = looseCairn({ id: 'a', name: 'Ellery Creek camp', icon: 'campsite' })
    const plainPhoto = looseCairn({ id: 'b', name: 'sapporo.jpg', icon: null })
    const waterNoPhoto = looseCairn({ id: 'c', name: 'Spring', icon: 'water', image: null })
    const facetItems = { trips: [], looseItems: [campsitePhoto, plainPhoto, waterNoPhoto] }

    it('Any shows every cairn by default', () => {
      renderPanel({ ...facetItems, kind: 'cairns' })

      expect(screen.getByText('Ellery Creek camp')).toBeDefined()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
      expect(screen.getByText('Spring')).toBeDefined()
      expect(screen.getByText('3')).toBeDefined()
    })

    it('Photo shows every cairn carrying an image, whatever its icon', () => {
      renderPanel({ ...facetItems, kind: 'cairns', initialFacet: 'photo' })

      expect(screen.getByText('Ellery Creek camp')).toBeDefined()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
      expect(screen.queryByText('Spring')).toBeNull()
    })

    it('a place icon shows every cairn carrying that icon, whether or not it also has an image', () => {
      renderPanel({ ...facetItems, kind: 'cairns', initialFacet: 'campsite' })

      expect(screen.getByText('Ellery Creek camp')).toBeDefined()
      expect(screen.queryByText('sapporo.jpg')).toBeNull()
      expect(screen.queryByText('Spring')).toBeNull()
    })

    it('the title stays Cairns under a facet, and the count reflects it', () => {
      renderPanel({ ...facetItems, kind: 'cairns', initialFacet: 'water' })

      expect(screen.getByRole('heading', { name: 'Cairns' })).toBeDefined()
      expect(screen.getByText('1')).toBeDefined()
    })

    it('a facet matching nothing reads "Nothing in this filter", and Clear filters resets it', () => {
      renderPanel({ ...facetItems, kind: 'cairns', initialFacet: 'hut' })

      expect(screen.getByText('Nothing in this filter')).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

      expect(screen.getByText('Ellery Creek camp')).toBeDefined()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
      expect(screen.getByText('Spring')).toBeDefined()
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
