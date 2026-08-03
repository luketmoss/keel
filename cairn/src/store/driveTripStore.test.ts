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
    // migrateTrip is fire-and-forget — flush the microtask queue.
    await Promise.resolve()
    await Promise.resolve()

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
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')

    // First write establishes a Drive ref for this trip.
    writeJsonFile.mockResolvedValueOnce({ fileId: 'trip-file', version: '1' })
    await store.updateTrip(entry.id, { notes: 'First edit' })

    // Second write conflicts; the re-read returns what's actually on Drive now.
    writeJsonFile.mockRejectedValueOnce(new DriveConflictError())
    readJsonFile.mockResolvedValueOnce({
      data: { ...store.getTrip(entry.id), notes: 'Written from another tab' },
      version: '2',
    })

    const result = await store.updateTrip(entry.id, { notes: 'Second edit' })

    expect(result).toBeNull()
    expect(store.getTrip(entry.id)?.notes).toBe('Written from another tab')
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
    await Promise.resolve()
    await Promise.resolve()

    expect(writeJsonFile).toHaveBeenCalledWith(
      'token',
      'folder-1',
      'trip.json',
      expect.objectContaining({ id: entry.id, name: 'Hokkaido' }),
      null,
    )
  })

  it('trashes the Drive folder on delete once a ref is known', async () => {
    writeJsonFile.mockResolvedValue({ fileId: 'trip-file', version: '1' })
    const store = new DriveTripStore(fakeStorage())
    const entry = store.createTrip('Hokkaido')
    await store.connect('token', 'cairn-folder-id')
    await Promise.resolve()
    await Promise.resolve()

    store.deleteTrip(entry.id)
    await Promise.resolve()

    expect(trashFolder).toHaveBeenCalledWith('token', 'folder-1')
  })
})
