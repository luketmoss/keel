import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { ImportedFile } from '../import/types'
import type { CairnRecord } from '../photo/useCairnImport'

/* #292 — `TripDetail`'s half of the content framing: opening a trip (or a
   track import, or a visibility toggle) flies the 3D camera to frame it,
   falling back to the trip's cairns when it has no drawable track
   geometry. The harness is `TripDetail.track3DSelection.test.tsx`'s own —
   a fake `Map3DElement` and a fake `Polyline3DInteractiveElement` stand in
   for the Maps API, so `Track3DLayer` and `Cairn3DLayer` both run for
   real underneath this note's own effect. */
const { fakeMap3d, PolylineCtor, MarkerCtor, flyCameraTo, removeSpy } = vi.hoisted(() => {
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
    remove() {
      removeSpy(this)
    }
  }

  /* `Cairn3DLayer.test.tsx`'s own fake — a real `<div>` wearing the extra
     properties, so `createPortal` has something real to render into. */
  class FakeMarkerElement {
    constructor(options: Record<string, unknown>) {
      const el = document.createElement('div')
      Object.assign(el, options)
      const nativeRemove = el.remove.bind(el)
      el.remove = () => {
        removeSpy(el)
        nativeRemove()
      }
      return el as unknown as FakeMarkerElement
    }
  }

  const appended: unknown[] = []
  const fakeMap3d = {
    heading: 12,
    tilt: 47,
    center: null as unknown,
    range: null as unknown,
    append: (element: unknown) => {
      appended.push(element)
      if (element instanceof HTMLElement) document.body.appendChild(element)
    },
    flyCameraTo,
    appended,
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  return {
    fakeMap3d,
    PolylineCtor: FakePolyline3DInteractiveElement,
    MarkerCtor: FakeMarkerElement,
    flyCameraTo,
    removeSpy,
  }
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
    MarkerElement: MarkerCtor,
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

/* `computeRenderedTracks`/`visibleFilesKey` are real (not stubbed) — they
   feed both `Track3DLayer` and the framing effect under test. Only the 2D
   `TrackLayer` component itself is stubbed out. */
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

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'c1',
    name: 'a.jpg',
    position: { lat: 40, lng: -120 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01',
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

/** A real hook underneath the mock, so `toggleVisibility` actually flips a
    file's `visible` and a test can grow or shrink `tracks` directly —
    needed for the import/removal/toggle criteria, none of which a frozen
    return value can express. `tracksRef` is written on every render so a
    test can reach the setter without going through the row menu's own
    confirm step, which is #77's own UI and not what this file is about. */
const { tracksRef } = vi.hoisted(() => ({
  tracksRef: { current: null as null | ((updater: (prev: ImportedFile[]) => ImportedFile[]) => void) },
}))

function mockTripImportStateful(initial: ImportedFile[]) {
  useTripImport.mockImplementation(() => {
    const [tracks, setTracks] = useState(initial)
    tracksRef.current = setTracks
    return baseTripImport({
      tracks,
      toggleVisibility: (id: string) =>
        setTracks((prev) => prev.map((file) => (file.id === id ? { ...file, visible: !file.visible } : file))),
      removeFile: vi.fn().mockImplementation(async (id: string) => {
        setTracks((prev) => prev.filter((file) => file.id !== id))
      }),
    })
  })
}

function mockCairnImport(cairns: CairnRecord[] = []) {
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
  fakeMap3d.appended.length = 0
  fakeMap3d.center = null
  fakeMap3d.range = null
  flyCameraTo.mockClear()
  removeSpy.mockClear()
  is3DOnRef.current = true
  useTripImport.mockReset()
  useCairnImport.mockReset()
  mockCairnImport()
})

describe('TripDetail — #292 content framing in 3D', () => {
  it('flies the 3D camera to frame the trip on open, keeping heading and tilt', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.heading).toBe(12)
    expect(call.endCamera.tilt).toBe(47)
    expect(call.endCamera.center.lat).toBeCloseTo(37.005)
    expect(call.endCamera.center.lng).toBeCloseTo(-122.005)
    expect(call.durationMillis).toBeGreaterThan(0)
  })

  it('frames the trip’s cairns when it has no drawable track geometry', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [] }))
    mockCairnImport([cairnRecord()])
    renderTrip()

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
    const call = flyCameraTo.mock.calls[0][0]
    expect(call.endCamera.center.lat).toBeCloseTo(40)
    expect(call.endCamera.center.lng).toBeCloseTo(-120)
  })

  it('leaves the camera alone when the trip has neither tracks nor cairns', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [] }))
    mockCairnImport([])
    renderTrip()

    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('re-frames when a track is imported into the open trip', async () => {
    mockTripImportStateful([trackFile()])
    renderTrip()
    flyCameraTo.mockClear()

    await act(async () => {
      tracksRef.current!((prev) => [...prev, trackFile({ id: 'file-b', name: 'Second' })])
    })

    expect(flyCameraTo).toHaveBeenCalledTimes(1)
  })

  it('re-frames when a track’s visibility is toggled off', () => {
    mockTripImportStateful([trackFile()])
    renderTrip()
    flyCameraTo.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Hide Belford-Oxford' }))

    // The only track just left the drawn set — nothing to frame (no cairns
    // either), so the effect fires but lands on a no-op, not a flight.
    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not re-frame when a track is removed', async () => {
    mockTripImportStateful([trackFile(), trackFile({ id: 'file-b', name: 'Second' })])
    renderTrip()
    flyCameraTo.mockClear()

    await act(async () => {
      tracksRef.current!((prev) => prev.filter((file) => file.id !== 'file-b'))
    })

    expect(screen.queryByText('Second')).toBeNull()
    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not frame while a decision owns the map (revealSuspended)', () => {
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    renderTrip({ revealSuspended: true })

    expect(flyCameraTo).not.toHaveBeenCalled()
  })

  it('does not additionally frame when 3D is switched on with the same trip already open', () => {
    is3DOnRef.current = false
    useTripImport.mockReturnValue(baseTripImport({ tracks: [trackFile()] }))
    const { rerender, entry, store } = renderTrip()
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
