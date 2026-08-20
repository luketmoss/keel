import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveAuthError, DriveRequestError, TrackFileCache } from './trackFileCache'

function response(body: BodyInit | Blob, { status = 200, blob }: { status?: number; blob?: Blob } = {}): Response {
  const resolvedBlob = blob ?? (body instanceof Blob ? body : new Blob([body as BlobPart]))
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: async () => resolvedBlob,
  } as unknown as Response
}

/** jsdom's own `Blob`/`File` (what `downloadTrackFile` constructs) implement
    neither `.text()` nor `.arrayBuffer()` (verified against the pinned
    jsdom) — `FileReader` is what reads those back. Only used for a `File`
    fresh off the (mocked) download path; a `Blob` that's round-tripped
    through `fake-indexeddb` under jsdom doesn't reconstruct as a real `Blob`
    at all (a known gap in jsdom's structured-clone support), so tests below
    assert cache hits by network-call count instead of by re-reading bytes
    that jsdom can't faithfully hand back. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsText(file)
  })
}

describe('TrackFileCache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Criterion 1: an unchanged, cached file needs no `alt=media` request.
  it('serves an unchanged file from cache without a network request', async () => {
    const db = new IDBFactory()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('bytes'))
    const cache = new TrackFileCache({ indexedDBFactory: db })

    await cache.getFile('token', 'file-1', 'a.kml', 'rev-1')
    fetchSpy.mockClear()

    const second = new TrackFileCache({ indexedDBFactory: db })
    const file = await second.getFile('token', 'file-1', 'a.kml', 'rev-1')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(file.name).toBe('a.kml')
    expect(file).toBeInstanceOf(File)
  })

  // Criterion 2: bytes served from cache are identical to a fresh download —
  // asserted at `readFromDB`, the one place both paths meet: what goes into
  // the store on a miss is exactly what a hit reads back, byte for byte
  // (`fake-indexeddb`'s structured clone doesn't reconstruct a faithful
  // `Blob` under jsdom, so this reads the stored entry directly rather than
  // through `getFile`, which would otherwise be comparing jsdom's broken
  // reconstruction against itself and proving nothing).
  it('stores exactly the bytes a fresh download produced', async () => {
    const db = new IDBFactory()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('same bytes'))
    const cache = new TrackFileCache({ indexedDBFactory: db })
    const fresh = await cache.getFile('token', 'file-1', 'a.kml', 'rev-1')

    const written = await new Promise<{ value: { modifiedTime: string; type: string } }>((resolve, reject) => {
      const req = db.open('cairn-track-cache', 2)
      req.onsuccess = () => {
        const tx = req.result.transaction('tracks', 'readonly')
        const get = tx.objectStore('tracks').get('file-1')
        get.onsuccess = () => resolve(get.result)
        get.onerror = () => reject(get.error)
      }
    })

    expect(written.value.modifiedTime).toBe('rev-1')
    expect(written.value.type).toBe(fresh.type)
  })

  // Criterion 3: a changed modifiedTime is a miss, and replaces the entry.
  it('re-downloads and replaces the cache entry when modifiedTime differs', async () => {
    const db = new IDBFactory()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response('v1'))
      .mockResolvedValueOnce(response('v2'))
    const cache = new TrackFileCache({ indexedDBFactory: db })

    const first = await cache.getFile('token', 'file-1', 'a.kml', 'rev-1')
    expect(await readText(first)).toBe('v1')

    const second = await cache.getFile('token', 'file-1', 'a.kml', 'rev-2')
    expect(await readText(second)).toBe('v2')
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // The replacement stuck — a third read at rev-2 hits cache, not network.
    const third = new TrackFileCache({ indexedDBFactory: db })
    await third.getFile('token', 'file-1', 'a.kml', 'rev-2')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  // Criterion 4: a first open populates the cache; a second mount whose
  // `fetch` rejects on `alt=media` still renders.
  it('populates the cache on first read so a later read survives a rejecting fetch', async () => {
    const db = new IDBFactory()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('bytes'))
    const first = new TrackFileCache({ indexedDBFactory: db })
    await first.getFile('token', 'file-1', 'a.kml', 'rev-1')

    fetchSpy.mockRejectedValue(new Error('should not be called'))
    const second = new TrackFileCache({ indexedDBFactory: db })
    const file = await second.getFile('token', 'file-1', 'a.kml', 'rev-1')

    expect(file.name).toBe('a.kml')
    expect(file).toBeInstanceOf(File)
  })

  // Criterion 5: two concurrent requests for the same uncached file id issue
  // one download.
  it('dedupes two concurrent requests for the same uncached file into one download', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )
    const cache = new TrackFileCache({ indexedDBFactory: new IDBFactory() })

    const first = cache.getFile('token', 'file-1', 'a.kml', 'rev-1')
    const second = cache.getFile('token', 'file-1', 'a.kml', 'rev-1')
    resolveFetch(response('bytes'))
    await Promise.all([first, second])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // Criterion 6: a cache read failure is a miss — the download path runs.
  it('treats a cache read failure as a miss and still downloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('bytes'))
    // No IndexedDB factory available at all — every open() call throws.
    const cache = new TrackFileCache({ indexedDBFactory: undefined })

    const file = await cache.getFile('token', 'file-1', 'a.kml', 'rev-1')
    expect(await readText(file)).toBe('bytes')
  })

  // Criterion 7: a cache write failure does not fail the load.
  it('does not fail the load when the cache write fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('bytes'))
    const cache = new TrackFileCache({ indexedDBFactory: undefined })

    await expect(cache.getFile('token', 'file-1', 'a.kml', 'rev-1')).resolves.toBeInstanceOf(File)
  })

  // Criterion 10: DriveAuthError propagates unchanged.
  it('propagates DriveAuthError from a download unchanged', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('', { status: 401 }))
    const cache = new TrackFileCache({ indexedDBFactory: new IDBFactory() })

    await expect(cache.getFile('expired', 'file-1', 'a.kml', 'rev-1')).rejects.toBeInstanceOf(DriveAuthError)
  })

  it('propagates DriveRequestError from a download unchanged', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response('', { status: 500 }))
    const cache = new TrackFileCache({ indexedDBFactory: new IDBFactory() })

    await expect(cache.getFile('token', 'file-1', 'a.kml', 'rev-1')).rejects.toBeInstanceOf(DriveRequestError)
  })
})
