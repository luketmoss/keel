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
      not present in `validDriveFileIds` first. Returns `false` if the write
      failed (e.g. `localStorage` quota exceeded) — the caller reverts its
      optimistic UI update on `false`. */
  setOverride(
    tripId: string,
    driveFileId: string,
    patch: TrackOverride,
    validDriveFileIds: string[],
  ): boolean
  /** Renumbers every track's `order` at once — a drag reorder always
      restates the full list rather than shifting one entry relative to its
      neighbours. */
  setOrder(tripId: string, orderedDriveFileIds: string[], validDriveFileIds: string[]): boolean
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
function isTrackOverrides(value: unknown): value is TrackOverrides {
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

  setOverride = (
    tripId: string,
    driveFileId: string,
    patch: TrackOverride,
    validDriveFileIds: string[],
  ): boolean => {
    const pruned = prune(this.getOverrides(tripId), validDriveFileIds)
    const next: TrackOverrides = {
      ...pruned,
      [driveFileId]: { ...pruned[driveFileId], ...patch },
    }
    return this.write(tripId, next)
  }

  setOrder = (
    tripId: string,
    orderedDriveFileIds: string[],
    validDriveFileIds: string[],
  ): boolean => {
    const next = prune(this.getOverrides(tripId), validDriveFileIds)
    orderedDriveFileIds.forEach((driveFileId, index) => {
      next[driveFileId] = { ...next[driveFileId], order: index }
    })
    return this.write(tripId, next)
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
