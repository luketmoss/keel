import { useCallback } from 'react'
import { useMap } from '@vis.gl/react-google-maps'
import { useMap3DControl } from './Map3DControl'
import { fitTracksToBounds } from './fitBounds'
import { columnInset, toPadding } from './reveal'
import { useIsPhone } from './useIsPhone'
import { HOME_CORNERS } from './homeView'

/** #304's reset, factored out of `ZoomControls` so #314 can fire it from a
    second trigger (arriving at `/`) without a second copy of the 3D/2D
    branch to drift out of sync with the button's. Camera-only, exactly as
    the design note requires — it never touches the basemap, 3D on/off, the
    open face or any selection.

    Wrapped in `useCallback`: #314's trigger fires this from an effect keyed
    on the returned function, and `Map3DControlValue` gets a new reference on
    every flyover/reset tick — without memoizing, that effect would re-run on
    every one of those ticks rather than only on arrival at `/`. */
export function useHomeReset(): () => void {
  const map = useMap()
  const isPhone = useIsPhone()
  const { on: is3DOn, requestReset } = useMap3DControl()

  return useCallback(() => {
    if (is3DOn) {
      requestReset()
      return
    }
    if (!map) return
    fitTracksToBounds(map, HOME_CORNERS, toPadding(columnInset(isPhone)))
  }, [map, isPhone, is3DOn, requestReset])
}
