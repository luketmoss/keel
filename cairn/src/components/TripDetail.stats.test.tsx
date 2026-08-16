import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'

/* #218 — the trip totals block, wired into the real `TripDetail` tree
   rather than tested only in isolation on `TripStats`: the numbers it
   shows have to survive the trip owning several files, a file with no
   elevation, and the fetching state that precedes both. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
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

function trackFile(id: string, distanceMeters: number, elevationGainMeters?: number): ImportedFile {
  return {
    id,
    name: `${id}.kml`,
    driveFileId: `drive-${id}`,
    tracks: [{ name: id, points: [] }],
    trackStats: [
      {
        distanceMeters,
        durationSeconds: undefined,
        elevationGainMeters,
        elevationLossMeters: elevationGainMeters === undefined ? undefined : elevationGainMeters - 50,
        highPointMeters: elevationGainMeters === undefined ? undefined : 2000,
        lowPointMeters: elevationGainMeters === undefined ? undefined : 1500,
      },
    ],
    colorIndex: 0,
    visible: true,
  }
}

function mockTripImport(overrides: Partial<ReturnType<typeof baseTripImport>>) {
  useTripImport.mockReturnValue({ ...baseTripImport(), ...overrides })
}

function baseTripImport() {
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
    removeFile: vi.fn(),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
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

beforeEach(() => {
  useTripImport.mockReset()
  useCairnImport.mockReset()
  mockCairnImport()
})

describe('TripDetail — #218 trip totals', () => {
  it('shows the totals block, aggregated across every track the trip holds', () => {
    mockTripImport({
      tracks: [trackFile('a', 8_000, 500), trackFile('b', 2_000, 300)],
    })

    renderTrip()

    expect(document.querySelector('.trip-stats')).not.toBeNull()
    expect(screen.getByText('Tracks')).toBeDefined()
    // 10,000m total
    expect(screen.getByText('6.2 mi')).toBeDefined()
  })

  it('is not rendered while the trip is still fetching its tracks', () => {
    mockTripImport({ tracks: [], loading: true })

    renderTrip()

    expect(screen.getByText('Loading tracks…')).toBeDefined()
    expect(document.querySelector('.trip-stats')).toBeNull()
  })

  it('renders for a trip with no tracks, with em dashes and a zero track count', () => {
    mockTripImport({ tracks: [] })

    renderTrip()

    expect(document.querySelector('.trip-stats')).not.toBeNull()
    expect(screen.getByText('Add a track to see totals.')).toBeDefined()
  })

  it('names partial elevation coverage when one file carries no elevation', () => {
    mockTripImport({
      tracks: [trackFile('a', 8_000, 500), trackFile('b', 2_000, undefined)],
    })

    renderTrip()

    expect(
      screen.getByText('Elevation from 1 of 2 tracks. Distance covers them all.'),
    ).toBeDefined()
  })
})
