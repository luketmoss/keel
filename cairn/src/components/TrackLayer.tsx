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

export function TrackLayer({ files }: TrackLayerProps) {
  const map = useMap()
  const previousFileCount = useRef(0)

  const renderedTracks = useMemo<RenderedTrack[]>(
    () =>
      files.flatMap((file) =>
        file.tracks.map((track, trackIndex) => ({
          key: `${file.id}-${trackIndex}`,
          color: trackColor(file.colorIndex),
          points: normalizeAntimeridian(dropInvalidLatitudes(track.points)),
        })),
      ),
    [files],
  )

  /* Re-fits on import (the file count growing), never on removal — a
     viewport lurching because something was deleted is worse than a
     slightly loose fit. #6 will extend this to re-fit on visibility
     changes too, once hiding a track is possible. */
  useEffect(() => {
    if (!map) return
    if (files.length <= previousFileCount.current) {
      previousFileCount.current = files.length
      return
    }
    previousFileCount.current = files.length

    const allPoints = renderedTracks.flatMap((track) => track.points)
    fitTracksToBounds(map, allPoints)
  }, [map, files.length, renderedTracks])

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
