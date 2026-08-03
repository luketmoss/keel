/* Acquires a photo's Object URL through #53's cache and releases it on
   unmount or when the file id / token changes — the cache's hard rule
   (imageCache.ts's doc comment: "You MUST call release()").

   Originally `usePhotoThumbnail`, generalized for #55: the cache doesn't
   care whether `fileId` is a thumbnail or an original, and the lightbox
   needs the same acquire/release lifecycle for the full-size image plus
   one thing the marker/list thumbnails never needed — a way to tell
   "still loading" apart from "failed" (design doc's "Original failed in
   the lightbox" state, criterion 11). Rather than duplicate the lifecycle
   logic in a second hook, this one now returns both `url` and `failed` and
   every caller (`PhotoLayer`, `PhotoList`, `Lightbox`) reads `.url`;
   `Lightbox` is the only one that also reads `.failed`. */

import { useEffect, useState } from 'react'
import { photoImageCache, type PhotoImageCache } from './imageCache'

export interface PhotoImageState {
  /** `undefined` while loading or on failure. */
  url?: string
  /** `true` once the acquire has settled and failed — distinct from
      "still loading", which `PhotoLayer`/`PhotoList` don't need to tell
      apart (both render the same `--surface-lift` fallback) but the
      lightbox does (criterion 11). */
  failed: boolean
}

export function usePhotoImage(
  accessToken: string | null,
  fileId: string | undefined,
  cache: PhotoImageCache = photoImageCache,
): PhotoImageState {
  const [state, setState] = useState<PhotoImageState>({ url: undefined, failed: false })

  useEffect(() => {
    setState({ url: undefined, failed: false })
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
        setState({ url: handle.url, failed: false })
      })
      .catch(() => {
        if (!cancelled) setState({ url: undefined, failed: true })
      })

    return () => {
      cancelled = true
      release?.()
    }
  }, [accessToken, fileId, cache])

  return state
}
