import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap3D, useMapsLibrary } from '@vis.gl/react-google-maps'
import { MAP3D_ID } from '../map/track3D'
import { usePhotoImage } from '../photo/usePhotoImage'
import { createGoogleElevationSampler, type ElevationSampler } from '../geo/elevation'
import { useCairnOcclusion } from '../map/useCairnOcclusion'
import { forgetCairnOcclusion } from '../map/cairnOcclusion'
import { CairnMarker } from './CairnMarker'
import type { PositionedCairn } from './CairnLayer'
import './CairnLayer.css'

/** #251: the rest value of `hoveredCairnIds` — the same shared empty set
    `CairnLayer` itself rests on, so a caller that never wires hover passes
    nothing and this never allocates one per render. */
const EMPTY_HOVERED_CAIRN_IDS: ReadonlySet<string> = new Set()

interface Cairn3DLayerProps {
  cairns: PositionedCairn[]
  /** Drive access token for thumbnail fetches — `null` renders every
      thumbnail marker with its `--surface-lift` fallback fill, same as
      `CairnLayer`'s own contract. */
  accessToken: string | null
  selectedCairnId: string | null
  onSelectCairn: (cairnId: string) => void
  /** #250's pair, in order — optional for a caller (the world view) whose
      own "select" already is the navigation that opens the detail face. */
  onOpenCairn?: (cairnId: string) => void
  hoveredCairnIds?: ReadonlySet<string>
  onHoverCairn?: (cairnIds: ReadonlySet<string>) => void
  mapId?: string
}

/** One `MarkerElement` per cairn, `CLAMP_TO_GROUND` so a cairn on a valley
    floor is not left floating when the camera tilts — the 3D mirror of
    `CairnLayer`, at parity for whichever face mounts it (design note's
    "Which cairns draw, on which face").

    `google.maps.maps3d.MarkerElement` hosts arbitrary HTML — unlike
    `Marker3DElement` — so `CairnMarker` is rendered into each one through a
    React portal and is not modified at all (273-cairns-in-the-3d-map.md's
    "The marker transfers unchanged"). Markers are managed imperatively, the
    same shape `Track3DLayer` already takes for its polylines, and then
    portaled into on every render so hover/selection changes reach the
    portaled `CairnMarker` the ordinary React way.

    No clustering — `Map3DElement` has no zoom level and no documented way
    to project a coordinate to a pixel, so every cairn draws and overlap is
    accepted (design note's "Clustering does not come to 3D"). */
export function Cairn3DLayer({
  cairns,
  accessToken,
  selectedCairnId,
  onSelectCairn,
  onOpenCairn,
  hoveredCairnIds = EMPTY_HOVERED_CAIRN_IDS,
  onHoverCairn = () => {},
  mapId = MAP3D_ID,
}: Cairn3DLayerProps) {
  const map3d = useMap3D(mapId)
  const maps3d = useMapsLibrary('maps3d')
  const markersRef = useRef<Map<string, google.maps.maps3d.MarkerElement>>(new Map())
  const [, setRenderTick] = useState(0)

  /* #285 — built once, lazily, the same pattern `Map3D.tsx` uses for its own
     camera work: `google.maps.ElevationService` only exists after the Maps
     script has resolved, which is later than this component's first
     render. */
  const samplerRef = useRef<ElevationSampler | null | undefined>(undefined)
  const getElevationSampler = useCallback((): ElevationSampler | null => {
    if (samplerRef.current === undefined) samplerRef.current = createGoogleElevationSampler()
    return samplerRef.current
  }, [])

  const occludedCairnIds = useCairnOcclusion(map3d, cairns, selectedCairnId, getElevationSampler)

  useEffect(() => {
    if (!map3d || !maps3d) return
    const { MarkerElement, AltitudeMode } = maps3d
    const markers = markersRef.current
    const nextIds = new Set(cairns.map((cairn) => cairn.id))
    let changed = false

    for (const [id, marker] of markers) {
      if (nextIds.has(id)) continue
      marker.remove()
      markers.delete(id)
      changed = true
    }

    for (const cairn of cairns) {
      const position = { lat: cairn.latitude, lng: cairn.longitude, altitude: 0 }
      const existing = markers.get(cairn.id)
      if (existing) {
        const moved = existing.position?.lat !== cairn.latitude || existing.position?.lng !== cairn.longitude
        if (moved) forgetCairnOcclusion(cairn.id)
        existing.position = position
        existing.title = cairn.name
        continue
      }
      const marker = new MarkerElement({
        position,
        altitudeMode: AltitudeMode.CLAMP_TO_GROUND,
      })
      marker.title = cairn.name
      map3d.append(marker)
      markers.set(cairn.id, marker)
      changed = true
    }

    if (changed) setRenderTick((tick) => tick + 1)
  }, [map3d, maps3d, cairns])

  /* Cleared on unmount and whenever the map instance itself changes (never
     in practice — one 3D surface for the session), the same guard
     `Track3DLayer` keeps for its own lines. */
  useEffect(() => {
    const markers = markersRef.current
    return () => {
      for (const marker of markers.values()) marker.remove()
      markers.clear()
    }
  }, [map3d])

  /* Selection's stacking: `MarkerElement` has no `zIndex`, so the selected
     marker is removed and re-appended so it is last in the surface's own
     child order, putting it in front of anything it overlaps — design
     note's "Selection". One marker moves, not the whole set. */
  useEffect(() => {
    if (!map3d || !selectedCairnId) return
    const marker = markersRef.current.get(selectedCairnId)
    if (!marker) return
    marker.remove()
    map3d.append(marker)
  }, [map3d, selectedCairnId])

  if (!map3d || !maps3d) return null

  return (
    <>
      {[...markersRef.current.entries()].flatMap(([id, marker]) => {
        const cairn = cairns.find((candidate) => candidate.id === id)
        if (!cairn) return []
        return [
          createPortal(
            <Cairn3DMarkerContent
              key={id}
              cairn={cairn}
              accessToken={accessToken}
              selected={selectedCairnId === id}
              hovered={hoveredCairnIds.has(id)}
              occluded={occludedCairnIds.has(id)}
              onSelect={onSelectCairn}
              onOpen={onOpenCairn}
              onHoverChange={(hovered) =>
                onHoverCairn(hovered ? new Set([id]) : EMPTY_HOVERED_CAIRN_IDS)
              }
            />,
            marker,
            id,
          ),
        ]
      })}
    </>
  )
}

/** The portaled content for one marker. `pointerenter`/`pointerleave` and
    `click` are ordinary DOM events on `MarkerElement`'s hosted children — no
    `gmp-click` and no `Marker3DInteractiveElement` involved, per the design
    note's discovery. */
function Cairn3DMarkerContent({
  cairn,
  accessToken,
  selected,
  hovered,
  occluded,
  onSelect,
  onOpen,
  onHoverChange,
}: {
  cairn: PositionedCairn
  accessToken: string | null
  selected: boolean
  hovered: boolean
  occluded: boolean
  onSelect: (cairnId: string) => void
  onOpen?: (cairnId: string) => void
  onHoverChange: (hovered: boolean) => void
}) {
  const thumbnailUrl = usePhotoImage(accessToken, cairn.thumbnailDriveFileId ?? undefined).url

  function handleClick() {
    onSelect(cairn.id)
    onOpen?.(cairn.id)
  }

  return (
    <div
      className={`cairn-layer__hit${hovered ? ' cairn-layer__hit--hovered' : ''}${occluded ? ' cairn-layer__hit--occluded' : ''}`}
      role="button"
      aria-label={cairn.name}
      aria-pressed={selected}
      aria-hidden={occluded || undefined}
      data-testid="cairn-marker-3d"
      data-cairn-id={cairn.id}
      data-selected={selected}
      data-occluded={occluded}
      onClick={handleClick}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    >
      <CairnMarker
        icon={cairn.icon}
        thumbnailUrl={thumbnailUrl}
        hasImage={cairn.thumbnailDriveFileId !== null}
        source={cairn.source}
        selected={selected}
        hovered={hovered}
      />
    </div>
  )
}
