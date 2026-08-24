import { useCallback, useRef } from 'react'
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
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
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
    // #224 — the hook always returns a record (empty until something is
    // sampled), and `saveOverview` is handed it on every regeneration.
    sampledElevation: {},
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
    // #243: "the Drive read settled successfully", distinct from `!loading`
    // now that a cached trip renders before any read has.
    hydrated: true,
    progress: [],
    failures: [],
    // #168: resolves the drop's split, which the caller unpacks to report
    // stragglers up — a bare `undefined` throws where it does that.
    importFiles: vi.fn().mockResolvedValue({ resolvedCount: 0, needsPlacement: [] }),
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

/* The callbacks the trip face reports itself through are registered by
   effects that keep the callback in their dependency array, so every one of
   them has to be referentially stable across renders — a fresh arrow per
   render re-runs the effect, and an effect whose cleanup/setup writes state
   in the shell renders the shell again. Module-level, so they are the same
   function for the whole suite. */
const noop = () => {}

/** The trip face no longer owns the page, so it no longer catches the drop
    itself — it registers a handler and the shell routes drops to it. This
    stands in for the shell, wired exactly the way `App.tsx` wires it, so
    the drop tests below still exercise the real path.
 *
 *  The registered handler lives in a **ref**, matching `App.tsx`'s
    `tripDropRef`/`handleDropTargetChange` pair, and the setter is
    `useCallback`-stable. Holding it in state instead — which this harness
    did until #180 — is an unbounded render loop, not a rendering quirk:
    registering the handler renders the shell, which makes a new
    `onDropTargetChange`, which re-runs the registration effect, whose
    cleanup deregisters (another render) before setup registers again. It
    never settles, and every pass allocates another render's worth of fibers,
    which is what took this file past 2GB and hung it. */
function TripHarness({
  store,
  tripId,
  signedIn,
}: {
  store: LocalTripStore
  tripId: string
  signedIn: boolean
}) {
  const dropTarget = useRef<((files: File[]) => void) | null>(null)
  const handleDropTargetChange = useCallback((handler: ((files: File[]) => void) | null) => {
    dropTarget.current = handler
  }, [])
  return (
    <div
      className="app"
      onDrop={(event) => {
        event.preventDefault()
        dropTarget.current?.(Array.from(event.dataTransfer.files))
      }}
    >
      <TripDetail
        tripId={tripId}
        tripStore={store}
        accessToken={signedIn ? 'token' : null}
        cairnFolderId={signedIn ? 'cairn-folder-id' : null}
        onBack={noop}
        onDropTargetChange={handleDropTargetChange}
        onGeometryChange={noop}
        onNeedsPlacement={noop}
        onCreateTargetChange={noop}
        onCairnDetailChange={noop}
        cairnsDraggable={true}
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

/* The photo pipeline resolves the drop's resolved/unresolved split (#168);
   a test that swaps in its own spy has to keep that shape. */
const cairnImportSpy = () => vi.fn().mockResolvedValue({ resolvedCount: 0, needsPlacement: [] })

/* #193 — a row's exits live behind its `⋮` now, so reaching one is two
   steps. Same helper shape `TrackList.test.tsx` and `CairnList.test.tsx`
   already use. */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Row actions for ${name}` }))
}

describe('TripDetail — #51 partitioning a mixed drop between tracks and photos', () => {
  it('sends .kml/.kmz files to useTripImport and images to useCairnImport from a single drop', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = cairnImportSpy()
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

  it('sends every file to useCairnImport (never useTripImport) from a picker selection with images only', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = cairnImportSpy()
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const photos = [new File(['a'], 'a.jpg'), new File(['b'], 'b.webp')]

    // Awaited since #188: every batch now goes through `expandArchives`
    // first, so the partitioning happens a microtask after the change.
    await act(async () => {
      fireEvent.change(input, { target: { files: photos } })
    })

    expect(cairnImportFiles).toHaveBeenCalledWith(photos)
    expect(tripImportFiles).not.toHaveBeenCalled()
  })

  it('shows the widened control label and accept list', () => {
    renderTrip()

    expect(screen.getByRole('button', { name: 'Import files' })).toBeDefined()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    // `.gpx` joined the track formats and `.zip` the archive doorway (#188)
    // after this suite was written; the assertion is still that one control
    // accepts both pipelines' formats, not just tracks'.
    expect(input.accept).toBe('.kml,.kmz,.gpx,.jpg,.jpeg,.png,.webp,.zip')
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

describe('TripDetail — #75 signed-out drop', () => {
  it('reports a batch failure naming sign-in, rather than doing nothing, when files land while signed out', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = cairnImportSpy()
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

describe('TripDetail — #73 disconnected is read-only', () => {
  function fileWithOneTrack() {
    return {
      id: 'file-1',
      name: 'Day 1',
      sourceName: 'Day 1',
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

    // #193: reaching rename is two steps now — open the row's `⋮`, then the
    // Rename item itself is disabled rather than absent while signed out.
    openRowMenu('Day 1')
    expect((screen.getByText('Rename').closest('button') as HTMLButtonElement).disabled).toBe(true)
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

    // #193: track rename lives behind the row's `⋮` now, not a direct click
    // on the name — unlike the trip title above, which still edits in place.
    openRowMenu('Day 1')
    fireEvent.click(screen.getByText('Rename'))
    expect(screen.getByDisplayValue('Day 1')).toBeDefined()
  })
})

/* `.gpx` was this suite's stand-in for a file neither pipeline claims, and
   it stopped being one when GPX joined `TRACK_EXTENSIONS`. The rule under
   test is unchanged — an unclaimed file is refused by name, with the copy
   that lists what a trip does take — so the stand-in is now `.rtf`, which
   is in neither `fileKinds.ts` list nor the archive doorway. */
describe('TripDetail — #75 a file the app cannot identify', () => {
  it('rejects an unclaimed file naming the formats trips take, not the photo pipeline\'s message', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = cairnImportSpy()
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['notes.rtf']) })
    })

    expect(screen.getByText('notes.rtf')).toBeDefined()
    expect(
      screen.getByText(/trips take \.kml, \.kmz or \.gpx tracks, JPEG, PNG or WebP photos/),
    ).toBeDefined()
    expect(tripImportFiles).not.toHaveBeenCalled()
    expect(cairnImportFiles).not.toHaveBeenCalled()
  })

  it('a mixed batch of one .kml, one .jpg and one unclaimed file imports the first two and reports only the third', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const cairnImportFiles = cairnImportSpy()
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    useCairnImport.mockReturnValue(baseCairnImport({ importFiles: cairnImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['day.kml', 'IMG_1.jpg', 'notes.rtf']) })
    })

    expect(tripImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['day.kml'])
    expect(cairnImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['IMG_1.jpg'])
    expect(screen.getByText('notes.rtf')).toBeDefined()
    expect(screen.getAllByText(/trips take .kml, .kmz or .gpx tracks/)).toHaveLength(1)
  })

  it('sends a .heic to the photo pipeline rather than the unrecognised-type bucket', async () => {
    const cairnImportFiles = cairnImportSpy()
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

describe('TripDetail — #75 empty-state copy naming the actual control', () => {
  it('points the empty track list at "Import files", not the nonexistent "Import tracks"', () => {
    renderTrip()

    expect(
      screen.getByText('Drop tracks or photos anywhere, or use Import files above.'),
    ).toBeDefined()
  })
})

describe('TripDetail — #77 removing tracks and photos', () => {
  const trackFile = {
    id: 'f1',
    name: 'a.kml',
    sourceName: 'a.kml',
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

    openRowMenu('a.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
    expect(removeFile).not.toHaveBeenCalled()
    expect(screen.getByText('Delete "a.kml"?')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(removeFile).toHaveBeenCalledWith('f1')
  })

  it('dismissing the confirm with Escape removes nothing', () => {
    const removeFile = vi.fn()
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile], removeFile }))

    renderTrip()

    openRowMenu('a.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
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

    openRowMenu('a.kml')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
    expect(screen.getByText('Delete "a.kml"?')).toBeDefined()

    openRowMenu('photo.jpg')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete permanently…' }))
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

    // #224 added the sampled-elevation cache as a third argument, carried
    // through unchanged — the regeneration contract this asserts is the
    // first two.
    expect(saveOverview).toHaveBeenCalledWith(entry.id, [], {})
  })
})
