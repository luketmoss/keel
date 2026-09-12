import { useEffect, useRef } from 'react'
import { useMap, useMap3D } from '@vis.gl/react-google-maps'
import { MAP3D_ID, TRACK3D_REVEAL_MS } from './track3D'
import { useMap3DControl } from './Map3DControl'
import { flyToFramedGround } from './flyToFramedGround'
import { columnInset, revealPoint } from './reveal'
import { useIsPhone } from './useIsPhone'
import type { LatLng } from './geo'

/** What a chosen coordinate row does to the camera.
    cairn/docs/design/337-pasting-a-coordinate.md.
 *
 * Renders nothing; it exists only to run the effect below, the same shape
 * `LocateCamera` and `HomeResetOnNavigate` take and for the same reason:
 * the shell owns the target, but `useMap()` only resolves beneath
 * `MapProvider`.
 *
 * **This is #302's reveal, not a new camera path.** `revealPoint` is
 * already the app's "arrive at this one point" move — it is what selecting
 * a cairn does — and a pasted coordinate is the same subject: one point, no
 * extent, arrival *at* it being the whole request. It carries the inset,
 * the close-in cap and the reduced-motion collapse with it.
 *
 * Not #335's zoom-17 floor: that exists because a fix has an accuracy and a
 * two-metre reading should not be shown at a confidence the fix does not
 * support. A pasted coordinate has no accuracy — it is asserted exactly —
 * so there is nothing to hold the camera back from.
 *
 * Keyed on the target object, never on the camera, exactly as
 * `LocateCamera` is: choosing the same coordinate twice produces a second
 * target object and therefore a second (visually identical) move, while an
 * unrelated re-render produces none. */
export function CoordinateCamera({ target }: { target: { position: LatLng } | null }) {
  const map = useMap()
  const map3d = useMap3D(MAP3D_ID)
  const { on: is3DOn } = useMap3DControl()
  const isPhone = useIsPhone()
  const flown = useRef<{ position: LatLng } | null>(null)

  useEffect(() => {
    if (!target || target === flown.current) return
    flown.current = target

    /* `is3DOn` and the two map instances are read live rather than listed
       as dependencies, the same rule #292's framing and `LocateCamera`
       both give: flipping into 3D with a pin already placed must not
       re-fly to it. */
    if (is3DOn) {
      if (!map3d) return
      // Heading and tilt untouched — like a locate and unlike a reset, this
      // is a pan. You asked to go somewhere, not to be turned around.
      void flyToFramedGround(map3d, [target.position], TRACK3D_REVEAL_MS)
      return
    }

    if (!map) return
    revealPoint(map, target.position, columnInset(isPhone))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return null
}
