import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '../kml/parse'
import { runWithConcurrency } from '../import/concurrency'
import {
  DriveAuthError,
  DriveQuotaError,
  startResumableUpload,
  trashFile,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripCairnItemFolder, findOrCreateTripCairnsFolder } from '../drive/tripCairnFolder'
import { listSubfolders, writeJsonFile, findJsonFile, readJsonFile, trashFolder } from '../drive/tripMetadata'
import { readPhotoExif, type PhotoExif } from './exif'
import { generateThumbnail, THUMBNAIL_SUFFIX, validateImageFile } from './thumbnail'
import { positionPhoto } from './interpolate'
import { formatShortDate } from '../format/dates'
import {
  ATTACH_IMAGE_FAILED_MESSAGE,
  type AttachImageOutcome,
  type CairnIcon,
  type CairnImage,
  type PositionSource,
} from '../store/looseStore'
import type { PlacementQueueItem } from '../import/placementQueue'
import type { LatLng } from '../map/geo'

/* Trip-scoped cairn import — the trip-owned half of `cairns.md`'s model.
   Each cairn is a folder, `trips/<trip-id>/cairns/<cairn-id>/cairn.json`
   plus its image (if any), read back by listing that folder rather than
   through a per-trip photo index file — the storage layer #155 replaced it with.

   Resolution at import time covers all three of `cairns.md`'s routes: EXIF
   GPS, then interpolation against this trip's tracks (via
   `photo/interpolate.ts`, unchanged), then — since #168 — the placement
   queue for a file that resolves by neither. A cairn's `position` is never
   null once it exists (`cairns.md`), so nothing here ever writes one
   without a position; a file that can't get one waits instead. */

const UPLOAD_CONCURRENCY = 4

export const ALREADY_IN_TRIP_MESSAGE = 'already in this trip'

let nextId = 0
function generateId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

export interface CairnRecord {
  id: string
  name: string
  position: { lat: number; lng: number }
  positionSource: PositionSource
  icon: CairnIcon | null
  image: CairnImage | null
  description: string
  date: string | null
  gpsTimestamp?: string
  dateTimeOriginal?: string
}

function isCairnRecord(value: unknown): value is CairnRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return false
  if (typeof record.position !== 'object' || record.position === null) return false
  const position = record.position as Record<string, unknown>
  if (typeof position.lat !== 'number' || typeof position.lng !== 'number') return false
  return (
    record.positionSource === 'exif' ||
    record.positionSource === 'interpolated' ||
    record.positionSource === 'placed'
  )
}

export interface CairnImportProgress {
  id: string
  name: string
  index: number
  total: number
}

export interface CairnImportFailure {
  id: string
  name: string
  message: string
  retryFile?: File
  reconnect?: boolean
}

export interface CairnImportResult {
  /** How many dropped images saved immediately (EXIF or interpolation) —
      the placement queue's batch summary needs this alongside
      `needsPlacement` to read the whole drop, not just its stragglers. */
  resolvedCount: number
  /** Images that resolved by neither route — waiting to be placed by hand
      rather than rejected, per `cairns.md`'s "no unplaced state". */
  needsPlacement: PlacementQueueItem[]
}

/** #156's create-by-gesture, for a cairn the open trip will own. Every
    field is authored rather than read off a file — there is no image and
    therefore no EXIF, which is why this has nothing in common with
    `importFiles` beyond the folder it writes into. */
export interface NewTripCairn {
  name: string
  position: LatLng
  icon: CairnIcon | null
  description: string
  date: string | null
}

export interface UseCairnImport {
  cairns: CairnRecord[]
  loading: boolean
  progress: CairnImportProgress[]
  failures: CairnImportFailure[]
  importFiles: (incoming: File[]) => Promise<CairnImportResult>
  /** Writes an image-less cairn into this trip. Resolves the new record, or
      `null` if there was no connection to write through or the write
      failed — the create face keeps its typed values and says so rather
      than closing over a cairn that does not exist. */
  createCairn: (input: NewTripCairn) => Promise<CairnRecord | null>
  /** #156's retype: rewrites `cairn.json` with a new `icon` and every other
      field carried across untouched. Resolves `false` on failure, having
      left local state as it was. */
  setCairnIcon: (id: string, icon: CairnIcon | null) => Promise<boolean>
  /** #157: uploads `file` onto an existing cairn, replacing its `image` and
      filling `date` only if it had none. Resolves `{ ok: false }` (with a
      message unless the cairn vanished mid-upload) leaving the cairn exactly
      as it was — the "both, or neither" rule #110 already applies to a
      cairn's image. */
  attachImage: (id: string, file: File) => Promise<AttachImageOutcome>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
  /** Trashes the cairn's whole folder — image and `cairn.json` together —
      then drops it from local state. A folder move away is a rename of its
      parent, not this; this is #77's permanent delete. */
  removeCairn: (id: string) => Promise<void>
  /** Drops the id from local state — no Drive call of its own — once the
      loose store has already relocated the cairn's folder out from under
      this trip. What `Remove from trip` uses instead of `removeCairn`. */
  forgetCairn: (id: string) => void
  removingCairnIds: Set<string>
  cairnRemoveErrors: Record<string, string>
}

export function useCairnImport(
  tripId: string,
  accessToken: string | null,
  cairnFolderId: string | null,
  tracks: Track[],
): UseCairnImport {
  const [cairns, setCairns] = useState<CairnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [progressMap, setProgressMap] = useState<Map<string, CairnImportProgress>>(new Map())
  const [failures, setFailures] = useState<CairnImportFailure[]>([])
  const failuresRef = useRef<CairnImportFailure[]>(failures)
  const [removingCairnIds, setRemovingCairnIds] = useState<Set<string>>(new Set())
  const [cairnRemoveErrors, setCairnRemoveErrors] = useState<Record<string, string>>({})
  const cairnsRef = useRef<CairnRecord[]>([])
  // A cairn's position depends on this trip's tracks, which arrive from a
  // sibling hook and can change shape between renders — a ref keeps
  // `importOne` (a stable `useCallback`) reading the current tracks rather
  // than whatever set was in scope when it was created.
  const tracksRef = useRef<Track[]>(tracks)
  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  useEffect(() => {
    failuresRef.current = failures
  }, [failures])

  useEffect(() => {
    if (!accessToken || !cairnFolderId) {
      setLoading(false)
      return
    }
    const token = accessToken
    const cairnId = cairnFolderId
    let cancelled = false

    async function load() {
      try {
        const cairnsFolderId = await findOrCreateTripCairnsFolder(token, cairnId, tripId)
        const folders = await listSubfolders(token, cairnsFolderId)
        const records: CairnRecord[] = []
        for (const folder of folders) {
          try {
            const file = await findJsonFile(token, folder.id, 'cairn.json')
            if (!file) continue
            const stored = await readJsonFile<CairnRecord>(token, file.fileId)
            if (isCairnRecord(stored.data)) records.push(stored.data)
          } catch {
            // One cairn's folder failing to read does not sink the rest —
            // same "a file's own failure never sinks the batch" stance
            // `runWithConcurrency` documents for import.
          }
        }
        if (cancelled) return
        cairnsRef.current = records
        setCairns(records)
      } catch {
        // Whole read failed — leave whatever was already rendered in place.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accessToken, cairnFolderId, tripId])

  const setProgressEntry = useCallback((key: string, value: CairnImportProgress) => {
    setProgressMap((prev) => {
      const next = new Map(prev)
      next.set(key, value)
      return next
    })
  }, [])

  const clearProgressEntry = useCallback((key: string) => {
    setProgressMap((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const addFailure = useCallback(
    (name: string, message: string, extra?: { retryFile?: File; reconnect?: boolean }) => {
      setFailures((prev) => [...prev, { id: generateId('cairn-failure'), name, message, ...extra }])
    },
    [],
  )

  const uploadFailureExtra = (
    file: File,
    error: unknown,
  ): { message: string; retryFile?: File; reconnect?: boolean } => {
    if (error instanceof DriveAuthError) {
      return {
        message: 'signed out before this finished uploading, tap to reconnect',
        retryFile: file,
        reconnect: true,
      }
    }
    if (error instanceof DriveQuotaError) {
      return { message: 'Drive is out of space' }
    }
    return { message: 'upload failed', retryFile: file }
  }

  /* The upload half, shared by a file that resolved its own position and a
     placement-queue item a person just clicked the map for: generate a
     thumbnail, upload original + thumbnail, write `cairn.json`, and land
     the record in state. */
  const uploadAndSave = useCallback(
    async (
      file: File,
      position: LatLng,
      positionSource: PositionSource,
      exif: PhotoExif,
      token: string,
    ): Promise<CairnRecord | undefined> => {
      const thumbnail = await generateThumbnail(file, exif.orientation)
      if (!thumbnail.ok) {
        addFailure(file.name, thumbnail.error)
        return undefined
      }

      const id = generateId('cairn')
      const folderId = await findOrCreateTripCairnItemFolder(token, cairnFolderId as string, tripId, id)

      const originalSession = await startResumableUpload(token, folderId, file.name)
      const uploadedOriginal = await uploadFileContent(originalSession, file, token)

      const thumbnailName = `${file.name}${THUMBNAIL_SUFFIX}`
      const thumbnailFile = new File([thumbnail.blob], thumbnailName, { type: 'image/jpeg' })
      const thumbnailSession = await startResumableUpload(token, folderId, thumbnailName)
      const uploadedThumbnail = await uploadFileContent(thumbnailSession, thumbnailFile, token)

      const record: CairnRecord = {
        id,
        name: file.name,
        position,
        positionSource,
        icon: null,
        image: { originalDriveFileId: uploadedOriginal.id, thumbnailDriveFileId: uploadedThumbnail.id },
        description: '',
        date: exif.gpsTimestamp ?? exif.dateTimeOriginal ?? null,
        ...(exif.gpsTimestamp !== undefined ? { gpsTimestamp: exif.gpsTimestamp } : {}),
        ...(exif.dateTimeOriginal !== undefined ? { dateTimeOriginal: exif.dateTimeOriginal } : {}),
      }

      await writeJsonFile(token, folderId, 'cairn.json', record, null)

      cairnsRef.current = [...cairnsRef.current, record]
      setCairns(cairnsRef.current)
      return record
    },
    [cairnFolderId, tripId, addFailure],
  )

  /* One file's full pipeline: validate, read EXIF, resolve a position (EXIF
     then interpolation — `cairns.md`'s first two resolution routes). A file
     that resolves either way uploads immediately; one that resolves by
     neither becomes a placement-queue item instead of a failure — see
     `uploadAndSave` above for what its `save` closure runs once a person
     supplies the position by hand. */
  const importOne = useCallback(
    async (
      file: File,
      index: number,
      total: number,
      token: string,
    ): Promise<{ record?: CairnRecord; needsPlacement?: PlacementQueueItem }> => {
      const typeError = validateImageFile(file.name)
      if (typeError) {
        addFailure(file.name, typeError)
        return {}
      }

      const lowerName = file.name.toLowerCase()
      if (cairnsRef.current.some((existing) => existing.name.toLowerCase() === lowerName)) {
        addFailure(file.name, ALREADY_IN_TRIP_MESSAGE)
        return {}
      }

      const key = generateId('progress')
      setProgressEntry(key, { id: key, name: file.name, index: index + 1, total })

      try {
        const exifResult = await readPhotoExif(file)
        const exif = exifResult.ok ? exifResult.exif : {}

        const tracksAtDropTime = tracksRef.current
        const resolved = positionPhoto(exif, tracksAtDropTime)
        if (resolved) {
          const record = await uploadAndSave(
            file,
            { lat: resolved.latitude, lng: resolved.longitude },
            resolved.source,
            exif,
            token,
          )
          return { record }
        }

        // Neither route resolved — waits in the placement queue rather than
        // being written without a position.
        const captureDate = exif.gpsTimestamp ?? exif.dateTimeOriginal
        const captureInstantMs =
          exif.gpsTimestamp !== undefined ? Date.parse(exif.gpsTimestamp) : undefined
        const item: PlacementQueueItem = {
          id: generateId('queue-trip'),
          name: file.name,
          file,
          captureLabel: captureDate ? formatShortDate(captureDate) : null,
          captureInstantMs,
          tracks: tracksAtDropTime,
          save: async (position) => {
            const record = await uploadAndSave(file, position, 'placed', exif, token)
            return record?.id ?? false
          },
        }
        return { needsPlacement: item }
      } catch (error) {
        const extra = uploadFailureExtra(file, error)
        addFailure(file.name, extra.message, { retryFile: extra.retryFile, reconnect: extra.reconnect })
        return {}
      } finally {
        clearProgressEntry(key)
      }
    },
    [addFailure, setProgressEntry, clearProgressEntry, uploadAndSave],
  )

  const importFiles = useCallback(
    async (incoming: File[]): Promise<CairnImportResult> => {
      const empty: CairnImportResult = { resolvedCount: 0, needsPlacement: [] }
      if (incoming.length === 0) return empty
      if (!accessToken || !cairnFolderId) return empty

      setFailures([])
      const total = incoming.length

      try {
        // Fail fast, before starting any of the batch's uploads, if the
        // trip's own folder can't even be reached — otherwise every worker
        // hits the same failure independently.
        await findOrCreateTripCairnsFolder(accessToken, cairnFolderId, tripId)
      } catch (error) {
        const isAuthError = error instanceof DriveAuthError
        for (const file of incoming) {
          addFailure(
            file.name,
            isAuthError ? 'signed out before this finished uploading, tap to reconnect' : 'upload failed',
            isAuthError ? { retryFile: file, reconnect: true } : { retryFile: file },
          )
        }
        return empty
      }

      let resolvedCount = 0
      const needsPlacement: PlacementQueueItem[] = []
      const items = incoming.map((file, index) => ({ file, index }))
      await runWithConcurrency(items, UPLOAD_CONCURRENCY, async ({ file, index }) => {
        const result = await importOne(file, index, total, accessToken)
        if (result.record) resolvedCount += 1
        if (result.needsPlacement) needsPlacement.push(result.needsPlacement)
      })

      return { resolvedCount, needsPlacement }
    },
    [accessToken, cairnFolderId, tripId, importOne, addFailure],
  )

  /* #156 — a cairn placed by hand. Nothing is uploaded, because there is
     nothing to upload: one folder, one `cairn.json`, `image: null`. The
     record lands in local state only after the write returns, unlike the
     optimistic path `DriveLooseStore.update` takes for an edit — a create
     that failed has nothing to revert *to*, and a row for a cairn that was
     never written is exactly the orphan `cairns.md` builds the whole
     placement model to avoid. */
  const createCairn = useCallback(
    async (input: NewTripCairn): Promise<CairnRecord | null> => {
      if (!accessToken || !cairnFolderId) return null

      const id = generateId('cairn')
      const record: CairnRecord = {
        id,
        name: input.name,
        position: input.position,
        // A person put it here. Rule 2 of `cairns.md`'s positionSource:
        // interpolation will never move it again.
        positionSource: 'placed',
        icon: input.icon,
        image: null,
        description: input.description,
        date: input.date,
      }

      try {
        const folderId = await findOrCreateTripCairnItemFolder(accessToken, cairnFolderId, tripId, id)
        await writeJsonFile(accessToken, folderId, 'cairn.json', record, null)
      } catch {
        return null
      }

      cairnsRef.current = [...cairnsRef.current, record]
      setCairns(cairnsRef.current)
      return record
    },
    [accessToken, cairnFolderId, tripId],
  )

  /* #156's retype. `icon` is the only field that changes; every other one
     is spread across from the record already held, which is what makes
     "changes only `icon`" true by construction rather than by review.
     Written to Drive first and applied locally after, matching `createCairn`
     above: a `cairn.json` that still says `null` while the marker says
     campsite is the disagreement this ordering avoids. */
  const setCairnIcon = useCallback(
    async (id: string, icon: CairnIcon | null): Promise<boolean> => {
      const current = cairnsRef.current.find((cairn) => cairn.id === id)
      if (!current) return false
      if (current.icon === icon) return true
      if (!accessToken || !cairnFolderId) return false

      const next: CairnRecord = { ...current, icon }
      try {
        const folderId = await findOrCreateTripCairnItemFolder(accessToken, cairnFolderId, tripId, id)
        const existing = await findJsonFile(accessToken, folderId, 'cairn.json')
        await writeJsonFile(accessToken, folderId, 'cairn.json', next, existing)
      } catch {
        return false
      }

      cairnsRef.current = cairnsRef.current.map((cairn) => (cairn.id === id ? next : cairn))
      setCairns(cairnsRef.current)
      return true
    },
    [accessToken, cairnFolderId, tripId],
  )

  /* #157: attaches a photo to a cairn this trip already owns. Validated up
     front the same way a new import is, then uploaded into the cairn's own
     folder — the same folder `createCairn`/`setCairnIcon` already write
     `cairn.json` into, since a trip-owned cairn's folder is named by its id
     regardless of whether it has ever carried an image. */
  const attachImage = useCallback(
    async (id: string, file: File): Promise<AttachImageOutcome> => {
      const current = cairnsRef.current.find((cairn) => cairn.id === id)
      if (!current || !accessToken || !cairnFolderId) {
        return { ok: false, error: ATTACH_IMAGE_FAILED_MESSAGE }
      }

      const typeError = validateImageFile(file.name)
      if (typeError) return { ok: false, error: typeError }

      const exifResult = await readPhotoExif(file)
      const exif = exifResult.ok ? exifResult.exif : {}

      const thumbnail = await generateThumbnail(file, exif.orientation)
      if (!thumbnail.ok) return { ok: false, error: thumbnail.error }

      try {
        const folderId = await findOrCreateTripCairnItemFolder(accessToken, cairnFolderId, tripId, id)

        const originalSession = await startResumableUpload(accessToken, folderId, file.name)
        const uploadedOriginal = await uploadFileContent(originalSession, file, accessToken)

        const thumbnailName = `${file.name}${THUMBNAIL_SUFFIX}`
        const thumbnailFile = new File([thumbnail.blob], thumbnailName, { type: 'image/jpeg' })
        const thumbnailSession = await startResumableUpload(accessToken, folderId, thumbnailName)
        const uploadedThumbnail = await uploadFileContent(thumbnailSession, thumbnailFile, accessToken)

        // The cairn may have been removed (from another surface) while the
        // upload was in flight — nothing left to write into, so the two new
        // files are trashed rather than left orphaned in Drive.
        const latest = cairnsRef.current.find((cairn) => cairn.id === id)
        if (!latest) {
          await Promise.all([
            trashFile(accessToken, uploadedOriginal.id).catch(() => {}),
            trashFile(accessToken, uploadedThumbnail.id).catch(() => {}),
          ])
          return { ok: false }
        }

        const previousImage = latest.image
        const next: CairnRecord = {
          ...latest,
          image: { originalDriveFileId: uploadedOriginal.id, thumbnailDriveFileId: uploadedThumbnail.id },
          // Filled only if the cairn had none — an authored or already-EXIF
          // date is never overwritten by a later attach.
          date: latest.date ?? exif.gpsTimestamp ?? exif.dateTimeOriginal ?? null,
          ...(exif.gpsTimestamp !== undefined ? { gpsTimestamp: exif.gpsTimestamp } : {}),
          ...(exif.dateTimeOriginal !== undefined ? { dateTimeOriginal: exif.dateTimeOriginal } : {}),
        }

        const existing = await findJsonFile(accessToken, folderId, 'cairn.json')
        await writeJsonFile(accessToken, folderId, 'cairn.json', next, existing)

        // Trashed only now that the replacement fully landed — a failed
        // replace must not destroy what was there.
        if (previousImage) {
          await Promise.all([
            trashFile(accessToken, previousImage.originalDriveFileId).catch(() => {}),
            trashFile(accessToken, previousImage.thumbnailDriveFileId).catch(() => {}),
          ])
        }

        cairnsRef.current = cairnsRef.current.map((cairn) => (cairn.id === id ? next : cairn))
        setCairns(cairnsRef.current)
        return { ok: true }
      } catch {
        // Nothing local was mutated on this path — the cairn is exactly as
        // it was, per the "both, or neither" rule.
        return { ok: false, error: ATTACH_IMAGE_FAILED_MESSAGE }
      }
    },
    [accessToken, cairnFolderId, tripId],
  )

  const retryFailure = useCallback(
    async (id: string) => {
      const failure = failuresRef.current.find((f) => f.id === id)
      if (!failure?.retryFile || !accessToken || !cairnFolderId) return

      setFailures((prev) => prev.filter((f) => f.id !== id))
      try {
        // A retry's file already resolved a position the first time round
        // (only the upload half can fail, per `importOne`'s split above),
        // so a `needsPlacement` result here can't actually happen — nothing
        // to forward it to even if it did.
        await importOne(failure.retryFile, 0, 1, accessToken)
      } catch (error) {
        const extra = uploadFailureExtra(failure.retryFile, error)
        addFailure(failure.retryFile.name, extra.message, {
          retryFile: extra.retryFile,
          reconnect: extra.reconnect,
        })
      }
    },
    [accessToken, cairnFolderId, tripId, importOne, addFailure],
  )

  const dismissFailures = useCallback(() => setFailures([]), [])

  // #77 — trashes the cairn's whole folder (image and `cairn.json`
  // together, one call) rather than two files plus an index rewrite.
  const removeCairn = useCallback(
    async (id: string) => {
      const record = cairnsRef.current.find((c) => c.id === id)
      if (!record) return

      setCairnRemoveErrors((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })

      if (!accessToken || !cairnFolderId) {
        setCairnRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${record.name} — try again.` }))
        return
      }

      setRemovingCairnIds((prev) => new Set(prev).add(id))
      try {
        const folderId = await findOrCreateTripCairnItemFolder(accessToken, cairnFolderId, tripId, id)
        await trashFolder(accessToken, folderId)
        const remaining = cairnsRef.current.filter((c) => c.id !== id)
        cairnsRef.current = remaining
        setCairns(remaining)
      } catch {
        setCairnRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${record.name} — try again.` }))
      } finally {
        setRemovingCairnIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [accessToken, cairnFolderId, tripId],
  )

  const forgetCairn = useCallback((id: string) => {
    cairnsRef.current = cairnsRef.current.filter((c) => c.id !== id)
    setCairns(cairnsRef.current)
  }, [])

  const progress = Array.from(progressMap.values()).sort((a, b) => a.index - b.index)

  return {
    cairns,
    loading,
    progress,
    failures,
    importFiles,
    createCairn,
    setCairnIcon,
    attachImage,
    retryFailure,
    dismissFailures,
    removeCairn,
    forgetCairn,
    removingCairnIds,
    cairnRemoveErrors,
  }
}
