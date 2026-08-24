import type { LatLng } from './geo'
import { frameGeometry } from './flyover'
import { sampleGroundAltitude } from './groundAltitude'
import { prefersReducedMotion } from './motion'
import { createGoogleElevationSampler, type ElevationSampler } from '../geo/elevation'

/** #303 — the one helper both the track reveal (#288) and the arrival fit
    (#292) call to fly the 3D camera onto a framed subject, so their "resolve
    the ground first" behaviour cannot drift apart into two copies again.
    `Map3D.tsx`'s own `arriveAt` established the pattern this follows: the
    look-at's altitude is the highest ground along the subject's own route,
    not sea level — see `sampleGroundAltitude`'s own comment for why sea
    level buries the camera everywhere but a coastline.

    Heading and tilt are read live off `map3d` and handed straight back — a
    reveal or a fit that also re-oriented the camera would undo the user's
    own orbit, #288's and #292's shared rule, unchanged here. Only the
    ground-unresolved fail-safe touches tilt, flattening it to 0 so the
    camera cannot tilt down over a look-at that might be buried — the same
    rule #306 gives `Fly over`, deliberately kept identical.

    Does nothing for a subject with no usable geometry, exactly as
    `frameGeometry` already signals with `null`.

    `shouldApply` is checked again after the ground request settles, not
    just before it starts — a caller whose subject changed while the
    request was in flight (a second track selected before the first
    reveal landed) returns `false` and the stale flight never fires; the
    camera does not queue two moves. */
export async function flyToFramedGround(
  map3d: google.maps.maps3d.Map3DElement,
  points: LatLng[],
  durationMillis: number,
  sampler: ElevationSampler | null = createGoogleElevationSampler(),
  shouldApply: () => boolean = () => true,
): Promise<void> {
  const framed = frameGeometry(points)
  if (!framed) return

  const groundAltitude = await sampleGroundAltitude(points, sampler)
  if (!shouldApply()) return

  const resolved = groundAltitude !== null
  const center = { lat: framed.center.lat, lng: framed.center.lng, altitude: resolved ? groundAltitude : 0 }
  const tilt = resolved ? (map3d.tilt ?? 0) : 0
  const heading = map3d.heading ?? 0

  if (prefersReducedMotion()) {
    map3d.center = center
    map3d.range = framed.range
    map3d.tilt = tilt
    map3d.heading = heading
    return
  }

  map3d.flyCameraTo({
    endCamera: { center, range: framed.range, heading, tilt },
    durationMillis,
  })
}
