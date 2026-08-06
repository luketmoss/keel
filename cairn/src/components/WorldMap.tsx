import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APIProvider, AdvancedMarker, Map, Polyline, useMap } from '@vis.gl/react-google-maps'
import { googleMapsApiKey, googleMapsMapId } from '../env'
import { MapUnavailable } from './MapUnavailable'
import { BaseMapControl } from './BaseMapControl'
import { useBaseMapType } from '../map/useBaseMapType'
import type { TripIndexEntry, TripStatus } from '../store/tripStore'
import type { Track } from '../kml/parse'
import {
  matchesTripFilters,
  tripDayIndex,
  type StatusFilter,
  type TripFilters,
} from '../store/tripFilters'
import { fitTracksToBounds, zoomToFitCluster } from '../map/fitBounds'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import './WorldMap.css'

/* --text from index.css, transcribed — Google Maps' Polyline options take
   real colour values, not CSS custom properties. */
const DRAFT_ROUTE_COLOR = '#f1f3fa'

/* Same "nothing imported yet" default as before there's anything to fit to. */
const INITIAL_CENTER = { lat: 20, lng: 0 }
const INITIAL_ZOOM = 2

/* Without this, zooming out past a single world lets Maps tile the basemap
   side by side — Google's documented fix for "restrict the map to a single
   copy of the world" is a world-covering `restriction` with `strictBounds`. */
const WORLD_BOUNDS: google.maps.LatLngBoundsLiteral = { north: 85, south: -85, west: -180, east: 180 }

/* --marker-size from index.css, transcribed for the same reason PhotoLayer's
   own copy is — clustering's projection math wants real pixels, not a CSS
   var. Keep in step with index.css by hand. */
const MARKER_FOOTPRINT_PX = 28

/** The map's centre and zoom survive a trip visit and return, for the
    session — #79's point. `/` and `/trips` no longer unmount `WorldMap` at
    all (#80 — it stays mounted behind the trips panel), so this is only
    still doing work across a visit to `/trips/:id`, which remains its own
    top-level route and unmounts everything above it. Module-level rather
    than component state for that reason, and never persisted anywhere, so
    a reload starts fresh — the better opening frame per the design note. */
let lastCamera: { center: google.maps.LatLngLiteral; zoom: number } | null = null

interface Place {
  tripId: string
  name: string
  status: TripStatus
  lat: number
  lng: number
}

function placesForTrips(trips: TripIndexEntry[]): Place[] {
  return trips
    // A trip written before #79 has no `origin` field at all rather than
    // an explicit `null` — the storage layer's existing "corrupted/missing
    // is absent, not thrown" stance (see tripStore.ts's validators) means
    // this has to tolerate `undefined` too, not just `null`.
    .filter((trip): trip is TripIndexEntry & { origin: NonNullable<TripIndexEntry['origin']> } =>
      Boolean(trip.origin),
    )
    .map((trip) => ({
      tripId: trip.id,
      name: trip.name,
      status: trip.status,
      lat: trip.origin.lat,
      lng: trip.origin.lng,
    }))
}

interface WorldMapProps {
  trips: TripIndexEntry[]
  filters: TripFilters
  onFiltersChange: (filters: TripFilters) => void
  /** #80: the status pills move into the trips panel's header while it's
      open, rather than being duplicated — this is what lets `WorldMap`
      stop drawing its own copy without losing the control entirely. */
  hideStatusPills?: boolean
  hoveredTripId: string | null
  onHoverTrip: (tripId: string | null) => void
  /** #81: the tracks of a drop-to-draft trip that hasn't been saved yet —
      drawn as a route (the rule: "a dot means it is a trip, a route means
      it is not saved yet"). The camera fits to it deliberately, on every
      addition, unlike the once-per-change stance `PlaceLayer` takes for
      saved trips: a drop is an explicit "look at this". */
  draftTracks?: Track[]
  /** #95: `trips` is already empty whenever this is true — the caller
      withholds it rather than this component filtering it out — so this
      exists only to pick the right empty-state copy. A cached-but-hidden
      account reads "sign in to see your trips", not "no places yet". */
  disconnected?: boolean
}

/** `/` (#78 makes it the homepage; #79 replaces what it draws): every trip
    with a place draws as one dot rather than its full route — a route
    means the import is not saved yet (#81), and a dot means it is. Stays
    mounted behind the trips panel at `/trips` (#80) rather than being
    replaced by it, which is what makes the camera and the map itself
    survive that navigation without any special-casing here. */
export function WorldMap({
  trips,
  filters,
  onFiltersChange,
  hideStatusPills,
  hoveredTripId,
  onHoverTrip,
  draftTracks,
  disconnected,
}: WorldMapProps) {
  const hasDraft = Boolean(draftTracks && draftTracks.length > 0)
  const [keyRejected, setKeyRejected] = useState(false)
  const [baseMapType, setBaseMapType] = useBaseMapType()
  const navigate = useNavigate()

  useEffect(() => {
    window.gm_authFailure = () => setKeyRejected(true)
    return () => {
      delete window.gm_authFailure
    }
  }, [])

  const places = useMemo(() => placesForTrips(trips), [trips])

  const dateSpan = useMemo(() => {
    if (trips.length === 0) return null
    const days = trips.map((trip) => tripDayIndex(trip))
    return { min: Math.min(...days), max: Math.max(...days) }
  }, [trips])

  // The slider's range resets to the full span whenever the span itself
  // changes shape (a trip gaining or losing a date) rather than every
  // render — narrowing it back to `[min, max]` on every trip update would
  // make a filter the user just set snap back the moment anything else
  // about the trip list changed. It also refills whenever something
  // outside this component clears `filters.range` to `null` — #80's
  // trips panel does exactly that from its "Clear filters" action, which
  // is specified to reset the date range along with name and status.
  //
  // An effect, not a render-time call: since #80 lifted `filters` into
  // whatever mounts this component, calling `onFiltersChange`
  // synchronously during render would be updating a different
  // component's state mid-render, which React (rightly) warns about —
  // the update belongs after render commits.
  const spanKey = dateSpan ? `${dateSpan.min}-${dateSpan.max}` : ''
  const previousSpanKey = useRef<string | null>(null)
  const range = filters.range
  useEffect(() => {
    const spanChanged = previousSpanKey.current !== spanKey
    if (!spanChanged && range !== null) return
    previousSpanKey.current = spanKey
    onFiltersChange({ ...filters, range: dateSpan ? [dateSpan.min, dateSpan.max] : null })
    // `filters` deliberately excluded — this effect only reacts to the
    // span changing or `range` being cleared, not to the caller passing a
    // new `filters` object after every keystroke in the name field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spanKey, dateSpan, range, onFiltersChange])

  const visibleTrips = useMemo(
    () => trips.filter((trip) => matchesTripFilters(trip, filters)),
    [trips, filters],
  )
  const visiblePlaces = useMemo(() => placesForTrips(visibleTrips), [visibleTrips])

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

  const noPlaces = places.length === 0
  const filteredEmpty = !noPlaces && visiblePlaces.length === 0

  return (
    <div className="world-map">
      {/* #81: the status pills and date range are hidden while a draft is
          open — filtering the saved set isn't what the user is doing, and
          the controls would compete with the decision in front of them. */}
      {!noPlaces && !hideStatusPills && !hasDraft && (
        <StatusFilterRow
          status={filters.status}
          onChange={(status) => onFiltersChange({ ...filters, status })}
        />
      )}
      {!noPlaces && !hasDraft && dateSpan && dateSpan.min !== dateSpan.max && filters.range && (
        <DateRangeControl
          min={dateSpan.min}
          max={dateSpan.max}
          value={filters.range}
          onChange={(range) => onFiltersChange({ ...filters, range })}
        />
      )}
      <BaseMapControl value={baseMapType} onChange={setBaseMapType} />
      <APIProvider apiKey={googleMapsApiKey} onError={() => setKeyRejected(true)}>
        <Map
          className="map"
          defaultCenter={lastCamera?.center ?? INITIAL_CENTER}
          defaultZoom={lastCamera?.zoom ?? INITIAL_ZOOM}
          mapId={googleMapsMapId ?? undefined}
          mapTypeId={baseMapType}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          restriction={{ latLngBounds: WORLD_BOUNDS, strictBounds: true }}
        >
          <PlaceLayer
            places={visiblePlaces}
            hoveredTripId={hoveredTripId}
            onHoverTrip={onHoverTrip}
            onSelectTrip={(id) => navigate(`/trips/${id}`)}
          />
          {draftTracks && <DraftRouteLayer tracks={draftTracks} />}
        </Map>
      </APIProvider>
      {!hasDraft &&
        (noPlaces ? (
          disconnected ? (
            // #95: `trips` is empty because it's withheld, not because
            // there's nothing there — "No places yet" would be wrong for an
            // account with real cached trips.
            <EmptyOverlay heading="Sign in to see your trips." />
          ) : (
            <EmptyOverlay
              heading="No places yet"
              detail="Drop a KML anywhere to start your first trip."
            />
          )
        ) : (
          filteredEmpty && (
            <EmptyOverlay heading="Nothing in this range" detail="Widen the filters to see your trips." />
          )
        ))}
    </div>
  )
}

function StatusFilterRow({
  status,
  onChange,
}: {
  status: StatusFilter
  onChange: (status: StatusFilter) => void
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
            status === segment.value ? ' world-map__filter-segment--active' : ''
          }`}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  )
}

function yearOf(day: number): number {
  return new Date(day * 86_400_000).getFullYear()
}

function DateRangeControl({
  min,
  max,
  value,
  onChange,
}: {
  min: number
  max: number
  value: [number, number]
  onChange: (value: [number, number]) => void
}) {
  return (
    <div className="world-map__date-range">
      <span className="world-map__date-range-year">{yearOf(value[0])}</span>
      <div className="world-map__date-range-track">
        <input
          type="range"
          className="world-map__date-range-input"
          aria-label="Range start"
          min={min}
          max={max}
          value={value[0]}
          onChange={(event) => onChange([Math.min(Number(event.target.value), value[1]), value[1]])}
        />
        <input
          type="range"
          className="world-map__date-range-input"
          aria-label="Range end"
          min={min}
          max={max}
          value={value[1]}
          onChange={(event) => onChange([value[0], Math.max(Number(event.target.value), value[0])])}
        />
      </div>
      <span className="world-map__date-range-year">{yearOf(value[1])}</span>
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

interface PlaceLayerProps {
  places: Place[]
  hoveredTripId: string | null
  onHoverTrip: (tripId: string | null) => void
  onSelectTrip: (tripId: string) => void
}

/** Fits to the union of visible places once, on first mount only when there
    is no persisted camera to restore instead (#79's Camera persistence) —
    and again whenever the *set* of visible places actually changes
    afterward (a filter change), never on a re-render that leaves it the
    same. Mirrors the pre-#79 `WorldRouteLayer`'s own fit-once-per-change
    stance. */
function PlaceLayer({ places, hoveredTripId, onHoverTrip, onSelectTrip }: PlaceLayerProps) {
  const map = useMap()
  const [zoom, setZoom] = useState<number>(() => map?.getZoom() ?? INITIAL_ZOOM)
  const isFirstFit = useRef(true)
  const previousKey = useRef('')

  useEffect(() => {
    if (!map) return
    setZoom(map.getZoom() ?? INITIAL_ZOOM)
    const zoomListener = google.maps.event.addListener(map, 'zoom_changed', () => {
      setZoom(map.getZoom() ?? INITIAL_ZOOM)
    })
    const idleListener = google.maps.event.addListener(map, 'idle', () => {
      const center = map.getCenter()
      const currentZoom = map.getZoom()
      if (center && currentZoom !== undefined) {
        lastCamera = { center: center.toJSON(), zoom: currentZoom }
      }
    })
    return () => {
      zoomListener.remove()
      idleListener.remove()
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const currentKey = places
      .map((place) => place.tripId)
      .sort()
      .join(',')

    if (isFirstFit.current) {
      isFirstFit.current = false
      previousKey.current = currentKey
      if (!lastCamera) fitTracksToBounds(map, places)
      return
    }

    if (currentKey === previousKey.current) return
    previousKey.current = currentKey
    fitTracksToBounds(map, places)
  }, [map, places])

  const clusterable = useMemo(() => places.map((place) => ({ lat: place.lat, lng: place.lng, place })), [places])
  const clusters = useMemo(
    () => clusterMarkers(clusterable, zoom, MARKER_FOOTPRINT_PX),
    [clusterable, zoom],
  )

  if (!map) return null

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.members.length === 1) {
          const place = cluster.members[0].place
          return (
            <PlaceDot
              key={place.tripId}
              place={place}
              emphasized={hoveredTripId === place.tripId}
              onHover={onHoverTrip}
              onSelect={() => onSelectTrip(place.tripId)}
            />
          )
        }
        const key = cluster.members
          .map((member) => member.place.tripId)
          .sort()
          .join(',')
        return <PlaceCluster key={key} cluster={cluster} map={map} />
      })}
    </>
  )
}

function PlaceDot({
  place,
  emphasized,
  onHover,
  onSelect,
}: {
  place: Place
  /** #80: forced into the hover-visual state because the trips panel's
      matching row is hovered, not because the pointer is over this dot —
      the same 1.35 scale and name chip either way (design doc: "Row and
      dot are one object"). */
  emphasized: boolean
  onHover: (tripId: string | null) => void
  onSelect: () => void
}) {
  return (
    <AdvancedMarker position={{ lat: place.lat, lng: place.lng }} zIndex={0} onClick={onSelect}>
      <div
        className={`world-map__dot-hit${emphasized ? ' world-map__dot-hit--emphasized' : ''}`}
        onMouseEnter={() => onHover(place.tripId)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          type="button"
          className={`world-map__dot world-map__dot--${place.status}`}
          aria-label={place.name}
          onFocus={() => onHover(place.tripId)}
          onBlur={() => onHover(null)}
        />
        <span className="world-map__dot-label">{place.name}</span>
      </div>
    </AdvancedMarker>
  )
}

function PlaceCluster({
  cluster,
  map,
}: {
  cluster: MarkerCluster<{ lat: number; lng: number; place: Place }>
  map: google.maps.Map
}) {
  const names = cluster.members.map((member) => member.place.name).join(', ')

  return (
    <AdvancedMarker
      position={{ lat: cluster.lat, lng: cluster.lng }}
      onClick={() =>
        zoomToFitCluster(
          map,
          cluster.members.map((member) => ({ lat: member.lat, lng: member.lng })),
        )
      }
    >
      <button
        type="button"
        className="world-map__cluster"
        aria-label={`${cluster.members.length} trips: ${names}`}
      >
        {cluster.members.length}
      </button>
    </AdvancedMarker>
  )
}

/** #81: draws a not-yet-saved draft's tracks as routes — one `Polyline` per
    track, the same shape `TrackLayer` uses for a trip's own map, rather
    than one path spanning every track (which would draw a false line
    connecting them). Fits the camera to the union on every addition,
    unconditionally: a drop is an explicit "look at this", unlike
    `PlaceLayer`'s once-per-change stance for the already-saved set. */
function DraftRouteLayer({ tracks }: { tracks: Track[] }) {
  const map = useMap()
  const previousKey = useRef('')

  const paths = useMemo(
    () => tracks.map((track) => track.points.map((point) => ({ lat: point.lat, lng: point.lon }))),
    [tracks],
  )
  const allPoints = useMemo(() => paths.flat(), [paths])

  useEffect(() => {
    if (!map || allPoints.length === 0) return
    const key = `${tracks.length}-${allPoints.length}`
    if (key === previousKey.current) return
    previousKey.current = key
    fitTracksToBounds(map, allPoints)
  }, [map, tracks.length, allPoints])

  if (!map) return null

  return (
    <>
      {paths.map((path, index) => (
        <Polyline key={index} path={path} strokeColor={DRAFT_ROUTE_COLOR} strokeWeight={3} clickable={false} />
      ))}
    </>
  )
}
