import { gpx, kml } from '@tmcw/togeojson'
import JSZip from 'jszip'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export interface TrackPoint {
  lat: number
  lon: number
  elevation?: number
  time?: string
}

export interface Track {
  name: string
  points: TrackPoint[]
  /** #224 — a stable id for this track within its trip (the owning file's
      `driveFileId`, or `driveFileId#index` for a multi-track file), set by
      `useTripImport` once a track is attached to a trip. What the sampled-
      elevation cache is keyed by. `undefined` for a loose track or a track
      not yet attached to a trip — sampling is trip-scoped only (design
      note's Out of scope), and a keyless track is simply never looked up. */
  key?: string
}

export interface ParseSuccess {
  ok: true
  tracks: Track[]
}

export interface ParseFailure {
  ok: false
  error: string
}

export type ParseResult = ParseSuccess | ParseFailure

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((byte, i) => bytes[i] === byte)
}

/* FileReader rather than File#arrayBuffer(): the latter is unimplemented by
   jsdom, which the test suite runs under. */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

async function extractKmlText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  if (!looksLikeZip(bytes)) {
    return new TextDecoder('utf-8').decode(bytes)
  }

  const zip = await JSZip.loadAsync(buffer)
  const kmlEntry = Object.values(zip.files).find(
    (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml'),
  )
  if (!kmlEntry) {
    throw new Error('KMZ archive contains no KML file')
  }
  return kmlEntry.async('text')
}

function parseXmlDocument(
  text: string,
  rootTag: string,
  wrongTypeError: string,
): Document | ParseFailure {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, error: 'File is not well-formed XML' }
  }
  if (doc.documentElement?.tagName !== rootTag) {
    return { ok: false, error: wrongTypeError }
  }
  return doc
}

/* togeojson collapses a two-point LineString/gx:Track into a Point geometry,
   losing the line — only LineString and MultiLineString survive here, which
   is a documented limitation rather than a bug in this module.

   A GPX with multiple <trkseg> comes through as MultiLineString — each
   segment its own line — and #223 treats a segment break as a recording
   pause rather than a separate walk, so every segment is flattened into one
   track here rather than becoming several. */
function extractTrack(feature: Feature<Geometry | null>): Track | null {
  const geometry = feature.geometry
  let segments: number[][][]
  if (geometry?.type === 'LineString') {
    segments = [geometry.coordinates]
  } else if (geometry?.type === 'MultiLineString') {
    segments = geometry.coordinates
  } else {
    return null
  }

  const times = feature.properties?.coordinateProperties?.times as
    | string[]
    | string[][]
    | undefined
  const multiSegment = Array.isArray(times) && Array.isArray(times[0])

  const points: TrackPoint[] = []
  segments.forEach((segment, segIndex) => {
    const segmentTimes = multiSegment
      ? (times as string[][])[segIndex]
      : segIndex === 0
        ? (times as string[] | undefined)
        : undefined
    segment.forEach((coord, i) => {
      const [lon, lat, elevation] = coord
      const point: TrackPoint = { lat, lon }
      if (elevation !== undefined) point.elevation = elevation
      if (segmentTimes?.[i] !== undefined) point.time = segmentTimes[i]
      points.push(point)
    })
  })

  const name = typeof feature.properties?.name === 'string' ? feature.properties.name : ''
  return { name, points }
}

function extractTracks(geojson: FeatureCollection<Geometry | null>): Track[] {
  const tracks: Track[] = []
  for (const feature of geojson.features) {
    const track = extractTrack(feature)
    if (track) tracks.push(track)
  }
  return tracks
}

export async function parseKmlOrKmz(file: File): Promise<ParseResult> {
  let kmlText: string
  try {
    kmlText = await extractKmlText(await readAsArrayBuffer(file))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to read file' }
  }

  const doc = parseXmlDocument(kmlText, 'kml', 'File is not a KML document')
  if ('ok' in doc) return doc

  try {
    return { ok: true, tracks: extractTracks(kml(doc)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse KML' }
  }
}

/* GPX is never zipped, unlike KML/KMZ, so this skips `extractKmlText`'s
   zip-detection branch and decodes the bytes directly. */
export async function parseGpx(file: File): Promise<ParseResult> {
  let gpxText: string
  try {
    const bytes = new Uint8Array(await readAsArrayBuffer(file))
    gpxText = new TextDecoder('utf-8').decode(bytes)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to read file' }
  }

  const doc = parseXmlDocument(gpxText, 'gpx', 'File is not a GPX document')
  if ('ok' in doc) return doc

  try {
    return { ok: true, tracks: extractTracks(gpx(doc)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse GPX' }
  }
}

/** Dispatches on extension so every call site takes any accepted track
    file without knowing which parser a given extension needs. */
export function parseTrack(file: File): Promise<ParseResult> {
  return file.name.toLowerCase().endsWith('.gpx') ? parseGpx(file) : parseKmlOrKmz(file)
}
