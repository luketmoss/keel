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
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      className={className}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onCommit(value)
        if (event.key === 'Escape') onCancel()
      }}
    />
  )
}
