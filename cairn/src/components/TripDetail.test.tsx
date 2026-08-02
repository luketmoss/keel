import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
   `usePhotoImport`'s own suites' job, so both hooks are mocked here. */
const { useTripImport } = vi.hoisted(() => ({ useTripImport: vi.fn() }))
vi.mock('../import/useTripImport', () => ({ useTripImport }))

const { usePhotoImport } = vi.hoisted(() => ({ usePhotoImport: vi.fn() }))
vi.mock('../photo/usePhotoImport', () => ({ usePhotoImport }))

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
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
    ...overrides,
  }
}

function basePhotoImport(overrides: Partial<ReturnType<typeof usePhotoImport>> = {}) {
  return {
    photos: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    ...overrides,
  }
}

function fileDataTransfer(names: string[]): DataTransfer {
  return {
    types: ['Files'],
    files: names.map((name) => new File(['x'], name)) as unknown as FileList,
  } as unknown as DataTransfer
}

function renderTrip() {
  const store = new LocalTripStore(fakeStorage())
  const entry = store.createTrip('Hokkaido')
  return render(
    <MemoryRouter initialEntries={[`/trips/${entry.id}`]}>
      <Routes>
        <Route
          path="/trips/:id"
          element={
            <TripDetail
              tripStore={store}
              accessToken="token"
              cairnFolderId="cairn-folder-id"
              accountRow={null}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  usePhotoImport.mockReset().mockReturnValue(basePhotoImport())
})

describe('TripDetail — #51 partitioning a mixed drop between tracks and photos', () => {
  it('sends .kml/.kmz files to useTripImport and images to usePhotoImport from a single drop', async () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const photoImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    usePhotoImport.mockReturnValue(basePhotoImport({ importFiles: photoImportFiles }))

    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    await act(async () => {
      fireEvent.drop(app, {
        dataTransfer: fileDataTransfer(['day-1.kml', 'day-2.kmz', 'IMG_1.jpg', 'IMG_2.png']),
      })
    })

    expect(tripImportFiles).toHaveBeenCalledTimes(1)
    expect(tripImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['day-1.kml', 'day-2.kmz'])

    expect(photoImportFiles).toHaveBeenCalledTimes(1)
    expect(photoImportFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['IMG_1.jpg', 'IMG_2.png'])
  })

  it('sends every file to usePhotoImport (never useTripImport) from a picker selection with images only', () => {
    const tripImportFiles = vi.fn().mockResolvedValue(undefined)
    const photoImportFiles = vi.fn().mockResolvedValue(undefined)
    useTripImport.mockReturnValue(baseTripImport({ importFiles: tripImportFiles }))
    usePhotoImport.mockReturnValue(basePhotoImport({ importFiles: photoImportFiles }))

    renderTrip()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const photos = [new File(['a'], 'a.jpg'), new File(['b'], 'b.webp')]

    fireEvent.change(input, { target: { files: photos } })

    expect(photoImportFiles).toHaveBeenCalledWith(photos)
    expect(tripImportFiles).not.toHaveBeenCalled()
  })

  it('shows the widened control label and accept list', () => {
    renderTrip()

    expect(screen.getByRole('button', { name: 'Import files' })).toBeDefined()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('.kml,.kmz,.jpg,.jpeg,.png,.webp')
  })

  it('shows the widened drop-overlay copy while dragging over an open trip', () => {
    renderTrip()
    const app = document.querySelector('.app') as HTMLElement

    fireEvent.dragEnter(app, { dataTransfer: fileDataTransfer(['a.jpg']) })

    expect(screen.getByText('Drop tracks or photos')).toBeDefined()
  })

  it('merges progress and failures from both pipelines under the one control', () => {
    useTripImport.mockReturnValue(
      baseTripImport({ progress: [{ name: 'day-1.kml', index: 1, total: 2, phase: 'uploading' }] }),
    )
    usePhotoImport.mockReturnValue(
      basePhotoImport({ failures: [{ id: 'photo-failure-1', name: 'IMG_1.heic', message: 'heic message' }] }),
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
    usePhotoImport.mockReturnValue(
      basePhotoImport({
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
