import { useEffect, useState } from 'react'
import { APIProvider, Map } from '@vis.gl/react-google-maps'
import { googleMapsApiKey, googleMapsMapId } from '../env'
import { TrackLayer } from './TrackLayer'
import { PhotoLayer } from './PhotoLayer'
import { MapUnavailable } from './MapUnavailable'
import type { ImportedFile } from '../import/types'
import type { PositionedPhoto } from '../photo/positionPhotos'
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

interface MapViewProps {
  files: ImportedFile[]
  /** Passed straight through to `TrackLayer` — see its own doc for what this
      drives. */
  hoveredFileId?: string | null
  /** Photos already positioned (#52's `positionPhoto`, wired in by
      `TripDetail`) — unlocated photos never reach this prop at all (#54's
      design doc: they aren't drawn here). Optional and defaulted to empty so
      the world map (`/`, `/trips`), which never has photos, is unaffected. */
  photos?: PositionedPhoto[]
  /** Drive access token for #53's photo image cache — only meaningful
      alongside `photos`. */
  accessToken?: string | null
  selectedPhotoId?: string | null
  /** #54 only needs to expose this callback; #55's list/viewer is what
      consumes the selection it drives. */
  onSelectPhoto?: (photoId: string) => void
  /** #55: clicking an already-selected marker opens the lightbox — see
      `PhotoLayer`'s doc for the selected-vs-not distinction. */
  onOpenPhoto?: (photoId: string) => void
}

export function MapView({
  files,
  hoveredFileId,
  photos = [],
  accessToken = null,
  selectedPhotoId = null,
  onSelectPhoto,
  onOpenPhoto,
}: MapViewProps) {
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
        /* Advanced Markers (photo markers, #54) require a Map ID or Google
           refuses to render them at all. Left unset (a fresh clone, same as
           the two keys above), `mapId` is simply omitted — tracks render
           exactly as before, and PhotoLayer below is skipped rather than
           mounted against a map with no Map ID. */
        mapId={googleMapsMapId ?? undefined}
        /* The map is the whole app, so a one-finger drag and a plain scroll
           should move it rather than the page behind it. */
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
      >
        <TrackLayer files={files} hoveredFileId={hoveredFileId} />
        {googleMapsMapId && photos.length > 0 && (
          <PhotoLayer
            photos={photos}
            accessToken={accessToken}
            selectedPhotoId={selectedPhotoId}
            onSelectPhoto={onSelectPhoto ?? (() => {})}
            onOpenPhoto={onOpenPhoto}
          />
        )}
      </Map>
    </APIProvider>
  )
}
