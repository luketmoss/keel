import type { LatLng } from './geo'
import type { ElevationSampler } from '../geo/elevation'

/** How long to wait for the Elevation API before giving up and framing at
    sea level anyway. A flyover that arrives a beat late is recoverable; one
    that never arrives is not. */
const DEFAULT_TIMEOUT_MS = 2000

/** Enough samples to catch a ridge the route climbs over without turning
    one camera move into a large request. */
const MAX_SAMPLES = 16

/* Resolved altitudes, keyed by the path they were sampled for. A flyover
   re-pressed on the same subject, or 3D flipped off and on over the same
   place, costs one network call rather than one per press. */
const cache = new Map<string, number>()

function cacheKey(path: LatLng[]): string {
  const first = path[0]
  const last = path[path.length - 1]
  return `${first.lat.toFixed(4)},${first.lng.toFixed(4)}:${last.lat.toFixed(4)},${last.lng.toFixed(4)}:${path.length}`
}

/** The **highest** ground along `path`, in metres above sea level — or `0`
    when there is nothing to sample, no sampler, or the call fails.

    Why this exists at all: `Map3DElement`'s camera is positioned as a
    `range` and a `tilt` **from a look-at point**, and that point's altitude
    is absolute. Pinning it at sea level (which is what an omitted altitude
    means) puts the look-at underground everywhere that isn't a coastline,
    and the camera — which sits only `range · cos(tilt)` above it — lands at
    or below the terrain with it. Google then collapses `range` to keep the
    camera out of the ground, and the result is a "3D" view that is either
    flat or inside a mountain. Measured directly against the live API: a
    sea-level look-at over 678 m of terrain returned `range: 0`.

    The **maximum** rather than the mean or the midpoint: the camera has to
    clear the highest ground in view, not the average of it. A route up a
    valley is framed from above the ridge it ends on, not from inside it. */
export async function sampleGroundAltitude(
  path: LatLng[],
  sampler: ElevationSampler | null,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number> {
  if (!sampler || path.length === 0) return 0

  const key = cacheKey(path)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  /* `getElevationAlongPath` needs a path, not a point — a single-point
     subject (one cairn, a degenerate track) is widened into a very short
     one rather than special-cased downstream. */
  const sampledPath = path.length > 1 ? path : [path[0], { lat: path[0].lat + 0.001, lng: path[0].lng + 0.001 }]
  const samples = Math.min(MAX_SAMPLES, Math.max(2, sampledPath.length))

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const result = await Promise.race([sampler.sampleAlongPath(sampledPath, samples), timeout])

  if (!result || !result.ok || result.samples.length === 0) return 0

  const highest = result.samples.reduce((max, sample) => Math.max(max, sample.elevationMeters), 0)
  cache.set(key, highest)
  return highest
}

/** Test seam — the cache is module-level so it survives remounts, which is
    the point of it. */
export function clearGroundAltitudeCache(): void {
  cache.clear()
}
