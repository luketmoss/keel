import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APIProvider, Map, MapMode, useMap } from '@vis.gl/react-google-maps'
import { googleMapsApiKey, googleMapsMapId } from '../env'
import { MapUnavailable } from './MapUnavailable'
import { LayersControl } from './LayersControl'
import { Map3DToggle } from './Map3DToggle'
import { Map3DSurface } from './Map3D'
import { useBaseMapType, type BaseMapType } from '../map/useBaseMapType'
import { Map3DControlProvider, useMap3DControl } from '../map/Map3DControl'
import { fitTracksToBounds } from '../map/fitBounds'
import './MapCanvas.css'

declare global {
  interface Window {
    /* Google's documented hook for an authentication failure. */
    gm_authFailure?: () => void
  }
}

/* Nothing is imported yet, so there is no better answer than the whole world. */
const INITIAL_CENTER = { lat: 20, lng: 0 }
const INITIAL_ZOOM = 2

/* Without this, zooming out past a single world lets Maps tile the basemap
   side by side — Google's documented fix for "restrict the map to a single
   copy of the world" is a world-covering `restriction` with `strictBounds`. */
const WORLD_BOUNDS: google.maps.LatLngBoundsLiteral = { north: 85, south: -85, west: -180, east: 180 }

/** One `APIProvider` for the whole session, wrapping the column as well as
    the map. That is the point: `useMap()` with no id resolves to the
    default `<Map>` from anywhere beneath this provider, so a layer can be
    rendered by whatever owns its data — the trip face renders its own
    `TrackLayer` and `CairnLayer` from inside the panel — and still draw on
    the one map instance. Nothing has to lift geometry into a shared parent,
    and nothing unmounts the map to change what is on it. */
/** Why the map cannot draw, or `null` when it can. Held in context rather
    than handled by `MapProvider` returning the panel itself: a key problem
    stops the *map* working, not the app — the column, the account and the
    trip list are all still usable, and replacing the entire shell with an
    error page would be a regression on the surface this issue is meant to
    improve. */
const MapUnavailableContext = createContext<ReactNode | null>(null)

export function MapProvider({ children }: { children: ReactNode }) {
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

  const unavailable = useMemo(() => {
    if (!googleMapsApiKey) {
      return (
        <MapUnavailable>
          Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>cairn/.env.local</code>, then restart
          the dev server.
        </MapUnavailable>
      )
    }
    if (keyRejected) {
      return (
        <MapUnavailable>
          Google rejected the API key. Check that the Maps JavaScript API is enabled for this
          project and that the key permits this origin.
        </MapUnavailable>
      )
    }
    return null
  }, [keyRejected])

  /* No key means no `APIProvider` at all — every layer's `useMap()` returns
     null and each renders nothing, which is what they already do before the
     map instance exists. */
  const body = googleMapsApiKey ? (
    <APIProvider
      apiKey={googleMapsApiKey}
      /* #232: without this, the bootstrap script only ever requests
         `libraries=core,maps` — `google.maps.ElevationService` and
         `google.maps.ElevationStatus` belong to `elevation`, which is
         otherwise never loaded, so #224's sampler was reaching for symbols
         that didn't exist. #271 adds `maps3d`, only ever on the `beta`
         channel — `Map3DElement` doesn't exist on the stable one, and per
         the design note's own prototype the alpha channel is only needed
         for autofit and path-following flight, neither of which this
         issue uses. Adding `loading=async` here is the documented trap:
         it leaves `google.maps.importLibrary` undefined. */
      libraries={['elevation', 'maps3d']}
      version="beta"
      onError={() => setKeyRejected(true)}
    >
      {/* #274 — one piece of state shared between this component's own
          `MapCanvas` (owns the switch and the actual `Map3DElement`) and
          every face's own `FlyoverButton`, which sits inside the column
          rather than beneath this provider's sibling. */}
      <Map3DControlProvider>{children}</Map3DControlProvider>
    </APIProvider>
  ) : (
    children
  )

  return <MapUnavailableContext.Provider value={unavailable}>{body}</MapUnavailableContext.Provider>
}

interface MapCanvasProps {
  /** Shifts the bottom-left layers control clear of the column, and back to
      the map's own edge when the column is collapsed — the standing
      document's "when the panel is collapsed it slides to the map's own
      left edge". */
  panelCollapsed: boolean
  /** Whether there is anything to fit to. Separate from the points
      themselves so the shell can keep the geometry in a ref — the trip's
      points arrive from hooks that hand up a new array on every render,
      and a prop carrying them would re-render this on every one. */
  canFit: boolean
  /** What "fit to everything" means right now: the trip's points on a trip
      face, every visible place on the list face. Read at click time. */
  getFitPoints: () => { lat: number; lng: number }[]
}

/** The map itself and the controls that belong to its corners (the standing
    document's "The map's corners"). No `id` on the `<Map>`, so it registers
    as the provider's default instance and every `useMap()` beneath
    `MapProvider` finds it. */
export function MapCanvas({ panelCollapsed, canFit, getFitPoints }: MapCanvasProps) {
  const baseMap = useBaseMapType()
  const unavailable = useContext(MapUnavailableContext)
  /* #271 — an in-memory switch, not a stored preference like the tile and
     Labels: the design note never says 3D is "remembered", only that
     Labels is remembered across a 2D/3D swap. Defaults off every session.
     #274 — shared with every face's own `FlyoverButton` via context, since
     `Fly over` turns this on from deep inside the column; the "3D failed
     after starting" regression and the flyover-cancels-on-off wiring both
     live in `Map3DControlProvider` now, alongside this same state. */
  const { on: is3DOn, setOn: setIs3DOn, support: maps3DSupport, flyover } = useMap3DControl()
  const clusterRef = useRef<HTMLDivElement | null>(null)

  /* #271's "The switch and the tiles" table, both directions. Neither is a
     blocked action and neither asks a question — the consequence happens
     one row from the control that was touched. */
  function handleBaseMapChange(next: BaseMapType) {
    baseMap.setType(next)
    if (next !== 'satellite' && is3DOn) setIs3DOn(false)
  }

  function handle3DChange(next: boolean) {
    if (next && baseMap.type !== 'satellite') baseMap.setType('satellite')
    setIs3DOn(next)
  }

  /* The map's own corner controls go with it — there is nothing for them to
     act on — but the column above stays exactly where it is. */
  if (unavailable) return <div className="map-canvas">{unavailable}</div>

  return (
    <div className="map-canvas">
      <Map
        className="map"
        defaultCenter={INITIAL_CENTER}
        defaultZoom={INITIAL_ZOOM}
        /* Advanced Markers require a Map ID or Google refuses to render them
           at all. Left unset, `mapId` is simply omitted and marker layers
           skip themselves rather than mounting against a map with none. */
        mapId={googleMapsMapId ?? undefined}
        /* The tile and the labels switch resolve to one id here —
           Satellite with labels on is Google's `hybrid`. */
        mapTypeId={baseMap.mapTypeId}
        /* The map is the whole app, so a one-finger drag and a plain scroll
           should move it rather than the page behind it. */
        gestureHandling="greedy"
        disableDefaultUI
        restriction={{ latLngBounds: WORLD_BOUNDS, strictBounds: true }}
      />
      <Map3DSurface on={is3DOn} mode={baseMap.labels ? MapMode.HYBRID : MapMode.SATELLITE} flyover={flyover} />
      {/* #284 — one cluster, two controls: the basemap picker and, only on
          Satellite, the 3D toggle. The wrapper owns the corner — clearing
          the column while a panel is open, sliding to the map's own edge
          when it isn't — so neither control positions itself any more. */}
      <div
        className={`map-layers-cluster${panelCollapsed ? ' map-layers-cluster--clear' : ''}`}
        ref={clusterRef}
      >
        <LayersControl
          value={baseMap.type}
          labels={baseMap.labels}
          onChange={handleBaseMapChange}
          onLabelsChange={baseMap.setLabels}
          clusterRef={clusterRef}
        />
        <Map3DToggle
          visible={baseMap.type === 'satellite'}
          on={is3DOn}
          onChange={handle3DChange}
          support={maps3DSupport}
        />
      </div>
      <ZoomControls canFit={canFit} getFitPoints={getFitPoints} />
    </div>
  )
}

/** Bottom right, per the standing document. Google's own `zoomControl` is
    disabled along with the rest of its default UI — it draws in Google's
    style, in Google's corner, and cannot be moved. */
function ZoomControls({
  canFit,
  getFitPoints,
}: {
  canFit: boolean
  getFitPoints: () => { lat: number; lng: number }[]
}) {
  const map = useMap()

  function nudgeZoom(delta: number) {
    if (!map) return
    const zoom = map.getZoom()
    if (zoom === undefined) return
    map.setZoom(zoom + delta)
  }

  return (
    <div className="map-controls">
      <button
        type="button"
        className="map-controls__button"
        aria-label="Fit to everything"
        disabled={!map || !canFit}
        onClick={() => map && fitTracksToBounds(map, getFitPoints())}
      >
        <span aria-hidden="true">⛶</span>
      </button>
      <div className="map-controls__zoom">
        <button
          type="button"
          className="map-controls__button"
          aria-label="Zoom in"
          disabled={!map}
          onClick={() => nudgeZoom(1)}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          className="map-controls__button"
          aria-label="Zoom out"
          disabled={!map}
          onClick={() => nudgeZoom(-1)}
        >
          <span aria-hidden="true">−</span>
        </button>
      </div>
    </div>
  )
}
