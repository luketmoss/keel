import { useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import { zoomToFitCluster } from '../map/fitBounds'
import { clusterAriaLabel, clusterProvenance, ringStyleForPhoto } from '../photo/provenance'
import { usePhotoImage } from '../photo/usePhotoImage'
import { useDraggableCairn } from '../map/useDraggableCairn'
import type { LatLng } from '../map/geo'
import { CairnMarker } from './CairnMarker'
import type { CairnIcon, PositionSource } from '../store/looseStore'
import './CairnLayer.css'

/** A cairn flattened to what this layer draws — every cairn on this map
    has a position (`cairns.md`), so there is no "unlocated" case to filter
    out any more. Not the model's own `CairnRecord`: this layer only needs
    the fields a marker draws from. */
export interface PositionedCairn {
  id: string
  name: string
  thumbnailDriveFileId: string | null
  icon: CairnIcon | null
  latitude: number
  longitude: number
  source: PositionSource
}

/* --marker-size from index.css, transcribed — AdvancedMarker content takes
   real pixels for clustering's projection math, not a CSS var (same
   rationale WorldMap's COMPLETED_COLOR gives for its own transcribed
   values). Keep this in step with index.css's --marker-size by hand. */
const MARKER_FOOTPRINT_PX = 28

interface CairnLayerProps {
  cairns: PositionedCairn[]
  /** Drive access token for thumbnail fetches through #53's cache — `null`
      renders every thumbnail marker with its `--surface-lift` fallback
      fill, same as a thumbnail that hasn't arrived yet. */
  accessToken: string | null
  selectedCairnId: string | null
  onSelectCairn: (cairnId: string) => void
  /** #55: clicking an *already-selected* marker opens the lightbox rather
      than reselecting (design doc's "Opening a photo" section — clicking
      its row, or its already-selected marker). Clicking a marker that
      isn't yet selected still only selects it, via `onSelectCairn` above —
      the two are never both called for the same click. Optional so a
      future caller with no lightbox can omit it. */
  onOpenCairn?: (cairnId: string) => void
  /** #158: false disables dragging for every marker this layer draws —
      disconnected (#73) or the #155 placement queue owns the map. `undefined`
      is treated as `false`: a caller that hasn't been updated for this issue
      gets the old, non-draggable behaviour rather than an accidental opt-in. */
  draggable?: boolean
  /** #158: called once, on drop, only when a marker actually moved.
      Resolves whether the write landed — `false` reverts it. */
  onMoveCairn?: (cairnId: string, position: LatLng) => Promise<boolean>
}

/** Renders positioned cairns as clustered `AdvancedMarker`s above the
    track polylines drawn by `TrackLayer` — mounted as a sibling of it in
    `TripDetail`, later in JSX order, which is what keeps it on top (design
    doc's Layering section) since `AdvancedMarker`'s pane
    (`overlayMouseTarget`) already sits above `Polyline`'s
    (`overlayLayer`) regardless of mount order; sibling-after just keeps
    DOM order legible for anyone reading the tree.

    Each single marker draws via `CairnMarker`'s one predicate (`cairns.md`,
    "Markers, rows and chips") — a thumbnail circle or a pin, chosen the
    same way the list row and the world map's loose markers choose it. A
    cluster of several cairns keeps the pre-#169 provenance-ring treatment
    (`#54`'s design), unchanged: redrawing clustering for a mix of pins and
    thumbnails is not this issue's to solve. */
export function CairnLayer({
  cairns,
  accessToken,
  selectedCairnId,
  onSelectCairn,
  onOpenCairn,
  draggable = false,
  onMoveCairn,
}: CairnLayerProps) {
  const map = useMap()
  const [zoom, setZoom] = useState<number>(() => map?.getZoom() ?? 2)

  useEffect(() => {
    if (!map) return
    setZoom(map.getZoom() ?? 2)
    const listener = google.maps.event.addListener(map, 'zoom_changed', () => {
      setZoom(map.getZoom() ?? 2)
    })
    return () => listener.remove()
  }, [map])

  const clusterable = useMemo(
    () => cairns.map((cairn) => ({ lat: cairn.latitude, lng: cairn.longitude, cairn })),
    [cairns],
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
          const cairn = cluster.members[0].cairn
          return (
            <SingleCairnMarker
              key={cairn.id}
              cairn={cairn}
              accessToken={accessToken}
              selected={selectedCairnId === cairn.id}
              onSelect={onSelectCairn}
              onOpen={onOpenCairn}
              draggable={draggable}
              onMove={onMoveCairn}
            />
          )
        }
        const key = cluster.members
          .map((member) => member.cairn.id)
          .sort()
          .join(',')
        return <ClusterMarker key={key} cluster={cluster} map={map} />
      })}
    </>
  )
}

function SingleCairnMarker({
  cairn,
  accessToken,
  selected,
  onSelect,
  onOpen,
  draggable,
  onMove,
}: {
  cairn: PositionedCairn
  accessToken: string | null
  selected: boolean
  onSelect: (cairnId: string) => void
  onOpen?: (cairnId: string) => void
  draggable: boolean
  onMove?: (cairnId: string, position: LatLng) => Promise<boolean>
}) {
  const thumbnailUrl = usePhotoImage(accessToken, cairn.thumbnailDriveFileId ?? undefined).url
  // `tabIndex={-1}`: focusable via `.focus()` below (so #55's lightbox can
  // return focus here on close, per its design doc) without joining the
  // tab order — this element was never keyboard-reachable before #55 and
  // making it so is out of this issue's scope.
  const hitRef = useRef<HTMLDivElement>(null)

  const drag = useDraggableCairn({
    position: { lat: cairn.latitude, lng: cairn.longitude },
    draggable,
    onMove: (position) => onMove?.(cairn.id, position) ?? Promise.resolve(false),
  })

  function handleClick() {
    if (drag.consumeDragClick()) return
    hitRef.current?.focus()
    if (selected) {
      onOpen?.(cairn.id)
    } else {
      onSelect(cairn.id)
    }
  }

  return (
    <AdvancedMarker
      position={drag.position}
      zIndex={selected ? 1 : 0}
      draggable={draggable}
      onDragStart={drag.onDragStart}
      onDrag={drag.onDrag}
      onDragEnd={drag.onDragEnd}
      onClick={handleClick}
    >
      <div
        ref={hitRef}
        tabIndex={-1}
        className={`cairn-layer__hit${draggable ? ' cairn-layer__hit--draggable' : ''}${drag.dragging ? ' cairn-layer__hit--dragging' : ''}`}
        role="button"
        aria-label={cairn.name}
        aria-pressed={selected}
        data-testid="cairn-marker"
        data-cairn-id={cairn.id}
        data-source={cairn.source}
        data-selected={selected}
        data-draggable={draggable}
        data-dragging={drag.dragging}
      >
        <CairnMarker
          icon={cairn.icon}
          thumbnailUrl={thumbnailUrl}
          hasImage={cairn.thumbnailDriveFileId !== null}
          source={cairn.source}
          selected={selected}
        />
      </div>
    </AdvancedMarker>
  )
}

function ClusterMarker({
  cluster,
  map,
}: {
  cluster: MarkerCluster<{ lat: number; lng: number; cairn: PositionedCairn }>
  map: google.maps.Map
}) {
  const provenance = clusterProvenance(cluster.members.map((member) => member.cairn))
  const ring = ringStyleForPhoto(provenance, false)
  const label = clusterAriaLabel(cluster.members.length)

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
      <div
        className="cairn-layer__hit"
        role="button"
        aria-label={label}
        data-testid="cairn-cluster"
        data-count={cluster.members.length}
        data-source={provenance}
      >
        <div
          className="cairn-layer__cluster"
          style={{
            borderStyle: ring.borderStyle,
            borderWidth: `var(${ring.widthVar})`,
            borderColor: `var(${ring.colorVar})`,
          }}
        >
          {cluster.members.length}
        </div>
      </div>
    </AdvancedMarker>
  )
}
