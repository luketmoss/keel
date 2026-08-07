# 134 — a loose photo's image

The photo detail face's body ("The image, then position and source") and the
photo marker ("Circular thumbnail — the marker #54 already specifies") are both
normative in [shell-and-content-model.md](shell-and-content-model.md). The
loader every image must go through is #55's rule; the marker's geometry is #54's;
tokens are in [design-language.md](design-language.md).

Nothing here is a new design. This note records what the two surfaces show while
the image is not there, which is the only part the existing specifications do
not already fix.

## The main path

Opening a loose photo shows, top to bottom:

```
IMG_4471.jpg                                    ⋮
photo · not in a trip

[ Add to a trip ]

┌──────────────────────────────┐
│                              │
│           the photo          │
│                              │
└──────────────────────────────┘

Position   -23.70412, 133.88061
From       EXIF GPS
Taken      2024-11-03T14:32:07
```

The box is the `loose-face__image` element that exists today: `4 / 3`
aspect-ratio, `--radius-sm`, `--surface-lift` fill. It keeps its dimensions and
gains an `<img>` inside it at `object-fit: cover`, so the layout does not move
when the image arrives.

**`4 / 3` regardless of the photo's own aspect.** A box that resized to each
photo would move everything beneath it — position, source, the `No location`
box — by a different amount per photo, on a face the user is scanning for those
values. `cover` crops; the photo is identifiable at a glance and the full frame
belongs to a lightbox this face does not have.

The image resolves through `usePhotoImage(accessToken, thumbnailDriveFileId)` —
the same acquire/release lifecycle `PhotoList`, `PhotoLayer` and the lightbox
use. #55's rule is that images resolve only through that loader, and the
reference counting is what lets the marker and the face share one blob for the
same photo rather than fetching it twice.

## The thumbnail, not the original

512px on the longest edge into a `--panel-width` column, already generated at
import, and very often already in the cache because the marker asked for it
first.

The original is larger, is fetched over the network for a face the user may be
passing through, and has nowhere to be *seen* at full size — the loose face has
no lightbox. Fetching it to display it at 380px would be paying for detail
nothing renders.

## The marker follows

A loose photo's marker becomes the circular thumbnail, matching `PhotoLayer`:
`--marker-size` across, `--marker-ring` ring, the same 1.35 emphasis scale and
name chip on hover, focus and a hovered row.

This is the standing document's Three kinds table, which a loose photo has been
failing since #110 for exactly the reason its detail face was blank. It is the
same one-line resolution at a second call site, and the two surfaces are wrong
together or right together.

**The cost is bounded and already precedented.** Every drawn loose photo
resolves one 512px thumbnail — the same thing a trip with 128 photos already
does when opened, through the same reference-counted cache. Loose photos are the
"one good photo at a coordinate" case rather than a bulk import, and the shared
cache means a photo drawn on the map and open in the panel is fetched once.

## States

| State | Detail face box | Marker |
|---|---|---|
| Loaded | The image, `cover`, `--radius-sm` | Circular thumbnail |
| Loading | `--surface-lift` fill, unchanged | Plain circle |
| Failed to load | `--surface-lift` fill, unchanged | Plain circle |
| No `thumbnailDriveFileId` | `--surface-lift` fill, unchanged | Plain circle |
| Signed out | Not rendered — #95 withholds loose items entirely | — |

**Loading and failed show the same thing, deliberately.** `usePhotoImage`
already collapses them into one `undefined`, and `PhotoList` already treats them
alike. A photo that has not arrived and a photo that will not arrive look
identical, because the useful action is the same in both cases — none — and an
error panel where a photo should be is a worse answer than a quiet grey box.

**The plain circle is the marker's fallback, not a failure state.** A photo
whose thumbnail is unavailable keeps drawing, at the same size and ring, in the
`--surface-lift` fill the marker uses now. Disappearing from the map would lose
a thing the user has, and a broken-image glyph on a marker is noise at 28px.

**A photo with no thumbnail is not a bug and does not say so.** An item imported
before #120 kept its record and discarded its bytes; there is nothing to fetch
and nothing to fix, so the face says nothing about it. The one state the face
*does* explain in words is `No location`, because that one has a way out.

## Edge cases

**The face is opened and closed quickly.** `usePhotoImage`'s cleanup cancels the
in-flight acquire and releases the handle if it lands after unmount. Nothing
leaks and nothing renders into a dead face.

**Navigating from one loose photo straight to another.** `LooseFace` is keyed by
id, so the old one unmounts and releases before the new one acquires. The box
returns to its fill during the gap rather than showing the previous photo.

**The token expires while the face is open.** The acquire fails, the box returns
to its fill, and #72's session lifecycle handles the reconnect. The face shows
no error of its own — the account surface owns that message.

**The same photo drawn on the map and open in the panel.** One fetch, two
consumers, one release each. This is what the cache's reference counting is for
and it needs no coordination here.

**A photo whose original and thumbnail ids are both set but the thumbnail has
been trashed in Drive by hand.** Fetch fails, both surfaces fall back. Nothing
attempts the original as a substitute — a fallback chain would make a fast path
occasionally slow for no visible gain.

**An unplaced photo.** No marker to draw, and the face shows the image above the
`No location` box rather than instead of it. A photo with no coordinates still
has pixels, and this is precisely the case where they are the only way to tell
which photo it is.

## Transitions

The image fades in over `--motion-fast` when it arrives, from the fill it
replaces. Nothing else moves — the box is already at its final size.

The marker does not animate its fill. A map of markers each popping in as its
thumbnail lands would draw attention to the loading order, which carries no
meaning.

## Copy

None. The face gains no strings; the image's `alt` is empty because the box's
`aria-label` already names the photo, and a second announcement of the same
filename is noise.

## New tokens

None. `--marker-size`, `--marker-ring`, `--radius-sm`, `--surface-lift` and
`--motion-fast` are all already declared.
