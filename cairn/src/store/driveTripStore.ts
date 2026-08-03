import type { FeatureCollection, LineString } from 'geojson'
import type { Track } from '../kml/parse'
import {
  LocalTripStore,
  isFeatureCollection,
  isTripRecord,
  type TripIndexEntry,
  type TripRecord,
  type TripStore,
  type TripUpdate,
} from './tripStore'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import {
  DriveConflictError,
  findJsonFile,
  listSubfolders,
  readJsonFile,
  trashFolder,
  writeJsonFile,
  type DriveFileRef,
} from '../drive/tripMetadata'

interface TripDriveRef {
  folderId: string
  trip?: DriveFileRef
  overview?: DriveFileRef
}

function toPatch(record: TripRecord): TripUpdate {
  return {
    name: record.name,
    status: record.status,
    startDate: record.startDate,
    endDate: record.endDate,
    notes: record.notes,
  }
}

/** Drive-backed `TripStore`: reads are synchronous, served from an
    in-memory/`localStorage` cache (a composed `LocalTripStore`) exactly like
    the local-only implementation, so nothing about `useSyncExternalStore`
    reads changes. Writes go through that same local cache first — optimistic,
    immediately visible — then flush to Drive in the background; `updateTrip`
    is async so its caller (`TripMetadataHeader`) can await the flush and
    show #35's revert-and-banner on failure, same as the design note
    describes. `createTrip`/`deleteTrip`/`saveOverview` have no such failure
    UI defined anywhere in the app (#33/#35 never gave them one), so their
    Drive flush is fire-and-forget: a failure there is retried the next time
    `connect()` runs (an app reload, or reconnecting after a token expiry)
    rather than surfaced. */
export class DriveTripStore implements TripStore {
  private readonly local: LocalTripStore
  private readonly refs = new Map<string, TripDriveRef>()
  private credentials: { accessToken: string; cairnFolderId: string } | null = null

  constructor(storage: Storage = window.localStorage) {
    this.local = new LocalTripStore(storage)
  }

  getTrips = (): TripIndexEntry[] => this.local.getTrips()
  getTrip = (id: string): TripRecord | null => this.local.getTrip(id)
  getOverview = (id: string): FeatureCollection<LineString> | null => this.local.getOverview(id)
  subscribe = (listener: () => void): (() => void) => this.local.subscribe(listener)

  createTrip = (name: string): TripIndexEntry => {
    const entry = this.local.createTrip(name)
    void this.migrateTrip(entry.id)
    return entry
  }

  updateTrip = async (id: string, patch: TripUpdate): Promise<TripRecord | null> => {
    const previous = this.local.getTrip(id)
    const next = await this.local.updateTrip(id, patch)
    if (!next) return null

    const result = await this.flushTrip(id)
    if (result === 'ok') return next
    // A conflict already re-hydrates the local copy to Drive's current
    // value inside flushTrip — reverting to `previous` here would overwrite
    // that with data that's now stale twice over, not once.
    if (result === 'conflict') return null

    if (previous) await this.local.updateTrip(id, toPatch(previous))
    return null
  }

  deleteTrip = (id: string): void => {
    const ref = this.refs.get(id)
    this.local.deleteTrip(id)
    this.refs.delete(id)
    if (this.credentials && ref?.folderId) {
      const { accessToken } = this.credentials
      // Best-effort: an orphaned Drive folder costs negligible space and
      // nothing reads it again, so a failure here isn't worth a retry queue.
      void trashFolder(accessToken, ref.folderId).catch(() => {})
    }
  }

  saveOverview = (id: string, tracks: Track[]): void => {
    this.local.saveOverview(id, tracks)
    void this.flushOverview(id)
  }

  connect = async (accessToken: string, cairnFolderId: string): Promise<void> => {
    this.credentials = { accessToken, cairnFolderId }

    let folders: { id: string; name: string }[]
    try {
      folders = await listSubfolders(accessToken, cairnFolderId)
    } catch {
      // Can't reach Drive right now — whatever's already in the local cache
      // stays as-is, and the next successful `connect()` call (a reload, or
      // a reconnect after a token expiry) tries again.
      return
    }

    const driveTripIds = new Set<string>()
    for (const folder of folders) {
      const tripId = folder.name
      try {
        const tripFile = await findJsonFile(accessToken, folder.id, 'trip.json')
        if (!tripFile) continue
        const trip = await readJsonFile<TripRecord>(accessToken, tripFile.fileId)
        if (!isTripRecord(trip.data)) continue

        driveTripIds.add(tripId)
        this.local.hydrate(trip.data)
        const ref: TripDriveRef = { folderId: folder.id, trip: { fileId: tripFile.fileId, version: trip.version } }

        const overviewFile = await findJsonFile(accessToken, folder.id, 'overview.geojson')
        if (overviewFile) {
          const overview = await readJsonFile<FeatureCollection<LineString>>(accessToken, overviewFile.fileId)
          if (isFeatureCollection(overview.data)) {
            this.local.hydrateOverview(trip.data.id, overview.data)
            ref.overview = { fileId: overviewFile.fileId, version: overview.version }
          }
        }
        this.refs.set(tripId, ref)
      } catch {
        // One trip's hydration failing (a network blip mid-pass) shouldn't
        // stop the rest — this one is retried on the next `connect()` call.
      }
    }

    // Trips this session already knows about that Drive has never heard of
    // — the one-time migration the design note describes, silent and
    // best-effort per trip.
    const localOnly = this.local.getTrips().filter((entry) => !driveTripIds.has(entry.id))
    for (const entry of localOnly) {
      void this.migrateTrip(entry.id)
    }
  }

  private async migrateTrip(id: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const record = this.local.getTrip(id)
    if (!record) return

    try {
      const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, id)
      const trip = await writeJsonFile(accessToken, folderId, 'trip.json', record, null)
      const ref: TripDriveRef = { folderId, trip }

      const overview = this.local.getOverview(id)
      if (overview) {
        ref.overview = await writeJsonFile(accessToken, folderId, 'overview.geojson', overview, null)
      }
      this.refs.set(id, ref)
    } catch {
      // Silent — this trip stays local-only until the next `connect()`. A
      // user who has never seen a Drive error in this app shouldn't have
      // their first one be about an upgrade they took no action to trigger.
    }
  }

  private async flushTrip(id: string): Promise<'ok' | 'conflict' | 'error'> {
    if (!this.credentials) return 'ok'
    const { accessToken, cairnFolderId } = this.credentials
    const record = this.local.getTrip(id)
    if (!record) return 'ok'

    try {
      const ref = this.refs.get(id) ?? { folderId: await findOrCreateTripFolder(accessToken, cairnFolderId, id) }
      const written = await writeJsonFile(accessToken, ref.folderId, 'trip.json', record, ref.trip ?? null)
      this.refs.set(id, { ...ref, trip: written })
      return 'ok'
    } catch (error) {
      if (error instanceof DriveConflictError) {
        await this.resolveConflict(id, accessToken)
        return 'conflict'
      }
      return 'error'
    }
  }

  /** After a rejected write, pulls whatever Drive actually has now into the
      local cache — so the field the user just tried to edit shows the
      current truth, and the *next* edit starts from real data instead of
      retrying against a copy that's already known to be stale. */
  private async resolveConflict(id: string, accessToken: string): Promise<void> {
    const ref = this.refs.get(id)
    if (!ref?.trip) return
    try {
      const trip = await readJsonFile<TripRecord>(accessToken, ref.trip.fileId)
      if (isTripRecord(trip.data)) {
        this.local.hydrate(trip.data)
        this.refs.set(id, { ...ref, trip: { fileId: ref.trip.fileId, version: trip.version } })
      }
    } catch {
      // The re-read itself failed — the caller already treats this as a
      // failed save either way, so there's nothing further to do here.
    }
  }

  private async flushOverview(id: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const overview = this.local.getOverview(id)
    if (!overview) return

    try {
      const ref = this.refs.get(id) ?? { folderId: await findOrCreateTripFolder(accessToken, cairnFolderId, id) }
      const written = await writeJsonFile(accessToken, ref.folderId, 'overview.geojson', overview, ref.overview ?? null)
      this.refs.set(id, { ...ref, overview: written })
    } catch (error) {
      if (error instanceof DriveConflictError) {
        // The overview is derived, not user-authored, and there's always
        // another `saveOverview` coming the next time the track set
        // changes — drop the stale ref so that write starts a fresh create
        // rather than retrying against a version Drive has already rejected.
        const ref = this.refs.get(id)
        if (ref) this.refs.set(id, { ...ref, overview: undefined })
      }
      // Any other error: silently retried the next time `saveOverview` runs.
    }
  }
}
