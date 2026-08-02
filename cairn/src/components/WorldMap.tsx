import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APIProvider, Map, Polyline, useMap } from '@vis.gl/react-google-maps'
import { googleMapsApiKey } from '../env'
import { MapUnavailable } from './MapUnavailable'
import type { TripIndexEntry, TripStatus, TripStore } from '../store/tripStore'
import { dropInvalidLatitudes, normalizeAntimeridian, type LatLng } from '../map/geo'
import { fitTracksToBounds } from '../map/fitBounds'
import './WorldMap.css'

/* Same "nothing imported yet" default MapView uses — there's no better
   answer before any route has drawn. */
const INITIAL_CENTER = { lat: 20, lng: 0 }
const INITIAL_ZOOM = 2

/* --accent / --text-muted from index.css. Google Maps' Polyline options take
   real colour values, not CSS custom properties, so the design doc's colour
   pairing is transcribed here rather than referenced live. */
const COMPLETED_COLOR = '#4c9aff'
const PLANNED_COLOR = '#9aa3ab'

type StatusFilter = 'all' | TripStatus

interface WorldRoute {
  key: string
  tripId: string
  status: TripStatus
  points: LatLng[]
}

/** One route per non-empty `LineString` feature in a trip's overview — a
    trip can carry more than one track (#36), and each draws as its own
    polyline, same as `TrackLayer` does for `/`. */
function routesForTrip(trip: TripIndexEntry, tripStore: TripStore): WorldRoute[] {
  const overview = tripStore.getOverview(trip.id)
  if (!overview) return []

  return overview.features
    .map((feature, index): WorldRoute | null => {
      const points = normalizeAntimeridian(
        dropInvalidLatitudes(feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }))),
      )
      if (points.length < 2) return null
      return { key: `${trip.id}-${index}`, tripId: trip.id, status: trip.status, points }
    })
    .filter((route): route is WorldRoute => route !== null)
}

interface WorldMapProps {
  trips: TripIndexEntry[]
  tripStore: TripStore
}

/** `/world` (#37): every trip's route at once, drawn from each trip's
    precomputed `overview.geojson` (#36) — never a source KML/KMZ. Additive
    alongside `/` and `/trips`; nothing here touches either. */
export function WorldMap({ trips, tripStore }: WorldMapProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [keyRejected, setKeyRejected] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    window.gm_authFailure = () => setKeyRejected(true)
    return () => {
      delete window.gm_authFailure
    }
  }, [])

  // Reads are synchronous (local storage today), but a trip whose overview
  // is missing or empty is silently absent — same "partial failure" and
  // "empty overview" handling the design doc specifies for a slower,
  // Drive-backed read.
  const routes = useMemo(
    () => trips.flatMap((trip) => routesForTrip(trip, tripStore)),
    [trips, tripStore],
  )
  const visibleRoutes = useMemo(
    () => (filter === 'all' ? routes : routes.filter((route) => route.status === filter)),
    [routes, filter],
  )

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
    <div className="world-map">
      {trips.length > 0 && <FilterRow filter={filter} onChange={setFilter} />}
      <APIProvider apiKey={googleMapsApiKey} onError={() => setKeyRejected(true)}>
        <Map
          className="map"
          defaultCenter={INITIAL_CENTER}
          defaultZoom={INITIAL_ZOOM}
          mapTypeId="satellite"
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
        >
          <WorldRouteLayer routes={visibleRoutes} onSelectTrip={(id) => navigate(`/trips/${id}`)} />
        </Map>
      </APIProvider>
      {/* `all` never excludes anything, so an empty visible set under `all`
          means there were no trips to draw in the first place — reads
          identically to "no trips exist" rather than as its own state, per
          the design doc, since neither is actionable and the user can't
          tell the difference. */}
      {trips.length === 0 || (filter === 'all' && visibleRoutes.length === 0) ? (
        <EmptyOverlay heading="No trips yet" detail="Create one from Trips to see it here." />
      ) : (
        visibleRoutes.length === 0 && <EmptyOverlay heading={`No ${filter} trips`} />
      )}
    </div>
  )
}

function FilterRow({
  filter,
  onChange,
}: {
  filter: StatusFilter
  onChange: (filter: StatusFilter) => void
}) {
  const segments: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'planned', label: 'Planned' },
    { value: 'completed', label: 'Completed' },
  ]

  return (
    <div className="world-map__filter">
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          className={`world-map__filter-segment${
            filter === segment.value ? ' world-map__filter-segment--active' : ''
          }`}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  )
}

function EmptyOverlay({ heading, detail }: { heading: string; detail?: string }) {
  return (
    <div className="world-map__empty">
      <p className="world-map__empty-title">{heading}</p>
      {detail && <p className="world-map__empty-detail">{detail}</p>}
    </div>
  )
}

interface WorldRouteLayerProps {
  routes: WorldRoute[]
  onSelectTrip: (tripId: string) => void
}

function routeSetKey(routes: WorldRoute[]): string {
  return routes
    .map((route) => route.key)
    .sort()
    .join(',')
}

/** Draws every visible route and fits the map to their union once the
    current batch has settled — one fit per filter change or load, not one
    per route, matching `TrackLayer`'s stance that a camera lurching route by
    route is worse than a slightly loose fit. */
function WorldRouteLayer({ routes, onSelectTrip }: WorldRouteLayerProps) {
  const map = useMap()
  const previousKey = useRef('')

  useEffect(() => {
    if (!map) return
    const currentKey = routeSetKey(routes)
    if (currentKey === previousKey.current) return
    previousKey.current = currentKey

    const allPoints = routes.flatMap((route) => route.points)
    fitTracksToBounds(map, allPoints)
  }, [map, routes])

  return (
    <>
      {routes.map((route) => (
        <WorldRoutePolyline key={route.key} route={route} onSelect={() => onSelectTrip(route.tripId)} />
      ))}
    </>
  )
}

/** Padding, in pixels, added either side of the visible stroke for the
    actual click target — same "wider hit area than the visible line"
    treatment `TrackLayer`'s casing polyline gives `/`'s own tracks. */
const CLICK_TARGET_WIDTH = 16

function WorldRoutePolyline({ route, onSelect }: { route: WorldRoute; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  const color = route.status === 'completed' ? COMPLETED_COLOR : PLANNED_COLOR
  const strokeWeight = hovered ? 5 : 3
  const hoverHandlers = {
    onMouseOver: () => setHovered(true),
    onMouseOut: () => setHovered(false),
  }

  return (
    <>
      {/* Invisible and wider than what's drawn — carries the click target
          and the hover state, so a route is easy to hit without the visible
          line itself having to be that fat. The visible line underneath it
          is never clickable itself; a click always lands here first. */}
      <Polyline
        path={route.points}
        strokeOpacity={0}
        strokeWeight={CLICK_TARGET_WIDTH}
        clickable
        onClick={onSelect}
        {...hoverHandlers}
      />
      {route.status === 'planned' ? (
        // Google Maps' `Polyline` has no dashed-stroke option of its own —
        // a dashed line is a solid one made invisible and replaced with a
        // small line symbol repeated along the path, the documented way to
        // fake it.
        <Polyline
          path={route.points}
          strokeOpacity={0}
          strokeWeight={strokeWeight}
          clickable={false}
          icons={[
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, scale: strokeWeight },
              offset: '0',
              repeat: '16px',
            },
          ]}
        />
      ) : (
        <Polyline
          path={route.points}
          strokeColor={color}
          strokeWeight={strokeWeight}
          clickable={false}
        />
      )}
    </>
  )
}
