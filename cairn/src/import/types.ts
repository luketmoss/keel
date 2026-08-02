import type { Track } from '../kml/parse'
import type { TrackStats } from '../kml/stats'

export interface ImportedFile {
  id: string
  name: string
  /** The file's id in Drive — stable across reloads, unlike `id` above,
      which `useTripImport` regenerates every mount. What #46's per-track
      overrides (rename/reorder/recolour) are keyed by. Empty string for the
      v1, non-trip import path (`useTrackImport`), which has no Drive file
      behind it and no overrides feature. */
  driveFileId: string
  tracks: Track[]
  /** Index-aligned with `tracks`. Computed once at import — see
      `useTrackImport` — not recomputed on every render. */
  trackStats: TrackStats[]
  /** Assigns this file's map colour by insertion order, independent of its
      position in the array — so removing an earlier file (#6) never
      recolours the ones after it. */
  colorIndex: number
  visible: boolean
}

export interface ImportFailure {
  id: string
  name: string
  message: string
}

export interface ImportProgress {
  name: string
  index: number
  total: number
}
