import { useEffect, useRef, useState } from 'react'
import { BASE_MAP_TYPES, type BaseMapType } from '../map/useBaseMapType'
import { MAPS_3D_UNAVAILABLE_SENTENCE, type Maps3DSupport } from '../map/use3DSupport'
import './LayersControl.css'

const LABELS: Record<BaseMapType, string> = {
  roadmap: 'Map',
  satellite: 'Satellite',
  terrain: 'Terrain',
}

/** #263's three tooltip strings. The two enabled ones name the action, the
    way #199's visibility tooltip flips with its glyph; the disabled one
    names the rule, because there is no action to name and the rule is what
    the user is missing. */
const LABELS_TITLE = {
  unavailable: 'The map and terrain views always show labels',
  on: 'Hide place labels on the imagery',
  off: 'Show place labels on the imagery',
}

/** #271 — the caption beneath the 3D switch, present always rather than
    only when it becomes relevant: the honest one-line version of a vendor
    constraint (there is no 3D road map or 3D terrain map on the beta
    channel). Replaced by the disabled sentence when the browser itself
    can't draw 3D — one sentence per surface, #73's rule, never Google's own
    error panel. */
const THREE_D_CAPTION = 'Satellite only'
const THREE_D_UNAVAILABLE = MAPS_3D_UNAVAILABLE_SENTENCE

/** Bottom left, in the map's own corner rather than top-right under the
    account bubble — the standing document's "A map control belongs in the
    map's corners". It is a thumbnail because the choice is visual: a panel
    of previews expands from it, and picking one collapses the panel again.

    Replaces #104's `BaseMapControl`, whose stylesheet did arithmetic to
    dodge `TopBar`. There is no `TopBar` to dodge any more. */
export function LayersControl({
  value,
  labels,
  onChange,
  onLabelsChange,
  panelCollapsed,
  is3DOn,
  onChange3D,
  maps3DSupport,
}: {
  value: BaseMapType
  /** The stored preference. Only meaningful on Satellite — see
      `labelsAvailable` below for what the switch shows elsewhere. */
  labels: boolean
  onChange: (next: BaseMapType) => void
  onLabelsChange: (next: boolean) => void
  /** Clears the column while it is open, slides to the map's own left edge
      when it is not. Transform-free — `left` is what moves, over
      `--motion-base`, the same duration the column animates with. */
  panelCollapsed: boolean
  /** #271 — the switch's own state, an in-memory mode rather than a stored
      preference. */
  is3DOn: boolean
  onChange3D: (next: boolean) => void
  /** Whether this browser can draw 3D at all — `'checking'` before the
      library has resolved, which renders exactly like `'available'` so the
      switch doesn't flash disabled-then-enabled on every load. */
  maps3DSupport: Maps3DSupport
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

  // Google discards the `styles` option whenever a `mapId` is present, and
  // cairn needs one for Advanced Markers, so `roadmap` and `terrain` keep
  // their labels whatever the preference says. #263 chose to show that
  // rather than hide it: the switch goes checked and disabled, which is the
  // rendered truth, instead of vanishing and teaching nothing.
  const labelsAvailable = value === 'satellite'
  const labelsShown = labelsAvailable ? labels : true
  const labelsTitle = !labelsAvailable
    ? LABELS_TITLE.unavailable
    : labels
      ? LABELS_TITLE.on
      : LABELS_TITLE.off

  /* `'checking'` reads as enabled — the library resolves fast enough that
     flashing disabled-then-enabled on every load would be worse than the
     rare click that lands half a beat before the answer is in. */
  const threeDAvailable = maps3DSupport !== 'unavailable'
  const threeDCaption = maps3DSupport === 'unavailable' ? THREE_D_UNAVAILABLE : THREE_D_CAPTION

  return (
    <div
      className={`layers-control${panelCollapsed ? ' layers-control--clear' : ''}`}
      ref={rootRef}
    >
      {open && (
        <div className="layers-control__panel">
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
          {/* #271 — 3D sits above Labels: it decides what kind of surface
              you are looking at, Labels decides what is written on it, and
              reading top to bottom the panel goes from most to least
              consequential. Same wrapper-carries-the-title fix as Labels,
              since this switch goes disabled too. */}
          <span className="layers-control__3d-wrap" title={!threeDAvailable ? threeDCaption : undefined}>
            <button
              type="button"
              className="layers-control__3d"
              role="switch"
              aria-checked={is3DOn}
              disabled={!threeDAvailable}
              onClick={() => onChange3D(!is3DOn)}
            >
              <span
                className={`layers-control__checkbox${is3DOn ? ' layers-control__checkbox--on' : ''}`}
                aria-hidden="true"
              >
                {is3DOn ? '✓' : ''}
              </span>
              3D
            </button>
          </span>
          <p className="layers-control__caption">{threeDCaption}</p>
          {/* `title` on a `disabled` button does not reach the pointer in
              every browser, so it goes on the wrapper — the same fix
              `.track-row__swatch-wrap` already carries for #199. */}
          <span className="layers-control__labels-wrap" title={labelsTitle}>
            <button
              type="button"
              className="layers-control__labels"
              role="switch"
              aria-checked={labelsShown}
              disabled={!labelsAvailable}
              /* Unlike a tile, the panel stays open: a switch is a thing you
                 might flip twice to compare, and collapsing between the two
                 flips is the interaction failing. */
              onClick={() => onLabelsChange(!labels)}
            >
              <span
                className={`layers-control__checkbox${
                  labelsShown ? ' layers-control__checkbox--on' : ''
                }`}
                aria-hidden="true"
              >
                {labelsShown ? '✓' : ''}
              </span>
              Labels
            </button>
          </span>
        </div>
      )}
      <button
        type="button"
        className="layers-control__trigger"
        aria-label="Layers"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {/* The trigger is a status readout, so it distinguishes the two
            satellite pictures even though the tile row no longer does: the
            diagonal that used to mark the Hybrid tile now marks labels-on. */}
        <span
          className={`layers-control__swatch layers-control__swatch--${value}${
            value === 'satellite' && labels ? ' layers-control__swatch--labelled' : ''
          }`}
          aria-hidden="true"
        />
        <span className="layers-control__trigger-label">Layers</span>
        {/* The only way the collapsed control can say which surface you're
            on — the language's Selected treatment on a control that is
            currently doing something. */}
        {is3DOn && (
          <span className="layers-control__badge" aria-hidden="true">
            3D
          </span>
        )}
      </button>
    </div>
  )
}
