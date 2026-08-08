import { useState } from 'react'
import { AddToTripPicker, type TripChoice } from './AddToTripPicker'
import { RowMenu } from './RowMenu'
import { NameInput } from './NameInput'
import { ColorPopover } from './ColorPopover'
import { formatDistance } from '../format/units'
import { trackColor, TRACK_COLORS } from '../map/palette'
import { canChangeOwner, type LooseRecord } from '../store/looseStore'
import './LooseFace.css'

interface LooseFaceProps {
  item: LooseRecord
  trips: TripChoice[]
  onAddToTrip: (tripId: string) => void
  onCreateTripWith: (name: string) => void
  onDelete: () => void
  /** #133: renames or recolours the item. Resolves `false` on a save
      failure, which the face reverts from. */
  onRename: (id: string, name: string) => Promise<boolean>
  onRecolor: (id: string, color: number) => Promise<boolean>
  /** #73: no usable token — moving, deleting, renaming and recolouring all
      go to the Disabled treatment rather than failing against a store that
      will refuse. */
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
  onRename,
  onRecolor,
  disabled,
  busy,
  error,
}: LooseFaceProps) {
  const [picking, setPicking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  /* #120: `Add to a trip` is a file move, so an item whose file is still
     uploading — or never arrived — has nothing to move. No tooltip: the
     meta line on its row already says which, which is #73's one-sentence-
     per-surface rule rather than a tooltip per control. `Delete…` stays
     enabled in both states; an item that failed to upload is exactly the
     one a user most wants rid of. #133's rename/recolour share the same
     gate — there is no record file in Drive yet to rewrite. */
  const canMove = canChangeOwner(item)

  async function commitName(value: string) {
    setEditingName(false)
    const trimmed = value.trim()
    // Empty commit is an aborted edit, not a saved one.
    if (trimmed.length === 0) return
    if (await onRename(item.id, trimmed)) setEditError(null)
    else setEditError(`Couldn't rename ${item.name} — try again.`)
  }

  async function selectColor(index: number) {
    setColorPickerOpen(false)
    if (await onRecolor(item.id, index)) setEditError(null)
    else setEditError("Couldn't save the colour — try again.")
  }

  return (
    <div className="loose-face">
      <div className="loose-face__body">
        <div className="loose-face__head">
          {editingName ? (
            <NameInput
              initial={item.name}
              onCommit={commitName}
              onCancel={() => setEditingName(false)}
              className="name-input--heading"
            />
          ) : (
            <h1 className="loose-face__name" title={item.name}>
              {item.name}
            </h1>
          )}
          <RowMenu
            label={`Actions for ${item.name}`}
            actions={[
              { label: 'Add to a trip…', disabled: disabled || !canMove, onSelect: () => setPicking(true) },
              { label: 'Rename', disabled: disabled || !canMove, onSelect: () => setEditingName(true) },
              ...(item.kind === 'track'
                ? [
                    {
                      label: 'Change colour',
                      disabled: disabled || !canMove,
                      onSelect: () => setColorPickerOpen(true),
                    },
                  ]
                : []),
              { label: 'Delete…', danger: true, disabled, onSelect: () => setConfirming(true) },
            ]}
          />
        </div>
        <p className="loose-face__kind">
          {item.kind === 'track' ? 'track · not in a trip' : 'photo · not in a trip'}
        </p>
        {editError && <p className="loose-face__edit-error">{editError}</p>}

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

        {item.kind === 'track' ? (
          <TrackBody
            item={item}
            colorPickerOpen={colorPickerOpen}
            onOpenColorPicker={() => setColorPickerOpen(true)}
            onCloseColorPicker={() => setColorPickerOpen(false)}
            onSelectColor={selectColor}
            disabled={disabled}
          />
        ) : (
          <PhotoBody item={item} />
        )}
      </div>
    </div>
  )
}

function TrackBody({
  item,
  colorPickerOpen,
  onOpenColorPicker,
  onCloseColorPicker,
  onSelectColor,
  disabled,
}: {
  item: Extract<LooseRecord, { kind: 'track' }>
  colorPickerOpen: boolean
  onOpenColorPicker: () => void
  onCloseColorPicker: () => void
  onSelectColor: (index: number) => void
  disabled: boolean
}) {
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
          <span className="loose-face__swatch-wrap">
            <button
              type="button"
              className="loose-face__swatch-button"
              aria-label={`Change colour for ${item.name}`}
              disabled={disabled}
              onClick={onOpenColorPicker}
            >
              <span
                className="loose-face__swatch"
                style={{ background: trackColor(item.colorIndex) }}
                aria-hidden="true"
              />
            </button>
            {colorPickerOpen && (
              <ColorPopover
                name={item.name}
                currentColorIndex={item.colorIndex % TRACK_COLORS.length}
                onSelect={onSelectColor}
                onClose={onCloseColorPicker}
              />
            )}
          </span>
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
