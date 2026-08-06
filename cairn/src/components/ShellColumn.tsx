import type { ReactNode } from 'react'
import './ShellColumn.css'

interface ShellColumnProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The edge tab is a property of the list, so it is not rendered on a
      detail — #109's design note: "Collapsing while a detail is open. Not
      possible." */
  collapsible: boolean
  searchCard: ReactNode
  /** Hidden while a detail is open and while a draft is open; the caller
      passes `null` rather than this component deciding. */
  chips: ReactNode
  children: ReactNode
}

/** The one column: search card, chips, panel, `--space-4` from the top,
    left and bottom edges. Everything else on screen belongs to the map.

    Collapsing moves it with a transform rather than animating its width —
    a width transition relayouts the panel's contents on every frame, and
    the map behind it does not need to reflow at all. */
export function ShellColumn({
  collapsed,
  onToggleCollapsed,
  collapsible,
  searchCard,
  chips,
  children,
}: ShellColumnProps) {
  return (
    <div className={`shell-column${collapsed ? ' shell-column--collapsed' : ''}`}>
      <div className="shell-column__stack">
        {searchCard}
        {chips}
        <div className="shell-column__panel">{children}</div>
      </div>
      {collapsible && (
        <button
          type="button"
          className="shell-column__tab"
          aria-label={collapsed ? 'Show panel' : 'Collapse panel'}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
        </button>
      )}
    </div>
  )
}
