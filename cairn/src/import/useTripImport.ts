import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { TrackOverridesStore } from '../store/trackOverridesStore'
import { DriveTrackOverridesStore } from '../store/driveTrackOverridesStore'

const ACCEPTED_EXTENSIONS = ['.kml', '.kmz']
/* Matches #4's stance for v1: bounded, not unlimited, so a large batch does
   not open dozens of resumable sessions at once. */
const UPLOAD_CONCURRENCY = 3

/* #75: a file whose name already names a track in this trip is refused
   before it's uploaded, rather than doubling the trip's contents. Matching
   is deliberately on filename alone, case-insensitively — see the design
   doc's "A file the trip already has" for why this is chosen over content
   hashing. */
export const ALREADY_IN_TRIP_MESSAGE = 'already in this trip'

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

// Shared across every `useTripImport` instance that doesn't get its own
// (tests inject a fake-storage-backed one) — #46's overrides record,
// Drive-backed as of #59, `connect`-ed per trip below.
const defaultOverridesStore = new DriveTrackOverridesStore()

export type ImportPhase = 'uploading' | 'parsing'

export interface TripImportProgress {
  /** Unique per progress entry, independent of `index`/`name` — what the
      panel keys its rows on. `index`+`name` collides when two files share a
      name (#75: a retry always reports position 0, and two same-named files
      in one batch can both land on the same position across a re-render),
      so neither is safe as a React key on its own. */
  id: string
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
  /** #46: sets a display-name override for one track. Never touches the
      file's actual name in Drive. Resolves `false` on a save failure (local
      write, or the Drive flush behind it) — the caller reverts its
      optimistic UI update. */
  renameTrack: (id: string, displayName: string) => Promise<boolean>
  /** #46: sets a `TRACK_COLORS` index override for one track, taking over
      from its auto-assigned `colorIndex`. Resolves `false` on a save
      failure. */
  recolorTrack: (id: string, color: number) => Promise<boolean>
  /** #46: restates the full display order for the trip's tracks as a list
      of `id`s (not Drive file ids) in their new order. Resolves `false` on
      a save failure. */
  reorderTracks: (orderedIds: string[]) => Promise<boolean>
}

/* Drive-aware sibling of `useTrackImport`: upload then parse instead of
   just parse, bounded concurrency instead of one-at-a-time, and a read-back
   on mount since a trip's tracks live in Drive rather than only in memory. */
export function useTripImport(
  tripId: string,
  accessToken: string | null,
  cairnFolderId: string | null,
  overridesStore: TrackOverridesStore = defaultOverridesStore,
): UseTripImport {
  const [tracks, setTracks] = useState<ImportedFile[]>([])
  const [missingFiles, setMissingFiles] = useState<MissingTripFile[]>([])
  const [loading, setLoading] = useState(true)
  const [progressMap, setProgressMap] = useState<Map<string, TripImportProgress>>(new Map())
  const [failures, setFailures] = useState<TripImportFailure[]>([])
  // #46: display-name/order/colour overrides, read from `overridesStore` on
  // mount and whenever `tripId` changes, then kept in step with every
  // successful write so `effectiveTracks` below doesn't re-read storage on
  // every render.
  const [overrides, setOverrides] = useState(() => overridesStore.getOverrides(tripId))
  /* Read inside async callbacks (retryFailure) where a closure over the
     `failures` state at render time would go stale. */
  const failuresRef = useRef<TripImportFailure[]>(failures)
  /* Same reason as `failuresRef` — `importOne` needs the *current* track
     list at the moment it starts a given file's upload, not the one
     captured when the batch began, so a duplicate that lands earlier in the
     same batch (#75) is caught for files that start after it settles. */
  const tracksRef = useRef<ImportedFile[]>(tracks)

  useEffect(() => {
    failuresRef.current = failures
  }, [failures])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  useEffect(() => {
    setOverrides(overridesStore.getOverrides(tripId))
  }, [tripId, overridesStore])

  // Hydrates (or migrates) this trip's overrides against Drive, per #59 —
  // independent of the track-listing effect below since overrides live in
  // their own file and shouldn't block track rows from appearing. Re-reads
  // local state once the connect settles, since Drive can win over
  // whatever was read synchronously above.
  useEffect(() => {
    if (!accessToken || !cairnFolderId) return
    let cancelled = false
    void overridesStore
      .connect?.(tripId, accessToken, cairnFolderId)
      .then(() => {
        if (!cancelled) setOverrides(overridesStore.getOverrides(tripId))
      })
      .catch(() => {
        // Hydration failed (network, or a token that expired mid-call) —
        // whatever's already in the local cache stays as the working copy,
        // retried next time this effect re-runs.
      })
    return () => {
      cancelled = true
    }
  }, [tripId, accessToken, cairnFolderId, overridesStore])

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
                driveFileId: driveFile.id,
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

      // Checked at the moment this file's own upload is about to start
      // (against a ref, not the `tracks` closed over at batch-start) so a
      // duplicate that lands earlier in the same batch is still caught —
      // see the design doc's "same name in one batch" edge case.
      const lowerName = file.name.toLowerCase()
      if (tracksRef.current.some((existing) => existing.name.toLowerCase() === lowerName)) {
        addFailure(file.name, ALREADY_IN_TRIP_MESSAGE)
        return
      }

      const key = generateId('progress')
      setProgressEntry(key, { id: key, name: file.name, index: index + 1, total, phase: 'uploading' })

      try {
        const sessionUri = await startResumableUpload(token, folderId, file.name)
        const uploaded = await uploadFileContent(sessionUri, file, token)

        setProgressEntry(key, { id: key, name: file.name, index: index + 1, total, phase: 'parsing' })

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
            driveFileId: uploaded.id,
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
  // The removed file's override (if any) is left in place and pruned on the
  // next write elsewhere in the trip — see #46's "Stale override" state.
  const removeFile = useCallback((id: string) => {
    setTracks((prev) => prev.filter((file) => file.id !== id))
  }, [])

  const renameTrack = useCallback(
    async (id: string, displayName: string): Promise<boolean> => {
      const file = tracks.find((f) => f.id === id)
      if (!file) return false
      const ok = await overridesStore.setOverride(
        tripId,
        file.driveFileId,
        { displayName },
        tracks.map((f) => f.driveFileId),
      )
      setOverrides(overridesStore.getOverrides(tripId))
      return ok
    },
    [tracks, tripId, overridesStore],
  )

  const recolorTrack = useCallback(
    async (id: string, color: number): Promise<boolean> => {
      const file = tracks.find((f) => f.id === id)
      if (!file) return false
      const ok = await overridesStore.setOverride(
        tripId,
        file.driveFileId,
        { color },
        tracks.map((f) => f.driveFileId),
      )
      setOverrides(overridesStore.getOverrides(tripId))
      return ok
    },
    [tracks, tripId, overridesStore],
  )

  const reorderTracks = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      const driveFileIdById = new Map(tracks.map((f) => [f.id, f.driveFileId]))
      const orderedDriveFileIds = orderedIds
        .map((id) => driveFileIdById.get(id))
        .filter((driveFileId): driveFileId is string => driveFileId !== undefined)
      const ok = await overridesStore.setOrder(
        tripId,
        orderedDriveFileIds,
        tracks.map((f) => f.driveFileId),
      )
      setOverrides(overridesStore.getOverrides(tripId))
      return ok
    },
    [tracks, tripId, overridesStore],
  )

  // #46: overrides applied on top of the raw Drive-listing data — a track
  // missing an override for a given field falls back to that field's
  // existing default (original filename, auto-assigned colour, and
  // insertion order via the stable sort below). `order`-less files sort
  // to the end, in whatever order they arrived.
  const effectiveTracks = useMemo(() => {
    const withOverrides = tracks.map((file) => {
      const override = overrides[file.driveFileId]
      if (!override) return file
      return {
        ...file,
        name: override.displayName ?? file.name,
        colorIndex: override.color ?? file.colorIndex,
      }
    })
    return [...withOverrides].sort((a, b) => {
      const orderA = overrides[a.driveFileId]?.order
      const orderB = overrides[b.driveFileId]?.order
      if (orderA === undefined && orderB === undefined) return 0
      if (orderA === undefined) return 1
      if (orderB === undefined) return -1
      return orderA - orderB
    })
  }, [tracks, overrides])

  const progress = Array.from(progressMap.values()).sort((a, b) => a.index - b.index)

  return {
    tracks: effectiveTracks,
    missingFiles,
    loading,
    progress,
    failures,
    importFiles,
    retryFailure,
    dismissFailures,
    toggleVisibility,
    removeFile,
    renameTrack,
    recolorTrack,
    reorderTracks,
  }
}
