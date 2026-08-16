import './StatGrid.css'

const EM_DASH = '—'

export interface StatItem {
  label: string
  value: string | undefined
}

/** The six-cell stat grid — #218's trip totals block and #219's opened
    track detail draw the same shape, same type, same em-dash rule, so both
    read as one system rather than two grids that happen to look alike. */
export function StatGrid({ items }: { items: StatItem[] }) {
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <Stat key={item.label} {...item} />
      ))}
    </div>
  )
}

function Stat({ label, value }: StatItem) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={`stat__value${value === undefined ? ' stat__value--muted' : ''}`}>
        {value ?? EM_DASH}
      </span>
    </div>
  )
}
