import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { TripIndexEntry, TripStatus } from '../store/tripStore'
import type { Track } from '../kml/parse'
import { matchesTripFilters, type TripFilters } from '../store/tripFilters'
import { fitTracksToBounds, zoomToFitCluster } from '../map/fitBounds'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import './WorldMap.css'

/* --text from index.css, transcribed — Google Maps' Polyline options take
   real colour values, not CSS custom properties. */
const DRAFT_ROUTE_COLOR = '#f1f3fa'

const INITIAL_ZOOM = 2

/* --marker-size from index.css, transcribed for the same reason PhotoLayer's
   own copy is — clustering's projection math wants real pixels, not a CSS
   var. Keep in step with index.css by hand. */
const MARKER_FOOTPRINT_PX = 28

interface Place {
  tripId: string
  name: string
  status: TripStatus
  lat: number
  lng: number
}

export function placesForTrips(trips: TripIndexEntry[]): Place[] {
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

export function visibleTripsFor(trips: TripIndexEntry[], filters: TripFilters): TripIndexEntry[] {
  return trips.filter((trip) => matchesTripFilters(trip, filters))
}

interface WorldLayerProps {
  trips: TripIndexEntry[]
  filters: TripFilters
  hoveredTripId: string | null
  onHoverTrip: (tripId: string | null) => void
  onSelectTrip: (tripId: string) => void
  /** #81: the tracks of a drop-to-draft trip that hasn't been saved yet.
      Drawn white, which is now what marks it unsaved: loose tracks will
      draw real routes in their own colours (#110), so the presence of a
      line no longer distinguishes a draft — the standing document's "A
      white route means unsaved". */
  draftTracks?: Track[]
}

/** Every trip with a place, drawn as one dot on the shell's single map.

    No longer owns a `<Map>` of its own: `MapCanvas` mounts the only one for
    the session and this resolves it through `useMap()`, which is what lets
    a trip's own layers replace these markers without the map instance ever
    being torn down. */
export function WorldLayer({
  trips,
  filters,
  hoveredTripId,
  onHoverTrip,
  onSelectTrip,
  draftTracks,
}: WorldLayerProps) {
  const visibleTrips = useMemo(() => visibleTripsFor(trips, filters), [trips, filters])
  const visiblePlaces = useMemo(() => placesForTrips(visibleTrips), [visibleTrips])

  return (
    <>
      <PlaceLayer
        places={visiblePlaces}
        hoveredTripId={hoveredTripId}
        onHoverTrip={onHoverTrip}
        onSelectTrip={onSelectTrip}
      />
      {draftTracks && draftTracks.length > 0 && <DraftRouteLayer tracks={draftTracks} />}
    </>
  )
}

/** The map's own empty and signed-out treatments, over the live basemap
    rather than instead of it. */
export function MapEmptyOverlay({ heading, detail }: { heading: string; detail?: string }) {
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

/** Fits to the union of visible places once, on first mount, and again
    whenever the *set* of visible places actually changes afterward (a filter
    change) — never on a re-render that leaves it the same.

    #79's module-level camera snapshot is gone: the map is never unmounted
    now, so its centre and zoom survive navigation because nothing destroys
    them, not because they were copied out first. */
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
    return () => {
      zoomListener.remove()
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
      fitTracksToBounds(map, places)
      return
    }

    if (currentKey === previousKey.current) return
    previousKey.current = currentKey
    fitTracksToBounds(map, places)
  }, [map, places])

  const clusterable = useMemo(
    () => places.map((place) => ({ lat: place.lat, lng: place.lng, place })),
    [places],
  )
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
  /** #80: forced into the hover-visual state because the panel's matching
      row is hovered, not because the pointer is over this dot — the same
      1.35 scale and name chip either way. */
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
    track rather than one path spanning every track (which would draw a
    false line connecting them). Fits the camera to the union on every
    addition, unconditionally: a drop is an explicit "look at this". */
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
        <Polyline
          key={index}
          path={path}
          strokeColor={DRAFT_ROUTE_COLOR}
          strokeWeight={3}
          clickable={false}
        />
      ))}
    </>
  )
}
