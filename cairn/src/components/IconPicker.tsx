import { CAIRN_ICON_LABEL, type CairnIcon } from '../store/looseStore'
import { CairnIconGlyph } from './CairnIcon'
import './IconPicker.css'

/* The `WHAT IS THIS PLACE` grid — `156-creating-a-cairn.md`'s "The create
   face", and its "Retyping an existing cairn" section, which is the reason
   this is a component rather than markup inside the create face: the grid
   on a cairn's detail face is *the same grid*, and two copies would be two
   places for the set to drift.

   The set is fixed at eight plus `none` and is deliberately not
   extensible (`cairns.md`, "The icon set"). It is derived from
   `CAIRN_ICON_LABEL` rather than restated so adding a ninth stays a
   one-line change in the model — which is where that decision is taken —
   and cannot be made here by accident. */

const ICONS = Object.keys(CAIRN_ICON_LABEL) as CairnIcon[]

interface IconPickerProps {
  /** The current icon, or `null` for none. Icons default to none — a
      pre-selected `campsite` would put a tent on every cairn made by
      someone who did not look at the grid. */
  value: CairnIcon | null
  onChange: (icon: CairnIcon | null) => void
  /** #73: disconnected is read-only. The grid still renders so the shape of
      the choice is visible; it simply cannot be made. */
  disabled?: boolean
  /** Distinguishes the create face's grid from a detail face's for the
      accessible name, since both can be on screen in the same session. */
  label?: string
}

/** Five across, `none` as the ninth cell. Every cell is a button carrying
    its name as an `aria-label` and its selection as `aria-pressed`; the
    grid itself is a labelled group. `none` carries the word rather than a
    glyph — an icon meaning *no icon* is a riddle. */
export function IconPicker({ value, onChange, disabled = false, label = 'What is this place' }: IconPickerProps) {
  return (
    <div className="icon-picker" role="group" aria-label={label}>
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`icon-picker__cell${value === icon ? ' icon-picker__cell--selected' : ''}`}
          aria-label={CAIRN_ICON_LABEL[icon]}
          aria-pressed={value === icon}
          disabled={disabled}
          /* Choosing the icon already chosen clears it, so `none` is not
             the only way back — but `none` stays a cell of its own, because
             "click it again" is not an affordance anyone can see. */
          onClick={() => onChange(value === icon ? null : icon)}
        >
          <CairnIconGlyph icon={icon} />
        </button>
      ))}
      <button
        type="button"
        className={`icon-picker__cell icon-picker__cell--none${value === null ? ' icon-picker__cell--selected' : ''}`}
        aria-label="none"
        aria-pressed={value === null}
        disabled={disabled}
        onClick={() => onChange(null)}
      >
        none
      </button>
    </div>
  )
}
