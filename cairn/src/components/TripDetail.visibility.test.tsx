import { useEffect, useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { PositionedCairn } from './CairnLayer'
import type { CairnRecord } from '../photo/useCairnImport'
import type { ImportedFile } from '../import/types'

/* #198 — a cairn's visibility follows the tracks of the day it happened
   on. Its own file, alongside `TripDetail.facets.test.tsx` and for the
   same reason that one split off: it needs a real Map ID and a stubbed
   `CairnLayer` to see what the map was asked to draw, plus a
   `useTripImport` mock that really toggles, which no other suite wants. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

vi.mock('../env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../env')>()),
  googleMapsMapId: 'test-map-id',
}))

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

/* Longitude 0 throughout, so `tripUtcOffsetHours` gives +0 and the day a
   timestamp falls on reads straight off its digits. The offset arithmetic
   itself is `cairnAttachment.test.ts`'s to prove; this suite is about what
   the trip face does with the answer. */
function trackFile(id: string, name: string, times: string[]): ImportedFile {
  return {
    id,
    name,
    driveFileId: `drive-${id}`,
    tracks: [{ name, points: times.map((time) => ({ lat: 0, lon: 0, time })) }],
    trackStats: [{ distanceMeters: 0, durationSeconds: undefined, elevationGainMeters: undefined }],
    colorIndex: 0,
    visible: true,
  }
}

const DAY_ONE = trackFile('day-one', 'Day one', ['2024-06-01T02:00:00Z', '2024-06-01T09:00:00Z'])
const DAY_TWO = trackFile('day-two', 'Day two', ['2024-06-02T02:00:00Z', '2024-06-02T09:00:00Z'])
/** A second track over the same ground on day one — the two-tracks-one-day
    case, where a cairn survives either one being hidden. */
const DAY_ONE_AGAIN = trackFile('day-one-again', 'Day one again', [
  '2024-06-01T04:00:00Z',
  '2024-06-01T05:00:00Z',
])
/** Imported without timestamps, so it covers no days and attaches nothing. */
const UNTIMED = {
  ...trackFile('untimed', 'Untimed', []),
  tracks: [
    {
      name: 'Untimed',
      points: [
        { lat: 0, lon: 0 },
        { lat: 0.01, lon: 0.01 },
      ],
    },
  ],
}

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'c1',
    name: 'a.jpg',
    position: { lat: 0, lng: 0 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01',
    ...overrides,
  }
}

const ON_DAY_ONE = cairnRecord({ id: 'on-day-one', name: 'day one.jpg', date: '2024-06-01' })
const ON_DAY_TWO = cairnRecord({ id: 'on-day-two', name: 'day two.jpg', date: '2024-06-02' })
/** A date no track covers — unattached, and so is the undated one below. */
const OFF_TRIP = cairnRecord({ id: 'off-trip', name: 'off trip.jpg', date: '2024-07-14' })
const UNDATED = cairnRecord({ id: 'undated', name: 'undated.jpg', date: null })

/** The `useTripImport` mock as a real hook, so `toggleVisibility` actually
    flips a file's `visible` and re-renders — which is the whole gesture
    under test, and a `vi.fn()` returning a frozen array cannot express it. */
function mockTripImport(files: ImportedFile[]) {
  useTripImport.mockImplementation(() => {
    const [tracks, setTracks] = useState(files)
    return {
      tracks,
      missingFiles: [],
      loading: false,
      progress: [],
      failures: [],
      importFiles: vi.fn().mockResolvedValue(undefined),
      retryFailure: vi.fn().mockResolvedValue(undefined),
      dismissFailures: vi.fn(),
      toggleVisibility: (id: string) =>
        setTracks((prev) =>
          prev.map((file) => (file.id === id ? { ...file, visible: !file.visible } : file)),
        ),
      removeFile: vi.fn(),
      removingTrackIds: new Set<string>(),
      trackRemoveErrors: {},
      renameTrack: vi.fn(),
      recolorTrack: vi.fn(),
      reorderTracks: vi.fn(),
    }
  })
}

function mockCairnImport(cairns: CairnRecord[]) {
  useCairnImport.mockReturnValue({
    cairns,
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
  })
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

function cairnSection(): HTMLElement {
  return document.querySelector('.cairn-list') as HTMLElement
}

function drawnNames(): string[] {
  return drawnCairns.current.map((cairn) => cairn.name).sort()
}

function listedNames(): string[] {
  return Array.from(cairnSection().querySelectorAll('.cairn-row__name')).map((el) => el.textContent ?? '')
}

function hideTrack(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Hide ${name}` }))
}

function showTrack(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Show ${name}` }))
}

beforeEach(() => {
  drawnCairns.current = []
  useTripImport.mockReset()
  useCairnImport.mockReset()
})

describe('TripDetail — #198 cairns follow the track of their day', () => {
  it('hiding a track hides, from the map, the cairns whose day only it covers', () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO])
    renderTrip()

    expect(drawnNames()).toEqual(['day one.jpg', 'day two.jpg'])

    hideTrack('Day one')

    expect(drawnNames()).toEqual(['day two.jpg'])
  })

  it('showing that track again shows those cairns again', () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO])
    renderTrip()

    hideTrack('Day one')
    showTrack('Day one')

    expect(drawnNames()).toEqual(['day one.jpg', 'day two.jpg'])
  })

  it('a cairn covered by two tracks stays until both are hidden', () => {
    mockTripImport([DAY_ONE, DAY_ONE_AGAIN])
    mockCairnImport([ON_DAY_ONE])
    renderTrip()

    hideTrack('Day one')
    expect(drawnNames()).toEqual(['day one.jpg'])

    hideTrack('Day one again')
    expect(drawnNames()).toEqual([])
  })

  it('hiding every track hides every attached cairn', () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO])
    renderTrip()

    hideTrack('Day one')
    hideTrack('Day two')

    expect(drawnNames()).toEqual([])
  })

  it('hiding a track carrying no timed points affects no cairn', () => {
    mockTripImport([DAY_ONE, UNTIMED])
    mockCairnImport([ON_DAY_ONE])
    renderTrip()

    hideTrack('Untimed')

    expect(drawnNames()).toEqual(['day one.jpg'])
  })

  it('leaves an unattached cairn alone through every track toggle', () => {
    mockTripImport([DAY_ONE])
    mockCairnImport([ON_DAY_ONE, OFF_TRIP, UNDATED])
    renderTrip()

    hideTrack('Day one')

    expect(drawnNames()).toEqual(['off trip.jpg', 'undated.jpg'])
  })

  it('groups unattached cairns — dated or not — under their own heading and control', () => {
    mockTripImport([DAY_ONE])
    mockCairnImport([ON_DAY_ONE, OFF_TRIP, UNDATED])
    renderTrip()

    expect(within(cairnSection()).getByText('Unattached')).toBeDefined()
    // The attached one first, then the heading, then both unattached.
    expect(listedNames()).toEqual(['day one.jpg', 'off trip.jpg', 'undated.jpg'])
  })

  it("the unattached group's control hides and shows only that group", () => {
    mockTripImport([DAY_ONE])
    mockCairnImport([ON_DAY_ONE, OFF_TRIP, UNDATED])
    renderTrip()

    fireEvent.click(screen.getByRole('button', { name: 'Hide unattached cairns' }))
    expect(drawnNames()).toEqual(['day one.jpg'])

    fireEvent.click(screen.getByRole('button', { name: 'Show unattached cairns' }))
    expect(drawnNames()).toEqual(['day one.jpg', 'off trip.jpg', 'undated.jpg'])
  })

  it("a hidden cairn's row stays, in the hidden treatment, and still opens its detail face", () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO])
    renderTrip()

    hideTrack('Day one')

    // Still listed, and marked hidden rather than removed.
    expect(listedNames()).toEqual(['day one.jpg', 'day two.jpg'])
    const row = cairnSection().querySelector('[data-hidden="true"]') as HTMLElement
    expect(within(row).getByText('day one.jpg')).toBeDefined()

    // Still clickable — the lightbox opens on the cairn the map is no
    // longer drawing. The row's own open button, not the `⋮` beside it,
    // whose label carries the same name.
    fireEvent.click(row.querySelector('.cairn-row__button') as HTMLElement)
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('the Cairns count stays the number in the trip, not the number showing', () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO])
    renderTrip()

    const count = () => (cairnSection().querySelector('.cairn-list__count') as HTMLElement).textContent

    expect(count()).toBe('2')
    hideTrack('Day one')
    expect(count()).toBe('2')
    expect(drawnNames()).toEqual(['day two.jpg'])
  })

  it('does not persist: a fresh mount of the same trip shows everything again', () => {
    mockTripImport([DAY_ONE, DAY_TWO])
    mockCairnImport([ON_DAY_ONE, ON_DAY_TWO, UNDATED])
    const { unmount } = renderTrip()

    hideTrack('Day one')
    fireEvent.click(screen.getByRole('button', { name: 'Hide unattached cairns' }))
    expect(drawnNames()).toEqual(['day two.jpg'])
    unmount()

    renderTrip()

    expect(drawnNames()).toEqual(['day one.jpg', 'day two.jpg', 'undated.jpg'])
  })
})
