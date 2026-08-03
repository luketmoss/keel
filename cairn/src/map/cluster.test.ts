import { describe, expect, it } from 'vitest'
import { clusterMarkers } from './cluster'

interface TestMarker {
  id: string
  lat: number
  lng: number
}

function marker(id: string, lat: number, lng: number): TestMarker {
  return { id, lat, lng }
}

describe('clusterMarkers', () => {
  it('keeps markers far apart as separate single-member clusters', () => {
    const clusters = clusterMarkers([marker('a', 0, 0), marker('b', 10, 10)], 10, 28)

    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.members.map((m) => m.id)).sort()).toEqual([['a'], ['b']])
  })

  it('groups markers closer together than the footprint into one cluster', () => {
    // At zoom 15 near the equator, a tenth of a millidegree is a couple of
    // pixels — well inside a 28px footprint.
    const clusters = clusterMarkers(
      [marker('a', 0, 0), marker('b', 0.0001, 0.0001)],
      15,
      28,
    )

    expect(clusters).toHaveLength(1)
    expect(clusters[0].members.map((m) => m.id).sort()).toEqual(['a', 'b'])
  })

  it('a cluster of two reports a centroid position', () => {
    const clusters = clusterMarkers([marker('a', 10, 10), marker('b', 10, 10)], 15, 28)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].lat).toBeCloseTo(10)
    expect(clusters[0].lng).toBeCloseTo(10)
  })

  it('breaks a cluster apart as zoom increases (acceptance criterion 5)', () => {
    const markers = [marker('a', 45, 10), marker('b', 45, 10.0005)]

    const zoomedOut = clusterMarkers(markers, 10, 28)
    expect(zoomedOut).toHaveLength(1)

    const zoomedIn = clusterMarkers(markers, 20, 28)
    expect(zoomedIn).toHaveLength(2)
  })

  it('clusters transitively: a chain of overlapping markers forms one group', () => {
    // a-b overlap, b-c overlap, a-c do not directly, at zoom 18.
    const markers = [marker('a', 0, 0), marker('b', 0, 0.00005), marker('c', 0, 0.0001)]

    const clusters = clusterMarkers(markers, 18, 28)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].members.map((m) => m.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('two photos at identical coordinates cluster at every zoom (edge case)', () => {
    const markers = [marker('a', 12, 34), marker('b', 12, 34)]

    for (const zoom of [1, 10, 20]) {
      expect(clusterMarkers(markers, zoom, 28)).toHaveLength(1)
    }
  })

  it('returns nothing for an empty marker list', () => {
    expect(clusterMarkers([], 10, 28)).toEqual([])
  })

  it('handles 200 markers without pathological slowness', () => {
    const markers = Array.from({ length: 200 }, (_, i) =>
      marker(`p${i}`, 45 + (i % 20) * 0.001, 10 + Math.floor(i / 20) * 0.001),
    )

    const start = performance.now()
    const clusters = clusterMarkers(markers, 14, 28)
    const elapsed = performance.now() - start

    const totalMembers = clusters.reduce((sum, c) => sum + c.members.length, 0)
    expect(totalMembers).toBe(200)
    expect(elapsed).toBeLessThan(500)
  })
})
