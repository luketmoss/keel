import type { FeatureCollection, LineString } from 'geojson'
import type { LatLng } from '../map/geo'

/** Every `LineString` in a precomputed `overview.geojson`, as plain
    coordinate arrays — the same shape `LooseLayer`'s own route reader
    already extracts, pulled out here so #271's 3D world view can read it
    too without a second, drifting copy. `null` (no sidecar yet, or an
    unreadable one) resolves to no lines, same as everywhere else that reads
    an overview. */
export function linesFromOverview(overview: FeatureCollection<LineString> | null): LatLng[][] {
  if (!overview) return []
  return overview.features
    .filter((feature) => feature.geometry?.type === 'LineString')
    .map((feature) => feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })))
}
