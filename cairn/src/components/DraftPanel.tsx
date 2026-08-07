import type { TripRecord, TripStatus, TripUpdate } from '../store/tripStore'
import type { DraftState } from '../import/useDraftTrip'
import { TripMetadataHeader } from './TripMetadataHeader'
import './DraftPanel.css'

interface DraftPanelProps {
  draft: DraftState
  updateName: (name: string) => void
  updateStatus: (status: TripStatus) => void
  updateDates: (startDate: string | null, endDate: string | null) => void
  updateNotes: (notes: string) => void
  onSave: () => void
  onCancel: () => void
  /** #110: imports the draft's files as loose tracks instead of creating a
      trip to hold them. Discards nothing — `Cancel` is still the one that
      does that. */
  onKeepLoose: () => void
  /** #81's "Signed out" state: the route and form still work, but `Save`
      is replaced by a control that opens the same sign-in flow the
      account bubble does — a drop must never be silently swallowed just
      because nobody's signed in (the fault #75 exists to close). */
  signedIn: boolean
  onSignIn: () => void
}

function fileSummary(draft: DraftState): string {
  const trackCount = draft.files.reduce((sum, file) => sum + file.tracks.length, 0)
  const trackWord = trackCount === 1 ? 'track' : 'tracks'
  if (draft.files.length === 1) {
    return `${draft.files[0].name} · ${trackCount} ${trackWord}`
  }
  return `${draft.files.length} files · ${trackCount} ${trackWord}`
}

/** Right-docked over the map — mirrors the trips panel's left dock (#80)
    so the two never collide — holding a trip that doesn't exist yet.
    Reuses `TripMetadataHeader` (#35) rather than a bespoke form: the
    fields are identical, and a second form would drift from the first. */
export function DraftPanel({
  draft,
  updateName,
  updateStatus,
  updateDates,
  updateNotes,
  onSave,
  onCancel,
  onKeepLoose,
  signedIn,
  onSignIn,
}: DraftPanelProps) {
  // A plain object shaped like a `TripRecord` — `TripMetadataHeader` only
  // ever reads it and calls `onUpdate`, and never touches a store, so
  // nothing here needs `id`/`createdAt` to mean anything beyond satisfying
  // the type.
  const syntheticTrip: TripRecord = {
    id: 'draft',
    // A draft holds no photos and has no `photos.json` to have counted.
    photoCount: null,
    name: draft.name,
    status: draft.status,
    startDate: draft.startDate,
    endDate: draft.endDate,
    notes: draft.notes,
    createdAt: new Date().toISOString(),
    origin: null,
  }

  async function handleUpdate(patch: TripUpdate): Promise<TripRecord | null> {
    if (patch.name !== undefined) updateName(patch.name)
    if (patch.status !== undefined) updateStatus(patch.status)
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      updateDates(
        patch.startDate !== undefined ? patch.startDate : draft.startDate,
        patch.endDate !== undefined ? patch.endDate : draft.endDate,
      )
    }
    if (patch.notes !== undefined) updateNotes(patch.notes)
    return { ...syntheticTrip, ...patch }
  }

  const canSave = draft.name.trim().length > 0 && !draft.saving

  return (
    <div className="draft-panel">
      <div className="draft-panel__eyebrow">NOT SAVED</div>
      <p className="draft-panel__summary">{fileSummary(draft)}</p>
      <div className="draft-panel__body">
        <TripMetadataHeader trip={syntheticTrip} onUpdate={handleUpdate} />
      </div>
      {draft.saveError && <p className="draft-panel__error">{draft.saveError}</p>}
      <div className="draft-panel__actions">
        <button
          type="button"
          className="draft-panel__cancel"
          onClick={onCancel}
          disabled={draft.saving}
        >
          Cancel
        </button>
        {/* #110: not becoming a trip is now a valid outcome. The tracks
            land on the map on their own instead, and `Add to a trip` on any
            of them — which offers a new one — is the way back to here. */}
        <button
          type="button"
          className="draft-panel__keep-loose"
          onClick={onKeepLoose}
          disabled={draft.saving}
        >
          Keep loose
        </button>
        {signedIn ? (
          <button
            type="button"
            className="draft-panel__save"
            onClick={onSave}
            disabled={!canSave}
          >
            {draft.saving ? 'Saving…' : 'Save'}
          </button>
        ) : (
          <button type="button" className="draft-panel__save" onClick={onSignIn}>
            Sign in to save
          </button>
        )}
      </div>
    </div>
  )
}
