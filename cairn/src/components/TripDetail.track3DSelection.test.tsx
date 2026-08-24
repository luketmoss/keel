import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import { clearGroundAltitudeCache } from '../map/groundAltitude'
import type { ImportedFile } from '../import/types'

/* #288 — the wiring `Track3DLayer.test.tsx` cannot see: that `TripDetail`
   passes it the *same* `selectedTrackId`/`handleSelectRoute`/
   `hitLinesEnabled` the 2D layer gets, and that selecting a track flies the
   3D camera to frame it. Unlike the other `TripDetail.*.test.tsx` files,
   `Track3DLayer` is left unmocked here — a fake `Map3DElement` and a fake
   `Polyline3DInteractiveElement` stand in for the Maps API underneath it,
   so a click dispatched on the fake polyline exercises the real component,
   not a stub reporting its own props back. `TrackLayer` (2D) is still
   stubbed out, as every other `TripDetail.*.test.tsx` file does — this note
   is the 3D half only.

   #303 — the reveal now resolves the ground through `flyToFramedGround`
   before it moves the camera, `Map3D.test.tsx`'s own harness: a fixed
   elevation stands in for the real Elevation API, and `elevationFails`
   flips the ground-unresolved fail-safe on for the one test that needs
   it. */
const GROUND_METERS = 1200
const elevationFails = { current: false }
vi.mock('../geo/elevation', () => ({
  createGoogleElevationSampler: () => ({
    sampleAlongPath: async () =>
      elevationFails.current
        ? { ok: false, reason: 'UNKNOWN_ERROR' }
        : { ok: true, samples: [{ lat: 0, lng: 0, elevationMeters: GROUND_METERS }] },
  }),
}))

const { fakeMap3d, PolylineCtor, flyCameraTo, removeSpy } = vi.hoisted(() => {
  const flyCameraTo = vi.fn()
  const removeSpy = vi.fn()

  class FakePolyline3DInteractiveElement {
    path: unknown
    strokeColor: unknown
    strokeWidth: unknown
    outerColor: unknown
    outerWidth: unknown
    zIndex: unknown
    altitudeMode: unknown
    drawsOccludedSegments: unknown
    listeners = new Map<string, () => void>()
    constructor(options: Record<string, unknown>) {
      Object.assign(this, options)
    }
    addEventListener(type: string, listener: () => void) {
      this.listeners.set(type, listener)
    }
    dispatch(type: string) {
      this.listeners.get(type)?.()
    }
    remove() {
      removeSpy(this)
    }
  }

  const appended: FakePolyline3DInteractiveElement[] = []
  const fakeMap3d = {
    heading: 12,
    tilt: 47,
    center: null as unknown,
    range: null as unknown,
    append: (line: FakePolyline3DInteractiveElement) => appended.push(line),
    flyCameraTo,
    appended,
    // `useCairnOcclusion` listens for `gmp-steadychange` on whatever
    // `useMap3D` returns, unrelated to this note's own wiring.
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  return { fakeMap3d, PolylineCtor: FakePolyline3DInteractiveElement, flyCameraTo, removeSpy }
})

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
  useMap3D: () => fakeMap3d,
  useMapsLibrary: () => ({
    Polyline3DInteractiveElement: PolylineCtor,
    AltitudeMode: { CLAMP_TO_GROUND: 'CLAMP_TO_GROUND' },
  }),
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

const { is3DOnRef } = vi.hoisted(() => ({ is3DOnRef: { current: true } }))
vi.mock('../map/Map3DControl', () => ({
  useMap3DControl: () => ({
    on: is3DOnRef.current,
    support: 'available',
    setOn: vi.fn(),
    flyover: null,
    requestFlyover: vi.fn(),
  }),
}))

/* `computeRenderedTracks` is real here (not stubbed to `[]` the way the
   other `TripDetail.*.test.tsx` files leave it) — it's what feeds
   `Track3DLayer`, the thing under test. Only the 2D `TrackLayer` component
   itself is stubbed out. */
vi.mock('./TrackLayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./TrackLayer')>()
  return {
    computeRenderedTracks: actual.computeRenderedTracks,
    visibleFilesKey: actual.visibleFilesKey,
    TrackLayer: () => null,
  }
})

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

/** The `useTripImport` mock as a real hook, so `toggleVisibility` actually
    flips a file's `visible` and re-renders — `TripDetail.visibility.test.tsx`'s
    own helper, needed here to prove a hidden track's 3D route is removed. */
function mockTripImportStateful(files: ImportedFile[]) {
  useTripImport.mockImplementation(() => {
    const [tracks, setTracks] = useState(files)
    return baseTripImport({
      tracks,
      toggleVisibility: (id: string) =>
        setTracks((prev) => prev.map((file) => (file.id === id ? { ...file, visible: !file.visible } : file))),
    })
  })
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

/** Lets the awaited ground request settle — `Map3D.test.tsx`'s own helper,
    since the reveal's flight now only fires once `flyToFramedGround`'s
    `sampleGroundAltitude` call has resolved. */
async function settleFraming() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  fakeMap3d.appended.length = 0
  fakeMap3d.center = null
  fakeMap3d.range = null
  flyCameraTo.mockClear()
  removeSpy.mockClear()
  is3DOnRef.current = true
  elevationFails.current = false
  clearGroundAltitudeCache()
  useTripImport.mockReset()
  useCairnImport.mockReset()
  mockCairnImport()
})

describe('TripDetail — #288 track selection in 3D', () => {
  it('draws the trip at rest, and clicking its 3D route selects the track and expands its row', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    expect(fakeMap3d.appended).toHaveLength(1)
    expect(fakeMap3d.appended[0].strokeWidth).toBe(4)

    act(() => fakeMap3d.appended[0].dispatch('gmp-click'))

    const header = screen.getByText('Belford-Oxford').closest('button')!
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Belford-Oxford').closest('li')?.className).toContain('track-row--selected')
  })

  it('a second click on the selected 3D route collapses the row but leaves it selected (#250)', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    act(() => fakeMap3d.appended[0].dispatch('gmp-click'))
    act(() => fakeMap3d.appended[0].dispatch('gmp-click'))

    const header = screen.getByText('Belford-Oxford').closest('button')!
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Belford-Oxford').closest('li')?.className).toContain('track-row--selected')
  })

  it('a multi-track file selects on a 3D click; nothing expands, since it has no expanded state', () => {
    useTripImport.mockReturnValue(
      baseTripImport({
        tracks: [trackFile({ tracks: [trackFile().tracks[0], trackFile().tracks[0]] })],
      }),
    )
    renderTrip()
    expect(fakeMap3d.appended).toHaveLength(2)

    act(() => fakeMap3d.appended[1].dispatch('gmp-click'))

    expect(document.querySelector('li.track-row')?.className).toContain('track-row--selected')
    expect(fakeMap3d.appended[0].strokeWidth).toBe(8)
    expect(fakeMap3d.appended[1].strokeWidth).toBe(8)
  })

  it('gives the selected track a heavier stroke and an outer edge on the 3D map', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    act(() => fakeMap3d.appended[0].dispatch('gmp-click'))

    expect(fakeMap3d.appended[0].strokeWidth).toBe(8)
    expect(fakeMap3d.appended[0].outerColor).toBe('#00000059')
  })

  it('selecting a track from its row gives the same 3D treatment as selecting it on the map', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))

    expect(fakeMap3d.appended[0].strokeWidth).toBe(8)
    expect(fakeMap3d.appended[0].outerColor).toBe('#00000059')
  })

  it('flies the 3D camera to frame the selected track, keeping heading and tilt, on the ground', async () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()
    await settleFraming()
    // #292's own content framing already flew once, on arrival — clear it
    // so this only asserts on the selection's own flight.
    flyCameraTo.mockClear()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    await settleFraming()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(12)
    expect(call.endCamera.tilt).toBe(47)
    expect(call.endCamera.center.lat).toBeCloseTo(37.005)
    expect(call.endCamera.center.lng).toBeCloseTo(-122.005)
    expect(call.endCamera.center.altitude).toBe(GROUND_METERS)
    expect(call.endCamera.range).toBeGreaterThan(0)
  })

  /* #303 — the ground could not be resolved for the selected track: the
     reveal still fires, but flattens to tilt 0 and sea level rather than
     tilting the live camera down over a look-at that might be buried. */
  it('flattens to tilt 0 when the ground cannot be resolved for the selected track', async () => {
    elevationFails.current = true
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()
    await settleFraming()
    flyCameraTo.mockClear()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    await settleFraming()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.tilt).toBe(0)
    expect(call.endCamera.center.altitude).toBe(0)
    expect(call.endCamera.heading).toBe(12)
  })

  it('does not fly the camera, and disables the 3D hit lines, while a decision owns the map', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip({ revealSuspended: true })

    act(() => fakeMap3d.appended[0].dispatch('gmp-click'))

    expect(flyCameraTo).not.toHaveBeenCalled()
    expect(screen.getByText('Belford-Oxford').closest('li')?.className).not.toContain('track-row--selected')
  })

  it('removes the 3D route when the track is hidden with the visibility control', () => {
    mockTripImportStateful([trackFile()])
    renderTrip()
    const line = fakeMap3d.appended[0]

    fireEvent.click(screen.getByRole('button', { name: 'Hide Belford-Oxford' }))

    expect(removeSpy).toHaveBeenCalledWith(line)
  })

  it('does not fly the camera when 3D is switched on with a track already selected — the switch is not a selection change', () => {
    is3DOnRef.current = false
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    const { rerender, entry, store } = renderTrip()

    fireEvent.click(screen.getByText('Belford-Oxford'))
    expect(flyCameraTo).not.toHaveBeenCalled()

    is3DOnRef.current = true
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

    expect(flyCameraTo).not.toHaveBeenCalled()
  })
})
