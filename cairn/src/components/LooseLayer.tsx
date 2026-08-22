import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { FeatureCollection, LineString } from 'geojson'
import { trackColor } from '../map/palette'
import { canChangeOwner, type LooseRecord, type LooseStore } from '../store/looseStore'
import { usePhotoImage } from '../photo/usePhotoImage'
import { useDraggableCairn } from '../map/useDraggableCairn'
import type { LatLng } from '../map/geo'
import { columnInset, revealPoints } from '../map/reveal'
import { useIsPhone } from '../map/useIsPhone'
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
  /** #158: false disables dragging for every cairn this layer draws —
      disconnected (#73) or the #155 placement queue owns the map. A cairn
      still mid-upload (`canChangeOwner`) is refused per-item regardless. */
  draggable?: boolean
  /** #158: called once, on drop, only when a marker actually moved.
      Resolves whether the write landed — `false` reverts it. */
  onMoveCairn?: (id: string, position: LatLng) => Promise<boolean>
  /** #270: true while a decision owns the map — the reveal helper does not
      fire, same condition `TripDetail` reads for its own two call sites.
      Defaults to `false` so a caller that hasn't been updated for this
      issue keeps revealing unconditionally. */
  revealSuspended?: boolean
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
  draggable = false,
  onMoveCairn,
  revealSuspended = false,
}: LooseLayerProps) {
  const map = useMap()
  const isPhone = useIsPhone()

  /** #270 — "selecting a loose track or cairn from the shell list moves the
      world map to it under the same three-step rule". Keyed on `selectedId`
      alone, never on the camera, matching `TripDetail`'s own two reveal
      effects: `items`/`store` are read at fire time rather than listed as
      dependencies, so a re-render that leaves the selection alone never
      re-fires it. A loose track reveals its precomputed overview line
      strings — never the source KML, per the performance rule, which is
      what a loose track's overview already exists to satisfy — and a loose
      cairn its own coordinate, which (being a point) always takes the pan
      branch and never the fit one, the same as a trip's own cairns. */
  useEffect(() => {
    if (!map || revealSuspended || !selectedId) return
    const item = items.find((candidate) => candidate.id === selectedId)
    if (!item || item.position === null) return
    if (item.kind === 'cairn') {
      revealPoints(map, [item.position as LatLng], columnInset(isPhone))
      return
    }
    const overview = store.getOverview(item.id)
    const points = overview
      ? overview.features
          .filter((feature) => feature.geometry?.type === 'LineString')
          .flatMap((feature) => (feature.geometry as LineString).coordinates.map(([lng, lat]) => ({ lat, lng })))
      : []
    revealPoints(map, points, columnInset(isPhone))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

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
            draggable={draggable && canChangeOwner(item)}
            onMove={onMoveCairn}
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
  draggable,
  onMove,
}: {
  item: Extract<LooseRecord, { kind: 'cairn' }>
  accessToken: string | null
  emphasized: boolean
  onHover: (id: string | null) => void
  onSelect: () => void
  draggable: boolean
  onMove?: (id: string, position: LatLng) => Promise<boolean>
}) {
  // #134: the same fallback the standing document already specifies for a
  // cairn without one — a cairn whose thumbnail is missing or fails to
  // load keeps drawing at the same size and ring, in the `--surface-lift`
  // fill, rather than disappearing from the map. `CairnMarker` (#169)
  // draws the pin-vs-thumbnail predicate itself, so an icon-only cairn
  // draws its pin here exactly as it does everywhere else the predicate
  // is read.
  const thumbnailUrl = usePhotoImage(accessToken, item.image?.thumbnailDriveFileId).url

  const drag = useDraggableCairn({
    position: item.position,
    draggable,
    onMove: (position) => onMove?.(item.id, position) ?? Promise.resolve(false),
  })

  function handleClick() {
    if (drag.consumeDragClick()) return
    onSelect()
  }

  return (
    <AdvancedMarker
      position={drag.position}
      zIndex={0}
      draggable={draggable}
      onDragStart={drag.onDragStart}
      onDrag={drag.onDrag}
      onDragEnd={drag.onDragEnd}
      onClick={handleClick}
    >
      <div
        className={`loose-marker${emphasized ? ' loose-marker--emphasized' : ''}${drag.dragging ? ' loose-marker--dragging' : ''}`}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
      >
        <button
          type="button"
          className={`loose-marker__photo${draggable ? ' loose-marker__photo--draggable' : ''}`}
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
