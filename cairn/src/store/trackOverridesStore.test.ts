import { describe, expect, it } from 'vitest'
import { LocalTrackOverridesStore, carryDisplayNameIntoTrip } from './trackOverridesStore'

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

describe('carryDisplayNameIntoTrip', () => {
  it('gives the arriving track its name in the destination trip', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())

    expect(
      await carryDisplayNameIntoTrip(store, 'trip-1', 'drive-1', 'Snowdon ridge', null),
    ).toBe(true)

    expect(store.getOverrides('trip-1')).toEqual({
      'drive-1': { displayName: 'Snowdon ridge' },
    })
  })

  // The hazard `setOverride`'s prune argument creates: a move knows about one
  // track, and handing that one id over as the valid list would delete every
  // other name and colour the trip is holding.
  it('leaves every other track in the trip untouched', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-9', { displayName: 'Day 1', color: 3, order: 0 }, [
      'drive-9',
    ])

    await carryDisplayNameIntoTrip(store, 'trip-1', 'drive-1', 'Snowdon ridge', null)

    expect(store.getOverrides('trip-1')).toEqual({
      'drive-9': { displayName: 'Day 1', color: 3, order: 0 },
      'drive-1': { displayName: 'Snowdon ridge' },
    })
  })

  it('leaves a track arriving with a name it already had alone', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    await store.setOverride('trip-1', 'drive-1', { displayName: 'Snowdon ridge', color: 2 }, [
      'drive-1',
    ])

    await carryDisplayNameIntoTrip(store, 'trip-1', 'drive-1', 'Snowdon ridge', null)

    // Merged, not replaced — a name arriving does not cost the track its colour.
    expect(store.getOverrides('trip-1')).toEqual({
      'drive-1': { displayName: 'Snowdon ridge', color: 2 },
    })
  })

  // The silent one: a Drive-backed store writes to `localStorage` only until
  // the destination trip is connected, and that trip's next `connect`
  // hydrates Drive's copy over the top — taking the new name with it.
  it('connects the destination trip before writing, so the name reaches Drive', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    const calls: string[] = []
    const connecting = {
      getOverrides: store.getOverrides,
      setOverride: async (...args: Parameters<LocalTrackOverridesStore['setOverride']>) => {
        calls.push('setOverride')
        return store.setOverride(...args)
      },
      connect: async (tripId: string, accessToken: string, folderId: string) => {
        calls.push(`connect:${tripId}:${accessToken}:${folderId}`)
      },
      setOrder: store.setOrder,
    }

    await carryDisplayNameIntoTrip(connecting, 'trip-1', 'drive-1', 'Snowdon ridge', {
      accessToken: 'token-1',
      folderId: 'cairn-folder',
    })

    expect(calls).toEqual(['connect:trip-1:token-1:cairn-folder', 'setOverride'])
  })

  it('writes anyway when connecting fails, so the name is not lost outright', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    const connecting = {
      getOverrides: store.getOverrides,
      setOverride: store.setOverride,
      setOrder: store.setOrder,
      connect: async () => {
        throw new Error('Drive unreachable')
      },
    }

    expect(
      await carryDisplayNameIntoTrip(connecting, 'trip-1', 'drive-1', 'Snowdon ridge', {
        accessToken: 'token-1',
        folderId: 'cairn-folder',
      }),
    ).toBe(true)

    expect(store.getOverrides('trip-1')).toEqual({
      'drive-1': { displayName: 'Snowdon ridge' },
    })
  })

  it('reports a refused write rather than swallowing it', async () => {
    const store = new LocalTrackOverridesStore(fakeStorage())
    const refusing = {
      getOverrides: store.getOverrides,
      setOverride: async () => false,
      setOrder: store.setOrder,
    }

    expect(
      await carryDisplayNameIntoTrip(refusing, 'trip-1', 'drive-1', 'Snowdon ridge', null),
    ).toBe(false)
  })
})
