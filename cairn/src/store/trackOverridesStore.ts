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
      rejected/conflicted) — the caller reverts its optimistic UI update on
      `false`. Async for the same reason `TripStore.updateTrip` is: a
      Drive-backed implementation's write is a network call, and the
      optimistic value is visible through `getOverrides` immediately,
      before this promise settles. */
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
