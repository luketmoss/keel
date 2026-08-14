import type { Track } from '../kml/parse'
import type { TrackStats } from '../kml/stats'

/** A trip's own imported track file (`useTripImport`) — every field
    populated, since a track only ever gets here by belonging to a trip. The
    exception is `displayName`, which records a choice the user may not have
    made; see its own note below. */
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
  /** #150: the trip's `displayName` override, when the user has set one.
      `name` above already reflects it — this says where that name *came
      from*, which is the one thing a move out of the trip has to know: a
      name the user typed is carried onto the loose record, a name the app
      derived from the file is derived again on the other side. Absent on a
      track nobody has renamed, which is why it is the one optional field
      here. */
  displayName?: string
}
