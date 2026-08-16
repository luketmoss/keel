import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'
import { formatElevationGain } from '../format/units'

/* #226 — a trip-owned track's own face: `/tracks/:id` serving a track this
   trip holds, not only a loose one. Same scaffold `TripDetail.stats.test.tsx`
   already uses for a mocked `useTripImport`, plus a location probe so a
   test can see where `TripDetail`'s own `navigate()` calls land without
   rendering the rest of the shell that would normally read the URL. */
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

/* A single elevated track, points carrying enough elevation variation for
   `computeElevationProfile` to draw something — the same series shape
   #219's own tests used. */
const ELEVATIONS = [1000, 1000, 1000, 1010, 1020, 1035, 1050, 1050, 1050, 1045, 1030, 1010, 1000]

function trackFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  return {
    id: 'file-a',
    name: 'Belford-Oxford',
    sourceName: 'Belford-Oxford.kml',
    driveFileId: 'drive-a',
    tracks: [
      {
        name: 'Belford-Oxford',
        points: ELEVATIONS.map((elevation, i) => ({ lat: 37 + i * 0.001, lon: -122, elevation })),
      },
    ],
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
    removeFile: vi.fn().mockResolvedValue(undefined),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn().mockResolvedValue(true),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
    forgetFile: vi.fn().mockResolvedValue(undefined),
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderTrip(openTrackId: string | undefined, extraProps: Record<string, unknown> = {}) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Larapinta')
  const onTrackDetailChange = vi.fn()
  const onRemoveFromTrip = vi.fn().mockResolvedValue(true)
  const view = render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <LocationProbe />
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
        openTrackId={openTrackId}
        onTrackDetailChange={onTrackDetailChange}
        onRemoveFromTrip={onRemoveFromTrip}
        {...extraProps}
      />
    </MemoryRouter>,
  )
  return { ...view, store, entry, onTrackDetailChange, onRemoveFromTrip }
}

beforeEach(() => {
  useTripImport.mockReset()
  useCairnImport.mockReset()
  mockCairnImport()
})

describe('TripDetail — #226 the track face for a trip-owned track', () => {
  it('shows the six stats, through the shared formatter, plus the footnote', () => {
    useTripImport.mockReturnValue({ ...baseTripImport(), tracks: [trackFile()] })

    renderTrip('file-a')

    // Scoped to the face itself — the row beneath it (hidden, not
    // unmounted) shows the same ascent value in its own meta line.
    const face = within(document.querySelector('.loose-face') as HTMLElement)
    // #226's bug fix: ascent reads through `formatElevationGain`/`SYSTEM`,
    // not raw metres.
    expect(face.getByText(formatElevationGain(690)!)).toBeDefined()
    expect(face.getByText('Descent')).toBeDefined()
    expect(face.getByText('High point')).toBeDefined()
    expect(face.getByText('Low point')).toBeDefined()
    expect(face.getByText('Duration')).toBeDefined()
    expect(face.getByText('13 points · Belford-Oxford.kml')).toBeDefined()
    expect(document.querySelector('.track-elevation-profile')).not.toBeNull()
  })

  it('reports the open track up, and hides the trip list beneath the face', () => {
    useTripImport.mockReturnValue({ ...baseTripImport(), tracks: [trackFile()] })

    const { onTrackDetailChange } = renderTrip('file-a')

    expect(onTrackDetailChange).toHaveBeenCalledWith({ name: 'Belford-Oxford' })
    expect(document.querySelector('.trip-detail__body')).toHaveProperty('hidden', true)
  })

  it("Remove from trip is the face's primary action, and calls the same handler the row's menu uses", () => {
    useTripImport.mockReturnValue({ ...baseTripImport(), tracks: [trackFile()] })

    const { onRemoveFromTrip } = renderTrip('file-a')

    fireEvent.click(screen.getByRole('button', { name: 'Remove from trip' }))

    expect(onRemoveFromTrip).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-a' }))
  })

  it('renames from the face, via the ⋮', async () => {
    const renameTrack = vi.fn().mockResolvedValue(true)
    useTripImport.mockReturnValue({ ...baseTripImport(), tracks: [trackFile()], renameTrack })

    renderTrip('file-a')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Belford-Oxford' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const input = screen.getByDisplayValue('Belford-Oxford')
    fireEvent.change(input, { target: { value: 'Ridge day' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(renameTrack).toHaveBeenCalledWith('file-a', 'Ridge day')
  })

  it('is absent for a multi-track file, and the URL bounces back to the trip', () => {
    useTripImport.mockReturnValue({
      ...baseTripImport(),
      tracks: [trackFile({ tracks: [trackFile().tracks[0], trackFile().tracks[0]] })],
    })

    const { entry } = renderTrip('file-a')

    expect(document.querySelector('.loose-face')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe(`/trips/${entry.id}`)
  })

  it('a track removed while its face is open closes it without error, returning to the trip', () => {
    useTripImport.mockImplementation(() => {
      const [tracks, setTracks] = useState<ImportedFile[]>([trackFile()])
      return {
        ...baseTripImport(),
        tracks,
        removeFile: async (id: string) => {
          setTracks((prev) => prev.filter((f) => f.id !== id))
        },
      }
    })

    const { entry } = renderTrip('file-a')
    expect(document.querySelector('.loose-face')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Belford-Oxford' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(document.querySelector('.loose-face')).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe(`/trips/${entry.id}`)
  })

  it('omits the profile and shows dashes when the track has no usable elevation', () => {
    useTripImport.mockReturnValue({
      ...baseTripImport(),
      tracks: [
        trackFile({
          tracks: [{ name: 'Flat', points: [{ lat: 1, lon: 2 }, { lat: 1.001, lon: 2 }] }],
          trackStats: [
            {
              distanceMeters: 1000,
              durationSeconds: 60,
              elevationGainMeters: undefined,
              elevationLossMeters: undefined,
              highPointMeters: undefined,
              lowPointMeters: undefined,
            },
          ],
        }),
      ],
    })

    renderTrip('file-a')

    const faceEl = document.querySelector('.loose-face') as HTMLElement
    expect(within(faceEl).queryByRole('img', { name: /Elevation profile/ })).toBeNull()
    expect(faceEl.querySelectorAll('.stat__value--muted').length).toBe(4)
  })
})
