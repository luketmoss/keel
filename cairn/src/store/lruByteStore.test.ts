import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { LruByteStore } from './lruByteStore'

function makeStore(budgetBytes: number, db: IDBFactory = new IDBFactory()) {
  return new LruByteStore<string>('test-db', 1, 'entries', budgetBytes, { indexedDBFactory: db })
}

describe('LruByteStore', () => {
  // Criterion 4: a write that stays under budget evicts nothing.
  it('keeps every entry when writes stay under budget', async () => {
    const store = makeStore(100)

    await store.put('a', 'value-a', 30)
    await store.put('b', 'value-b', 30)

    await expect(store.get('a')).resolves.toBe('value-a')
    await expect(store.get('b')).resolves.toBe('value-b')
  })

  // Criteria 1 & 2: a write that would exceed budget evicts the
  // least-recently-used entries, oldest use first, until it fits.
  it('evicts entries oldest-use-first until a new write fits the budget', async () => {
    const store = makeStore(100)

    await store.put('a', 'value-a', 40)
    await store.put('b', 'value-b', 40)
    // Over budget with a third 40-byte entry (120 > 100) — 'a' is the
    // oldest use and should go first, leaving 'b' and the new entry.
    await store.put('c', 'value-c', 40)

    await expect(store.get('a')).resolves.toBeUndefined()
    await expect(store.get('b')).resolves.toBe('value-b')
    await expect(store.get('c')).resolves.toBe('value-c')
  })

  // Criterion 3: reading an entry touches its lastAccessedAt, so it
  // outlives an entry that's merely been sitting there unread.
  it('protects a recently-read entry from eviction ahead of an unread one', async () => {
    const store = makeStore(100)

    await store.put('a', 'value-a', 40)
    await store.put('b', 'value-b', 40)
    // Touch 'a' so it's now more recently used than 'b'.
    await store.get('a')

    // A third 40-byte write pushes the total to 120; 'b' is now the
    // least-recently-used and should be evicted instead of 'a'.
    await store.put('c', 'value-c', 40)

    await expect(store.get('a')).resolves.toBe('value-a')
    await expect(store.get('b')).resolves.toBeUndefined()
    await expect(store.get('c')).resolves.toBe('value-c')
  })

  // Criterion 5: an entry larger than the whole budget is never written,
  // and the store isn't emptied trying to make room for it.
  it('refuses to write a single entry larger than the whole budget, without evicting anything', async () => {
    const store = makeStore(100)
    await store.put('a', 'value-a', 40)

    await store.put('huge', 'too-big', 200)

    await expect(store.get('huge')).resolves.toBeUndefined()
    await expect(store.get('a')).resolves.toBe('value-a')
  })

  // Criterion 6: independent stores (independent databases) never evict
  // each other's entries.
  it('keeps two independent stores from evicting one another', async () => {
    const photos = makeStore(50)
    const tracks = makeStore(50)

    await photos.put('p1', 'photo-1', 40)
    await tracks.put('t1', 'track-1', 40)
    // Filling the track store to its own budget must not touch photos.
    await tracks.put('t2', 'track-2', 40)

    await expect(photos.get('p1')).resolves.toBe('photo-1')
  })

  // Criterion 7: the running total is recomputed, not trusted, when it's
  // missing — modeled by writing to a store with no 'meta' write happening
  // yet (a fresh database) and confirming budget enforcement still works
  // from the first write onward.
  it('enforces the budget correctly even from a fresh database with no stored running total', async () => {
    const store = makeStore(50)

    await store.put('a', 'value-a', 30)
    await store.put('b', 'value-b', 30)

    // 60 bytes of live data over a 50-byte budget — 'a' must have been
    // evicted for this to hold, proving the total was tracked (or
    // recomputed) correctly from an empty start rather than assumed zero
    // forever.
    await expect(store.get('a')).resolves.toBeUndefined()
    await expect(store.get('b')).resolves.toBe('value-b')
  })

  // Criterion 8: a write against an unavailable IndexedDB is swallowed,
  // not thrown — matching the caches' existing "write failure never fails
  // the caller" stance.
  it('swallows a write failure instead of throwing', async () => {
    const store = new LruByteStore<string>('test-db', 1, 'entries', 100, { indexedDBFactory: undefined })

    await expect(store.put('a', 'value-a', 10)).resolves.toBeUndefined()
  })

  // Criterion 7 edge case: overwriting an existing key with a bigger value
  // that pushes the store over budget must not let that key's own
  // about-to-be-replaced entry be double-counted by the eviction cursor —
  // 'a' is both the write target and (being the oldest use) the first
  // eviction candidate.
  it('accounts correctly when overwriting an existing key requires eviction', async () => {
    const store = makeStore(100)
    await store.put('a', 'value-a', 50)
    await store.put('b', 'value-b', 50)

    // Growing 'a' from 50 to 60 bytes makes the true total 110 (60 + the
    // untouched 'b's 50) — over the 100 budget by 10, so 'b' must go.
    await store.put('a', 'value-a-bigger', 60)

    await expect(store.get('a')).resolves.toBe('value-a-bigger')
    await expect(store.get('b')).resolves.toBeUndefined()

    // A third write should account for exactly 'a's 60 bytes, not a
    // corrupted lower total — 40 more bytes should be exactly at budget,
    // evicting nothing.
    await store.put('c', 'value-c', 40)
    await expect(store.get('a')).resolves.toBe('value-a-bigger')
    await expect(store.get('c')).resolves.toBe('value-c')
  })

  // Criterion 9: bumping the store's schema version discards whatever the
  // previous version held, without erroring.
  it('discards pre-existing entries when opened at a newer version', async () => {
    const db = new IDBFactory()
    const v1 = new LruByteStore<string>('versioned-db', 1, 'entries', 100, { indexedDBFactory: db })
    await v1.put('a', 'value-a', 10)
    await expect(v1.get('a')).resolves.toBe('value-a')

    const v2 = new LruByteStore<string>('versioned-db', 2, 'entries', 100, { indexedDBFactory: db })
    await expect(v2.get('a')).resolves.toBeUndefined()

    await v2.put('a', 'value-a-again', 10)
    await expect(v2.get('a')).resolves.toBe('value-a-again')
  })
})
