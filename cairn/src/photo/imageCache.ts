/* Turns a Drive photo file id into a URL usable in an `<img src>`. Photos
   are private Drive files — every byte request needs an `Authorization`
   header, so the browser's native `<img src>` loading and HTTP caching
   don't apply (#53's problem statement). This module is the one place that
   fetches photo bytes: it caches the blob in IndexedDB so a second request
   for the same file never reaches the network, and hands back an Object URL
   reference-counted across callers so the map (#54) and the photo list
   (#55) can both hold a photo open at once without minting duplicate URLs
   or leaking the ones they're done with.

   Built ahead of its two consumers deliberately — same reasoning as
   `overview.geojson` landing before the world map (#37): retrofitting a
   cache under two callers means rewriting both.

   Fetch pattern and error types match `drive/trackFiles.ts`
   (`downloadTrackFile` is the closest analog) — `DriveAuthError` on a 401,
   `DriveRequestError` for anything else network-shaped, re-exported here
   rather than redeclared so an existing `instanceof DriveAuthError` check
   elsewhere in the app also catches this module's auth failures. */

import { DriveAuthError, DriveRequestError } from '../drive/trackFiles'
import { reportDriveAuthError } from '../drive/authEvents'

export { DriveAuthError, DriveRequestError }

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DB_NAME = 'cairn-photo-cache'
const DB_VERSION = 1
const STORE_NAME = 'images'

/** The file existed in Drive's listing but its bytes are gone — deleted
    behind the app's back. Distinct from `DriveRequestError` (criterion 6)
    so a caller can tell "this photo no longer exists" apart from "the
    request failed and might succeed on retry". */
export class PhotoNotFoundError extends Error {
  constructor(public readonly fileId: string) {
    super(`Photo ${fileId} was not found in Drive`)
    this.name = 'PhotoNotFoundError'
  }
}

async function fetchPhotoBlob(
  fetchImpl: typeof fetch,
  accessToken: string,
  fileId: string,
): Promise<Blob> {
  const url = `${DRIVE_FILES_URL}/${fileId}?alt=media`

  let response: Response
  try {
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (response.status === 404) throw new PhotoNotFoundError(fileId)
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  return response.blob()
}

/** The Object URL side of the cache, factored out so a test can supply a
    fake rather than exercising real browser memory — jsdom (this suite's
    test environment) doesn't implement `URL.createObjectURL` at all. */
export interface ObjectUrlFactory {
  create(blob: Blob): string
  revoke(url: string): void
}

const browserObjectUrls: ObjectUrlFactory = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
}

export interface ImageCacheDeps {
  /** Defaults to the browser's global `indexedDB`. jsdom doesn't implement
      IndexedDB (verified against the pinned jsdom 25 — `'indexedDB' in
      window` is `false`), so tests inject a fresh `fake-indexeddb`
      `IDBFactory` per test instead of polyfilling the global; production
      code never sets this and gets the real one. */
  indexedDBFactory?: IDBFactory
  objectUrls?: ObjectUrlFactory
  fetchImpl?: typeof fetch
}

/** A live handle on a photo's Object URL. `url` renders directly in an
    `<img>`. `release()` signals this caller is done with it — the
    underlying Object URL is reference-counted across every outstanding
    handle for the same file id, so it's only revoked once all of them have
    released (criterion 9), and a second concurrent caller for a file
    that's already showing gets the *same* URL back rather than a fresh one.
    `release()` is idempotent; calling it twice on the same handle only
    counts once. */
export interface AcquiredPhotoImage {
  url: string
  release: () => void
}

interface LiveUrl {
  url: string
  blob: Blob
  refCount: number
}

export class PhotoImageCache {
  private readonly indexedDBFactory: IDBFactory
  private readonly objectUrls: ObjectUrlFactory
  private readonly fetchImpl: typeof fetch

  private dbPromise?: Promise<IDBDatabase>
  // Object URLs currently minted, keyed by Drive file id. Absence here does
  // NOT mean "not cached" — only "no live Object URL right now" — the
  // IndexedDB read in `loadBlob` is what actually answers "is this cached".
  private readonly liveUrls = new Map<string, LiveUrl>()
  // In-flight "get this file's blob" operations (IndexedDB read, and the
  // network fetch + IndexedDB write behind a miss), keyed by file id. Two
  // concurrent `acquire()` calls for the same uncached file id share one
  // entry here rather than issuing two fetches (criterion 5).
  private readonly inFlightBlobs = new Map<string, Promise<Blob>>()

  constructor(deps: ImageCacheDeps = {}) {
    // `globalThis.indexedDB` rather than the bare `indexedDB` global: jsdom
    // (this suite's test environment) doesn't declare the identifier at
    // all, so referencing it directly throws a ReferenceError even before
    // reaching the `??` — property access on `globalThis` just reads
    // `undefined` instead. Production code always passes through the real
    // browser implementation; only tests (which always inject a fake) rely
    // on this fallback not throwing.
    this.indexedDBFactory = deps.indexedDBFactory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB!
    this.objectUrls = deps.objectUrls ?? browserObjectUrls
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  /** Resolves to a URL for `fileId`, fetching from Drive only if it isn't
      already cached (in memory as a live Object URL, or in IndexedDB from
      an earlier session). Throws `DriveAuthError`, `PhotoNotFoundError`, or
      `DriveRequestError` — never hangs and never resolves a broken URL
      (criteria 6, 7). */
  acquire = async (accessToken: string, fileId: string): Promise<AcquiredPhotoImage> => {
    const live = this.liveUrls.get(fileId)
    if (live) {
      live.refCount += 1
      return this.handleFor(fileId)
    }

    const blob = await this.getOrFetchBlob(accessToken, fileId)

    // Another concurrent first-time acquire for the same file id may have
    // already minted the Object URL while this call was awaiting the
    // shared in-flight blob — reuse it rather than creating a second one.
    const existing = this.liveUrls.get(fileId)
    if (existing) {
      existing.refCount += 1
      return this.handleFor(fileId)
    }

    const url = this.objectUrls.create(blob)
    this.liveUrls.set(fileId, { url, blob, refCount: 1 })
    return this.handleFor(fileId)
  }

  private handleFor(fileId: string): AcquiredPhotoImage {
    const entry = this.liveUrls.get(fileId)
    /* istanbul ignore next -- always set by the caller just above */
    if (!entry) throw new Error(`No live URL for ${fileId}`)

    let released = false
    return {
      url: entry.url,
      release: () => {
        if (released) return
        released = true
        this.release(fileId)
      },
    }
  }

  private release(fileId: string): void {
    const entry = this.liveUrls.get(fileId)
    if (!entry) return
    entry.refCount -= 1
    if (entry.refCount <= 0) {
      this.liveUrls.delete(fileId)
      this.objectUrls.revoke(entry.url)
    }
  }

  /** Dedupes concurrent requests for the same file id (criterion 5) behind
      a single shared promise, cleared once it settles either way so a
      later, separate `acquire()` call tries again rather than replaying a
      stale failure. */
  private getOrFetchBlob(accessToken: string, fileId: string): Promise<Blob> {
    const inFlight = this.inFlightBlobs.get(fileId)
    if (inFlight) return inFlight

    const promise = this.loadBlob(accessToken, fileId).finally(() => {
      this.inFlightBlobs.delete(fileId)
    })
    this.inFlightBlobs.set(fileId, promise)
    return promise
  }

  /** IndexedDB first, network on a miss. A miss covers both "never cached"
      and "the browser evicted this entry under storage pressure" — there's
      no separate bookkeeping that distinguishes them, so eviction is
      handled for free: it just looks like a first request (criterion 8). */
  private async loadBlob(accessToken: string, fileId: string): Promise<Blob> {
    const cached = await this.readFromDB(fileId)
    if (cached) return cached

    const blob = await fetchPhotoBlob(this.fetchImpl, accessToken, fileId)
    await this.writeToDB(fileId, blob)
    return blob
  }

  private openDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = this.indexedDBFactory.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Failed to open photo cache database'))
      })
    }
    return this.dbPromise
  }

  /** A read failure — IndexedDB unavailable, the open call rejecting,
      anything — is treated as a cache miss rather than propagated. The
      network fetch path below still works; it just won't be memoized this
      time. Same "storage failure degrades gracefully" stance as
      `LocalTrackOverridesStore`. */
  private async readFromDB(fileId: string): Promise<Blob | undefined> {
    try {
      const db = await this.openDB()
      return await new Promise<Blob | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).get(fileId)
        request.onsuccess = () => resolve((request.result as Blob | undefined) ?? undefined)
        request.onerror = () => reject(request.error ?? new Error('Failed to read photo cache'))
      })
    } catch {
      return undefined
    }
  }

  /** Best-effort. A full or unavailable IndexedDB just means this blob
      isn't memoized past this session's live Object URL — not a reason to
      fail the request that already has its bytes in hand. */
  private async writeToDB(fileId: string, blob: Blob): Promise<void> {
    try {
      const db = await this.openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(blob, fileId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to write photo cache'))
      })
    } catch {
      // Swallowed — see doc comment.
    }
  }
}

/** The instance every consumer (#54, #55) shares — one IndexedDB
    connection, one in-flight map, one set of live Object URLs per page
    load. Tests exercise `PhotoImageCache` directly with injected fakes
    instead of this singleton. */
export const photoImageCache = new PhotoImageCache()
