import './DropOverlay.css'

export function DropOverlay() {
  return (
    <div className="drop-overlay" data-testid="drop-overlay">
      <p className="drop-overlay__label">Drop KML or KMZ files</p>
    </div>
  )
}
