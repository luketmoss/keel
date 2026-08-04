import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { googleMapsApiKey } from '../env'
import { MapUnavailable } from './MapUnavailable'
import type { TripIndexEntry, TripStatus } from '../store/tripStore'
import { fitTracksToBounds, zoomToFitCluster } from '../map/fitBounds'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import './WorldMap.css'

/* Same "nothing imported yet" default as before there's anything to fit to. */
const INITIAL_CENTER = { lat: 20, lng: 0 }
const INITIAL_ZOOM = 2

const MS_PER_DAY = 86_400_000

/* --marker-size from index.css, transcribed for the same reason PhotoLayer's
   own copy is — clustering's projection math wants real pixels, not a CSS
   var. Keep in step with index.css by hand. */
const MARKER_FOOTPRINT_PX = 28

/** The map's centre and zoom survive a trip visit and return, for the
    session — #79's point, and what makes the map browsable at all now
    that a trip visit unmounts it (#78 doesn't yet make it survive
    navigation to /trips; #80 does). Module-level rather than component
    state so it isn't wiped by `WorldMap` itself remounting, and never
    persisted anywhere, so a reload starts fresh — the better opening frame
    per the design note. */
let lastCamera: { center: google.maps.LatLngLiteral; zoom: number } | null = null

type StatusFilter = 'all' | TripStatus

interface Place {
  tripId: string
  name: string
  status: TripStatus
  lat: number
  lng: number
  /** `startDate` if the trip has one, `createdAt` otherwise — the "date a
      trip never chose" the design note's Notes section describes. Used to
      place the trip on the range slider's span; `dated` is what decides
      whether the slider can ever exclude it. */
  timestamp: number
  dated: boolean
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
    .map((trip) => {
      const dated = trip.startDate !== null
      const timestamp = new Date(trip.startDate ?? trip.createdAt).getTime()
      return {
        tripId: trip.id,
        name: trip.name,
        status: trip.status,
        lat: trip.origin.lat,
        lng: trip.origin.lng,
        timestamp,
        dated,
      }
    })
    .filter((place) => Number.isFinite(place.timestamp))
}

function dayIndex(timestampMs: number): number {
  return Math.floor(timestampMs / MS_PER_DAY)
}

/** `/` (#78 makes it the homepage; #79 replaces what it draws): every trip
    with a place draws as one dot rather than its full route — a route
    means the import is not saved yet (#81), and a dot means it is. */
export function WorldMap({ trips }: WorldMapProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [keyRejected, setKeyRejected] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    window.gm_authFailure = () => setKeyRejected(true)
    return () => {
      delete window.gm_authFailure
    }
  }, [])

  const places = useMemo(() => placesForTrips(trips), [trips])

  const dateSpan = useMemo(() => {
    if (places.length === 0) return null
    const days = places.map((place) => dayIndex(place.timestamp))
    return { min: Math.min(...days), max: Math.max(...days) }
  }, [places])

  const [range, setRange] = useState<[number, number] | null>(() =>
    dateSpan ? [dateSpan.min, dateSpan.max] : null,
  )
  // The slider's range resets to the full span whenever the span itself
  // changes shape (a trip gaining or losing a date) rather than every
  // render — narrowing it back to `[min, max]` on every trip update would
  // make a filter the user just set snap back the moment anything else
  // about the trip list changed.
  const spanKey = dateSpan ? `${dateSpan.min}-${dateSpan.max}` : ''
  const previousSpanKey = useRef(spanKey)
  if (previousSpanKey.current !== spanKey) {
    previousSpanKey.current = spanKey
    setRange(dateSpan ? [dateSpan.min, dateSpan.max] : null)
  }

  const visiblePlaces = useMemo(() => {
    return places.filter((place) => {
      if (filter !== 'all' && place.status !== filter) return false
      if (place.dated && range) {
        const day = dayIndex(place.timestamp)
        if (day < range[0] || day > range[1]) return false
      }
      return true
    })
  }, [places, filter, range])

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
      {!noPlaces && <FilterRow filter={filter} onChange={setFilter} />}
      {!noPlaces && dateSpan && dateSpan.min !== dateSpan.max && range && (
        <DateRangeControl min={dateSpan.min} max={dateSpan.max} value={range} onChange={setRange} />
      )}
      <APIProvider apiKey={googleMapsApiKey} onError={() => setKeyRejected(true)}>
        <Map
          className="map"
          defaultCenter={lastCamera?.center ?? INITIAL_CENTER}
          defaultZoom={lastCamera?.zoom ?? INITIAL_ZOOM}
          mapTypeId="satellite"
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
        >
          <PlaceLayer places={visiblePlaces} onSelectTrip={(id) => navigate(`/trips/${id}`)} />
        </Map>
      </APIProvider>
      {noPlaces ? (
        <EmptyOverlay
          heading="No places yet"
          detail="Drop a KML anywhere to start your first trip."
        />
      ) : (
        filteredEmpty && (
          <EmptyOverlay heading="Nothing in this range" detail="Widen the filters to see your trips." />
        )
      )}
    </div>
  )
}

interface WorldMapProps {
  trips: TripIndexEntry[]
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

function yearOf(day: number): number {
  return new Date(day * MS_PER_DAY).getFullYear()
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
  onSelectTrip: (tripId: string) => void
}

/** Fits to the union of visible places once, on first mount only when there
    is no persisted camera to restore instead (#79's Camera persistence) —
    and again whenever the *set* of visible places actually changes
    afterward (a filter change), never on a re-render that leaves it the
    same. Mirrors the pre-#79 `WorldRouteLayer`'s own fit-once-per-change
    stance. */
function PlaceLayer({ places, onSelectTrip }: PlaceLayerProps) {
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
          return <PlaceDot key={place.tripId} place={place} onSelect={() => onSelectTrip(place.tripId)} />
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

function PlaceDot({ place, onSelect }: { place: Place; onSelect: () => void }) {
  return (
    <AdvancedMarker position={{ lat: place.lat, lng: place.lng }} zIndex={0} onClick={onSelect}>
      <div className="world-map__dot-hit">
        <button
          type="button"
          className={`world-map__dot world-map__dot--${place.status}`}
          aria-label={place.name}
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
