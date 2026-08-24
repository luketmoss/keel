import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { useIsPhone } from '../map/useIsPhone'
import './ShellColumn.css'

interface ShellColumnProps {
  /** #274 — forwarded straight to `BottomSheet`; desktop ignores it. */
  flyoverToken?: number
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The edge tab is a property of the list, so it is not rendered on a
      detail — #109's design note: "Collapsing while a detail is open. Not
      possible." Desktop only: the sheet used to read this too, which is
      what made a trip detail unlowerable on a phone (#258). The two
      questions are now asked separately. */
  collapsible: boolean
  /** Phone only. A decision is open — a draft, the placement queue, the
      create panel — so the sheet holds full and its detents are suspended.
      A detail face is not one of these. */
  suspended: boolean
  /** Phone only. A detail face is showing, which promotes peek to half and
      changes nothing else. */
  detailOpen: boolean
  searchCard: ReactNode
  /** Hidden while a detail is open and while a draft is open; the caller
      passes `null` rather than this component deciding. */
  chips: ReactNode
  /** #312 — forwarded straight to `BottomSheet`; desktop never renders a
      sheet to settle, so this is simply never called there. */
  onSettle?: () => void
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
  flyoverToken,
  collapsed,
  onToggleCollapsed,
  collapsible,
  suspended,
  detailOpen,
  searchCard,
  chips,
  onSettle,
  children,
}: ShellColumnProps) {
  const isPhone = useIsPhone()

  if (isPhone) {
    return (
      <BottomSheet
        flyoverToken={flyoverToken}
        suspended={suspended}
        detailOpen={detailOpen}
        searchCard={searchCard}
        chips={chips}
        onSettle={onSettle}
      >
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
