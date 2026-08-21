import { useState } from 'react'

/** The tiles the layers control offers. `hybrid` is deliberately absent —
    #263 turned it into the `labels` preference below, because Satellite and
    Hybrid were the same imagery differing only in whether Google drew
    writing on it. It survives as a `mapTypeId` (see `mapTypeId` below) and
    nowhere else. */
export const BASE_MAP_TYPES = ['roadmap', 'satellite', 'terrain'] as const

export type BaseMapType = (typeof BASE_MAP_TYPES)[number]

/** What actually goes to `<Map mapTypeId>` — the tile, unless it is
    Satellite with labels on, which is Google's `hybrid`. */
export type BaseMapTypeId = BaseMapType | 'hybrid'

const typeKey = 'cairn.baseMapType'
const labelsKey = 'cairn.baseMapLabels'

export interface BaseMapPreference {
  type: BaseMapType
  /** The *stored* preference, which is only what the map renders when the
      tile is Satellite: `roadmap` and `terrain` always carry Google's
      labels and cannot be made to drop them, so this value sits untouched
      while one of those is selected and comes back when Satellite does. */
  labels: boolean
  mapTypeId: BaseMapTypeId
  setType: (next: BaseMapType) => void
  setLabels: (next: boolean) => void
}

function isBaseMapType(value: unknown): value is BaseMapType {
  return typeof value === 'string' && (BASE_MAP_TYPES as readonly string[]).includes(value)
}

interface Stored {
  type: BaseMapType
  labels: boolean
}

// Nothing stored, or a stored value that isn't one of the three tiles (a
// future rename, a hand-edited value) both resolve to `satellite` with
// labels off — the app's behaviour before this control existed.
//
// `hybrid` is the exception, and the one case that must not fall through to
// the default: it is what is on the machine of anyone who picked that tile
// before #263 removed it, and it means Satellite with labels on. Landing
// them on labels-off would be this change silently altering their map.
function read(storage: Storage): Stored {
  const rawType = storage.getItem(typeKey)
  if (rawType === 'hybrid') return { type: 'satellite', labels: true }

  return {
    type: isBaseMapType(rawType) ? rawType : 'satellite',
    labels: storage.getItem(labelsKey) === 'true',
  }
}

/** Shared across every map surface — one preference, not one per surface,
    backed by `localStorage` like `trackOverridesStore.ts`. The two maps are
    never mounted at once (one route shows one or the other), so a `storage`
    event listener for cross-tab sync isn't a case that comes up. */
export function useBaseMapType(storage: Storage = window.localStorage): BaseMapPreference {
  const [stored, setStored] = useState<Stored>(() => read(storage))

  // Both keys go out on every change, not just the one that moved. That is
  // what retires a stored `hybrid`: it is normalised on read, and the next
  // change writes the normalised pair back, so the migration above stops
  // being load-bearing rather than living forever.
  function write(next: Stored) {
    setStored(next)
    try {
      storage.setItem(typeKey, next.type)
      storage.setItem(labelsKey, String(next.labels))
    } catch {
      // Same stance as `LocalTrackOverridesStore`: a failed write (quota,
      // private-browsing) keeps the in-memory selection for this session
      // rather than throwing.
    }
  }

  return {
    type: stored.type,
    labels: stored.labels,
    mapTypeId:
      stored.type === 'satellite' ? (stored.labels ? 'hybrid' : 'satellite') : stored.type,
    setType: (next) => write({ ...stored, type: next }),
    setLabels: (next) => write({ ...stored, labels: next }),
  }
}
