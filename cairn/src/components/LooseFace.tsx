import { useState } from 'react'
import { AddToTripPicker, type TripChoice } from './AddToTripPicker'
import { RowMenu } from './RowMenu'
import { formatDistance } from '../format/units'
import { trackColor } from '../map/palette'
import { canChangeOwner, type LooseRecord } from '../store/looseStore'
import './LooseFace.css'

interface LooseFaceProps {
  item: LooseRecord
  trips: TripChoice[]
  onAddToTrip: (tripId: string) => void
  onCreateTripWith: (name: string) => void
  onDelete: () => void
  /** #73: no usable token — moving and deleting both go to the Disabled
      treatment rather than failing against a store that will refuse. */
  disabled: boolean
  busy?: boolean
  error?: string | null
}

/** The panel's face for a track or a photo that belongs to no trip.
 *
 * One component for both kinds: they share a header shape, a primary action
 * and a `⋮`, and differ only in the body. Two components would be two
 * places to keep that shape in step. */
export function LooseFace({
  item,
  trips,
  onAddToTrip,
  onCreateTripWith,
  onDelete,
  disabled,
  busy,
  error,
}: LooseFaceProps) {
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /* #120: `Add to a trip` is a file move, so an item whose file is still
     uploading — or never arrived — has nothing to move. No tooltip: the
     meta line on its row already says which, which is #73's one-sentence-
     per-surface rule rather than a tooltip per control. `Delete…` stays
     enabled in both states; an item that failed to upload is exactly the
     one a user most wants rid of. */
  const canMove = canChangeOwner(item)

  return (
    <div className="loose-face">
      <div className="loose-face__body">
        <div className="loose-face__head">
          <h1 className="loose-face__name" title={item.name}>
            {item.name}
          </h1>
          <RowMenu
            label={`Actions for ${item.name}`}
            actions={[
              { label: 'Add to a trip…', disabled: disabled || !canMove, onSelect: () => setPicking(true) },
              { label: 'Delete…', danger: true, disabled, onSelect: () => setConfirming(true) },
            ]}
          />
        </div>
        <p className="loose-face__kind">
          {item.kind === 'track' ? 'track · not in a trip' : 'photo · not in a trip'}
        </p>

        {!picking && (
          <button
            type="button"
            className="loose-face__primary"
            disabled={disabled || !canMove}
            onClick={() => setPicking(true)}
          >
            Add to a trip
          </button>
        )}

        {picking && (
          <AddToTripPicker
            trips={trips}
            busy={busy}
            error={error}
            onChoose={(tripId) => onAddToTrip(tripId)}
            onCreate={(name) => onCreateTripWith(name)}
            onCancel={() => setPicking(false)}
          />
        )}

        {confirming && (
          <div className="loose-face__confirm">
            <span className="loose-face__confirm-text">Delete &quot;{item.name}&quot;?</span>
            <div className="loose-face__confirm-actions">
              <button
                type="button"
                className="loose-face__confirm-delete"
                onClick={() => {
                  setConfirming(false)
                  onDelete()
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="loose-face__confirm-cancel"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {item.kind === 'track' ? <TrackBody item={item} /> : <PhotoBody item={item} />}
      </div>
    </div>
  )
}

function TrackBody({ item }: { item: Extract<LooseRecord, { kind: 'track' }> }) {
  return (
    <dl className="loose-face__stats">
      <div className="loose-face__stat">
        <dt>Distance</dt>
        <dd>{formatDistance(item.distanceMeters)}</dd>
      </div>
      <div className="loose-face__stat">
        <dt>Ascent</dt>
        <dd>{item.ascentMeters === null ? '—' : `${Math.round(item.ascentMeters)} m`}</dd>
      </div>
      <div className="loose-face__stat">
        <dt>Points</dt>
        <dd>{item.pointCount}</dd>
      </div>
      <div className="loose-face__stat">
        <dt>Source</dt>
        <dd title={item.sourceName}>{item.sourceName}</dd>
      </div>
      <div className="loose-face__stat">
        <dt>Colour</dt>
        <dd>
          <span
            className="loose-face__swatch"
            style={{ background: trackColor(item.colorIndex) }}
            aria-hidden="true"
          />
        </dd>
      </div>
    </dl>
  )
}

function PhotoBody({ item }: { item: Extract<LooseRecord, { kind: 'photo' }> }) {
  return (
    <>
      <div className="loose-face__image" role="img" aria-label={item.name} />
      {item.position ? (
        <dl className="loose-face__stats">
          <div className="loose-face__stat">
            <dt>Position</dt>
            <dd>
              {item.position.lat.toFixed(5)}, {item.position.lng.toFixed(5)}
            </dd>
          </div>
          <div className="loose-face__stat">
            <dt>From</dt>
            <dd>EXIF GPS</dd>
          </div>
          <div className="loose-face__stat">
            <dt>Taken</dt>
            <dd>{item.takenAt ?? '—'}</dd>
          </div>
        </dl>
      ) : (
        /* The one genuinely awkward state in the model, and it gets words
           rather than an error. */
        <div className="loose-face__unplaced">
          <p className="loose-face__unplaced-title">No location</p>
          <p className="loose-face__unplaced-detail">
            It has no GPS and no trip to interpolate against, so it is in your list but not on the
            map. Adding it to a trip whose tracks cover its timestamp will place it.
          </p>
        </div>
      )}
    </>
  )
}
