import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DriveTripStore } from './driveTripStore'

/** Same in-memory `Storage` helper `tripStore.test.ts` uses. */
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

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('../drive/tripFolder', () => ({ findOrCreateTripFolder }))

const {
  findJsonFile,
  readJsonFile,
  writeJsonFile,
  listSubfolders,
  trashFolder,
  DriveConflictError,
} = vi.hoisted(() => {
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

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('folder-1')
  findJsonFile.mockReset()
  readJsonFile.mockReset()
  writeJsonFile.mockReset()
  listSubfolders.mockReset().mockResolvedValue([])
  trashFolder.mockReset().mockResolvedValue(undefined)
})

/** Flushes every pending microtask, including ones chained several `.then`
    hops deep by `DriveTripStore`'s per-id write queue — a fixed number of
    `await Promise.resolve()` calls is brittle against that queue depth, but
    a macrotask boundary (`setTimeout`) always runs after every microtask
    scheduled before it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('DriveTripStore', () => {
  it('reads and writes locally without a Drive session — create/update/delete all work offline', async () => {
    const store = new DriveTripStore(fakeStorage())

    const entry = store.createTrip('Hokkaido')
    expect(store.getTrips()).toHaveLength(1)

    const updated = await store.updateTrip(entry.id, { notes: 'Great trip' })
    expect(updated?.notes).toBe('Great trip')

    store.deleteTrip(entry.id)
    expect(store.getTrips()).toHaveLength(0)
  })

  it('flushes a create to Drive once connected', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })
    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')

    store.createTrip('Hokkaido')
    await flush() // migrateTrip is fire-and-forget

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ name: 'Hokkaido' }),
      null,
    )
  })

  it('awaits the Drive flush on updateTrip and resolves the updated record on success', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '2' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    writeJsonFile.mockClear()

    const updated = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(updated?.notes).toBe('Great trip')
    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ notes: 'Great trip' }),
      expect.anything(),
    )
  })

  it('reverts the local record and resolves null when the Drive flush fails', async () => {
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    writeJsonFile.mockRejectedValue(new Error('network error'))

    const result = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(result).toBeNull()
    expect(store.getTrip(entry.id)?.notes).toBe('')
  })

  it('on a conflict, re-hydrates from Drive rather than reverting to the pre-edit value', async () => {
    // Hydrated from Drive on connect (rather than created-then-migrated)
    // so this test only ever has one Drive ref in play, not a migration
    // attempt racing an edit — that race is its own test below.
    listSubfolders.mockResolvedValue([{ id: 'folder-1', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', version: '1' } : null,
    )
    readJsonFile.mockResolvedValueOnce({
      data: {
        id: 'trip-a',
        name: 'Hokkaido',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      version: '1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    expect(store.getTrip('trip-a')?.name).toBe('Hokkaido')

    // The write conflicts; the re-read returns what's actually on Drive now.
    writeJsonFile.mockRejectedValueOnce(new DriveConflictError())
    readJsonFile.mockResolvedValueOnce({
      data: { ...store.getTrip('trip-a'), notes: 'Written from another tab' },
      version: '2',
    })

    const result = await store.updateTrip('trip-a', { notes: 'Second edit' })

    expect(result).toBeNull()
    expect(store.getTrip('trip-a')?.notes).toBe('Written from another tab')
  })

  it('connect() hydrates trips and overviews from Drive folders it finds', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', version: '1' } : null,
    )
    readJsonFile.mockResolvedValue({
      data: {
        id: 'trip-a',
        name: 'Hokkaido',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      version: '1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')

    expect(store.getTrip('trip-a')?.name).toBe('Hokkaido')
    expect(store.getTrips()).toHaveLength(1)
  })

  it('migrates a local-only trip (no Drive folder found for it) up to Drive on connect', async () => {
    listSubfolders.mockResolvedValue([]) // nothing on Drive yet
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })

    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido') // local-only, created before any connection

    await store.connect('token', 'cairn-folder-id')
    await flush()

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ id: entry.id, name: 'Hokkaido' }),
      null,
    )
  })

  it('serializes a migration and an immediately-following edit so the edit overwrites rather than duplicating the create', async () => {
    // Reproduces the race a freshly created trip is most exposed to: an
    // edit fired before migrateTrip's own Drive round trip has resolved.
    // Unserialized, both would see no ref yet and both call `writeJsonFile`
    // with `existing: null`, creating two `trip.json` files instead of one.
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })
    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')

    const entry = store.createTrip('Hokkaido') // queues migrateTrip
    // No await here — the edit queues right behind migrateTrip while it's
    // still in flight, same as a user renaming a trip the instant after
    // creating it.
    const updated = await store.updateTrip(entry.id, { notes: 'Renamed before migration settled' })

    expect(updated?.notes).toBe('Renamed before migration settled')
    const tripWrites = writeJsonFile.mock.calls.filter((call) => call[2] === 'trip.json')
    expect(tripWrites).toHaveLength(2)
    expect(tripWrites[0][4]).toBeNull() // migrateTrip's create
    expect(tripWrites[1][4]).not.toBeNull() // the edit's overwrite, using migrateTrip's ref — not a second create
  })

  it('trashes the Drive folder on delete once a ref is known', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()

    store.deleteTrip(entry.id)
    await flush()

    expect(trashFolder).toHaveBeenCalledWith('token', 'folder-1')
  })

  it('flushes a recomputed overview to Drive once connected', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()
    writeJsonFile.mockClear()
    writeJsonFile.mockResolvedValue({ fileId: 'overview-file', version: '1' })

    store.saveOverview(entry.id, [
      { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
    ])
    await flush()

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'overview.geojson',
      expect.objectContaining({ type: 'FeatureCollection' }),
      null,
    )
  })
})
