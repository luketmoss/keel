import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { PositionedCairn } from './CairnLayer'
import type { CairnRecord } from '../photo/useCairnImport'

/* #196, criterion 2 — a committed name shows on the detail face, the
   sidebar row *and* the marker's `aria-label`, without a reload. The other
   suites stop at "the mutator was called"; this one holds a real record and
   watches all three surfaces follow it, which is the only way to catch a
   derivation that stopped reading `cairns`. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

vi.mock('../env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../env')>()),
  googleMapsMapId: 'test-map-id',
}))

/* The marker's own `aria-label` is `CairnMarker`'s, and rendering the real
   layer needs a Google map. What this suite has to prove is that the name
   reaches the layer at all — so the stub records the prop the label is
   built from. */
const { drawnCairns } = vi.hoisted(() => ({ drawnCairns: { current: [] as PositionedCairn[] } }))
vi.mock('./CairnLayer', () => ({
  CairnLayer: ({ cairns }: { cairns: PositionedCairn[] }) => {
    drawnCairns.current = cairns
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

const CAIRN: CairnRecord = {
  id: 'p1',
  name: 'PXL_20260812_181245.jpg',
  position: { lat: 43, lng: 141 },
  positionSource: 'exif',
  icon: null,
  image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
  description: '',
  date: '2024-06-01',
}

/** Stands in for `useCairnImport` while holding real state, so a committed
    write actually changes the record every surface below reads. `saves`
    false is the failed-write path. */
function useStubCairnImport(saves: boolean) {
  const [cairns, setCairns] = useState<CairnRecord[]>([CAIRN])
  return {
    cairns,
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue({ resolvedCount: 0, needsPlacement: [] }),
    retryFailure: vi.fn(),
    dismissFailures: vi.fn(),
    removeCairn: vi.fn(),
    forgetCairn: vi.fn(),
    removingCairnIds: new Set<string>(),
    cairnRemoveErrors: {},
    setCairnIcon: vi.fn(),
    setCairnPosition: vi.fn(),
    attachImage: vi.fn(),
    setCairnText: async (id: string, patch: { name?: string; description?: string }) => {
      if (!saves) return false
      setCairns((prev) =>
        prev.map((cairn) => (cairn.id === id ? { ...cairn, ...patch } : cairn)),
      )
      return true
    },
  }
}

function renderTrip(saves = true) {
  useCairnImport.mockImplementation(() => useStubCairnImport(saves))
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  return render(
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
}

function rowNames(): string[] {
  return Array.from(document.querySelectorAll('.cairn-row__name')).map((el) => el.textContent ?? '')
}

beforeEach(() => {
  drawnCairns.current = []
  useTripImport.mockReset().mockReturnValue({
    tracks: [],
    missingFiles: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn(),
    dismissFailures: vi.fn(),
    toggleVisibility: vi.fn(),
    removeFile: vi.fn(),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
  })
  useCairnImport.mockReset()
})

/** #250 — a row with an image now expands on click rather than opening the
    lightbox directly; its own preview button is what opens it. Every test
    below still wants the lightbox open, so this does both steps. */
async function openLightbox(name: string) {
  fireEvent.click(screen.getByText(name))
  fireEvent.click(await screen.findByRole('button', { name: `View ${name} larger` }))
}

describe('TripDetail — #196 a committed name reaches every surface', () => {
  it('updates the detail face, the sidebar row and the marker without a reload', async () => {
    renderTrip()

    await openLightbox('PXL_20260812_181245.jpg')
    const heading = screen.getByRole('heading', { level: 2 })
    fireEvent.click(heading)

    const input = screen.getByRole('textbox', { name: 'Cairn name' })
    fireEvent.change(input, { target: { value: 'Camp two' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // The detail face.
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Camp two'))
    // The sidebar row.
    expect(rowNames()).toEqual(['Camp two'])
    // What the marker's `aria-label` is built from.
    expect(drawnCairns.current.map((cairn) => cairn.name)).toEqual(['Camp two'])
    // And the dialog's own label, which names the cairn.
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Camp two')
  })

  it('leaves all three showing the old name when the write fails, and says so', async () => {
    renderTrip(false)

    await openLightbox('PXL_20260812_181245.jpg')
    fireEvent.click(screen.getByRole('heading', { level: 2 }))

    const input = screen.getByRole('textbox', { name: 'Cairn name' })
    fireEvent.change(input, { target: { value: 'Camp two' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText("Couldn't save — name reverted.")).toBeDefined()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('PXL_20260812_181245.jpg')
    expect(rowNames()).toEqual(['PXL_20260812_181245.jpg'])
    expect(drawnCairns.current.map((cairn) => cairn.name)).toEqual(['PXL_20260812_181245.jpg'])
    // The detail face stays open.
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('shows a committed description on the detail face straight away', async () => {
    renderTrip()

    await openLightbox('PXL_20260812_181245.jpg')
    fireEvent.click(document.querySelector('.lightbox__description') as HTMLElement)

    const input = screen.getByRole('textbox', { name: 'Description' })
    fireEvent.change(input, { target: { value: 'Loose slab on the left.' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect((document.querySelector('.lightbox__description') as HTMLElement).textContent).toBe(
        'Loose slab on the left.',
      ),
    )
  })
})
