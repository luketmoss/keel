import './FilterChips.css'

/** What the list and the map are showing. One filter drives both — a chip
    that hid rows but left markers would be two truths about the same
    question. */
export type KindFilter = 'all' | 'trips' | 'tracks' | 'cairns'

const CHIPS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'trips', label: 'Trips' },
  { value: 'tracks', label: 'Tracks' },
  { value: 'cairns', label: 'Cairns' },
]

/** The header the list shows for each chip. It always names what you are
    looking at, and "loose" is said out loud rather than left implied — a
    list headed "Tracks" that excluded a trip's tracks would be lying.

    `cairns.md`'s "Panel titles" keeps the active-chip title plain
    (`Cairns`, not "Loose cairns") — the facet row that would need "loose"
    said out loud for a mixed icon/photo filter is #159's, not this one's. */
export const LIST_HEADINGS: Record<KindFilter, string> = {
  all: 'Everything',
  trips: 'Trips',
  tracks: 'Loose tracks',
  cairns: 'Cairns',
}

/** The chip row, between the search card and the panel. */
export function FilterChips({
  kind,
  onChange,
}: {
  kind: KindFilter
  onChange: (kind: KindFilter) => void
}) {
  return (
    <div className="filter-chips" role="group" aria-label="Filter">
      {CHIPS.map((chip) => (
        <button
          key={chip.value}
          type="button"
          className={`filter-chips__chip${kind === chip.value ? ' filter-chips__chip--selected' : ''}`}
          aria-pressed={kind === chip.value}
          onClick={() => onChange(chip.value)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
