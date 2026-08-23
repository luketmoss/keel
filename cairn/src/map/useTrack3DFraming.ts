import { useEffect, useRef } from 'react'
import { frameGeometry } from './flyover'
import { prefersReducedMotion } from './motion'
import { TRACK3D_REVEAL_MS } from './track3D'
import type { LatLng } from './geo'

interface UseTrack3DFramingOptions {
  map3d: google.maps.maps3d.Map3DElement | null
  is3DOn: boolean
  /** #270/#288's gate: true while a decision owns the map (an import draft,
      the placement queue, the cairn-create gesture). No framing fires. */
  revealSuspended: boolean
  /** Every item that could feed the surface's drawable geometry, visible or
      not — `TripDetail`'s `tripImport.tracks.length`, or the world view's
      trip-plus-loose-track count. Growing it is an import; the 2D fit's own
      first half (`TrackLayer.tsx`'s `previousFileCount`). */
  totalCount: number
  /** The currently *visible* items' own ids, sorted and joined —
      `visibleFilesKey`'s shape, generalized past `ImportedFile` so the
      world view (trips plus loose tracks, nothing to toggle per item but
      still a set that can change) shares the same signal. An unchanged
      `totalCount` with a different key is a toggle. */
  visibleKey: string
  /** Every point the surface actually draws for the current content — read
      at fire time, not listed as a dependency, exactly like #288's own
      reveal reads `tripImport.tracks`: a re-render that leaves `totalCount`
      and `visibleKey` unchanged must not itself trigger a flight, even
      though `points` is a fresh array on every render. */
  points: LatLng[]
}

/** #292 — `Track3DLayer`'s own bounds fit, the 3D equivalent of
    `fitTracksToBounds` (`TrackLayer.tsx`'s 2D effect). Fires when the set of
    geometry the surface draws changes — arrival, import, a visibility
    toggle — and never on removal alone, mirroring the 2D fit's own rule
    verbatim: "a viewport lurching because something was deleted is worse
    than a slightly loose fit."

    One hook rather than two copies of the same effect: the issue's own
    words, "Because the world view and an open trip each mount their own
    `Track3DLayer`, one effect covers both faces." It lives beside the
    surface's other camera moves (`flyover.ts`, `camera3D.ts`) rather than
    inside `Track3DLayer.tsx` itself, the same split #288's own reveal
    takes — the layer only draws, the surrounding component owns the
    camera. `TripDetail.tsx` calls it directly; the world view calls it
    through `WorldTrack3DFraming`, a component that exists only so the hook
    remounts — and its `previousCount`/`previousKey` refs reset to the
    "nothing seen yet" sentinel — every time the world view itself does,
    which is what makes "returning to the world view" read as an arrival. */
export function useTrack3DFraming({
  map3d,
  is3DOn,
  revealSuspended,
  totalCount,
  visibleKey,
  points,
}: UseTrack3DFramingOptions) {
  /* -1 rather than 0: a photos-only trip's `totalCount` is 0 from the first
     render, and the very first render still has to count as an arrival —
     "0 > -1" is true, "0 > 0" would not be. Every render after the first
     compares against whatever was last actually seen, imported or not. */
  const previousCount = useRef(-1)
  const previousKey = useRef<string | null>(null)

  useEffect(() => {
    const imported = totalCount > previousCount.current
    const toggled = totalCount === previousCount.current && visibleKey !== previousKey.current
    previousCount.current = totalCount
    previousKey.current = visibleKey

    if (!imported && !toggled) return
    // `is3DOn`/`map3d`/`revealSuspended` are read live rather than listed:
    // flipping into 3D with the same content already seen must not itself
    // fire a flight (#271 owns the flip's own framing), the same reasoning
    // #288 gives `is3DOn` in its own reveal effect.
    if (!map3d || !is3DOn || revealSuspended) return

    const framed = frameGeometry(points)
    if (!framed) return

    const center = { lat: framed.center.lat, lng: framed.center.lng, altitude: 0 }
    if (prefersReducedMotion()) {
      map3d.center = center
      map3d.range = framed.range
      return
    }
    map3d.flyCameraTo({
      endCamera: {
        center,
        range: framed.range,
        heading: map3d.heading ?? 0,
        tilt: map3d.tilt ?? 0,
      },
      durationMillis: TRACK3D_REVEAL_MS,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCount, visibleKey])
}
