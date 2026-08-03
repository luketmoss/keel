/* Acquires a photo marker's thumbnail Object URL through #53's cache and
   releases it on unmount or when the file id / token changes — the cache's
   hard rule (imageCache.ts's doc comment: "You MUST call release()"). Kept
   as its own hook so PhotoMarker doesn't duplicate this bookkeeping and so a
   test can mock `photoImageCache` directly without mounting a marker. */

import { useEffect, useState } from 'react'
import { photoImageCache, type PhotoImageCache } from './imageCache'

/** `undefined` while loading or on failure — design doc's "Photos loading"
    and "Thumbnail failed to load" states both render the same
    `--surface-lift` fallback fill, so the caller doesn't need to
    distinguish the two. */
export function usePhotoThumbnail(
  accessToken: string | null,
  fileId: string | undefined,
  cache: PhotoImageCache = photoImageCache,
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    setUrl(undefined)
    if (!accessToken || !fileId) return

    let cancelled = false
    let release: (() => void) | undefined

    cache
      .acquire(accessToken, fileId)
      .then((handle) => {
        if (cancelled) {
          handle.release()
          return
        }
        release = handle.release
        setUrl(handle.url)
      })
      .catch(() => {
        // Thumbnail failed to load — marker keeps its fallback fill
        // permanently (design doc edge case), not an error surfaced here.
      })

    return () => {
      cancelled = true
      release?.()
    }
  }, [accessToken, fileId, cache])

  return url
}
