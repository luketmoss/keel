import { useEffect, useState } from 'react'
import {
  discardLabel,
  placementQueueSummary,
  type PlacementQueueState,
} from '../import/placementQueue'
import './PlacementQueuePanel.css'

interface PlacementQueuePanelProps {
  queue: PlacementQueueState
  /** Whether the current file has a suggestion ring on the map — flips the
      note text between "click it or the ring" and "no track covers this,
      click the map" (`155-cairns-replace-photos.md`'s two Note strings). */
  hasSuggestion: boolean
  onSkip: () => void
  onDiscard: () => void
}

/** A dropped file's local preview, straight from the browser — nothing has
    reached Drive yet, so there is no `usePhotoImage`/caching-loader url to
    resolve, only the `File` object itself. Revoked on unmount and on every
    file change, so the queue doesn't leak an object URL per file it walks
    through. */
function useLocalPreview(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return url
}

/** `cairns.md`'s "The placement queue" / `155-cairns-replace-photos.md`'s
    "The placement face" — replaces the panel's list face for as long as
    anything is waiting to be placed. The map itself (crosshair cursor,
    click-to-place, the suggestion ring) is the shell's to draw, since it
    already owns the one map instance; this component is the panel side
    only. */
export function PlacementQueuePanel({ queue, hasSuggestion, onSkip, onDiscard }: PlacementQueuePanelProps) {
  const current = queue.items[0]
  const preview = useLocalPreview(current?.file ?? EMPTY_FILE)

  if (!current) return null

  const remaining = queue.items.length

  return (
    <div className="placement-queue">
      <div className="placement-queue__body">
        <div className="placement-queue__eyebrow">Not saved</div>
        <PlacementQueueBar queue={queue} />
        <p className="placement-queue__summary">{placementQueueSummary(queue)}</p>

        <div className="placement-queue__image">
          {preview && <img src={preview} alt="" />}
        </div>
        <p className="placement-queue__filename">
          {current.name}
          {current.captureLabel && <> · {current.captureLabel}</>}
        </p>

        <p className="placement-queue__note">
          {hasSuggestion
            ? 'Click the map to place it, or click the pulsing ring — the nearest point on your route by time.'
            : 'No GPS, and no track covers its timestamp. Click the map to place it.'}
        </p>

        <div className="placement-queue__actions">
          <button type="button" className="placement-queue__skip" onClick={onSkip} disabled={remaining <= 1}>
            Skip this one
          </button>
          <button type="button" className="placement-queue__discard" onClick={onDiscard}>
            {discardLabel(queue)}
          </button>
        </div>

        <p className="placement-queue__reassurance">
          These {remaining} are not in your library and nothing has been written to Drive. Placing one
          is what makes it a cairn; discarding means they were never imported.
        </p>
      </div>
    </div>
  )
}

// A stable placeholder so `useLocalPreview` always has a hook call with a
// `File` argument even for the one render where `current` is briefly
// undefined (the queue just emptied) — an empty file never resolves to a
// visible image, so nothing is shown, which is correct since the component
// returns `null` in that case anyway.
const EMPTY_FILE = new File([], '')

function PlacementQueueBar({ queue }: { queue: PlacementQueueState }) {
  const cells = Array.from({ length: queue.totalCount }, (_, index) => {
    if (index < queue.placedCount) return 'placed'
    if (index === queue.placedCount) return 'current'
    return 'pending'
  })

  return (
    <div className="placement-queue__bar" role="img" aria-label={placementQueueSummary(queue)}>
      {cells.map((state, index) => (
        <span key={index} className={`placement-queue__cell placement-queue__cell--${state}`} />
      ))}
    </div>
  )
}
