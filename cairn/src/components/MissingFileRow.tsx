import type { MissingTripFile } from '../import/useTripImport'
import './MissingFileRow.css'

/** A row for a file the trip's index names but Drive could no longer
    produce — see #35's "file deleted behind the app's back" state. Styled
    like a hidden #6 row (40% opacity swatch) but with the eye icon
    replaced by a warning glyph; not clickable, no visibility toggle, since
    there's nothing to show or hide. */
export function MissingFileRow({ file }: { file: MissingTripFile }) {
  return (
    <li className="track-row track-row--missing">
      <div className="track-row__main">
        <span className="track-row__swatch missing-file-row__swatch" />
        <span className="track-row__name" title={file.name}>
          {file.name}
        </span>
        <span
          className="missing-file-row__warning"
          role="img"
          aria-label={`${file.name} — file missing`}
        >
          ⚠
        </span>
      </div>
    </li>
  )
}
