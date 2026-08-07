import { useCallback } from 'react'
import { parseKmlOrKmz, type Track } from '../kml/parse'
import { computeTrackStats } from '../kml/stats'
import { readPhotoExif } from '../photo/exif'
import { isPhotoFile, isTrackFile } from '../import/fileKinds'
import { TRACK_COLORS } from '../map/palette'
import type { LooseRecord, LooseStore, LooseTrackRecord } from '../store/looseStore'

export interface ImportRejection {
  name: string
  message: string
}

const UNRECOGNISED = 'cairn takes .kml or .kmz tracks and JPEG, PNG or WebP photos'

/** The date a track happened, from its first timestamped point. A KML with
    no times has none, and the row says so rather than inventing today. */
function trackDate(tracks: Track[]): string | null {
  for (const track of tracks) {
    for (const point of track.points) {
      if (point.time) return point.time
    }
  }
  return null
}

function firstPoint(tracks: Track[]): { lat: number; lng: number } | null {
  for (const track of tracks) {
    const point = track.points[0]
    if (point) return { lat: point.lat, lng: point.lon }
  }
  return null
}

/** Imports dropped files as loose tracks and photos — the ones that belong
    to no trip.
 *
 * A track's stats are summed across every track in the file, because one
 * dropped file is one row: a KML with three placemarks is one day out, not
 * three things to keep separate. That matches what a trip's own import does
 * with a multi-placemark file. */
export function useLooseImport(store: LooseStore) {
  const importFiles = useCallback(
    async (files: File[]): Promise<ImportRejection[]> => {
      const rejections: ImportRejection[] = []

      for (const file of files) {
        if (isTrackFile(file.name)) {
          const parsed = await parseKmlOrKmz(file)
          if (!parsed.ok) {
            rejections.push({ name: file.name, message: `${file.name} — ${parsed.error}` })
            continue
          }
          if (parsed.tracks.length === 0) {
            rejections.push({ name: file.name, message: `${file.name} has no track to import.` })
            continue
          }
          const stats = parsed.tracks.map(computeTrackStats)
          const distanceMeters = stats.reduce((total, s) => total + s.distanceMeters, 0)
          const gains = stats
            .map((s) => s.elevationGainMeters)
            .filter((gain): gain is number => gain !== undefined)
          store.addTrack(
            {
              name: parsed.tracks[0].name || file.name.replace(/\.[^.]+$/, ''),
              date: trackDate(parsed.tracks),
              distanceMeters,
              ascentMeters: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) : null,
              pointCount: parsed.tracks.reduce((total, t) => total + t.points.length, 0),
              sourceName: file.name,
              // Cycles the palette by how many loose tracks already exist,
              // so two dropped together are never the same colour.
              colorIndex:
                store.getItems().filter((item) => item.kind === 'track').length % TRACK_COLORS.length,
              position: firstPoint(parsed.tracks),
            },
            parsed.tracks,
            // #120: the dropped file itself, not just what parsing made of
            // it. A Drive-backed store has nothing to upload without it,
            // and "add to a trip is a move between folders" has nothing to
            // move.
            file,
          )
          continue
        }

        if (isPhotoFile(file.name)) {
          const exif = await readPhotoExif(file)
          const gps =
            exif.ok && exif.exif.latitude !== undefined && exif.exif.longitude !== undefined
              ? { lat: exif.exif.latitude, lng: exif.exif.longitude }
              : null
          store.addPhoto(
            {
              name: file.name,
              takenAt: exif.ok
                ? (exif.exif.gpsTimestamp ?? exif.exif.dateTimeOriginal ?? null)
                : null,
              // Kept apart as well as collapsed into `takenAt` above: #50's
              // reason for distinguishing them does not stop applying while
              // a photo is loose, and a move into a trip carries both.
              ...(exif.ok && exif.exif.gpsTimestamp !== undefined
                ? { gpsTimestamp: exif.exif.gpsTimestamp }
                : {}),
              ...(exif.ok && exif.exif.dateTimeOriginal !== undefined
                ? { dateTimeOriginal: exif.exif.dateTimeOriginal }
                : {}),
              ...(exif.ok && exif.exif.orientation !== undefined
                ? { orientation: exif.exif.orientation }
                : {}),
              // A photo with no GPS is imported anyway, without a position.
              // It lists, it does not draw, and its detail explains the way
              // out — losing it would be worse than not placing it.
              position: gps,
            },
            file,
          )
          continue
        }

        rejections.push({ name: file.name, message: `${file.name} — ${UNRECOGNISED}` })
      }

      return rejections
    },
    [store],
  )

  /** Already-parsed tracks — #81's draft has done the parsing, and
      re-reading the same `File` to reach the same result would be work for
      nothing.
   *
   * Two callers, and they differ only in where the bytes are. The draft's
   * `Keep loose` still holds the dropped `File` and passes it, so the store
   * uploads it like any other import. `Remove from trip` has no `File` —
   * the bytes are already in Drive, in the trip's folder — and passes
   * `driveFileId` instead, for the caller to relocate with
   * `claimFromTrip`. Returns the record so that caller can. */
  const addParsedTracks = useCallback(
    (
      sourceName: string,
      tracks: Track[],
      options?: { source?: File; driveFileId?: string },
    ): LooseTrackRecord | null => {
      if (tracks.length === 0) return null
      const stats = tracks.map(computeTrackStats)
      const gains = stats
        .map((s) => s.elevationGainMeters)
        .filter((gain): gain is number => gain !== undefined)
      return store.addTrack(
        {
          name: tracks[0].name || sourceName.replace(/\.[^.]+$/, ''),
          date: trackDate(tracks),
          distanceMeters: stats.reduce((total, s) => total + s.distanceMeters, 0),
          ascentMeters: gains.length > 0 ? gains.reduce((a, b) => a + b, 0) : null,
          pointCount: tracks.reduce((total, t) => total + t.points.length, 0),
          sourceName,
          colorIndex:
            store.getItems().filter((item) => item.kind === 'track').length % TRACK_COLORS.length,
          position: firstPoint(tracks),
          driveFileId: options?.driveFileId ?? null,
        },
        tracks,
        options?.source,
      )
    },
    [store],
  )

  return { importFiles, addParsedTracks }
}

/** Loose items that have a position, in the shape the map's layers want. */
export function placedLooseItems(items: LooseRecord[]): LooseRecord[] {
  return items.filter((item) => item.position !== null)
}
