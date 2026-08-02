import { useCallback, useEffect, useRef, useState } from 'react'
import { parseKmlOrKmz } from '../kml/parse'
import { computeTrackStats } from '../kml/stats'
import { runWithConcurrency } from './concurrency'
import type { ImportedFile } from './types'
import {
  downloadTrackFile,
  listTrackFiles,
  startResumableUpload,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import { DriveAuthError } from '../drive/cairnFolder'

const ACCEPTED_EXTENSIONS = ['.kml', '.kmz']
/* Matches #4's stance for v1: bounded, not unlimited, so a large batch does
   not open dozens of resumable sessions at once. */
const UPLOAD_CONCURRENCY = 3

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

let nextId = 0
function generateId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

let nextColorIndex = 0
function generateColorIndex(): number {
  const index = nextColorIndex
  nextColorIndex += 1
  return index
}

export type ImportPhase = 'uploading' | 'parsing'

export interface TripImportProgress {
  name: string
  /** The file's fixed position in the *import batch*, 1-based — stable
      regardless of which concurrency slot finishes first (design doc point
      6), unlike upload-completion order. */
  index: number
  total: number
  phase: ImportPhase
}

/** A richer failure shape than the shared `ImportFailure` (`src/import/types.ts`) —
    kept local rather than extending that type so v1's `ImportPanel` is
    untouched by fields it has no use for. `retryFile` is the picker's still-held
    `File`, present only for the two causes the design doc gives a retry
    action to. */
export interface TripImportFailure {
  id: string
  name: string
  message: string
  retryFile?: File
  /** True for "signed out mid-upload" — the design doc routes this through
      re-authentication rather than a bare retry, since retrying without a
      fresh token fails identically. */
  reconnect?: boolean
}

/** A file the trip's index names but Drive can no longer produce — deleted
    behind the app's back, or unreadable for any other reason. Rendered as
    an error row (#35) rather than silently dropped. */
export interface MissingTripFile {
  id: string
  name: string
}

export interface UseTripImport {
  tracks: ImportedFile[]
  /** Files the trip's index named that could not be read back — see
      `MissingTripFile`. */
  missingFiles: MissingTripFile[]
  loading: boolean
  progress: TripImportProgress[]
  failures: TripImportFailure[]
  importFiles: (incoming: File[]) => Promise<void>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
  toggleVisibility: (id: string) => void
  removeFile: (id: string) => void
}

/* Drive-aware sibling of `useTrackImport`: upload then parse instead of
   just parse, bounded concurrency instead of one-at-a-time, and a read-back
   on mount since a trip's tracks live in Drive rather than only in memory. */
export function useTripImport(
  tripId: string,
  accessToken: string | null,
  cairnFolderId: string | null,
): UseTripImport {
  const [tracks, setTracks] = useState<ImportedFile[]>([])
  const [missingFiles, setMissingFiles] = useState<MissingTripFile[]>([])
  const [loading, setLoading] = useState(true)
  const [progressMap, setProgressMap] = useState<Map<string, TripImportProgress>>(new Map())
  const [failures, setFailures] = useState<TripImportFailure[]>([])
  /* Read inside async callbacks (retryFailure) where a closure over the
     `failures` state at render time would go stale. */
  const failuresRef = useRef<TripImportFailure[]>(failures)

  useEffect(() => {
    failuresRef.current = failures
  }, [failures])

  // On mount (and whenever the account becomes available), read back
  // whatever's already attached to this trip. A read failure — including
  // simply having no token yet — falls back to whatever's already
  // rendered rather than clearing the list (design doc's "Signed out" state).
  useEffect(() => {
    if (!accessToken || !cairnFolderId) {
      setLoading(false)
      return
    }
    // Re-bound as new consts: a nested async closure loses TypeScript's
    // null-narrowing on the outer parameters otherwise.
    const token = accessToken
    const cairnId = cairnFolderId

    let cancelled = false

    async function load() {
      if (!cancelled) {
        setTracks([])
        setMissingFiles([])
      }

      try {
        const folderId = await findOrCreateTripFolder(token, cairnId, tripId)
        const driveFiles = await listTrackFiles(token, folderId)

        // Sequential, not batched: each file lands in `tracks` (or
        // `missingFiles`) as soon as its own read settles, rather than
        // waiting for the whole trip — see #35's "partially loaded" state.
        for (const driveFile of driveFiles) {
          if (cancelled) return
          try {
            const file = await downloadTrackFile(token, driveFile.id, driveFile.name)
            const result = await parseKmlOrKmz(file)
            if (!result.ok || result.tracks.length === 0) continue
            if (cancelled) return
            setTracks((prev) => [
              ...prev,
              {
                id: generateId('file'),
                name: driveFile.name,
                tracks: result.tracks,
                trackStats: result.tracks.map(computeTrackStats),
                colorIndex: generateColorIndex(),
                visible: true,
              },
            ])
          } catch {
            // The trip's index names this file but Drive couldn't produce
            // it — deleted behind the app's back, or any other read
            // failure. Rendered as an error row rather than skipped, and
            // does not block the files after it.
            if (cancelled) return
            setMissingFiles((prev) => [...prev, { id: generateId('missing'), name: driveFile.name }])
          }
        }
      } catch {
        // Whole read failed (folder lookup or list) — leave whatever was
        // already rendered in place.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accessToken, cairnFolderId, tripId])

  const setProgressEntry = useCallback((key: string, value: TripImportProgress) => {
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
      setFailures((prev) => [...prev, { id: generateId('failure'), name, message, ...extra }])
    },
    [],
  )

  /* One file's full pipeline: upload (original bytes, original filename)
     then parse, landing in `tracks` as soon as its own work is done —
     never waiting on the rest of the batch (design doc point 6). */
  const importOne = useCallback(
    async (file: File, index: number, total: number, folderId: string, token: string) => {
      if (!hasAcceptedExtension(file.name)) {
        addFailure(file.name, 'only .kml and .kmz files can be imported')
        return
      }

      const key = generateId('progress')
      setProgressEntry(key, { name: file.name, index: index + 1, total, phase: 'uploading' })

      try {
        const sessionUri = await startResumableUpload(token, folderId, file.name)
        await uploadFileContent(sessionUri, file, token)

        setProgressEntry(key, { name: file.name, index: index + 1, total, phase: 'parsing' })

        const result = await parseKmlOrKmz(file)
        if (!result.ok) {
          addFailure(file.name, result.error)
          return
        }
        if (result.tracks.length === 0) {
          addFailure(file.name, 'no tracks found in this file')
          return
        }

        setTracks((prev) => [
          ...prev,
          {
            id: generateId('file'),
            name: file.name,
            tracks: result.tracks,
            trackStats: result.tracks.map(computeTrackStats),
            colorIndex: generateColorIndex(),
            visible: true,
          },
        ])
      } catch (error) {
        if (error instanceof DriveAuthError) {
          addFailure(file.name, 'signed out before this finished uploading, tap to reconnect', {
            retryFile: file,
            reconnect: true,
          })
        } else {
          addFailure(file.name, 'could not be uploaded, tap to retry', { retryFile: file })
        }
      } finally {
        clearProgressEntry(key)
      }
    },
    [addFailure, setProgressEntry, clearProgressEntry],
  )

  const importFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return
      // Safety net — the button that triggers this is disabled while
      // signed out, so this only matters for a stray drag-and-drop drop.
      if (!accessToken || !cairnFolderId) return

      setFailures([])
      const total = incoming.length

      let folderId: string
      try {
        folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
      } catch (error) {
        // Can't even find the destination folder — every file in the batch
        // fails the same way, so report each individually rather than
        // silently dropping the whole import.
        const isAuthError = error instanceof DriveAuthError
        for (const file of incoming) {
          addFailure(
            file.name,
            isAuthError
              ? 'signed out before this finished uploading, tap to reconnect'
              : 'could not be uploaded, tap to retry',
            isAuthError ? { retryFile: file, reconnect: true } : { retryFile: file },
          )
        }
        return
      }

      const items = incoming.map((file, index) => ({ file, index }))
      await runWithConcurrency(items, UPLOAD_CONCURRENCY, ({ file, index }) =>
        importOne(file, index, total, folderId, accessToken),
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
        const folderId = await findOrCreateTripFolder(accessToken, cairnFolderId, tripId)
        await importOne(failure.retryFile, 0, 1, folderId, accessToken)
      } catch (error) {
        const isAuthError = error instanceof DriveAuthError
        addFailure(
          failure.retryFile.name,
          isAuthError
            ? 'signed out before this finished uploading, tap to reconnect'
            : 'could not be uploaded, tap to retry',
          isAuthError
            ? { retryFile: failure.retryFile, reconnect: true }
            : { retryFile: failure.retryFile },
        )
      }
    },
    [accessToken, cairnFolderId, tripId, importOne, addFailure],
  )

  const dismissFailures = useCallback(() => setFailures([]), [])

  const toggleVisibility = useCallback((id: string) => {
    setTracks((prev) =>
      prev.map((file) => (file.id === id ? { ...file, visible: !file.visible } : file)),
    )
  }, [])

  // Local-list removal only — deleting the underlying Drive file is out of
  // scope for this issue (no reparse/replace/multi-trip semantics either).
  const removeFile = useCallback((id: string) => {
    setTracks((prev) => prev.filter((file) => file.id !== id))
  }, [])

  const progress = Array.from(progressMap.values()).sort((a, b) => a.index - b.index)

  return {
    tracks,
    missingFiles,
    loading,
    progress,
    failures,
    importFiles,
    retryFailure,
    dismissFailures,
    toggleVisibility,
    removeFile,
  }
}
