import type { Track } from '../kml/parse'
import type { TrackStats } from '../kml/stats'

export interface ImportedFile {
  id: string
  name: string
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
