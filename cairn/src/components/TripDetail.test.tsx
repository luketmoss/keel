import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'

/* Same stub App.test.tsx/MapView.test.tsx use — keeps Google's script and
   network calls out of this suite. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

/* This suite is about #51's partitioning — which files a mixed drop/pick
   sends to which pipeline, and that the two pipelines' progress/failures
   render together under the one widened control. The pipelines
   themselves (Drive calls, EXIF, thumbnails) are `useTripImport`'s and
   `useCairnImport`'s own suites' job, so both hooks are mocked here. */
const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { useCairnImport } = vi.hoisted(() => ({ useCairnImport: vi.fn() }))
vi.mock('../photo/useCairnImport', () => ({ useCairnImport }))

/* The trip face renders `TrackLayer` itself now, rather than through a
   `MapView` that short-circuited to "map unavailable" whenever no API key
   was configured. `TrackLayer` reaches for `google.maps.SymbolPath` while
   building its point markers, so the suite has to provide the global the
   old short-circuit was accidentally hiding. */
;(globalThis as unknown as { google: unknown }).google = {
  maps: {
    SymbolPath: { CIRCLE: 0 },
    event: { addListener: () => ({ remove: () => {} }), addListenerOnce: () => {} },
  },
}

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

function baseTripImport(overrides: Partial<ReturnType<typeof useTripImport>> = {}) {
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
    ...overrides,
  }
}

function baseCairnImport(overrides: Partial<ReturnType<typeof useCairnImport>> = {}) {
  return {
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
    ...overrides,
  }
}

function fileDataTransfer(names: string[]): DataTransfer {
  return {
    types: ['Files'],
    files: names.map((name) => new File(['x'], name)) as unknown as FileList,
  } as unknown as DataTransfer
}

/** The trip face no longer owns the page, so it no longer catches the drop
    itself — it registers a handler and the shell routes drops to it. This
    stands in for the shell, wired exactly the way `App.tsx` wires it, so
    the drop tests below still exercise the real path. */
function TripHarness({
  store,
  tripId,
  signedIn,
}: {
  store: LocalTripStore
  tripId: string
  signedIn: boolean
}) {
  const [dropTarget, setDropTarget] = useState<((files: File[]) => void) | null>(null)
  return (
    <div
      className="app"
      onDrop={(event) => {
        event.preventDefault()
        dropTarget?.(Array.from(event.dataTransfer.files))
      }}
    >
      <TripDetail
        tripId={tripId}
        tripStore={store}
        accessToken={signedIn ? 'token' : null}
        cairnFolderId={signedIn ? 'cairn-folder-id' : null}
        onBack={() => {}}
        onDropTargetChange={(handler) => setDropTarget(() => handler)}
        onGeometryChange={() => {}}
        onNeedsPlacement={() => {}}
      />
    </div>
  )
}

function renderTrip(options: { signedIn?: boolean } = {}) {
  const { signedIn = true } = options
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <TripHarness store={store} tripId={entry.id} signedIn={signedIn} />
    </MemoryRouter>,
  )
  return { ...view, store, entry }
}

beforeEach(() => {
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  useCairnImport.mockReset().mockReturnValue(baseCairnImport())
})

// Skipped: this file leaks memory unboundedly under vitest, standalone —
// not a combination effect with other files. Confirmed by bisection; root
// cause not yet identified. See #180 before re-enabling.
describe.skip('TripDetail — #51 partitioning a mixed drop between tracks and photos', () => {
  it('sends .kml/.kmz files to useTripImport and images to useCairnImport from a single drop', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, {
        dataTransfer: fileDataTransfer(['day-1.kml', 'day-2.kmz', 'IMG_1.jpg', 'IMG_2.png']),
      })
    })

    expect(tripImportFiles).toHaveBeenCalledTimes(1)
    expect(tripImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['day-1.kml', 'day-2.kmz'])

    expect(cairnImportFiles).toHaveBeenCalledTimes(1)
    expect(cairnImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['IMG_1.jpg', 'IMG_2.png'])
  })

  it('sends every file to useCairnImport (never useTripImport) from a picker selection with images only', () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const photos = [new File(['a'], 'a.jpg'), new File(['b'], 'b.webp')]

    fireEvent.change(input, { target: { files: photos } })

    expect(cairnImportFiles).toHaveBeenCalledWith(photos)
    expect(tripImportFiles).not.toHaveBeenCalled()
  })

  it('shows the widened control label and accept list', () => {
    renderTrip()

    expect(screen.getByRole('button', { name: 'Import files' })).toBeDefined()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('.kml,.kmz,.jpg,.jpeg,.png,.webp')
  })

  /* The widened drop-overlay copy is asserted in App.test.tsx now — the
     shell renders the overlay, and the trip face only registers the
     handler that tells it a trip is open. */

  it('merges progress and failures from both pipelines under the one control', () => {
    useTripImport.mockReturnValue(
      baseTripImport({
        progress: [{ id: 'progress-1', name: 'day-1.kml', index: 1, total: 2, phase: 'uploading' }],
      }),
    )
    useCairnImport.mockReturnValue(
      baseCairnImport({ failures: [{ id: 'photo-failure-1', name: 'IMG_1.heic', message: 'heic message' }] }),
    )

    renderTrip()

    expect(screen.getByText('day-1.kml — 1 of 2')).toBeDefined()
    expect(screen.getByText('IMG_1.heic')).toBeDefined()
    expect(screen.getByText(/heic message/)).toBeDefined()
  })

  it('routes a retry to the pipeline that owns the failure id', () => {
    const tripRetry = vi.fn().mockResolvedValue(undefined)
    const photoRetry = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(
      baseTripImport({
        failures: [{ id: 'failure-1', name: 'day.kml', message: 'could not be uploaded, tap to retry', retryFile: new File(['x'], 'day.kml') }],
        retryFailure: tripRetry,
      }),
    )
    useCairnImport.mockReturnValue(
      baseCairnImport({
        failures: [{ id: 'photo-failure-1', name: 'a.jpg', message: 'upload failed', retryFile: new File(['x'], 'a.jpg') }],
        retryFailure: photoRetry,
      }),
    )

    renderTrip()

    fireEvent.click(screen.getByText('day.kml').closest('button') as HTMLButtonElement)
    expect(tripRetry).toHaveBeenCalledWith('failure-1')
    expect(photoRetry).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('a.jpg').closest('button') as HTMLButtonElement)
    expect(photoRetry).toHaveBeenCalledWith('photo-failure-1')
  })
})

describe.skip('TripDetail — #75 signed-out drop', () => {
  it('reports a batch failure naming sign-in, rather than doing nothing, when files land while signed out', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip({ signedIn: false })
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['a.kml', 'b.jpg']) })
    })

    expect(screen.getByText('2 files')).toBeDefined()
    expect(screen.getByText(/sign in to add files to this trip/)).toBeDefined()
    expect(tripImportFiles).not.toHaveBeenCalled()
    expect(cairnImportFiles).not.toHaveBeenCalled()
  })

  /* The drop overlay moved to the shell with the rest of the chrome — its
     "not while signed out" rule is asserted in App.test.tsx now, against
     the component that actually renders it. */

  it('disables the Import files control and states the reason while signed out', () => {
    renderTrip({ signedIn: false })

    expect(screen.getByText('Sign in to add tracks and photos to this trip.')).toBeDefined()
    const button = screen.getByRole('button', { name: 'Import files' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

describe.skip('TripDetail — #73 disconnected is read-only', () => {
  function fileWithOneTrack() {
    return {
      id: 'file-1',
      name: 'Day 1',
      driveFileId: 'drive-1',
      tracks: [{ name: 'Day 1', points: [] }],
      trackStats: [{ distanceMeters: 0, durationSeconds: undefined, elevationGainMeters: undefined }],
      colorIndex: 0,
      visible: true,
    }
  }

  it('does not offer track rename, matching the trip metadata rule, while signed out', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [fileWithOneTrack()] }))

    renderTrip({ signedIn: false })

    // The metadata header states the same reason — one explanation per
    // surface, covering both the header fields and the track list below it.
    expect(screen.getByText('Sign in to edit this trip.')).toBeDefined()

    fireEvent.click(screen.getByText('Day 1'))
    expect(screen.queryByDisplayValue('Day 1')).toBeNull()
  })

  it('restores editing for both trip metadata and tracks once signed in, without a reload', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [fileWithOneTrack()] }))
    const store = new LocalTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')

    const { rerender } = render(
      <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
        <TripHarness store={store} tripId={entry.id} signedIn={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Sign in to edit this trip.')).toBeDefined()
    fireEvent.click(screen.getByText('Day 1'))
    expect(screen.queryByDisplayValue('Day 1')).toBeNull()

    rerender(
      <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
        <TripHarness store={store} tripId={entry.id} signedIn />
      </MemoryRouter>,
    )

    expect(screen.queryByText('Sign in to edit this trip.')).toBeNull()
    fireEvent.click(screen.getByText('Hokkaido'))
    expect(screen.getByDisplayValue('Hokkaido')).toBeDefined()

    fireEvent.click(screen.getByText('Day 1'))
    expect(screen.getByDisplayValue('Day 1')).toBeDefined()
  })
})

describe.skip('TripDetail — #75 a file the app cannot identify', () => {
  it('rejects a .gpx naming the formats trips take, not the photo pipeline\'s message', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['route.gpx']) })
    })

    expect(screen.getByText('route.gpx')).toBeDefined()
    expect(
      screen.getByText(/trips take \.kml or \.kmz tracks and JPEG, PNG or WebP photos/),
    ).toBeDefined()
    expect(tripImportFiles).not.toHaveBeenCalled()
    expect(cairnImportFiles).not.toHaveBeenCalled()
  })

  it('a mixed batch of one .kml, one .jpg and one .gpx imports the first two and reports only the third', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['day.kml', 'IMG_1.jpg', 'route.gpx']) })
    })

    expect(tripImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['day.kml'])
    expect(cairnImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['IMG_1.jpg'])
    expect(screen.getByText('route.gpx')).toBeDefined()
    expect(screen.getAllByText(/trips take .kml or .kmz tracks/)).toHaveLength(1)
  })

  it('sends a .heic to the photo pipeline rather than the unrecognised-type bucket', async () => {
    const cairnImportFiles = vi.fn().mockResolvedValue(undefined)
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['IMG_4021.HEIC']) })
    })

    expect(cairnImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['IMG_4021.HEIC'])
    expect(screen.queryByText('trips take .kml or .kmz tracks and JPEG, PNG or WebP photos')).toBeNull()
  })
})

describe.skip('TripDetail — #75 empty-state copy naming the actual control', () => {
  it('points the empty track list at "Import files", not the nonexistent "Import tracks"', () => {
    renderTrip()

    expect(
      screen.getByText('Drop tracks or photos anywhere, or use Import files above.'),
    ).toBeDefined()
  })
})

describe.skip('TripDetail — #77 removing tracks and photos', () => {
  const trackFile = {
    id: 'f1',
    name: 'a.kml',
    driveFileId: 'drive-a',
    colorIndex: 0,
    visible: true,
    tracks: [{ name: 'A', points: [{ lat: 1, lon: 2 }] }],
    trackStats: [{ distanceMeters: 0, durationSeconds: undefined, elevationGainMeters: undefined }],
  }

  it('requires the confirm before removing a track, and calls removeFile only from it', () => {
    const removeFile = vi.fn()
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile], removeFile }))

    renderTrip()

    fireEvent.click(screen.getByRole('button', { name: 'Delete a.kml permanently' }))
    expect(removeFile).not.toHaveBeenCalled()
    expect(screen.getByText('Delete "a.kml"?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(removeFile).toHaveBeenCalledWith('f1')
  })

  it('dismissing the confirm with Escape removes nothing', () => {
    const removeFile = vi.fn()
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile], removeFile }))

    renderTrip()

    fireEvent.click(screen.getByRole('button', { name: 'Delete a.kml permanently' }))
    expect(screen.getByText('Delete "a.kml"?')).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByText('Delete "a.kml"?')).toBeNull()
    expect(removeFile).not.toHaveBeenCalled()
  })

  it('shares one confirm slot between tracks and photos — starting a photo confirm cancels a track confirm', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile] }))
    useCairnImport.mockReturnValue(
      baseCairnImport({
        cairns: [
          {
            id: 'p1',
            name: 'photo.jpg',
            position: { lat: 1, lng: 2 },
            positionSource: 'exif',
            icon: null,
            image: { originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
            description: '',
            date: null,
          },
        ],
      }),
    )

    renderTrip()

    fireEvent.click(screen.getByRole('button', { name: 'Delete a.kml permanently' }))
    expect(screen.getByText('Delete "a.kml"?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete photo.jpg permanently' }))
    expect(screen.queryByText('Delete "a.kml"?')).toBeNull()
    expect(screen.getByText('Remove "photo.jpg"?')).toBeDefined()
  })

  it('regenerates the trip overview from the remaining tracks once a track is removed', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile] }))
    const { store, rerender, entry } = renderTrip()
    const saveOverview = vi.spyOn(store, 'saveOverview')

    useTripImport.mockReturnValue(baseTripImport({ tracks: [] }))
    rerender(
      <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
        <TripHarness store={store} tripId={entry.id} signedIn />
      </MemoryRouter>,
    )

    expect(saveOverview).toHaveBeenCalledWith(entry.id, [])
  })
})
