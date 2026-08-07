import { useCallback, useEffect, useRef, useState } from 'react'
import { runWithConcurrency } from '../import/concurrency'
import {
  DriveAuthError,
  DriveQuotaError,
  startResumableUpload,
  trashFile,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import { readPhotoExif } from './exif'
import { generateThumbnail, THUMBNAIL_SUFFIX, validateImageFile } from './thumbnail'
import { PHOTOS_INDEX_NAME, readPhotoIndex, writePhotoIndex, type PhotoRecord } from './photoIndex'

/* Drive-aware sibling of `useTripImport` (#34/#35), same upload-then-index
   shape, but photos instead of tracks: read EXIF, generate a thumbnail,
   upload both original and thumbnail, and — unlike tracks, which each get
   parsed and shown the moment their own upload lands — write one
   `photos.json` at the end of the whole batch (design doc point 4). */

/* At most four uploads in flight (design doc's "Concurrency" section) — a
   fifty-photo batch at ~4MB each would otherwise open fifty sockets and
   starve the map's own tile requests. Each of the four workers below
   uploads its photo's original and thumbnail one after another rather than
   both at once, so "4 workers" and "4 uploads in flight" stay the same
   number. */
const UPLOAD_CONCURRENCY = 4

/* #75: same stance as `useTripImport`'s `ALREADY_IN_TRIP_MESSAGE` — a photo
   whose name already names one in this trip is refused before upload,
   matched on filename alone, case-insensitively. */
export const ALREADY_IN_TRIP_MESSAGE = 'already in this trip'

let nextId = 0
function generateId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

function stripId(record: PhotoRecord): Omit<PhotoRecord, 'id'> {
  const { name, originalDriveFileId, thumbnailDriveFileId, latitude, longitude, gpsTimestamp, dateTimeOriginal } =
    record
  return { name, originalDriveFileId, thumbnailDriveFileId, latitude, longitude, gpsTimestamp, dateTimeOriginal }
}

export interface PhotoImportProgress {
  /** Unique per progress entry — see `TripImportProgress.id` for why
      `index`+`name` alone isn't safe to key rows on (#75). */
  id: string
  name: string
  /** The file's fixed position in the *import batch*, 1-based — stable
      regardless of which concurrency slot finishes first, matching
      `TripImportProgress`'s same guarantee for tracks. */
  index: number
  total: number
}

export interface PhotoImportFailure {
  id: string
  name: string
  message: string
  retryFile?: File
  /** Signed out mid-upload — routed through re-authentication rather than
      a bare retry, same stance as `TripImportFailure` for tracks. */
  reconnect?: boolean
}

export interface UsePhotoImport {
  photos: PhotoRecord[]
  loading: boolean
  progress: PhotoImportProgress[]
  failures: PhotoImportFailure[]
  importFiles: (incoming: File[]) => Promise<void>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
  /** #77: trashes both the original and the thumbnail, then rewrites
      `photos.json` without the record — only then does the row disappear.
      Drive first, local state after, same stance as `useTripImport.removeFile`. */
  removePhoto: (id: string) => Promise<void>
  /** #132: drops the id from local state — no Drive call of its own — once
      the loose store has already relocated the photo's files and rewritten
      `photos.json`. What `Remove from trip` uses instead of `removePhoto`. */
  forgetPhoto: (id: string) => void
  /** Photo ids currently mid-removal. */
  removingPhotoIds: Set<string>
  /** Photo id -> the failure copy to show beneath that row. */
  photoRemoveErrors: Record<string, string>
}

export function usePhotoImport(
  tripId: string,
  accessToken: string | null,
  cairnFolderId: string | null,
): UsePhotoImport {
  const [photos, setPhotos] = useState<PhotoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [progressMap, setProgressMap] = useState<Map<string, PhotoImportProgress>>(new Map())
  const [failures, setFailures] = useState<PhotoImportFailure[]>([])
  const failuresRef = useRef<PhotoImportFailure[]>(failures)
  const [removingPhotoIds, setRemovingPhotoIds] = useState<Set<string>>(new Set())
  const [photoRemoveErrors, setPhotoRemoveErrors] = useState<Record<string, string>>({})
  // The full settled set, kept outside React state so a batch's final
  // `photos.json` write can see photos from *this* batch plus whatever a
  // prior batch (or the initial read-back) already landed, without racing
  // `setPhotos`'s own async commit.
  const photosRef = useRef<PhotoRecord[]>([])

  useEffect(() => {
    failuresRef.current = failures
  }, [failures])

  // On mount, read back whatever `photos.json` already names for this trip
  // — same "missing token/folder falls back to empty, not an error" stance
  // as `useTripImport`.
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
        const folderId = await findOrCreateTripFolder(token, cairnId, tripId)
        const records = await readPhotoIndex(token, folderId)
        if (cancelled) return
        photosRef.current = records
        setPhotos(records)
      } catch {
        // Whole read failed — leave whatever was already rendered in place,
        // same as useTripImport's folder-lookup failure handling.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accessToken, cairnFolderId, tripId])

  const setProgressEntry = useCallback((key: string, value: PhotoImportProgress) => {
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
      setFailures((prev) => [...prev, { id: generateId('photo-failure'), name, message, ...extra }])
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

  /* One photo's full pipeline: validate extension, read EXIF, generate a
     thumbnail, then upload original and thumbnail in sequence (not
     parallel — see the concurrency note above). Landing in `photosRef`
     only on full success; `photos.json` itself is written once for the
     whole batch by `importFiles`, never per photo (design doc point 4). */
  const importOne = useCallback(
    async (
      file: File,
      index: number,
      total: number,
      folderId: string,
      token: string,
    ): Promise<PhotoRecord | undefined> => {
      const typeError = validateImageFile(file.name)
      if (typeError) {
        addFailure(file.name, typeError)
        return undefined
      }

      // Checked against `photosRef`, which is updated synchronously as
      // each photo lands — so a duplicate that finished earlier in the same
      // batch is caught for photos that start after it (design doc's "same
      // name in one batch" edge case).
      const lowerName = file.name.toLowerCase()
      if (photosRef.current.some((existing) => existing.name.toLowerCase() === lowerName)) {
        addFailure(file.name, ALREADY_IN_TRIP_MESSAGE)
        return undefined
      }

      const key = generateId('progress')
      setProgressEntry(key, { id: key, name: file.name, index: index + 1, total })

      try {
        const exifResult = await readPhotoExif(file)
        // EXIF failing to parse means only that this photo's metadata is
        // unreadable, not that its pixels are — the design doc's "no EXIF
        // at all" edge case already treats an EXIF-less photo as a normal
        // import, and a failed EXIF read is the same case as far as the
        // image itself goes. Whether the pixels decode is `generateThumbnail`'s
        // question below, not this one's.
        const exif = exifResult.ok ? exifResult.exif : {}

        const thumbnail = await generateThumbnail(file, exif.orientation)
        if (!thumbnail.ok) {
          addFailure(file.name, thumbnail.error)
          return undefined
        }

        const originalSession = await startResumableUpload(token, folderId, file.name)
        const uploadedOriginal = await uploadFileContent(originalSession, file, token)

        const thumbnailName = `${file.name}${THUMBNAIL_SUFFIX}`
        const thumbnailFile = new File([thumbnail.blob], thumbnailName, { type: 'image/jpeg' })
        const thumbnailSession = await startResumableUpload(token, folderId, thumbnailName)
        const uploadedThumbnail = await uploadFileContent(thumbnailSession, thumbnailFile, token)

        const record: PhotoRecord = {
          id: generateId('photo'),
          name: file.name,
          originalDriveFileId: uploadedOriginal.id,
          thumbnailDriveFileId: uploadedThumbnail.id,
          ...(exif.latitude !== undefined ? { latitude: exif.latitude } : {}),
          ...(exif.longitude !== undefined ? { longitude: exif.longitude } : {}),
          ...(exif.gpsTimestamp !== undefined ? { gpsTimestamp: exif.gpsTimestamp } : {}),
          ...(exif.dateTimeOriginal !== undefined ? { dateTimeOriginal: exif.dateTimeOriginal } : {}),
        }

        photosRef.current = [...photosRef.current, record]
        setPhotos(photosRef.current)
        return record
      } catch (error) {
        const extra = uploadFailureExtra(file, error)
        addFailure(file.name, extra.message, { retryFile: extra.retryFile, reconnect: extra.reconnect })
        return undefined
      } finally {
        clearProgressEntry(key)
      }
    },
    [addFailure, setProgressEntry, clearProgressEntry],
  )

  const importFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      if (!accessToken || !cairnFolderId) return

      setFailures([])
      const total = incoming.length

      let folderId: string
      try {
        folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
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

      const beforeBatch = photosRef.current.length
      const items = incoming.map((file, index) => ({ file, index }))
      await runWithConcurrency(items, UPLOAD_CONCURRENCY, ({ file, index }) =>
        importOne(file, index, total, folderId, accessToken).then(() => undefined),
      )

      // Per the design doc's edge case, a batch where every file failed
      // writes nothing and leaves the trip unchanged — checked by whether
      // this batch actually appended anything, not by whether `photos.json`
      // already existed before it ran.
      if (photosRef.current.length > beforeBatch) {
        try {
          await writePhotoIndex(accessToken, folderId, photosRef.current.map(stripId))
        } catch {
          // The index write itself failed (network, auth, quota). The
          // photos already uploaded successfully stay in Drive and in
          // `photos`; only the index recording them is stale until the
          // next successful batch rewrites it. Silently swallowed rather
          // than added as a per-file failure, since no single file caused
          // it — see `PHOTOS_INDEX_NAME` write above.
        }
      }
    },
    [accessToken, cairnFolderId, tripId, importOne, addFailure],
  )

  const retryFailure = useCallback(
    async (id: string) => {
      const failure = failuresRef.current.find((f) => f.id === id)
      if (!failure?.retryFile || !accessToken || !cairnFolderId) return

      setFailures((prev) => prev.filter((f) => f.id !== id))
      try {
        const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
        const beforeRetry = photosRef.current.length
        await importOne(failure.retryFile, 0, 1, folderId, accessToken)
        if (photosRef.current.length > beforeRetry) {
          await writePhotoIndex(accessToken, folderId, photosRef.current.map(stripId))
        }
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

  // #77 — trashes both Drive files, then rewrites `photos.json` with the
  // record dropped. Either step failing leaves `photosRef`/`photos`
  // untouched and reports the failure; a retry re-attempts both trashes,
  // which is safe since trashing an already-trashed file is a no-op.
  const removePhoto = useCallback(
    async (id: string) => {
      const record = photosRef.current.find((p) => p.id === id)
      if (!record) return

      setPhotoRemoveErrors((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })

      if (!accessToken || !cairnFolderId) {
        setPhotoRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${record.name} — try again.` }))
        return
      }

      setRemovingPhotoIds((prev) => new Set(prev).add(id))
      try {
        await trashFile(accessToken, record.originalDriveFileId)
        await trashFile(accessToken, record.thumbnailDriveFileId)
        const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
        const remaining = photosRef.current.filter((p) => p.id !== id)
        await writePhotoIndex(accessToken, folderId, remaining.map(stripId))
        photosRef.current = remaining
        setPhotos(remaining)
      } catch {
        setPhotoRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${record.name} — try again.` }))
      } finally {
        setRemovingPhotoIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [accessToken, cairnFolderId, tripId],
  )

  /** #132: lets go of a photo whose files have moved out of this trip's
      folder, without trashing them or rewriting `photos.json` — the loose
      store's `claimFromTrip` already did both. What `Remove from trip`
      uses, as against `removePhoto`'s `Delete permanently…`. The photo
      mirror of `useTripImport.forgetFile`. */
  const forgetPhoto = useCallback((id: string) => {
    photosRef.current = photosRef.current.filter((p) => p.id !== id)
    setPhotos(photosRef.current)
  }, [])

  const progress = Array.from(progressMap.values()).sort((a, b) => a.index - b.index)

  return {
    photos,
    loading,
    progress,
    failures,
    importFiles,
    retryFailure,
    dismissFailures,
    removePhoto,
    forgetPhoto,
    removingPhotoIds,
    photoRemoveErrors,
  }
}

export { PHOTOS_INDEX_NAME }
