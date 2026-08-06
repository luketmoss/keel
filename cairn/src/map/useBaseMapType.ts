import { useState } from 'react'

export const BASE_MAP_TYPES = ['roadmap', 'satellite', 'hybrid', 'terrain'] as const

export type BaseMapType = (typeof BASE_MAP_TYPES)[number]

const storageKey = 'cairn.baseMapType'

function isBaseMapType(value: unknown): value is BaseMapType {
  return typeof value === 'string' && (BASE_MAP_TYPES as readonly string[]).includes(value)
}

// Nothing stored, or a stored value that isn't one of the four valid
// strings (a future rename, a hand-edited value) both resolve to
// `satellite` — the app's behaviour before this control existed.
function read(storage: Storage): BaseMapType {
  const raw = storage.getItem(storageKey)
  return isBaseMapType(raw) ? raw : 'satellite'
}

/** Shared across `MapView` and `WorldMap` — one preference, not one per
    surface, backed by `localStorage` like `trackOverridesStore.ts`. The two
    maps are never mounted at once (one route shows one or the other), so a
    `storage` event listener for cross-tab sync isn't a case that comes up. */
export function useBaseMapType(storage: Storage = window.localStorage): [BaseMapType, (next: BaseMapType) => void] {
  const [baseMapType, setBaseMapType] = useState<BaseMapType>(() => read(storage))

  function set(next: BaseMapType) {
    setBaseMapType(next)
    try {
      storage.setItem(storageKey, next)
    } catch {
      // Same stance as `LocalTrackOverridesStore`: a failed write (quota,
      // private-browsing) keeps the in-memory selection for this session
      // rather than throwing.
    }
  }

  return [baseMapType, set]
}
