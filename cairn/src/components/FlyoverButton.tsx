import { MAPS_3D_UNAVAILABLE_SENTENCE } from '../map/use3DSupport'
import { useMap3DControl } from '../map/Map3DControl'
import type { LatLng } from '../map/geo'
import './FlyoverButton.css'

interface FlyoverButtonProps {
  /** The subject's name — the accessible name is `Fly over <label>`, and the
      button's own visible text stays just `Fly over` (design note's Copy
      table: "The subject is the face you are on, so the label does not
      repeat it"). */
  label: string
  /** The subject's own geometry, flattened — whichever caller has it: a
      trip's `overview.geojson`, or a track's already-loaded points. Empty
      means "no usable geometry", which is why this renders nothing at all
      rather than a disabled button (design note's States table). */
  points: LatLng[]
}

/** 274-a-flyover-of-a-trip.md's "The control" — a secondary button beneath
    the stat grid on both `TripStats` and `TrackFaceBody`. Pressing it asks
    `Map3DControlProvider` to fly there; turning 3D on if it is off, and
    restarting if a flight is already running, are both handled entirely by
    `requestFlyover` and `Map3DSurface` — this component only asks. */
export function FlyoverButton({ label, points }: FlyoverButtonProps) {
  const { support, requestFlyover } = useMap3DControl()

  // "A subject with no usable geometry does not show the control at all,
  // rather than showing it disabled."
  if (points.length === 0) return null

  const disabled = support === 'unavailable'

  return (
    <div className="flyover-button-wrap">
      <button
        type="button"
        className="flyover-button"
        disabled={disabled}
        aria-label={`Fly over ${label}`}
        onClick={() => requestFlyover(points)}
      >
        <span className="flyover-button__glyph" aria-hidden="true">
          ⛰
        </span>
        Fly over
      </button>
      {disabled && <p className="flyover-button__caption">{MAPS_3D_UNAVAILABLE_SENTENCE}</p>}
    </div>
  )
}
