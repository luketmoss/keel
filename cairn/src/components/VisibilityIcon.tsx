/* cairn/docs/design/235-visibility-icon.md — the show/hide control's mark.
   The eye is `CairnIconGlyph`'s `viewpoint` icon, shared via `EYE_PATH`
   rather than redrawn, so the two can never drift into a near-match. */

import { EYE_PATH } from './CairnIcon'
import './VisibilityIcon.css'

/** The slash for the hidden state — one stroke, corner to corner, part of
    the same glyph rather than a second element layered on top. No cut
    behind it: these rows sit on a translucent `--surface` over a blurred
    map, so a background-colour "cut" trick would paint a hard-edged smear
    of the wrong colour instead of reading as a slash. */
const SLASH_PATH = 'M4.5 19.5 19.5 4.5'

/** The show/hide toggle's mark — the eye when `visible`, the same eye
    struck through when not. `currentColor`-stroked, so it takes
    `--text-muted`/`--text` from the button that contains it exactly like
    every other muted icon control, which is what the emoji it replaces
    could never do. Always `aria-hidden`: it decorates a button that already
    carries its accessible name via `iconLabel()`. */
export function VisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="visibility-icon">
      <path className="visibility-icon__glyph" d={EYE_PATH} />
      {!visible && <path className="visibility-icon__glyph" d={SLASH_PATH} />}
    </svg>
  )
}
