import exifr from 'exifr'

export interface PhotoExif {
  latitude?: number
  longitude?: number
  orientation?: number
  /** Absolute UTC instant from GPSDateStamp + GPSTimeStamp, ISO 8601 with a `Z` offset. */
  gpsTimestamp?: string
  /** Wall-clock time from DateTimeOriginal, ISO 8601 with no offset — the camera recorded no
   *  timezone, so none is assumed. Resolving this to an instant needs a timezone from elsewhere
   *  and is out of scope here (see issue #52). */
  dateTimeOriginal?: string
}

export interface ExifSuccess {
  ok: true
  exif: PhotoExif
}

export interface ExifFailure {
  ok: false
  error: string
}

export type ExifResult = ExifSuccess | ExifFailure

/* FileReader rather than File#arrayBuffer(): the latter is unimplemented by jsdom, which the
   test suite runs under (see src/kml/parse.ts). */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

interface RawExifTags {
  latitude?: number
  longitude?: number
  Orientation?: number
  GPSDateStamp?: string
  GPSTimeStamp?: [number, number, number]
  DateTimeOriginal?: string
}

/* Combines GPSDateStamp ("YYYY:MM:DD") and GPSTimeStamp ([h, m, s]) into one ISO 8601 UTC
   instant. Both are required — GPS receivers that write one always write the other, but a
   partial/corrupted tag set should not produce a fabricated instant. */
function gpsInstant(dateStamp: string, timeStamp: [number, number, number]): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2})$/.exec(dateStamp)
  if (!match) return undefined

  const [, year, month, day] = match
  const [hour, minute, second] = timeStamp
  const wholeSeconds = Math.floor(second)
  const milliseconds = Math.round((second - wholeSeconds) * 1000)

  const instant = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute, wholeSeconds, milliseconds),
  )
  if (Number.isNaN(instant.getTime())) return undefined
  return instant.toISOString()
}

/* DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") is wall-clock local time with no zone recorded.
   Reformatted to ISO 8601 shape but deliberately left without a `Z` or offset, so nothing
   downstream mistakes it for an instant. */
function wallClockIso(raw: string): string | undefined {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw)
  if (!match) return undefined
  const [, year, month, day, hour, minute, second] = match
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`
}

export async function readPhotoExif(file: File): Promise<ExifResult> {
  let buffer: ArrayBuffer
  try {
    buffer = await readAsArrayBuffer(file)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to read file' }
  }

  let tags: RawExifTags | undefined
  try {
    tags = await exifr.parse(buffer, {
      // ifd0 (which carries Orientation) cannot be disabled, so it needs no explicit flag here.
      gps: true,
      exif: true,
      translateValues: false,
      reviveValues: false,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to read image' }
  }

  const exif: PhotoExif = {}

  if (tags?.latitude !== undefined) exif.latitude = tags.latitude
  if (tags?.longitude !== undefined) exif.longitude = tags.longitude
  if (tags?.Orientation !== undefined) exif.orientation = tags.Orientation

  if (tags?.GPSDateStamp !== undefined && tags?.GPSTimeStamp !== undefined) {
    const instant = gpsInstant(tags.GPSDateStamp, tags.GPSTimeStamp)
    if (instant !== undefined) exif.gpsTimestamp = instant
  }

  if (tags?.DateTimeOriginal !== undefined) {
    const wallClock = wallClockIso(tags.DateTimeOriginal)
    if (wallClock !== undefined) exif.dateTimeOriginal = wallClock
  }

  return { ok: true, exif }
}
