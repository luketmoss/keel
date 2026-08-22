import { useEffect, useState } from 'react'
import { useApiIsLoaded } from '@vis.gl/react-google-maps'

export type Maps3DSupport = 'checking' | 'available' | 'unavailable'

/** #271's own disabled sentence, one place rather than a copy per control —
    #274's `FlyoverButton` shows it verbatim too, per its design note's
    "The disabled sentence is #271's, verbatim." */
export const MAPS_3D_UNAVAILABLE_SENTENCE =
  "This browser can't draw 3D. Check that hardware acceleration is on."

interface Maps3DState {
  support: Maps3DSupport
  library: google.maps.Maps3DLibrary | null
}

const CHECKING: Maps3DState = { support: 'checking', library: null }
const UNAVAILABLE: Maps3DState = { support: 'unavailable', library: null }

/** #271's "Where 3D cannot run" — the switch has to know before it is ever
    touched, not discover it on click. `google.maps.importLibrary('maps3d')`
    resolving is not by itself proof the browser can draw 3D: the prototype's
    own finding is that some browsers resolve the library and never register
    `<gmp-map-3d>` (no WebGL, hardware acceleration off), which is the
    signal actually worth trusting. */
export function use3DSupport(): Maps3DState {
  const apiLoaded = useApiIsLoaded()
  const [state, setState] = useState<Maps3DState>(CHECKING)

  useEffect(() => {
    if (!apiLoaded) return
    if (typeof google === 'undefined' || typeof google.maps?.importLibrary !== 'function') {
      setState(UNAVAILABLE)
      return
    }

    let cancelled = false
    google.maps
      .importLibrary('maps3d')
      .then((library) => {
        if (cancelled) return
        const drawable = typeof customElements !== 'undefined' && Boolean(customElements.get('gmp-map-3d'))
        setState(drawable ? { support: 'available', library } : UNAVAILABLE)
      })
      .catch(() => {
        if (!cancelled) setState(UNAVAILABLE)
      })

    return () => {
      cancelled = true
    }
  }, [apiLoaded])

  return state
}
