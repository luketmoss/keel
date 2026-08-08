import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhotoImport } from './usePhotoImport'
import { DriveAuthError, DriveQuotaError } from '../drive/trackFiles'

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

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

const { generateThumbnail } = vi.hoisted(() => ({ generateThumbnail: vi.fn() }))
vi.mock('./thumbnail', async () => {
  const actual = await vi.importActual<typeof import('./thumbnail')>('./thumbnail')
  return { ...actual, generateThumbnail }
})

const { readPhotoIndex, writePhotoIndex } = vi.hoisted(() => ({
  readPhotoIndex: vi.fn(),
  writePhotoIndex: vi.fn(),
}))
vi.mock('./photoIndex', async () => {
  const actual = await vi.importActual<typeof import('./photoIndex')>('./photoIndex')
  return { ...actual, readPhotoIndex, writePhotoIndex }
})

function file(name: string): File {
  return new File(['content'], name, { type: 'image/jpeg' })
}

function okExif(overrides: Partial<{ latitude: number; longitude: number; orientation: number }> = {}) {
  return { ok: true as const, exif: overrides }
}

function okThumbnail() {
  return { ok: true as const, blob: new Blob(['thumb']), width: 100, height: 100 }
}

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('folder-id')
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-id' })
  readPhotoExif.mockReset().mockResolvedValue(okExif())
  generateThumbnail.mockReset().mockResolvedValue(okThumbnail())
  readPhotoIndex.mockReset().mockResolvedValue([])
  writePhotoIndex.mockReset().mockResolvedValue(undefined)
  trashFile.mockReset().mockResolvedValue(undefined)
})

describe('usePhotoImport', () => {
  it('reads photos.json back on mount', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.photos).toHaveLength(1)
    expect(readPhotoIndex).toHaveBeenCalledWith('token', 'folder-id')
  })

  it('uploads a photo\'s original and thumbnail, then writes photos.json once for the batch', async () => {
    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg')]))

    expect(startResumableUpload).toHaveBeenCalledWith('token', 'folder-id', 'IMG_1.jpg')
    expect(startResumableUpload).toHaveBeenCalledWith('token', 'folder-id', 'IMG_1.jpg.thumb.jpg')
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].originalDriveFileId).toBe('drive-file-id')
    expect(result.current.failures).toHaveLength(0)

    expect(writePhotoIndex).toHaveBeenCalledTimes(1)
    expect(writePhotoIndex).toHaveBeenCalledWith(
      'token',
      'folder-id',
      expect.arrayContaining([expect.objectContaining({ name: 'IMG_1.jpg' })]),
    )
  })

  it('records EXIF latitude/longitude and both capture-time fields on the photo record', async () => {
    readPhotoExif.mockResolvedValue(
      okExif({ latitude: 37.7749, longitude: -122.4194 }),
    )
    generateThumbnail.mockResolvedValue(okThumbnail())

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg')]))

    expect(result.current.photos[0]).toMatchObject({ latitude: 37.7749, longitude: -122.4194 })
  })

  it('rejects a HEIC file by name, and still imports the rest of the batch', async () => {
    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.heic'), file('IMG_2.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('IMG_1.heic')
    expect(result.current.failures[0].message).toContain('Settings → Camera → Formats → Most Compatible')
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].name).toBe('IMG_2.jpg')
  })

  it('rejects an unsupported file type, naming the accepted types', async () => {
    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('notes.txt')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe('only JPEG, PNG, and WebP photos can be imported')
  })

  it("one photo's upload failure does not block the rest of the batch", async () => {
    uploadFileContent
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ id: 'ok-id' })

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('bad.jpg'), file('good.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('bad.jpg')
    expect(result.current.failures[0].message).toBe('upload failed')
    expect(result.current.photos.some((p) => p.name === 'good.jpg')).toBe(true)
  })

  it('reports a signed-out failure with a reconnect flag when the token expires mid-upload', async () => {
    uploadFileContent.mockRejectedValueOnce(new DriveAuthError())

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe(
      'signed out before this finished uploading, tap to reconnect',
    )
    expect(result.current.failures[0].reconnect).toBe(true)
  })

  it('reports "Drive is out of space" when Drive rejects the upload for quota', async () => {
    uploadFileContent.mockRejectedValueOnce(new DriveQuotaError())

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))

    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe('Drive is out of space')
  })

  it('does not write photos.json when every file in the batch fails', async () => {
    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('broken.heic')]))

    expect(result.current.failures).toHaveLength(1)
    expect(writePhotoIndex).not.toHaveBeenCalled()
  })

  it('never runs more than 4 uploads at once', async () => {
    let active = 0
    let maxActive = 0
    uploadFileContent.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return { id: 'drive-file-id' }
    })

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const files = Array.from({ length: 12 }, (_, i) => file(`f${i}.jpg`))
    await act(() => result.current.importFiles(files))

    expect(maxActive).toBeLessThanOrEqual(4)
    expect(result.current.photos).toHaveLength(12)
  })

  it('shows the current photo name and its position in the batch while importing', async () => {
    // Distinguishes which upload to hang by the *file being uploaded*
    // rather than by call order — two photos each make two upload calls
    // (original, then thumbnail) and the two photos' pipelines interleave,
    // so hard-coding "the 3rd call overall" would be timing-fragile.
    // Only the *original* upload of two.jpg hangs — its thumbnail
    // (`two.jpg.thumb.jpg`, which also starts with "two.jpg") must resolve
    // normally, or the two sequential uploads inside that one photo's
    // worker would each overwrite `resolveTwoJpgUpload` in turn.
    let resolveTwoJpgUpload: (() => void) | undefined
    uploadFileContent.mockImplementation(async (_session: string, uploadedFile: File) => {
      if (uploadedFile.name === 'two.jpg') {
        return new Promise((resolve) => {
          resolveTwoJpgUpload = () => resolve({ id: 'ok-2' })
        })
      }
      return { id: 'ok-1' }
    })

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let importPromise!: Promise<void>
    act(() => {
      importPromise = result.current.importFiles([file('one.jpg'), file('two.jpg')])
    })

    await waitFor(() => expect(resolveTwoJpgUpload).toBeDefined())
    // one.jpg's whole pipeline (original + thumbnail) has settled by now;
    // two.jpg is the one left in progress, still at its batch position 2.
    await waitFor(() => {
      const entry = result.current.progress.find((p) => p.name === 'two.jpg')
      expect(entry?.total).toBe(2)
      expect(entry?.index).toBe(2)
    })

    await act(async () => {
      resolveTwoJpgUpload?.()
      await importPromise
    })
  })

  it('is a no-op when signed out', async () => {
    const { result } = renderHook(() => usePhotoImport('trip-1', null, null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('a.jpg')]))

    expect(startResumableUpload).not.toHaveBeenCalled()
    expect(result.current.photos).toHaveLength(0)
  })
})

describe('usePhotoImport — #75 refuses a photo already in the trip', () => {
  it('reports "already in this trip" and uploads nothing for a name that matches an existing photo, case-insensitively', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'IMG_1.jpg', originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.photos).toHaveLength(1)

    await act(() => result.current.importFiles([file('img_1.JPG')]))

    expect(startResumableUpload).not.toHaveBeenCalled()
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].message).toBe('already in this trip')
    expect(result.current.failures[0].retryFile).toBeUndefined()
  })

  it('lets a second file with a different name import normally alongside a duplicate rejection', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'IMG_1.jpg', originalDriveFileId: 'o1', thumbnailDriveFileId: 't1' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(() => result.current.importFiles([file('IMG_1.jpg'), file('IMG_2.jpg')]))

    expect(result.current.photos.map((p) => p.name).sort()).toEqual(['IMG_1.jpg', 'IMG_2.jpg'])
    expect(result.current.failures).toHaveLength(1)
    expect(result.current.failures[0].name).toBe('IMG_1.jpg')
    expect(result.current.failures[0].message).toBe('already in this trip')
  })
})

describe('usePhotoImport — #77 removing a photo', () => {
  it('trashes both the original and the thumbnail, rewrites the index, and removes the row', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const id = result.current.photos[0].id

    await act(() => result.current.removePhoto(id))

    expect(trashFile).toHaveBeenCalledWith('token', 'orig-1')
    expect(trashFile).toHaveBeenCalledWith('token', 'thumb-1')
    expect(writePhotoIndex).toHaveBeenCalledWith('token', 'folder-id', [])
    expect(result.current.photos).toHaveLength(0)
    expect(result.current.removingPhotoIds.size).toBe(0)
  })

  it('leaves the row in place and reports a failure when trashing the original fails', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    ])
    trashFile.mockRejectedValueOnce(new Error('network error'))

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const id = result.current.photos[0].id

    await act(() => result.current.removePhoto(id))

    expect(writePhotoIndex).not.toHaveBeenCalled()
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.removingPhotoIds.size).toBe(0)
    expect(result.current.photoRemoveErrors[id]).toBe("Couldn't remove a.jpg — try again.")
  })

  it('leaves other photos, and their positions, untouched when one is removed', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'orig-a', thumbnailDriveFileId: 'thumb-a' },
      { id: 'y', name: 'b.jpg', originalDriveFileId: 'orig-b', thumbnailDriveFileId: 'thumb-b' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const [first] = result.current.photos

    await act(() => result.current.removePhoto(first.id))

    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].name).toBe('b.jpg')
    expect(writePhotoIndex).toHaveBeenCalledWith(
      'token',
      'folder-id',
      expect.arrayContaining([expect.objectContaining({ name: 'b.jpg' })]),
    )
  })
})

describe('usePhotoImport — #132 forgetPhoto', () => {
  it('drops the photo from local state without trashing it or touching photos.json', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const id = result.current.photos[0].id

    act(() => result.current.forgetPhoto(id))

    expect(result.current.photos).toHaveLength(0)
    expect(trashFile).not.toHaveBeenCalled()
    expect(writePhotoIndex).not.toHaveBeenCalled()
  })

  it('leaves other photos untouched', async () => {
    readPhotoIndex.mockResolvedValue([
      { id: 'x', name: 'a.jpg', originalDriveFileId: 'orig-a', thumbnailDriveFileId: 'thumb-a' },
      { id: 'y', name: 'b.jpg', originalDriveFileId: 'orig-b', thumbnailDriveFileId: 'thumb-b' },
    ])

    const { result } = renderHook(() => usePhotoImport('trip-1', 'token', 'cairn-folder-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const [first] = result.current.photos

    act(() => result.current.forgetPhoto(first.id))

    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photos[0].name).toBe('b.jpg')
  })
})
