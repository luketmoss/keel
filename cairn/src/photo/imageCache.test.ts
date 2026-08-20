import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DriveAuthError,
  DriveRequestError,
  PhotoImageCache,
  PhotoNotFoundError,
  type ObjectUrlFactory,
} from './imageCache'

function response(
  body: BodyInit | Blob,
  { status = 200, blob }: { status?: number; blob?: Blob } = {},
): Response {
  const resolvedBlob = blob ?? (body instanceof Blob ? body : new Blob([body as BlobPart]))
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => resolvedBlob,
  } as unknown as Response
}

/** A fake Object URL factory that mints predictable, distinguishable
    strings and records what's been revoked — lets a test assert both "the
    same URL came back" and "release() actually revoked it" without
    depending on real browser memory, which jsdom doesn't implement. */
function fakeObjectUrls(): ObjectUrlFactory & { revoked: string[] } {
  let n = 0
  const revoked: string[] = []
  return {
    create: () => `blob:fake-${(n += 1)}`,
    revoke: (url) => revoked.push(url),
    revoked,
  }
}

function makeCache(overrides: { fetchImpl?: typeof fetch; objectUrls?: ObjectUrlFactory } = {}) {
  const objectUrls = overrides.objectUrls ?? fakeObjectUrls()
  const cache = new PhotoImageCache({
    indexedDBFactory: new IDBFactory(),
    objectUrls,
    fetchImpl: overrides.fetchImpl,
  })
  return { cache, objectUrls }
}

describe('PhotoImageCache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Criteria 1 & 2: first request fetches from Drive with the access token
  // and resolves to a URL.
  it('fetches an uncached file from Drive using the access token, and returns a usable URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
    const { cache } = makeCache({ fetchImpl })

    const image = await cache.acquire('token-123', 'file-1')

    expect(typeof image.url).toBe('string')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('file-1')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  // Criterion 3: a second request for the same file completes without a
  // network request.
  it('serves a second request for the same file from cache, without a network request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
    const { cache } = makeCache({ fetchImpl })

    await cache.acquire('token', 'file-1')
    await cache.acquire('token', 'file-1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  // Criterion 5: two simultaneous in-flight requests for the same file
  // produce one network request, not two.
  it('dedupes two concurrent requests for the same file into a single network request', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    const fetchImpl = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )
    const { cache } = makeCache({ fetchImpl })

    const first = cache.acquire('token', 'file-1')
    const second = cache.acquire('token', 'file-1')

    resolveFetch(response('bytes'))
    const [firstImage, secondImage] = await Promise.all([first, second])

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(firstImage.url).toBe(secondImage.url)
  })

  // Criterion 4: cached images survive a page reload. Modeled as two
  // separate cache instances sharing the same underlying IndexedDB — a
  // reload also discards all in-memory bookkeeping, which two fresh
  // instances capture faithfully.
  it('serves a cached file from IndexedDB across a simulated reload', async () => {
    const db = new IDBFactory()
    const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))

    const before = new PhotoImageCache({
      indexedDBFactory: db,
      objectUrls: fakeObjectUrls(),
      fetchImpl,
    })
    await before.acquire('token', 'file-1')

    const after = new PhotoImageCache({
      indexedDBFactory: db,
      objectUrls: fakeObjectUrls(),
      fetchImpl,
    })
    await after.acquire('token', 'file-1')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  // Criterion 6: a file no longer in Drive returns a typed error.
  it('throws PhotoNotFoundError for a 404, rather than hanging or returning a broken URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('', { status: 404 }))
    const { cache } = makeCache({ fetchImpl })

    await expect(cache.acquire('token', 'missing')).rejects.toBeInstanceOf(PhotoNotFoundError)
  })

  // Criterion 7: an expired/rejected token surfaces as an auth error,
  // distinguishable from a network failure.
  it('throws DriveAuthError for a 401, distinct from a generic request error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('', { status: 401 }))
    const { cache } = makeCache({ fetchImpl })

    await expect(cache.acquire('expired-token', 'file-1')).rejects.toBeInstanceOf(DriveAuthError)
  })

  it('throws DriveRequestError for a network failure, distinct from an auth error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'))
    const { cache } = makeCache({ fetchImpl })

    const error = await cache.acquire('token', 'file-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DriveRequestError)
    expect(error).not.toBeInstanceOf(DriveAuthError)
  })

  it('throws DriveRequestError for a non-401/404 failure status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('', { status: 500 }))
    const { cache } = makeCache({ fetchImpl })

    await expect(cache.acquire('token', 'file-1')).rejects.toBeInstanceOf(DriveRequestError)
  })

  // Criterion 8: an entry evicted by the browser is refetched transparently.
  it('transparently refetches a file the browser evicted from IndexedDB', async () => {
    const db = new IDBFactory()
    const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))

    const first = new PhotoImageCache({ indexedDBFactory: db, objectUrls: fakeObjectUrls(), fetchImpl })
    const handle = await first.acquire('token', 'file-1')
    handle.release()

    // Simulate the browser reclaiming storage: a fresh IDBFactory has none
    // of what `db` held, but the same in-memory `first` instance is asked
    // for the file again — its own bookkeeping ("no live URL right now")
    // gives no false confidence that it's still cached.
    const evicted = new PhotoImageCache({
      indexedDBFactory: new IDBFactory(),
      objectUrls: fakeObjectUrls(),
      fetchImpl,
    })
    await evicted.acquire('token', 'file-1')

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  // Criterion 10 (#245): an IndexedDB eviction never invalidates a live
  // Object URL — eviction only ever removes the IndexedDB entry, and a
  // held handle keeps working until every holder releases it.
  it('keeps a live Object URL usable after its IndexedDB entry is evicted out from under it', async () => {
    const db = new IDBFactory()
    // file-2's fetch reports a size just under the module's 250MB budget
    // on its own — small enough to be written, but pushing the total past
    // budget alongside file-1's small entry, which must be evicted to fit
    // it. A fake `size` avoids actually allocating a quarter-gigabyte
    // buffer just to exercise the byte-counting logic.
    const big = { size: 250 * 1024 * 1024 - 2 } as unknown as Blob
    const fetchImpl = vi.fn().mockImplementation(async (url: string) =>
      url.includes('file-2') ? response('', { blob: big }) : response('bytes'),
    )
    const cache = new PhotoImageCache({ indexedDBFactory: db, objectUrls: fakeObjectUrls(), fetchImpl })

    const handle = await cache.acquire('token', 'file-1')

    // A second cache instance sharing the same database stands in for LRU
    // pressure from elsewhere in the app — it never touches `cache`'s
    // in-memory live-URL bookkeeping, only the shared IndexedDB entries.
    const evictor = new PhotoImageCache({ indexedDBFactory: db, objectUrls: fakeObjectUrls(), fetchImpl })
    await evictor.acquire('token', 'file-2')

    // Still holding the original handle — a second acquire for the same
    // file id reuses the live URL without touching IndexedDB at all.
    const second = await cache.acquire('token', 'file-1')
    expect(second.url).toBe(handle.url)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // file-1 once, file-2 once — no re-fetch of file-1

    handle.release()
    second.release()

    // Only once every holder has released does the eviction become
    // visible — a fresh acquire now has to hit the network again.
    await cache.acquire('token', 'file-1')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  // Criterion 9: Object URLs are released when no longer referenced.
  describe('release()', () => {
    it('revokes the Object URL once the sole holder releases it', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
      const objectUrls = fakeObjectUrls()
      const { cache } = makeCache({ fetchImpl, objectUrls })

      const handle = await cache.acquire('token', 'file-1')
      expect(objectUrls.revoked).toEqual([])

      handle.release()
      expect(objectUrls.revoked).toEqual([handle.url])
    })

    it('does not revoke while a second acquirer still holds the same file, and reuses its URL', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
      const objectUrls = fakeObjectUrls()
      const { cache } = makeCache({ fetchImpl, objectUrls })

      const first = await cache.acquire('token', 'file-1')
      const second = await cache.acquire('token', 'file-1')
      expect(second.url).toBe(first.url)

      first.release()
      expect(objectUrls.revoked).toEqual([])

      second.release()
      expect(objectUrls.revoked).toEqual([first.url])
    })

    it('is idempotent — releasing the same handle twice only counts once', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
      const objectUrls = fakeObjectUrls()
      const { cache } = makeCache({ fetchImpl, objectUrls })

      const first = await cache.acquire('token', 'file-1')
      await cache.acquire('token', 'file-1')

      first.release()
      first.release()
      expect(objectUrls.revoked).toEqual([]) // second holder still live

      const second2 = await cache.acquire('token', 'file-1')
      second2.release()
    })

    it('mints a fresh Object URL for a new acquire after the previous one was fully released', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(response('bytes'))
      const objectUrls = fakeObjectUrls()
      const { cache } = makeCache({ fetchImpl, objectUrls })

      const first = await cache.acquire('token', 'file-1')
      first.release()

      const second = await cache.acquire('token', 'file-1')

      expect(second.url).not.toBe(first.url)
      expect(fetchImpl).toHaveBeenCalledTimes(1) // still served from IndexedDB
    })
  })
})
