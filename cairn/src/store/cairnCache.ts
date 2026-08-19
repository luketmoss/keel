import type { CairnRecord } from '../photo/useCairnImport'

/* #243 — the local half of a trip's cairns, read synchronously on mount so
   reopening a trip renders its markers without waiting on Drive.

   `localStorage`, alongside `LocalTripStore` and `LocalLooseStore`, rather
   than IndexedDB: these are small JSON records, and matching the
   neighbouring stores is worth more than the headroom. The image *bytes*
   are already in IndexedDB via `photoImageCache` and stay there.

   Drive remains the source of truth. Nothing here is authoritative and
   nothing here is a write path — every entry is replaced wholesale by the
   next successful hydration, so a cache that is wrong is wrong until the
   read behind it settles and no longer than that. */

/** Same shape as `LocalTripStore`'s keys — per trip, so hydrating one trip
    can neither read nor evict another's (#243). */
export const cairnCacheKey = (tripId: string): string => `cairn.trips.cairns.${tripId}`

/** Moved here from `useCairnImport` so the cache and the Drive read validate
    with one function: a record that would be rejected coming from Drive has
    no business being served from a cache either. */
export function isCairnRecord(value: unknown): value is CairnRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return false
  if (typeof record.position !== 'object' || record.position === null) return false
  const position = record.position as Record<string, unknown>
  if (typeof position.lat !== 'number' || typeof position.lng !== 'number') return false
  return (
    record.positionSource === 'exif' ||
    record.positionSource === 'interpolated' ||
    record.positionSource === 'placed'
  )
}

/** The trip's cached cairns, or `null` for a miss — absent, unparseable, or
    holding anything that isn't a `CairnRecord`. A miss is not an error: the
    trip loads from Drive exactly as if it had never been cached.
 *
 * `null` and `[]` are different facts and the difference is the point. An
 * empty array is a trip we know has no cairns, and renders the empty state
 * immediately rather than sitting in Fetching until Drive confirms it
 * (`docs/design/243-cached-cairns.md`). */
export function readCachedCairns(tripId: string, storage: Storage = window.localStorage): CairnRecord[] | null {
  let raw: string | null
  try {
    raw = storage.getItem(cairnCacheKey(tripId))
  } catch {
    // A storage that refuses reads (private mode, disabled) is a miss.
    return null
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isCairnRecord)) return null
    return parsed
  } catch {
    return null
  }
}

/** Replaces the trip's cached set wholesale. A write that throws — quota,
    private mode — degrades to no caching rather than failing whatever
    prompted it, the stance `LocalTrackOverridesStore` and `photoImageCache`
    already take. */
export function writeCachedCairns(
  tripId: string,
  records: CairnRecord[],
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(cairnCacheKey(tripId), JSON.stringify(records))
  } catch {
    // No cache is a slower trip, not a broken one.
  }
}

/** Drops a trip's entry — called when the trip itself is deleted, so a new
    trip can never inherit a stale one. */
export function dropCachedCairns(tripId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(cairnCacheKey(tripId))
  } catch {
    // Same stance as `writeCachedCairns`.
  }
}
