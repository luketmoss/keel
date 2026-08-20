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
import { LruByteStore } from '../store/lruByteStore'

export { DriveAuthError, DriveRequestError }

const DB_NAME = 'cairn-track-cache'
const DB_VERSION = 2
const STORE_NAME = 'tracks'
// #245's Proposal: generous against a typical mobile origin quota, not
// measured — revisit if a real device says otherwise.
const BUDGET_BYTES = 25 * 1024 * 1024

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
  private readonly store: LruByteStore<CachedTrackFile>

  // In-flight "get this file" operations (IndexedDB read, and the network
  // download + IndexedDB write behind a miss), keyed by Drive file id. Two
  // concurrent requests for the same uncached file id share one entry here
  // rather than issuing two downloads (criterion 5).
  private readonly inFlight = new Map<string, Promise<File>>()

  constructor(deps: TrackFileCacheDeps = {}) {
    this.store = new LruByteStore<CachedTrackFile>(DB_NAME, DB_VERSION, STORE_NAME, BUDGET_BYTES, {
      indexedDBFactory: deps.indexedDBFactory,
    })
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
    const blob = file.slice()
    await this.writeToDB(fileId, { modifiedTime, blob, type: file.type })
    return file
  }

  /** A read failure is a miss (criterion 6) — same stance as
      `imageCache.readFromDB`. The download path still runs; it just won't
      be memoized this time. */
  private readFromDB(fileId: string): Promise<CachedTrackFile | undefined> {
    return this.store.get(fileId)
  }

  /** Best-effort (criterion 7), and may evict other entries to make room
      (#245) — a full or unavailable IndexedDB is not a reason to fail a
      load that already has its bytes in hand. */
  private writeToDB(fileId: string, entry: CachedTrackFile): Promise<void> {
    return this.store.put(fileId, entry, entry.blob.size)
  }
}

/** The instance `useTripImport` shares by default — one IndexedDB
    connection, one in-flight map, per page load. Tests exercise
    `TrackFileCache` directly with an injected fake IndexedDB, or inject
    their own instance into `useTripImport`. */
export const defaultTrackFileCache = new TrackFileCache()
