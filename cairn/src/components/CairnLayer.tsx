import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import { clusterSeparatesAtZoom, fanOutPositions, type FannedPlacement } from '../map/fanOut'
import { CLUSTER_MAX_ZOOM, zoomToFitCluster } from '../map/fitBounds'
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

/** #251: the rest value of `hoveredCairnIds`, and every caller's default —
    one shared empty set rather than a fresh `new Set()` per render for
    every marker that reads it, the same reasoning `EMPTY_PLACEMENT_QUEUE`
    already gives its own rest value. Never mutated. */
const EMPTY_HOVERED_CAIRN_IDS: ReadonlySet<string> = new Set()

interface CairnLayerProps {
  cairns: PositionedCairn[]
  /** Drive access token for thumbnail fetches through #53's cache — `null`
      renders every thumbnail marker with its `--surface-lift` fallback
      fill, same as a thumbnail that hasn't arrived yet. */
  accessToken: string | null
  selectedCairnId: string | null
  onSelectCairn: (cairnId: string) => void
  /** #194 made clicking *any* marker select the cairn and open its detail
      face in one click, matching what a list row did. #250 revises that:
      the row's click now expands the row in place for a cairn with an
      image rather than opening the lightbox, and this marker click follows
      it exactly — `TripDetail.selectCairn` is the one function both this
      and `CairnList.onOpenRow` call, so the two surfaces cannot drift on
      which. An icon-only cairn still opens straight to its detail face,
      unchanged. Both this and `onSelectCairn` are called for the click, in
      that order; `selectCairn` sets the selection itself too, so the pair
      is idempotent there. Optional so a caller with no detail face falls
      back to selecting alone. */
  onOpenCairn?: (cairnId: string) => void
  /** #158: false disables dragging for every marker this layer draws —
      disconnected (#73) or the #155 placement queue owns the map. `undefined`
      is treated as `false`: a caller that hasn't been updated for this issue
      gets the old, non-draggable behaviour rather than an accidental opt-in. */
  draggable?: boolean
  /** #158: called once, on drop, only when a marker actually moved.
      Resolves whether the write landed — `false` reverts it. */
  onMoveCairn?: (cairnId: string, position: LatLng) => Promise<boolean>
  /** #251: the trip's one hovered-cairn set, held by `TripDetail` and read
      here the same way `selectedCairnId` already is. Holds exactly one id
      for an ordinary marker, or every id a hovered cluster holds — see
      `251-linked-hover.md`'s "The state". Defaults to the shared empty set
      so every existing call site (and every test in `CairnLayer.test.tsx`
      written before this issue) keeps working unchanged. */
  hoveredCairnIds?: ReadonlySet<string>
  /** #251: writes `hoveredCairnIds` back up. A single marker calls this
      with its own id alone; a cluster calls it with every member id at
      once; either clears with the empty set on leave/blur. Optional for
      the same backward-compatibility reason `hoveredCairnIds` is. */
  onHoverCairn?: (cairnIds: ReadonlySet<string>) => void
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
  hoveredCairnIds = EMPTY_HOVERED_CAIRN_IDS,
  onHoverCairn = () => {},
}: CairnLayerProps) {
  const map = useMap()
  const [zoom, setZoom] = useState<number>(() => map?.getZoom() ?? 2)
  /* #194 — the one expanded cluster, held by its member-id key. One piece
     of state rather than a set is what makes "only one cluster is expanded
     at a time" true by construction. A key that no longer matches any
     cluster (the cairns changed under it) simply matches nothing and the
     fan disappears, so there is no stale state to clean up. */
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const collapse = useCallback(() => setExpandedKey(null), [])

  useEffect(() => {
    if (!map) return
    setZoom(map.getZoom() ?? 2)
    const listener = google.maps.event.addListener(map, 'zoom_changed', () => {
      setZoom(map.getZoom() ?? 2)
    })
    return () => listener.remove()
  }, [map])

  /* #194 — everything that dismisses a fan. Registered only while one is
     open, so an idle map carries no listeners it doesn't need.

     `bounds_changed` is the camera: it covers a pan, a zoom and a window
     resize alike, and the fan's coordinates are only correct at the zoom
     and centre they were computed for. Nothing here moves the camera
     itself, so this cannot fire on the expansion that just happened.

     A click on a marker does not reach the map's own `click` — Google's
     `AdvancedMarker` sits in a separate pane and consumes it — so
     "elsewhere on the map" is exactly what this listener means. */
  useEffect(() => {
    if (!map || expandedKey === null) return
    const clickListener = google.maps.event.addListener(map, 'click', collapse)
    const cameraListener = google.maps.event.addListener(map, 'bounds_changed', collapse)
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clickListener.remove()
      cameraListener.remove()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [map, expandedKey, collapse])

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
              hovered={hoveredCairnIds.has(cairn.id)}
              onHoverChange={(hovered) => onHoverCairn(hovered ? new Set([cairn.id]) : EMPTY_HOVERED_CAIRN_IDS)}
            />
          )
        }
        const key = cluster.members
          .map((member) => member.cairn.id)
          .sort()
          .join(',')
        /* #251: whether *this* cluster is the one `hoveredCairnIds` names —
           by intersection, per the design note's read rule. A row-hover for
           a clustered cairn writes only that cairn's own id (`CairnList`
           doesn't know about clustering, and per the design note it doesn't
           need to), and that id is one of this cluster's own member ids, so
           "hovering a row whose cairn is inside a collapsed cluster
           emphasises the cluster" falls out of this test for free rather
           than needing a second, cluster-aware write path. */
        const hovered = cluster.members.some((member) => hoveredCairnIds.has(member.cairn.id))
        const hoverMemberIds = () => new Set(cluster.members.map((member) => member.cairn.id))
        if (key === expandedKey) {
          return (
            <ExpandedCluster
              key={key}
              cluster={cluster}
              zoom={zoom}
              accessToken={accessToken}
              selectedCairnId={selectedCairnId}
              onSelect={onSelectCairn}
              onOpen={onOpenCairn}
              onCollapse={collapse}
              hovered={hovered}
              onHoverChange={(next) => onHoverCairn(next ? hoverMemberIds() : EMPTY_HOVERED_CAIRN_IDS)}
            />
          )
        }
        return (
          <ClusterMarker
            key={key}
            cluster={cluster}
            map={map}
            onExpand={() => setExpandedKey(key)}
            hovered={hovered}
            onHoverChange={(next) => onHoverCairn(next ? hoverMemberIds() : EMPTY_HOVERED_CAIRN_IDS)}
          />
        )
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
  fan,
  hovered = false,
  onHoverChange,
}: {
  cairn: PositionedCairn
  accessToken: string | null
  selected: boolean
  onSelect: (cairnId: string) => void
  onOpen?: (cairnId: string) => void
  draggable: boolean
  onMove?: (cairnId: string, position: LatLng) => Promise<boolean>
  /** #194: set only while this marker is one of an expanded cluster's
      members, in which case it is drawn at a fanned-out coordinate rather
      than the cairn's own, and carries a leader line back to the anchor. */
  fan?: FannedPlacement
  /** #251: this cairn's id is in `hoveredCairnIds`. Defaults `false` and is
      never read from the shared set for a fanned member — `ExpandedCluster`
      below passes neither prop to its own members, on purpose: the fan's
      individual markers are out of scope for hover
      (251-linked-hover.md's "Out of scope"). */
  hovered?: boolean
  /** #251: writes `hoveredCairnIds` on mouseenter/leave/focus/blur.
      `undefined` for a fanned member, which wires no hover handlers at all
      for the same out-of-scope reason `hovered` above gives. */
  onHoverChange?: (hovered: boolean) => void
}) {
  const thumbnailUrl = usePhotoImage(accessToken, cairn.thumbnailDriveFileId ?? undefined).url
  // `tabIndex={-1}`: focusable via `.focus()` below (so #55's lightbox can
  // return focus here on close, per its design doc) without joining the
  // tab order — this element was never keyboard-reachable before #55 and
  // making it so is out of this issue's scope.
  const hitRef = useRef<HTMLDivElement>(null)

  /* #194: a fanned marker is not standing on its cairn's coordinate, so
     dragging it would write the fan's own offset into the record. Dragging
     is refused for the duration of the expansion; collapsing the fan gives
     it straight back. */
  const dragAllowed = draggable && fan === undefined

  const drag = useDraggableCairn({
    position: fan ?? { lat: cairn.latitude, lng: cairn.longitude },
    draggable: dragAllowed,
    onMove: (position) => onMove?.(cairn.id, position) ?? Promise.resolve(false),
  })

  /* #194, revised by #250: select *and* open, in that order, for every
     click — a marker and a list row are two representations of one cairn
     and behave the same, whether "open" means the lightbox (icon-only) or
     the row's own expansion (an image). An already-selected marker takes
     the same path, so a click never deselects or closes. */
  function handleClick() {
    if (drag.consumeDragClick()) return
    hitRef.current?.focus()
    onSelect(cairn.id)
    onOpen?.(cairn.id)
  }

  return (
    <AdvancedMarker
      position={drag.position}
      zIndex={fan ? 2 : selected ? 1 : 0}
      draggable={dragAllowed}
      onDragStart={drag.onDragStart}
      onDrag={drag.onDrag}
      onDragEnd={drag.onDragEnd}
      onClick={handleClick}
    >
      <div
        ref={hitRef}
        tabIndex={-1}
        className={`cairn-layer__hit${dragAllowed ? ' cairn-layer__hit--draggable' : ''}${drag.dragging ? ' cairn-layer__hit--dragging' : ''}${fan ? ' cairn-layer__hit--fanned' : ''}${hovered ? ' cairn-layer__hit--hovered' : ''}`}
        role="button"
        aria-label={cairn.name}
        aria-pressed={selected}
        data-testid="cairn-marker"
        data-cairn-id={cairn.id}
        data-source={cairn.source}
        data-selected={selected}
        data-draggable={dragAllowed}
        data-dragging={drag.dragging}
        data-fanned={fan !== undefined}
        /* #251: mouseenter/leave and focus/blur write the same
           `hoveredCairnIds` a list row does — "one treatment, three
           sources" (shell-and-content-model.md, quoted in the design
           note). `onHoverChange` is `undefined` for a fanned member, so
           these become no-ops rather than throwing — see the prop doc
           above for why the fan is excluded on purpose. */
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        onFocus={() => onHoverChange?.(true)}
        onBlur={() => onHoverChange?.(false)}
      >
        {fan && (
          /* Drawn from the marker back to the anchor: a hairline of the
             fan's own radius, rotated to point the opposite way to the
             angle the marker sits at. Doing it here rather than as a
             `Polyline` keeps it exact at any projection and keeps it out
             of the way of clicks. */
          <span
            className="cairn-layer__leader"
            style={{
              width: `${fan.radiusPx}px`,
              transform: `rotate(${fan.angleDeg + 90}deg)`,
            }}
          />
        )}
        <CairnMarker
          icon={cairn.icon}
          thumbnailUrl={thumbnailUrl}
          hasImage={cairn.thumbnailDriveFileId !== null}
          source={cairn.source}
          selected={selected}
          hovered={hovered}
        />
      </div>
    </AdvancedMarker>
  )
}

type CairnCluster = MarkerCluster<{ lat: number; lng: number; cairn: PositionedCairn }>

function ClusterMarker({
  cluster,
  map,
  onExpand,
  hovered,
  onHoverChange,
}: {
  cluster: CairnCluster
  map: google.maps.Map
  /** #194: called instead of zooming, when zooming would achieve nothing. */
  onExpand: () => void
  /** #251: true when any member's id is in `hoveredCairnIds` — either
      because this cluster marker itself is hovered (in which case it is
      every member's id), or because a row for one of its members is
      hovered instead (in which case it's that one id, which is still one
      of this cluster's own members — see the call site's comment). */
  hovered: boolean
  /** #251: writes every member id at once — "hovering a cluster marker
      lights every row it holds" — and clears with the empty set on leave. */
  onHoverChange: (hovered: boolean) => void
}) {
  const provenance = clusterProvenance(cluster.members.map((member) => member.cairn))
  const ring = ringStyleForPhoto(provenance, false, hovered)
  const label = clusterAriaLabel(cluster.members.length)

  /* #194: zoom-to-fit where zoom-to-fit works, expand in place where it
     does not — and which it is, is computed from the members themselves
     rather than guessed. Anything that would still be one cluster at the
     cap that `zoomToFitCluster` stops at can never be separated by moving
     the camera, and clicking it used to do nothing at all. */
  function handleClick() {
    const points = cluster.members.map((member) => ({ lat: member.lat, lng: member.lng }))
    if (clusterSeparatesAtZoom(points, CLUSTER_MAX_ZOOM, MARKER_FOOTPRINT_PX)) {
      zoomToFitCluster(map, points)
      return
    }
    onExpand()
  }

  return (
    <AdvancedMarker position={{ lat: cluster.lat, lng: cluster.lng }} onClick={handleClick}>
      <div
        className={`cairn-layer__hit${hovered ? ' cairn-layer__hit--hovered' : ''}`}
        role="button"
        aria-label={label}
        data-testid="cairn-cluster"
        data-count={cluster.members.length}
        data-source={provenance}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
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

/** #194 — a cluster whose members cannot be separated by any camera move,
    drawn open: the badge stays where it was as the fan's anchor, and every
    member is spread around it as an ordinary marker with a leader line
    home. Each behaves exactly as it would unclustered — one click follows
    the same select/expand/open rule #250 gives every marker — which is
    what makes "every cairn is reachable from the map alone" true at any
    zoom.

    The badge itself collapses the fan when clicked, so the gesture that
    opened it undoes it too. */
function ExpandedCluster({
  cluster,
  zoom,
  accessToken,
  selectedCairnId,
  onSelect,
  onOpen,
  onCollapse,
  hovered,
  onHoverChange,
}: {
  cluster: CairnCluster
  zoom: number
  accessToken: string | null
  selectedCairnId: string | null
  onSelect: (cairnId: string) => void
  onOpen?: (cairnId: string) => void
  onCollapse: () => void
  /** #251: same test as `ClusterMarker`'s own — the anchor badge still
      stands for the cluster while it's fanned open, so it keeps the same
      hover read/write the collapsed badge has. The fan's individual
      members do not — see `SingleCairnMarker` below, called with neither
      `hovered` nor `onHoverChange`. */
  hovered: boolean
  onHoverChange: (hovered: boolean) => void
}) {
  const provenance = clusterProvenance(cluster.members.map((member) => member.cairn))
  const ring = ringStyleForPhoto(provenance, false, hovered)
  const placements = useMemo(
    () => fanOutPositions(cluster, cluster.members.length, zoom, MARKER_FOOTPRINT_PX),
    [cluster, zoom],
  )

  return (
    <>
      <AdvancedMarker position={{ lat: cluster.lat, lng: cluster.lng }} onClick={onCollapse}>
        <div
          className={`cairn-layer__hit${hovered ? ' cairn-layer__hit--hovered' : ''}`}
          role="button"
          aria-label={clusterAriaLabel(cluster.members.length)}
          data-testid="cairn-cluster"
          data-count={cluster.members.length}
          data-source={provenance}
          data-expanded="true"
          onMouseEnter={() => onHoverChange(true)}
          onMouseLeave={() => onHoverChange(false)}
        >
          <div
            className="cairn-layer__cluster cairn-layer__cluster--anchor"
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
      {cluster.members.map((member, index) => (
        <SingleCairnMarker
          key={member.cairn.id}
          cairn={member.cairn}
          accessToken={accessToken}
          selected={selectedCairnId === member.cairn.id}
          onSelect={onSelect}
          onOpen={onOpen}
          draggable={false}
          fan={placements[index]}
        />
      ))}
    </>
  )
}
