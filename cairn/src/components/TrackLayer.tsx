import { useEffect, useMemo, useRef } from 'react'
import { Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { ImportedFile } from '../import/types'
import { trackColor } from '../map/palette'
import { dropInvalidLatitudes, normalizeAntimeridian, type LatLng } from '../map/geo'
import { fitTracksToBounds } from '../map/fitBounds'

interface TrackLayerProps {
  files: ImportedFile[]
}

interface RenderedTrack {
  key: string
  color: string
  points: LatLng[]
}

function visibleFilesKey(files: ImportedFile[]): string {
  return files
    .filter((file) => file.visible)
    .map((file) => file.id)
    .sort()
    .join(',')
}

export function TrackLayer({ files }: TrackLayerProps) {
  const map = useMap()
  const previousFileCount = useRef(0)
  const previousVisibleKey = useRef('')

  const visibleFiles = useMemo(() => files.filter((file) => file.visible), [files])

  /* Hidden tracks are excluded here, at the source — they never reach either
     the map or the bounds calculation below. */
  const renderedTracks = useMemo<RenderedTrack[]>(
    () =>
      visibleFiles.flatMap((file) =>
        file.tracks.map((track, trackIndex) => ({
          key: `${file.id}-${trackIndex}`,
          color: trackColor(file.colorIndex),
          points: normalizeAntimeridian(dropInvalidLatitudes(track.points)),
        })),
      ),
    [visibleFiles],
  )

  /* Re-fits on import (the file count growing) and on a visibility toggle,
     never on removal — a viewport lurching because something was deleted is
     worse than a slightly loose fit. */
  useEffect(() => {
    if (!map) return

    const currentVisibleKey = visibleFilesKey(files)
    const imported = files.length > previousFileCount.current
    const toggled =
      files.length === previousFileCount.current && currentVisibleKey !== previousVisibleKey.current

    previousFileCount.current = files.length
    previousVisibleKey.current = currentVisibleKey

    if (!imported && !toggled) return

    const allPoints = renderedTracks.flatMap((track) => track.points)
    fitTracksToBounds(map, allPoints)
  }, [map, files, renderedTracks])

  return (
    <>
      {renderedTracks.map((track) => (
        <Track key={track.key} points={track.points} color={track.color} />
      ))}
    </>
  )
}

function Track({ points, color }: { points: LatLng[]; color: string }) {
  if (points.length === 0) return null

  if (points.length === 1) {
    return (
      <Marker
        position={points[0]}
        clickable={false}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: color,
          fillOpacity: 1,
          strokeWeight: 0,
        }}
      />
    )
  }

  return (
    <>
      <Polyline path={points} strokeColor="#00000059" strokeWeight={5} clickable={false} />
      <Polyline path={points} strokeColor={color} strokeWeight={3} clickable={false} />
    </>
  )
}
