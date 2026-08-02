import { kml } from '@tmcw/togeojson'
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

function parseXml(text: string): Document | ParseFailure {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, error: 'File is not well-formed XML' }
  }
  if (doc.documentElement?.tagName !== 'kml') {
    return { ok: false, error: 'File is not a KML document' }
  }
  return doc
}

/* togeojson collapses a two-point LineString/gx:Track into a Point geometry,
   losing the line — only LineString survives here, which is a documented
   limitation rather than a bug in this module. */
function extractTrack(feature: Feature<Geometry | null>): Track | null {
  if (feature.geometry?.type !== 'LineString') return null

  const times = feature.properties?.coordinateProperties?.times as
    | string[]
    | undefined

  const points: TrackPoint[] = feature.geometry.coordinates.map((coord, i) => {
    const [lon, lat, elevation] = coord
    const point: TrackPoint = { lat, lon }
    if (elevation !== undefined) point.elevation = elevation
    if (times?.[i] !== undefined) point.time = times[i]
    return point
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

  const doc = parseXml(kmlText)
  if ('ok' in doc) return doc

  try {
    return { ok: true, tracks: extractTracks(kml(doc)) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse KML' }
  }
}
