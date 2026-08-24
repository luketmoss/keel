import { act, render } from '@testing-library/react'
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

const { lastCairnLayerProps } = vi.hoisted(() => ({
  lastCairnLayerProps: {
    current: null as { selectedCairnId: string | null; onSelectCairn?: (id: string) => void } | null,
  },
}))
vi.mock('./CairnLayer', () => ({
  CairnLayer: (props: { selectedCairnId: string | null; onSelectCairn?: (id: string) => void }) => {
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

function mockCairnImport(cairns: unknown[] = []) {
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
  const entry = store.createTrip('Larapinta')
  render(
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

describe('TripDetail — #313 sheet promotion', () => {
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

    act(() => lastCairnLayerProps.current?.onSelectCairn?.('p1'))

    expect(promote).toHaveBeenCalledTimes(1)
  })

  it('does not promote on a repeat tap of the already-selected cairn — #250s toggle, not a new selection', () => {
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

    act(() => lastCairnLayerProps.current?.onSelectCairn?.('p1'))
    promote.mockClear()
    act(() => lastCairnLayerProps.current?.onSelectCairn?.('p1'))

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
})
