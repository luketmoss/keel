import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePhotoImage } from './usePhotoImage'
import type { PhotoImageCache } from './imageCache'

function fakeCache(overrides: Partial<PhotoImageCache> = {}): PhotoImageCache {
  return {
    acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release: vi.fn() }),
    ...overrides,
  } as unknown as PhotoImageCache
}

describe('usePhotoImage', () => {
  it('resolves to the cache-provided url once acquire settles', async () => {
    const cache = fakeCache()

    const { result } = renderHook(() => usePhotoImage('token', 'file-1', cache))

    await waitFor(() => expect(result.current.url).toBe('blob:fake'))
    expect(result.current.failed).toBe(false)
    expect(cache.acquire).toHaveBeenCalledWith('token', 'file-1')
  })

  it('stays undefined with no access token or no file id, and never calls acquire', () => {
    const cache = fakeCache()

    const { result: noToken } = renderHook(() => usePhotoImage(null, 'file-1', cache))
    expect(noToken.current.url).toBeUndefined()
    expect(noToken.current.failed).toBe(false)

    const { result: noFile } = renderHook(() => usePhotoImage('token', undefined, cache))
    expect(noFile.current.url).toBeUndefined()

    expect(cache.acquire).not.toHaveBeenCalled()
  })

  it('reports failed rather than throwing when the cache rejects (thumbnail-failed edge case)', async () => {
    const cache = fakeCache({ acquire: vi.fn().mockRejectedValue(new Error('nope')) })

    const { result } = renderHook(() => usePhotoImage('token', 'file-1', cache))

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.url).toBeUndefined()
  })

  it('calls release on unmount (imageCache.ts hard rule)', async () => {
    const release = vi.fn()
    const cache = fakeCache({ acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release }) })

    const { result, unmount } = renderHook(() => usePhotoImage('token', 'file-1', cache))
    await waitFor(() => expect(result.current.url).toBe('blob:fake'))

    unmount()

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases the previous handle and acquires a new one when the file id changes', async () => {
    const releaseA = vi.fn()
    const releaseB = vi.fn()
    const acquire = vi
      .fn()
      .mockResolvedValueOnce({ url: 'blob:a', release: releaseA })
      .mockResolvedValueOnce({ url: 'blob:b', release: releaseB })
    const cache = fakeCache({ acquire })

    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => usePhotoImage('token', fileId, cache),
      { initialProps: { fileId: 'file-a' } },
    )
    await waitFor(() => expect(result.current.url).toBe('blob:a'))

    act(() => rerender({ fileId: 'file-b' }))

    expect(releaseA).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.url).toBe('blob:b'))
  })

  it('resets to loading state when the file id changes, abandoning the in-flight request for the old one', async () => {
    let resolveFirst: (value: { url: string; release: () => void }) => void = () => {}
    const acquire = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({ url: 'blob:b', release: vi.fn() })
    const cache = fakeCache({ acquire })

    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => usePhotoImage('token', fileId, cache),
      { initialProps: { fileId: 'file-a' } },
    )

    act(() => rerender({ fileId: 'file-b' }))
    await waitFor(() => expect(result.current.url).toBe('blob:b'))

    // The abandoned first acquire resolving late must not clobber the
    // now-current photo's url (rapid-arrow-press edge case).
    act(() => resolveFirst({ url: 'blob:a', release: vi.fn() }))
    expect(result.current.url).toBe('blob:b')
  })
})
