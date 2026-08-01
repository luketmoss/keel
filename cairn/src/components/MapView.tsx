import { useEffect, useState, type ReactNode } from 'react'
import { APIProvider, Map } from '@vis.gl/react-google-maps'
import { googleMapsApiKey } from '../env'
import './MapView.css'

declare global {
  interface Window {
    /* Google's documented hook for an authentication failure. */
    gm_authFailure?: () => void
  }
}

/* Nothing is imported yet, so there is no better answer than the whole world —
   and a world view makes the satellite basemap immediately obvious. */
const INITIAL_CENTER = { lat: 20, lng: 0 }
const INITIAL_ZOOM = 2

export function MapView() {
  /* Google validates the key asynchronously, after the provider has mounted,
     so a bad key cannot be caught by the check below. */
  const [keyRejected, setKeyRejected] = useState(false)

  /* An auth rejection happens after the script has loaded successfully, so
     APIProvider's onError never sees it — that fires for load failures. Left
     unhandled, Google paints its own "Oops! Something went wrong" panel over
     the map instead of ours. */
  useEffect(() => {
    window.gm_authFailure = () => setKeyRejected(true)
    return () => {
      delete window.gm_authFailure
    }
  }, [])

  if (!googleMapsApiKey) {
    return (
      <MapUnavailable>
        Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in{' '}
        <code>cairn/.env.local</code>, then restart the dev server.
      </MapUnavailable>
    )
  }

  if (keyRejected) {
    return (
      <MapUnavailable>
        Google rejected the API key. Check that the Maps JavaScript API is
        enabled for this project and that the key permits this origin.
      </MapUnavailable>
    )
  }

  return (
    <APIProvider apiKey={googleMapsApiKey} onError={() => setKeyRejected(true)}>
      <Map
        className="map"
        defaultCenter={INITIAL_CENTER}
        defaultZoom={INITIAL_ZOOM}
        mapTypeId="satellite"
        /* The map is the whole app, so a one-finger drag and a plain scroll
           should move it rather than the page behind it. */
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      />
    </APIProvider>
  )
}

function MapUnavailable({ children }: { children: ReactNode }) {
  return (
    <div className="map-unavailable">
      <p className="map-unavailable__title">Map unavailable</p>
      <p className="map-unavailable__detail">{children}</p>
    </div>
  )
}
