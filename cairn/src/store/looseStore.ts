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

export interface LooseTrackRecord {
  kind: 'track'
  id: string
  name: string
  createdAt: string
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
  driveFileId: string | null
}

export interface LoosePhotoRecord {
  kind: 'photo'
  id: string
  name: string
  createdAt: string
  takenAt: string | null
  /** EXIF GPS, or `null`. **A loose photo with no GPS cannot be placed** —
      #52's interpolation needs tracks to interpolate against and a loose
      photo has none. It lists, it does not draw, and its detail says how to
      fix that. */
  position: LatLng | null
  driveFileId: string | null
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

export interface NewLoosePhoto {
  name: string
  takenAt: string | null
  position: LatLng | null
  driveFileId?: string | null
}

/* The same interface seam `TripStore` provides, for the same reason:
   consumers depend on this and never on a concrete implementation, so the
   Drive-backed sibling is a swap rather than a rewrite. */
export interface LooseStore {
  /** Newest first, both kinds in one list — the panel filters by kind, it
      does not read two stores. */
  getItems(): LooseRecord[]
  getItem(id: string): LooseRecord | null
  addTrack(input: NewLooseTrack, tracks: Track[]): LooseTrackRecord
  addPhoto(input: NewLoosePhoto): LoosePhotoRecord
  /** Destroys it. `Remove from trip` is the *other* direction and does not
      come through here — an owned item is not in this store to begin with. */
  remove(id: string): void
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

/* Ownership moves are deliberately *not* methods here. Moving an item into
   a trip needs both stores — the loose record leaves this one and its
   geometry joins the trip's — and putting that behind a method on either
   would give one store a reference to the other for a single operation.
   `moveLooseIntoTrip` below takes both explicitly instead. */

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
      driveFileId: input.driveFileId ?? null,
      name: input.name,
      takenAt: input.takenAt,
      position: input.position,
    }
    this.insert(record)
    this.notify()
    return record
  }

  remove = (id: string): void => {
    this.index = this.index.filter((item) => item.id !== id)
    this.writeIndex()
    this.storage.removeItem(overviewKey(id))
    this.notify()
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
      return parsed.filter(isLooseRecord)
    } catch {
      return []
    }
  }
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
 * The item leaves the loose store and its geometry joins the trip's
 * overview, so the trip's dot, its count and its route all account for it
 * and the top-level list and map no longer do. Returns `false` — leaving
 * the item exactly where it was — if the id names nothing.
 *
 * The record only leaves once the trip's side has been written. A
 * half-moved item that belongs to nothing is worse than a move that
 * visibly did not happen. */
export function moveLooseIntoTrip(
  looseStore: LooseStore,
  tripSide: {
    getOverview(id: string): FeatureCollection<LineString> | null
    saveOverview(id: string, tracks: Track[]): void
  },
  itemId: string,
  tripId: string,
): boolean {
  const item = looseStore.getItem(itemId)
  if (!item) return false

  if (item.kind === 'track') {
    // Reconstructed into tracks and handed to the trip store's existing
    // `saveOverview` rather than writing GeoJSON straight in — that is the
    // one function allowed to persist a trip's geometry, and it is also
    // what recomputes the trip's dot. Re-simplifying already-simplified
    // geometry costs nothing and keeps the write on one path.
    const merged = [
      ...overviewToTracks(tripSide.getOverview(tripId)),
      ...overviewToTracks(looseStore.getOverview(itemId), item.name),
    ]
    tripSide.saveOverview(tripId, merged)
  }

  looseStore.remove(itemId)
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
 * have the row saying `14.2 km` while the face beside it said `8.8 mi`. */
export function looseMetaLine(record: LooseRecord, formatDate: (iso: string) => string): string {
  if (record.kind === 'photo') {
    const when = record.takenAt ? formatDate(record.takenAt) : 'undated'
    return record.position ? `${when} · photo` : `${when} · no location`
  }
  const when = record.date ? formatDate(record.date) : 'undated'
  const distance = formatDistance(record.distanceMeters)
  const ascent = formatElevationGain(record.ascentMeters ?? undefined)
  return ascent === undefined ? `${when} · ${distance}` : `${when} · ${distance} · ${ascent}`
}
