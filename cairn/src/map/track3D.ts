import type { LatLng } from './geo'

/** What one track draws on the 3D surface — a stable key, its own colour
    from `palette.ts`, and its geometry. Shared by every source that feeds
    `Track3DLayer`: the world view's trips-plus-loose-tracks composition and
    an open trip's (or track face's) own files. */
export interface Track3D {
  key: string
  color: string
  points: LatLng[]
}

/** The one id the 3D surface mounts under — `MapCanvas` renders the single
    `<Map3D>` for the session, and every `Track3DLayer` elsewhere in the tree
    resolves it by id, the same "one map instance, found by whoever draws on
    it" pattern the 2D map already uses. */
export const MAP3D_ID = 'cairn-3d'
