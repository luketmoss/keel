import type { FeatureCollection, LineString } from 'geojson'
import type { Track } from '../kml/parse'
import {
  LocalLooseStore,
  isLooseRecord,
  type LooseKind,
  type LoosePhotoRecord,
  type LooseRecord,
  type LooseStore,
  type LooseTrackRecord,
  type NewLoosePhoto,
  type NewLooseTrack,
} from './looseStore'
import { isFeatureCollection } from './tripStore'
import { findOrCreateLooseFolder, findOrCreateLooseItemFolder, moveDriveFile } from '../drive/looseFolder'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import {
  findJsonFile,
  listSubfolders,
  readJsonFile,
  trashFolder,
  writeJsonFile,
  type DriveFileRef,
} from '../drive/tripMetadata'
import { startResumableUpload, uploadFileContent } from '../drive/trackFiles'
import { generateThumbnail, THUMBNAIL_SUFFIX } from '../photo/thumbnail'
import { appendPhotoToIndex, removePhotoFromIndex } from '../photo/photoIndex'

interface LooseDriveRef {
  folderId: string
  record?: DriveFileRef
  overview?: DriveFileRef
}

/** The record file's name, per kind. Fixed here rather than derived from
    the kind for the same reason `looseFolder.ts` fixes its folder names: a
    rename of the type must never silently relocate a user's data. */
const RECORD_FILE: Record<LooseKind, string> = { track: 'track.json', photo: 'photo.json' }
const OVERVIEW_FILE = 'overview.geojson'

const KINDS: LooseKind[] = ['track', 'photo']

/** Drive-backed `LooseStore`: reads are synchronous, served from a composed
    `LocalLooseStore` exactly as `DriveTripStore` serves them from a
    `LocalTripStore`, so nothing about `useSyncExternalStore` changes. Writes
    apply locally first — the row and its marker appear immediately, because
    geometry and stats are computed here and do not wait on a network — and
    flush behind that.
 *
 * What this store adds over its trip sibling is that a loose item has a
 * *file*, not just a record. #110 kept the record and discarded the bytes;
 * everything below exists to keep them, and the two ownership moves are the
 * reason it matters — `Add to a trip` is a move between folders, and there
 * has to be something to move. */
export class DriveLooseStore implements LooseStore {
  private readonly local: LocalLooseStore
  private readonly refs = new Map<string, LooseDriveRef>()
  private credentials: { accessToken: string; cairnFolderId: string } | null = null
  /** Same per-id serialization as `DriveTripStore`, for the same reason:
      every task here reads `refs`, awaits, then writes it back, and two of
      them running concurrently for one id each compute their write against
      a stale snapshot. A move racing the upload that gives it a file to
      move is the case that actually happens. */
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(storage: Storage = window.localStorage) {
    this.local = new LocalLooseStore(storage)
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const prior = this.queues.get(id) ?? Promise.resolve()
    const settled = prior.catch(() => {}).then(task)
    this.queues.set(id, settled.catch(() => {}))
    return settled
  }

  getItems = (): LooseRecord[] => this.local.getItems()
  getItem = (id: string): LooseRecord | null => this.local.getItem(id)
  getOverview = (id: string): FeatureCollection<LineString> | null => this.local.getOverview(id)
  subscribe = (listener: () => void): (() => void) => this.local.subscribe(listener)

  addTrack = (input: NewLooseTrack, tracks: Track[], source?: File): LooseTrackRecord => {
    const record = this.local.addTrack(input, tracks)
    if (!this.credentials || !source) return record
    this.local.setUploadState(record.id, 'uploading')
    void this.enqueue(record.id, () => this.uploadTrack(record.id, source))
    return record
  }

  addPhoto = (input: NewLoosePhoto, source?: File): LoosePhotoRecord => {
    const record = this.local.addPhoto(input)
    if (!this.credentials || !source) return record
    this.local.setUploadState(record.id, 'uploading')
    void this.enqueue(record.id, () => this.uploadPhoto(record.id, source, input.orientation))
    return record
  }

  saveOverview = (id: string, tracks: Track[]): void => {
    this.local.saveOverview(id, tracks)
    void this.enqueue(id, () => this.flushOverview(id))
  }

  /** #73: refused outright while disconnected rather than applied locally,
      matching `DriveTripStore.deleteTrip` — a delete that cannot reach
      Drive resurrects the item on the next hydration. */
  remove = async (id: string): Promise<void> => {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const item = this.local.getItem(id)
    if (!item) return

    // Local first and synchronously, before this function ever awaits: the
    // row goes the moment the user confirms, exactly as `deleteTrip` does.
    // Making the row wait on a folder lookup would be a visible pause on
    // the one action that has already been confirmed.
    const known = this.refs.get(id)?.folderId
    this.local.forget(id)
    this.refs.delete(id)
    this.queues.delete(id)

    // Best-effort, same as a trip's folder: an orphaned folder costs
    // negligible space and nothing reads it again.
    const folderId = known
      ? Promise.resolve(known)
      : findOrCreateLooseItemFolder(accessToken, cairnFolderId, item.kind, id)
    void folderId.then((resolved) => trashFolder(accessToken, resolved)).catch(() => {})
  }

  forget = (id: string): void => {
    this.local.forget(id)
    this.refs.delete(id)
    this.queues.delete(id)
  }

  moveIntoTrip = async (id: string, tripId: string): Promise<boolean> => {
    if (!this.credentials) return false
    const { accessToken, cairnFolderId } = this.credentials

    return this.enqueue(id, async () => {
      const item = this.local.getItem(id)
      if (!item) return false

      let tripFolderId: string
      let looseFolderId: string
      try {
        tripFolderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
        looseFolderId = await findOrCreateLooseItemFolder(accessToken, cairnFolderId, item.kind, id)

        if (item.kind === 'photo') {
          // A photo is its pixels. An item with no file in Drive — one
          // imported before this issue, whose bytes were never kept
          // anywhere — has nothing that could arrive in the trip, and
          // moving it would delete the last trace of it. Refused instead,
          // which surfaces as "still on the map".
          if (!item.originalDriveFileId || !item.thumbnailDriveFileId) return false
          await moveDriveFile(accessToken, item.originalDriveFileId, looseFolderId, tripFolderId)
        } else if (item.driveFileId) {
          // Once the KML is in the trip's folder the trip's track list
          // reads it like any other — `useTripImport` lists the folder, so
          // the row appears with no further work.
          await moveDriveFile(accessToken, item.driveFileId, looseFolderId, tripFolderId)
        }
        // else: a track whose source was never kept. Its geometry still
        // reaches the trip through the caller's overview merge, which is
        // exactly what shipped in #110 — no better, and no worse.
      } catch {
        // Nothing has moved, so nothing has changed: the item is still
        // loose and its files are still in its own folder.
        return false
      }

      /* Past this line the item's first file has left the loose folder, and
         **the move must be reported as done.** Drive moves one file in one
         call but cannot move two files and rewrite a third in one, so each
         step below can fail on its own; what must not happen is this
         resolving `false` afterwards, which would keep the loose row alive
         beside files a trip now holds — one item owned twice, and exactly
         the duplicate this issue exists to stop. The design note's accepted
         failure is the other one: gone from the top level and not yet
         wholly arrived, retried by the next `connect()`. */
      if (item.kind === 'photo' && item.originalDriveFileId && item.thumbnailDriveFileId) {
        await moveDriveFile(
          accessToken,
          item.thumbnailDriveFileId,
          looseFolderId,
          tripFolderId,
        ).catch(() => {})
        await appendPhotoToIndex(accessToken, tripFolderId, {
          name: item.name,
          originalDriveFileId: item.originalDriveFileId,
          thumbnailDriveFileId: item.thumbnailDriveFileId,
          ...(item.position ? { latitude: item.position.lat, longitude: item.position.lng } : {}),
          ...(item.gpsTimestamp !== undefined ? { gpsTimestamp: item.gpsTimestamp } : {}),
          ...(item.dateTimeOriginal !== undefined ? { dateTimeOriginal: item.dateTimeOriginal } : {}),
        }).catch(() => {})
      }

      // The derived files stay behind, so the loose folder goes. Cleanup,
      // not part of the move — an orphaned folder is untidy, and failing the
      // move over it would be the duplicate described above.
      await trashFolder(accessToken, looseFolderId).catch(() => {})
      this.refs.delete(id)
      return true
    })
  }

  /** The reverse of `moveIntoTrip`, and photo-aware since #132: `Remove
      from trip` needs the same two-file-plus-index handling on the way out
      that adding one needs on the way in. The caller creates the loose
      record first — this only ever relocates files for an id that already
      exists, exactly as `moveIntoTrip` does for the trip side. */
  claimFromTrip = async (id: string, tripId: string): Promise<boolean> => {
    if (!this.credentials) return false
    const { accessToken, cairnFolderId } = this.credentials

    return this.enqueue(id, async () => {
      const item = this.local.getItem(id)
      if (!item) return false

      let tripFolderId: string
      let looseFolderId: string
      try {
        tripFolderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
        looseFolderId = await findOrCreateLooseItemFolder(accessToken, cairnFolderId, item.kind, id)

        if (item.kind === 'track') {
          if (!item.driveFileId) return false
          await moveDriveFile(accessToken, item.driveFileId, tripFolderId, looseFolderId)
        } else {
          // A photo with no file in Drive on either end — nothing to
          // relocate, and refusing is the same answer `moveIntoTrip` gives
          // the mirror case.
          if (!item.originalDriveFileId || !item.thumbnailDriveFileId) return false
          await moveDriveFile(accessToken, item.originalDriveFileId, tripFolderId, looseFolderId)
        }
      } catch {
        // Nothing has moved: the item is still in the trip and its files
        // are still in the trip's folder.
        return false
      }

      /* Past this line the item's first file has left the trip folder, and
         **the claim must be reported as done** — the same stance
         `moveIntoTrip` takes on the way in, for the same reason: resolving
         `false` from here on would leave the photo named in the trip's
         `photos.json` beside files the loose store now holds, which is the
         duplicate #120 exists to stop. What can still fail is best-effort
         and retried by the next `connect()`. */
      if (item.kind === 'photo' && item.thumbnailDriveFileId && item.originalDriveFileId) {
        await moveDriveFile(
          accessToken,
          item.thumbnailDriveFileId,
          tripFolderId,
          looseFolderId,
        ).catch(() => {})
        await removePhotoFromIndex(accessToken, tripFolderId, item.originalDriveFileId).catch(() => {})
      }

      await this.writeRecordFiles(id, looseFolderId).catch(() => {})
      this.local.setUploadState(id, 'ok')
      return true
    })
  }

  /** #73: drops credentials and every item's file refs, so a mutation
      attempted afterward cannot reach Drive. Reading is untouched — the
      local cache stays exactly as it was, since disconnected is read-only
      rather than offline. */
  disconnect = (): void => {
    this.credentials = null
    this.refs.clear()
  }

  connect = async (accessToken: string, cairnFolderId: string): Promise<void> => {
    this.credentials = { accessToken, cairnFolderId }

    const known = new Set<string>()
    for (const kind of KINDS) {
      let folders: { id: string; name: string }[]
      try {
        const kindFolderId = await findOrCreateLooseFolder(accessToken, cairnFolderId, kind)
        folders = await listSubfolders(accessToken, kindFolderId)
      } catch {
        // Cannot reach Drive right now — whatever is cached stays as-is and
        // the next successful `connect()` tries again. Deliberately not
        // surfaced: a banner over a list showing the right rows anyway is
        // noise on every flaky connection.
        continue
      }
      for (const folder of folders) {
        const found = await this.enqueue(folder.name, () =>
          this.hydrateItem(kind, folder.id, folder.name),
        )
        if (found) known.add(folder.name)
      }
    }

    // Items this session knows about that Drive has never heard of — the
    // one-time migration. Silent while in flight (no `uploading…`): the
    // user took no action to trigger it. Not silent about failing, because
    // `not on Drive` is a fact about their data, not about who wrote it.
    for (const item of this.local.getItems()) {
      if (known.has(item.id)) continue
      void this.enqueue(item.id, () => this.migrateItem(item.id))
    }
  }

  /** One loose item's hydration: its record file and, for a track, its
      overview. Returns whether a record was actually found, which is what
      `connect` uses to decide whether this id still needs migrating. */
  private async hydrateItem(kind: LooseKind, folderId: string, id: string): Promise<boolean> {
    if (!this.credentials) return false
    const { accessToken } = this.credentials

    try {
      const recordFile = await findJsonFile(accessToken, folderId, RECORD_FILE[kind])
      if (!recordFile) return false
      const stored = await readJsonFile<LooseRecord>(accessToken, recordFile.fileId)
      if (!isLooseRecord(stored.data)) return false
      // It came from Drive, so that is where it is — whatever the record
      // said when it was written.
      this.local.hydrate({ ...stored.data, uploadState: 'ok' })
      this.refs.set(id, { folderId, record: { fileId: recordFile.fileId, version: stored.version } })
    } catch {
      return false
    }

    if (kind === 'track') {
      try {
        const overviewFile = await findJsonFile(accessToken, folderId, OVERVIEW_FILE)
        if (overviewFile) {
          const overview = await readJsonFile<FeatureCollection<LineString>>(
            accessToken,
            overviewFile.fileId,
          )
          if (isFeatureCollection(overview.data)) {
            this.local.hydrateOverview(id, overview.data)
            const ref = this.refs.get(id)
            if (ref) {
              this.refs.set(id, {
                ...ref,
                overview: { fileId: overviewFile.fileId, version: overview.version },
              })
            }
          }
        }
      } catch {
        // The item itself hydrated and its ref is set; only the overview
        // read failed. Retried on the next `connect()`.
      }
    }
    return true
  }

  /** Uploads an item that exists only locally. **The source file is not
      recoverable here** — #110 discarded it, so an item imported before
      this issue can only ever have its record and its geometry backed up.
      For a track that is enough to survive a cleared browser and draw on
      the map; for a photo it is a name and a coordinate, which is all that
      was ever kept. Items imported from now on carry their bytes up at
      import time and never come through here. */
  private async migrateItem(id: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const item = this.local.getItem(id)
    if (!item) return

    try {
      const folderId = await findOrCreateLooseItemFolder(accessToken, cairnFolderId, item.kind, id)
      await this.writeRecordFiles(id, folderId)
      this.local.setUploadState(id, 'ok')
    } catch {
      this.local.setUploadState(id, 'failed')
    }
  }

  private async uploadTrack(id: string, source: File): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials

    try {
      const folderId = await findOrCreateLooseItemFolder(accessToken, cairnFolderId, 'track', id)
      const session = await startResumableUpload(accessToken, folderId, source.name)
      const uploaded = await uploadFileContent(session, source, accessToken)
      this.local.setUploadState(id, 'ok', { driveFileId: uploaded.id })
      await this.writeRecordFiles(id, folderId)
    } catch {
      this.local.setUploadState(id, 'failed')
    }
  }

  private async uploadPhoto(id: string, source: File, orientation?: number): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials

    try {
      const thumbnail = await generateThumbnail(source, orientation)
      if (!thumbnail.ok) {
        this.local.setUploadState(id, 'failed')
        return
      }
      const folderId = await findOrCreateLooseItemFolder(accessToken, cairnFolderId, 'photo', id)

      const originalSession = await startResumableUpload(accessToken, folderId, source.name)
      const original = await uploadFileContent(originalSession, source, accessToken)

      const thumbnailName = `${source.name}${THUMBNAIL_SUFFIX}`
      const thumbnailFile = new File([thumbnail.blob], thumbnailName, { type: 'image/jpeg' })
      const thumbnailSession = await startResumableUpload(accessToken, folderId, thumbnailName)
      const uploadedThumbnail = await uploadFileContent(thumbnailSession, thumbnailFile, accessToken)

      // Both ids land together — a photo whose original arrived and whose
      // thumbnail did not stays `failed`, per the design note.
      this.local.setUploadState(id, 'ok', {
        originalDriveFileId: original.id,
        thumbnailDriveFileId: uploadedThumbnail.id,
      })
      await this.writeRecordFiles(id, folderId)
    } catch {
      this.local.setUploadState(id, 'failed')
    }
  }

  /** Writes the item's record file and, for a track, its overview —
      the derived pair that makes the folder self-describing on the next
      device. Read back by `hydrateItem`. */
  private async writeRecordFiles(id: string, folderId: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken } = this.credentials
    const record = this.local.getItem(id)
    if (!record) return

    const ref = this.refs.get(id) ?? { folderId }
    // Same #102 reasoning as `DriveTripStore.flushTrip`: no cached ref only
    // means this session has not written or hydrated the file yet, not that
    // Drive has none. Checking first is what makes this an overwrite rather
    // than a second file beside the real one.
    const existing = ref.record ?? (await findJsonFile(accessToken, folderId, RECORD_FILE[record.kind]))
    const written = await writeJsonFile(
      accessToken,
      folderId,
      RECORD_FILE[record.kind],
      { ...record, uploadState: 'ok' },
      existing,
    )
    this.refs.set(id, { ...ref, folderId, record: written })

    if (record.kind === 'track') await this.flushOverview(id, folderId)
  }

  private async flushOverview(id: string, knownFolderId?: string): Promise<void> {
    if (!this.credentials) return
    const { accessToken, cairnFolderId } = this.credentials
    const overview = this.local.getOverview(id)
    if (!overview) return
    const item = this.local.getItem(id)
    if (!item || item.kind !== 'track') return

    try {
      const folderId =
        knownFolderId ??
        this.refs.get(id)?.folderId ??
        (await findOrCreateLooseItemFolder(accessToken, cairnFolderId, 'track', id))
      const ref = this.refs.get(id) ?? { folderId }
      const existing = ref.overview ?? (await findJsonFile(accessToken, folderId, OVERVIEW_FILE))
      const written = await writeJsonFile(accessToken, folderId, OVERVIEW_FILE, overview, existing)
      this.refs.set(id, { ...ref, folderId, overview: written })
    } catch {
      // Derived and rewritten whenever the geometry changes — dropped
      // rather than retried, same stance as a trip's overview.
      const ref = this.refs.get(id)
      if (ref) this.refs.set(id, { ...ref, overview: undefined })
    }
  }
}
