import { useState } from 'react'
import { RowMenu } from './RowMenu'
import { NameInput } from './NameInput'
import { TrackFaceBody } from './TrackFaceBody'
import type { ElevationProfilePoint, TrackStats } from '../kml/stats'
import type { Track } from '../kml/parse'
import './LooseFace.css'

interface TrackFaceProps {
  name: string
  /** #150 — the Drive file's own name, untouched by a rename override; the
      footnote line shows this rather than `name`, since the two diverge
      the moment a person renames the track. */
  sourceName: string
  track: Track
  stats: TrackStats
  /** The median-filtered, distance-aligned series — recorded
      (`computeElevationProfile(track.points)`) or, when the track has none
      of its own, sampled (#224). `undefined` when neither exists; the
      caller decides which, this component only decides whether to draw
      it, matching `TrackFaceBody`'s own contract. */
  profile: ElevationProfilePoint[] | undefined
  color: string
  /** #73: disconnected disables the `⋮`'s items and nothing else — the
      numbers below are derived from a track already in memory, not a
      control that could fail against a dead token. */
  disabled: boolean
  onRename: (name: string) => Promise<boolean>
  /** #226's primary action for a trip-owned track — the standing
      document's swap for `Add to a trip`, since a track in a trip is
      already in one. Mirrors the same action already offered from the
      row's own `⋮` (`TrackList`'s `Remove from trip`). */
  onRemoveFromTrip: () => void
  onDelete: () => void
}

/** #226 — the face for a track that belongs to a trip: the owned half of
    the unified track detail, reached at `/tracks/:id` the same as a loose
    track's. `LooseFace`'s `TrackBody` draws the same body
    (`TrackFaceBody`) for the loose half; the two differ only in header
    actions — a loose track's primary action is `Add to a trip`, an owned
    one's is `Remove from trip`, and `Rename`/`Delete permanently…` replace
    `Rename`/`Delete…` to match the row's own `⋮` wording (#193). */
export function TrackFace({
  name,
  sourceName,
  track,
  stats,
  profile,
  color,
  disabled,
  onRename,
  onRemoveFromTrip,
  onDelete,
}: TrackFaceProps) {
  const [editingName, setEditingName] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  async function commitName(value: string) {
    setEditingName(false)
    const trimmed = value.trim()
    // Empty commit is an aborted edit, not a saved one — same rule every
    // other name field in the app applies.
    if (trimmed.length === 0) return
    if (await onRename(trimmed)) setEditError(null)
    else setEditError(`Couldn't rename ${name} — try again.`)
  }

  return (
    <div className="loose-face">
      <div className="loose-face__body">
        <div className="loose-face__head">
          {editingName ? (
            <NameInput
              initial={name}
              onCommit={commitName}
              onCancel={() => setEditingName(false)}
              className="name-input--heading"
            />
          ) : (
            <h1 className="loose-face__name" title={name}>
              {name}
            </h1>
          )}
          <RowMenu
            label={`Actions for ${name}`}
            actions={[
              { label: 'Rename', disabled, onSelect: () => setEditingName(true) },
              { label: 'Remove from trip', disabled, onSelect: onRemoveFromTrip },
              { label: 'Delete permanently…', danger: true, disabled, onSelect: () => setConfirming(true) },
            ]}
          />
        </div>
        <p className="loose-face__kind">track · in a trip</p>
        {editError && <p className="loose-face__edit-error">{editError}</p>}

        {!confirming && (
          <button type="button" className="loose-face__primary" disabled={disabled} onClick={onRemoveFromTrip}>
            Remove from trip
          </button>
        )}

        {confirming && (
          <div className="loose-face__confirm">
            <span className="loose-face__confirm-text">Delete &quot;{name}&quot;?</span>
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

        <TrackFaceBody
          stats={stats}
          profile={profile}
          pointCount={track.points.length}
          sourceName={sourceName}
          color={color}
          name={name}
          flyoverPoints={track.points.map((point) => ({ lat: point.lat, lng: point.lon }))}
        />
      </div>
    </div>
  )
}
