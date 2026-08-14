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
  DriveAuthError,
} = vi.hoisted(() => {
  class DriveConflictError extends Error {}
  class DriveAuthError extends Error {}
  return {
    findJsonFile: vi.fn(),
    readJsonFile: vi.fn(),
    writeJsonFile: vi.fn(),
    listSubfolders: vi.fn(),
    trashFolder: vi.fn(),
    DriveConflictError,
    DriveAuthError,
  }
})
vi.mock('../drive/tripMetadata', () => ({
  findJsonFile,
  readJsonFile,
  writeJsonFile,
  listSubfolders,
  trashFolder,
  DriveConflictError,
  DriveAuthError,
}))

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('folder-1')
  findJsonFile.mockReset().mockResolvedValue(null)
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
  it('creates a trip locally without a Drive session', () => {
    const store = new DriveTripStore(fakeStorage())

    const entry = store.createTrip('Hokkaido')

    expect(store.getTrips()).toHaveLength(1)
    expect(store.getTrip(entry.id)?.name).toBe('Hokkaido')
  })

  // #73: disconnected is read-only — a never-signed-in store refuses an
  // edit or a delete rather than applying it locally and leaving it
  // stranded with nothing to sync it once a connection exists. Covers "a
  // user who has never signed in sees the same read-only treatment as one
  // who has signed out" (never-connected and disconnected are the same
  // `credentials === null` state to this store).
  it('#73: refuses to edit or delete a trip without a Drive session', async () => {
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')

    const updated = await store.updateTrip(entry.id, { notes: 'Great trip' })
    expect(updated).toBeNull()
    expect(store.getTrip(entry.id)?.notes).toBe('')

    store.deleteTrip(entry.id)
    expect(store.getTrips()).toHaveLength(1)
  })

  it('#73: disconnect() clears credentials so a subsequent edit is refused and makes no Drive request', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()
    writeJsonFile.mockClear()

    store.disconnect()
    const updated = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(updated).toBeNull()
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('#73: disconnect() also refuses a delete, so a trip cannot be removed only locally', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()

    store.disconnect()
    store.deleteTrip(entry.id)

    expect(store.getTrips()).toHaveLength(1)
    expect(trashFolder).not.toHaveBeenCalled()
  })

  it('#73: a trip deleted while connected does not reappear after disconnect and reconnect', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()

    store.deleteTrip(entry.id)
    await flush()
    store.disconnect()

    listSubfolders.mockResolvedValue([]) // the folder was trashed — nothing to hydrate
    await store.connect('token', 'cairn-folder-id')

    expect(store.getTrips()).toHaveLength(0)
  })

  it('flushes a create to Drive once connected', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
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
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-2' })
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

  it('#125: retries once after a transient (non-conflict) flush failure, and succeeds', async () => {
    // Hydrated from Drive on connect, same setup as the conflict test below
    // — avoids `createTrip`'s fire-and-forget migration write landing at an
    // unpredictable point and throwing off the call-count assertions here.
    listSubfolders.mockResolvedValue([{ id: 'folder-1', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', headRevisionId: 'rev-1' } : null,
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
      headRevisionId: 'rev-1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    writeJsonFile.mockClear()
    writeJsonFile
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ fileId: 'trip-file', headRevisionId: 'rev-2' })

    const result = await store.updateTrip('trip-a', { notes: 'Great trip' })

    expect(result?.notes).toBe('Great trip')
    expect(store.getTrip('trip-a')?.notes).toBe('Great trip')
    expect(writeJsonFile).toHaveBeenCalledTimes(2)
  })

  it('#125: gives up and reverts if the retry after a transient flush failure also fails', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-1', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', headRevisionId: 'rev-1' } : null,
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
      headRevisionId: 'rev-1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    writeJsonFile.mockClear()
    writeJsonFile.mockRejectedValue(new Error('network error'))

    const result = await store.updateTrip('trip-a', { notes: 'Great trip' })

    expect(result).toBeNull()
    expect(store.getTrip('trip-a')?.notes).toBe('')
    expect(writeJsonFile).toHaveBeenCalledTimes(2)
  })

  it('#143: retries the flush lookup (findOrCreateTripFolder/findJsonFile) once and succeeds', async () => {
    // migrateTrip's own folder lookup is left to fail and is swallowed
    // silently (its documented behavior) — so no ref is ever cached for
    // this trip, and every subsequent flush must redo the lookup itself.
    // That's the exact gap #125 left open: its retry only ever covered the
    // write, not the lookup that precedes it.
    findOrCreateTripFolder.mockRejectedValueOnce(new Error('migration lookup failed'))
    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    const entry = store.createTrip('Hokkaido')
    await flush() // let the doomed migration attempt settle

    findOrCreateTripFolder.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce('folder-1')
    findJsonFile.mockResolvedValue(null)
    writeJsonFile.mockResolvedValueOnce({ fileId: 'trip-file', headRevisionId: 'rev-1' })

    const result = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(result?.notes).toBe('Great trip')
    expect(store.getTrip(entry.id)?.notes).toBe('Great trip')
    // 1 for the failed migration + 2 for the flush's own failed-then-retried lookup.
    expect(findOrCreateTripFolder).toHaveBeenCalledTimes(3)
    expect(writeJsonFile).toHaveBeenCalledTimes(1)
  })

  it('#143: gives up and reverts if the retry after a transient flush lookup failure also fails', async () => {
    findOrCreateTripFolder.mockRejectedValueOnce(new Error('migration lookup failed'))
    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    const entry = store.createTrip('Hokkaido')
    await flush()

    findOrCreateTripFolder.mockRejectedValue(new Error('network error'))

    const result = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(result).toBeNull()
    expect(store.getTrip(entry.id)?.notes).toBe('')
    expect(findOrCreateTripFolder).toHaveBeenCalledTimes(3)
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('#143: does not retry a flush lookup that fails with DriveAuthError', async () => {
    findOrCreateTripFolder.mockRejectedValueOnce(new Error('migration lookup failed'))
    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    const entry = store.createTrip('Hokkaido')
    await flush()

    findOrCreateTripFolder.mockRejectedValueOnce(new DriveAuthError())

    const result = await store.updateTrip(entry.id, { notes: 'Great trip' })

    expect(result).toBeNull()
    expect(store.getTrip(entry.id)?.notes).toBe('')
    // 1 for the failed migration + exactly 1 for the flush's own attempt — no retry.
    expect(findOrCreateTripFolder).toHaveBeenCalledTimes(2)
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('on a conflict, re-hydrates from Drive rather than reverting to the pre-edit value', async () => {
    // Hydrated from Drive on connect (rather than created-then-migrated)
    // so this test only ever has one Drive ref in play, not a migration
    // attempt racing an edit — that race is its own test below.
    listSubfolders.mockResolvedValue([{ id: 'folder-1', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', headRevisionId: 'rev-1' } : null,
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
      headRevisionId: 'rev-1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')
    expect(store.getTrip('trip-a')?.name).toBe('Hokkaido')

    // The write conflicts; the re-read returns what's actually on Drive now.
    writeJsonFile.mockRejectedValueOnce(new DriveConflictError())
    readJsonFile.mockResolvedValueOnce({
      data: { ...store.getTrip('trip-a'), notes: 'Written from another tab' },
      headRevisionId: 'rev-2',
    })

    const result = await store.updateTrip('trip-a', { notes: 'Second edit' })

    expect(result).toBeNull()
    expect(store.getTrip('trip-a')?.notes).toBe('Written from another tab')
  })

  it('#102: a rename to a trip already synced from Drive survives a reload', async () => {
    // A tiny in-memory "Drive" for just this test — the shared mocks are
    // otherwise stateless, and this criterion is specifically about a
    // second `connect()` (a reload) seeing what the first one actually
    // wrote, not a canned response.
    let drive = {
      headRevisionId: 'rev-1',
      data: {
        id: 'trip-a',
        name: 'Hokkaido',
        status: 'planned' as const,
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    }
    let revisionCounter = 1
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', headRevisionId: drive.headRevisionId } : null,
    )
    readJsonFile.mockImplementation(async () => ({
      data: drive.data,
      headRevisionId: drive.headRevisionId,
    }))
    writeJsonFile.mockImplementation(
      async (_token: string, _folderId: string, _name: string, data: typeof drive.data) => {
        revisionCounter += 1
        drive = { headRevisionId: `rev-${revisionCounter}`, data }
        return { fileId: 'trip-file', headRevisionId: drive.headRevisionId }
      },
    )

    const storage = fakeStorage()
    const session1 = new DriveTripStore(storage)
    await session1.connect('token', 'cairn-folder-id')
    expect(session1.getTrip('trip-a')?.name).toBe('Hokkaido')

    const updated = await session1.updateTrip('trip-a', { name: 'Renamed Trip' })
    expect(updated?.name).toBe('Renamed Trip')

    // Reload: a fresh store (empty in-memory refs), same persisted storage,
    // same underlying Drive state.
    const session2 = new DriveTripStore(storage)
    await session2.connect('token', 'cairn-folder-id')

    expect(session2.getTrip('trip-a')?.name).toBe('Renamed Trip')
  })

  it('connect() hydrates trips and overviews from Drive folders it finds', async () => {
    listSubfolders.mockResolvedValue([{ id: 'folder-a', name: 'trip-a' }])
    findJsonFile.mockImplementation(async (_token: string, _folderId: string, name: string) =>
      name === 'trip.json' ? { fileId: 'trip-file', headRevisionId: 'rev-1' } : null,
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
      headRevisionId: 'rev-1',
    })

    const store = new DriveTripStore(fakeStorage())
    await store.connect('token', 'cairn-folder-id')

    expect(store.getTrip('trip-a')?.name).toBe('Hokkaido')
    expect(store.getTrips()).toHaveLength(1)
  })

  it('migrates a local-only trip (no Drive folder found for it) up to Drive on connect', async () => {
    listSubfolders.mockResolvedValue([]) // nothing on Drive yet
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })

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
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
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

  it('#102: renaming a trip still ahead of connect() in the hydration queue overwrites its existing trip.json rather than duplicating it', async () => {
    // Two trips already synced from a prior session (seeded into the shared
    // storage, then read back by a fresh store — a reload). `connect()`
    // hydrates trip folders one at a time, awaiting each in turn, so while
    // trip-a's hydration is still in flight, trip-b's hasn't been queued yet
    // at all — the exact window a rename can land in with no cached ref.
    const storage = fakeStorage()
    const seedStore = new DriveTripStore(storage)
    const tripA = seedStore.createTrip('Trip A')
    const tripB = seedStore.createTrip('Trip B')

    listSubfolders.mockResolvedValue([
      { id: 'folder-a', name: tripA.id },
      { id: 'folder-b', name: tripB.id },
    ])
    findOrCreateTripFolder.mockImplementation(async (_token: string, _cairnFolderId: string, tripId: string) =>
      tripId === tripA.id ? 'folder-a' : 'folder-b',
    )
    let releaseA: () => void = () => {}
    const aGate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    findJsonFile.mockImplementation(async (_token: string, folderId: string, name: string) => {
      if (name !== 'trip.json') return null
      if (folderId === 'folder-a') await aGate // trip-a's hydration stays pending until released
      return { fileId: `${folderId}-trip-file`, headRevisionId: 'rev-1' }
    })
    readJsonFile.mockResolvedValue({
      data: {
        id: tripA.id,
        name: 'Trip A',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      headRevisionId: 'rev-1',
    })
    writeJsonFile.mockResolvedValue({ fileId: 'folder-b-trip-file', headRevisionId: 'rev-2' })

    const store = new DriveTripStore(storage)
    const connectPromise = store.connect('token', 'cairn-folder-id')
    await flush() // connect() is now stuck awaiting trip-a's gated hydration

    const updated = await store.updateTrip(tripB.id, { name: 'Renamed' })

    releaseA()
    await connectPromise

    expect(updated?.name).toBe('Renamed')
    const tripBWrites = writeJsonFile.mock.calls.filter((call) => call[1] === 'folder-b' && call[2] === 'trip.json')
    expect(tripBWrites).toHaveLength(1) // not a duplicate create alongside a later hydrate/overwrite
    expect(tripBWrites[0][4]).not.toBeNull() // overwrite of the file findJsonFile found, not a create
  })

  it('trashes the Drive folder on delete once a ref is known', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()

    store.deleteTrip(entry.id)
    await flush()

    expect(trashFolder).toHaveBeenCalledWith('token', 'folder-1')
  })

  it('flushes a recomputed overview to Drive once connected', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()
    writeJsonFile.mockClear()
    writeJsonFile.mockResolvedValue({ fileId: 'overview-file', headRevisionId: 'rev-1' })

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

  it('also flushes trip.json on saveOverview, carrying the recomputed origin (#79)', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()
    writeJsonFile.mockClear()
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-2' })

    store.saveOverview(entry.id, [
      { name: 'Day 1', points: [{ lat: 37, lon: -122 }, { lat: 38, lon: -121 }] },
    ])
    await flush()

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ origin: { lat: 37, lng: -122 } }),
      expect.anything(),
    )
  })

  /* #121 — the count rides on `trip.json` exactly as `origin` does, and for
     the same reason: it is derived, so it flushes through `flushTrip`
     rather than `updateTrip`, which #73 refuses while disconnected and #35
     scopes to fields a user edits. */
  it('flushes a cached photo count to trip.json', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await flush()
    writeJsonFile.mockClear()

    store.savePhotoCount(entry.id, 128)
    await flush()

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ photoCount: 128 }),
      expect.anything(),
    )
  })

  it('writes nothing when the count is unchanged', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', headRevisionId: 'rev-1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    store.savePhotoCount(entry.id, 4)
    await flush()
    writeJsonFile.mockClear()

    // The caller is an effect handing over the same number on every render.
    store.savePhotoCount(entry.id, 4)
    await flush()

    expect(writeJsonFile).not.toHaveBeenCalled()
  })
})
