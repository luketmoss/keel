import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { PositionedCairn } from './CairnLayer'
import type { CairnRecord } from '../photo/useCairnImport'

/* #192 — the facet row inside a trip. Its own file rather than an addition
   to `TripDetail.photos.test.tsx`, for the same reason that file split
   from `TripDetail.test.tsx`: this one needs a real Map ID and a stubbed
   `CairnLayer` so the map half of "one filter, two views" is assertable,
   and neither of those belongs in a suite about something else. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

/* `TripDetail` only mounts `CairnLayer` when a Map ID is configured, and
   there is none in CI — so the map half of the filter would be untestable
   without this. */
vi.mock('../env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../env')>()),
  googleMapsMapId: 'test-map-id',
}))

/* Stubbed rather than rendered: what this suite needs to know is *which
   cairns the map was asked to draw*, which is exactly this prop. The
   unmount cleanup matters — `TripDetail` stops rendering the layer
   entirely once nothing matches, and without it this would keep reporting
   whatever was drawn last. */
const { drawnCairns } = vi.hoisted(() => ({ drawnCairns: { current: [] as PositionedCairn[] } }))
vi.mock('./CairnLayer', () => ({
  CairnLayer: ({ cairns }: { cairns: PositionedCairn[] }) => {
    drawnCairns.current = cairns
    useEffect(
      () => () => {
        drawnCairns.current = []
      },
      [],
    )
    return null
  },
}))

const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { useCairnImport } = vi.hoisted(() => ({ useCairnImport: vi.fn() }))
vi.mock('../photo/useCairnImport', () => ({ useCairnImport }))

vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release: vi.fn() }) },
}))

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size
    },
  }
}

function baseTripImport() {
  return {
    tracks: [],
    missingFiles: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    toggleVisibility: vi.fn(),
    removeFile: vi.fn(),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
  }
}

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'p1',
    name: 'sapporo.jpg',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01',
    ...overrides,
  }
}

/* One of each shape the facet has to tell apart: a bare photo, an
   icon-only hazard, and a campsite that also carries an image — the case
   `cairns.md` says must be findable under both `Photo` and `Campsite`. */
const PHOTO = cairnRecord({ id: 'photo', name: 'photo.jpg', date: '2024-06-01' })
const HAZARD = cairnRecord({
  id: 'hazard',
  name: 'Notch Mountain hazard',
  icon: 'hazard',
  image: null,
  date: '2024-06-02',
})
const PHOTOGRAPHED_CAMPSITE = cairnRecord({
  id: 'campsite',
  name: 'Camp two',
  icon: 'campsite',
  date: '2024-06-03',
})

function baseCairnImport(overrides: Record<string, unknown> = {}) {
  return {
    cairns: [PHOTO, HAZARD, PHOTOGRAPHED_CAMPSITE],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    removeCairn: vi.fn(),
    forgetCairn: vi.fn(),
    removingCairnIds: new Set<string>(),
    cairnRemoveErrors: {},
    ...overrides,
  }
}

function renderTrip() {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <TripDetail
        tripId={entry.id}
        tripStore={store}
        accessToken="token"
        cairnFolderId="cairn-folder-id"
        onBack={() => {}}
        onDropTargetChange={() => {}}
        onGeometryChange={() => {}}
        onNeedsPlacement={() => {}}
        onCreateTargetChange={() => {}}
        onCairnDetailChange={() => {}}
        cairnsDraggable
      />
    </MemoryRouter>,
  )
  return { ...view, store, entry }
}

/** The cairn section's own subtree — `Cairns` is a heading in the panel,
    and scoping to it keeps `Camp two` from colliding with anything a
    track list happens to show. */
function cairnSection(): HTMLElement {
  return document.querySelector('.cairn-list') as HTMLElement
}

function facetChip(name: string): HTMLElement {
  return within(cairnSection()).getByRole('button', { name })
}

function listedNames(): string[] {
  return Array.from(cairnSection().querySelectorAll('.cairn-row__name')).map((el) => el.textContent ?? '')
}

function drawnNames(): string[] {
  return drawnCairns.current.map((cairn) => cairn.name)
}

beforeEach(() => {
  drawnCairns.current = []
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  useCairnImport.mockReset().mockReturnValue(baseCairnImport())
})

describe('TripDetail — #192 the facet row inside a trip', () => {
  it('shows the facet row above the cairn list whenever the trip holds at least one cairn', () => {
    renderTrip()

    const row = within(cairnSection()).getByRole('group', { name: 'Filter cairns' })
    expect(row).toBeDefined()
    // Above the rows, below the header — a filter belongs to the list it
    // filters, and `compareDocumentPosition` is the only way to say so
    // without asserting on markup shape.
    const rows = cairnSection().querySelector('.cairn-list__rows') as HTMLElement
    expect(row.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('hides the facet row for a trip with no cairns at all', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))

    renderTrip()

    expect(within(cairnSection()).queryByRole('group', { name: 'Filter cairns' })).toBeNull()
    expect(screen.getByText('No cairns yet')).toBeDefined()
  })

  it('leaves only cairns carrying that icon in the list, image or no image', () => {
    renderTrip()

    fireEvent.click(facetChip('campsite'))

    expect(listedNames()).toEqual(['Camp two'])
  })

  it('leaves only cairns carrying an image under Photo, whatever their icon', () => {
    renderTrip()

    fireEvent.click(facetChip('Photo'))

    // The photographed campsite appears under both `Photo` and `Campsite`.
    expect(listedNames()).toEqual(['photo.jpg', 'Camp two'])
  })

  it('hides the same cairns from the map — the list and the map never disagree', () => {
    renderTrip()

    expect(drawnNames().sort()).toEqual(listedNames().sort())

    fireEvent.click(facetChip('hazard'))

    expect(listedNames()).toEqual(['Notch Mountain hazard'])
    expect(drawnNames()).toEqual(['Notch Mountain hazard'])
  })

  it('reflects the active facet in the Cairns count, not the trip total', () => {
    renderTrip()

    const count = () => (cairnSection().querySelector('.cairn-list__count') as HTMLElement).textContent

    expect(count()).toBe('3')
    fireEvent.click(facetChip('Photo'))
    expect(count()).toBe('2')
    fireEvent.click(facetChip('water'))
    expect(count()).toBe('0')
  })

  it('restores every cairn in both places under Any', () => {
    renderTrip()

    fireEvent.click(facetChip('hazard'))
    expect(listedNames()).toHaveLength(1)

    fireEvent.click(facetChip('Any'))

    expect(listedNames()).toHaveLength(3)
    expect(drawnNames()).toHaveLength(3)
  })

  it('keeps the facet row up when nothing matches, with the way back in the empty state', () => {
    renderTrip()

    fireEvent.click(facetChip('water'))

    expect(screen.getByText('No cairns like that')).toBeDefined()
    expect(screen.getByText('Clear the filter to see all 3.')).toBeDefined()
    // Still clearable — hiding the control that caused the empty list is
    // the one thing that would make it unrecoverable.
    expect(within(cairnSection()).getByRole('group', { name: 'Filter cairns' })).toBeDefined()
    expect(drawnNames()).toEqual([])
  })

  it('resets to Any on leaving and re-entering the trip', () => {
    const { unmount } = renderTrip()

    fireEvent.click(facetChip('hazard'))
    expect(listedNames()).toEqual(['Notch Mountain hazard'])

    unmount()
    renderTrip()

    expect(facetChip('Any').getAttribute('aria-pressed')).toBe('true')
    expect(listedNames()).toHaveLength(3)
  })

  it('walks only the cairns the facet leaves showing with the lightbox arrows', async () => {
    renderTrip()

    fireEvent.click(facetChip('Photo'))
    // `photo.jpg` (1 Jun) then `Camp two` (3 Jun) — the hazard sits
    // between them by date and must be skipped, not stepped onto.
    fireEvent.click(screen.getByText('photo.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'View photo.jpg larger' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('photo.jpg')

    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Camp two')
    // And that is the end of the filtered list, not of the trip's cairns.
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Camp two')
  })

  it('clears a selection the facet filters out, and does not restore it under Any', () => {
    renderTrip()

    fireEvent.click(screen.getByText('Notch Mountain hazard'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cairnSection().querySelector('.cairn-row--selected')).not.toBeNull()

    fireEvent.click(facetChip('Photo'))
    expect(cairnSection().querySelector('.cairn-row--selected')).toBeNull()

    fireEvent.click(facetChip('Any'))
    // The user picked a filter, not a navigation — a clean slate beats
    // silently re-selecting something they lost the trail to.
    expect(cairnSection().querySelector('.cairn-row--selected')).toBeNull()
  })

  it('clears an expanded row the facet filters out, and leaves one still showing expanded', () => {
    renderTrip()

    fireEvent.click(screen.getByText('photo.jpg'))
    expect(screen.getByText('photo.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(facetChip('hazard'))
    // `hazard` shows only the icon-only cairn — `photo.jpg` is filtered out
    // entirely, so its expansion cannot survive it.
    expect(screen.queryByText('photo.jpg')).toBeNull()

    fireEvent.click(facetChip('Any'))
    expect(screen.getByText('photo.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the track list untouched by the facet', () => {
    renderTrip()

    fireEvent.click(facetChip('water'))

    // The tracks section still renders its own empty state rather than
    // being narrowed by a filter that is not about it.
    expect(screen.getByText('Drop tracks or photos anywhere, or use Import files above.')).toBeDefined()
  })
})
