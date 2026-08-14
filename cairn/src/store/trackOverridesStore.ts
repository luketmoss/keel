export interface TrackOverride {
  displayName?: string
  /** A `TRACK_COLORS` index (`src/map/palette.ts`), not a raw colour value —
      same representation as `ImportedFile.colorIndex`. */
  color?: number
  order?: number
}

export type TrackOverrides = Record<string, TrackOverride>

/* The seam #59's real Drive-backed storage swaps onto — mirrors `TrackStore`
   and `TripStore` in shape and intent. Keyed by trip id; each trip's record
   is itself keyed by the track's Drive file id, which is stable across
   reloads (`ImportedFile.id` is not — `useTripImport` regenerates it every
   mount). */
export interface TrackOverridesStore {
  getOverrides(tripId: string): TrackOverrides
  /** Merges `patch` into the override for `driveFileId`, pruning any entry
      not present in `validDriveFileIds` first. Resolves `false` if the
      write failed (e.g. `localStorage` quota exceeded, or a Drive write
      rejected/conflicted) **or** (#73) the store is disconnected, in which
      case the edit is refused up front and never applied locally — the
      caller reverts its optimistic UI update on `false` either way. Async
      for the same reason `TripStore.updateTrip` is: a Drive-backed
      implementation's write is a network call, and the optimistic value is
      visible through `getOverrides` immediately, before this promise
      settles. */
  setOverride(
    tripId: string,
    driveFileId: string,
    patch: TrackOverride,
    validDriveFileIds: string[],
  ): Promise<boolean>
  /** Renumbers every track's `order` at once — a drag reorder always
      restates the full list rather than shifting one entry relative to its
      neighbours. */
  setOrder(tripId: string, orderedDriveFileIds: string[], validDriveFileIds: string[]): Promise<boolean>
  /** Only meaningful for a Drive-backed implementation: hydrates one trip's
      overrides from Drive if a file already exists there (Drive wins), or
      migrates this trip's local-only overrides up to Drive if not.
      `LocalTrackOverridesStore` has nothing to connect to and doesn't
      implement this. */
  connect?(tripId: string, accessToken: string, folderId: string): Promise<void>
  /** Only meaningful for a Drive-backed implementation: drops the shared
      access token and every trip's Drive file refs, so a write attempted
      afterward cannot reach Drive. Whole-store rather than per-trip, unlike
      `connect` — the token itself is shared across every trip in a
      session, same as `DriveTripStore`'s single `credentials` field.
      `LocalTrackOverridesStore` has no credentials to drop and doesn't
      implement this. */
  disconnect?(): void
}

/** #150: gives a track that has just moved into `tripId` the name it was
    already carrying, as a display-name override on its new owner.
 *
 * A track's name is the trip's to store — `TrackOverrides` above, keyed by
 * Drive file id — so an ownership move has to write one, or the track
 * arrives showing whatever its file happens to be called and the name the
 * user gave it is gone.
 *
 * Two things here are easy to get wrong and both are silent:
 *
 * **Connect first.** `DriveTrackOverridesStore` connects per trip, when that
 * trip's detail view mounts, and the destination of a move usually has not
 * been open this session. Writing without connecting lands in `localStorage`
 * only, and the trip's next `connect` hydrates Drive's copy straight over the
 * top of it — Drive wins, by design — taking the new name with it.
 *
 * **Prune nothing.** `setOverride` prunes every entry outside the valid list
 * it is handed, and a move knows about exactly one track. The valid list is
 * therefore what the trip already holds *plus* the arriving track: pruning
 * belongs to the operations that can see the trip's whole track list, and
 * doing it from here would drop every other track's name and colour. */
export async function carryDisplayNameIntoTrip(
  store: TrackOverridesStore,
  tripId: string,
  driveFileId: string,
  displayName: string,
  credentials: { accessToken: string; folderId: string } | null,
): Promise<boolean> {
  if (credentials) {
    try {
      await store.connect?.(tripId, credentials.accessToken, credentials.folderId)
    } catch {
      // The write below still runs: it reaches `localStorage` either way,
      // and a name that syncs on the trip's next `connect` beats no name.
    }
  }
  const held = Object.keys(store.getOverrides(tripId))
  return store.setOverride(tripId, driveFileId, { displayName }, [...held, driveFileId])
}

const overridesKey = (tripId: string): string => `cairn.trips.trackOverrides.${tripId}`

function prune(overrides: TrackOverrides, validDriveFileIds: string[]): TrackOverrides {
  const valid = new Set(validDriveFileIds)
  const result: TrackOverrides = {}
  for (const [driveFileId, override] of Object.entries(overrides)) {
    if (valid.has(driveFileId)) result[driveFileId] = override
  }
  return result
}

// Corrupted or hand-edited storage reads back as "no overrides" rather than
// thrown — same stance `LocalTripStore` takes on its own storage reads.
// Exported for `DriveTrackOverridesStore`, which applies the same guard to
// data read back from a Drive `overrides.json`.
export function isTrackOverrides(value: unknown): value is TrackOverrides {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class LocalTrackOverridesStore implements TrackOverridesStore {
  constructor(private readonly storage: Storage = window.localStorage) {}

  getOverrides = (tripId: string): TrackOverrides => {
    const raw = this.storage.getItem(overridesKey(tripId))
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return isTrackOverrides(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  // `localStorage` writes are synchronous; the `Promise` wrapper exists only
  // to satisfy `TrackOverridesStore`'s async signature, needed for the
  // Drive-backed implementation.
  setOverride = async (
    tripId: string,
    driveFileId: string,
    patch: TrackOverride,
    validDriveFileIds: string[],
  ): Promise<boolean> => {
    const pruned = prune(this.getOverrides(tripId), validDriveFileIds)
    const next: TrackOverrides = {
      ...pruned,
      [driveFileId]: { ...pruned[driveFileId], ...patch },
    }
    return this.write(tripId, next)
  }

  setOrder = async (
    tripId: string,
    orderedDriveFileIds: string[],
    validDriveFileIds: string[],
  ): Promise<boolean> => {
    const next = prune(this.getOverrides(tripId), validDriveFileIds)
    orderedDriveFileIds.forEach((driveFileId, index) => {
      next[driveFileId] = { ...next[driveFileId], order: index }
    })
    return this.write(tripId, next)
  }

  /** Overwrites a trip's overrides wholesale rather than merging — used by
      `DriveTrackOverridesStore` both to hydrate from a Drive read and to
      revert to a known-good value after a failed flush, neither of which is
      "apply this one patch" the way `setOverride` is. */
  replaceAll(tripId: string, overrides: TrackOverrides): boolean {
    return this.write(tripId, overrides)
  }

  private write(tripId: string, overrides: TrackOverrides): boolean {
    try {
      this.storage.setItem(overridesKey(tripId), JSON.stringify(overrides))
      return true
    } catch {
      return false
    }
  }
}
