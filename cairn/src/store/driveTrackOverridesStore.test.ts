import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DriveTrackOverridesStore } from './driveTrackOverridesStore'
import { LocalTrackOverridesStore } from './trackOverridesStore'

/** Same in-memory `Storage` helper `trackOverridesStore.test.ts` uses. */
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

const { findJsonFile, readJsonFile, writeJsonFile, DriveConflictError } = vi.hoisted(() => {
  class DriveConflictError extends Error {}
  return {
    findJsonFile: vi.fn(),
    readJsonFile: vi.fn(),
    writeJsonFile: vi.fn(),
    DriveConflictError,
  }
})
vi.mock('../drive/tripMetadata', () => ({
  findJsonFile,
  readJsonFile,
  writeJsonFile,
  DriveConflictError,
}))

beforeEach(() => {
  findOrCreateTripFolder.mockReset().mockResolvedValue('trip-folder-1')
  findJsonFile.mockReset()
  readJsonFile.mockReset()
  writeJsonFile.mockReset()
})

describe('DriveTrackOverridesStore', () => {
  // #73: disconnected is read-only, same rule as `DriveTripStore.updateTrip`
  // — a never-connected store refuses the write up front rather than
  // applying it locally and reporting success with nothing to sync it once
  // a connection exists.
  it('#73: refuses a write when never connected this session', async () => {
    const store = new DriveTrackOverridesStore(fakeStorage())

    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(false)
    expect(store.getOverrides('trip-1')).toEqual({})
  })

  it('#73: disconnect() clears the token so a subsequent write is refused and makes no Drive request', async () => {
    findJsonFile.mockResolvedValue(null)
    writeJsonFile.mockResolvedValue({ fileId: 'overrides-file', version: '1' })
    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')
    writeJsonFile.mockClear()

    store.disconnect()
    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(false)
    expect(writeJsonFile).not.toHaveBeenCalled()
  })

  it('connect() hydrates from an existing overrides.json, Drive winning over local', async () => {
    findJsonFile.mockResolvedValue({ fileId: 'overrides-file', version: '1' })
    readJsonFile.mockResolvedValue({
      data: { 'drive-1': { displayName: 'From Drive' } },
      version: '1',
    })

    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    expect(store.getOverrides('trip-1')).toEqual({ 'drive-1': { displayName: 'From Drive' } })
  })

  it('migrates local-only overrides up to Drive when no overrides.json exists yet', async () => {
    findJsonFile.mockResolvedValue(null)
    writeJsonFile.mockResolvedValue({ fileId: 'overrides-file', version: '1' })

    // #73: setOverride refuses to write while disconnected, so a
    // local-only pre-seed (representing overrides an earlier, connected
    // session already wrote to localStorage) goes through the plain local
    // store sharing the same backing storage — not through this session's
    // still-disconnected `DriveTrackOverridesStore`.
    const storage = fakeStorage()
    await new LocalTrackOverridesStore(storage).setOverride(
      'trip-1',
      'drive-1',
      { displayName: 'Day 3' },
      ['drive-1'],
    )

    const store = new DriveTrackOverridesStore(storage)
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'trip-folder-1',
      'overrides.json',
      { 'drive-1': { displayName: 'Day 3' } },
      null,
    )
  })

  it('flushes a write to Drive once connected, and reverts locally on failure', async () => {
    findJsonFile.mockResolvedValue(null)
    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    writeJsonFile.mockRejectedValue(new Error('network error'))
    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(false)
    expect(store.getOverrides('trip-1')).toEqual({})
  })

  it('#124: retries once after a transient (non-conflict) write failure, and succeeds', async () => {
    findJsonFile.mockResolvedValue(null)
    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    writeJsonFile
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ fileId: 'overrides-file', version: '2' })

    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(true)
    expect(store.getOverrides('trip-1')).toEqual({ 'drive-1': { displayName: 'Day 3' } })
    expect(writeJsonFile).toHaveBeenCalledTimes(2)
  })

  it('#124: gives up and reverts if the retry after a transient failure also fails', async () => {
    findJsonFile.mockResolvedValue(null)
    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    writeJsonFile.mockRejectedValue(new Error('network error'))
    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(false)
    expect(store.getOverrides('trip-1')).toEqual({})
    expect(writeJsonFile).toHaveBeenCalledTimes(2)
  })

  it('serializes connect (migration) and an immediately-following edit so the edit overwrites rather than duplicating the create', async () => {
    // Reproduces the race a trip's overrides are most exposed to: an edit
    // fired the instant a detail view mounts, before `connect`'s own
    // migration write has resolved. Unserialized, both would see no ref yet
    // and both call `writeJsonFile` with `existing: null`, creating two
    // `overrides.json` files instead of one.
    findJsonFile.mockResolvedValue(null) // no overrides.json yet -> migration path
    writeJsonFile.mockResolvedValue({ fileId: 'overrides-file', version: '1' })
    // #73: same reasoning as the migration test above — pre-seed through
    // the plain local store sharing the same storage, since `setOverride`
    // on a disconnected `DriveTrackOverridesStore` now refuses to write.
    const storage = fakeStorage()
    await new LocalTrackOverridesStore(storage).setOverride(
      'trip-1',
      'drive-1',
      { displayName: 'Day 3' },
      ['drive-1'],
    )
    const store = new DriveTrackOverridesStore(storage)

    const connectPromise = store.connect('trip-1', 'token', 'cairn-folder-id') // queues the migration write
    // No await here — the edit queues right behind it while it's still in
    // flight.
    const editOk = await store.setOverride('trip-1', 'drive-1', { color: 2 }, ['drive-1'])
    await connectPromise

    expect(editOk).toBe(true)
    const writes = writeJsonFile.mock.calls.filter((call) => call[2] === 'overrides.json')
    expect(writes).toHaveLength(2)
    expect(writes[0][4]).toBeNull() // migration's create
    expect(writes[1][4]).not.toBeNull() // the edit's overwrite, not a second create
  })

  it('on a conflict, re-hydrates from Drive rather than reverting to the pre-edit value', async () => {
    findJsonFile.mockResolvedValue(null)
    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.connect('trip-1', 'token', 'cairn-folder-id')

    writeJsonFile.mockResolvedValueOnce({ fileId: 'overrides-file', version: '1' })
    await store.setOverride('trip-1', 'drive-1', { displayName: 'First edit' }, ['drive-1'])

    writeJsonFile.mockRejectedValueOnce(new DriveConflictError())
    readJsonFile.mockResolvedValueOnce({
      data: { 'drive-1': { displayName: 'Written from another tab' } },
      version: '2',
    })

    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Second edit' }, [
      'drive-1',
    ])

    expect(ok).toBe(false)
    expect(store.getOverrides('trip-1')).toEqual({
      'drive-1': { displayName: 'Written from another tab' },
    })
  })
})
