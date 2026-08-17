/* The fixed icon set (`cairns.md`'s "The icon set") — exactly these eight,
   plus the no-icon case a pin falls back to. Geometry transcribed from
   `docs/prototypes/cairns.html`'s `ICONS` table, the tiebreaker on glyph
   shape. Labels live in `store/looseStore.ts`'s `CAIRN_ICON_LABEL` — this
   module owns only the drawing. */

import type { CairnIcon } from '../store/looseStore'
/* The glyph's own stroke/fill rules. Colocated with the component that
   draws it rather than duplicated into each surface's stylesheet — a pin,
   a row glyph and the icon picker all render the same `<svg>` and must
   recolour identically. */
import './CairnIcon.css'

interface GlyphShape {
  /** An SVG path's `d`, in a 24×24 viewBox — most icons. */
  d?: string
  /** A filled circle instead of a path (hazard's exclamation dot). */
  dot?: [number, number]
  /** Text instead of a path (parking's "P" has no legible glyph shape at
      marker scale). */
  text?: string
}

/** The almond and the pupil — cairn/docs/design/235-visibility-icon.md: "the
    app has one eye." Shared with `VisibilityIcon` (`TrackList`'s and
    `CairnList`'s show/hide control) rather than each holding its own copy,
    so the two can never drift into a near-match. */
export const EYE_PATH =
  'M2.2 12s3.9-5.8 9.8-5.8S21.8 12 21.8 12s-3.9 5.8-9.8 5.8S2.2 12 2.2 12Z M12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z'

export const CAIRN_ICON_GLYPHS: Record<CairnIcon, GlyphShape> = {
  campsite: { d: 'M3.5 19 12 4.5 20.5 19Z M12 4.5V19' },
  water: { d: 'M12 3.2c0 0-6.6 7.6-6.6 11.4a6.6 6.6 0 0 0 13.2 0c0-3.8-6.6-11.4-6.6-11.4Z' },
  hut: { d: 'M3.6 11.2 12 4.2l8.4 7M5.6 9.6V19.6h12.8V9.6' },
  viewpoint: { d: EYE_PATH },
  summit: { d: 'M2 19.2 9 6.6l3.7 6.2 2.6-3.6L22 19.2Z' },
  hazard: { d: 'M12 3.4 22 19.6H2Z M12 10v3.8', dot: [12, 16.8] },
  parking: { text: 'P' },
  junction: { d: 'M12 20.2v-6.6M12 13.6 6 6.6M12 13.6 18 6.6' },
}

/** One icon's glyph, in a 24×24 viewBox — sized and coloured by whatever
    CSS the caller applies (`currentColor`/`.glyph`/`.glyph-fill` classes,
    matching the prototype's convention so a pin, a row and the future icon
    picker can all recolour it the same way). */
export function CairnIconGlyph({ icon }: { icon: CairnIcon }) {
  const shape = CAIRN_ICON_GLYPHS[icon]
  if (shape.text) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="cairn-icon-glyph">
        <text x="12" y="17" textAnchor="middle" className="cairn-icon-glyph__text">
          {shape.text}
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="cairn-icon-glyph">
      <path className="glyph" d={shape.d} />
      {shape.dot && <circle className="glyph-fill" cx={shape.dot[0]} cy={shape.dot[1]} r={1.15} />}
    </svg>
  )
}
