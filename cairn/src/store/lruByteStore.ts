/* #245 — the eviction policy shared by `photoImageCache` and
   `defaultTrackFileCache`: least-recently-used against a fixed byte budget,
   enforced on write. One `LruByteStore` instance per cache, each with its
   own IndexedDB database and its own budget — see each cache's call site
   for its number and why.

   Two object stores per database: the entries themselves (keyed by the
   cache's own key, e.g. a Drive file id), and a single-record `meta` store
   holding the running total so a write doesn't have to sum the whole store
   to know whether it's over budget (the issue's Proposal). Both stores sit
   in one IndexedDB transaction per read or write, so the total and the
   entries it describes never drift out of sync from a partial write.

   The stored value is opaque to this module (`T`) — `photoImageCache`
   stores a bare `Blob`, `trackFileCache` stores `{ modifiedTime, blob,
   type }`. This module only needs to know each entry's byte size and when
   it was last touched. */

const META_STORE = 'meta'
const TOTAL_KEY = 'totalBytes'
const LAST_ACCESSED_INDEX = 'lastAccessedAt'

interface StoredEntry<T> {
  value: T
  size: number
  lastAccessedAt: number
}

export interface LruByteStoreDeps {
  /** Defaults to the browser's global `indexedDB` — see `imageCache.ts`'s
      identical field for why jsdom needs this overridden in tests. */
  indexedDBFactory?: IDBFactory
}

export class LruByteStore<T> {
  private readonly indexedDBFactory: IDBFactory
  private dbPromise?: Promise<IDBDatabase>
  // Monotonically increasing, unlike `Date.now()` alone — two touches in
  // the same millisecond (routine under test, and not impossible in
  // production on a fast write burst) would otherwise tie, and an
  // `lastAccessedAt` index can't tell which of a tie was actually more
  // recent. Seeded from wall-clock time so ordering still holds across a
  // reload, when a fresh instance's counter starts over.
  private clock = 0

  constructor(
    private readonly dbName: string,
    private readonly dbVersion: number,
    private readonly storeName: string,
    private readonly budgetBytes: number,
    deps: LruByteStoreDeps = {},
  ) {
    this.indexedDBFactory = deps.indexedDBFactory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB!
  }

  private openDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDBFactory.open(this.dbName, this.dbVersion)
        // Bumping `dbVersion` past what's stored wipes rather than
        // migrates (the issue's Proposal) — every entry here is
        // re-fetchable by definition, so there is nothing worth walking
        // forward.
        request.onupgradeneeded = () => {
          const db = request.result
          if (db.objectStoreNames.contains(this.storeName)) db.deleteObjectStore(this.storeName)
          if (db.objectStoreNames.contains(META_STORE)) db.deleteObjectStore(META_STORE)
          const store = db.createObjectStore(this.storeName)
          store.createIndex(LAST_ACCESSED_INDEX, LAST_ACCESSED_INDEX)
          db.createObjectStore(META_STORE)
        }
        request.onsuccess = () => {
          const db = request.result
          // A later open() elsewhere at a higher version (a new tab after
          // a deploy) fires a 'versionchange' event on every open
          // connection instead of proceeding — without closing here, that
          // upgrade blocks until this connection goes away on its own.
          db.onversionchange = () => db.close()
          resolve(db)
        }
        request.onerror = () => reject(request.error ?? new Error(`Failed to open ${this.dbName}`))
      })
    }
    return this.dbPromise
  }

  private now(): number {
    this.clock = Math.max(Date.now(), this.clock + 1)
    return this.clock
  }

  /** Reads an entry and, on a hit, touches its `lastAccessedAt` so it isn't
      evicted ahead of something written more recently but read less
      (criterion 3). A read failure is a miss — same "storage failure
      degrades gracefully" stance as the caches built on this module. */
  async get(key: string): Promise<T | undefined> {
    try {
      const db = await this.openDB()
      return await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        const request = store.get(key)
        request.onsuccess = () => {
          const entry = request.result as StoredEntry<T> | undefined
          if (!entry) {
            resolve(undefined)
            return
          }
          entry.lastAccessedAt = this.now()
          store.put(entry, key)
          resolve(entry.value)
        }
        tx.onerror = () => reject(tx.error ?? new Error(`Failed to read ${this.dbName}`))
      })
    } catch {
      return undefined
    }
  }

  /** Best-effort write: evicts least-recently-used entries until `value`
      fits the budget, then writes it (criteria 1, 2, 4). A `size` larger
      than the whole budget is never written (criterion 5) — the caller
      already has the bytes from whatever fetch is calling this; a failed
      housekeeping write must not fail that. */
  async put(key: string, value: T, size: number): Promise<void> {
    if (size > this.budgetBytes) return

    try {
      const db = await this.openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([this.storeName, META_STORE], 'readwrite')
        const store = tx.objectStore(this.storeName)
        const meta = tx.objectStore(META_STORE)

        const finish = (runningTotal: number) => {
          store.put({ value, size, lastAccessedAt: this.now() }, key)
          meta.put(runningTotal + size, TOTAL_KEY)
        }

        const evictUntilFits = (runningTotal: number) => {
          if (runningTotal + size <= this.budgetBytes) {
            finish(runningTotal)
            return
          }
          const cursorRequest = store.index(LAST_ACCESSED_INDEX).openCursor()
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result
            if (!cursor) {
              // Nothing left to evict against an already-empty store —
              // write anyway; there's nothing more housekeeping can do.
              finish(runningTotal)
              return
            }
            const evicted = cursor.value as StoredEntry<T>
            cursor.delete()
            evictUntilFits(runningTotal - evicted.size)
          }
        }

        const existingRequest = store.get(key)
        existingRequest.onsuccess = () => {
          const existing = existingRequest.result as StoredEntry<T> | undefined
          const existingSize = existing?.size ?? 0
          // Overwriting an existing key: remove its old record up front so
          // the eviction cursor below can't land on it and double-subtract
          // a size already accounted for in `existingSize` — it would
          // otherwise be a live candidate, being (if old enough) exactly
          // what an LRU sweep looks for.
          if (existing) store.delete(key)

          const totalRequest = meta.get(TOTAL_KEY)
          totalRequest.onsuccess = () => {
            const knownTotal = totalRequest.result as number | undefined
            if (knownTotal === undefined) {
              // Criterion 7: the running total is missing (a fresh store,
              // or one that never wrote it) — recompute from the store's
              // actual contents rather than trusting a gap.
              recomputeTotal(store, (recomputed) => evictUntilFits(recomputed - existingSize))
            } else {
              evictUntilFits(knownTotal - existingSize)
            }
          }
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error(`Failed to write ${this.dbName}`))
      })
    } catch {
      // Swallowed — see doc comment above (criterion 8).
    }
  }
}

function recomputeTotal<T>(store: IDBObjectStore, callback: (total: number) => void): void {
  let sum = 0
  const cursorRequest = store.openCursor()
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) {
      callback(sum)
      return
    }
    const entry = cursor.value as StoredEntry<T>
    sum += entry.size
    cursor.continue()
  }
}
