import type { ReactNode } from 'react'
import './MapUnavailable.css'

/** "The map can't render" — no API key, or Google rejected the one given.
    Rendered by `MapProvider` in place of the whole app, since there is one
    map for the session and nothing below it works without one. */
export function MapUnavailable({ children }: { children: ReactNode }) {
  return (
    <div className="map-unavailable">
      <p className="map-unavailable__title">Map unavailable</p>
      <p className="map-unavailable__detail">{children}</p>
    </div>
  )
}
