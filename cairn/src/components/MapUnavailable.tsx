import type { ReactNode } from 'react'
import './MapView.css'

/** Shared "the map can't render" panel — no API key, or Google rejected the
    one given. Used by both `MapView` (`/`, `/trips/:id`) and `WorldMap`
    (`/world`, #37) so the two routes read identically when a key problem is
    the reason nothing is on screen. */
export function MapUnavailable({ children }: { children: ReactNode }) {
  return (
    <div className="map-unavailable">
      <p className="map-unavailable__title">Map unavailable</p>
      <p className="map-unavailable__detail">{children}</p>
    </div>
  )
}
