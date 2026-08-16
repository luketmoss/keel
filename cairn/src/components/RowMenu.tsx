import { useEffect, useRef, useState } from 'react'
import { iconLabel } from './iconLabel'
import './RowMenu.css'

export interface RowMenuAction {
  label: string
  onSelect: () => void
  /** Takes `--danger` and, per the design language, says what it does in
      words — `--danger` and `--accent` are near-identical under red-green
      colour blindness, so colour only reinforces the label. */
  danger?: boolean
  disabled?: boolean
}

/** The `⋮` that replaces each row's always-visible `×`. An icon whose only
    meaning is *destroy this* does not get to be the one control permanently
    on every row, so this appears on hover and on focus and its actions are
    named.

    Opening is what the trigger does; confirming a destructive action is
    still the row's own inline confirm (#77's pattern), which the caller
    starts from `onSelect`. */
export function RowMenu({ label, actions }: { label: string; actions: RowMenuAction[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Escape returns focus to the trigger, or the row loses its place in
      // the tab order entirely once the menu unmounts.
      triggerRef.current?.focus()
    }

    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  return (
    <div className={`row-menu${open ? ' row-menu--open' : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="row-menu__trigger"
        {...iconLabel(label)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          setOpen((wasOpen) => !wasOpen)
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div className="row-menu__menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={`row-menu__item${action.danger ? ' row-menu__item--danger' : ''}`}
              disabled={action.disabled}
              onClick={(event) => {
                event.stopPropagation()
                event.preventDefault()
                setOpen(false)
                action.onSelect()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
