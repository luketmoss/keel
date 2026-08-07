import { TRACK_COLORS, TRACK_COLOR_NAMES } from '../map/palette'
import './ColorPopover.css'

/** The track colour palette grid, opened from a swatch button. Positions
    itself absolutely against the nearest `position: relative` ancestor —
    callers wrap their trigger in one, the way `TripsPanel`'s row and
    `LooseFace`'s stats swatch both do.
 *
 * Shared by `TripsPanel` and `LooseFace` (#133), the two loose-item
 * surfaces that reach for a track's colour. `TrackList` keeps its own
 * copy (#46, predating this one) rather than being refactored onto it. */
export function ColorPopover({
  name,
  currentColorIndex,
  onSelect,
  onClose,
  align = 'left',
}: {
  name: string
  currentColorIndex: number
  onSelect: (index: number) => void
  onClose: () => void
  /** Which edge of the anchor the popover hangs from. `left` matches
      `TrackList`'s swatch, at the row's left edge; `right` is for a
      trigger at the row's right edge (the `⋮`), so the popover opens
      inward rather than off the panel's edge. */
  align?: 'left' | 'right'
}) {
  return (
    <>
      {/* Closes the popover on an outside click without a document-level
          listener — a full-viewport layer beneath the popover itself. */}
      <div className="color-popover__backdrop" onClick={onClose} />
      <div
        className={`color-popover${align === 'right' ? ' color-popover--right' : ''}`}
        role="group"
        aria-label={`Colours for ${name}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {TRACK_COLORS.map((swatchColor, index) => (
          <button
            key={swatchColor}
            type="button"
            className="color-popover__option"
            aria-label={TRACK_COLOR_NAMES[index]}
            onClick={() => onSelect(index)}
          >
            <span
              className={`color-popover__swatch${
                index === currentColorIndex ? ' color-popover__swatch--selected' : ''
              }`}
              style={{ backgroundColor: swatchColor }}
            />
          </button>
        ))}
      </div>
    </>
  )
}
