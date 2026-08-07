import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { FeatureCollection, LineString } from 'geojson'
import { trackColor } from '../map/palette'
import type { LooseRecord, LooseStore } from '../store/looseStore'
import './LooseLayer.css'

interface LooseLayerProps {
  items: LooseRecord[]
  store: LooseStore
  hoveredId: string | null
  onHover: (id: string | null) => void
  onSelect: (item: LooseRecord) => void
  /** Drawn as a route rather than only a tile. A track's route draws on
      hover and on selection, never at rest — that keeps the world readable
      at six things or six hundred, and keeps the performance rule honest. */
  selectedId: string | null
}

/** Loose tracks and photos on the shell's map.
 *
 * Tracks draw as a rounded tile in the track's own colour, photos as a
 * circular marker. Both resolve the map through `useMap()` like every other
 * layer, so nothing here owns a `<Map>`. */
export function LooseLayer({
  items,
  store,
  hoveredId,
  onHover,
  onSelect,
  selectedId,
}: LooseLayerProps) {
  const map = useMap()
  if (!map) return null

  return (
    <>
      {items.map((item) => {
        if (item.position === null) return null
        const emphasized = hoveredId === item.id || selectedId === item.id
        return item.kind === 'track' ? (
          <TrackTile
            key={item.id}
            item={item}
            emphasized={emphasized}
            onHover={onHover}
            onSelect={() => onSelect(item)}
          />
        ) : (
          <PhotoDot
            key={item.id}
            item={item}
            emphasized={emphasized}
            onHover={onHover}
            onSelect={() => onSelect(item)}
          />
        )
      })}
      {items.map((item) =>
        item.kind === 'track' && (hoveredId === item.id || selectedId === item.id) ? (
          <LooseRoute key={`route-${item.id}`} id={item.id} store={store} colorIndex={item.colorIndex} />
        ) : null,
      )}
    </>
  )
}

function TrackTile({
  item,
  emphasized,
  onHover,
  onSelect,
}: {
  item: Extract<LooseRecord, { kind: 'track' }>
  emphasized: boolean
  onHover: (id: string | null) => void
  onSelect: () => void
}) {
  const position = item.position as { lat: number; lng: number }
  return (
    <AdvancedMarker position={position} zIndex={0} onClick={onSelect}>
      <div
        className={`loose-marker${emphasized ? ' loose-marker--emphasized' : ''}`}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          type="button"
          className="loose-marker__tile"
          style={{ background: trackColor(item.colorIndex) }}
          aria-label={item.name}
          onFocus={() => onHover(item.id)}
          onBlur={() => onHover(null)}
        />
        <span className="loose-marker__label">{item.name}</span>
      </div>
    </AdvancedMarker>
  )
}

function PhotoDot({
  item,
  emphasized,
  onHover,
  onSelect,
}: {
  item: Extract<LooseRecord, { kind: 'photo' }>
  emphasized: boolean
  onHover: (id: string | null) => void
  onSelect: () => void
}) {
  const position = item.position as { lat: number; lng: number }
  return (
    <AdvancedMarker position={position} zIndex={0} onClick={onSelect}>
      <div
        className={`loose-marker${emphasized ? ' loose-marker--emphasized' : ''}`}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          type="button"
          className="loose-marker__photo"
          aria-label={item.name}
          onFocus={() => onHover(item.id)}
          onBlur={() => onHover(null)}
        />
        <span className="loose-marker__label">{item.name}</span>
      </div>
    </AdvancedMarker>
  )
}

/** The track's route, read from its precomputed overview — never from a
    source KML, per cairn's performance rule, which covers loose tracks. */
function LooseRoute({
  id,
  store,
  colorIndex,
}: {
  id: string
  store: LooseStore
  colorIndex: number
}) {
  const map = useMap()
  const [overview, setOverview] = useState<FeatureCollection<LineString> | null>(null)
  const requestedFor = useRef<string | null>(null)

  useEffect(() => {
    if (requestedFor.current === id) return
    requestedFor.current = id
    setOverview(store.getOverview(id))
  }, [id, store])

  const paths = useMemo(() => {
    if (!overview) return []
    return overview.features
      .filter((feature) => feature.geometry?.type === 'LineString')
      .map((feature) =>
        (feature.geometry as LineString).coordinates.map(([lng, lat]) => ({ lat, lng })),
      )
  }, [overview])

  if (!map) return null

  return (
    <>
      {paths.map((path, index) => (
        <Polyline
          key={index}
          path={path}
          strokeColor={trackColor(colorIndex)}
          strokeWeight={3}
          clickable={false}
        />
      ))}
    </>
  )
}
