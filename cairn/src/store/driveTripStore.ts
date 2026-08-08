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
  DriveAuthError,
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
  /** Serializes every operation that reads-then-writes `refs` for a given
      trip id — `migrateTrip`, `flushTrip`, `flushOverview`, and connect's
      hydration all do `refs.get(id)` then (async) `refs.set(id, ...)`, and
      running two of those concurrently for the same id (e.g. a freshly
      created trip's migration racing a rename fired before it finishes, or
      `saveOverview`'s effect landing next to a header edit) let each one
      compute its write against a stale snapshot and clobber the other's ref
      on write-back — silently creating a duplicate Drive file and losing
      track of one of them. Queuing per id closes that: each task only
      starts once the previous one for the same id has settled. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(storage: Storage = window.localStorage) {
    this.local = new LocalTripStore(storage)
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(id) ?? Promise.resolve()
    // `prior.catch` so one task's rejection doesn't wedge the queue for
    // every task after it — each caller still sees its own task's outcome
    // via the returned (unswallowed) promise.
    const settled = prior.catch(() => {}).then(task)
    this.queues.set(id, settled.catch(() => {}))
    return settled
  }

  getTrips = (): TripIndexEntry[] => this.local.getTrips()
  getTrip = (id: string): TripRecord | null => this.local.getTrip(id)
  getOverview = (id: string): FeatureCollection<LineString> | null => this.local.getOverview(id)
  subscribe = (listener: () => void): (() => void) => this.local.subscribe(listener)

  createTrip = (name: string): TripIndexEntry => {
    const entry = this.local.createTrip(name)
    void this.enqueue(entry.id, () => this.migrateTrip(entry.id))
    return entry
  }

  updateTrip = async (id: string, patch: TripUpdate): Promise<TripRecord | null> => {
    // #73: disconnected is read-only. Refused up front rather than applied
    // optimistically and left to "succeed" locally — that asymmetry (a
    // never-signed-in edit sticking while a live-session edit reverts on a
    // dead token) is the bug this issue exists to close.
    if (!this.credentials) return null

    const previous = this.local.getTrip(id)
    const next = await this.local.updateTrip(id, patch)
    if (!next) return null

    const result = await this.enqueue(id, () => this.flushTrip(id))
    if (result === 'ok') return next
    // A conflict already re-hydrates the local copy to Drive's current
    // value inside flushTrip — reverting to `previous` here would overwrite
    // that with data that's now stale twice over, not once.
    if (result === 'conflict') return null

    if (previous) await this.local.updateTrip(id, toPatch(previous))
    return null
  }

  deleteTrip = (id: string): void => {
    // #73: refused outright while disconnected, not just locally applied —
    // a delete that can't reach Drive would otherwise resurrect the trip
    // the next time hydration runs (the trash call either never fires, or
    // fires against a dead token and 401s).
    if (!this.credentials) return

    const ref = this.refs.get(id)
    this.local.deleteTrip(id)
    this.refs.delete(id)
    this.queues.delete(id)
    if (ref?.folderId) {
      const { accessToken } = this.credentials
      // Best-effort: an orphaned Drive folder costs negligible space and
      // nothing reads it again, so a failure here isn't worth a retry queue.
      void trashFolder(accessToken, ref.folderId).catch(() => {})
    }
  }

  saveOverview = (id: string, tracks: Track[]): void => {
    this.local.saveOverview(id, tracks)
    // #79: saveOverview also recomputes and persists the trip's origin (its
    // world-map dot), which lives on `trip.json` — flushed alongside the
    // overview rather than folded into `updateTrip`, since nothing calls
    // that here and origin only ever changes as a side effect of the
    // tracks themselves changing.
    void this.enqueue(id, () => this.flushTrip(id))
    void this.enqueue(id, () => this.flushOverview(id))
  }

  /** #121: the count lives on `trip.json`, so it flushes exactly the way
      `origin` does — through `flushTrip`, not `updateTrip`. Fire-and-forget
      for the same reason `saveOverview`'s flush is: no failure UI is
      defined for a derived value, and the next read of the trip's photo
      index writes it again. `local.savePhotoCount` is a no-op when the
      count is unchanged, so an unchanged count costs no Drive write. */
  savePhotoCount = (id: string, count: number): void => {
    const before = this.local.getTrip(id)?.photoCount
    this.local.savePhotoCount(id, count)
    if (before === count) return
    void this.enqueue(id, () => this.flushTrip(id))
  }

  /** #73: drops credentials and every trip's Drive file refs, so a
      mutation attempted afterward can't reach Drive and reflects the
      account state truthfully instead of racing a dead token. Reading is
      untouched — the local cache (and whatever's cached under `this.local`)
      stays exactly as it was; disconnected is read-only, not offline, and
      clearing the cache here would destroy a trip that never made it to
      Drive with no way to recover it (see the design note's "Why not clear
      the cache on sign-out"). Any task already queued in `this.queues`
      keeps running against the credentials it captured when it started —
      only a *subsequent* call sees `credentials` as `null`. */
  disconnect = (): void => {
    this.credentials = null
    this.refs.clear()
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
      // Queued (not called directly) so this doesn't race a concurrent
      // user-triggered flush/migrate for the same trip — see the `queues`
      // field doc comment.
      const found = await this.enqueue(tripId, () => this.hydrateTrip(folder.id, tripId))
      if (found) driveTripIds.add(tripId)
    }

    // Trips this session already knows about that Drive has never heard of
    // — the one-time migration the design note describes, silent and
    // best-effort per trip.
    const localOnly = this.local.getTrips().filter((entry) => !driveTripIds.has(entry.id))
    for (const entry of localOnly) {
      void this.enqueue(entry.id, () => this.migrateTrip(entry.id))
    }
  }

  /** One trip folder's hydration: `trip.json` and, if present,
      `overview.geojson`. Returns whether a trip was actually found there,
      which is what `connect` uses to decide whether this id still needs
      migrating — determined by `trip.json` alone. A failure reading
      `overview.geojson` (a network blip mid-pass) doesn't make the trip
      look unmigrated, or `migrateTrip` would try to create a second
      `trip.json` next to the one that hydrated just fine; it's retried on
      the next `connect()` call instead, same as any other transient
      failure here. */
  private async hydrateTrip(folderId: string, tripId: string): Promise<boolean> {
    if (!this.credentials) return false
    const { accessToken } = this.credentials
    let trip: { data: TripRecord; version: string }
    try {
      const tripFile = await findJsonFile(accessToken, folderId, 'trip.json')
      if (!tripFile) return false
      trip = await readJsonFile<TripRecord>(accessToken, tripFile.fileId)
      if (!isTripRecord(trip.data)) return false

      this.local.hydrate(trip.data)
      this.refs.set(tripId, { folderId, trip: { fileId: tripFile.fileId, version: trip.version } })
    } catch {
      return false
    }

    try {
      const overviewFile = await findJsonFile(accessToken, folderId, 'overview.geojson')
      if (overviewFile) {
        const overview = await readJsonFile<FeatureCollection<LineString>>(accessToken, overviewFile.fileId)
        if (isFeatureCollection(overview.data)) {
          this.local.hydrateOverview(trip.data.id, overview.data)
          const ref = this.refs.get(tripId)
          if (ref) this.refs.set(tripId, { ...ref, overview: { fileId: overviewFile.fileId, version: overview.version } })
        }
      }
    } catch {
      // The trip itself is already hydrated and its ref already set above —
      // only the overview read failed, retried the next time `saveOverview`
      // or `connect` runs.
    }
    return true
  }

  private async migrateTrip(id: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const record = this.local.getTrip(id)
    if (!record) return

    try {
      const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, id)
      // #102: the folder can already hold a `trip.json` this session hasn't
      // hydrated yet — an edit racing `connect()`'s hydration pass ahead of
      // this migration, or another device having migrated the same trip.
      // Writing straight to `null` in that case creates a second file next
      // to the real one; checking first is what makes this an overwrite.
      const existingTrip = await findJsonFile(accessToken, folderId, 'trip.json')
      const trip = await writeJsonFile(accessToken, folderId, 'trip.json', record, existingTrip)
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

    const lookup = async (): Promise<{ ref: TripDriveRef; existingTrip: DriveFileRef | null }> => {
      const ref = this.refs.get(id) ?? { folderId: await findOrCreateTripFolder(accessToken, cairnFolderId, id) }
      // #102: no cached `ref.trip` only means *this session* hasn't written
      // or hydrated the file yet — not that Drive has no `trip.json`. An
      // edit can reach here before `connect()`'s hydration pass gets to this
      // trip; without checking, that races a create against the file
      // hydration would otherwise have found, leaving two `trip.json`s in
      // the folder and a 50/50 chance the rename survives the next read.
      const existingTrip = ref.trip ?? (await findJsonFile(accessToken, ref.folderId, 'trip.json'))
      return { ref, existingTrip }
    }

    let ref: TripDriveRef
    let existingTrip: DriveFileRef | null
    try {
      ;({ ref, existingTrip } = await lookup())
    } catch (error) {
      // #143: a token expiry here has its own recovery path (the 401 handler
      // inside `findJsonFile`/`findOrCreateTripFolder` already reports it) —
      // retrying against a dead token wastes a round trip on a failure that
      // will not change. Every other failure (a trip freshly migrated
      // seconds ago, Drive still settling from a bulk import, a network
      // blip) gets the same one retry #125 already gives the write below.
      if (error instanceof DriveAuthError) {
        console.error(`[cairn] trip ${id}: flush lookup failed (auth, not retried)`, error)
        return 'error'
      }
      console.error(`[cairn] trip ${id}: flush lookup failed, retrying`, error)
      try {
        ;({ ref, existingTrip } = await lookup())
      } catch (retryError) {
        console.error(`[cairn] trip ${id}: flush lookup failed on retry, giving up`, retryError)
        return 'error'
      }
    }

    const write = () => writeJsonFile(accessToken, ref.folderId, 'trip.json', record, existingTrip)

    try {
      this.refs.set(id, { ...ref, trip: await write() })
      return 'ok'
    } catch (error) {
      if (error instanceof DriveConflictError) {
        // A real version conflict means Drive's file changed under us —
        // retrying with our own stale intent risks clobbering whatever
        // wrote it (see #124's identical reasoning for track overrides), so
        // this keeps the existing "defer to Drive's truth" behavior.
        console.error(`[cairn] trip ${id}: flush write conflicted`, error)
        await this.resolveConflict(id, accessToken)
        return 'conflict'
      }
      // #125: any other failure (network blip, transient 5xx, rate limit)
      // carries no such risk — retried once against the same target before
      // giving up.
      console.error(`[cairn] trip ${id}: flush write failed, retrying`, error)
      try {
        this.refs.set(id, { ...ref, trip: await write() })
        return 'ok'
      } catch (retryError) {
        console.error(`[cairn] trip ${id}: flush write failed on retry, giving up`, retryError)
        return 'error'
      }
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
