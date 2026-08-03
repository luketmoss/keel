import { describe, expect, it } from 'vitest'
import { LocalTrackOverridesStore } from './trackOverridesStore'

/** A minimal in-memory `Storage` so tests don't depend on jsdom's
    `localStorage` persisting (or not) across test files — same helper
    `tripStore.test.ts` uses. */
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

describe('LocalTrackOverridesStore', () => {
  it('starts empty for a trip with no overrides', () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    expect(store.getOverrides('trip-1')).toEqual({})
  })

  it('sets and reads back a display name override', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    expect(store.getOverrides('trip-1')).toEqual({ 'drive-1': { displayName: 'Day 3' } })
  })

  it('merges a new field onto an existing override without clobbering the others', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])
    await store.setOverride('trip-1', 'drive-1', { color: 2 }, ['drive-1'])

    expect(store.getOverrides('trip-1')).toEqual({
      'drive-1': { displayName: 'Day 3', color: 2 },
    })
  })

  it('keeps overrides for different trips separate', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])
    await store.setOverride('trip-2', 'drive-1', { displayName: 'Other trip' }, ['drive-1'])

    expect(store.getOverrides('trip-1')).toEqual({ 'drive-1': { displayName: 'Day 3' } })
    expect(store.getOverrides('trip-2')).toEqual({ 'drive-1': { displayName: 'Other trip' } })
  })

  it('renumbers order for the whole list on a reorder', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOrder('trip-1', ['drive-2', 'drive-1', 'drive-3'], ['drive-1', 'drive-2', 'drive-3'])

    expect(store.getOverrides('trip-1')).toEqual({
      'drive-2': { order: 0 },
      'drive-1': { order: 1 },
      'drive-3': { order: 2 },
    })
  })

  it('prunes an override for a file no longer in the valid set before writing', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Gone soon' }, ['drive-1', 'drive-2'])

    await store.setOverride('trip-1', 'drive-2', { color: 1 }, ['drive-2'])

    expect(store.getOverrides('trip-1')).toEqual({ 'drive-2': { color: 1 } })
  })

  it('treats corrupted storage as no overrides rather than throwing', () => {
    const storage = fakeStorage()
    storage.setItem('cairn.trips.trackOverrides.trip-1', 'not json')
    const store = new LocalTrackOverridesStore(storage)

    expect(store.getOverrides('trip-1')).toEqual({})
  })

  it('returns false when the underlying write throws', async () => {
    const storage = fakeStorage()
    const failing: Storage = {
      ...storage,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const store = new LocalTrackOverridesStore(failing)

    expect(await store.setOverride('trip-1', 'drive-1', { displayName: 'x' }, ['drive-1'])).toBe(false)
  })

  it('replaceAll overwrites the whole record for a trip', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Day 3' }, ['drive-1'])

    store.replaceAll('trip-1', { 'drive-2': { displayName: 'Restored' } })

    expect(store.getOverrides('trip-1')).toEqual({ 'drive-2': { displayName: 'Restored' } })
  })
})
