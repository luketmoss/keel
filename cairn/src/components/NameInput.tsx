import { useState } from 'react'
import './NameInput.css'

/** An editable name, in place of whatever text it replaces — no dialog, no
    second surface. Commits on blur or `Enter`; `Escape` cancels. An empty
    or whitespace-only commit is left to the caller to treat as "nothing
    changed" (`LooseStore.update` and `TripStore.updateTrip` both already
    do), so this component only ever reports the raw value.
 *
 * Shared by `TripsPanel`'s row and `LooseFace`'s heading (#133) — the same
 * control at two sizes, via `className`. `TrackList` keeps its own copy
 * (#46, predating this one) rather than being refactored onto it here. */
export function NameInput({
  initial,
  onCommit,
  onCancel,
  className = 'name-input',
  ariaLabel,
  selectOnFocus = false,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
  /** #196: the cairn detail face's name has no visible label beside it —
      it *is* the heading — so it carries its own. Omitted elsewhere, where
      the surrounding row already names what is being renamed. */
  ariaLabel?: string
  /** #196: select the contents on focus, so the first keystroke replaces
      the name rather than appending to it. Opt-in rather than the default
      because #133's rename from a `⋮` action is as often a small
      correction as a replacement, and this would make that a retype. */
  selectOnFocus?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      className={className}
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => {
        if (selectOnFocus) event.target.select()
      }}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(value)
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}
