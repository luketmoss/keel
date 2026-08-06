import type { StatusFilter } from '../store/tripFilters'
import './FilterChips.css'

const CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
]

/** The chip row, between the search card and the panel.

    It carries the trip status filter rather than the standing document's
    `All · Trips · Tracks · Photos`, because until #110 lands there are no
    loose tracks or photos for a kind chip to select — three of the four
    would always come back empty. The row, its placement, and the rule that
    one filter drives the list and the map together are what this issue
    establishes; #110 changes what the chips select. */
export function FilterChips({
  status,
  onChange,
}: {
  status: StatusFilter
  onChange: (status: StatusFilter) => void
}) {
  return (
    <div className="filter-chips" role="group" aria-label="Filter">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className={`filter-chips__chip${
            status === chip.value ? ' filter-chips__chip--selected' : ''
          }`}
          aria-pressed={status === chip.value}
          onClick={() => onChange(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
