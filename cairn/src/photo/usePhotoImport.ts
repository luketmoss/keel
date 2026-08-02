import { useCallback, useEffect, useRef, useState } from 'react'
import { runWithConcurrency } from '../import/concurrency'
import {
  DriveAuthError,
  DriveQuotaError,
  startResumableUpload,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import { readPhotoExif } from './exif'
import { generateThumbnail, validateImageFile } from './thumbnail'
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

const THUMBNAIL_SUFFIX = '.thumb.jpg'

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

      const key = generateId('progress')
      setProgressEntry(key, { name: file.name, index: index + 1, total })

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

  const progress = Array.from(progressMap.values()).sort((a, b) => a.index - b.index)

  return {
    photos,
    loading,
    progress,
    failures,
    importFiles,
    retryFailure,
    dismissFailures,
  }
}

export { PHOTOS_INDEX_NAME }
