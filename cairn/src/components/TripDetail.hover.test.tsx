import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { CairnRecord } from '../photo/useCairnImport'

/* #251 — the glue that actually holds `hoveredCairnIds`. `CairnList.test.tsx`
   and `CairnLayer.test.tsx` each prove their own read/write half in
   isolation; neither can prove the invariants that live only where the state
   does — "one hovered cairn at a time" and "hover never touches selection,
   expansion or the map" are both properties of `TripDetail.hoverCairn` /
   `hoverCairns` and the fact that nothing else reads `hoveredCairnIds`. This
   file is `TripDetail.facets.test.tsx`'s boilerplate, trimmed to what hover
   needs: a real Map ID so `CairnLayer` mounts, and a stub that reports back
   the `hoveredCairnIds` it was actually given. */
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

vi.mock('../env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../env')>()),
  googleMapsMapId: 'test-map-id',
}))

const { lastHoveredCairnIds } = vi.hoisted(() => ({
  lastHoveredCairnIds: { current: new Set<string>() },
}))
vi.mock('./CairnLayer', () => ({
  CairnLayer: ({ hoveredCairnIds }: { hoveredCairnIds: ReadonlySet<string> }) => {
    lastHoveredCairnIds.current = new Set(hoveredCairnIds)
    useEffect(
      () => () => {
        lastHoveredCairnIds.current = new Set()
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

vi.mock('../photo/imageCache', () => ({
  photoImageCache: { acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release: vi.fn() }) },
}))

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

function baseTripImport() {
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
  }
}

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'p1',
    name: 'sapporo.jpg',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01',
    ...overrides,
  }
}

const PHOTO_A = cairnRecord({ id: 'a', name: 'a.jpg', date: '2024-06-01' })
const PHOTO_B = cairnRecord({ id: 'b', name: 'b.jpg', date: '2024-06-02' })

function baseCairnImport(overrides: Record<string, unknown> = {}) {
  return {
    cairns: [PHOTO_A, PHOTO_B],
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

function cairnSection(): HTMLElement {
  return document.querySelector('.cairn-list') as HTMLElement
}

function row(name: string): HTMLElement {
  return within(cairnSection()).getByText(name).closest('li') as HTMLElement
}

beforeEach(() => {
  lastHoveredCairnIds.current = new Set()
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  useCairnImport.mockReset().mockReturnValue(baseCairnImport())
})

describe('TripDetail — #251 the hovered-cairn set', () => {
  it('moves the emphasis between rows rather than accumulating it, both in the list and on the map', () => {
    renderTrip()

    fireEvent.mouseEnter(row('a.jpg'))
    expect(row('a.jpg').className).toContain('cairn-row--hovered')
    expect(lastHoveredCairnIds.current).toEqual(new Set(['a']))

    fireEvent.mouseEnter(row('b.jpg'))
    // Moved, not accumulated — leaving `a` unhovered even though its own
    // `mouseleave` never fired, the way a fast sweep across two rows would.
    expect(row('a.jpg').className).not.toContain('cairn-row--hovered')
    expect(row('b.jpg').className).toContain('cairn-row--hovered')
    expect(lastHoveredCairnIds.current).toEqual(new Set(['b']))

    fireEvent.mouseLeave(row('b.jpg'))
    expect(row('b.jpg').className).not.toContain('cairn-row--hovered')
    expect(lastHoveredCairnIds.current).toEqual(new Set())
  })

  it('never changes the selection, the expansion, or the lightbox while hovering', () => {
    renderTrip()

    fireEvent.click(screen.getByText('a.jpg'))
    expect(row('a.jpg').className).toContain('cairn-row--selected')
    expect(screen.getByText('a.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('true')

    fireEvent.mouseEnter(row('b.jpg'))

    // `b` is hovered, not selected or expanded — hovering it must not have
    // reached for the same state a click does.
    expect(row('b.jpg').className).toContain('cairn-row--hovered')
    expect(row('b.jpg').className).not.toContain('cairn-row--selected')
    expect(screen.getByText('b.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('false')
    // `a` keeps everything hovering `b` could have disturbed.
    expect(row('a.jpg').className).toContain('cairn-row--selected')
    expect(screen.getByText('a.jpg').closest('button')?.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
