import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCairnImport, ALREADY_IN_TRIP_MESSAGE } from './useCairnImport'
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
  findOrCreateTripCairnsFolder.mockReset().mockResolvedValue('cairns-folder-id')
  findOrCreateTripCairnItemFolder.mockReset().mockResolvedValue('item-folder-id')
  listSubfolders.mockReset().mockResolvedValue([])
  writeJsonFile.mockReset().mockResolvedValue(undefined)
  findJsonFile.mockReset().mockResolvedValue(null)
  readJsonFile.mockReset()
  trashFolder.mockReset().mockResolvedValue(undefined)
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-id' })
  trashFile.mockReset().mockResolvedValue(undefined)
  readPhotoExif.mockReset().mockResolvedValue(okExif({ latitude: 43, longitude: 141 }))
  generateImagePair.mockReset().mockResolvedValue(okImagePair())
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
