import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePhotoThumbnail } from './usePhotoThumbnail'
import type { PhotoImageCache } from './imageCache'

function fakeCache(overrides: Partial<PhotoImageCache> = {}): PhotoImageCache {
  return {
    acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release: vi.fn() }),
    ...overrides,
  } as unknown as PhotoImageCache
}

describe('usePhotoThumbnail', () => {
  it('resolves to the cache-provided url once acquire settles', async () => {
    const cache = fakeCache()

    const { result } = renderHook(() => usePhotoThumbnail('token', 'file-1', cache))

    await waitFor(() => expect(result.current).toBe('blob:fake'))
    expect(cache.acquire).toHaveBeenCalledWith('token', 'file-1')
  })

  it('stays undefined with no access token or no file id, and never calls acquire', () => {
    const cache = fakeCache()

    const { result: noToken } = renderHook(() => usePhotoThumbnail(null, 'file-1', cache))
    expect(noToken.current).toBeUndefined()

    const { result: noFile } = renderHook(() => usePhotoThumbnail('token', undefined, cache))
    expect(noFile.current).toBeUndefined()

    expect(cache.acquire).not.toHaveBeenCalled()
  })

  it('stays undefined when the cache rejects, rather than throwing (thumbnail-failed edge case)', async () => {
    const cache = fakeCache({ acquire: vi.fn().mockRejectedValue(new Error('nope')) })

    const { result } = renderHook(() => usePhotoThumbnail('token', 'file-1', cache))

    await waitFor(() => expect(cache.acquire).toHaveBeenCalled())
    expect(result.current).toBeUndefined()
  })

  it('calls release on unmount (imageCache.ts hard rule)', async () => {
    const release = vi.fn()
    const cache = fakeCache({ acquire: vi.fn().mockResolvedValue({ url: 'blob:fake', release }) })

    const { result, unmount } = renderHook(() => usePhotoThumbnail('token', 'file-1', cache))
    await waitFor(() => expect(result.current).toBe('blob:fake'))

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
      ({ fileId }: { fileId: string }) => usePhotoThumbnail('token', fileId, cache),
      { initialProps: { fileId: 'file-a' } },
    )
    await waitFor(() => expect(result.current).toBe('blob:a'))

    act(() => rerender({ fileId: 'file-b' }))

    expect(releaseA).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current).toBe('blob:b'))
  })
})
