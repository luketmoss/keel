import './DropOverlay.css'

interface DropOverlayProps {
  /** Trip detail (#51) widens this to "Drop tracks or photos" — its drop
      target accepts images as well as tracks, unlike the v1 shell's, which
      still only accepts `.kml`/`.kmz` and keeps the original copy. */
  label?: string
}

export function DropOverlay({ label = 'Drop KML or KMZ files' }: DropOverlayProps) {
  return (
    <div className="drop-overlay" data-testid="drop-overlay">
      <p className="drop-overlay__label">{label}</p>
    </div>
  )
}
