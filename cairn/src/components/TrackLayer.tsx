import { useEffect, useMemo, useRef, useState } from 'react'
import { Marker, Polyline, useMap } from '@vis.gl/react-google-maps'
import type { ImportedFile } from '../import/types'
import { trackColor } from '../map/palette'
import { dropInvalidLatitudes, normalizeAntimeridian, type LatLng } from '../map/geo'
import { fitTracksToBounds } from '../map/fitBounds'
import { columnInset, toPadding } from '../map/reveal'
import { useIsPhone } from '../map/useIsPhone'
import { prefersReducedMotion } from '../map/motion'

/* --motion-slow from index.css. Google Maps' Polyline animates by having its
   `path` prop grow frame to frame — there is no dash-offset to transition on
   a rendered stroke, so the doc's "draw-on" is transcribed here as a point
   count rather than referenced live. */
const DRAW_ON_DURATION_MS = 280

/* #269 — the stacking order. A `zIndex` handed to the Maps API never reaches
   a stylesheet, so these are module constants beside `DRAW_ON_DURATION_MS`
   rather than CSS custom properties (`MARKER_FOOTPRINT_PX` in
   `CairnLayer.tsx` is the other precedent). A track's own zIndex is
   `band + index * 10 + layer`: the band keeps a hovered or selected track's
   whole stack — halo, casing, stroke — above every resting track regardless
   of import order, the index term preserves today's deterministic order
   among tracks in the same band, and the layer term keeps the halo beneath
   the casing beneath the stroke. 1,000 tracks fit under one band before two
   could collide. */
const TRACK_Z_REST = 0
const TRACK_Z_HOVERED = 10000
const TRACK_Z_SELECTED = 20000

const TRACK_WEIGHT_REST: readonly [casing: number, stroke: number] = [5, 3]
const TRACK_WEIGHT_HOVERED: readonly [casing: number, stroke: number] = [7, 4]
const TRACK_WEIGHT_SELECTED: readonly [casing: number, stroke: number] = [9, 5]
const TRACK_HALO_WEIGHT = 17
const TRACK_HALO_OPACITY = 0.3

/** #270 — the invisible click target on a route. Half of `--hit-target`
    (40px), which puts 10px of tolerance either side of a 3px resting
    stroke; also what makes a route tappable at all on touch. Drawn topmost
    in every track's own band, above its halo/casing/stroke, so it wins a
    click before the emphasis layers underneath it ever see one. */
const TRACK_HIT_WEIGHT = 20

type TrackBand = 'rest' | 'hovered' | 'selected'

const BAND_Z: Record<TrackBand, number> = {
  rest: TRACK_Z_REST,
  hovered: TRACK_Z_HOVERED,
  selected: TRACK_Z_SELECTED,
}
const BAND_WEIGHTS: Record<TrackBand, readonly [casing: number, stroke: number]> = {
  rest: TRACK_WEIGHT_REST,
  hovered: TRACK_WEIGHT_HOVERED,
  selected: TRACK_WEIGHT_SELECTED,
}

interface TrackLayerProps {
  files: ImportedFile[]
  /** The file whose row is currently hovered in the sidebar (#49) — its
      tracks draw in the hovered band, above every resting track. */
  hoveredFileId?: string | null
  /** #269 — the file whose row is currently selected. Its tracks draw in
      the selected band, above a hovered file's, and carry the halo the
      language licenses for "explicit selection". A multi-track file's
      tracks all take this together, since the id names the row, not one
      track within it. */
  selectedFileId?: string | null
  /** #270 — writes `hoveredFileId` back up, the map-to-row direction #251
      named and left open for tracks. Fired by the invisible hit line's own
      `mouseover`/`mouseout`; never moves the camera and never scrolls the
      list, matching hover's existing rules exactly. */
  onHoverFile?: (id: string | null) => void
  /** #270 — a route's hit line was clicked. Fired with the file's id;
      `TripDetail` selects it and toggles its row's expansion, the same
      pair its own row header click already performs, so a route click and
      a row click can never drift on what they do. */
  onSelectRoute?: (id: string) => void
  /** #270 — false while a decision owns the map (an import draft, the
      placement queue, the cairn-create gesture): the hit lines stop being
      clickable so an invisible 20px-wide target over every route doesn't
      eat the click the gesture exists to receive. Defaults to `true` so a
      caller that hasn't been updated for this issue keeps its routes
      clickable, unchanged. */
  hitLinesEnabled?: boolean
}

interface RenderedTrack {
  key: string
  fileId: string
  color: string
  points: LatLng[]
  /** Position in the trip's own track order, flattened across files —
      the term the stacking order multiplies by 10 to keep resting tracks
      in today's order within their band. Assigned from the list as it
      stands, so a later arrival re-bands nothing already on the map. */
  index: number
}

/** The visible subset's own ids, sorted and joined — #292's 3D framing
    effect reuses this alongside `files.length` so `TripDetail`'s content
    signal cannot drift from the 2D fit's: a file count that grows is an
    import, an unchanged count whose key differs is a toggle. Exported for
    that reuse rather than a second computation. */
export function visibleFilesKey(files: ImportedFile[]): string {
  return files
    .filter((file) => file.visible)
    .map((file) => file.id)
    .sort()
    .join(',')
}

/** The geometry a set of files draws — visible tracks only, each carrying
    its own file's colour. Exported so #271's `Track3DLayer` draws exactly
    what this layer draws for the same `files`, rather than a second
    computation that could drift from it. */
export function computeRenderedTracks(files: ImportedFile[]): RenderedTrack[] {
  return files
    .filter((file) => file.visible)
    .flatMap((file) =>
      file.tracks.map((track, trackIndex) => ({
        key: `${file.id}-${trackIndex}`,
        fileId: file.id,
        color: trackColor(file.colorIndex),
        points: normalizeAntimeridian(dropInvalidLatitudes(track.points)),
      })),
    )
    .map((track, index) => ({ ...track, index }))
}

export function TrackLayer({
  files,
  hoveredFileId,
  selectedFileId,
  onHoverFile,
  onSelectRoute,
  hitLinesEnabled = true,
}: TrackLayerProps) {
  const map = useMap()
  const isPhone = useIsPhone()
  const previousFileCount = useRef(0)
  const previousVisibleKey = useRef('')
  /* Keyed by track key, not by file id or array position — a track that has
     already drawn itself in stays drawn in even if its file is hidden and
     shown again, since hiding filters it out of `renderedTracks` entirely
     rather than merely styling it. Lives on the ref, not in `Track`'s own
     state, precisely because remounting is what would otherwise reset it. */
  const animatedKeys = useRef<Set<string>>(new Set())

  /* Hidden tracks are excluded here, at the source — they never reach either
     the map or the bounds calculation below. */
  const renderedTracks = useMemo<RenderedTrack[]>(() => computeRenderedTracks(files), [files])

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
    fitTracksToBounds(map, allPoints, toPadding(columnInset(isPhone)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, files, renderedTracks])

  return (
    <>
      {renderedTracks.map((track) => {
        const band: TrackBand =
          selectedFileId != null && selectedFileId === track.fileId
            ? 'selected'
            : hoveredFileId != null && hoveredFileId === track.fileId
              ? 'hovered'
              : 'rest'
        return (
          <Track
            key={track.key}
            trackKey={track.key}
            points={track.points}
            color={track.color}
            band={band}
            index={track.index}
            alreadyAnimated={animatedKeys.current.has(track.key)}
            onAnimated={() => animatedKeys.current.add(track.key)}
            hitClickable={hitLinesEnabled}
            onHitOver={() => onHoverFile?.(track.fileId)}
            onHitOut={() => onHoverFile?.(null)}
            onHitClick={() => onSelectRoute?.(track.fileId)}
          />
        )
      })}
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
  band,
  index,
  alreadyAnimated,
  onAnimated,
  hitClickable,
  onHitOver,
  onHitOut,
  onHitClick,
}: {
  trackKey: string
  points: LatLng[]
  color: string
  band: TrackBand
  index: number
  alreadyAnimated: boolean
  onAnimated: () => void
  /** #270 — false while a decision owns the map; the hit line still draws
      (so hover would be free) but stops accepting clicks or reporting
      hover, matching "reveal is suspended" for the map's other decisions. */
  hitClickable: boolean
  onHitOver: () => void
  onHitOut: () => void
  onHitClick: () => void
}) {
  const revealed = useRevealedPoints(trackKey, points, alreadyAnimated, onAnimated)
  const zBase = BAND_Z[band] + index * 10

  if (points.length === 0) return null

  if (points.length === 1) {
    return (
      <Marker
        position={points[0]}
        clickable={false}
        zIndex={zBase}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          // #269 — hovered and selected scale a single-point track the same
          // way a hovered/selected marker elsewhere does; there's no line
          // to wrap a halo around, so that's the whole treatment.
          scale: band === 'rest' ? 5 : 7,
          fillColor: color,
          fillOpacity: 1,
          strokeWeight: 0,
        }}
      />
    )
  }

  const [casingWeight, strokeWeight] = BAND_WEIGHTS[band]

  return (
    <>
      {/* #269 — the language's licensed glow, transcribed as a wider,
          low-opacity stroke beneath the casing (`Polyline` exposes no
          filter of its own). Moved from hover to selection: hover keeps a
          real but weaker treatment (thicker casing and stroke, the raised
          band) so the two read apart and hover cannot impersonate
          selection. Drawn from `revealed` so a track selected mid-draw-on
          takes the treatment as it draws, same as the casing and stroke. */}
      {band === 'selected' && (
        <Polyline
          path={revealed}
          strokeColor={color}
          strokeOpacity={TRACK_HALO_OPACITY}
          strokeWeight={TRACK_HALO_WEIGHT}
          clickable={false}
          zIndex={zBase}
        />
      )}
      <Polyline
        path={revealed}
        strokeColor="#00000059"
        strokeWeight={casingWeight}
        clickable={false}
        zIndex={zBase + 1}
      />
      <Polyline path={revealed} strokeColor={color} strokeWeight={strokeWeight} clickable={false} zIndex={zBase + 2} />
      {/* #270 — the invisible click target, topmost in this track's own
          band so the emphasised track wins a click where routes overlap,
          the same ordering #269 draws by. `strokeOpacity: 0` changes
          nothing about how the map looks. */}
      <Polyline
        path={revealed}
        strokeOpacity={0}
        strokeWeight={TRACK_HIT_WEIGHT}
        clickable={hitClickable}
        zIndex={zBase + 3}
        onClick={onHitClick}
        onMouseOver={onHitOver}
        onMouseOut={onHitOut}
      />
    </>
  )
}
