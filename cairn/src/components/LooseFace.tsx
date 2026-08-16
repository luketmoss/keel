import { useState } from 'react'
import { AddToTripPicker, type TripChoice } from './AddToTripPicker'
import { RowMenu } from './RowMenu'
import { NameInput } from './NameInput'
import { ColorPopover } from './ColorPopover'
import { TrackFaceBody } from './TrackFaceBody'
import { trackColor, TRACK_COLORS } from '../map/palette'
import {
  ADD_DESCRIPTION_PLACEHOLDER,
  SIGNED_OUT_MOVE_MESSAGE,
  canChangeOwner,
  positionSourceSentence,
  showExport,
  type CairnIcon,
  type LooseRecord,
} from '../store/looseStore'
import { usePhotoImage } from '../photo/usePhotoImage'
import { IconPicker } from './IconPicker'
import { DescriptionInput } from './DescriptionInput'
import { useEditableCairnText } from './useEditableCairnText'
import './LooseFace.css'

interface LooseFaceProps {
  item: LooseRecord
  trips: TripChoice[]
  /** #134: resolves a photo's thumbnail through #53's caching loader —
      `null` renders the box's existing `--surface-lift` fill, same as a
      thumbnail that hasn't arrived yet. Unused for a track. */
  accessToken: string | null
  onAddToTrip: (tripId: string) => void
  onCreateTripWith: (name: string) => void
  onDelete: () => void
  /** #133: renames or recolours the item. Resolves `false` on a save
      failure, which the face reverts from. */
  onRename: (id: string, name: string) => Promise<boolean>
  onRecolor: (id: string, color: number) => Promise<boolean>
  /** #156: retypes the cairn. Writes `icon` and nothing else — its image,
      position, `positionSource` and date are untouched, which is what lets
      a photo become a campsite without becoming a different record.
      Resolves `false` on a save failure, which the face reports. */
  onSetIcon: (id: string, icon: CairnIcon | null) => Promise<boolean>
  /** #196: writes a cairn's description. Here rather than only on the trip
      face because `shell-and-content-model.md` is explicit that adding a
      cairn to a trip is a move and not a promotion — a capability that
      appears or disappears with ownership breaks that in both directions.
      Resolves `false` on a failed write, which the face reverts from.
      Unused for a track. */
  onSetDescription?: (id: string, description: string) => Promise<boolean>
  /** #140: downloads the item's source file. Fire-and-forget from here —
      the face has nothing further to show while it runs; failure is a
      toast, owned by `App`. */
  onExport: (id: string) => void
  /** #140: this item's export is already in flight, so `Export` goes to
      the Disabled treatment rather than starting a second download. */
  exporting?: boolean
  /** #73: no usable token — moving, deleting, renaming and recolouring all
      go to the Disabled treatment rather than failing against a store that
      will refuse. */
  disabled: boolean
  busy?: boolean
  error?: string | null
  /** #157: true while a dropped photo is uploading onto this cairn. Unused
      for a track. */
  attaching?: boolean
  /** #157: the image slot's failure line, or `null`. Unused for a track. */
  attachError?: string | null
  /** #158: a drag's write failure, or `null`. The marker has already
      reverted by the time this shows. Unused for a track — trip and track
      markers do not drag. */
  moveWriteError?: string | null
}

/** The panel's face for a track or a photo that belongs to no trip.
 *
 * One component for both kinds: they share a header shape, a primary action
 * and a `⋮`, and differ only in the body. Two components would be two
 * places to keep that shape in step. */
export function LooseFace({
  item,
  trips,
  accessToken,
  onAddToTrip,
  onCreateTripWith,
  onDelete,
  onRename,
  onRecolor,
  onSetIcon,
  onSetDescription,
  onExport,
  exporting,
  disabled,
  busy,
  error,
  attaching,
  attachError,
  moveWriteError,
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

  async function selectIcon(icon: CairnIcon | null) {
    if (await onSetIcon(item.id, icon)) setEditError(null)
    else setEditError("Couldn't save the icon — try again.")
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
              ...(showExport(item)
                ? [
                    {
                      label: 'Export',
                      disabled: disabled || !canMove || exporting,
                      onSelect: () => onExport(item.id),
                    },
                  ]
                : []),
              { label: 'Delete…', danger: true, disabled, onSelect: () => setConfirming(true) },
            ]}
          />
          {/* #226 — the inline swatch (and its own popover) moved off
              `TrackBody`, which no longer draws a colour cell the design
              note's face diagram doesn't show; `Change colour` in the `⋮`
              above is the one remaining affordance, and this is what it
              opens, anchored to the head it sits in. */}
          {item.kind === 'track' && colorPickerOpen && (
            <ColorPopover
              name={item.name}
              currentColorIndex={item.colorIndex % TRACK_COLORS.length}
              onSelect={selectColor}
              onClose={() => setColorPickerOpen(false)}
              align="right"
            />
          )}
        </div>
        <p className="loose-face__kind">
          {item.kind === 'track' ? 'track · not in a trip' : 'cairn · not in a trip'}
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
          <TrackBody item={item} />
        ) : (
          <CairnBody
            item={item}
            accessToken={accessToken}
            onSelectIcon={selectIcon}
            /* #196: `undefined` takes the description to the Disabled
               treatment, the same gate the icon grid beside it already
               uses — disconnected, or a cairn whose files have not landed
               yet and so has no record in Drive to rewrite. */
            onSaveDescription={
              onSetDescription && !disabled && canMove
                ? (description) => onSetDescription(item.id, description)
                : undefined
            }
            disabled={disabled || !canMove}
            attaching={attaching}
            attachError={attachError}
            moveWriteError={moveWriteError}
            signedOut={disabled}
          />
        )}
      </div>
    </div>
  )
}

/** #226 — the loose half of the unified track face body. The loose store
    keeps no raw `Track` points around to compute stats or a profile from
    (the performance rule forbids loading full-resolution geometry for
    anything the map draws), so this reads the numbers `kml/stats.ts`'s
    `aggregateTrackStats`/`aggregateElevationProfile` already computed once,
    at import, and stored on the record — `TrackFace`'s trip-owned sibling
    computes the same shape from a `Track` it already holds in memory. */
function TrackBody({ item }: { item: Extract<LooseRecord, { kind: 'track' }> }) {
  return (
    <TrackFaceBody
      stats={{
        distanceMeters: item.distanceMeters,
        durationSeconds: item.durationSeconds ?? undefined,
        elevationGainMeters: item.ascentMeters ?? undefined,
        elevationLossMeters: item.elevationLossMeters ?? undefined,
        highPointMeters: item.highPointMeters ?? undefined,
        lowPointMeters: item.lowPointMeters ?? undefined,
      }}
      profile={item.elevationProfile ?? undefined}
      pointCount={item.pointCount}
      sourceName={item.sourceName}
      color={trackColor(item.colorIndex)}
    />
  )
}

function CairnBody({
  item,
  accessToken,
  onSelectIcon,
  onSaveDescription,
  disabled,
  attaching,
  attachError,
  moveWriteError,
  signedOut,
}: {
  item: Extract<LooseRecord, { kind: 'cairn' }>
  accessToken: string | null
  onSelectIcon: (icon: CairnIcon | null) => void
  onSaveDescription?: (description: string) => Promise<boolean>
  disabled: boolean
  attaching?: boolean
  attachError?: string | null
  moveWriteError?: string | null
  signedOut?: boolean
}) {
  /* #196 — the same state machine the lightbox uses, so the two surfaces
     cannot drift on the saved flash or the failure line. Only the
     description half is used here: a loose cairn's name has been editable
     since #133, through the `⋮`'s Rename, and that is untouched. */
  const text = useEditableCairnText(
    onSaveDescription && ((patch) => onSaveDescription(patch.description ?? '')),
  )
  // #134: loading and failed both render the same `--surface-lift`
  // fallback fill — `usePhotoImage` already collapses those two into one
  // `undefined` for exactly this reason, matching `CairnList`'s own stance.
  const thumbnailUrl = usePhotoImage(accessToken, item.image?.thumbnailDriveFileId).url
  // #157: the slot appears the moment an upload starts, even for a cairn
  // that has never carried an image — and disappears again if that attach
  // fails, since there is then nothing to show.
  const showImageSlot = item.image !== null || attaching
  return (
    <>
      {showImageSlot && (
        <div className="loose-face__image" role="img" aria-label={item.name} aria-busy={attaching || undefined}>
          {thumbnailUrl && (
            <img src={thumbnailUrl} alt="" className={attaching ? 'loose-face__image--replacing' : undefined} />
          )}
          {attaching && <span className="loose-face__image-uploading">uploading…</span>}
        </div>
      )}
      {attachError && (
        <p className="loose-face__attach-error" aria-live="polite">
          {attachError}
        </p>
      )}
      {/* A cairn always has a position (`cairns.md`) — there is no
          "no location" state left to render here. */}
      <dl className="loose-face__stats">
        <div className="loose-face__stat">
          <dt>Position</dt>
          <dd>
            {item.position.lat.toFixed(5)}, {item.position.lng.toFixed(5)}
          </dd>
        </div>
        <div className="loose-face__stat">
          <dt>Taken</dt>
          <dd>{item.date ?? '—'}</dd>
        </div>
      </dl>
      {/* #156: the same grid the create face shows, under the same label.
          Choosing one writes `icon` and nothing else — and the visible
          consequence is the point of the change: a photo with an icon
          stops drawing as a thumbnail and starts drawing as a pin with a
          camera badge, in the map and in its row together. */}
      <span className="loose-face__field-label">What is this place</span>
      <IconPicker
        label="What is this place"
        value={item.icon}
        onChange={onSelectIcon}
        disabled={disabled}
      />
      <p className="loose-face__position-source">{positionSourceSentence(item.positionSource)}</p>
      {/* #158 — one sentence per surface (#73), not a tooltip per marker. */}
      {signedOut && <p className="loose-face__signed-out">{SIGNED_OUT_MOVE_MESSAGE}</p>}
      {moveWriteError && (
        <p className="loose-face__move-error" aria-live="polite">
          {moveWriteError}
        </p>
      )}
      {/* #196 — click-to-edit, under identical rules and identical copy to
          the trip face's. An empty description now shows the placeholder
          rather than nothing: the field was previously undiscoverable when
          empty, which is exactly when it most needs finding. */}
      {text.editing === 'description' ? (
        <DescriptionInput
          initial={item.description}
          className="description-input loose-face__description-input"
          onCommit={(value) => void text.commit('description', { description: value })}
          onCancel={text.cancelEditing}
        />
      ) : (
        <p
          className={`loose-face__description${item.description ? '' : ' loose-face__description--empty'}${
            text.editable ? ' loose-face__description--editable' : ''
          }${text.savedField === 'description' ? ' loose-face__field--saved' : ''}`}
          onClick={() => text.startEditing('description')}
        >
          {item.description || ADD_DESCRIPTION_PLACEHOLDER}
        </p>
      )}
      {text.errorFor('description') && (
        <p className="loose-face__edit-error">{text.errorFor('description')}</p>
      )}
    </>
  )
}
