import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseKmlOrKmz, type Track } from '../kml/parse'
import { computeTrackStats, hasUsableElevation, overlaySampledElevation, type StoredTrackElevation } from '../kml/stats'
import { createGoogleElevationSampler, sampleTrackElevation, trackKey } from '../geo/elevation'
import { readSampledElevation } from '../geo/tripTotals'
import { runWithConcurrency } from './concurrency'
import type { ImportedFile } from './types'
import {
  downloadTrackFile,
  listTrackFiles,
  startResumableUpload,
  trashFile,
  uploadFileContent,
} from '../drive/trackFiles'
import { findOrCreateTripFolder } from '../drive/tripFolder'
import { DriveAuthError } from '../drive/rootFolder'
import type { TrackOverridesStore } from '../store/trackOverridesStore'
import { DriveTrackOverridesStore } from '../store/driveTrackOverridesStore'
import type { TripStore } from '../store/tripStore'

const ACCEPTED_EXTENSIONS = ['.kml', '.kmz']
/* Matches #4's stance for v1: bounded, not unlimited, so a large batch does
   not open dozens of resumable sessions at once. */
const UPLOAD_CONCURRENCY = 3
/* #122: same reasoning as `UPLOAD_CONCURRENCY` — bounded so a trip with many
   tracks doesn't open dozens of simultaneous Drive reads, unbounded so a
   trip with a couple of tracks doesn't wait one file for another. */
const LOAD_CONCURRENCY = 4
/* #224: bounded the same way uploads and downloads are — a trip with many
   elevation-less tracks doesn't open dozens of simultaneous Elevation API
   calls at once. */
const SAMPLE_CONCURRENCY = 3

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
// Drive-backed as of #59, `connect`-ed per trip below. Exported for the two
// things only `App.tsx` can do: `disconnect()` when the account leaves
// `signed-in` (#73), and #150's display-name carry, which happens during a
// move rather than inside any trip's mounted detail view. Nothing else
// outside this module should reach into it directly.
export const defaultOverridesStore = new DriveTrackOverridesStore()

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
  /** #77: trashes the track's Drive file, then — only once that succeeds —
      drops its override entry and removes the row. Drive first, local state
      after (design doc): a row that disappears and comes back is worse than
      one that never went. A failure leaves the row in place; see
      `removingTrackIds`/`trackRemoveErrors`. */
  removeFile: (id: string) => Promise<void>
  /** #120 — lets go of a track whose file has moved out of this trip's
      folder, without trashing it. What `Remove from trip` uses, as against
      `removeFile`'s `Delete permanently…`. */
  forgetFile: (id: string) => Promise<void>
  /** Track ids currently mid-removal — the confirm has been accepted and
      the Drive trash call is in flight. */
  removingTrackIds: Set<string>
  /** Track id -> the failure copy to show beneath that row, set when its
      most recent `removeFile` call failed. Cleared on the next attempt. */
  trackRemoveErrors: Record<string, string>
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
  /** #224 — this trip's full sampled-elevation cache (previously stored,
      plus anything sampled this session), keyed the way `tracks[].tracks[].key`
      is. What a caller passes to `TripStore.saveOverview`'s third argument,
      and what a track detail face reads to draw a sampled profile. */
  sampledElevation: Record<string, StoredTrackElevation>
}

/* Uploads then parses each file, with bounded concurrency, and reads back
   whatever's already in the trip's Drive folder on mount, since a trip's
   tracks live there rather than only in memory. */
export function useTripImport(
  tripId: string,
  accessToken: string | null,
  cairnFolderId: string | null,
  tripStore: TripStore,
  overridesStore: TrackOverridesStore = defaultOverridesStore,
): UseTripImport {
  const [tracks, setTracks] = useState<ImportedFile[]>([])
  // #224: this trip's sampled-elevation cache — read back from the
  // sidecar on mount (see the effect below), grown as new tracks get
  // sampled. `cacheRead` gates the sampling effect so it never fires
  // against the empty initial state and re-samples a track the sidecar
  // already had an answer for.
  const [sampledElevation, setSampledElevation] = useState<Record<string, StoredTrackElevation>>({})
  const [cacheRead, setCacheRead] = useState(false)
  const [missingFiles, setMissingFiles] = useState<MissingTripFile[]>([])
  const [loading, setLoading] = useState(true)
  const [progressMap, setProgressMap] = useState<Map<string, TripImportProgress>>(new Map())
  const [failures, setFailures] = useState<TripImportFailure[]>([])
  // #46: display-name/order/colour overrides, read from `overridesStore` on
  // mount and whenever `tripId` changes, then kept in step with every
  // successful write so `effectiveTracks` below doesn't re-read storage on
  // every render.
  const [overrides, setOverrides] = useState(() => overridesStore.getOverrides(tripId))
  // #77 — removal state, keyed by `ImportedFile.id` like everything else
  // here. Kept separate from `tracks` itself rather than a per-file flag so
  // a removal's in-flight/failed state survives the row being re-rendered
  // by unrelated changes elsewhere in the trip.
  const [removingTrackIds, setRemovingTrackIds] = useState<Set<string>>(new Set())
  const [trackRemoveErrors, setTrackRemoveErrors] = useState<Record<string, string>>({})
  const overridesRef = useRef(overrides)
  /* Read inside async callbacks (retryFailure) where a closure over the
     `failures` state at render time would go stale. */
  const failuresRef = useRef<TripImportFailure[]>(failures)
  /* Same reason as `failuresRef` — `importOne` needs the *current* track
     list at the moment it starts a given file's upload, not the one
     captured when the batch began, so a duplicate that lands earlier in the
     same batch (#75) is caught for files that start after it settles. Also
     read inside `removeFile` (#77), which needs the latest `tracks` without
     re-creating its callback identity on every track change. */
  const tracksRef = useRef<ImportedFile[]>(tracks)

  useEffect(() => {
    failuresRef.current = failures
  }, [failures])

  useEffect(() => {
    tracksRef.current = tracks
  }, [tracks])

  useEffect(() => {
    overridesRef.current = overrides
  }, [overrides])

  useEffect(() => {
    setOverrides(overridesStore.getOverrides(tripId))
  }, [tripId, overridesStore])

  // #224: this trip's sampled-elevation cache, read back once per trip —
  // whatever a previous session already sampled, so it's never re-sampled.
  useEffect(() => {
    setSampledElevation(readSampledElevation(tripStore.getOverview(tripId)))
    setCacheRead(true)
  }, [tripId, tripStore])

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

        // #122: concurrent, not sequential — each file still lands in
        // `tracks` (or `missingFiles`) as soon as its own read settles,
        // rather than waiting for the whole trip (#35's "partially loaded"
        // state), but a bounded number of downloads now run at once instead
        // of one at a time.
        await runWithConcurrency(driveFiles, LOAD_CONCURRENCY, async (driveFile) => {
          if (cancelled) return
          try {
            const file = await downloadTrackFile(token, driveFile.id, driveFile.name)
            const result = await parseKmlOrKmz(file)
            if (!result.ok || result.tracks.length === 0) return
            if (cancelled) return
            // #224: a stable key per track, so the sampled-elevation cache
            // (keyed by it) survives a re-parse of the same file.
            const keyedTracks = result.tracks.map((track, i) => ({
              ...track,
              key: trackKey(driveFile.id, i, result.tracks.length),
            }))
            setTracks((prev) => [
              ...prev,
              {
                id: generateId('file'),
                name: driveFile.name,
                sourceName: driveFile.name,
                driveFileId: driveFile.id,
                tracks: keyedTracks,
                trackStats: keyedTracks.map(computeTrackStats),
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
        })
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

  /** #224 — samples elevation for every track this trip currently holds
      that has none of its own and isn't already in the cache. Runs
      whenever the track set or the cache changes; each run's own
      candidates settle to nothing once their results land in
      `sampledElevation`, which is what keeps this from looping.
   *
   * Offline, signed out, or no Elevation API available (no key, or the
      Maps script hasn't loaded yet) is a silent no-op — the design note's
      "nothing attempted" state, indistinguishable from a track that was
      never going to be sampled this session. Reported failure is one line
      per settled batch, not per track — a reader who imported eight tracks
      does not need eight apologies. */
  useEffect(() => {
    if (!cacheRead || !accessToken || !cairnFolderId) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const sampler = createGoogleElevationSampler()
    if (!sampler) return

    const candidates = tracks
      .flatMap((file) => file.tracks)
      .filter(
        (track): track is Track & { key: string } =>
          track.key !== undefined &&
          sampledElevation[track.key] === undefined &&
          track.points.length >= 2 &&
          !hasUsableElevation(track.points),
      )
    if (candidates.length === 0) return

    let cancelled = false

    void (async () => {
      const newEntries: Record<string, StoredTrackElevation> = {}
      let failureCount = 0

      await runWithConcurrency(candidates, SAMPLE_CONCURRENCY, async (track) => {
        const result = await sampleTrackElevation(track.points, sampler)
        if (result) newEntries[track.key] = result
        else failureCount += 1
      })

      if (cancelled) return
      if (Object.keys(newEntries).length > 0) {
        setSampledElevation((prev) => ({ ...prev, ...newEntries }))
      }
      if (failureCount > 0) {
        addFailure(
          'Elevation',
          `Couldn't estimate elevation for ${failureCount} track${failureCount === 1 ? '' : 's'}.`,
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cacheRead, tracks, sampledElevation, accessToken, cairnFolderId, addFailure])

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

        const keyedTracks = result.tracks.map((track, i) => ({
          ...track,
          key: trackKey(uploaded.id, i, result.tracks.length),
        }))
        setTracks((prev) => [
          ...prev,
          {
            id: generateId('file'),
            name: file.name,
            sourceName: file.name,
            driveFileId: uploaded.id,
            tracks: keyedTracks,
            trackStats: keyedTracks.map(computeTrackStats),
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

  /** Drops a track from this trip's local state and prunes its override,
      renumbering the remaining tracks' `order` from their current effective
      order — which is what keeps their relative order stable (design doc)
      rather than just closing the gap left by whichever `order` value the
      departing track happened to hold.
   *
   * Says nothing about the file itself. `removeFile` calls it after
   * trashing; `forgetFile` calls it after the file has moved somewhere
   * else, which is the whole difference between deleting a track and
   * removing it from a trip. */
  const dropTrack = useCallback(
    async (id: string) => {
      const remaining = tracksRef.current.filter((f) => f.id !== id)
      const currentOverrides = overridesRef.current
      const orderedDriveFileIds = [...remaining]
        .sort((a, b) => {
          const orderA = currentOverrides[a.driveFileId]?.order
          const orderB = currentOverrides[b.driveFileId]?.order
          if (orderA === undefined && orderB === undefined) return 0
          if (orderA === undefined) return 1
          if (orderB === undefined) return -1
          return orderA - orderB
        })
        .map((f) => f.driveFileId)
      await overridesStore.setOrder(
        tripId,
        orderedDriveFileIds,
        tracksRef.current.map((f) => f.driveFileId),
      )
      setOverrides(overridesStore.getOverrides(tripId))
      setTracks((prev) => prev.filter((f) => f.id !== id))
    },
    [tripId, overridesStore],
  )

  /** #120 — the track's file has moved into the loose folder, so this trip
      lets go of it without trashing anything. Trashing here is what the old
      `Remove from trip` did by reusing `removeFile`, which destroyed the
      user's KML and rebuilt a loose record from parsed data; the file is
      the thing that moves now. */
  const forgetFile = useCallback(
    async (id: string) => {
      await dropTrack(id)
    },
    [dropTrack],
  )

  // #77 — trashes the Drive file first; only on success does local state
  // (the row, its override) move. A failure leaves the row exactly where it
  // was, reported via `trackRemoveErrors` rather than removed optimistically
  // and restored on the next read (design doc: "Order matters on failure").
  const removeFile = useCallback(
    async (id: string) => {
      const file = tracksRef.current.find((f) => f.id === id)
      if (!file) return

      setTrackRemoveErrors((prev) => {
        if (!(id in prev)) return prev
        const next = { ...prev }
        delete next[id]
        return next
      })

      if (!accessToken) {
        setTrackRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${file.name} — try again.` }))
        return
      }

      setRemovingTrackIds((prev) => new Set(prev).add(id))
      try {
        await trashFile(accessToken, file.driveFileId)
      } catch {
        setRemovingTrackIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setTrackRemoveErrors((prev) => ({ ...prev, [id]: `Couldn't remove ${file.name} — try again.` }))
        return
      }

      // Drive trash landed — the row and its override go now.
      await dropTrack(id)
      setRemovingTrackIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [accessToken, dropTrack],
  )

  const renameTrack = useCallback(
    async (id: string, displayName: string): Promise<boolean> => {
      const file = tracks.find((f) => f.id === id)
      if (!file) return false
      const pending = overridesStore.setOverride(
        tripId,
        file.driveFileId,
        { displayName },
        tracks.map((f) => f.driveFileId),
      )
      // #123: `setOverride`'s optimistic local write is visible through
      // `getOverrides` immediately, per its own doc — read it back now
      // rather than waiting on the Drive flush behind the returned promise,
      // so the rename shows up right away instead of after the round trip.
      setOverrides(overridesStore.getOverrides(tripId))
      const ok = await pending
      if (!ok) setOverrides(overridesStore.getOverrides(tripId))
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
      // #224: folds the sampled-elevation cache into each track's already-
      // computed stats — a no-op (`overlaySampledElevation` returns them
      // unchanged) for every track that already carries its own elevation
      // or has nothing cached for it yet.
      const trackStats = file.trackStats.map((stats, i) => {
        const track = file.tracks[i]
        return overlaySampledElevation(stats, track?.key ? sampledElevation[track.key] : undefined)
      })
      if (!override) return { ...file, trackStats }
      return {
        ...file,
        trackStats,
        name: override.displayName ?? file.name,
        colorIndex: override.color ?? file.colorIndex,
        // #150: carried alongside the name it produced, so `Remove from
        // trip` can tell a name the user typed from the filename it would
        // otherwise be showing. Only the override — never the fallback.
        ...(override.displayName !== undefined ? { displayName: override.displayName } : {}),
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
  }, [tracks, overrides, sampledElevation])

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
    forgetFile,
    removingTrackIds,
    trackRemoveErrors,
    renameTrack,
    recolorTrack,
    reorderTracks,
    sampledElevation,
  }
}
