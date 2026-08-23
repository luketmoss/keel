import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'

/* #269 — the glue that holds `selectedTrackId`. `TrackList.test.tsx` and
   `TrackLayer.test.tsx` each prove their own half in isolation; the
   invariants that live only where the state does — one selection at a
   time, held apart from `expandedTrackId`, self-cleaning when the track is
   removed — are `TripDetail`'s alone. Same scaffold
   `TripDetail.hover.test.tsx` already uses, with `TrackLayer` stubbed to
   report back the `selectedFileId` it was actually given. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

const { lastSelectedFileId } = vi.hoisted(() => ({ lastSelectedFileId: { current: null as string | null } }))
vi.mock('./TrackLayer', () => ({
  computeRenderedTracks: () => [],
  visibleFilesKey: () => '',
  TrackLayer: ({ selectedFileId }: { selectedFileId: string | null }) => {
    lastSelectedFileId.current = selectedFileId
    useEffect(
      () => () => {
        lastSelectedFileId.current = null
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

function mockCairnImport() {
  useCairnImport.mockReturnValue({
    cairns: [],
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

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement
}

beforeEach(() => {
  lastSelectedFileId.current = null
  useTripImport.mockReset()
  useCairnImport.mockReset()
  mockCairnImport()
})

describe('TripDetail — #269 the selected track', () => {
  it('selects a track row on click and reports it to the map', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))

    expect(row('Belford-Oxford').className).toContain('track-row--selected')
    expect(lastSelectedFileId.current).toBe('file-a')
  })

  it('moves the selection rather than accumulating it', () => {
    useTripImport.mockReturnValue(
      baseTripImport({ tracks: [trackFile(), trackFile({ id: 'file-b', name: 'Second day' })] }),
    )

    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(lastSelectedFileId.current).toBe('file-a')

    fireEvent.click(screen.getByText('Second day'))
    expect(row('Belford-Oxford').className).not.toContain('track-row--selected')
    expect(row('Second day').className).toContain('track-row--selected')
    expect(lastSelectedFileId.current).toBe('file-b')
  })

  it('collapsing an expanded row leaves the track selected and its route still emphasised', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()

    const header = screen.getByText('Belford-Oxford').closest('button')!
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(lastSelectedFileId.current).toBe('file-a')

    // Second click collapses the row (#268's toggle) without touching
    // selection (#269's, held apart).
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(row('Belford-Oxford').className).toContain('track-row--selected')
    expect(lastSelectedFileId.current).toBe('file-a')
  })

  it('a multi-track file selects on click, even though its row never expands', () => {
    useTripImport.mockReturnValue(
      baseTripImport({
        tracks: [trackFile({ tracks: [trackFile().tracks[0], trackFile().tracks[0]] })],
      }),
    )

    renderTrip()

    fireEvent.click(document.querySelector('.track-row__name') as HTMLElement)

    expect(document.querySelector('li.track-row')?.className).toContain('track-row--selected')
    expect(lastSelectedFileId.current).toBe('file-a')
  })

  it('keeps the selection when the selected track is hidden with the visibility control', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(lastSelectedFileId.current).toBe('file-a')

    fireEvent.click(screen.getByRole('button', { name: 'Hide Belford-Oxford' }))

    expect(row('Belford-Oxford').className).toContain('track-row--selected')
    expect(lastSelectedFileId.current).toBe('file-a')
  })

  it('clears the selection when the selected track is removed', () => {
    useTripImport.mockImplementation(() => baseTripImport({ tracks: [] }))

    const { rerender, entry, store } = (() => {
      const view = renderTrip()
      return view
    })()

    // Selecting requires the track to exist first — re-render with it
    // present, select, then re-render with it gone the way a live removal
    // would update `tripImport.tracks`.
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    rerender(
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
    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(lastSelectedFileId.current).toBe('file-a')

    useTripImport.mockReturnValue(baseTripImport({ tracks: [] }))
    rerender(
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

    expect(lastSelectedFileId.current).toBeNull()
  })

  it('a track selection and a cairn selection do not clear each other', () => {
    useCairnImport.mockReturnValue({
      cairns: [
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
      ],
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
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))

    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(lastSelectedFileId.current).toBe('file-a')

    fireEvent.click(screen.getByText('sapporo.jpg'))

    // The cairn selected; the track selection is untouched.
    expect(lastSelectedFileId.current).toBe('file-a')
    expect(row('Belford-Oxford').className).toContain('track-row--selected')
  })
})
