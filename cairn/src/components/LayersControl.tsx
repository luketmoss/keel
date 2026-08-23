import { useEffect, useRef, useState, type RefObject } from 'react'
import { BASE_MAP_TYPES, type BaseMapType } from '../map/useBaseMapType'
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

/** Bottom left, in the map's own corner rather than top-right under the
    account bubble — the standing document's "A map control belongs in the
    map's corners".

    #284 — **the control is the basemap**, not a button that opens one.
    Collapsed, it names the basemap currently in effect; expanded, it *is*
    the panel. The two are never both on screen: this renders one or the
    other, never a trigger sitting beside its own panel. Choosing a tile no
    longer closes it — comparing basemaps is the task, and collapsing under
    the pointer between two picks is the interaction failing. 3D lives
    beside this control now, in `Map3DToggle`, not inside it. */
export function LayersControl({
  value,
  labels,
  onChange,
  onLabelsChange,
  clusterRef,
}: {
  value: BaseMapType
  /** The stored preference. Only meaningful on Satellite — see
      `labelsAvailable` below for what the switch shows elsewhere. */
  labels: boolean
  onChange: (next: BaseMapType) => void
  onLabelsChange: (next: boolean) => void
  /** #284 — the bottom-left cluster this control shares with
      `Map3DToggle`. Focus leaving the *cluster* dismisses the panel, not
      focus leaving this control alone: tabbing from the Labels switch to
      the 3D toggle stays inside the cluster and must not collapse the
      panel out from under a keyboard user mid-tab. */
  clusterRef: RefObject<HTMLDivElement | null>
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusOnClose = useRef(false)

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      returnFocusOnClose.current = true
      setOpen(false)
    }

    // #295 — a press truly outside the cluster (the map, the column,
    // anywhere else) still closes on `pointerdown`: nothing there has an
    // `onClick` competing for the same touch, and a drag that starts inside
    // the panel and ends outside the cluster produces no `click` at all, so
    // `pointerdown` is the only signal that sees it.
    //
    // A press inside the cluster but outside the panel — the 3D toggle, the
    // only other cluster member — is handled by `handleClick` below instead.
    // Closing synchronously here, inside `pointerdown`, mutated the DOM
    // under the finger mid-touch and made mobile Safari/Chrome withhold the
    // `click` a tap would otherwise produce, silently swallowing
    // `Map3DToggle`'s own `onChange`.
    function handlePointerDown(event: PointerEvent) {
      const cluster = clusterRef.current
      const target = event.target as Node
      if (cluster && !cluster.contains(target)) setOpen(false)
    }

    // #295 — the sibling case: a press inside the cluster but outside the
    // panel. `click` fires in the bubble phase after the target's own
    // listener has already run, so a sibling's `onClick` (e.g.
    // `Map3DToggle`'s) fires first, on the still-mounted panel, and the
    // panel then closes as the gesture's second effect. This also covers
    // `Enter`/`Space` activation for free, since both dispatch a real
    // `click`, and it fires nothing for a disabled sibling, since a
    // disabled button dispatches no `click` at all.
    function handleClick(event: MouseEvent) {
      const cluster = clusterRef.current
      const panel = panelRef.current
      const target = event.target as Node
      if (!cluster || !panel) return
      if (cluster.contains(target) && !panel.contains(target)) setOpen(false)
    }

    // Focus, unlike a pointer press, moves through the whole cluster as a
    // matter of course while tabbing between the tiles, Labels and the 3D
    // toggle — so this checks the cluster, not just the panel.
    function handleFocusIn(event: FocusEvent) {
      const cluster = clusterRef.current
      if (cluster && !cluster.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('click', handleClick)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [open, clusterRef])

  // Escape returns focus to the collapsed control, which has just replaced
  // the panel in the same spot — otherwise focus is left on a node that no
  // longer exists. Outside-press and focus-out don't get this: focus was
  // already elsewhere when they fired.
  useEffect(() => {
    if (open || !returnFocusOnClose.current) return
    returnFocusOnClose.current = false
    triggerRef.current?.focus()
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

  if (open) {
    return (
      <div
        className="layers-control__panel"
        role="group"
        aria-label="Layers"
        ref={panelRef}
      >
        <div className="layers-control__strip" role="group" aria-label="Basemap">
          {BASE_MAP_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`layers-control__option${
                value === type ? ' layers-control__option--active' : ''
              }`}
              aria-pressed={value === type}
              // #284 — picking a tile no longer collapses the panel. #109's
              // "selecting collapses the strip" was about choosing a
              // basemap being the end of the panel's job; this issue is
              // exactly the finding that comparing basemaps isn't done in
              // one pick.
              onClick={() => {
                if (type !== value) onChange(type)
              }}
            >
              <span className={`layers-control__swatch layers-control__swatch--${type}`} aria-hidden="true" />
              <span className="layers-control__option-label">{LABELS[type]}</span>
            </button>
          ))}
        </div>
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
    )
  }

  return (
    <button
      type="button"
      ref={triggerRef}
      className="layers-control__trigger"
      // #284 — the visible word is the basemap, which is the question the
      // control answers at a glance; `Layers` survives only in the
      // accessible name, so it's still reachable by that name from the
      // keyboard or voice control.
      aria-label={`Layers: ${LABELS[value]}`}
      onClick={() => setOpen(true)}
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
      <span className="layers-control__trigger-label">{LABELS[value]}</span>
    </button>
  )
}
