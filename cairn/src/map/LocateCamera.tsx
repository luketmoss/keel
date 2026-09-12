import { useEffect, useRef } from 'react'
import { useMap, useMap3D } from '@vis.gl/react-google-maps'
import { MAP3D_ID, TRACK3D_REVEAL_MS } from './track3D'
import { useMap3DControl } from './Map3DControl'
import { fitTracksToBounds } from './fitBounds'
import { flyToFramedGround } from './flyToFramedGround'
import { LOCATE_MAX_ZOOM, accuracyCorners } from './locateCamera'
import { columnInset, toPadding } from './reveal'
import { useIsPhone } from './useIsPhone'
import type { PositionFix } from './useGeolocation'

/** cairn/docs/design/335-my-location-on-the-map.md — the camera move a fix
    causes. Renders nothing; it exists only to run the effect below, the same
    shape `HomeResetOnNavigate` takes and for the same reason: the shell owns
    the fix, but `useMap()` only resolves beneath `MapProvider`.
 *
 * **A locate is a pan, not a reset.** Unlike #304 it deliberately leaves
 * heading and tilt alone in 3D — you pressed it to see where you are, not to
 * be turned around — which is exactly what `flyToFramedGround` already does
 * for a reveal, so the 3D branch is that helper and not a fourth camera path.
 *
 * Keyed on the fix object, never on the camera: a fix that has already been
 * flown to does not get flown to again when something unrelated re-renders,
 * and pressing the control twice in the same spot produces a second fix
 * object and therefore a second (visually identical) move — which is what
 * "the second press replaces the first" means when the position has not
 * changed. */
export function LocateCamera({ fix }: { fix: PositionFix | null }) {
  const map = useMap()
  const map3d = useMap3D(MAP3D_ID)
  const { on: is3DOn } = useMap3DControl()
  const isPhone = useIsPhone()
  const flown = useRef<PositionFix | null>(null)

  useEffect(() => {
    if (!fix || fix === flown.current) return
    flown.current = fix
    const corners = accuracyCorners(fix)

    /* `is3DOn` and the two map instances are read live rather than listed as
       dependencies: flipping into 3D with a fix already on screen must not
       re-fly to it, the same rule #292's framing gives its own `is3DOn`. */
    if (is3DOn) {
      if (!map3d) return
      /* No `cancelled` guard is needed the way a reveal needs one — a second
         fix cannot arrive while this ground request is in flight without the
         control having been pressed again, and that later move landing last
         is the correct outcome rather than a stale one. */
      void flyToFramedGround(map3d, corners, TRACK3D_REVEAL_MS)
      return
    }

    if (!map) return
    fitTracksToBounds(map, corners, toPadding(columnInset(isPhone)), LOCATE_MAX_ZOOM)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix])

  return null
}
