import { useEffect, useRef } from 'react'
import { useMap3D, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MAP3D_ID, type Track3D } from '../map/track3D'

/* #271 — the 2D map's three-stroke halo/casing/core, transcribed to one
   stroke at rest: the halo exists to hold a thin line off flat imagery, and
   over shaded terrain it reads as a smear. No hovered band — #288's design
   note, "Hover is not part of this": `Polyline3DInteractiveElement` has no
   enter/leave event to report it back to a row. */
const TRACK3D_WIDTH_REST = 4

/* #288 — the selected track's stroke and its outer edge, #269's halo
   transcribed as a hard edge rather than a glow (a wide translucent stroke
   is what #271 rejected for this surface). `outerWidth` is a fraction of
   `strokeWidth`, not a pixel count — 0.3 of an 8px stroke is roughly the
   halo's own proportions at rest scale. */
const TRACK3D_WIDTH_SELECTED = 8
const TRACK3D_OUTER_WIDTH = 0.3
const TRACK3D_OUTER_COLOR = '#00000059'

/* #288's stacking, `Polyline3DElement`'s own `zIndex` rather than #273's
   remove-and-re-append — a polyline carries one; a marker does not. */
const TRACK3D_Z_REST = 0
const TRACK3D_Z_SELECTED = 20000

interface TrackMeta {
  fileId?: string
  clickable: boolean
}

interface Track3DLayerProps {
  tracks: Track3D[]
  mapId?: string
  /** #288 — the file whose tracks draw in the selected band, with the
      heavier stroke and outer edge. `undefined`/`null` from a caller that
      has no selection concept yet (the world view) leaves every track at
      rest, unchanged. */
  selectedFileId?: string | null
  /** #288 — a track's route was clicked. Fired with the file's id, the
      same callback `TrackLayer`'s hit line already fires, so a route click
      in 3D and one in 2D cannot drift on what they do. */
  onSelectRoute?: (fileId: string) => void
  /** #270's `hitLinesEnabled`, transcribed: false while a decision owns the
      map, so a route stops reporting clicks without changing how it looks.
      Defaults to `true` so a caller that never wires selection (the world
      view) is unaffected. */
  hitLinesEnabled?: boolean
}

/** One `Polyline3DInteractiveElement` per track, `CLAMP_TO_GROUND` so a track
    crossing a valley sits on the ground along its length. Interactive rather
    than the plain `Polyline3DElement` #271 introduced, since #288's rule is
    "the line the user sees is the line they click" — no separate invisible
    hit line, so every track gets the clickable class and a caller that never
    wires selection simply never enables the listener (see `clickable`).
    `@vis.gl/react-google-maps` ships `Map3D` and `Marker3D` but no 3D
    polyline binding yet, so this manages the elements imperatively — the
    same shape the library's own wrapped elements take internally. */
export function Track3DLayer({
  tracks,
  mapId = MAP3D_ID,
  selectedFileId = null,
  onSelectRoute,
  hitLinesEnabled = true,
}: Track3DLayerProps) {
  const map3d = useMap3D(mapId)
  const maps3d = useMapsLibrary('maps3d')
  const linesRef = useRef<Map<string, google.maps.maps3d.Polyline3DElement>>(new Map())
  /* Read by each line's own click listener, attached once at creation —
     keeps the callback and the enabled flag current without recreating the
     element (and its listener) on every render. */
  const metaRef = useRef<Map<string, TrackMeta>>(new Map())
  const onSelectRouteRef = useRef(onSelectRoute)
  onSelectRouteRef.current = onSelectRoute

  useEffect(() => {
    if (!map3d || !maps3d) return
    const { Polyline3DInteractiveElement, AltitudeMode } = maps3d
    const lines = linesRef.current
    const meta = metaRef.current
    const nextKeys = new Set(tracks.map((track) => track.key))

    for (const [key, line] of lines) {
      if (nextKeys.has(key)) continue
      line.remove()
      lines.delete(key)
      meta.delete(key)
    }

    for (const track of tracks) {
      if (track.points.length < 2) continue
      const path = track.points.map((point) => ({ lat: point.lat, lng: point.lng, altitude: 0 }))
      const selected = selectedFileId != null && selectedFileId === track.fileId
      const strokeWidth = selected ? TRACK3D_WIDTH_SELECTED : TRACK3D_WIDTH_REST
      const zIndex = (selected ? TRACK3D_Z_SELECTED : TRACK3D_Z_REST) + (track.index ?? 0)
      /* #288 — every track's line can receive `gmp-click`, whether or not
         this caller wires selection: "the line the user sees is the line
         they click," not a second invisible one layered over it. */
      const clickable = hitLinesEnabled && onSelectRouteRef.current != null && track.fileId != null
      meta.set(track.key, { fileId: track.fileId, clickable })

      const existing = lines.get(track.key)
      if (existing) {
        existing.path = path
        existing.strokeColor = track.color
        existing.strokeWidth = strokeWidth
        existing.outerColor = selected ? TRACK3D_OUTER_COLOR : null
        existing.outerWidth = selected ? TRACK3D_OUTER_WIDTH : null
        existing.zIndex = zIndex
        continue
      }
      const line = new Polyline3DInteractiveElement({
        path,
        strokeColor: track.color,
        strokeWidth,
        outerColor: selected ? TRACK3D_OUTER_COLOR : null,
        outerWidth: selected ? TRACK3D_OUTER_WIDTH : null,
        zIndex,
        altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
        drawsOccludedSegments: false,
      })
      const key = track.key
      line.addEventListener('gmp-click', () => {
        const current = meta.get(key)
        if (!current?.clickable || !current.fileId) return
        onSelectRouteRef.current?.(current.fileId)
      })
      map3d.append(line)
      lines.set(key, line)
    }
  }, [map3d, maps3d, tracks, selectedFileId, hitLinesEnabled])

  /* Cleared whenever the map instance itself changes (never in practice —
     one 3D surface for the session) and on unmount, so a face that stops
     rendering this layer doesn't leave its lines drawn. */
  useEffect(() => {
    const lines = linesRef.current
    return () => {
      for (const line of lines.values()) line.remove()
      lines.clear()
    }
  }, [map3d])

  return null
}
