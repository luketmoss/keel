import { useEffect, useMemo, useState } from 'react'
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps'
import type { PositionedPhoto } from '../photo/positionPhotos'
import { clusterMarkers, type MarkerCluster } from '../map/cluster'
import { zoomToFitCluster } from '../map/fitBounds'
import { clusterAriaLabel, clusterProvenance, markerAriaLabel, ringStyleForPhoto } from '../photo/provenance'
import { usePhotoThumbnail } from '../photo/usePhotoThumbnail'
import './PhotoLayer.css'

/* --marker-size from index.css, transcribed — AdvancedMarker content takes
   real pixels for clustering's projection math, not a CSS var (same
   rationale WorldMap's COMPLETED_COLOR gives for its own transcribed
   values). Keep this in step with index.css's --marker-size by hand. */
const MARKER_FOOTPRINT_PX = 28

interface PhotoLayerProps {
  photos: PositionedPhoto[]
  /** Drive access token for thumbnail fetches through #53's cache — `null`
      renders every marker with its `--surface-lift` fallback fill, same as
      a thumbnail that hasn't arrived yet. */
  accessToken: string | null
  selectedPhotoId: string | null
  /** Out of scope for #54 to consume beyond exposing it: a later issue
      (#55) owns the list/viewer this drives. */
  onSelectPhoto: (photoId: string) => void
}

/** Renders positioned photos as clustered `AdvancedMarker`s above the
    track polylines drawn by `TrackLayer` — mounted as a sibling of it in
    `MapView`, later in JSX order, which is what keeps it on top (design
    doc's Layering section) since `AdvancedMarker`'s pane
    (`overlayMouseTarget`) already sits above `Polyline`'s
    (`overlayLayer`) regardless of mount order; sibling-after just keeps
    DOM order legible for anyone reading the tree. */
export function PhotoLayer({ photos, accessToken, selectedPhotoId, onSelectPhoto }: PhotoLayerProps) {
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

  // `clusterMarkers` clusters on a `{lat, lng}` shape; `PositionedPhoto`
  // carries `latitude`/`longitude` (matching #52's `PhotoPosition`), so each
  // photo is wrapped with the coordinate pair clustering needs while keeping
  // the original record reachable as `.photo`.
  const clusterable = useMemo(
    () => photos.map((photo) => ({ lat: photo.latitude, lng: photo.longitude, photo })),
    [photos],
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
          const photo = cluster.members[0].photo
          return (
            <PhotoMarker
              key={photo.id}
              photo={photo}
              accessToken={accessToken}
              selected={selectedPhotoId === photo.id}
              onSelect={onSelectPhoto}
            />
          )
        }
        const key = cluster.members
          .map((member) => member.photo.id)
          .sort()
          .join(',')
        return <ClusterMarker key={key} cluster={cluster} map={map} />
      })}
    </>
  )
}

function PhotoMarker({
  photo,
  accessToken,
  selected,
  onSelect,
}: {
  photo: PositionedPhoto
  accessToken: string | null
  selected: boolean
  onSelect: (photoId: string) => void
}) {
  const thumbnailUrl = usePhotoThumbnail(accessToken, photo.thumbnailDriveFileId)
  const ring = ringStyleForPhoto(photo.source, selected)
  const label = markerAriaLabel(photo.source, undefined)

  return (
    <AdvancedMarker
      position={{ lat: photo.latitude, lng: photo.longitude }}
      zIndex={selected ? 1 : 0}
      onClick={() => onSelect(photo.id)}
    >
      <div
        className="photo-marker-hit"
        role="button"
        aria-label={label}
        aria-pressed={selected}
        data-testid="photo-marker"
        data-photo-id={photo.id}
        data-source={photo.source}
        data-selected={selected}
      >
        <div
          className="photo-marker"
          style={{
            borderStyle: ring.borderStyle,
            borderWidth: `var(${ring.widthVar})`,
            borderColor: `var(${ring.colorVar})`,
            filter: ring.glow ? 'drop-shadow(0 0 7px var(--accent))' : undefined,
          }}
        >
          {thumbnailUrl && <img src={thumbnailUrl} alt="" />}
        </div>
      </div>
    </AdvancedMarker>
  )
}

function ClusterMarker({
  cluster,
  map,
}: {
  cluster: MarkerCluster<{ lat: number; lng: number; photo: PositionedPhoto }>
  map: google.maps.Map
}) {
  const provenance = clusterProvenance(cluster.members.map((member) => member.photo))
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
        className="photo-marker-hit"
        role="button"
        aria-label={label}
        data-testid="photo-cluster"
        data-count={cluster.members.length}
        data-source={provenance}
      >
        <div
          className="photo-marker photo-marker--cluster"
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
