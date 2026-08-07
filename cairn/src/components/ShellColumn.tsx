import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { useIsPhone } from '../map/useIsPhone'
import './ShellColumn.css'

interface ShellColumnProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The edge tab is a property of the list, so it is not rendered on a
      detail — #109's design note: "Collapsing while a detail is open. Not
      possible." On phone this is also what tells the sheet to hold full:
      a detail and a draft both suspend the detents. */
  collapsible: boolean
  searchCard: ReactNode
  /** Hidden while a detail is open and while a draft is open; the caller
      passes `null` rather than this component deciding. */
  chips: ReactNode
  children: ReactNode
}

/** The shell's one column — or, below the phone breakpoint, its sheet.
    Everything inside is identical either way: same search card, same chips,
    same rows, same faces. Only the container changes, which is why the two
    are one component rather than two layouts to keep in step.

    On desktop, collapsing moves the column with a transform rather than
    animating its width — a width transition relayouts the panel's contents
    on every frame, and the map behind it does not need to reflow at all. */
export function ShellColumn({
  collapsed,
  onToggleCollapsed,
  collapsible,
  searchCard,
  chips,
  children,
}: ShellColumnProps) {
  const isPhone = useIsPhone()

  if (isPhone) {
    return (
      <BottomSheet forceFull={!collapsible} searchCard={searchCard} chips={chips}>
        {children}
      </BottomSheet>
    )
  }

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
