import type { FeatureCollection, LineString } from 'geojson'
import type { Track } from '../kml/parse'
import { buildOverviewGeoJSON, computeTripOrigin } from '../geo/overview'
import { isFeatureCollection } from './tripStore'
import { formatDistance, formatElevationGain } from '../format/units'
import type { LatLng } from '../map/geo'

/* A track or a photo that no trip owns.
 *
 * The model is normative in `cairn/docs/design/shell-and-content-model.md`:
 * a track or photo is **loose** when no trip owns it and **owned** when one
 * does, and that is the only distinction — no field other than ownership
 * changes when it moves. Which is why there is no `tripId` here: an owned
 * item is not a loose record with a trip attached, it is simply not in this
 * store. Ownership is where the file lives. */

export type LooseKind = 'track' | 'photo'

/** Where the item's file actually is, per #120's design note.
 *
 * `pending` is not "about to upload" — it is **nothing has been attempted**,
 * which is the state every record written before this issue starts in. It
 * renders as an ordinary row, silently, because a user who took no action
 * should not open the app to a column of progress. `uploading` is this
 * session's own import and says so; `failed` is the only one that shows
 * `not on Drive`, because by then something really was tried and really did
 * not work. */
export type LooseUploadState = 'pending' | 'uploading' | 'ok' | 'failed'

interface LooseRecordBase {
  id: string
  name: string
  createdAt: string
  uploadState: LooseUploadState
}

export interface LooseTrackRecord extends LooseRecordBase {
  kind: 'track'
  /** The track's own date, from its first timestamped point. `null` for a
      KML with no times — the row then shows only its stats. */
  date: string | null
  distanceMeters: number
  /** `null` when the source has no elevation data at all, which is not the
      same as a flat track. */
  ascentMeters: number | null
  pointCount: number
  sourceName: string
  /** Index into `map/palette` — a loose track carries its own colour, and
      its marker and its route are drawn in it. */
  colorIndex: number
  /** First point of its geometry. A track always has one, so this is only
      `null` for a track whose geometry failed to parse. */
  position: LatLng | null
  /** The source KML/KMZ in Drive. Stored to be *moved* and exported, never
      to be drawn from — the performance rule covers loose tracks, so the
      map reads `overview.geojson` and nothing reads this until the item
      changes hands. */
  driveFileId: string | null
}

export interface LoosePhotoRecord extends LooseRecordBase {
  kind: 'photo'
  /** What the row shows: GPS time when there is one, capture time
      otherwise. Derived on import from the two fields below, which are kept
      alongside it rather than replaced by it — #50 keeps them distinct, and
      a photo does not stop being subject to that because it spent a week
      outside a trip. A move into a trip carries both through. */
  takenAt: string | null
  gpsTimestamp?: string
  dateTimeOriginal?: string
  /** EXIF GPS, or `null`. **A loose photo with no GPS cannot be placed** —
      #52's interpolation needs tracks to interpolate against and a loose
      photo has none. It lists, it does not draw, and its detail says how to
      fix that. */
  position: LatLng | null
  /** Both, or neither. A photo whose original uploaded and whose thumbnail
      did not is `failed`, not half-present — the same answer #110 gave the
      half-moved item. */
  originalDriveFileId: string | null
  thumbnailDriveFileId: string | null
}

export type LooseRecord = LooseTrackRecord | LoosePhotoRecord

export interface NewLooseTrack {
  name: string
  date: string | null
  distanceMeters: number
  ascentMeters: number | null
  pointCount: number
  sourceName: string
  colorIndex: number
  position: LatLng | null
  driveFileId?: string | null
}

/** #133: the fields a loose item's `⋮` can edit. `colorIndex` is
    meaningful for a track only — a photo's marker is its thumbnail, not a
    palette entry — and is simply ignored if ever sent for one. */
export interface LooseUpdate {
  name?: string
  colorIndex?: number
}

export interface NewLoosePhoto {
  name: string
  takenAt: string | null
  gpsTimestamp?: string
  dateTimeOriginal?: string
  position: LatLng | null
  originalDriveFileId?: string | null
  thumbnailDriveFileId?: string | null
  /** EXIF orientation, for the thumbnail a Drive-backed store generates.
      Import-time information rather than a property of the photo, so it is
      an input here and never reaches the record — the same relationship
      `tracks` has to a track. */
  orientation?: number
}

/* The same interface seam `TripStore` provides, for the same reason:
   consumers depend on this and never on a concrete implementation, so the
   Drive-backed sibling is a swap rather than a rewrite. */
export interface LooseStore {
  /** Newest first, both kinds in one list — the panel filters by kind, it
      does not read two stores. */
  getItems(): LooseRecord[]
  getItem(id: string): LooseRecord | null
  /** `source` is the dropped file itself. `LocalLooseStore` ignores it;
      a Drive-backed implementation has nothing to upload without it, which
      is the one place this seam was missing an argument — #110 kept the
      record and discarded the bytes. */
  addTrack(input: NewLooseTrack, tracks: Track[], source?: File): LooseTrackRecord
  addPhoto(input: NewLoosePhoto, source?: File): LoosePhotoRecord
  /** Destroys it, in Drive as well as here. `Remove from trip` is the
      *other* direction and does not come through here — an owned item is
      not in this store to begin with. */
  remove(id: string): Promise<void>
  /** Drops the record and leaves Drive alone. What an ownership move uses
      once the files have relocated: the item is no longer loose, and its
      files are somewhere this store must not trash. */
  forget(id: string): void
  /** Relocates the item's file(s) into `tripId`'s folder and, for a photo,
      records it in that trip's `photos.json`. Resolves `false` if the move
      could not be completed, in which case nothing has changed — the item
      is still loose and its files are still where they were. A local-only
      store has no files to move and resolves `true`. */
  moveIntoTrip(id: string, tripId: string): Promise<boolean>
  /** The reverse: takes a file that is currently inside `tripId`'s folder
      and moves it into the loose folder of the item already created for it
      under `id`. Resolves `false` on failure, leaving the file in the trip. */
  claimFromTrip(id: string, tripId: string): Promise<boolean>
  /** #133: renames or recolours a loose item. Applied to the local cache
      immediately — visible through `getItem`/`subscribe` before this
      promise settles — and resolves `false` if `id` names nothing, the
      write failed, or (#73) the store is disconnected, in which case the
      edit is refused up front and never applied locally. A Drive-backed
      implementation reverts its local copy before resolving `false`, so a
      caller never has to distinguish "not found" from "save failed" to
      know it should show the revert. An empty or whitespace-only `name`
      is treated as no rename — the same rule `TripStore.updateTrip`
      already applies. */
  update(id: string, patch: LooseUpdate): Promise<boolean>
  /** The loose track's precomputed simplified geometry. cairn's `CLAUDE.md`
      performance rule covers loose tracks too: the map reads this, never a
      source KML. */
  getOverview(id: string): FeatureCollection<LineString> | null
  saveOverview(id: string, tracks: Track[]): void
  subscribe(listener: () => void): () => void
  /** Only meaningful for a Drive-backed implementation — see `TripStore`. */
  connect?(accessToken: string, cairnFolderId: string): Promise<void>
  disconnect?(): void
}

/* Ownership moves are deliberately *not* composed inside the store. Moving
   an item into a trip needs both stores — the loose record leaves this one
   and its geometry joins the trip's — and putting that behind a method on
   either would give one store a reference to the other. What the store does
   own is the half only it can do: relocating the files it uploaded.
   `moveLooseIntoTrip` below drives both sides explicitly. */

/** #110's copy for a move that did not happen, in either direction. One
    constant because both ends show it and a second spelling of the same
    sentence is a second sentence to keep in step. */
export const MOVE_FAILED_MESSAGE = "Couldn't move — still on the map."

/** #120's copy for a drop the app will not take because there is nowhere to
    put it. One toast for the batch, not one per file — the reason is the
    same for all of them, per #75. */
export const SIGNED_OUT_DROP_MESSAGE = 'Sign in to keep tracks and photos.'

const INDEX_KEY = 'cairn.loose.index'
const overviewKey = (id: string): string => `cairn.loose.overview.${id}`

function generateId(kind: LooseKind): string {
  return `${kind}-${crypto.randomUUID()}`
}

/** Local-only implementation. `DriveLooseStore` composes one of these as
    its synchronous cache and adds the network layer on top, exactly as
    `DriveTripStore` does with `LocalTripStore`. */
export class LocalLooseStore implements LooseStore {
  private index: LooseRecord[]
  private readonly listeners = new Set<() => void>()

  constructor(private readonly storage: Storage = window.localStorage) {
    this.index = this.readIndex()
  }

  getItems = (): LooseRecord[] => this.index

  getItem = (id: string): LooseRecord | null => this.index.find((item) => item.id === id) ?? null

  addTrack = (input: NewLooseTrack, tracks: Track[]): LooseTrackRecord => {
    const record: LooseTrackRecord = {
      kind: 'track',
      id: generateId('track'),
      createdAt: new Date().toISOString(),
      uploadState: 'pending',
      driveFileId: input.driveFileId ?? null,
      name: input.name,
      date: input.date,
      distanceMeters: input.distanceMeters,
      ascentMeters: input.ascentMeters,
      pointCount: input.pointCount,
      sourceName: input.sourceName,
      colorIndex: input.colorIndex,
      position: input.position,
    }
    this.insert(record)
    // Written on the way in rather than on first read: the performance rule
    // is that the map never touches a source KML, and a lazily-built
    // overview would mean it does, once, for every track.
    this.writeOverview(record.id, tracks)
    this.notify()
    return record
  }

  addPhoto = (input: NewLoosePhoto): LoosePhotoRecord => {
    const record: LoosePhotoRecord = {
      kind: 'photo',
      id: generateId('photo'),
      createdAt: new Date().toISOString(),
      uploadState: 'pending',
      originalDriveFileId: input.originalDriveFileId ?? null,
      thumbnailDriveFileId: input.thumbnailDriveFileId ?? null,
      name: input.name,
      takenAt: input.takenAt,
      ...(input.gpsTimestamp !== undefined ? { gpsTimestamp: input.gpsTimestamp } : {}),
      ...(input.dateTimeOriginal !== undefined ? { dateTimeOriginal: input.dateTimeOriginal } : {}),
      position: input.position,
    }
    this.insert(record)
    this.notify()
    return record
  }

  /** Local-only: there is nothing in Drive to trash, so destroying and
      forgetting are the same operation. Async to satisfy `LooseStore`,
      whose signature exists for the Drive-backed sibling. */
  remove = async (id: string): Promise<void> => {
    this.forget(id)
  }

  forget = (id: string): void => {
    this.index = this.index.filter((item) => item.id !== id)
    this.writeIndex()
    this.storage.removeItem(overviewKey(id))
    this.notify()
  }

  /** No files to move, so the move trivially succeeds and the caller's
      remaining bookkeeping (the trip's geometry, forgetting the record) is
      exactly what it was before this store learned about Drive. */
  moveIntoTrip = async (): Promise<boolean> => true

  claimFromTrip = async (): Promise<boolean> => true

  /** `localStorage` writes are synchronous; the `Promise` wrapper exists
      only to satisfy `LooseStore`'s async signature, needed for the
      Drive-backed implementation. */
  update = async (id: string, patch: LooseUpdate): Promise<boolean> => {
    const current = this.index.find((item) => item.id === id)
    if (!current) return false

    // Empty commits nothing — the same rule `LocalTripStore.updateTripSync`
    // already applies to a trip's name: an aborted edit, not a saved one.
    const name = patch.name !== undefined ? patch.name.trim() || current.name : current.name
    const next: LooseRecord =
      patch.colorIndex !== undefined && current.kind === 'track'
        ? { ...current, name, colorIndex: patch.colorIndex }
        : { ...current, name }

    this.index = this.index.map((item) => (item.id === id ? next : item))
    this.writeIndex()
    this.notify()
    return true
  }

  getOverview = (id: string): FeatureCollection<LineString> | null => {
    const raw = this.storage.getItem(overviewKey(id))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return isFeatureCollection(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  saveOverview = (id: string, tracks: Track[]): void => {
    this.writeOverview(id, tracks)
    this.notify()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Seeds the cache with a record read from Drive, under its own id.
      Replaces in place if the id is already known, and always re-sorts
      newest first — hydration arrives in whatever order Drive listed. */
  hydrate(record: LooseRecord): void {
    this.index = [...this.index.filter((item) => item.id !== record.id), record].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    this.writeIndex()
    this.notify()
  }

  hydrateOverview(id: string, overview: FeatureCollection<LineString>): void {
    this.storage.setItem(overviewKey(id), JSON.stringify(overview))
    this.notify()
  }

  /** Moves one record between upload states, replacing the record object so
      `useSyncExternalStore` sees the change. A no-op when the state already
      matches, so a flush that resolves to what is already stored does not
      re-render the list. */
  setUploadState(id: string, uploadState: LooseUploadState, driveIds?: Partial<LooseRecord>): void {
    const current = this.index.find((item) => item.id === id)
    if (!current) return
    if (current.uploadState === uploadState && driveIds === undefined) return
    this.index = this.index.map((item) =>
      item.id === id ? ({ ...item, ...driveIds, uploadState } as LooseRecord) : item,
    )
    this.writeIndex()
    this.notify()
  }

  private insert(record: LooseRecord): void {
    // Newest first, same stance as the trips list: a map of things you have
    // collected is revisited over weeks.
    this.index = [record, ...this.index]
    this.writeIndex()
  }

  private writeOverview(id: string, tracks: Track[]): void {
    this.storage.setItem(overviewKey(id), JSON.stringify(buildOverviewGeoJSON(tracks)))
    const position = computeTripOrigin(tracks)
    this.index = this.index.map((item) =>
      item.id === id && item.kind === 'track' ? { ...item, position } : item,
    )
    this.writeIndex()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private writeIndex(): void {
    this.storage.setItem(INDEX_KEY, JSON.stringify(this.index))
  }

  // Same "corrupted is missing, not thrown" stance as `LocalTripStore`.
  private readIndex(): LooseRecord[] {
    const raw = this.storage.getItem(INDEX_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isLooseRecord).map(readUploadState)
    } catch {
      return []
    }
  }
}

/** What a stored `uploadState` means on the way back in.
 *
 * A record written before this issue has none: it has never been attempted,
 * which is `pending`. A record stored mid-upload has `uploading`, and the
 * session that was doing the uploading is gone — nothing is in flight any
 * more, so it reads back as `failed` rather than as a row that says
 * `uploading…` forever. */
function readUploadState(record: LooseRecord): LooseRecord {
  const stored = record.uploadState
  if (stored === 'ok' || stored === 'failed') return record
  return { ...record, uploadState: stored === 'uploading' ? 'failed' : 'pending' }
}

export function isLooseRecord(value: unknown): value is LooseRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return false
  if (typeof record.createdAt !== 'string') return false
  return record.kind === 'track' || record.kind === 'photo'
}

/** Moves a loose item into a trip.
 *
 * The item's files relocate into the trip's folder, its geometry joins the
 * trip's overview, and only then does the record leave this store — so the
 * trip's dot, its count and its route all account for it and the top-level
 * list and map no longer do. Resolves `false` — leaving the item exactly
 * where it was — if the id names nothing or the relocation failed.
 *
 * The record only leaves once the trip's side has been written. A
 * half-moved item that belongs to nothing is worse than a move that
 * visibly did not happen. */
export async function moveLooseIntoTrip(
  looseStore: LooseStore,
  tripSide: {
    getOverview(id: string): FeatureCollection<LineString> | null
    saveOverview(id: string, tracks: Track[]): void
  },
  itemId: string,
  tripId: string,
): Promise<boolean> {
  const item = looseStore.getItem(itemId)
  if (!item) return false

  // The files first: everything below is bookkeeping about where they are,
  // and doing it against files that did not move is how an item ends up
  // belonging to nothing.
  if (!(await looseStore.moveIntoTrip(itemId, tripId))) return false

  if (item.kind === 'track') {
    // Reconstructed into tracks and handed to the trip store's existing
    // `saveOverview` rather than writing GeoJSON straight in — that is the
    // one function allowed to persist a trip's geometry, and it is also
    // what recomputes the trip's dot. Re-simplifying already-simplified
    // geometry costs nothing and keeps the write on one path.
    //
    // The trip's own track list does not need this: the KML is in its
    // folder now, so opening the trip reads the real file. This is what
    // keeps the trip's dot right for a trip nobody has opened yet.
    const merged = [
      ...overviewToTracks(tripSide.getOverview(tripId)),
      ...overviewToTracks(looseStore.getOverview(itemId), item.name),
    ]
    tripSide.saveOverview(tripId, merged)
  }

  looseStore.forget(itemId)
  return true
}

function overviewToTracks(
  overview: FeatureCollection<LineString> | null,
  name = 'track',
): Track[] {
  if (!overview) return []
  return overview.features
    .filter((feature) => feature.geometry?.type === 'LineString')
    .map((feature) => ({
      name,
      points: feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
    }))
}

/** What a row shows under the name. The list is one list, so the meta line
    is derived here rather than in three places that could drift.
 *
 * Distance and ascent go through `format/units`, the same functions the
 * track list and the detail face use — hard-coding kilometres here would
 * have the row saying `14.2 km` while the face beside it said `8.8 mi`.
 *
 * #120: a row is honest about where its file is, so the two states that are
 * *about the file rather than the thing* replace the line entirely. There is
 * no room to show both and no value in it — a track's distance does not help
 * a user whose track is not backed up. */
export function looseMetaLine(record: LooseRecord, formatDate: (iso: string) => string): string {
  if (record.uploadState === 'uploading') return 'uploading…'
  if (record.uploadState === 'failed') return 'not on Drive'
  if (record.kind === 'photo') {
    const when = record.takenAt ? formatDate(record.takenAt) : 'undated'
    return record.position ? `${when} · photo` : `${when} · no location`
  }
  const when = record.date ? formatDate(record.date) : 'undated'
  const distance = formatDistance(record.distanceMeters)
  const ascent = formatElevationGain(record.ascentMeters ?? undefined)
  return ascent === undefined ? `${when} · ${distance}` : `${when} · ${distance} · ${ascent}`
}

/** Whether the item's files are where a move would need them to be.
    `Add to a trip` is a file move, so an item still uploading — or one that
    never got there — has nothing to move and the control says so by being
    disabled. */
export function canChangeOwner(record: LooseRecord): boolean {
  return record.uploadState !== 'uploading' && record.uploadState !== 'failed'
}
