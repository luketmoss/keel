/* The one marker predicate, drawn — `cairns.md`'s "Markers, rows and
   chips". `cairnDrawsAsThumbnail` (in `store/cairnRules.ts`) decides which
   shape; this component only draws whichever it picked, so the map, the
   list glyph and the row all read as the same object by construction —
   there is nowhere else a caller could draw a cairn differently. */

import { cairnDrawsAsThumbnail } from '../store/cairnRules'
import type { CairnIcon, PositionSource } from '../store/looseStore'
import { ringStyleForPhoto } from '../photo/provenance'
import { CairnIconGlyph } from './CairnIcon'
import './CairnMarker.css'

export interface CairnMarkerProps {
  icon: CairnIcon | null
  /** A resolved thumbnail URL, or `undefined` while it's still loading (or
      there is none) — draws the `--surface-lift` fallback fill either way,
      matching `CairnLayer`'s existing loading treatment. */
  thumbnailUrl?: string
  /** Whether this cairn carries an image at all, independent of whether
      the thumbnail has loaded yet — decides the camera badge on a pin. */
  hasImage: boolean
  /** #54's provenance ring, unchanged for a thumbnail marker — `cairns.md`
      still reuses `--marker-ring` for "Cairn, as image". A pin has no ring
      of its own (its fill inverts on selection instead), so this is only
      read in the thumbnail branch. Optional: a caller that never draws a
      thumbnail (none exist yet today) has nothing to pass. */
  source?: PositionSource
  selected: boolean
  /** Renders at `--dot-size` instead of `--marker-size`/`--marker-poi` —
      the row's glyph is the marker "drawn smaller" (`cairns.md`), not a
      second shape. */
  small?: boolean
}

/** A cairn draws as its thumbnail when it has an image and no icon.
    Otherwise it draws as a pin carrying its icon (or an unmarked dot when
    it has neither an icon nor an image — the loose-cairn placeholder
    `LooseLayer` used before this issue, kept as the fallback for that
    case). A pin that also carries an image gets a small camera badge. */
export function CairnMarker({ icon, thumbnailUrl, hasImage, source, selected, small }: CairnMarkerProps) {
  const asThumbnail = cairnDrawsAsThumbnail({
    icon,
    image: hasImage ? { originalDriveFileId: '', thumbnailDriveFileId: '' } : null,
  })

  if (asThumbnail) {
    const ring = ringStyleForPhoto(source ?? 'exif', selected)
    return (
      <span
        className={`cairn-marker cairn-marker--thumb${small ? ' cairn-marker--small' : ''}`}
        style={{
          borderStyle: ring.borderStyle,
          borderWidth: `var(${ring.widthVar})`,
          borderColor: `var(${ring.colorVar})`,
          filter: ring.glow ? 'drop-shadow(0 0 7px var(--accent))' : undefined,
        }}
      >
        {thumbnailUrl && <img src={thumbnailUrl} alt="" />}
      </span>
    )
  }

  return (
    <span
      className={`cairn-marker cairn-marker--pin${selected ? ' cairn-marker--selected' : ''}${small ? ' cairn-marker--small' : ''}`}
    >
      <svg className="cairn-marker__pin-body" viewBox="0 0 30 36" aria-hidden="true">
        <path d="M15 1.4c-7.1 0-12.9 5.6-12.9 12.5 0 8.9 11.4 20 12.4 20.9a.75.75 0 0 0 1 0c1-.9 12.4-12 12.4-20.9C27.9 7 22.1 1.4 15 1.4Z" />
      </svg>
      <span className="cairn-marker__pin-glyph">{icon ? <CairnIconGlyph icon={icon} /> : <span className="cairn-marker__pin-dot" />}</span>
      {hasImage && <span className="cairn-marker__badge" aria-hidden="true" />}
    </span>
  )
}
