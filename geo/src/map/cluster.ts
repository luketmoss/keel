/* Groups markers whose on-screen circles would overlap into one cluster —
   cairn/docs/design/54-photo-markers.md's Clustering section: "Markers whose
   circles would overlap collapse into one cluster marker... computed from
   marker size and zoom rather than a hand-tuned zoom level per trip." Pure
   geometry, no React, no Google Maps runtime dependency (only the same
   Web Mercator tile math the JS API itself uses), so it's testable without a
   browser.

   Approach: project every marker to the pixel space Google's own tiles use
   at a given zoom (`256 * 2^zoom` world size — the standard slippy-map
   formula), then union markers whose projected pixel distance is less than
   the marker's own footprint. Projecting to pixels first, rather than
   converting the footprint to a lat/lng radius via a meters-per-pixel
   figure, sidesteps a second unit conversion — the projection itself already
   compresses longitude and stretches latitude by the right amount, so pixel
   distance directly answers "would these circles overlap on screen". */

export interface ClusterableMarker {
  lat: number
  lng: number
}

export interface MarkerCluster<T extends ClusterableMarker> {
  lat: number
  lng: number
  members: T[]
}

/** Exported for `fanOut.ts`, which places an expanded cluster's members a
    fixed number of *pixels* from their anchor and therefore needs the same
    projection this file already defines. Exporting it keeps one Web
    Mercator implementation rather than a second one that drifts. */
export function project(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const worldSize = 256 * 2 ** zoom
  const x = ((lng + 180) / 360) * worldSize
  // Clamp away from the poles — sin(lat) approaches ±1 there and the
  // Mercator y formula diverges to ±Infinity, which would make every polar
  // marker "infinitely far" from every other one instead of merely far.
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize
  return { x, y }
}

/** The inverse of `project`, for turning a pixel offset from an anchor back
    into a coordinate an `AdvancedMarker` can be placed at. `atan(sinh(…))`
    is the standard inverse of the Mercator latitude above; longitude is
    linear in x and inverts directly. */
export function unproject(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const worldSize = 256 * 2 ** zoom
  const lng = (x / worldSize) * 360 - 180
  const mercatorY = Math.PI * (1 - (2 * y) / worldSize)
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY))
  return { lat, lng }
}

/** Union-find over pairwise pixel distance, so clustering is transitive: if
    A overlaps B and B overlaps C, all three land in one cluster even if A
    and C alone would not overlap — the same "chain" behaviour a real
    on-screen circle-packing would produce. O(n²) pairwise comparisons, which
    is fine at the 200-photo scale acceptance criterion 11 names; this is
    also memoized by its caller (CairnLayer) on zoom, not recomputed per
    render. */
export function clusterMarkers<T extends ClusterableMarker>(
  markers: T[],
  zoom: number,
  footprintPx: number,
): MarkerCluster<T>[] {
  const n = markers.length
  const points = markers.map((marker) => project(marker.lat, marker.lng, zoom))
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }

  function union(a: number, b: number): void {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootA] = rootB
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = points[i].x - points[j].x
      const dy = points[i].y - points[j].y
      if (Math.sqrt(dx * dx + dy * dy) < footprintPx) union(i, j)
    }
  }

  const groups = new Map<number, T[]>()
  for (let i = 0; i < n; i += 1) {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(markers[i])
    else groups.set(root, [markers[i]])
  }

  return Array.from(groups.values()).map((members) => ({
    lat: members.reduce((sum, member) => sum + member.lat, 0) / members.length,
    lng: members.reduce((sum, member) => sum + member.lng, 0) / members.length,
    members,
  }))
}
