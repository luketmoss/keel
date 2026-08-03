import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DriveTrackOverridesStore } from './driveTrackOverridesStore'

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
  it('writes locally and resolves true when never connected this session', async () => {
    const store = new DriveTrackOverridesStore(fakeStorage())

    const ok = await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(ok).toBe(true)
    expect(store.getOverrides('trip-1')).toEqual({ 'drive-1': { displayName: 'Day 3' } })
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

    const store = new DriveTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])
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
