# 132 — removing a photo from a trip

The two exits and their names are normative in
[shell-and-content-model.md](shell-and-content-model.md); the reversibility rule
and the toast are settled in
[110-loose-tracks-and-photos.md](110-loose-tracks-and-photos.md); the confirm
shape and the removal failure copy are in
[77-removing-tracks-and-photos.md](77-removing-tracks-and-photos.md); tokens are
in [design-language.md](design-language.md).

This note covers the control's shape on a photo row, and what a photo carries —
and stops carrying — as it crosses back out of a trip.

## The main path

A photo row inside a trip grows a second control, to the left of the `×` it
already has:

```
[thumb] 14:32  IMG_4471.jpg                     ⤴  ×
```

| Control | Label | What it does |
|---|---|---|
| `⤴` | `Remove <name> from trip` | Moves it back out; it becomes loose |
| `×` | `Delete <name> permanently` | Trashes both files, after the inline confirm |

Identical in glyph, order, position and `aria-label` form to what a track row
shipped in #120. The trip face holds one track list and one photo list stacked
in the same column; they have to read as one surface.

**Removing takes no confirm.** It is reversible by adding the photo back, which
is what makes it the other exit rather than a softer delete. `×` keeps #77's
inline confirm, unchanged.

## Why not `⋮`

The standing document specifies `⋮` with named actions for an owned row, and
neither list has it. Building it for the photo list alone would put a menu
beside two glyphs in the same panel, which is a worse surface than both lists
being uniformly behind the document. The conversion is one piece of work across
both lists and is deliberately not this issue.

The one thing the document's rule protects — that a destructive action never
relies on colour — is already satisfied here: `×` carries the inline confirm
naming what is destroyed, and no accent fill sits in the same row.

## States

| State | Row | Elsewhere |
|---|---|---|
| Rest | `⤴` and `×` at `--text-muted`, `--hover` fill on the row | — |
| Removing | Row at `opacity: 0.4` and inert, `Removing…` in place of both controls | — |
| Removed | Row leaves the photo list; the count above it drops | Toast: `Moved back to the map.` |
| Remove failed | Row returns at rest, failure line beneath it in `--danger` | Photo still in the trip |
| Disconnected | Both controls take the Disabled treatment | #73's one sentence per surface |

`Removing…` reuses the `photo-row__removing` treatment the `×` path already
shows, and the two cannot overlap — a row is doing one thing or the other.

**A toast, because the result is off-screen.** The panel stays on the trip and
the photo reappears at the top level, which the user is not looking at. This is
#110's rule and the same string a removed track uses; two spellings of the same
sentence would be two sentences to keep in step.

## What crosses, and what does not

| Carried out | Dropped |
|---|---|
| Name | Its place in the trip's photo order |
| Original and thumbnail, both files | An interpolated position |
| `gpsTimestamp` and `dateTimeOriginal`, kept distinct per #50 | — |
| `takenAt`, derived from those two | — |
| EXIF GPS position | — |

**An interpolated position does not survive the move, and that is correct.**
#52's interpolation is a property of the trip's tracks, not of the photo —
`photos.json` stores EXIF GPS and nothing else, so there is no interpolated
value to carry even if it should be carried. Outside a trip there is nothing to
interpolate against.

The photo therefore lists as unplaced, draws no marker, and its detail shows the
standing document's box:

> **No location**
> It has no GPS and no trip to interpolate against, so it is in your list but
> not on the map. Adding it to a trip whose tracks cover its timestamp will
> place it.

Which is exactly true, and is the way back. This is not a loss the user has to
be warned about beforehand — the sentence explaining it is already the first
thing the photo's detail says.

## Edge cases

**The move is not atomic.** Two files relocate and a third file is rewritten.
The loose record is created *first*, the files are claimed, and a failed claim
un-creates the record — so the photo either is in the trip or is loose, never
both. A loose row pointing at a file a trip still owns is the duplicate #120
exists to prevent.

**The thumbnail moves and the original does not,** or the reverse. Treated as a
failed claim: the record is un-created and the row returns with its failure
line. A photo half-out of a trip is the one outcome worth refusing.

**`photos.json` fails to rewrite after the files have moved.** The files have
left, so the removal is reported as done — the mirror of #120's rule on the way
in, and for the same reason: reporting failure after the first file has moved
would leave the trip and the top level both claiming the photo. The trip's index
still names a photo that is no longer in its folder; the Photos tab shows it as
a missing file until the next successful rewrite, which is the existing
`MissingFileRow` behaviour and not a new state.

**The photo is open in the lightbox when it is removed.** The lightbox closes,
as #77 already specifies for a deleted photo — `TripDetail` clears
`openPhotoId` when the id leaves `photoImport.photos`.

**The removed photo is the trip's last.** The trip stays, empty, and #4's empty
state covers it. #110 already settled that an empty trip is a plan, not a
mistake.

**Two rows removed in quick succession.** Each is its own operation against its
own id, and `DriveLooseStore` serialises per id. The photo list's `removingIds`
set already holds more than one row at a time.

**A photo whose files are not in the trip's folder at all** — an entry in
`photos.json` naming a file that has been trashed elsewhere. The claim fails,
the record is un-created, and the failure line shows. Removing it from the trip
is not the repair for that; `×` is.

**Signed out mid-removal.** The claim fails on the Drive call, and the row
returns with its failure line — the same path any other network failure takes.

## Transitions

The row leaves the list over `--motion-fast`, the count above it drops with it,
and the toast enters over `--motion-base`. The map behind the panel gains the
photo's marker at the same moment; nothing pans or zooms to it, because the
panel is still showing the trip and moving the camera would take the user
somewhere they did not ask to go.

## Copy

| Where | String |
|---|---|
| Remove control, accessible name | `Remove <name> from trip` |
| Delete control, accessible name | `Delete <name> permanently` |
| In-flight | `Removing…` |
| Success toast (unchanged, #110) | `Moved back to the map.` |
| Failure line | `Couldn't remove <name> — try again.` |
| Delete confirm (unchanged, #77) | `Remove "<name>"?` with `Remove` / `Cancel` |

The failure line reuses the string `usePhotoImport`'s delete path already shows,
because both failures are the same fact to the user: the photo is still where it
was.

## New tokens

None.
