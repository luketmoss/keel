import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'

/* #313 — the map-only half of the promotion: `TripDetail` wraps the raw
   `setSelectedCairnId`/`handleSelectRoute` it hands to the map layers so a
   tap that changes the selection also asks the sheet to rise. `CairnLayer`
   is mocked here (its own click plumbing is `CairnLayer.test.tsx`'s job) so
   this file can call `onSelectCairn` directly, the same way
   `TripDetail.reveal.test.tsx` already calls the mocked `TrackLayer`'s
   `onSelectRoute` to test the route half of the same wrapper. */
const fakeMap = { id: 'fake-map' }
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => fakeMap,
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    event: {
      addListener: () => ({ remove: () => {} }),
      addListenerOnce: () => {},
    },
  },
}

/* `CairnLayer` only mounts when `googleMapsMapId` is set (`TripDetail`'s own
   `{googleMapsMapId && positionedCairns.length > 0 && ...}` guard) — it's a
   module-level constant computed once from `import.meta.env` at first
   import, so `vi.stubEnv` in a `beforeEach` (which runs after the module
   graph is already loaded) is too late; mocking the module outright is what
   actually reaches it. */
vi.mock('../env', () => ({ googleMapsMapId: 'test-map-id', googleMapsApiKey: null, googleClientId: null }))

vi.mock('../map/reveal', () => ({
  revealPoints: vi.fn(),
  revealPoint: vi.fn(),
  columnInset: vi.fn(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
}))

const { promote } = vi.hoisted(() => ({ promote: vi.fn() }))
vi.mock('../map/sheetPromotion', () => ({ useSheetPromotion: () => promote }))

const { lastTrackLayerProps } = vi.hoisted(() => ({
  lastTrackLayerProps: {
    current: null as { selectedFileId: string | null; onSelectRoute?: (id: string) => void } | null,
  },
}))
vi.mock('./TrackLayer', () => ({
  computeRenderedTracks: () => [],
  visibleFilesKey: () => '',
  TrackLayer: (props: { selectedFileId: string | null; onSelectRoute?: (id: string) => void }) => {
    lastTrackLayerProps.current = props
    return null
  },
}))

interface CairnLayerProps {
  selectedCairnId: string | null
  onSelectCairn?: (id: string) => void
  /** #276 — the other half of the click `CairnLayer` fires, and now the half
      that carries the promotion. */
  onOpenCairn?: (id: string) => void
}
const { lastCairnLayerProps } = vi.hoisted(() => ({
  lastCairnLayerProps: { current: null as {
    selectedCairnId: string | null
    onSelectCairn?: (id: string) => void
    onOpenCairn?: (id: string) => void
  } | null },
}))
vi.mock('./CairnLayer', () => ({
  CairnLayer: (props: CairnLayerProps) => {
    lastCairnLayerProps.current = props
    return null
  },
}))

const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { useCairnImport } = vi.hoisted(() => ({ useCairnImport: vi.fn() }))
vi.mock('../photo/useCairnImport', () => ({ useCairnImport }))

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

function trackFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  return {
    id: 'file-a',
    name: 'Belford-Oxford',
    sourceName: 'Belford-Oxford.kml',
    driveFileId: 'drive-a',
    tracks: [{ name: 'Belford-Oxford', points: [{ lat: 37, lon: -122 }, { lat: 37.01, lon: -122.01 }] }],
    trackStats: [
      {
        distanceMeters: 10_300,
        durationSeconds: 19_200,
        elevationGainMeters: 690,
        elevationLossMeters: 620,
        highPointMeters: 2100,
        lowPointMeters: 1500,
      },
    ],
    colorIndex: 0,
    visible: true,
    ...overrides,
  }
}

function baseTripImport(overrides: Record<string, unknown> = {}) {
  return {
    tracks: [] as ImportedFile[],
    missingFiles: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    toggleVisibility: vi.fn(),
    removeFile: vi.fn().mockResolvedValue(undefined),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn().mockResolvedValue(true),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
    forgetFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function mockCairnImport(cairns: unknown[] = [], overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  })
}

function renderTrip(props: { onDropTargetChange?: (h: ((files: File[]) => void) | null) => void } = {}) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Larapinta')
  render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <TripDetail
        tripId={entry.id}
        tripStore={store}
        accessToken="token"
        cairnFolderId="cairn-folder-id"
        onBack={() => {}}
        onDropTargetChange={props.onDropTargetChange ?? (() => {})}
        onGeometryChange={() => {}}
        onNeedsPlacement={() => {}}
        onCreateTargetChange={() => {}}
        onCairnDetailChange={() => {}}
        cairnsDraggable
      />
    </MemoryRouter>,
  )
  return { store, entry }
}

beforeEach(() => {
  lastTrackLayerProps.current = null
  lastCairnLayerProps.current = null
  useTripImport.mockReset()
  useCairnImport.mockReset()
  promote.mockClear()
  mockCairnImport()
})

/** #313's marker tap is the pair `CairnLayer`/`Cairn3DLayer` actually fire —
    `onSelectCairn` then `onOpenCairn`, in that order. Driving only the first
    used to be enough, because #313's guard lived in front of the pair; #276
    moved it into `selectCairn`, which is what `onOpenCairn` calls, so a test
    that fires half the gesture now measures half the behaviour. */
function tapCairnMarker(id: string) {
  act(() => {
    lastCairnLayerProps.current?.onSelectCairn?.(id)
    lastCairnLayerProps.current?.onOpenCairn?.(id)
  })
}

describe('TripDetail — #313/#276 sheet promotion', () => {
  it('promotes when a cairn marker selects something new', () => {
    useTripImport.mockReturnValue(baseTripImport())
    mockCairnImport([
      {
        id: 'p1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
        description: '',
        date: '2024-06-01',
      },
    ])
    renderTrip()

    tapCairnMarker('p1')

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('does not promote on a repeat tap of the already-expanded cairn — #250s toggle, not an opening', () => {
    useTripImport.mockReturnValue(baseTripImport())
    mockCairnImport([
      {
        id: 'p1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
        description: '',
        date: '2024-06-01',
      },
    ])
    renderTrip()

    tapCairnMarker('p1')
    promote.mockClear()
    tapCairnMarker('p1')

    expect(promote).not.toHaveBeenCalled()
  })

  it('promotes when a route tap selects a different track', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    act(() => lastTrackLayerProps.current?.onSelectRoute?.('file-a'))

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('does not promote on a second route tap on the already-selected track — it only collapses the row', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    act(() => lastTrackLayerProps.current?.onSelectRoute?.('file-a'))
    promote.mockClear()
    act(() => lastTrackLayerProps.current?.onSelectRoute?.('file-a'))

    expect(promote).not.toHaveBeenCalled()
  })

  it('promotes on a route tap that switches to a different track after one was already selected', () => {
    useTripImport.mockReturnValue(
      baseTripImport({ tracks: [trackFile(), trackFile({ id: 'file-b', name: 'Second' })] }),
    )
    renderTrip()

    act(() => lastTrackLayerProps.current?.onSelectRoute?.('file-a'))
    promote.mockClear()
    act(() => lastTrackLayerProps.current?.onSelectRoute?.('file-b'))

    expect(promote).toHaveBeenCalledTimes(1)
  })

  /* #276 — the row half of the same promotion. #250 and #268 both specified
     it in their own Edge Cases tables and neither wired it up; #313 built the
     mechanism and left the list alone. These drive the real `CairnList` and
     `TrackList` rows rather than a mocked prop, since the whole point is that
     the row's own path reaches the sheet. */

  it('promotes when a collapsed cairn row is tapped', () => {
    useTripImport.mockReturnValue(baseTripImport())
    mockCairnImport([
      {
        id: 'p1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
        description: '',
        date: '2024-06-01',
      },
    ])
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('does not promote when the tap collapses the cairn row it had already expanded', () => {
    useTripImport.mockReturnValue(baseTripImport())
    mockCairnImport([
      {
        id: 'p1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
        description: '',
        date: '2024-06-01',
      },
    ])
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))
    promote.mockClear()
    fireEvent.click(screen.getByText('sapporo.jpg'))

    expect(promote).not.toHaveBeenCalled()
  })

  it('promotes when a collapsed track row is tapped', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford', { exact: false }))

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('promotes from the track row whitespace too, not only its header button', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    fireEvent.click(document.querySelector('.track-row__main') as HTMLElement)

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('does not promote when the tap collapses the track row it had already expanded', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    // The row's header, by its class rather than its name: an expanded track
    // row prints the track's name a second time in its body, so `getByText`
    // stops being unambiguous after the first click.
    const header = document.querySelector('.track-row__main') as HTMLElement
    fireEvent.click(header)
    promote.mockClear()
    fireEvent.click(header)

    expect(promote).not.toHaveBeenCalled()
  })

  /* #276's one deliberate change to #313's shipped behaviour: the guard reads
     the row's expansion, not the selection, so a marker tap on a cairn that is
     still selected but whose row was collapsed promotes — it is opening a row
     into a sliver, which is the complaint. #313's selection guard declined
     here. */
  it('promotes a marker tap that reopens the still-selected cairn whose row was collapsed', () => {
    useTripImport.mockReturnValue(baseTripImport())
    mockCairnImport([
      {
        id: 'p1',
        name: 'sapporo.jpg',
        position: { lat: 43, lng: 141 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
        description: '',
        date: '2024-06-01',
      },
    ])
    renderTrip()

    tapCairnMarker('p1')
    tapCairnMarker('p1')
    expect(lastCairnLayerProps.current?.selectedCairnId).toBe('p1')
    promote.mockClear()

    tapCairnMarker('p1')

    expect(promote).toHaveBeenCalledTimes(1)
  })

  /* #269 — a multi-track file's row selects as a unit and has no detail to
     open (`TrackList.canOpenDetail`). Nothing opened, so nothing is hidden by
     the sheet, so the sheet does not move. */
  it('does not promote from the whitespace of a row that cannot expand', () => {
    useTripImport.mockReturnValue(
      baseTripImport({
        tracks: [
          trackFile({
            tracks: [
              { name: 'Day one', points: [{ lat: 37, lon: -122 }, { lat: 37.01, lon: -122.01 }] },
              { name: 'Day two', points: [{ lat: 38, lon: -123 }, { lat: 38.01, lon: -123.01 }] },
            ],
          }),
        ],
      }),
    )
    renderTrip()

    fireEvent.click(document.querySelector('.track-row__main') as HTMLElement)

    expect(promote).not.toHaveBeenCalled()
  })

  /* #276's States table: a cairn mid-attach (#157) opens its face instead of
     expanding, and #258's `detailOpen` is what moves the sheet for it. The
     promotion must not fire a second time from here. */
  it('does not promote for a cairn mid-attach — that path opens a face, and #258 promotes for it', async () => {
    useTripImport.mockReturnValue(baseTripImport())
    let attachDone: ((result: { ok: boolean }) => void) | undefined
    const attachImage = vi.fn(
      () => new Promise<{ ok: boolean }>((resolve) => { attachDone = resolve }),
    )
    mockCairnImport(
      [
        {
          id: 'p1',
          name: 'sapporo.jpg',
          position: { lat: 43, lng: 141 },
          positionSource: 'exif',
          icon: 'campsite',
          image: null,
          description: '',
          date: '2024-06-01',
        },
      ],
      { attachImage },
    )
    let drop: ((files: File[]) => void) | null = null
    renderTrip({ onDropTargetChange: (handler) => { drop = handler } })

    fireEvent.click(screen.getByText('sapporo.jpg'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open sapporo.jpg' }))
    await screen.findByRole('dialog')
    await act(async () => {
      drop?.([new File(['a'], 'first.jpg')])
    })
    expect(attachImage).toHaveBeenCalled()
    promote.mockClear()

    // The row for the cairn whose upload is still running: `selectCairn`
    // returns down the #157 branch, before the promotion.
    act(() => {
      lastCairnLayerProps.current?.onOpenCairn?.('p1')
    })

    expect(promote).not.toHaveBeenCalled()
    await act(async () => {
      attachDone?.({ ok: true })
    })
  })
})
