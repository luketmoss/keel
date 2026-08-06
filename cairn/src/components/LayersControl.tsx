import { useEffect, useRef, useState } from 'react'
import { BASE_MAP_TYPES, type BaseMapType } from '../map/useBaseMapType'
import './LayersControl.css'

const LABELS: Record<BaseMapType, string> = {
  roadmap: 'Map',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
  terrain: 'Terrain',
}

/** Bottom left, in the map's own corner rather than top-right under the
    account bubble — the standing document's "A map control belongs in the
    map's corners". It is a thumbnail because the choice is visual: a strip
    of previews expands from it, and picking one collapses the strip again.

    Replaces #104's `BaseMapControl`, whose stylesheet did arithmetic to
    dodge `TopBar`. There is no `TopBar` to dodge any more. */
export function LayersControl({
  value,
  onChange,
  panelCollapsed,
}: {
  value: BaseMapType
  onChange: (next: BaseMapType) => void
  /** Clears the column while it is open, slides to the map's own left edge
      when it is not. Transform-free — `left` is what moves, over
      `--motion-base`, the same duration the column animates with. */
  panelCollapsed: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Same dismissal mechanism as every other transient surface in the app
  // (the row confirms, the row menu): Escape, or a pointerdown outside.
  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
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
    <div
      className={`layers-control${panelCollapsed ? ' layers-control--clear' : ''}`}
      ref={rootRef}
    >
      {open && (
        <div className="layers-control__strip" role="group" aria-label="Basemap">
          {BASE_MAP_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`layers-control__option${
                value === type ? ' layers-control__option--active' : ''
              }`}
              aria-pressed={value === type}
              onClick={() => {
                // Selecting the already-selected one collapses without a
                // redraw — #109's design note. `onChange` with the same
                // value is a no-op in the store either way, but not calling
                // it keeps that true here rather than one layer down.
                if (type !== value) onChange(type)
                setOpen(false)
              }}
            >
              <span className={`layers-control__swatch layers-control__swatch--${type}`} aria-hidden="true" />
              <span className="layers-control__option-label">{LABELS[type]}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="layers-control__trigger"
        aria-label="Layers"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={`layers-control__swatch layers-control__swatch--${value}`} aria-hidden="true" />
        <span className="layers-control__trigger-label">Layers</span>
      </button>
    </div>
  )
}
