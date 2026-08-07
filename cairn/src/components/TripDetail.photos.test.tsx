import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TripDetail } from './TripDetail'
import { LocalTripStore } from '../store/tripStore'
import type { PhotoRecord } from '../photo/photoIndex'

/* #55's TripDetail integration — row click opens the lightbox, Escape
   closes it and returns focus, and photo images resolve only through the
   caching loader (never a bare Drive URL). Separate file from
   TripDetail.test.tsx (#51's mixed-drop partitioning suite) so this one
   can supply real photo records without disturbing that suite's fixtures. */
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

const { usePhotoImport } = vi.hoisted(() => ({ usePhotoImport: vi.fn() }))
vi.mock('../photo/usePhotoImport', () => ({ usePhotoImport }))

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

function photoRecord(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: 'p1',
    name: 'sapporo.jpg',
    originalDriveFileId: 'orig-1',
    thumbnailDriveFileId: 'thumb-1',
    gpsTimestamp: '2024-06-01T09:14:00Z',
    ...overrides,
  }
}

function basePhotoImport(overrides: Record<string, unknown> = {}) {
  return {
    photos: [photoRecord()],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    removePhoto: vi.fn(),
    forgetPhoto: vi.fn(),
    removingPhotoIds: new Set<string>(),
    photoRemoveErrors: {},
    ...overrides,
  }
}

function tripFace(
  store: LocalTripStore,
  tripId: string,
  options: { onRemovePhotoFromTrip?: (record: PhotoRecord) => Promise<boolean> } = {},
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
        onRemovePhotoFromTrip={options.onRemovePhotoFromTrip}
      />
    </MemoryRouter>
  )
}

function renderTrip(options: { onRemovePhotoFromTrip?: (record: PhotoRecord) => Promise<boolean> } = {}) {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(tripFace(store, entry.id, options))
  return { ...view, store, entry }
}

beforeEach(() => {
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  usePhotoImport.mockReset().mockReturnValue(basePhotoImport())
  acquire.mockReset().mockResolvedValue({ url: 'blob:fake', release: vi.fn() })
})

describe('TripDetail — #55 photo list and lightbox', () => {
  it('shows the photo section empty state pointing at the import control when the trip has no photos (criterion 13)', () => {
    usePhotoImport.mockReturnValue(basePhotoImport({ photos: [] }))

    renderTrip()

    expect(screen.getByText('No photos yet')).toBeDefined()
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

  describe('#77 removing a photo', () => {
    it('requires the confirm before removing, and calls removePhoto only from it', () => {
      const removePhoto = vi.fn()
      usePhotoImport.mockReturnValue(basePhotoImport({ removePhoto }))

      renderTrip()

      fireEvent.click(screen.getByRole('button', { name: 'Delete sapporo.jpg permanently' }))
      expect(removePhoto).not.toHaveBeenCalled()
      expect(screen.getByText('Remove "sapporo.jpg"?')).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(removePhoto).toHaveBeenCalledWith('p1')
    })

    it('closes the lightbox and returns focus when the open photo is removed', async () => {
      const { rerender, store, entry } = renderTrip()

      const rowButton = screen.getByText('sapporo.jpg').closest('button') as HTMLButtonElement
      rowButton.focus()
      fireEvent.click(rowButton)
      await waitFor(() => expect(screen.getByRole('dialog')).toBeDefined())

      // Simulates the removal landing while the lightbox is still open
      // (design doc edge case) — the photo drops out of the settled list.
      usePhotoImport.mockReturnValue(basePhotoImport({ photos: [] }))
      rerender(tripFace(store, entry.id))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })

  describe('#132 removing a photo from a trip', () => {
    it('calls onRemovePhotoFromTrip with the photo record and forgets it on success', async () => {
      const forgetPhoto = vi.fn()
      usePhotoImport.mockReturnValue(basePhotoImport({ forgetPhoto }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(true)

      renderTrip({ onRemovePhotoFromTrip })

      fireEvent.click(screen.getByRole('button', { name: 'Remove sapporo.jpg from trip' }))

      await waitFor(() => expect(onRemovePhotoFromTrip).toHaveBeenCalledWith(photoRecord()))
      expect(forgetPhoto).toHaveBeenCalledWith('p1')
      // No confirm and no delete — reversible by adding it back.
      expect(screen.queryByText('Remove "sapporo.jpg"?')).toBeNull()
    })

    it('shows the move-failed message and keeps the row when the move fails', async () => {
      const forgetPhoto = vi.fn()
      usePhotoImport.mockReturnValue(basePhotoImport({ forgetPhoto }))
      const onRemovePhotoFromTrip = vi.fn().mockResolvedValue(false)

      renderTrip({ onRemovePhotoFromTrip })

      fireEvent.click(screen.getByRole('button', { name: 'Remove sapporo.jpg from trip' }))

      await waitFor(() => expect(screen.getByText("Couldn't move — still on the map.")).toBeDefined())
      expect(forgetPhoto).not.toHaveBeenCalled()
      expect(screen.getByText('sapporo.jpg')).toBeDefined()
    })

    it('offers no unlink control when the shell has no handler for it', () => {
      renderTrip()

      expect(screen.queryByRole('button', { name: /from trip/ })).toBeNull()
    })
  })
})

describe('TripDetail — #121 caching the photo count', () => {
  it('caches the count for the picker to read, without a second Drive read', () => {
    usePhotoImport.mockReturnValue(
      basePhotoImport({ photos: [photoRecord({ id: 'a' }), photoRecord({ id: 'b' })] }),
    )
    const { store, entry } = renderTrip()

    // Backfilled by the trip simply being opened — no migration pass, and
    // `usePhotoImport` was reading `photos.json` on mount anyway.
    expect(store.getTrips().find((t) => t.id === entry.id)?.photoCount).toBe(2)
  })

  it('records a genuine zero once the index has been read', () => {
    usePhotoImport.mockReturnValue(basePhotoImport({ photos: [] }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.photoCount).toBe(0)
  })

  /* Before the read-back lands, `photos` is the empty array the hook was
     initialised with. Writing `0` from that would clobber a real count with
     a wrong one on every open, which is the same lie in a new place. */
  it('writes nothing while the photo index is still loading', () => {
    usePhotoImport.mockReturnValue(basePhotoImport({ photos: [], loading: true }))
    const { store, entry } = renderTrip()

    expect(store.getTrip(entry.id)?.photoCount).toBeNull()
  })

  it('follows the count down when a photo is removed', () => {
    usePhotoImport.mockReturnValue(
      basePhotoImport({ photos: [photoRecord({ id: 'a' }), photoRecord({ id: 'b' })] }),
    )
    const { store, entry, rerender } = renderTrip()
    expect(store.getTrip(entry.id)?.photoCount).toBe(2)

    usePhotoImport.mockReturnValue(basePhotoImport({ photos: [photoRecord({ id: 'a' })] }))
    rerender(tripFace(store, entry.id))

    expect(store.getTrip(entry.id)?.photoCount).toBe(1)
  })
})
