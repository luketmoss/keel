import type { ElevationSampler } from '../geo/elevation'

/** #285's "one call per cairn per novel camera position" — the sampling
    budget one settle can spend, so a face with more cairns than this
    degrades to partly-correct occlusion rather than to a burst of
    requests. Untested cairns fall to the rule's default: drawn. */
export const OCCLUSION_MAX_CAIRNS = 64

/** How far above the camera-to-cairn line of sight a terrain sample must
    rise before the cairn is called occluded. Terrain samples are coarser
    than the rendered mesh, and a ray that grazes a ridge it is actually
    clearing would otherwise flicker as the camera drifts — this is a
    tolerance for that error, not a tuning knob. */
export const OCCLUSION_CLEARANCE_METERS = 10

/** Matches `groundAltitude.ts`'s own `DEFAULT_TIMEOUT_MS` — whatever has not
    answered by then draws, per the rule's "unless". */
export const OCCLUSION_TIMEOUT_MS = 2000

/** `sampleAlongPath`'s own sample count — `groundAltitude.ts`'s
    `MAX_SAMPLES`, reused for the same reason: enough to catch a ridge
    without turning one camera settle into a large request. */
const RAY_SAMPLES = 16

export interface CameraPosition {
  lat: number
  lng: number
  altitude: number
}

export interface GroundPosition {
  lat: number
  lng: number
}

/* Verdicts keyed by the quantised camera position plus the cairn id, so a
   camera nudged by a few metres or a place revisited after 3D was flipped
   off and on costs nothing — the same shape `groundAltitude.ts`'s
   module-level cache already takes. */
const cache = new Map<string, boolean>()

function quantizeCamera(camera: CameraPosition): string {
  return `${camera.lat.toFixed(4)},${camera.lng.toFixed(4)},${Math.round(camera.altitude / 10) * 10}`
}

function cacheKey(camera: CameraPosition, cairnId: string): string {
  return `${quantizeCamera(camera)}:${cairnId}`
}

/** Test seam — module-level so it survives remounts, which is the point of
    it, per `groundAltitude.ts`'s own `clearGroundAltitudeCache`. */
export function clearCairnOcclusionCache(): void {
  cache.clear()
}

/** #285's "a cairn moved while 3D is on" edge case — its cached verdicts are
    now about a coordinate it no longer occupies. Called wherever a cairn's
    position changes; until the next settle it draws, which is the rule's
    safe default anyway. */
export function forgetCairnOcclusion(cairnId: string): void {
  const suffix = `:${cairnId}`
  for (const key of cache.keys()) {
    if (key.endsWith(suffix)) cache.delete(key)
  }
}

/* `getElevationAlongPath` needs a path, not a point — a camera directly
   over a cairn is widened into a very short one rather than special-cased
   downstream, the same move `groundAltitude.ts` makes for a degenerate
   subject. */
function pathBetween(camera: GroundPosition, cairn: GroundPosition): GroundPosition[] {
  if (camera.lat === cairn.lat && camera.lng === cairn.lng) {
    return [camera, { lat: cairn.lat + 0.0001, lng: cairn.lng + 0.0001 }]
  }
  return [camera, cairn]
}

/** Whether `cairn`'s line of sight from `camera` is blocked by terrain —
    #285's rule. Resolves `false` (drawn) whenever the answer is unknown:
    no sampler, a failed call, a timeout, or too few samples to judge. A
    cairn is never hidden because a network call did not come back.

    Verdicts are cached by the quantised camera position and the cairn id;
    call this only for a camera that has come to rest. */
export async function isCairnOccluded(
  camera: CameraPosition,
  cairnId: string,
  cairnPosition: GroundPosition,
  sampler: ElevationSampler | null,
  timeoutMs: number = OCCLUSION_TIMEOUT_MS,
): Promise<boolean> {
  if (!sampler) return false

  const key = cacheKey(camera, cairnId)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const path = pathBetween(camera, cairnPosition)
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const result = await Promise.race([sampler.sampleAlongPath(path, RAY_SAMPLES), timeout])

  if (!result || !result.ok || result.samples.length < 3) return false

  const samples = result.samples
  const n = samples.length - 1
  const cairnAltitude = samples[n].elevationMeters

  /* The first and last samples — the ground under the camera and the
     ground the cairn stands on — are, trivially, at the line of sight at
     their own ends, so only the interior is worth testing. */
  let occluded = false
  for (let i = 1; i < n; i++) {
    const lineOfSight = camera.altitude + (cairnAltitude - camera.altitude) * (i / n)
    if (samples[i].elevationMeters > lineOfSight + OCCLUSION_CLEARANCE_METERS) {
      occluded = true
      break
    }
  }

  cache.set(key, occluded)
  return occluded
}
