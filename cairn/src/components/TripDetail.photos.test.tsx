import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { CairnRecord } from '../photo/useCairnImport'

/* #55's TripDetail integration — row click opens the lightbox, Escape
   closes it and returns focus, and cairn images resolve only through the
   caching loader (never a bare Drive URL). Separate file from
   TripDetail.test.tsx (#51's mixed-drop partitioning suite) so this one
   can supply real cairn records without disturbing that suite's fixtures. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { useCairnImport } = vi.hoisted(() => ({ useCairnImport: vi.fn() }))
vi.mock('../photo/useCairnImport', () => ({ useCairnImport }))

const { acquire } = vi.hoisted(() => ({ acquire: vi.fn() }))
vi.mock('../photo/imageCache', () => ({ photoImageCache: { acquire } }))

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

function baseTripImport(overrides: Record<string, unknown> = {}) {
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

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'p1',
    name: 'sapporo.jpg',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: '2024-06-01T09:14:00Z',
    gpsTimestamp: '2024-06-01T09:14:00Z',
    ...overrides,
  }
}

function baseCairnImport(overrides: Record<string, unknown> = {}) {
  return {
    cairns: [cairnRecord()],
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

function tripFace(
  store: LocalTripStore,
  tripId: string,
  options: { onRemovePhotoFromTrip?: (record: CairnRecord) => Promise<boolean> } = {},
) {
  return (
    <MemoryRouter initialEntries={[`/trips/${tripId}`]}>
      <TripDetail
        tripId={tripId}
        tripStore={store}
        accessToken="token"
        cairnFolderId="cairn-folder-id"
        onBack={() => {}}
        onDropTargetChange={() => {}}
        onGeometryChange={() => {}}
        onNeedsPlacement={() => {}}
        onCreateTargetChange={() => {}}
        onRemovePhotoFromTrip={options.onRemovePhotoFromTrip}
      />
    </MemoryRouter>
  )
}

function renderTrip(options: { onRemovePhotoFromTrip?: (record: CairnRecord) => Promise<boolean> } = {}) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(tripFace(store, entry.id, options))
  return { ...view, store, entry }
}

beforeEach(() => {
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  useCairnImport.mockReset().mockReturnValue(baseCairnImport())
  acquire.mockReset().mockResolvedValue({ url: 'blob:fake', release: vi.fn() })
})

describe('TripDetail — #55 photo list and lightbox', () => {
  it('shows the photo section empty state pointing at the import control when the trip has no cairns (criterion 13)', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))

    renderTrip()

    expect(screen.getByText('No cairns yet')).toBeDefined()
    expect(screen.getByText('Drop photos onto this trip to see them here.')).toBeDefined()
  })

  it('opens the lightbox on a row click, showing the photo full size over the map (criterion 7)', () => {
    renderTrip()

    fireEvent.click(screen.getByText('sapporo.jpg'))

    expect(screen.getByRole('dialog', { name: 'sapporo.jpg' })).toBeDefined()
  })

  it('closes on Escape and returns focus to the row that opened it (criterion 9)', async () => {
    renderTrip()

    const rowButton = screen.getByText('sapporo.jpg').closest('button') as HTMLButtonElement
    rowButton.focus()
    fireEvent.click(rowButton)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(rowButton)
  })

  it('requests photo images through the caching loader, never a bare Drive URL (criterion 12)', async () => {
    renderTrip()

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'thumb-1'))

    fireEvent.click(screen.getByText('sapporo.jpg'))

    await waitFor(() => expect(acquire).toHaveBeenCalledWith('token', 'orig-1'))
  })

  describe('#169 — the detail face folded into the lightbox', () => {
    it('shows the description and the position-source sentence when a cairn opens', () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ description: 'A good ramen spot.' })] }),
      )

      renderTrip()
      fireEvent.click(screen.getByText('sapporo.jpg'))

      expect(screen.getByText('A good ramen spot.')).toBeDefined()
      expect(screen.getByText(/Position came from the photo’s EXIF GPS/)).toBeDefined()
    })

    it('shows the icon and photo clauses in the meta line', () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ icon: 'campsite' })] }),
      )

      renderTrip()
      fireEvent.click(screen.getByText('sapporo.jpg'))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/campsite · photo/)).toBeDefined()
    })

    it('Remove from trip in the lightbox calls onRemovePhotoFromTrip and closes it', async () => {
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(true)
      renderTrip({ onRemovePhotoFromTrip })

      fireEvent.click(screen.getByText('sapporo.jpg'))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

      fireEvent.click(screen.getByRole('button', { name: 'Remove from trip' }))

      expect(onRemovePhotoFromTrip).toHaveBeenCalledWith(cairnRecord())
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('an icon-only cairn (no image) selects on row click but opens no lightbox', () => {
      useCairnImport.mockReturnValue(
        baseCairnImport({ cairns: [cairnRecord({ icon: 'campsite', image: null })] }),
      )

      renderTrip()
      fireEvent.click(screen.getByText('sapporo.jpg'))

      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('#77 removing a photo', () => {
    it('requires the confirm before removing, and calls removeCairn only from it', () => {
      const removeCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ removeCairn }))

      renderTrip()

      fireEvent.click(screen.getByRole('button', { name: 'Delete sapporo.jpg permanently' }))
      expect(removeCairn).not.toHaveBeenCalled()
      expect(screen.getByText('Remove "sapporo.jpg"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(removeCairn).toHaveBeenCalledWith('p1')
    })

    it('closes the lightbox and returns focus when the open photo is removed', async () => {
      const { rerender, store, entry } = renderTrip()

      const rowButton = screen.getByText('sapporo.jpg').closest('button') as HTMLButtonElement
      rowButton.focus()
      fireEvent.click(rowButton)
      await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

      // Simulates the removal landing while the lightbox is still open
      // (design doc edge case) — the cairn drops out of the settled list.
      useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))
      rerender(tripFace(store, entry.id))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })

  describe('#132 removing a photo from a trip', () => {
    it('calls onRemovePhotoFromTrip with the cairn record and forgets it on success', async () => {
      const forgetCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ forgetCairn }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(true)

      renderTrip({ onRemovePhotoFromTrip })

      fireEvent.click(screen.getByRole('button', { name: 'Remove sapporo.jpg from trip' }))

      await waitFor(() => expect(onRemovePhotoFromTrip).toHaveBeenCalledWith(cairnRecord()))
      expect(forgetCairn).toHaveBeenCalledWith('p1')
      // No confirm and no delete — reversible by adding it back.
      expect(screen.queryByText('Remove "sapporo.jpg"?')).toBeNull()
    })

    it('shows the move-failed message and keeps the row when the move fails', async () => {
      const forgetCairn = vi.fn()
      useCairnImport.mockReturnValue(baseCairnImport({ forgetCairn }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(false)

      renderTrip({ onRemovePhotoFromTrip })

      fireEvent.click(screen.getByRole('button', { name: 'Remove sapporo.jpg from trip' }))

      await waitFor(() => expect(screen.getByText("Couldn't move — still on the map.")).toBeDefined())
      expect(forgetCairn).not.toHaveBeenCalled()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
    })

    it('offers no unlink control when the shell has no handler for it', () => {
      renderTrip()

      expect(screen.queryByRole('button', { name: /from trip/ })).toBeNull()
    })
  })
})

describe('TripDetail — #121 caching the cairn count', () => {
  it('caches the count for the picker to read, without a second Drive read', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })] }),
    )
    const { store, entry } = renderTrip()

    // Backfilled by the trip simply being opened — no migration pass, and
    // `useCairnImport` was listing `trips/<id>/cairns/` on mount anyway.
    expect(store.getTrips().find((t) => t.id === entry.id)?.cairnCount).toBe(2)
  })

  it('records a genuine zero once the index has been read', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [] }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.cairnCount).toBe(0)
  })

  /* Before the read-back lands, `cairns` is the empty array the hook was
     initialised with. Writing `0` from that would clobber a real count with
     a wrong one on every open, which is the same lie in a new place. */
  it('writes nothing while the cairn list is still loading', () => {
    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [], loading: true }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.cairnCount).toBeNull()
  })

  it('follows the count down when a cairn is removed', () => {
    useCairnImport.mockReturnValue(
      baseCairnImport({ cairns: [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })] }),
    )
    const { store, entry, rerender } = renderTrip()
    expect(store.getTrip(entry.id)?.cairnCount).toBe(2)

    useCairnImport.mockReturnValue(baseCairnImport({ cairns: [cairnRecord({ id: 'a' })] }))
    rerender(tripFace(store, entry.id))

    expect(store.getTrip(entry.id)?.cairnCount).toBe(1)
  })
})
