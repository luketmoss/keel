import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { ImportedFile } from '../import/types'
import { trackColor } from '../map/palette'
import { dropInvalidLatitudes, normalizeAntimeridian, type LatLng } from '../map/geo'
import { fitTracksToBounds } from '../map/fitBounds'
import { prefersReducedMotion } from '../map/motion'

/* --motion-slow from index.css. Google Maps' Polyline animates by having its
   `path` prop grow frame to frame — there is no dash-offset to transition on
   a rendered stroke, so the doc's "draw-on" is transcribed here as a point
   count rather than referenced live. */
const DRAW_ON_DURATION_MS = 280

interface TrackLayerProps {
  files: ImportedFile[]
  /** The file whose row is currently hovered in the sidebar (#49) — draws an
      extra, wider, low-opacity polyline beneath that file's own tracks. Not
      a persisted selection; nothing to track once the pointer moves on. */
  hoveredFileId?: string | null
}

interface RenderedTrack {
  key: string
  fileId: string
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

export function TrackLayer({ files, hoveredFileId }: TrackLayerProps) {
  const map = useMap()
  const previousFileCount = useRef(0)
  const previousVisibleKey = useRef('')
  /* Keyed by track key, not by file id or array position — a track that has
     already drawn itself in stays drawn in even if its file is hidden and
     shown again, since hiding filters it out of `renderedTracks` entirely
     rather than merely styling it. Lives on the ref, not in `Track`'s own
     state, precisely because remounting is what would otherwise reset it. */
  const animatedKeys = useRef<Set<string>>(new Set())

  const visibleFiles = useMemo(() => files.filter((file) => file.visible), [files])

  /* Hidden tracks are excluded here, at the source — they never reach either
     the map or the bounds calculation below. */
  const renderedTracks = useMemo<RenderedTrack[]>(
    () =>
      visibleFiles.flatMap((file) =>
        file.tracks.map((track, trackIndex) => ({
          key: `${file.id}-${trackIndex}`,
          fileId: file.id,
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
        <Track
          key={track.key}
          trackKey={track.key}
          points={track.points}
          color={track.color}
          glow={hoveredFileId != null && hoveredFileId === track.fileId}
          alreadyAnimated={animatedKeys.current.has(track.key)}
          onAnimated={() => animatedKeys.current.add(track.key)}
        />
      ))}
    </>
  )
}

/** Reveals `points` a prefix at a time over `DRAW_ON_DURATION_MS`, once per
    `trackKey` — every render after the first full reveal returns the whole
    array immediately. `prefersReducedMotion` collapses straight to the full
    array on the very first render, so a reduced-motion session never sees a
    partial path at all. */
function useRevealedPoints(trackKey: string, points: LatLng[], alreadyAnimated: boolean, onAnimated: () => void) {
  const [revealed, setRevealed] = useState<LatLng[]>(() =>
    alreadyAnimated || prefersReducedMotion() ? points : points.slice(0, 1),
  )

  useEffect(() => {
    if (alreadyAnimated) {
      setRevealed(points)
      return
    }
    if (prefersReducedMotion()) {
      setRevealed(points)
      onAnimated()
      return
    }

    let frame: number
    const start = performance.now()

    function step(now: number) {
      const elapsed = Math.min(1, (now - start) / DRAW_ON_DURATION_MS)
      const count = Math.max(1, Math.round(elapsed * points.length))
      setRevealed(points.slice(0, count))
      if (elapsed < 1) {
        frame = requestAnimationFrame(step)
      } else {
        onAnimated()
      }
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
    // trackKey identifies "which track this is" for the animation's own
    // lifetime — points/alreadyAnimated/onAnimated intentionally excluded so
    // a mid-animation re-render (e.g. another file importing alongside this
    // one) doesn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey])

  return revealed
}

function Track({
  trackKey,
  points,
  color,
  glow,
  alreadyAnimated,
  onAnimated,
}: {
  trackKey: string
  points: LatLng[]
  color: string
  glow: boolean
  alreadyAnimated: boolean
  onAnimated: () => void
}) {
  const revealed = useRevealedPoints(trackKey, points, alreadyAnimated, onAnimated)

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
      {/* Wider, low-opacity, beneath everything else — an approximation of
          the design doc's CSS glow, since Polyline exposes no filter of its
          own to draw one for real. Only while this track's file is
          hovered. */}
      {glow && (
        <Polyline path={points} strokeColor={color} strokeOpacity={0.35} strokeWeight={9} clickable={false} />
      )}
      <Polyline path={revealed} strokeColor="#00000059" strokeWeight={5} clickable={false} />
      <Polyline path={revealed} strokeColor={color} strokeWeight={3} clickable={false} />
    </>
  )
}
