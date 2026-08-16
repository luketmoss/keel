import { useCallback } from 'react'
import { parseKmlOrKmz, type Track } from '../kml/parse'
import { aggregateElevationProfile, aggregateTrackStats } from '../kml/stats'
import { readPhotoExif } from '../photo/exif'
import { positionPhoto } from '../photo/interpolate'
import { formatShortDate } from '../format/dates'
import { isPhotoFile, isTrackFile } from '../import/fileKinds'
import { TRACK_COLORS } from '../map/palette'
import type { LooseCairnRecord, LooseRecord, LooseStore, LooseTrackRecord } from '../store/looseStore'
import type { CairnRecord } from '../photo/useCairnImport'
import type { PlacementQueueItem } from './placementQueue'

export interface ImportRejection {
  name: string
  message: string
}

export interface LooseImportResult {
  rejections: ImportRejection[]
  /** How many dropped images saved immediately (EXIF, since a loose drop
      has no trip open to interpolate against) — the placement queue's
      batch summary needs this alongside `needsPlacement` to read the whole
      drop, not just its stragglers. */
  resolvedCount: number
  /** Images that resolved by neither route — `cairns.md` forbids writing
      these without a position, so they wait here instead of being rejected.
      Empty for a batch of tracks only. */
  needsPlacement: PlacementQueueItem[]
}

export const UNRECOGNISED =
  'cairn takes .kml or .kmz tracks, JPEG, PNG or WebP photos, and .zip archives'

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
let nextQueueItemId = 0
function generateQueueItemId(): string {
  nextQueueItemId += 1
  return `queue-loose-${nextQueueItemId}`
}

export function useLooseImport(store: LooseStore) {
  const importFiles = useCallback(
    async (files: File[]): Promise<LooseImportResult> => {
      const rejections: ImportRejection[] = []
      const needsPlacement: PlacementQueueItem[] = []
      let resolvedCount = 0

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
          // #226 — one `TrackStats` for the whole file (`aggregateTrackStats`),
          // since a loose row is one row per file and the face needs all six
          // of #218's numbers, not just the ascent this used to compute alone.
          const aggregate = aggregateTrackStats(parsed.tracks)
          const profile = aggregateElevationProfile(parsed.tracks)
          store.addTrack(
            {
              name: parsed.tracks[0].name || file.name.replace(/\.[^.]+$/, ''),
              date: trackDate(parsed.tracks),
              distanceMeters: aggregate.distanceMeters,
              ascentMeters: aggregate.elevationGainMeters ?? null,
              elevationLossMeters: aggregate.elevationLossMeters ?? null,
              highPointMeters: aggregate.highPointMeters ?? null,
              lowPointMeters: aggregate.lowPointMeters ?? null,
              durationSeconds: aggregate.durationSeconds ?? null,
              elevationProfile: profile ?? null,
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
          const fields = exif.ok ? exif.exif : {}
          // A loose drop has no trip open, so there are no tracks to
          // interpolate against — `positionPhoto([], …)` only ever resolves
          // via EXIF here, which is exactly `cairns.md`'s first resolution
          // route.
          const resolved = positionPhoto(fields, [])
          if (resolved) {
            store.addCairn(
              {
                name: file.name,
                position: { lat: resolved.latitude, lng: resolved.longitude },
                positionSource: resolved.source,
                date: fields.gpsTimestamp ?? fields.dateTimeOriginal ?? null,
                // Kept apart as well as collapsed into `date` above: #50's
                // reason for distinguishing them does not stop applying while
                // a cairn is loose, and a move into a trip carries both.
                ...(fields.gpsTimestamp !== undefined ? { gpsTimestamp: fields.gpsTimestamp } : {}),
                ...(fields.dateTimeOriginal !== undefined
                  ? { dateTimeOriginal: fields.dateTimeOriginal }
                  : {}),
                ...(fields.orientation !== undefined ? { orientation: fields.orientation } : {}),
              },
              file,
            )
            resolvedCount += 1
            continue
          }

          // Neither route resolved. `cairns.md` forbids writing a cairn with
          // no position, so this waits in the placement queue instead of
          // being rejected — nothing is written until it's placed by hand.
          const captureDate = fields.gpsTimestamp ?? fields.dateTimeOriginal
          needsPlacement.push({
            id: generateQueueItemId(),
            name: file.name,
            file,
            captureLabel: captureDate ? formatShortDate(captureDate) : null,
            captureInstantMs: undefined,
            // No trip is open on a loose drop, so there is nothing to
            // suggest against — the suggestion ring is absent by construction.
            tracks: [],
            save: async (position) => {
              const record = store.addCairn(
                {
                  name: file.name,
                  position,
                  positionSource: 'placed',
                  date: captureDate ?? null,
                  ...(fields.gpsTimestamp !== undefined ? { gpsTimestamp: fields.gpsTimestamp } : {}),
                  ...(fields.dateTimeOriginal !== undefined
                    ? { dateTimeOriginal: fields.dateTimeOriginal }
                    : {}),
                  ...(fields.orientation !== undefined ? { orientation: fields.orientation } : {}),
                },
                file,
              )
              return record.id
            },
          })
          continue
        }

        rejections.push({ name: file.name, message: `${file.name} — ${UNRECOGNISED}` })
      }

      return { rejections, resolvedCount, needsPlacement }
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
   * `claimFromTrip`. Returns the record so that caller can.
   *
   * #150: `name` is the name the *user* gave the track, and it wins over
   * every derivation below. Only `Remove from trip` has one, and only when
   * the track carried a display-name override inside its trip — a name the
   * app derived is left to be derived again here, so a track nobody renamed
   * still becomes `hike` rather than `hike.kml`. */
  const addParsedTracks = useCallback(
    (
      sourceName: string,
      tracks: Track[],
      options?: { source?: File; driveFileId?: string; name?: string },
    ): LooseTrackRecord | null => {
      if (tracks.length === 0) return null
      // #226 — same whole-file aggregate `importFiles` computes above; this
      // path (`Remove from trip`) has the trip's own already-parsed tracks
      // rather than a dropped `File`, but the numbers are derived the same
      // way regardless of where the `Track[]` came from.
      const aggregate = aggregateTrackStats(tracks)
      const profile = aggregateElevationProfile(tracks)
      return store.addTrack(
        {
          name: options?.name?.trim() || tracks[0].name || sourceName.replace(/\.[^.]+$/, ''),
          date: trackDate(tracks),
          distanceMeters: aggregate.distanceMeters,
          ascentMeters: aggregate.elevationGainMeters ?? null,
          elevationLossMeters: aggregate.elevationLossMeters ?? null,
          highPointMeters: aggregate.highPointMeters ?? null,
          lowPointMeters: aggregate.lowPointMeters ?? null,
          durationSeconds: aggregate.durationSeconds ?? null,
          elevationProfile: profile ?? null,
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

  /** A trip's `CairnRecord`, rebuilt as a loose record for `Remove from
      trip`. Every field carries straight across unchanged — position,
      source and image included, since a cairn's position is never
      recomputed by leaving a trip the way an old photo's derived-from-
      interpolation one used to be lost. `claimFromTrip` is what relocates
      the folder, the cairn mirror of `addParsedTracks` passing
      `driveFileId` for a track.
   *
   * `id: record.id` is what makes the relocation findable: the trip-side
      folder is `trips/<trip-id>/cairns/<record.id>/`, and preserving the
      same id here is the only thing that lets `claimFromTrip` find it by
      name with no file id to carry across (see `NewLooseCairn.id`). */
  const addCairnFromTrip = useCallback(
    (record: CairnRecord): LooseCairnRecord => {
      return store.addCairn({
        id: record.id,
        name: record.name,
        position: record.position,
        positionSource: record.positionSource,
        icon: record.icon,
        image: record.image,
        description: record.description,
        date: record.date,
        ...(record.gpsTimestamp !== undefined ? { gpsTimestamp: record.gpsTimestamp } : {}),
        ...(record.dateTimeOriginal !== undefined ? { dateTimeOriginal: record.dateTimeOriginal } : {}),
      })
    },
    [store],
  )

  return { importFiles, addParsedTracks, addCairnFromTrip }
}

/** Loose items that have a position, in the shape the map's layers want. A
    cairn always has one (`cairns.md`); only a track's can still be `null`
    (its geometry failed to parse). */
export function placedLooseItems(items: LooseRecord[]): LooseRecord[] {
  return items.filter((item) => item.position !== null)
}
