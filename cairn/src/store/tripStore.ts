import type { FeatureCollection, LineString } from 'geojson'
import type { Track } from '../kml/parse'
import { buildOverviewGeoJSON } from '../geo/overview'

export type TripStatus = 'planned' | 'completed'

/** The full record for one trip. Rename, status changes, and notes editing
    are #35's job — this issue only ever writes `name`, `status` and
    `createdAt`, but the shape includes the fields #35 will need so the swap
    to a Drive-backed implementation doesn't reshape data written today. */
export interface TripRecord {
  id: string
  name: string
  status: TripStatus
  startDate: string | null
  endDate: string | null
  notes: string
  createdAt: string
}

/** The fields #35's metadata header can edit. `id` and `createdAt` are
    immutable once a trip exists. */
export interface TripUpdate {
  name?: string
  status?: TripStatus
  startDate?: string | null
  endDate?: string | null
  notes?: string
}

/** What the list reads. A cache, not the truth — see the store's
    "corrupted index" handling below — so it carries only what a row
    renders, not the full record. */
export interface TripIndexEntry {
  id: string
  name: string
  status: TripStatus
  startDate: string | null
  endDate: string | null
  createdAt: string
}

/* The seam a future Drive-backed store's async reads/writes hook into:
   consumers depend only on this interface, never on a concrete
   implementation, so swapping local storage for Drive touches this module
   and nothing else. Mirrors `TrackStore` (#31) in shape and intent. */
export interface TripStore {
  getTrips(): TripIndexEntry[]
  /** The full record for one trip — what #35's detail view reads, including
      `notes`, which the index deliberately omits. `null` for an id that
      doesn't exist (deleted, or never created). */
  getTrip(id: string): TripRecord | null
  createTrip(name: string): TripIndexEntry
  /** Applies a partial edit and returns the resulting record, or `null` if
      `id` no longer names a trip (deleted out from under an open detail
      view), the write failed after already applying locally — a
      Drive-backed implementation reverts its local copy before resolving
      `null`, so a caller never has to distinguish "not found" from "save
      failed" to know it should show the revert — **or** (#73) the store is
      disconnected, in which case the edit is refused up front and never
      applied locally at all. Async because a real
      implementation is a network write, not a `localStorage.setItem`; the
      local (optimistic) value is visible through `getTrip`/`subscribe`
      immediately, before this promise settles — see #35's "shows read-mode
      display immediately, reverts on failure" contract, which this signature
      exists to support. Same object reference is returned by `getTrip`
      until the next mutation, so `useSyncExternalStore` doesn't see a
      change that isn't there. */
  updateTrip(id: string, patch: TripUpdate): Promise<TripRecord | null>
  /** Deletes the trip locally and, once connected, trashes its Drive
      folder. (#73) A Drive-backed implementation refuses this outright
      while disconnected rather than removing only the local copy — a
      delete that can't reach Drive would otherwise resurrect the trip the
      next time hydration runs. */
  deleteTrip(id: string): void
  /** The trip's precomputed overview geometry (#36's `buildOverviewGeoJSON`
      output) — what `/world` (#37) reads, never a trip's source tracks.
      `null` when the trip has never had a track set saved, when its last
      saved set produced no geometry (no tracks, or all-empty tracks), or
      when the stored value can't be read back — every one of those cases
      is "nothing to draw" to a caller, and none of them is worth a thrown
      error over. */
  getOverview(id: string): FeatureCollection<LineString> | null
  /** Recomputes and persists a trip's overview from its current tracks.
      The regeneration contract `geo/overview.ts` describes: called by
      whatever owns a trip's track set, whenever that set changes. Pure
      w.r.t. the tracks given — same tracks in, same stored geometry out. */
  saveOverview(id: string, tracks: Track[]): void
  /** Notified after any mutation. Returns an unsubscribe function — the
      shape `useSyncExternalStore` expects directly. */
  subscribe(listener: () => void): () => void
  /** Only meaningful for a Drive-backed implementation: hydrates every
      trip's index entry and overview from Drive (Drive wins over any local
      copy of a trip that exists in both), then migrates any trip that
      exists only locally up to Drive. `LocalTripStore` has nothing to
      connect to and simply doesn't implement this — callers that always
      have a `TripStore` rather than a concrete class use `store.connect?.()`. */
  connect?(accessToken: string, cairnFolderId: string): Promise<void>
  /** Only meaningful for a Drive-backed implementation: drops credentials
      and every trip's Drive file refs, so a mutation attempted afterward
      cannot reach Drive. Pairs with `connect` but isn't just its opposite —
      reading is unaffected, since #73's rule is "disconnected is
      read-only", not "disconnected is offline". `LocalTripStore` has no
      credentials to drop and simply doesn't implement this. */
  disconnect?(): void
}

const INDEX_KEY = 'cairn.trips.index'
const recordKey = (id: string): string => `cairn.trips.trip.${id}`
const overviewKey = (id: string): string => `cairn.trips.overview.${id}`

function generateId(): string {
  return `trip-${crypto.randomUUID()}`
}

/* Local-only implementation: one record per trip plus a lightweight index
   the list reads instead of loading every trip. `DriveTripStore` (#59) is
   the Drive-backed sibling — it composes an instance of this class as its
   synchronous local cache and adds the network layer (and the `If-Match`/
   etag concurrency check, meaningless for a single-writer local store) on
   top, rather than duplicating the record/index bookkeeping here. */
export class LocalTripStore implements TripStore {
  private index: TripIndexEntry[]
  /** Cache of full records already read from storage, keyed by id — so
      `getTrip` returns the same reference across renders until a mutation
      actually changes it, rather than a freshly-parsed object every call
      (which would make `useSyncExternalStore` re-render forever). */
  private readonly records = new Map<string, TripRecord>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Storage = window.localStorage) {
    this.index = this.readIndex()
  }

  getTrips = (): TripIndexEntry[] => {
    return this.index
  }

  getTrip = (id: string): TripRecord | null => {
    const cached = this.records.get(id)
    if (cached) return cached

    const raw = this.storage.getItem(recordKey(id))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (!isTripRecord(parsed)) return null
      this.records.set(id, parsed)
      return parsed
    } catch {
      return null
    }
  }

  createTrip = (name: string): TripIndexEntry => {
    const trimmed = name.trim()
    const record: TripRecord = {
      id: generateId(),
      name: trimmed,
      status: 'planned',
      startDate: null,
      endDate: null,
      notes: '',
      createdAt: new Date().toISOString(),
    }
    const entry: TripIndexEntry = {
      id: record.id,
      name: record.name,
      status: record.status,
      startDate: record.startDate,
      endDate: record.endDate,
      createdAt: record.createdAt,
    }
    this.records.set(record.id, record)
    this.writeRecord(record)
    // Newest-created trip at the top — a trips list is revisited over
    // weeks, unlike the track list's import-order stance (#6).
    this.index = [entry, ...this.index]
    this.writeIndex()
    this.notify()
    return entry
  }

  /** `localStorage` writes are synchronous, so this always resolves
      immediately — the `Promise` wrapper exists only to satisfy `TripStore`,
      whose async signature is there for the Drive-backed implementation.
      Behaviourally identical to a synchronous update: still resolves before
      the microtask queue does anything else. */
  updateTrip = async (id: string, patch: TripUpdate): Promise<TripRecord | null> => {
    return this.updateTripSync(id, patch)
  }

  private updateTripSync(id: string, patch: TripUpdate): TripRecord | null {
    const current = this.getTrip(id)
    if (!current) return null

    // An empty name is an aborted edit, not a saved one — matches the
    // design doc's "commit nothing" rule rather than writing a blank name.
    const next: TripRecord = {
      ...current,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    }

    this.records.set(id, next)
    this.writeRecord(next)
    this.index = this.index.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            name: next.name,
            status: next.status,
            startDate: next.startDate,
            endDate: next.endDate,
          }
        : entry,
    )
    this.writeIndex()
    this.notify()
    return next
  }

  /** Seeds (or overwrites) the local cache with a record read from Drive,
      under its own id rather than a freshly generated one — used only by a
      Drive-backed implementation's hydration pass. Inserts into the index
      if the id is new, replaces in place if not, and always re-sorts
      newest-`createdAt`-first afterward, since hydration can arrive in
      whatever order Drive listed the trip folders in. */
  hydrate(record: TripRecord): void {
    this.records.set(record.id, record)
    this.writeRecord(record)
    const entry: TripIndexEntry = {
      id: record.id,
      name: record.name,
      status: record.status,
      startDate: record.startDate,
      endDate: record.endDate,
      createdAt: record.createdAt,
    }
    const withoutExisting = this.index.filter((e) => e.id !== record.id)
    this.index = [...withoutExisting, entry].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    this.writeIndex()
    this.notify()
  }

  /** Seeds the local overview cache from Drive — the hydration counterpart
      to `hydrate` above, kept separate since a trip can hydrate before its
      overview is known (or have no overview yet). */
  hydrateOverview(id: string, overview: FeatureCollection<LineString>): void {
    this.storage.setItem(overviewKey(id), JSON.stringify(overview))
    this.notify()
  }

  deleteTrip = (id: string): void => {
    this.index = this.index.filter((entry) => entry.id !== id)
    this.writeIndex()
    this.storage.removeItem(recordKey(id))
    this.storage.removeItem(overviewKey(id))
    this.records.delete(id)
    this.notify()
  }

  getOverview = (id: string): FeatureCollection<LineString> | null => {
    const raw = this.storage.getItem(overviewKey(id))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (!isFeatureCollection(parsed)) return null
      return parsed
    } catch {
      return null
    }
  }

  saveOverview = (id: string, tracks: Track[]): void => {
    const overview = buildOverviewGeoJSON(tracks)
    this.storage.setItem(overviewKey(id), JSON.stringify(overview))
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private writeIndex(): void {
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.index))
  }

  private writeRecord(record: TripRecord): void {
    this.storage.setItem(recordKey(record.id), JSON.stringify(record))
  }

  // A broken or unreadable index (manually edited, quota exceeded, a future
  // migration mismatch) is indistinguishable from "no trips" without a
  // dedicated recovery flow this issue doesn't build — treated as empty
  // rather than thrown.
  private readIndex(): TripIndexEntry[] {
    const raw = this.storage.getItem(INDEX_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isTripIndexEntry)
    } catch {
      return []
    }
  }
}

function isTripIndexEntry(value: unknown): value is TripIndexEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    (entry.status === 'planned' || entry.status === 'completed')
  )
}

// Same "corrupted is missing, not thrown" stance as the index/record guards
// above — a hand-edited or partially-written value just reads back as "no
// overview yet" rather than surfacing a parse error to `/world`. Exported
// for `DriveTripStore`, which applies the same guard to a `overview.geojson`
// read back from Drive.
export function isFeatureCollection(value: unknown): value is FeatureCollection<LineString> {
  if (typeof value !== 'object' || value === null) return false
  const collection = value as Record<string, unknown>
  return collection.type === 'FeatureCollection' && Array.isArray(collection.features)
}

// A record written by an older shape, or corrupted by hand, is treated as
// missing rather than thrown — same stance as the index above. Exported for
// `DriveTripStore`, which applies the same guard to a `trip.json` read back
// from Drive.
export function isTripRecord(value: unknown): value is TripRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    (record.status === 'planned' || record.status === 'completed') &&
    (record.startDate === null || typeof record.startDate === 'string') &&
    (record.endDate === null || typeof record.endDate === 'string') &&
    typeof record.notes === 'string' &&
    typeof record.createdAt === 'string'
  )
}
