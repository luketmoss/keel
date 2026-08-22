import { useEffect, useRef } from 'react'
import { useMap3D, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MAP3D_ID, type Track3D } from '../map/track3D'

/* #271 — the 2D map's three-stroke halo/casing/core, transcribed to one
   stroke: the halo exists to hold a thin line off flat imagery, and over
   shaded terrain it reads as a smear. No hover/selection bands either —
   "no active-track glow... belongs to a selection this issue does not
   add." Every track draws the same way, always. */
const STROKE_WIDTH = 4

/** One `Polyline3DElement` per track, `CLAMP_TO_GROUND` so a track crossing
    a valley sits on the ground along its length. `@vis.gl/react-google-maps`
    ships `Map3D` and `Marker3D` but no 3D polyline binding yet, so this
    manages the elements imperatively — the same shape the library's own
    wrapped elements take internally. */
export function Track3DLayer({ tracks, mapId = MAP3D_ID }: { tracks: Track3D[]; mapId?: string }) {
  const map3d = useMap3D(mapId)
  const maps3d = useMapsLibrary('maps3d')
  const linesRef = useRef<Map<string, google.maps.maps3d.Polyline3DElement>>(new Map())

  useEffect(() => {
    if (!map3d || !maps3d) return
    const { Polyline3DElement, AltitudeMode } = maps3d
    const lines = linesRef.current
    const nextKeys = new Set(tracks.map((track) => track.key))

    for (const [key, line] of lines) {
      if (nextKeys.has(key)) continue
      line.remove()
      lines.delete(key)
    }

    for (const track of tracks) {
      if (track.points.length < 2) continue
      const path = track.points.map((point) => ({ lat: point.lat, lng: point.lng, altitude: 0 }))
      const existing = lines.get(track.key)
      if (existing) {
        existing.path = path
        existing.strokeColor = track.color
        continue
      }
      const line = new Polyline3DElement({
        path,
        strokeColor: track.color,
        strokeWidth: STROKE_WIDTH,
        altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
        drawsOccludedSegments: false,
      })
      map3d.append(line)
      lines.set(track.key, line)
    }
  }, [map3d, maps3d, tracks])

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
