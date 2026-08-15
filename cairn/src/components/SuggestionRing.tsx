import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import type { LatLng } from '../map/geo'
import './SuggestionRing.css'

interface SuggestionRingProps {
  position: LatLng
  onClick: () => void
}

/** `cairns.md`'s suggestion ring: the nearest track point by time, offered
    while a file in the placement queue has no position of its own yet.
    "Good enough to offer; not good enough to apply" — clicking it places
    the file exactly as clicking anywhere else on the map would, at this
    specific coordinate; nothing here writes a position on its own. */
export function SuggestionRing({ position, onClick }: SuggestionRingProps) {
  const map = useMap()
  if (!map) return null

  return (
    <AdvancedMarker position={position} onClick={onClick} zIndex={2}>
      <button
        type="button"
        className="suggestion-ring"
        aria-label="Place it at the suggested location"
      >
        {/* Always visible rather than revealed on hover — an offer, not a
            label (`155-cairns-replace-photos.md`'s "The suggestion ring"). */}
        <span className="suggestion-ring__chip" aria-hidden="true">
          nearest by time
        </span>
      </button>
    </AdvancedMarker>
  )
}
