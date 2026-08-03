import {
  LocalTrackOverridesStore,
  isTrackOverrides,
  type TrackOverride,
  type TrackOverrides,
  type TrackOverridesStore,
} from './trackOverridesStore'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import {
  DriveConflictError,
  findJsonFile,
  readJsonFile,
  writeJsonFile,
  type DriveFileRef,
} from '../drive/tripMetadata'

interface OverridesDriveRef {
  folderId: string
  file?: DriveFileRef
}

/** Drive-backed `TrackOverridesStore` — same shape as `DriveTripStore`:
    synchronous reads from a composed `LocalTrackOverridesStore`, optimistic
    local writes, async flush to Drive that `setOverride`/`setOrder` await so
    `TrackList` can show #46's revert-and-banner on failure. `connect` here
    is per-trip rather than whole-app, matching where `useTripImport` already
    calls it — once per trip, when that trip's detail view mounts. The
    access token is whatever the most recent `connect` call carried; every
    trip in a session shares one signed-in account, so there's no need to
    track it per trip the way the Drive file refs below are. */
export class DriveTrackOverridesStore implements TrackOverridesStore {
  private readonly local: LocalTrackOverridesStore
  private readonly refs = new Map<string, OverridesDriveRef>()
  private accessToken: string | null = null
  /** Serializes `connect` and `flush` per trip id — both read `refs.get(tripId)`
      then (async) `refs.set(tripId, ...)`, and a write landing while
      `connect`'s own hydration/migration for that same trip is still in
      flight (e.g. recolouring a track the instant its detail view mounts,
      before `connect` has finished) would compute against a stale snapshot
      and clobber whichever ref `connect` sets — same failure mode
      `DriveTripStore.queues` closes, here scoped to one trip at a time since
      that's this store's own natural unit. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(storage: Storage = window.localStorage) {
    this.local = new LocalTrackOverridesStore(storage)
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(id) ?? Promise.resolve()
    const settled = prior.catch(() => {}).then(task)
    this.queues.set(id, settled.catch(() => {}))
    return settled
  }

  getOverrides = (tripId: string): TrackOverrides => this.local.getOverrides(tripId)

  setOverride = async (
    tripId: string,
    driveFileId: string,
    patch: TrackOverride,
    validDriveFileIds: string[],
  ): Promise<boolean> => {
    const previous = this.local.getOverrides(tripId)
    const ok = await this.local.setOverride(tripId, driveFileId, patch, validDriveFileIds)
    if (!ok) return false
    return this.enqueue(tripId, () => this.flush(tripId, previous))
  }

  setOrder = async (
    tripId: string,
    orderedDriveFileIds: string[],
    validDriveFileIds: string[],
  ): Promise<boolean> => {
    const previous = this.local.getOverrides(tripId)
    const ok = await this.local.setOrder(tripId, orderedDriveFileIds, validDriveFileIds)
    if (!ok) return false
    return this.enqueue(tripId, () => this.flush(tripId, previous))
  }

  /** Called once per trip, when its detail view mounts (`useTripImport`'s
      existing per-trip effect, gated on the same `accessToken`/`folderId`
      it already requires). Hydrates from Drive if `overrides.json` already
      exists there (Drive wins), or migrates this trip's local-only
      overrides up if it doesn't — the same policy `DriveTripStore.connect`
      applies at the whole-app level, scoped down to one trip since that's
      the only trip whose overrides matter at this point. */
  connect = (tripId: string, accessToken: string, folderId: string): Promise<void> => {
    this.accessToken = accessToken
    return this.enqueue(tripId, () => this.connectTrip(tripId, accessToken, folderId))
  }

  private async connectTrip(tripId: string, accessToken: string, folderId: string): Promise<void> {
    const tripFolderId = await findOrCreateTripFolder(accessToken, folderId, tripId)
    const file = await findJsonFile(accessToken, tripFolderId, 'overrides.json')

    if (file) {
      const { data, version } = await readJsonFile<TrackOverrides>(accessToken, file.fileId)
      if (isTrackOverrides(data)) {
        this.local.replaceAll(tripId, data)
        this.refs.set(tripId, { folderId: tripFolderId, file: { fileId: file.fileId, version } })
      }
      return
    }

    this.refs.set(tripId, { folderId: tripFolderId })
    const existing = this.local.getOverrides(tripId)
    if (Object.keys(existing).length === 0) return

    try {
      const written = await writeJsonFile(accessToken, tripFolderId, 'overrides.json', existing, null)
      this.refs.set(tripId, { folderId: tripFolderId, file: written })
    } catch {
      // Silent — retried the next time this trip's detail view is opened,
      // same migration policy as `DriveTripStore`.
    }
  }

  private async flush(tripId: string, previous: TrackOverrides): Promise<boolean> {
    const ref = this.refs.get(tripId)
    // Never connected this session (no accessToken yet, or this trip's
    // detail view hasn't mounted) — local-only for now, synced on the next
    // `connect` call rather than treated as a failure.
    if (!ref || !this.accessToken) return true
    const accessToken = this.accessToken

    try {
      const current = this.local.getOverrides(tripId)
      const written = await writeJsonFile(accessToken, ref.folderId, 'overrides.json', current, ref.file ?? null)
      this.refs.set(tripId, { ...ref, file: written })
      return true
    } catch (error) {
      if (error instanceof DriveConflictError) {
        await this.resolveConflict(tripId, ref, accessToken)
        return false
      }
      this.local.replaceAll(tripId, previous)
      return false
    }
  }

  /** After a rejected write, pulls whatever Drive actually has now into the
      local cache — same reasoning as `DriveTripStore.resolveConflict`: the
      field the user just tried to edit should show the current truth, and
      the next edit should start from real data rather than retry against a
      copy already known to be stale. */
  private async resolveConflict(tripId: string, ref: OverridesDriveRef, accessToken: string): Promise<void> {
    if (!ref.file) return
    try {
      const { data, version } = await readJsonFile<TrackOverrides>(accessToken, ref.file.fileId)
      if (isTrackOverrides(data)) {
        this.local.replaceAll(tripId, data)
        this.refs.set(tripId, { ...ref, file: { fileId: ref.file.fileId, version } })
      }
    } catch {
      // The re-read itself failed — the caller already treats this as a
      // failed save either way, so there's nothing further to do here.
    }
  }
}
