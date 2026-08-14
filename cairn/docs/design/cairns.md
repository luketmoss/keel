# cairn cairns

Standing reference, not an issue note — the same status as
[design-language.md](design-language.md) and
[shell-and-content-model.md](shell-and-content-model.md), and no number for the
same reason. It is authoritative for every issue that touches a cairn, and it
outranks any individual issue note that disagrees with it.

**It supersedes two things in `shell-and-content-model.md`:** the *Three kinds*
table, and the whole *Position, and the photo that has none* section. That file
is otherwise unchanged and still governs the shell, the column, the panel and
the ownership moves.

**It changes a decision in cairn's `CLAUDE.md`** — "photos" is no longer a kind.
The decision that photos without GPS are *not discarded* is untouched and is in
fact strengthened here.

A runnable reference lives at
[`cairn/docs/prototypes/cairns.html`](../prototypes/cairns.html). **It is the
tiebreaker on interaction detail** — open it when this document is ambiguous.

It deliberately sits *outside* `docs/design/`, because everything in that folder
without an issue number is standing and gets read on every `/ux` and `/develop`
run. The prototype is ~20k tokens. Keeping it one directory away means it is
available when wanted and never swept up when not.

---

## The one idea

**A photo and a cairn are the same thing.** Both are something at a
coordinate with a name, a date, a description, and a trip or no trip. They
differ in exactly two independent attributes:

| Attribute | Question it answers |
|---|---|
| `image` | What do I have of this place? |
| `positionSource` | Where did its coordinate come from? |

Neither is a type. A campsite you photographed is one record, not a choice
between two.

**A photo is never a value in an enum of place types.** Campsite, water, hut,
viewpoint, summit, hazard, parking and junction all answer *what is this place*.
An image answers *what do I have of it*. Collapsing those into one field makes
"a photo of a campsite" unrepresentable, which is the bug this whole model
exists to fix.

---

## The record

```ts
export type PositionSource = 'exif' | 'interpolated' | 'placed'

export type CairnIcon =
  | 'campsite' | 'water' | 'hut' | 'viewpoint'
  | 'summit' | 'hazard' | 'parking' | 'junction'

export interface CairnRecord {
  id: string
  name: string
  createdAt: string

  /** Never null. A cairn without a coordinate is not a cairn — see
      "A cairn always has a position" below. */
  position: LatLng
  positionSource: PositionSource

  /** What kind of place this is, or `null` if you did not say. */
  icon: CairnIcon | null

  /** Both ids, or `null`. Never one of the two — the "both, or neither"
      rule `LoosePhotoRecord` already applies to its Drive files. */
  image: { originalDriveFileId: string; thumbnailDriveFileId: string } | null

  /** Free text. Empty string, never null — matches `TripRecord.notes`. */
  description: string

  /** What the row shows. Seeded from EXIF on import, authored otherwise. */
  date: string | null
  /** #50 keeps these distinct and this model does not collapse them.
      Present only for a cairn that came from a photo. */
  gpsTimestamp?: string
  dateTimeOriginal?: string
}
```

`kind: 'photo'` is gone. `LoosePhotoRecord` is gone. `PhotoRecord` and
`photos.json` are gone.

### A cairn always has a position

There is **no unplaced state and no `no location` copy.** A record that cannot
be given a coordinate is never written — see *Import* below, where an
unplaceable photo stays in a draft and is therefore not a record at all.

This is a stronger guarantee than the old model's, and it is only affordable
because there is nothing to migrate: existing data is being deleted before this
work starts. Do not add a nullable position "for safety". A nullable position
reintroduces every case this model deletes.

---

## positionSource

It records **provenance, and nothing else.** It is not a permission and it does
not decide what the user may do.

| Value | Means |
|---|---|
| `exif` | The photo's own GPS tags supplied this coordinate |
| `interpolated` | #52 computed it from a trip's track times |
| `placed` | A person put it here |

Two rules, and they are the whole of it:

> **1. Every cairn can be moved.** Dragging its marker is always allowed,
> whatever its source. EXIF is a starting value, not a verdict — phone GPS
> drifts, a camera geotagged by a phone in a pocket is wrong, and a photo taken
> from a lookout is *of* something across the valley.

> **2. Moving a cairn sets `positionSource` to `placed`, permanently.**
> Interpolation may only ever write to a cairn whose source is still
> `interpolated`. Once a person has placed something, nothing moves it again.

Rule 2 is the reason the field exists. Without it, #52 silently undoes a
correction the next time it runs, and the user has no way to make a position
stick.

### Copy

| Source | Detail-face sentence |
|---|---|
| `placed` | You put this here. Interpolation will never move it again. |
| `exif` | Position came from the photo's EXIF GPS — a starting value, not a verdict. Drag its marker to correct it and this becomes placed. |
| `interpolated` | No GPS, so it was positioned by timestamp against this trip's tracks. Drag its marker to correct it and this becomes placed. |

---

## Import

Dropping image files creates cairns. This replaces photo import entirely; there
is no separate photo pipeline left.

### Resolution order

For each dropped file, in order, stopping at the first that succeeds:

1. **EXIF GPS present** → `position` from it, `positionSource: 'exif'`
2. **No GPS, a trip is open, and its tracks bracket the photo's timestamp** →
   `positionSource: 'interpolated'`, via the existing `positionPhoto` in
   `photo/interpolate.ts`, unchanged including its
   `MAX_INTERPOLATION_GAP_MS` refusal
3. **Neither** → it needs the user, and does **not** become a record

### What resolves is saved immediately

A batch does not wait on its stragglers. Drop forty photos of which two need a
location and thirty-eight save at once. Making all forty wait on two is worse
than the problem it solves.

### What does not resolve waits in the draft

An unplaceable photo goes into the import draft, where #81's rule already
applies: **nothing has been written anywhere.** It is not in the library, not in
Drive, and not on the map.

> **Placing it is what makes it a cairn. Discarding means it was never imported.**

That is what makes "no orphaned photos" true by construction rather than by
cleanup. There is no record to orphan.

**Rejecting the import is not an option** — cairn's `CLAUDE.md` records that a
photo without GPS is positioned, not discarded, and calls it the feature that
makes cairn worth using over dumping a folder into Google Earth.

### The placement queue

One draft face, holding every unplaceable file in the batch:

```
NOT SAVED
▓▓▓░░                              ← one cell per file in the batch
5 photos · 3 placed · 2 need a location

[ the photo, large ]
IMG_4423.jpg · 17 Jun 2023

Click the map to place it, or click the pulsing ring —
the nearest point on your route by time.

  Skip this one      Discard 2
```

- The map takes a crosshair cursor; a click places the current file and
  advances the queue.
- **Skip** sends the current file to the back of the queue; it does not
  discard it.
- **Discard n** drops only what is still unplaced. Everything already placed
  or auto-resolved stays.
- Filter chips are hidden throughout, per `shell-and-content-model.md`'s rule
  for a draft.
- When the queue empties, the last placed cairn's detail face opens.

### The suggestion

A blank map is a bad place to start. Show a pulsing `--accent` ring at **the
nearest point in time on the open trip's tracks**, read from
`interpolate.ts`'s `timedPointPool` — *including* across the ten-minute gap
that `interpolatePosition` refuses to cross automatically. Good enough to
offer; not good enough to apply.

Clicking the ring places the photo there. No trip open, or no timed track
points, means no ring and no suggestion.

---

## Creating a cairn by hand

**Right-click the map** (long-press on touch). There is no armed placement
mode — a mode is a thing to get stuck in.

The create face opens in the panel with the pin already dropped and selected:
name (focused), icon picker, description, date defaulting to today. **Create**
saves; **Cancel** removes the pin and nothing existed.

An empty name commits the icon's label (`Campsite`), or `Cairn` with no icon —
the same "empty is an aborted edit" rule `LocalTripStore.updateTripSync`
applies to a trip's name.

### The gesture's context decides ownership

| Where you are | What you get |
|---|---|
| Nothing open | A loose cairn |
| A trip open | A cairn in that trip |

This holds for both create paths — right-click and drop — and it is what
removes a separate "add to a trip" step for the common case. `Add to a trip`
still exists on the `⋮` for the case where you get it wrong.

**Right-click is undiscoverable.** This document does not specify the
affordance that fixes that; the prototype fakes it with a hint chip. Whoever
builds it owes a real answer, and it is a legitimate thing to raise back.

---

## Adding a photo to a cairn that exists

**Drop an image while a cairn's detail is open and the photo joins that
cairn.** No new record, no placement question — the cairn already has a
position, and `image` is simply the attribute being filled in.

Its `position`, `positionSource` and `icon` are all untouched. Its `date` is
filled from the photo's EXIF only if it had none.

---

## Markers, rows and chips

One predicate drives all three. Write it once.

> **A cairn draws as its thumbnail when it has an image and no icon.
> Otherwise it draws as a pin carrying its icon.**

**The icon wins.** Choosing one is an authored act, the same as placing the pin;
an image is content, not identity. A photographed campsite drawing as a photo
circle means the map stops telling you where you can camp — verify this in the
prototype by flipping its marker toggle, which is the case it was built to show.

A cairn drawn as a pin that *has* an image carries a small camera badge at its
top-right, so "there is a photo here" is legible without spending the marker
on it.

| Kind | Marker | Size |
|---|---|---|
| Trip | dot | `--dot-size`, `--dot-ring` |
| Track | rounded tile in its colour | `--marker-track`, `--radius-sm` |
| Cairn, as image | circular thumbnail | `--marker-size`, `--marker-ring` |
| Cairn, as pin | teardrop, icon glyph, `--surface` fill | `--marker-poi` |

A pin is the one marker shape cairn has not spent, and in every map app it
already means *someone put this here*.

**New token:** `--marker-poi: 30px` (the pin's width; its height is 1.26×).

### The row

The glyph is the marker, drawn smaller — unchanged from
`shell-and-content-model.md`. The meta line is where the two attributes become
visible, and it reads as clauses rather than as a type:

| Cairn | Meta line |
|---|---|
| Photo, no icon | `16 Jun 2023 · photo` |
| Campsite, no photo | `13 Jun 2023 · campsite` |
| Campsite with a photo | `13 Jun 2023 · campsite · photo` |
| Neither | `14 Aug 2026 · cairn` |

Undated reads `undated` in place of the date.

### The chips

`All` · `Trips` · `Tracks` · `Cairns`

One chip, because there is one kind. Selecting `Cairns` reveals a second row of
**facet** chips beneath it:

`Any` · `Photo` · then the eight icons

**The facets are icon-only.** Measured at `--panel-width`: labelled facet chips
wrap to three rows and cost 96px of panel height; icon-only costs 60px across
two. The name moves to `aria-label` — hiding a label is not permission to ship
an unnamed control.

`Photo` is a facet, not a kind: it selects every cairn carrying an image,
whatever its icon. This is what makes the facet row strictly more expressive
than splitting `Photos` from `Places` — **a photographed campsite is findable
under both `Photo` and `Campsite`**, and neither answer is a lie about what it
is.

A facet filters on an attribute; it does not claim what the thing *is*. That is
why this does not reintroduce the two-truths problem the marker rule avoids —
the marker still says campsite, and always did.

The sub-row is hidden whenever `Cairns` is not the active chip, and hidden
entirely on a detail face or a draft, per `shell-and-content-model.md`.

One filter drives the list and the map together, unchanged.

Panel titles: `Everything`, `Trips`, `Loose tracks`, `Cairns`. With a facet
active the title stays `Cairns` and the count reflects the facet.
Search placeholder becomes `Search trips, tracks and cairns`.

### The icon set

Fixed, and exactly these eight:

`campsite` · `water` · `hut` · `viewpoint` · `summit` · `hazard` · `parking` ·
`junction`

Plus `none`. **Do not make this extensible.** An open set is an emoji picker,
and a marker nobody can read at a glance has no reason to carry a glyph.
Adding a ninth is a product decision, taken here, not in an implementation.

---

## Storage

```
/Cairn/
├── trips/<trip-id>/
│   ├── cairns/<cairn-id>/
│   │   ├── cairn.json
│   │   ├── <original>            # only when the cairn has an image
│   │   └── <original>.thumb.jpg
│   └── …tracks
└── loose/
    ├── tracks/<track-id>/
    └── cairns/<cairn-id>/
```

**A cairn is a folder, the same as a loose track already is.** `photos.json`
is deleted, not migrated — a per-trip index existed because a photo had no
folder of its own, and now it does.

`Add to a trip` and `Remove from trip` stay folder moves, unchanged.

**`TripRecord.photoCount` becomes `cairnCount`**, and counts cairns regardless
of whether they carry images. `null` still means never counted and is still not
`0` — #121's distinction survives intact. The picker reads `4T · 12P`.

---

## Decisions not taken

Recorded so they are not made twice.

- **A fourth kind beside photos**, leaving photo import alone. Rejected: it
  duplicates the whole record, list, marker, detail and ownership machinery
  permanently, to avoid a one-time change that is free right now because there
  is no data to migrate.
- **`photo` as a value in the icon enum.** Rejected: it makes a photo of a
  campsite unrepresentable, which is the one case the model exists for.
- **EXIF positions being immutable.** Rejected: EXIF is routinely wrong, and
  the user must be able to make a correction stick.
- **Rejecting photos with no GPS.** Rejected: contradicts a recorded decision
  in cairn's `CLAUDE.md`, and throws away the photo.
- **A modal per unplaceable photo.** Rejected: unusable for a batch.
- **A persistent unplaced state with a "needs a location" queue in the panel.**
  Rejected now that nothing needs migrating — it is the orphan the whole
  requirement is against, and the draft achieves the same thing without ever
  writing a record.
- **Splitting `Photos` and `Places` into two chips.** Rejected in favour of one
  `Cairns` chip with a facet row. Any split has to answer where a photographed
  campsite goes, and every answer is wrong somewhere; a facet row makes it
  findable under both without either being a claim about what it is.
- **Labelled facet chips.** Rejected on measurement: three rows and 96px of
  panel height against two rows and 60px.
