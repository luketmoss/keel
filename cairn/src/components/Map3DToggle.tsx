import { MAPS_3D_UNAVAILABLE_SENTENCE, type Maps3DSupport } from '../map/use3DSupport'
import './Map3DToggle.css'

/** #271's line, relocated rather than rewritten — #73's rule is one
    sentence per surface, and while 3D is on this is that surface's one
    sentence: a trip's photos silently vanishing when a switch is flipped
    reads as a bug and gets reported as one. #273 deletes it. */
const CAIRNS_NOT_IN_3D_YET = "Cairns don't show in 3D yet."

const TITLE = {
  off: 'Stand the terrain up',
  on: 'Return to the flat map',
  unavailable: MAPS_3D_UNAVAILABLE_SENTENCE,
}

/** #284 — 3D's own control, a sibling of `LayersControl` in the bottom-left
    cluster rather than a switch filed inside it. #271 put 3D in the layers
    panel with a permanent "Satellite only" caption explaining why it
    mostly couldn't be used; this control simply isn't there except where
    it can be, which says the same thing without a sentence.

    Google's basemap control doesn't own 3D either — 3D sits by the compass,
    its own thing, present only in satellite. This is that idea in cairn's
    own bottom-left corner rather than Google's bottom-right, because the
    zoom cluster already living there is Google's own chrome and not ours to
    dock custom controls against (#104-basemap-toggle.md's stylesheet
    arithmetic is exactly the mistake that would repeat). */
export function Map3DToggle({
  visible,
  on,
  onChange,
  support,
}: {
  /** Only ever true on Satellite — the caller decides, since that's also
      what decides the basemap tiles. */
  visible: boolean
  on: boolean
  onChange: (next: boolean) => void
  support: Maps3DSupport
}) {
  if (!visible) return null

  /* `'checking'` reads as enabled — the library resolves fast enough that
     flashing disabled-then-enabled on every load would be worse than the
     rare click that lands half a beat before the answer is in. */
  const available = support !== 'unavailable'
  const title = !available ? TITLE.unavailable : on ? TITLE.on : TITLE.off
  const caption = !available ? MAPS_3D_UNAVAILABLE_SENTENCE : on ? CAIRNS_NOT_IN_3D_YET : null

  return (
    <div className="map-3d-toggle">
      {caption && <p className="map-3d-toggle__caption">{caption}</p>}
      {/* `title` on a `disabled` button does not reach the pointer in every
          browser, so it goes on the wrapper — the same fix
          `.track-row__swatch-wrap` carries for #199, and `LayersControl`'s
          Labels switch carries for #263. */}
      <span className="map-3d-toggle__wrap" title={title}>
        <button
          type="button"
          className="map-3d-toggle__button"
          role="switch"
          aria-checked={on}
          aria-label="3D"
          disabled={!available}
          onClick={() => onChange(!on)}
        >
          3D
        </button>
      </span>
    </div>
  )
}
