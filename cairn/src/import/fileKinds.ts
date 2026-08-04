/* Shared by TripDetail's in-trip import and #81's drop-to-draft import
   outside a trip — both partition a drop by extension the same way, and
   the outside-a-trip path additionally needs to tell "wrong extension" and
   "a photo, but not inside a trip" apart for its rejection copy. */

export const TRACK_EXTENSIONS = ['.kml', '.kmz']
export const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']

export function isTrackFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TRACK_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function isPhotoFile(name: string): boolean {
  const lower = name.toLowerCase()
  return PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
