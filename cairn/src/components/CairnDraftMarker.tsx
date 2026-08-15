import { AdvancedMarker } from '@vis.gl/react-google-maps'
import type { CairnIcon } from '../store/looseStore'
import type { LatLng } from '../map/geo'
import { CairnMarker } from './CairnMarker'
import './CairnDraftMarker.css'

interface CairnDraftMarkerProps {
  position: LatLng
  /** Follows the picker live, so the grid's effect on the marker is visible
      before anything is committed — the same "the visible consequence is
      immediate" the retype case turns on. */
  icon: CairnIcon | null
}

/** The pin that is already dropped when the create face opens — "the pin
    already placed at the clicked coordinate, selected".
 *
 * Drawn with the same `CairnMarker` every saved cairn uses rather than a
 * draft-only shape: what the user is looking at is what they will get, and
 * a second pin component would be a second place for the marker rules to
 * drift. `selected` is fixed on, because a draft pin is the only thing on
 * the map the create face is about.
 *
 * Above every other marker (`zIndex`), so a draft placed on top of a
 * cluster is still the thing you can see. */
export function CairnDraftMarker({ position, icon }: CairnDraftMarkerProps) {
  return (
    <AdvancedMarker position={position} zIndex={2}>
      <div className="cairn-draft-marker">
        <CairnMarker icon={icon} hasImage={false} selected />
      </div>
    </AdvancedMarker>
  )
}
