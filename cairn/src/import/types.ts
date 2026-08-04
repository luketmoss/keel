import type { Track } from '../kml/parse'
import type { TrackStats } from '../kml/stats'

/** A trip's own imported track file (`useTripImport`) — every field always
    populated, since a track only ever gets here by belonging to a trip. */
export interface ImportedFile {
  id: string
  name: string
  /** The file's id in Drive — stable across reloads, unlike `id` above,
      which `useTripImport` regenerates every mount. What #46's per-track
      overrides (rename/reorder/recolour) are keyed by. */
  driveFileId: string
  tracks: Track[]
  /** Index-aligned with `tracks`. Computed once at import, not recomputed
      on every render. */
  trackStats: TrackStats[]
  /** Assigns this file's map colour by insertion order, independent of its
      position in the array — so removing an earlier file (#6) never
      recolours the ones after it. */
  colorIndex: number
  visible: boolean
}
