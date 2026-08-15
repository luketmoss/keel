import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { FeatureCollection, LineString } from 'geojson'
import { trackColor } from '../map/palette'
import type { LooseRecord, LooseStore } from '../store/looseStore'
import { usePhotoImage } from '../photo/usePhotoImage'
import { CairnMarker } from './CairnMarker'
import './LooseLayer.css'

interface LooseLayerProps {
  items: LooseRecord[]
  store: LooseStore
  /** #134: Drive access token for a loose photo's thumbnail, through the
      same caching loader `CairnLayer` uses — `null` renders every marker
      with its `--surface-lift` fallback fill, same as a thumbnail that
      hasn't arrived yet. */
  accessToken: string | null
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
  accessToken,
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
          <CairnDot
            key={item.id}
            item={item}
            accessToken={accessToken}
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

function CairnDot({
  item,
  accessToken,
  emphasized,
  onHover,
  onSelect,
}: {
  item: Extract<LooseRecord, { kind: 'cairn' }>
  accessToken: string | null
  emphasized: boolean
  onHover: (id: string | null) => void
  onSelect: () => void
}) {
  // #134: the same fallback the standing document already specifies for a
  // cairn without one — a cairn whose thumbnail is missing or fails to
  // load keeps drawing at the same size and ring, in the `--surface-lift`
  // fill, rather than disappearing from the map. `CairnMarker` (#169)
  // draws the pin-vs-thumbnail predicate itself, so an icon-only cairn
  // draws its pin here exactly as it does everywhere else the predicate
  // is read.
  const thumbnailUrl = usePhotoImage(accessToken, item.image?.thumbnailDriveFileId).url
  return (
    <AdvancedMarker position={item.position} zIndex={0} onClick={onSelect}>
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
        >
          <CairnMarker
            icon={item.icon}
            thumbnailUrl={thumbnailUrl}
            hasImage={item.image !== null}
            source={item.positionSource}
            selected={emphasized}
          />
        </button>
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
