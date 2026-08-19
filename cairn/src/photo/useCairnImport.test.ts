import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCairnImport, ALREADY_IN_TRIP_MESSAGE, type CairnRecord } from './useCairnImport'
import { readCachedCairns, writeCachedCairns } from '../store/cairnCache'
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

const { listSubfolders, writeJsonFile, findJsonFile, findJsonFilesByFolders, readJsonFileContent, trashFolder } =
  vi.hoisted(() => ({
    listSubfolders: vi.fn(),
    writeJsonFile: vi.fn(),
    findJsonFile: vi.fn(),
    findJsonFilesByFolders: vi.fn(),
    readJsonFileContent: vi.fn(),
    trashFolder: vi.fn(),
  }))
vi.mock('../drive/tripMetadata', async () => {
  const actual = await vi.importActual<typeof import('../drive/tripMetadata')>('../drive/tripMetadata')
  return {
    JSON_FILE_BATCH_SIZE: actual.JSON_FILE_BATCH_SIZE,
    listSubfolders,
    writeJsonFile,
    findJsonFile,
    findJsonFilesByFolders,
    readJsonFileContent,
    trashFolder,
  }
})

const { startResumableUpload, uploadFileContent, trashFile } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
  trashFile: vi.fn(),
}))
vi.mock('../drive/trackFiles', async () => {
  const actual = await vi.importActual<typeof import('../drive/trackFiles')>('../drive/trackFiles')
  return { ...actual, startResumableUpload, uploadFileContent, trashFile }
})

const { readPhotoExif } = vi.hoisted(() => ({ readPhotoExif: vi.fn() }))
vi.mock('./exif', () => ({ readPhotoExif }))

const { generateImagePair } = vi.hoisted(() => ({ generateImagePair: vi.fn() }))
vi.mock('./thumbnail', async () => {
  const actual = await vi.importActual<typeof import('./thumbnail')>('./thumbnail')
  return { ...actual, generateImagePair }
})

function file(name: string): File {
  return new File(['content'], name, { type: 'image/jpeg' })
}

function okExif(overrides: Partial<{ latitude: number; longitude: number; gpsTimestamp: string; dateTimeOriginal: string; orientation: number }> = {}) {
  return { ok: true as const, exif: overrides }
}

/** Distinct sizes so a test can tell which render's bytes were uploaded —
    the source `file()` below is 7 bytes, and neither of these is. */
const DISPLAY_BLOB = new Blob(['downscaled-display'])
const THUMBNAIL_BLOB = new Blob(['thumb'])

function okImagePair() {
  return { ok: true as const, display: DISPLAY_BLOB, thumbnail: THUMBNAIL_BLOB }
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
  // #243 gave cairns a `localStorage` cache, so a trip hydrated by one test
  // would arrive already populated in the next.
  window.localStorage.clear()
  findOrCreateTripCairnsFolder.mockReset().mockResolvedValue('cairns-folder-id')
  findOrCreateTripCairnItemFolder.mockReset().mockResolvedValue('item-folder-id')
  listSubfolders.mockReset().mockResolvedValue([])
  writeJsonFile.mockReset().mockResolvedValue(undefined)
  findJsonFile.mockReset().mockResolvedValue(null)
  findJsonFilesByFolders.mockReset().mockResolvedValue(new Map())
  readJsonFileContent.mockReset()
  trashFolder.mockReset().mockResolvedValue(undefined)
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-id' })
  trashFile.mockReset().mockResolvedValue(undefined)
  readPhotoExif.mockReset().mockResolvedValue(okExif({ latitude: 43, longitude: 141 }))
  generateImagePair.mockReset().mockResolvedValue(okImagePair())
})

describe('useCairnImport', () => {
  function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
    return {
      id: 'cairn-a',
      name: 'a.jpg',
      position: { lat: 1, lng: 2 },
      positionSource: 'exif',
      icon: null,
      image: { originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
      description: '',
      date: null,
      ...overrides,
    }
  }

  it('lists trips/<id>/cairns/ and reads each cairn.json back on mount (#242)', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'cairn-a' }])
    findJsonFilesByFolders.mockResolvedValue(new Map([['folder-a', 'file-a']]))
    readJsonFileContent.mockResolvedValue(cairnRecord({ name: 'a.jpg' }))

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(findOrCreateTripCairnsFolder).toHaveBeenCalledWith('token', 'cairn-folder-id', 'trip-1')
    expect(findJsonFilesByFolders).toHaveBeenCalledWith('token', ['folder-a'], 'cairn.json')
    expect(readJsonFileContent).toHaveBeenCalledWith('token', 'file-a')
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].name).toBe('a.jpg')
  })

  it('skips a cairn folder holding no cairn.json, without sinking the rest', async () => {
    listSubfolders.mockResolvedValue([
      { id: 'folder-a', name: 'cairn-a' },
      { id: 'folder-b', name: 'cairn-b' },
    ])
    // folder-a is absent from the map — no cairn.json in it.
    findJsonFilesByFolders.mockResolvedValue(new Map([['folder-b', 'file-b']]))
    readJsonFileContent.mockResolvedValue(cairnRecord({ id: 'cairn-b', name: 'b.jpg', image: null }))

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].id).toBe('cairn-b')
  })

  it('skips a cairn folder whose cairn.json fails to read, without sinking the rest', async () => {
    listSubfolders.mockResolvedValue([
      { id: 'folder-a', name: 'cairn-a' },
      { id: 'folder-b', name: 'cairn-b' },
    ])
    findJsonFilesByFolders.mockResolvedValue(
      new Map([
        ['folder-a', 'file-a'],
        ['folder-b', 'file-b'],
      ]),
    )
    readJsonFileContent.mockImplementation(async (_token: string, fileId: string) =>
      fileId === 'file-a' ? Promise.reject(new Error('boom')) : cairnRecord({ id: 'cairn-b', name: 'b.jpg' }),
    )

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].id).toBe('cairn-b')
  })

  it('skips a cairn.json that fails isCairnRecord, without sinking the rest', async () => {
    listSubfolders.mockResolvedValue([
      { id: 'folder-a', name: 'cairn-a' },
      { id: 'folder-b', name: 'cairn-b' },
    ])
    findJsonFilesByFolders.mockResolvedValue(
      new Map([
        ['folder-a', 'file-a'],
        ['folder-b', 'file-b'],
      ]),
    )
    readJsonFileContent.mockImplementation(async (_token: string, fileId: string) =>
      fileId === 'file-a' ? { not: 'a cairn' } : cairnRecord({ id: 'cairn-b', name: 'b.jpg' }),
    )

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0].id).toBe('cairn-b')
  })

  it('batches the name lookup at JSON_FILE_BATCH_SIZE folders per query (#242)', async () => {
    const folders = Array.from({ length: 30 }, (_, i) => ({ id: `folder-${i}`, name: `cairn-${i}` }))
    listSubfolders.mockResolvedValue(folders)
    findJsonFilesByFolders.mockResolvedValue(new Map())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(findJsonFilesByFolders).toHaveBeenCalledTimes(2)
    expect(findJsonFilesByFolders.mock.calls[0][1]).toHaveLength(25)
    expect(findJsonFilesByFolders.mock.calls[1][1]).toHaveLength(5)
  })

  it("one batch's name-lookup query failing does not sink cairns in other batches", async () => {
    const folders = Array.from({ length: 30 }, (_, i) => ({ id: `folder-${i}`, name: `cairn-${i}` }))
    listSubfolders.mockResolvedValue(folders)
    findJsonFilesByFolders.mockImplementation(async (_token: string, folderIds: string[]) => {
      if (folderIds.includes('folder-0')) throw new Error('batch failed')
      return new Map(folderIds.map((id) => [id, `file-${id}`]))
    })
    readJsonFileContent.mockImplementation(async (_token: string, fileId: string) =>
      cairnRecord({ id: fileId, name: fileId }),
    )

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // The first 25 folders (batch 1) failed entirely; the remaining 5 (batch 2) loaded.
    expect(result.current.cairns).toHaveLength(5)
  })

  it('reads cairn.json content concurrently, bounded to a fixed limit', async () => {
    const folders = Array.from({ length: 20 }, (_, i) => ({ id: `folder-${i}`, name: `cairn-${i}` }))
    listSubfolders.mockResolvedValue(folders)
    findJsonFilesByFolders.mockResolvedValue(new Map(folders.map((f) => [f.id, `file-${f.id}`])))
    let active = 0
    let maxActive = 0
    readJsonFileContent.mockImplementation(async (_token: string, fileId: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return cairnRecord({ id: fileId, name: fileId })
    })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns).toHaveLength(20)
    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(8)
  })

  it('does not request headRevisionId for any hydration read', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'cairn-a' }])
    findJsonFilesByFolders.mockResolvedValue(new Map([['folder-a', 'file-a']]))
    readJsonFileContent.mockResolvedValue(cairnRecord())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(findJsonFile).not.toHaveBeenCalled()
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

  it('uploads the downscaled image rather than the camera file, keeping EXIF placement (#187)', async () => {
    readPhotoExif.mockResolvedValue(okExif({ latitude: 37.7749, longitude: -122.4194 }))

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const source = file('IMG_1.jpg')
    await act(() => result.current.importFiles([source]))

    // EXIF is read off the source before the downscale, so the coordinate is
    // the camera's and not lost with the metadata the re-encode strips.
    expect(result.current.cairns[0]).toMatchObject({
      positionSource: 'exif',
      position: { lat: 37.7749, lng: -122.4194 },
    })
    const uploaded = uploadFileContent.mock.calls[0][1] as File
    expect(uploaded).not.toBe(source)
    expect(uploaded.size).toBe(DISPLAY_BLOB.size)
    expect(uploaded.size).not.toBe(source.size)
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

  // #168: a photo that resolves neither by EXIF nor by interpolation waits
  // in the placement queue rather than being rejected — nothing uploads
  // until a position is supplied by hand.
  it('queues a photo with no GPS and no track to interpolate against, uploading nothing yet', async () => {
    readPhotoExif.mockResolvedValue(okExif())

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let importResult!: Awaited<ReturnType<typeof result.current.importFiles>>
    await act(async () => {
      importResult = await result.current.importFiles([file('no-gps.jpg')])
    })

    expect(result.current.cairns).toHaveLength(0)
    expect(result.current.failures).toHaveLength(0)
    expect(importResult.resolvedCount).toBe(0)
    expect(importResult.needsPlacement).toHaveLength(1)
    expect(importResult.needsPlacement[0].name).toBe('no-gps.jpg')
    expect(startResumableUpload).not.toHaveBeenCalled()
  })

  it("a queued item's save() uploads and writes the cairn once a position is supplied by hand", async () => {
    readPhotoExif.mockResolvedValue(okExif())
    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let importResult!: Awaited<ReturnType<typeof result.current.importFiles>>
    await act(async () => {
      importResult = await result.current.importFiles([file('no-gps.jpg')])
    })

    let saveResult: string | false = false
    await act(async () => {
      saveResult = await importResult.needsPlacement[0].save({ lat: 12, lng: 34 })
    })

    expect(saveResult).not.toBe(false)
    expect(result.current.cairns).toHaveLength(1)
    expect(result.current.cairns[0]).toMatchObject({
      name: 'no-gps.jpg',
      position: { lat: 12, lng: 34 },
      positionSource: 'placed',
    })
    expect(startResumableUpload).toHaveBeenCalledWith('token', 'item-folder-id', 'no-gps.jpg')
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

  describe('attachImage (#157)', () => {
    // Seeded via `createCairn` — icon-only, no image, `positionSource:
    // 'placed'`. `writeJsonFile`/`startResumableUpload`/`uploadFileContent`
    // are cleared afterward so each test's own assertions on them start
    // from zero, unpolluted by the seed's own write.
    async function withOneCairn(overrides: Partial<{ date: string | null; icon: 'campsite' | null }> = {}) {
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: overrides.icon ?? null,
          description: '',
          date: overrides.date ?? null,
        }),
      )
      writeJsonFile.mockClear()
      startResumableUpload.mockClear()
      uploadFileContent.mockClear()
      return result
    }

    // `createCairn` always writes `positionSource: 'placed'`, which would
    // make a mutation that drops the "unchanged" guarantee invisible (the
    // field would already hold 'placed' either way) — so this one test
    // seeds through `importFiles` instead, whose EXIF-resolved cairn starts
    // at `positionSource: 'exif'`. Its cairn also starts with an image
    // (a photo import always uploads one), which only matters to this test
    // since it never asserts on `image`.
    async function withImagedExifCairn() {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() => result.current.importFiles([file('campsite.jpg')]))
      await act(() => result.current.setCairnIcon(result.current.cairns[0].id, 'campsite'))
      return result
    }

    it('uploads an original and a thumbnail and writes both ids into image', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id
      readPhotoExif.mockResolvedValue(okExif({ gpsTimestamp: '2024-06-01T09:14:00Z' }))

      let outcome!: Awaited<ReturnType<typeof result.current.attachImage>>
      await act(async () => {
        outcome = await result.current.attachImage(id, file('sunset.jpg'))
      })

      expect(outcome.ok).toBe(true)
      expect(startResumableUpload).toHaveBeenCalledWith('token', 'item-folder-id', 'sunset.jpg')
      expect(startResumableUpload).toHaveBeenCalledWith('token', 'item-folder-id', 'sunset.jpg.thumb.jpg')
      // #187: the bytes that went up are the downscale's, not the source's.
      expect((uploadFileContent.mock.calls[0][1] as File).size).toBe(DISPLAY_BLOB.size)
      expect(result.current.cairns[0].image).toEqual({
        originalDriveFileId: 'drive-file-id',
        thumbnailDriveFileId: 'drive-file-id',
      })
      expect(writeJsonFile).toHaveBeenCalledWith(
        'token',
        'item-folder-id',
        'cairn.json',
        expect.objectContaining({ id, image: expect.any(Object) }),
        null,
      )
    })

    it("does not touch position, positionSource, or icon", async () => {
      const result = await withImagedExifCairn()
      const id = result.current.cairns[0].id
      const before = result.current.cairns[0]
      expect(before.positionSource).toBe('exif')
      expect(before.icon).toBe('campsite')

      await act(async () => {
        await result.current.attachImage(id, file('sunset.jpg'))
      })

      expect(result.current.cairns[0].position).toEqual(before.position)
      expect(result.current.cairns[0].positionSource).toBe('exif')
      expect(result.current.cairns[0].icon).toBe('campsite')
    })

    it('fills date from EXIF only when the cairn had none', async () => {
      const result = await withOneCairn({ date: '2024-01-01' })
      const id = result.current.cairns[0].id
      readPhotoExif.mockResolvedValue(okExif({ gpsTimestamp: '2024-06-01T09:14:00Z' }))

      await act(async () => {
        await result.current.attachImage(id, file('sunset.jpg'))
      })

      // The cairn already had a date — the photo's is recorded but does not
      // overwrite it.
      expect(result.current.cairns[0].date).toBe('2024-01-01')
      expect(result.current.cairns[0].gpsTimestamp).toBe('2024-06-01T09:14:00Z')
    })

    it('fills the date when the cairn had none', async () => {
      const result = await withOneCairn({ date: null })
      const id = result.current.cairns[0].id
      readPhotoExif.mockResolvedValue(okExif({ gpsTimestamp: '2024-06-01T09:14:00Z' }))

      await act(async () => {
        await result.current.attachImage(id, file('sunset.jpg'))
      })

      expect(result.current.cairns[0].date).toBe('2024-06-01T09:14:00Z')
    })

    it('replacing an image trashes the previous original and thumbnail only after the new ones land', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id
      uploadFileContent
        .mockResolvedValueOnce({ id: 'orig-1' })
        .mockResolvedValueOnce({ id: 'thumb-1' })
      await act(async () => {
        await result.current.attachImage(id, file('first.jpg'))
      })
      expect(trashFile).not.toHaveBeenCalled()

      uploadFileContent
        .mockResolvedValueOnce({ id: 'orig-2' })
        .mockResolvedValueOnce({ id: 'thumb-2' })
      await act(async () => {
        await result.current.attachImage(id, file('second.jpg'))
      })

      expect(trashFile).toHaveBeenCalledWith('token', 'orig-1')
      expect(trashFile).toHaveBeenCalledWith('token', 'thumb-1')
      expect(result.current.cairns[0].image).toEqual({
        originalDriveFileId: 'orig-2',
        thumbnailDriveFileId: 'thumb-2',
      })
    })

    it('rejects a non-image file up front, with no upload attempted', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      let outcome!: Awaited<ReturnType<typeof result.current.attachImage>>
      await act(async () => {
        outcome = await result.current.attachImage(id, file('notes.txt'))
      })

      expect(outcome.ok).toBe(false)
      expect(startResumableUpload).not.toHaveBeenCalled()
      expect(result.current.cairns[0].image).toBeNull()
    })

    it('a failed upload leaves the cairn exactly as it was, with no partial image', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id
      uploadFileContent.mockResolvedValueOnce({ id: 'orig-1' }).mockRejectedValueOnce(new Error('network'))

      let outcome!: Awaited<ReturnType<typeof result.current.attachImage>>
      await act(async () => {
        outcome = await result.current.attachImage(id, file('sunset.jpg'))
      })

      expect(outcome.ok).toBe(false)
      expect(result.current.cairns[0].image).toBeNull()
    })
  })

  describe('setCairnPosition (#158)', () => {
    async function withOneCairn() {
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description: '',
          date: null,
        }),
      )
      writeJsonFile.mockClear()
      return result
    }

    it('writes the new coordinate and sets positionSource to placed', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      let ok = false
      await act(async () => {
        ok = await result.current.setCairnPosition(id, { lat: 9, lng: 10 })
      })

      expect(ok).toBe(true)
      expect(result.current.cairns[0].position).toEqual({ lat: 9, lng: 10 })
      expect(result.current.cairns[0].positionSource).toBe('placed')
      expect(writeJsonFile).toHaveBeenCalledWith(
        'token',
        'item-folder-id',
        'cairn.json',
        expect.objectContaining({ id, position: { lat: 9, lng: 10 }, positionSource: 'placed' }),
        null,
      )
    })

    it('changes only position and positionSource — icon and description survive', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id
      const before = result.current.cairns[0]

      await act(async () => {
        await result.current.setCairnPosition(id, { lat: 9, lng: 10 })
      })

      expect(result.current.cairns[0]).toEqual({ ...before, position: { lat: 9, lng: 10 }, positionSource: 'placed' })
    })

    it('resolves true and writes nothing for a zero-distance drop', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      const ok = await result.current.setCairnPosition(id, { lat: 1, lng: 2 })

      expect(ok).toBe(true)
      expect(writeJsonFile).not.toHaveBeenCalled()
    })

    it('leaves the cairn exactly as it was when the write fails', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id
      const before = result.current.cairns[0]
      writeJsonFile.mockRejectedValueOnce(new Error('offline'))

      const ok = await result.current.setCairnPosition(id, { lat: 9, lng: 10 })

      expect(ok).toBe(false)
      expect(result.current.cairns[0]).toEqual(before)
    })
  })

  describe('setCairnText (#196)', () => {
    async function withOneCairn(description = '') {
      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      await waitFor(() => expect(result.current.loading).toBe(false))
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description,
          date: null,
        }),
      )
      writeJsonFile.mockClear()
      return result
    }

    it('writes a new name and leaves every other field alone', async () => {
      const result = await withOneCairn('A good spot.')
      const id = result.current.cairns[0].id
      const before = result.current.cairns[0]

      let ok = false
      await act(async () => {
        ok = await result.current.setCairnText(id, { name: 'Camp two' })
      })

      expect(ok).toBe(true)
      expect(result.current.cairns[0]).toEqual({ ...before, name: 'Camp two' })
      expect(writeJsonFile).toHaveBeenCalledWith(
        'token',
        'item-folder-id',
        'cairn.json',
        expect.objectContaining({ id, name: 'Camp two', description: 'A good spot.' }),
        null,
      )
    })

    it('saves an empty description — unlike a name, clearing one is a real value', async () => {
      const result = await withOneCairn('To be cleared.')
      const id = result.current.cairns[0].id

      let ok = false
      await act(async () => {
        ok = await result.current.setCairnText(id, { description: '' })
      })

      expect(ok).toBe(true)
      expect(result.current.cairns[0].description).toBe('')
      expect(writeJsonFile).toHaveBeenCalledWith(
        'token',
        'item-folder-id',
        'cairn.json',
        expect.objectContaining({ id, description: '' }),
        null,
      )
    })

    it('drops an empty or whitespace-only name as an aborted edit, writing nothing', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      let ok = false
      await act(async () => {
        ok = await result.current.setCairnText(id, { name: '   ' })
      })

      expect(ok).toBe(true)
      expect(result.current.cairns[0].name).toBe('Campsite')
      expect(writeJsonFile).not.toHaveBeenCalled()
    })

    it('trims trailing whitespace off a description but keeps its newlines', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      await act(async () => {
        await result.current.setCairnText(id, { description: 'First line\nSecond line\n\n  ' })
      })

      expect(result.current.cairns[0].description).toBe('First line\nSecond line')
    })

    it('resolves true and writes nothing when neither field actually changes', async () => {
      const result = await withOneCairn('A good spot.')
      const id = result.current.cairns[0].id

      const ok = await result.current.setCairnText(id, { name: 'Campsite', description: 'A good spot.' })

      expect(ok).toBe(true)
      expect(writeJsonFile).not.toHaveBeenCalled()
    })

    it('reverts to the previous values when the write fails', async () => {
      const result = await withOneCairn('Original.')
      const id = result.current.cairns[0].id
      const before = result.current.cairns[0]
      writeJsonFile.mockRejectedValueOnce(new Error('offline'))

      let ok = true
      await act(async () => {
        ok = await result.current.setCairnText(id, { name: 'Doomed', description: 'Also doomed.' })
      })

      expect(ok).toBe(false)
      expect(result.current.cairns[0]).toEqual(before)
    })

    it('writes both fields in one call when a face commits both', async () => {
      const result = await withOneCairn()
      const id = result.current.cairns[0].id

      await act(async () => {
        await result.current.setCairnText(id, { name: 'Camp two', description: 'Sheltered.' })
      })

      expect(writeJsonFile).toHaveBeenCalledTimes(1)
      expect(result.current.cairns[0].name).toBe('Camp two')
      expect(result.current.cairns[0].description).toBe('Sheltered.')
    })
  })

  /* #243 — every mutation writes the cache as well as state, so a remount
     straight afterwards shows the change without waiting on Drive. The
     failure this guards against is silent and delayed: state and Drive
     agree, the cache does not, and the trip reopens showing the edit undone
     until the revalidation lands. */
  describe('the cache follows every mutation (#243)', () => {
    async function mounted() {
      const result = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', [])).result
      await waitFor(() => expect(result.current.loading).toBe(false))
      return result
    }

    it('caches an imported cairn', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const result = await mounted()

      await act(() => result.current.importFiles([file('a.jpg')]))

      expect(readCachedCairns('trip-1')?.map((cairn) => cairn.name)).toEqual(['a.jpg'])
    })

    it('caches a cairn created by hand', async () => {
      const result = await mounted()

      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description: '',
          date: null,
        }),
      )

      expect(readCachedCairns('trip-1')?.map((cairn) => cairn.name)).toEqual(['Campsite'])
    })

    it('caches an edited name and a retyped icon', async () => {
      const result = await mounted()
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description: '',
          date: null,
        }),
      )
      const id = result.current.cairns[0].id

      await act(async () => {
        await result.current.setCairnText(id, { name: 'Camp two' })
      })
      await act(async () => {
        await result.current.setCairnIcon(id, 'hut')
      })

      expect(readCachedCairns('trip-1')?.[0]).toMatchObject({ name: 'Camp two', icon: 'hut' })
    })

    it('caches a moved cairn', async () => {
      const result = await mounted()
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description: '',
          date: null,
        }),
      )
      const id = result.current.cairns[0].id

      await act(async () => {
        await result.current.setCairnPosition(id, { lat: 5, lng: 6 })
      })

      expect(readCachedCairns('trip-1')?.[0]).toMatchObject({
        position: { lat: 5, lng: 6 },
        positionSource: 'placed',
      })
    })

    it('drops a deleted cairn from the cache', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const result = await mounted()
      await act(() => result.current.importFiles([file('a.jpg')]))
      const id = result.current.cairns[0].id

      await act(() => result.current.removeCairn(id))

      expect(readCachedCairns('trip-1')).toEqual([])
    })

    it('drops a cairn moved out of the trip from the cache', async () => {
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const result = await mounted()
      await act(() => result.current.importFiles([file('a.jpg')]))
      const id = result.current.cairns[0].id

      act(() => result.current.forgetCairn(id))

      expect(readCachedCairns('trip-1')).toEqual([])
    })

    it('leaves the cache alone when an optimistic edit is reverted', async () => {
      const result = await mounted()
      await act(() =>
        result.current.createCairn({
          name: 'Campsite',
          position: { lat: 1, lng: 2 },
          icon: 'campsite',
          description: '',
          date: null,
        }),
      )
      const id = result.current.cairns[0].id
      writeJsonFile.mockRejectedValue(new Error('offline'))

      await act(async () => {
        await result.current.setCairnText(id, { name: 'Camp two' })
      })

      expect(readCachedCairns('trip-1')?.[0]).toMatchObject({ name: 'Campsite' })
    })

    it('degrades to no caching when the storage write throws', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      })
      readPhotoExif.mockResolvedValue(okExif({ latitude: 1, longitude: 2 }))
      const result = await mounted()

      await act(() => result.current.importFiles([file('a.jpg')]))

      // The import itself is untouched — a full disk costs speed, not data.
      expect(result.current.cairns).toHaveLength(1)
      expect(result.current.failures).toHaveLength(0)
      setItem.mockRestore()
    })

    it('replaces a stale cached set wholesale on the next hydration', async () => {
      writeCachedCairns('trip-1', [
        {
          id: 'gone',
          name: 'deleted-elsewhere.jpg',
          position: { lat: 1, lng: 2 },
          positionSource: 'exif',
          icon: null,
          image: null,
          description: '',
          date: null,
        },
      ])
      listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'cairn-a' }])
      findJsonFilesByFolders.mockResolvedValue(new Map([['folder-a', 'file-a']]))
      readJsonFileContent.mockResolvedValue(cairnRecord({ id: 'cairn-a', name: 'from-drive.jpg' }))

      const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
      // Cached, so nothing is loading — the record on screen is the stale one.
      expect(result.current.loading).toBe(false)
      expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['gone'])

      await waitFor(() => expect(result.current.hydrated).toBe(true))

      expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['cairn-a'])
      expect(readCachedCairns('trip-1')?.map((cairn) => cairn.id)).toEqual(['cairn-a'])
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
