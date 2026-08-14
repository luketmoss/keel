import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveLooseStore } from './driveLooseStore'
import type { Track } from '../kml/parse'

/** Same in-memory `Storage` helper the other store tests use. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

const { findOrCreateLooseFolder, findOrCreateLooseItemFolder, moveDriveFile } = vi.hoisted(() => ({
  findOrCreateLooseFolder: vi.fn(),
  findOrCreateLooseItemFolder: vi.fn(),
  moveDriveFile: vi.fn(),
}))
vi.mock('../drive/looseFolder', () => ({
  findOrCreateLooseFolder,
  findOrCreateLooseItemFolder,
  moveDriveFile,
}))

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { findOrCreateTripCairnsFolder, findOrCreateTripCairnItemFolder } = vi.hoisted(() => ({
  findOrCreateTripCairnsFolder: vi.fn(),
  findOrCreateTripCairnItemFolder: vi.fn(),
}))
vi.mock('../drive/tripCairnFolder', () => ({
  findOrCreateTripCairnsFolder,
  findOrCreateTripCairnItemFolder,
}))

const { findJsonFile, readJsonFile, writeJsonFile, listSubfolders, trashFolder, DriveConflictError } =
  vi.hoisted(() => {
    class DriveConflictError extends Error {}
    return {
      findJsonFile: vi.fn(),
      readJsonFile: vi.fn(),
      writeJsonFile: vi.fn(),
      listSubfolders: vi.fn(),
      trashFolder: vi.fn(),
      DriveConflictError,
    }
  })
vi.mock('../drive/tripMetadata', () => ({
  findJsonFile,
  readJsonFile,
  writeJsonFile,
  listSubfolders,
  trashFolder,
  DriveConflictError,
}))

const { startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
vi.mock('../drive/trackFiles', () => ({ startResumableUpload, uploadFileContent }))

const { generateThumbnail } = vi.hoisted(() => ({ generateThumbnail: vi.fn() }))
vi.mock('../photo/thumbnail', async () => {
  const actual = await vi.importActual<typeof import('../photo/thumbnail')>('../photo/thumbnail')
  return { ...actual, generateThumbnail }
})

function track(points: [number, number][]): Track {
  return { name: 'day', points: points.map(([lat, lon]) => ({ lat, lon })) }
}

const NEW_TRACK = {
  name: 'Mount Rosea',
  date: '2024-03-09T00:00:00.000Z',
  distanceMeters: 14200,
  ascentMeters: 690,
  pointCount: 512,
  sourceName: 'rosea.kml',
  colorIndex: 0,
  position: { lat: -37, lng: 142 },
}

const NEW_CAIRN = {
  name: 'sapporo.jpg',
  date: '2024-11-03T00:00:00.000Z',
  gpsTimestamp: '2024-11-03T00:00:00.000Z',
  dateTimeOriginal: '2024-11-03T09:00:00',
  position: { lat: 43, lng: 141 },
  positionSource: 'exif' as const,
}

const GEOMETRY = [
  track([
    [10, 20],
    [11, 21],
  ]),
]

let store: DriveLooseStore

/** A connected store with nothing already in Drive. */
async function connected(): Promise<DriveLooseStore> {
  const fresh = new DriveLooseStore(fakeStorage())
  await fresh.connect('tok', 'cairn-folder')
  return fresh
}

/** Lets every queued flush settle — the store's writes are deliberately
    behind the local one, so a test asserting on Drive has to wait for
    them the way the app never does. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('crypto', { randomUUID: () => Math.random().toString(36).slice(2) })
  findOrCreateLooseFolder.mockReset().mockResolvedValue('kind-folder')
  findOrCreateLooseItemFolder.mockReset().mockResolvedValue('item-folder')
  moveDriveFile.mockReset().mockResolvedValue(undefined)
  findOrCreateTripFolder.mockReset().mockResolvedValue('trip-folder')
  findOrCreateTripCairnsFolder.mockReset().mockResolvedValue('trip-cairns-folder')
  findOrCreateTripCairnItemFolder.mockReset().mockResolvedValue('trip-item-folder')
  findJsonFile.mockReset().mockResolvedValue(null)
  readJsonFile.mockReset()
  writeJsonFile.mockReset().mockResolvedValue({ fileId: 'written', headRevisionId: 'rev-1' })
  listSubfolders.mockReset().mockResolvedValue([])
  trashFolder.mockReset().mockResolvedValue(undefined)
  startResumableUpload.mockReset().mockResolvedValue('session-uri')
  uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-1' })
  generateThumbnail.mockReset().mockResolvedValue({ ok: true, blob: new Blob(['thumb']) })
  store = new DriveLooseStore(fakeStorage())
})

describe('importing a loose track', () => {
  it('puts the source file, track.json and overview.geojson in its own folder', async () => {
    store = await connected()
    const source = new File(['<kml/>'], 'rosea.kml')

    const record = store.addTrack(NEW_TRACK, GEOMETRY, source)
    await settle()

    expect(findOrCreateLooseItemFolder).toHaveBeenCalledWith('tok', 'cairn-folder', 'track', record.id)
    expect(startResumableUpload).toHaveBeenCalledWith('tok', 'item-folder', 'rosea.kml')
    expect(uploadFileContent).toHaveBeenCalledWith('session-uri', source, 'tok')
    const written = writeJsonFile.mock.calls.map((call) => call[2])
    expect(written).toContain('track.json')
    expect(written).toContain('overview.geojson')
  })

  it('shows the row immediately and says it is uploading until the file lands', async () => {
    store = await connected()
    let resolveUpload: (value: { id: string }) => void = () => {}
    uploadFileContent.mockReturnValue(new Promise((resolve) => (resolveUpload = resolve)))

    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))

    // The row and its geometry are there before any network call settles —
    // they are computed locally and do not wait on Drive.
    expect(store.getItems()).toHaveLength(1)
    expect(store.getOverview(record.id)?.features.length).toBeGreaterThan(0)
    await settle()
    expect(store.getItem(record.id)?.uploadState).toBe('uploading')

    resolveUpload({ id: 'drive-file-1' })
    await settle()
    expect(store.getItem(record.id)?.uploadState).toBe('ok')
    expect((store.getItem(record.id) as { driveFileId?: string | null }).driveFileId).toBe('drive-file-1')
  })

  it('marks the item not-on-Drive when the upload fails, and keeps it', async () => {
    store = await connected()
    uploadFileContent.mockRejectedValue(new Error('offline'))

    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()

    expect(store.getItem(record.id)?.uploadState).toBe('failed')
    // Losing the row as well as the upload would be the worse of the two.
    expect(store.getItems()).toHaveLength(1)
  })
})

describe('importing a loose cairn', () => {
  it('uploads the original and a thumbnail alongside cairn.json', async () => {
    store = await connected()
    const source = new File(['jpeg'], 'sapporo.jpg')
    uploadFileContent
      .mockResolvedValueOnce({ id: 'original-1' })
      .mockResolvedValueOnce({ id: 'thumb-1' })

    const record = store.addCairn({ ...NEW_CAIRN, orientation: 6 }, source)
    await settle()

    expect(generateThumbnail).toHaveBeenCalledWith(source, 6)
    expect(startResumableUpload.mock.calls.map((call) => call[2])).toEqual([
      'sapporo.jpg',
      'sapporo.jpg.thumb.jpg',
    ])
    expect(writeJsonFile.mock.calls.map((call) => call[2])).toContain('cairn.json')
    const stored = store.getItem(record.id) as { image?: { originalDriveFileId: string; thumbnailDriveFileId: string } | null }
    expect(stored.image).toEqual({ originalDriveFileId: 'original-1', thumbnailDriveFileId: 'thumb-1' })
  })

  it('is not-on-Drive when the thumbnail lands and the original does not', async () => {
    store = await connected()
    uploadFileContent.mockRejectedValueOnce(new Error('offline'))

    const record = store.addCairn(NEW_CAIRN, new File(['jpeg'], 'sapporo.jpg'))
    await settle()

    // Both files or neither — the "both, or neither" rule, unchanged from #110.
    expect(store.getItem(record.id)?.uploadState).toBe('failed')
  })
})

describe('hydrating from Drive', () => {
  it('reads every loose item back, with its geometry, and marks it on-Drive', async () => {
    listSubfolders.mockImplementation(async () => [{ id: 'folder-a', name: 'track-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folder: string, name: string) => ({
      fileId: `${name}-id`,
      headRevisionId: 'rev-1',
    }))
    readJsonFile.mockImplementation(async (_token: string, fileId: string) => {
      if (fileId === 'track.json-id') {
        return {
          data: {
            kind: 'track',
            id: 'track-a',
            name: 'Mount Rosea',
            createdAt: '2026-01-01T00:00:00.000Z',
            uploadState: 'failed',
            date: null,
            distanceMeters: 14200,
            ascentMeters: 690,
            pointCount: 512,
            sourceName: 'rosea.kml',
            colorIndex: 0,
            position: { lat: -37, lng: 142 },
            driveFileId: 'drive-file-1',
          },
          headRevisionId: 'rev-1',
        }
      }
      return {
        data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }] },
        headRevisionId: 'rev-1',
      }
    })

    await store.connect('tok', 'cairn-folder')

    expect(store.getItems().map((item) => item.name)).toEqual(['Mount Rosea'])
    // It came from Drive, so that is where it is — whatever the stored
    // record claimed when it was written.
    expect(store.getItems()[0].uploadState).toBe('ok')
    expect(store.getOverview('track-a')).not.toBeNull()
  })

  it('leaves the cache alone when Drive cannot be reached', async () => {
    const connectedStore = await connected()
    connectedStore.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()
    listSubfolders.mockRejectedValue(new Error('offline'))

    await connectedStore.connect('tok', 'cairn-folder')

    expect(connectedStore.getItems()).toHaveLength(1)
  })
})

describe('migrating items that predate this issue', () => {
  it('uploads what it has, silently, and does not do it twice', async () => {
    const storage = fakeStorage()
    storage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        {
          kind: 'track',
          id: 'legacy-1',
          name: 'Old One',
          createdAt: '2025-01-01T00:00:00.000Z',
          date: null,
          distanceMeters: 100,
          ascentMeters: null,
          pointCount: 2,
          sourceName: 'old.kml',
          colorIndex: 0,
          position: { lat: 1, lng: 2 },
          driveFileId: null,
        },
      ]),
    )
    const migrating = new DriveLooseStore(storage)
    // A record with no `uploadState` has never been attempted, and says
    // nothing about itself while the migration runs.
    expect(migrating.getItem('legacy-1')?.uploadState).toBe('pending')

    await migrating.connect('tok', 'cairn-folder')
    await settle()

    expect(migrating.getItem('legacy-1')?.uploadState).toBe('ok')
    const first = writeJsonFile.mock.calls.length
    expect(first).toBeGreaterThan(0)

    // Drive now knows it, so a second connect hydrates rather than
    // re-uploading.
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'legacy-1' }])
    findJsonFile.mockResolvedValue({ fileId: 'record-id', headRevisionId: 'rev-1' })
    readJsonFile.mockResolvedValue({
      data: {
        kind: 'track',
        id: 'legacy-1',
        name: 'Old One',
        createdAt: '2025-01-01T00:00:00.000Z',
        uploadState: 'ok',
        date: null,
        distanceMeters: 100,
        ascentMeters: null,
        pointCount: 2,
        sourceName: 'old.kml',
        colorIndex: 0,
        position: { lat: 1, lng: 2 },
        driveFileId: null,
      },
      headRevisionId: 'rev-1',
    })
    writeJsonFile.mockClear()

    await migrating.connect('tok', 'cairn-folder')
    await settle()

    expect(migrating.getItems()).toHaveLength(1)
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('reads an interrupted upload back as not-on-Drive, never as still uploading', () => {
    const storage = fakeStorage()
    storage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        {
          kind: 'cairn',
          id: 'cairn-1',
          name: 'a.jpg',
          createdAt: '2026-01-01T00:00:00.000Z',
          uploadState: 'uploading',
          position: { lat: 1, lng: 2 },
          positionSource: 'exif',
          icon: null,
          image: null,
          description: '',
          date: null,
        },
      ]),
    )

    // The session that was doing the uploading is gone; nothing is in
    // flight, so the row must not claim otherwise forever.
    expect(new DriveLooseStore(storage).getItem('cairn-1')?.uploadState).toBe('failed')
  })
})

describe('deleting', () => {
  it('drops the row at once and trashes the item folder behind it', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()

    void store.remove(record.id)

    // The row goes on the click, not on the round trip.
    expect(store.getItems()).toHaveLength(0)
    await settle()
    expect(trashFolder).toHaveBeenCalledWith('tok', 'item-folder')
  })

  it('refuses while disconnected rather than deleting only the local copy', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()
    store.disconnect()

    await store.remove(record.id)

    // #73 — a delete that cannot reach Drive resurrects the item on the
    // next hydration.
    expect(store.getItems()).toHaveLength(1)
    expect(trashFolder).not.toHaveBeenCalled()
  })
})

describe('moving into a trip', () => {
  it("moves a track's source file into the trip folder and clears the loose one", async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()
    trashFolder.mockClear()

    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(true)

    expect(moveDriveFile).toHaveBeenCalledWith('tok', 'drive-file-1', 'item-folder', 'trip-folder')
    // Nothing left behind under `/Cairn/loose/tracks/`.
    expect(trashFolder).toHaveBeenCalledWith('tok', 'item-folder')
  })

  // A cairn is a folder, the same shape a loose track's is (`cairns.md`'s
  // "Storage") — its own per-item folder just moves parent, image and
  // `cairn.json` together, in one call.
  it("re-parents a cairn's whole folder from the loose bucket into the trip's cairns bucket", async () => {
    store = await connected()
    uploadFileContent
      .mockResolvedValueOnce({ id: 'original-1' })
      .mockResolvedValueOnce({ id: 'thumb-1' })
    const record = store.addCairn(NEW_CAIRN, new File(['jpeg'], 'sapporo.jpg'))
    await settle()
    trashFolder.mockClear()

    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(true)

    expect(moveDriveFile).toHaveBeenCalledWith('tok', 'item-folder', 'kind-folder', 'trip-cairns-folder')
    // No per-file move-then-trash: the folder itself relocated.
    expect(trashFolder).not.toHaveBeenCalled()
    expect(writeJsonFile.mock.calls.map((call) => call[2])).toContain('cairn.json')
  })

  it('leaves the item where it was when the move fails', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()
    moveDriveFile.mockRejectedValue(new Error('offline'))
    trashFolder.mockClear()

    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(false)
    expect(store.getItems()).toHaveLength(1)
    expect(trashFolder).not.toHaveBeenCalled()
  })

  it('leaves a cairn where it was when its folder move fails', async () => {
    store = await connected()
    const record = store.addCairn(NEW_CAIRN, new File(['jpeg'], 'sapporo.jpg'))
    await settle()
    moveDriveFile.mockRejectedValue(new Error('offline'))

    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(false)
    expect(store.getItems()).toHaveLength(1)
  })

  /* Once the first file has left the loose folder the item belongs to the
     trip, and saying otherwise would keep the loose row alive beside files
     the trip now holds — one item owned twice. Cleanup and the index write
     come after that line and must not undo it. */
  it('still reports the move when only the tidy-up afterwards fails', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY, new File(['<kml/>'], 'rosea.kml'))
    await settle()
    trashFolder.mockRejectedValue(new Error('offline'))

    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(true)
    expect(moveDriveFile).toHaveBeenCalled()
  })

  it("still reports the move when a cairn's record write afterwards fails", async () => {
    store = await connected()
    const record = store.addCairn(NEW_CAIRN, new File(['jpeg'], 'sapporo.jpg'))
    await settle()
    writeJsonFile.mockRejectedValue(new Error('offline'))

    // The folder itself has already relocated by the time the record write
    // runs — reporting failure here would describe a move that plainly did
    // happen as not having happened.
    expect(await store.moveIntoTrip(record.id, 'trip-1')).toBe(true)
  })
})

describe('claiming back out of a trip', () => {
  it("moves the trip's file into the loose folder rather than copying it", async () => {
    store = await connected()
    // The record is created around the file that already exists in the
    // trip's folder, exactly as `Remove from trip` does.
    const record = store.addTrack({ ...NEW_TRACK, driveFileId: 'trip-file-1' }, GEOMETRY)

    expect(await store.claimFromTrip(record.id, 'trip-1')).toBe(true)

    expect(moveDriveFile).toHaveBeenCalledWith('tok', 'trip-file-1', 'trip-folder', 'item-folder')
    expect(store.getItem(record.id)?.uploadState).toBe('ok')
    expect(writeJsonFile.mock.calls.map((call) => call[2])).toContain('track.json')
  })

  it('reports failure so the caller can leave the track in the trip', async () => {
    store = await connected()
    const record = store.addTrack({ ...NEW_TRACK, driveFileId: 'trip-file-1' }, GEOMETRY)
    moveDriveFile.mockRejectedValue(new Error('offline'))

    expect(await store.claimFromTrip(record.id, 'trip-1')).toBe(false)
  })

  // #132: a cairn's claim finds the trip-side folder by id alone — see
  // `NewLooseCairn.id` — and moves that whole folder back, rather than the
  // old two-file-plus-index dance a photo needed.
  it("moves the cairn's whole folder from the trip's cairns bucket back into the loose bucket", async () => {
    store = await connected()
    const record = store.addCairn({
      ...NEW_CAIRN,
      id: 'trip-cairn-1',
      image: { originalDriveFileId: 'trip-orig-1', thumbnailDriveFileId: 'trip-thumb-1' },
    })

    expect(await store.claimFromTrip(record.id, 'trip-1')).toBe(true)

    expect(findOrCreateTripCairnItemFolder).toHaveBeenCalledWith('tok', 'cairn-folder', 'trip-1', 'trip-cairn-1')
    expect(moveDriveFile).toHaveBeenCalledWith('tok', 'trip-item-folder', 'trip-cairns-folder', 'kind-folder')
    expect(store.getItem(record.id)?.uploadState).toBe('ok')
    expect(writeJsonFile.mock.calls.map((call) => call[2])).toContain('cairn.json')
  })

  it("leaves the cairn in the trip when its folder move fails", async () => {
    store = await connected()
    const record = store.addCairn({ ...NEW_CAIRN, id: 'trip-cairn-1' })
    moveDriveFile.mockRejectedValue(new Error('offline'))

    expect(await store.claimFromTrip(record.id, 'trip-1')).toBe(false)
  })
})

describe('update (#133)', () => {
  it('renames a track, flushing its record file', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY)

    expect(await store.update(record.id, { name: 'Mount Rosea East' })).toBe(true)

    expect(store.getItem(record.id)?.name).toBe('Mount Rosea East')
    await settle()
    expect(writeJsonFile.mock.calls.some((call) => call[2] === 'track.json')).toBe(true)
  })

  it('recolours a track', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY)

    expect(await store.update(record.id, { colorIndex: 4 })).toBe(true)

    expect((store.getItem(record.id) as { colorIndex: number }).colorIndex).toBe(4)
  })

  it('resolves false when the id names nothing', async () => {
    store = await connected()
    expect(await store.update('no-such-id', { name: 'x' })).toBe(false)
  })

  it('refuses while disconnected, leaving the local value untouched', async () => {
    store = new DriveLooseStore(fakeStorage())
    const record = store.addTrack(NEW_TRACK, GEOMETRY)

    expect(await store.update(record.id, { name: 'Renamed' })).toBe(false)
    expect(store.getItem(record.id)?.name).toBe(NEW_TRACK.name)
  })

  it('writes nothing when the value already matches', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY)
    writeJsonFile.mockClear()

    expect(await store.update(record.id, { name: NEW_TRACK.name })).toBe(true)
    await settle()

    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('cancels an empty rename rather than saving it', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY)

    expect(await store.update(record.id, { name: '   ' })).toBe(true)

    expect(store.getItem(record.id)?.name).toBe(NEW_TRACK.name)
  })

  it('reverts to the previous value after a non-conflict write failure', async () => {
    store = await connected()
    const record = store.addTrack(NEW_TRACK, GEOMETRY)
    writeJsonFile.mockRejectedValue(new Error('offline'))

    expect(await store.update(record.id, { name: 'Renamed' })).toBe(false)

    expect(store.getItem(record.id)?.name).toBe(NEW_TRACK.name)
  })

  it('on a conflict, re-hydrates from Drive rather than reverting to the pre-edit value', async () => {
    // Hydrated from Drive on connect, so there is a cached record ref to
    // re-read against — the same setup driveTripStore.test.ts's identical
    // test uses, for the same reason.
    listSubfolders.mockImplementation(async (_token: string, folderId: string) =>
      folderId === 'kind-folder' ? [{ id: 'item-folder', name: 'track-a' }] : [],
    )
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'track.json' ? { fileId: 'record-file', headRevisionId: 'rev-1' } : null,
    )
    readJsonFile.mockResolvedValueOnce({
      data: {
        kind: 'track',
        id: 'track-a',
        name: NEW_TRACK.name,
        createdAt: '2026-01-01T00:00:00.000Z',
        uploadState: 'ok',
        date: NEW_TRACK.date,
        distanceMeters: NEW_TRACK.distanceMeters,
        ascentMeters: NEW_TRACK.ascentMeters,
        pointCount: NEW_TRACK.pointCount,
        sourceName: NEW_TRACK.sourceName,
        colorIndex: NEW_TRACK.colorIndex,
        position: NEW_TRACK.position,
        driveFileId: null,
      },
      headRevisionId: 'rev-1',
    })

    store = new DriveLooseStore(fakeStorage())
    await store.connect('tok', 'cairn-folder')
    expect(store.getItem('track-a')?.name).toBe(NEW_TRACK.name)

    writeJsonFile.mockRejectedValueOnce(new DriveConflictError())
    readJsonFile.mockResolvedValueOnce({
      data: { ...store.getItem('track-a'), name: 'Renamed elsewhere' },
      headRevisionId: 'rev-2',
    })

    const result = await store.update('track-a', { name: 'My edit' })

    expect(result).toBe(false)
    expect(store.getItem('track-a')?.name).toBe('Renamed elsewhere')
  })
})
