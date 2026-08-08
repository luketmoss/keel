import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PHOTOS_INDEX_NAME, readPhotoIndex, removePhotoFromIndex, writePhotoIndex } from './photoIndex'

const { listTrackFiles, downloadTrackFile, startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  listTrackFiles: vi.fn(),
  downloadTrackFile: vi.fn(),
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
vi.mock('../drive/trackFiles', () => ({ listTrackFiles, downloadTrackFile, startResumableUpload, uploadFileContent }))

function indexFile(content: unknown, name = PHOTOS_INDEX_NAME): File {
  return new File([JSON.stringify(content)], name, { type: 'application/json' })
}

/** Reads back whatever the most recent `uploadFileContent` call actually
    wrote, as parsed JSON — what `writePhotoIndex`'s callers (including
    `removePhotoFromIndex`) are checked against, since the mock only
    records the `File` it was handed. */
async function readUploadedIndex(): Promise<{ version: number; photos: unknown[] }> {
  const uploadedFile = uploadFileContent.mock.calls.at(-1)?.[1] as File
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsText(uploadedFile)
  })
  return JSON.parse(text)
}

beforeEach(() => {
  listTrackFiles.mockReset()
  downloadTrackFile.mockReset()
  startResumableUpload.mockReset()
  uploadFileContent.mockReset()
})

describe('writePhotoIndex', () => {
  it('uploads photos.json through a resumable upload session, same as a track file', async () => {
    startResumableUpload.mockResolvedValue('session-uri')
    uploadFileContent.mockResolvedValue({ id: 'index-file-id' })

    await writePhotoIndex('token', 'folder-id', [
      { name: 'a.jpg', originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    ])

    expect(startResumableUpload).toHaveBeenCalledWith('token', 'folder-id', PHOTOS_INDEX_NAME)
    expect(uploadFileContent).toHaveBeenCalledWith('session-uri', expect.any(File), 'token')

    const uploadedFile = uploadFileContent.mock.calls[0][1] as File
    expect(uploadedFile.name).toBe(PHOTOS_INDEX_NAME)
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(uploadedFile)
    })
    const parsed = JSON.parse(text)
    expect(parsed).toEqual({
      version: 1,
      photos: [{ name: 'a.jpg', originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' }],
    })
  })
})

describe('readPhotoIndex', () => {
  it('finds photos.json among the trip folder\'s files and reads it back', async () => {
    listTrackFiles.mockResolvedValue([
      { id: 'track-1', name: 'day-1.kml' },
      { id: 'index-1', name: PHOTOS_INDEX_NAME },
    ])
    downloadTrackFile.mockResolvedValue(
      indexFile({
        version: 1,
        photos: [
          {
            name: 'a.jpg',
            originalDriveFileId: 'orig-1',
            thumbnailDriveFileId: 'thumb-1',
            latitude: 37.7749,
            longitude: -122.4194,
            gpsTimestamp: '2021-06-15T21:45:10.000Z',
            dateTimeOriginal: '2021-06-15T14:30:00',
          },
        ],
      }),
    )

    const records = await readPhotoIndex('token', 'folder-id')

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      name: 'a.jpg',
      originalDriveFileId: 'orig-1',
      thumbnailDriveFileId: 'thumb-1',
      latitude: 37.7749,
      longitude: -122.4194,
      gpsTimestamp: '2021-06-15T21:45:10.000Z',
      dateTimeOriginal: '2021-06-15T14:30:00',
    })
    expect(typeof records[0].id).toBe('string')
  })

  it('returns an empty list when no photos.json exists yet, without error', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'track-1', name: 'day-1.kml' }])

    const records = await readPhotoIndex('token', 'folder-id')

    expect(records).toEqual([])
    expect(downloadTrackFile).not.toHaveBeenCalled()
  })

  it('treats an unreadable or corrupted index as empty rather than throwing', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'index-1', name: PHOTOS_INDEX_NAME }])
    downloadTrackFile.mockResolvedValue(new File(['not json'], PHOTOS_INDEX_NAME))

    await expect(readPhotoIndex('token', 'folder-id')).resolves.toEqual([])
  })

  it('treats a whole-read failure (folder listing itself failing) as empty', async () => {
    listTrackFiles.mockRejectedValue(new Error('network error'))

    await expect(readPhotoIndex('token', 'folder-id')).resolves.toEqual([])
  })
})

describe('removePhotoFromIndex', () => {
  it('drops the matched photo and writes back everything else (#132)', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'index-1', name: PHOTOS_INDEX_NAME }])
    downloadTrackFile.mockResolvedValue(
      indexFile({
        version: 1,
        photos: [
          { name: 'a.jpg', originalDriveFileId: 'orig-a', thumbnailDriveFileId: 'thumb-a' },
          { name: 'b.jpg', originalDriveFileId: 'orig-b', thumbnailDriveFileId: 'thumb-b' },
        ],
      }),
    )
    startResumableUpload.mockResolvedValue('session-uri')
    uploadFileContent.mockResolvedValue({ id: 'index-file-id' })

    await removePhotoFromIndex('token', 'folder-id', 'orig-a')

    const written = await readUploadedIndex()
    expect(written.photos).toEqual([
      { name: 'b.jpg', originalDriveFileId: 'orig-b', thumbnailDriveFileId: 'thumb-b' },
    ])
  })

  it('leaves every entry in place when the id names nothing in the index', async () => {
    listTrackFiles.mockResolvedValue([{ id: 'index-1', name: PHOTOS_INDEX_NAME }])
    downloadTrackFile.mockResolvedValue(
      indexFile({
        version: 1,
        photos: [{ name: 'a.jpg', originalDriveFileId: 'orig-a', thumbnailDriveFileId: 'thumb-a' }],
      }),
    )
    startResumableUpload.mockResolvedValue('session-uri')
    uploadFileContent.mockResolvedValue({ id: 'index-file-id' })

    await removePhotoFromIndex('token', 'folder-id', 'no-such-id')

    const written = await readUploadedIndex()
    expect(written.photos).toEqual([
      { name: 'a.jpg', originalDriveFileId: 'orig-a', thumbnailDriveFileId: 'thumb-a' },
    ])
  })
})
