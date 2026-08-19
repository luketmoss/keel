/* #244 — caches track file bytes in IndexedDB, keyed by Drive file id plus
   `modifiedTime`, so a trip whose track files haven't changed since the last
   visit re-parses from cache instead of re-downloading. Bytes only, never
   parsed geometry — see the issue's Proposal for why: it keeps the cached
   thing identical to what Drive served, the same property that makes
   `photoImageCache` (the module this one is modeled on) safe.

   Its own IndexedDB database, separate from `cairn-photo-cache` — no version
   bump or upgrade path against a store that already holds every photo the
   user has loaded, and the DB name stays honest about what it holds. No
   ref-counted Object URLs, unlike `imageCache`: callers here want a `File`
   to parse, not a URL to render, so there is nothing to release. */

import { downloadTrackFile, DriveAuthError, DriveRequestError } from './trackFiles'

export { DriveAuthError, DriveRequestError }

const DB_NAME = 'cairn-track-cache'
const DB_VERSION = 1
const STORE_NAME = 'tracks'

interface CachedTrackFile {
  modifiedTime: string
  blob: Blob
  type: string
}

export interface TrackFileCacheDeps {
  /** Defaults to the browser's global `indexedDB` — see `imageCache.ts`'s
      identical field for why jsdom needs this overridden in tests. */
  indexedDBFactory?: IDBFactory
}

export class TrackFileCache {
  private readonly indexedDBFactory: IDBFactory

  private dbPromise?: Promise<IDBDatabase>
  // In-flight "get this file" operations (IndexedDB read, and the network
  // download + IndexedDB write behind a miss), keyed by Drive file id. Two
  // concurrent requests for the same uncached file id share one entry here
  // rather than issuing two downloads (criterion 5).
  private readonly inFlight = new Map<string, Promise<File>>()

  constructor(deps: TrackFileCacheDeps = {}) {
    this.indexedDBFactory = deps.indexedDBFactory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB!
  }

  /** Resolves to a `File` for `fileId`, from cache if `modifiedTime` matches
      what's stored, from Drive otherwise. `DriveAuthError` and
      `DriveRequestError` propagate unchanged (criterion 10) — this module
      adds a cache in front of `downloadTrackFile`, not a different failure
      mode for it. */
  getFile = async (
    accessToken: string,
    fileId: string,
    name: string,
    modifiedTime: string,
  ): Promise<File> => {
    const inFlight = this.inFlight.get(fileId)
    if (inFlight) return inFlight

    const promise = this.loadFile(accessToken, fileId, name, modifiedTime).finally(() => {
      this.inFlight.delete(fileId)
    })
    this.inFlight.set(fileId, promise)
    return promise
  }

  private async loadFile(
    accessToken: string,
    fileId: string,
    name: string,
    modifiedTime: string,
  ): Promise<File> {
    const cached = await this.readFromDB(fileId)
    if (cached && cached.modifiedTime === modifiedTime) {
      return new File([cached.blob], name, { type: cached.type })
    }

    const file = await downloadTrackFile(accessToken, fileId, name)
    // `.slice()` with no arguments returns a plain `Blob`, even called on a
    // `File` — IndexedDB structured-clones a `Blob` reliably; a `File`
    // (carrying a name/lastModified beyond what this store needs) is a
    // needless risk to put through the same path.
    await this.writeToDB(fileId, { modifiedTime, blob: file.slice(), type: file.type })
    return file
  }

  private openDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDBFactory.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Failed to open track cache database'))
      })
    }
    return this.dbPromise
  }

  /** A read failure is a miss (criterion 6) — same stance as
      `imageCache.readFromDB`. The download path still runs; it just won't
      be memoized this time. */
  private async readFromDB(fileId: string): Promise<CachedTrackFile | undefined> {
    try {
      const db = await this.openDB()
      return await new Promise<CachedTrackFile | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(fileId)
        request.onsuccess = () => resolve((request.result as CachedTrackFile | undefined) ?? undefined)
        request.onerror = () => reject(request.error ?? new Error('Failed to read track cache'))
      })
    } catch {
      return undefined
    }
  }

  /** Best-effort (criterion 7) — a full or unavailable IndexedDB is not a
      reason to fail a load that already has its bytes in hand. */
  private async writeToDB(fileId: string, entry: CachedTrackFile): Promise<void> {
    try {
      const db = await this.openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(entry, fileId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to write track cache'))
      })
    } catch {
      // Swallowed — see doc comment.
    }
  }
}

/** The instance `useTripImport` shares by default — one IndexedDB
    connection, one in-flight map, per page load. Tests exercise
    `TrackFileCache` directly with an injected fake IndexedDB, or inject
    their own instance into `useTripImport`. */
export const defaultTrackFileCache = new TrackFileCache()
