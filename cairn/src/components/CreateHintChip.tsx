import { useEffect, useState } from 'react'
import './CreateHintChip.css'

/** `156-creating-a-cairn.md`: "It appears 900ms after first load". Late
    enough that it is not part of the app arriving, early enough to be seen
    before the user has decided there is nothing to do here. */
const APPEAR_AFTER_MS = 900

interface CreateHintChipProps {
  /** Hidden once a cairn has been placed — the hint has done its job, and a
      permanent chip over the map would be chrome spent on something the
      user has demonstrably learned. Also hidden while any face that owns
      the map is open, since the gesture is unavailable then. */
  visible: boolean
}

/** The create gesture's hint.
 *
 * **This is a placeholder, not an affordance.** Right-click is
 * undiscoverable, this issue does not fix that, and the design note records
 * it as a gap owed a real answer rather than one this chip closes —
 * a sentence telling you about a gesture is documentation on screen. The
 * candidates already considered and rejected are in the note; a follow-up
 * owes the actual control. */
export function CreateHintChip({ visible }: CreateHintChipProps) {
  const [elapsed, setElapsed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), APPEAR_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!elapsed || !visible) return null

  return (
    <div className="create-hint" role="note">
      Right-click the map to place a cairn
      <span className="create-hint__touch">long-press on touch</span>
    </div>
  )
}
