/* The cairn model's rules, pinned as pure functions rather than left
   implicit in whichever component happens to call them first — normative
   source is `cairn/docs/design/cairns.md`. `cairnRules.test.ts` exercises
   these directly, against the model's own functions rather than through
   the UI, so a later change to the panel or the map cannot quietly satisfy
   them without that test noticing.

   `placeCairn` and `interpolateCairn` have no caller yet — dragging a
   cairn's marker is #158's build, and interpolation only ever runs once,
   at import time (`photo/useCairnImport.ts`), for this issue. They are
   pinned here first so the rule has one place to live before either issue
   reaches for it, the same way #52's `positionPhoto` existed before the
   full import pipeline did. */

import type { LatLng } from '../map/geo'
import type { CairnIcon, CairnImage, LooseCairnRecord } from './looseStore'

/** Rule 1 (`cairns.md`, "positionSource"): every cairn can be moved,
    whatever its source. Rule 2: moving one sets `positionSource` to
    `placed`, permanently — the reason the field exists, since without it
    interpolation would silently undo a correction the next time it runs. */
export function placeCairn(record: LooseCairnRecord, position: LatLng): LooseCairnRecord {
  return { ...record, position, positionSource: 'placed' }
}

/** Interpolation may only ever write to a cairn whose source is still
    `interpolated` — never `exif` (it already has its own recorded
    position) and never `placed` (a person corrected it, and nothing moves
    it again). Returns the record unchanged when the rule refuses, rather
    than throwing — a caller iterating a trip's cairns should not have to
    special-case the ones it may not touch. */
export function interpolateCairn(record: LooseCairnRecord, position: LatLng): LooseCairnRecord {
  if (record.positionSource !== 'interpolated') return record
  return { ...record, position, positionSource: 'interpolated' }
}

/** The one marker predicate, per `cairns.md`'s "Markers, rows and chips":
    a cairn draws as its thumbnail when it has an image and no icon.
    Otherwise it draws as a pin carrying its icon. The icon wins — choosing
    one is an authored act, the same as placing the pin; an image is
    content, not identity. */
export function cairnDrawsAsThumbnail(record: Pick<LooseCairnRecord, 'image' | 'icon'>): boolean {
  return record.image !== null && record.icon === null
}

/** #159's facet: `any` shows every cairn, `photo` filters on the image
    attribute (whatever the icon), and a `CairnIcon` filters on that icon
    (whatever the image) — the same two independent attributes `cairns.md`
    opens with, read one at a time rather than combined. */
export type CairnFacet = 'any' | 'photo' | CairnIcon

/** A facet answers *which of these do I want*, not *what is this* — so it
    reads `image`/`icon` directly rather than through `cairnDrawsAsThumbnail`,
    which answers a different question (how does this draw). A photographed
    campsite matches both `photo` and `campsite`, and neither answer is a lie
    about what it is. */
export function cairnMatchesFacet(record: Pick<LooseCairnRecord, 'icon' | 'image'>, facet: CairnFacet): boolean {
  if (facet === 'any') return true
  if (facet === 'photo') return record.image !== null
  return record.icon === facet
}

/** `image` is both Drive ids, or neither — never exactly one of the two
    (`cairns.md`'s record comment). `CairnImage`'s shape already makes a
    *known* value's both-or-neither a compile-time guarantee; this is the
    runtime counterpart for a value read back from an untyped source (a
    `cairn.json` read from Drive), where nothing enforced the shape on the
    way in. */
export function isValidCairnImage(value: unknown): value is CairnImage | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const image = value as Record<string, unknown>
  return typeof image.originalDriveFileId === 'string' && typeof image.thumbnailDriveFileId === 'string'
}
