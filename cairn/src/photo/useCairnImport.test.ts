import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCairnImport, ALREADY_IN_TRIP_MESSAGE, NO_LOCATION_MESSAGE } from './useCairnImport'
import { DriveAuthError, DriveQuotaError } from '../drive/trackFiles'
import type { Track } from '../kml/parse'

const { findOrCreateTripCairnsFolder, findOrCreateTripCairnItemFolder } = vi.hoisted(() => ({
  findOrCreateTripCairnsFolder: vi.fn(),
  findOrCreateTripCairnItemFolder: vi.fn(),
}))
vi.mock('../drive/tripCairnFolder', () => ({
  findOrCreateTripCairnsFolder,
  findOrCreateTripCairnItemFolder,
}))

const { listSubfolders, writeJsonFile, findJsonFile, readJsonFile, trashFolder } = vi.hoisted(() => ({
  listSubfolders: vi.fn(),
  writeJsonFile: vi.fn(),
  findJsonFile: vi.fn(),
  readJsonFile: vi.fn(),
  trashFolder: vi.fn(),
}))
vi.mock('../drive/tripMetadata', () => ({
  listSubfolders,
  writeJsonFile,
  findJsonFile,
  readJsonFile,
  trashFolder,
}))

const { startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
vi.mock('../drive/trackFiles', async () => {
  const actual = await vi.importActual<typeof import('../drive/trackFiles')>('../drive/trackFiles')
  return { ...actual, startResumableUpload, uploadFileContent }
})

const { readPhotoExif } = vi.hoisted(() => ({ readPhotoExif: vi.fn() }))
vi.mock('./exif', () => ({ readPhotoExif }))

const { generateThumbnail } = vi.hoisted(() => ({ generateThumbnail: vi.fn() }))
vi.mock('./thumbnail', async () => {
  const actual = await vi.importActual<typeof import('./thumbnail')>('./thumbnail')
  return { ...actual, generateThumbnail }
})

function file(name: string): File {
  return new File(['content'], name, { type: 'image/jpeg' })
}

function okExif(overrides: Partial<{ latitude: number; longitude: number; gpsTimestamp: string; dateTimeOriginal: string; orientation: number }> = {}) {
  return { ok: true as const, exif: overrides }
}

function okThumbnail() {
  return { ok: true as const, blob: new Blob(['thumb']), width: 100, height: 100 }
}

// Points within MAX_INTERPOLATION_GAP_MS (10 minutes) of each other —
// interpolate.ts refuses to bridge a wider gap.
const bracketingTrack: Track = {
  name: 'Track',
  points: [
    { lat: 10, lon: 20, time: '2024-01-01T00:00:00Z' },
    { lat: 11, lon: 21, time: '2024-01-01T00:05:00Z' },
  ],
}

beforeEach(() => {
  findOrCreateTripCairnsFolder.mockReset().mockResolvedValue('cairns-folder-id')
  findOrCreateTripCairnItemFolder.mockReset().mockResolvedValue('item-folder-id')
  listSubfolders.mockReset().mockResolvedValue([])
  writeJsonFile.mockReset().mockResolvedValue(undefined)
  findJsonFile.mockReset().mockResolvedValue(null)
  readJsonFile.mockReset()
  trashFolder.mockReset().mockResolvedValue(undefined)
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-id' })
  readPhotoExif.mockReset().mockResolvedValue(okExif({ latitude: 43, longitude: 141 }))
  generateThumbnail.mockReset().mockResolvedValue(okThumbnail())
})

describe('useCairnImport', () => {
  it('lists trips/<id>/cairns/ and reads each cairn.json back on mount', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'cairn-a' }])
    findJsonFile.mockResolvedValue({ fileId: 'file-a', headRevisionId: 'rev-1' })
    readJsonFile.mockResolvedValue({
      data: {
        id: 'cairn-a',
        name: 'a.jpg',
        position: { lat: 1, lng: 2 },
        positionSource: 'exif',
        icon: null,
        image: { originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
        description: '',
        date: null,
      },
      headRevisionId: 'rev-1',
    })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(findOrCreateTripCairnsFolder).toHaveBeenCalledWith('token', 'cairn-folder-id', 'trip-1')
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].name).toBe('a.jpg')
  })

  it('skips a cairn folder whose cairn.json fails to read, without sinking the rest', async () => {
    listSubfolders.mockResolvedValue([
      { id: 'folder-a', name: 'cairn-a' },
      { id: 'folder-b', name: 'cairn-b' },
    ])
    findJsonFile.mockImplementation(async (_token: string, folderId: string) =>
      folderId === 'folder-a' ? null : { fileId: 'file-b', headRevisionId: 'rev-1' },
    )
    readJsonFile.mockResolvedValue({
      data: {
        id: 'cairn-b',
        name: 'b.jpg',
        position: { lat: 1, lng: 2 },
        positionSource: 'exif',
        icon: null,
        image: null,
        description: '',
        date: null,
      },
      headRevisionId: 'rev-1',
    })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].id).toBe('cairn-b')
  })

  it('creates a cairn with positionSource exif when the photo carries its own GPS', async () => {
    readPhotoExif.mockResolvedValue(okExif({ latitude: 37.7749, longitude: -122.4194 }))

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg')]))

    expect(result.current.failures).toHaveLength(0)
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0]).toMatchObject({
      name: 'IMG_1.jpg',
      position: { lat: 37.7749, lng: -122.4194 },
      positionSource: 'exif',
      image: { originalDriveFileId: 'drive-file-id', thumbnailDriveFileId: 'drive-file-id' },
    })
    expect(startResumableUpload).toHaveBeenCalledWith('token', 'item-folder-id', 'IMG_1.jpg')
    expect(startResumableUpload).toHaveBeenCalledWith('token', 'item-folder-id', 'IMG_1.jpg.thumb.jpg')
    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'item-folder-id',
      'cairn.json',
      expect.objectContaining({ positionSource: 'exif' }),
      null,
    )
  })

  it('creates a cairn with positionSource interpolated when the trip open has no GPS but a track covers its capture time', async () => {
    readPhotoExif.mockResolvedValue(okExif({ gpsTimestamp: '2024-01-01T00:02:30Z' }))

    const { result } = renderHook(() =>
      useCairnImport('trip-1', 'token', 'cairn-folder-id', [bracketingTrack]),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg')]))

    expect(result.current.failures).toHaveLength(0)
    expect(result.current.cairns[0].positionSource).toBe('interpolated')
    expect(result.current.cairns[0].position.lat).toBeCloseTo(10.5)
    expect(result.current.cairns[0].position.lng).toBeCloseTo(20.5)
  })

  it('rejects a photo with no GPS and no track to interpolate against, uploading nothing', async () => {
    readPhotoExif.mockResolvedValue(okExif())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('no-gps.jpg')]))

    expect(result.current.cairns).toHaveLength(0)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0]).toMatchObject({ name: 'no-gps.jpg', message: NO_LOCATION_MESSAGE })
    expect(startResumableUpload).not.toHaveBeenCalled()
  })

  it('rejects a duplicate name within the same trip, matched case-insensitively', async () => {
    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg')]))
    await act(() => result.current.importFiles([file('IMG_1.JPG')]))

    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.failures[0]).toMatchObject({ name: 'IMG_1.JPG', message: ALREADY_IN_TRIP_MESSAGE })
  })

  it('rejects a HEIC file by name before ever resolving a position', async () => {
    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.heic'), file('IMG_2.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('IMG_1.heic')
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].name).toBe('IMG_2.jpg')
    expect(readPhotoExif).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'IMG_1.heic' }))
  })

  it("one file's upload failure does not block the rest of the batch", async () => {
    uploadFileContent.mockRejectedValueOnce(new Error('network error')).mockResolvedValue({ id: 'ok-id' })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('bad.jpg'), file('good.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('bad.jpg')
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].name).toBe('good.jpg')
  })

  it('reports a signed-out failure with reconnect, and does not attempt any upload', async () => {
    uploadFileContent.mockRejectedValue(new DriveAuthError())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))

    expect(result.current.failures[0]).toMatchObject({ reconnect: true })
    expect(result.current.failures[0].retryFile).toBeInstanceOf(File)
  })

  it('reports a Drive-quota failure distinctly, with no retry file', async () => {
    uploadFileContent.mockRejectedValue(new DriveQuotaError())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))

    expect(result.current.failures[0]).toMatchObject({ message: 'Drive is out of space' })
    expect(result.current.failures[0].retryFile).toBeUndefined()
  })

  it('retryFailure re-attempts the same file and clears the failure on success', async () => {
    uploadFileContent.mockRejectedValueOnce(new Error('network error')).mockResolvedValue({ id: 'ok-id' })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))
    expect(result.current.failures).toHaveLength(1)
    const failureId = result.current.failures[0].id

    await act(() => result.current.retryFailure(failureId))

    expect(result.current.failures).toHaveLength(0)
    expect(result.current.cairns).toHaveLength(1)
  })

  describe('removeCairn (#77)', () => {
    it('trashes the whole folder and drops the cairn from state', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() => result.current.importFiles([file('a.jpg')]))
      const id = result.current.cairns[0].id

      await act(() => result.current.removeCairn(id))

      expect(trashFolder).toHaveBeenCalledWith('token', 'item-folder-id')
      expect(result.current.cairns).toHaveLength(0)
    })

    it('records a failure and keeps the row when the trash call fails', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      trashFolder.mockRejectedValue(new Error('offline'))
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() => result.current.importFiles([file('a.jpg')]))
      const id = result.current.cairns[0].id

      await act(() => result.current.removeCairn(id))

      expect(result.current.cairns).toHaveLength(1)
      expect(result.current.cairnRemoveErrors[id]).toContain("Couldn't remove")
    })
  })

  describe('forgetCairn (#132)', () => {
    it('drops the cairn from state with no Drive call of its own', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() => result.current.importFiles([file('a.jpg')]))
      const id = result.current.cairns[0].id
      trashFolder.mockClear()

      act(() => result.current.forgetCairn(id))

      expect(result.current.cairns).toHaveLength(0)
      expect(trashFolder).not.toHaveBeenCalled()
    })
  })
})
