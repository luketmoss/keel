import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
    removingPhotoIds: new Set<string>(),
    photoRemoveErrors: {},
    ...overrides,
  }
}

function renderTrip() {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  const view = render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <Routes>
        <Route
          path="/trips/:id"
          element={
            <TripDetail tripStore={store} accessToken="token" cairnFolderId="cairn-folder-id" accountRow={null} />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
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

      fireEvent.click(screen.getByRole('button', { name: 'Remove sapporo.jpg' }))
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
      rerender(
        <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
          <Routes>
            <Route
              path="/trips/:id"
              element={
                <TripDetail tripStore={store} accessToken="token" cairnFolderId="cairn-folder-id" accountRow={null} />
              }
            />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })
  })
})
