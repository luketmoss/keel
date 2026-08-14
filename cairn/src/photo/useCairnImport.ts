import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '../kml/parse'
import { runWithConcurrency } from '../import/concurrency'
import {
  DriveAuthError,
  DriveQuotaError,
  startResumableUpload,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripCairnItemFolder, findOrCreateTripCairnsFolder } from '../drive/tripCairnFolder'
import { listSubfolders, writeJsonFile, findJsonFile, readJsonFile, trashFolder } from '../drive/tripMetadata'
import { readPhotoExif } from './exif'
import { generateThumbnail, THUMBNAIL_SUFFIX, validateImageFile } from './thumbnail'
import { positionPhoto } from './interpolate'
import type { CairnIcon, CairnImage, PositionSource } from '../store/looseStore'

/* Trip-scoped cairn import — the trip-owned half of `cairns.md`'s model.
   Each cairn is a folder, `trips/<trip-id>/cairns/<cairn-id>/cairn.json`
   plus its image (if any), read back by listing that folder rather than
   through a per-trip photo index file — the storage layer #155 replaced it with.

   Resolution at import time covers the first two of `cairns.md`'s three
   routes: EXIF GPS, then interpolation against this trip's tracks (via
   `photo/interpolate.ts`, unchanged). A file that resolves by neither
   route is rejected here as an import failure — there is no placement
   queue yet for it to wait in; that is the import-pipeline issue's build
   on top of this one. A cairn's `position` is never null once it exists
   (`cairns.md`), so there is nothing softer this hook could do with such a
   file than refuse it. */

const UPLOAD_CONCURRENCY = 4

export const ALREADY_IN_TRIP_MESSAGE = 'already in this trip'
export const NO_LOCATION_MESSAGE = 'no GPS, and no track here to place it against yet'

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

export interface UseCairnImport {
  cairns: CairnRecord[]
  loading: boolean
  progress: CairnImportProgress[]
  failures: CairnImportFailure[]
  importFiles: (incoming: File[]) => Promise<void>
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

  /* One file's full pipeline: validate, read EXIF, resolve a position (EXIF
     then interpolation — `cairns.md`'s first two resolution routes),
     refuse outright if neither resolves, then generate a thumbnail and
     upload original + thumbnail + `cairn.json` into the cairn's own
     folder. */
  const importOne = useCallback(
    async (
      file: File,
      index: number,
      total: number,
      token: string,
    ): Promise<CairnRecord | undefined> => {
      const typeError = validateImageFile(file.name)
      if (typeError) {
        addFailure(file.name, typeError)
        return undefined
      }

      const lowerName = file.name.toLowerCase()
      if (cairnsRef.current.some((existing) => existing.name.toLowerCase() === lowerName)) {
        addFailure(file.name, ALREADY_IN_TRIP_MESSAGE)
        return undefined
      }

      const key = generateId('progress')
      setProgressEntry(key, { id: key, name: file.name, index: index + 1, total })

      try {
        const exifResult = await readPhotoExif(file)
        const exif = exifResult.ok ? exifResult.exif : {}

        const resolved = positionPhoto(exif, tracksRef.current)
        if (!resolved) {
          addFailure(file.name, NO_LOCATION_MESSAGE)
          return undefined
        }

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
          position: { lat: resolved.latitude, lng: resolved.longitude },
          positionSource: resolved.source,
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
      } catch (error) {
        const extra = uploadFailureExtra(file, error)
        addFailure(file.name, extra.message, { retryFile: extra.retryFile, reconnect: extra.reconnect })
        return undefined
      } finally {
        clearProgressEntry(key)
      }
    },
    [addFailure, setProgressEntry, clearProgressEntry, cairnFolderId, tripId],
  )

  const importFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      if (!accessToken || !cairnFolderId) return

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
        return
      }

      const items = incoming.map((file, index) => ({ file, index }))
      await runWithConcurrency(items, UPLOAD_CONCURRENCY, ({ file, index }) =>
        importOne(file, index, total, accessToken).then(() => undefined),
      )
    },
    [accessToken, cairnFolderId, tripId, importOne, addFailure],
  )

  const retryFailure = useCallback(
    async (id: string) => {
      const failure = failuresRef.current.find((f) => f.id === id)
      if (!failure?.retryFile || !accessToken || !cairnFolderId) return

      setFailures((prev) => prev.filter((f) => f.id !== id))
      try {
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
    retryFailure,
    dismissFailures,
    removeCairn,
    forgetCairn,
    removingCairnIds,
    cairnRemoveErrors,
  }
}
