/* Computes each imported photo's map position against a trip's tracks —
   the wiring #52's positionPhoto (interpolate.ts) was built for but never
   got, per #54's design doc. Pure — no React, no I/O.

   TripDetail calls this with `photoImport.photos` and every track across
   `tripImport.tracks`, and passes the result down to MapView/PhotoLayer.
   A photo `positionPhoto` can't place (no GPS, no resolvable capture
   instant, or too far from the nearest track point in time) is dropped
   here — "unlocated photos do not render on the map at all" (design
   doc's Marker form section) means the map layer should never even see
   them. */

import type { Track } from '../kml/parse'
import { positionPhoto, type PhotoPositionSource } from './interpolate'
import type { PhotoRecord } from './photoIndex'

export interface PositionedPhoto {
  id: string
  name: string
  thumbnailDriveFileId: string
  latitude: number
  longitude: number
  source: PhotoPositionSource
}

export function positionPhotos(photos: PhotoRecord[], tracks: Track[]): PositionedPhoto[] {
  const positioned: PositionedPhoto[] = []

  for (const photo of photos) {
    const position = positionPhoto(photo, tracks)
    if (!position) continue

    positioned.push({
      id: photo.id,
      name: photo.name,
      thumbnailDriveFileId: photo.thumbnailDriveFileId,
      latitude: position.latitude,
      longitude: position.longitude,
      source: position.source,
    })
  }

  return positioned
}
