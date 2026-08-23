import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'

/* #270 — the glue between a selection and the map's reveal, and between a
   route click and the selection. `reveal.test.ts` proves the camera rule in
   isolation; `TrackLayer.test.tsx` proves the hit line's own click/hover
   wiring. What only exists here is that `TripDetail` calls `revealPoints`
   with *this trip's* points when `selectedTrackId`/`selectedCairnId`
   change, and that a route click performs the same select-then-toggle pair
   the row's own header click does. Same scaffold
   `TripDetail.selection.test.tsx` already uses, with a non-null fake map so
   the reveal effects actually run, and `../map/reveal` mocked to capture
   what they call it with. */
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

const { revealPoints, columnInset } = vi.hoisted(() => ({
  revealPoints: vi.fn(),
  columnInset: vi.fn(() => ({ left: 0, right: 0, top: 0, bottom: 0 })),
}))
vi.mock('../map/reveal', () => ({ revealPoints, columnInset }))

const { lastTrackLayerProps } = vi.hoisted(() => ({
  lastTrackLayerProps: {
    current: null as {
      selectedFileId: string | null
      onSelectRoute?: (id: string) => void
      onHoverFile?: (id: string | null) => void
      hitLinesEnabled?: boolean
    } | null,
  },
}))
vi.mock('./TrackLayer', () => ({
  computeRenderedTracks: () => [],
  visibleFilesKey: () => '',
  TrackLayer: (props: {
    selectedFileId: string | null
    onSelectRoute?: (id: string) => void
    onHoverFile?: (id: string | null) => void
    hitLinesEnabled?: boolean
  }) => {
    lastTrackLayerProps.current = props
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

function renderTrip(overrides: { revealSuspended?: boolean } = {}) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Larapinta')
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
        {...overrides}
      />
    </MemoryRouter>,
  )
  return { ...view, store, entry }
}

beforeEach(() => {
  lastTrackLayerProps.current = null
  useTripImport.mockReset()
  useCairnImport.mockReset()
  revealPoints.mockClear()
  columnInset.mockClear()
  mockCairnImport()
})

describe('TripDetail — #270 reveal', () => {
  it('reveals the selected track, with its normalised geometry, when a row is clicked', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()
    fireEvent.click(screen.getByText('Belford-Oxford'))

    expect(revealPoints).toHaveBeenCalledTimes(1)
    expect(revealPoints).toHaveBeenCalledWith(
      fakeMap,
      [{ lat: 37, lng: -122 }, { lat: 37.01, lng: -122.01 }],
      { left: 0, right: 0, top: 0, bottom: 0 },
    )
  })

  it('reveals the selected cairn at its own coordinate', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [] }))
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

    expect(revealPoints).toHaveBeenCalledWith(fakeMap, [{ lat: 43, lng: 141 }], {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    })
  })

  it('does not reveal, and disables the route hit lines, while a decision owns the map', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip({ revealSuspended: true })
    expect(lastTrackLayerProps.current?.hitLinesEnabled).toBe(false)

    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(revealPoints).not.toHaveBeenCalled()
  })

  it('a route click on the map selects the file and expands its row, matching the row header click', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()
    act(() => lastTrackLayerProps.current!.onSelectRoute!('file-a'))

    const header = screen.getByText('Belford-Oxford').closest('button')!
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(lastTrackLayerProps.current?.selectedFileId).toBe('file-a')
  })

  it('a second route click on the selected track collapses its row but leaves it selected', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()
    act(() => lastTrackLayerProps.current!.onSelectRoute!('file-a'))
    act(() => lastTrackLayerProps.current!.onSelectRoute!('file-a'))

    const header = screen.getByText('Belford-Oxford').closest('button')!
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(lastTrackLayerProps.current?.selectedFileId).toBe('file-a')
  })

  it('a route hover on the map highlights its row, and leaving clears it — the map-to-row direction', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()
    const row = screen.getByText('Belford-Oxford').closest('li') as HTMLElement

    act(() => lastTrackLayerProps.current!.onHoverFile!('file-a'))
    expect(row.className).toContain('track-row--hovered')

    act(() => lastTrackLayerProps.current!.onHoverFile!(null))
    expect(row.className).not.toContain('track-row--hovered')
  })
})
