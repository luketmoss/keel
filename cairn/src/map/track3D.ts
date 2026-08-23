import type { LatLng } from './geo'

/** What one track draws on the 3D surface — a stable key, its own colour
    from `palette.ts`, and its geometry. Shared by every source that feeds
    `Track3DLayer`: the world view's trips-plus-loose-tracks composition and
    an open trip's (or track face's) own files.

    `fileId` and `index` are #288's — a trip's own tracks carry the file they
    belong to (what a click resolves to selecting, and what a multi-track
    file's lines share) and their position in the trip (the stacking order's
    band term, `288-selecting-a-track-in-3d.md`'s "The selected treatment").
    The world view's routes have neither: nothing selects them yet, so they
    draw at rest same as before. */
export interface Track3D {
  key: string
  color: string
  points: LatLng[]
  fileId?: string
  index?: number
}

/** The one id the 3D surface mounts under — `MapCanvas` renders the single
    `<Map3D>` for the session, and every `Track3DLayer` elsewhere in the tree
    resolves it by id, the same "one map instance, found by whoever draws on
    it" pattern the 2D map already uses. */
export const MAP3D_ID = 'cairn-3d'

/** #288 — `--motion-slow`, transcribed for `flyCameraTo`: a duration handed
    to the Maps API never reaches a stylesheet, the same reason `Map3D.tsx`'s
    `TILT_ANIMATION_MS` exists. Shared rather than private to one component
    because the flight is driven by `TripDetail`, on the element
    `Track3DLayer` draws to. */
export const TRACK3D_REVEAL_MS = 280
