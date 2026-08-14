# 157 — Adding a photo to a cairn that exists

Model in [cairns.md](cairns.md), standing and outranking this note. Drop
behaviour inherits #81 and #75; the lightbox is #55's, unchanged.

## The main path

1. A cairn's detail face is open.
2. Drag an image over the app. The drop overlay appears, and its copy changes to
   name the target: **Add a photo to Ellery Creek camp**.
3. Drop. The image uploads with its thumbnail.
4. The detail face shows the image where it was previously absent, and the cairn's
   marker updates in place.

Nothing about the cairn's location is asked, because nothing about it is in
question. That is the whole difference from #155's import.

## The drop overlay says where it will land

The overlay is the one thing standing between "import five photos" and "attach
one photo", and those produce very different results from an identical gesture.
So it names its target rather than describing the gesture:

| Context | Overlay copy |
|---|---|
| List face open | `Drop photos to import them as cairns` |
| A cairn's detail open | `Add a photo to <cairn name>` |
| A cairn's detail open, cairn already has one | `Replace the photo on <cairn name>` |

Names longer than the overlay are truncated with an ellipsis at its width; the
sentence never wraps to two lines.

## States

| State | Detail face | Marker |
|---|---|---|
| Uploading | Image slot shows a `--surface-lift` block at 4:3 with `uploading…` in `--mono` `--text-xs` `--text-muted`, centred | Unchanged |
| Success | Image fades in over `--motion-base` | Updates in the same frame as the face |
| Failure | Image slot returns to absent; a `--danger` line beneath reads `Couldn't add the photo — try again.` | Unchanged |
| Replacing | Existing image stays visible under the uploading treatment at `opacity: .4` | Unchanged until success |
| Disconnected (#73) | Drop refused up front: `Sign in to keep photos.` | Unchanged |

**Failure leaves the cairn exactly as it was.** A cairn whose original uploaded
and whose thumbnail did not is a failure, not a half-present image — the
`both, or neither` rule from #110, applied here.

## Edge cases

- **More than one image dropped onto an open cairn.** The first attaches. The
  rest are reported as #75 failure rows reading `only one photo per cairn`. They
  are *not* silently imported as new cairns: the gesture was aimed at a cairn,
  and quietly doing something else with four files is worse than refusing them.
- **A non-image file dropped onto an open cairn.** Refused by
  `validateImageFile`, as today.
- **Replacing an image.** The previous original and thumbnail are trashed only
  *after* the replacement's two uploads both succeed, so a failed replace does
  not destroy what was there.
- **The cairn is deleted mid-upload** (from another surface). The upload is
  abandoned and its files trashed; no orphaned Drive files.
- **The photo carries EXIF GPS.** Ignored for position — the cairn already has
  one, and `cairns.md` forbids moving it. Recorded on the record's
  `gpsTimestamp` / `dateTimeOriginal` as #50 requires, but the position is not
  touched and `positionSource` does not change.
- **The cairn has no date and the photo has one.** The date is filled. This is
  the only field other than `image` that an attach may write.

## The marker changes, and that is the confirmation

Per [cairns.md](cairns.md)'s marker rule, attaching an image to a cairn with an
icon adds a camera badge; attaching to a cairn with no icon turns its pin into a
thumbnail. Both happen in the map and in the cairn's row together.

That change *is* the success feedback. No toast — the thing you were looking at
became the thing you wanted, which is the same stance #81 takes when a draft
route collapses into a dot.

## Copy

| Where | String |
|---|---|
| Overlay, attach | `Add a photo to <name>` |
| Overlay, replace | `Replace the photo on <name>` |
| Uploading | `uploading…` |
| Failure | `Couldn't add the photo — try again.` |
| Extra files refused | `only one photo per cairn` |
| Disconnected | `Sign in to keep photos.` |

## New tokens

None.

## Accessibility

- The uploading state sets `aria-busy` on the image slot.
- The failure line is in an `aria-live="polite"` region — a drop's outcome is not
  announced by anything else.
- The attached image's `alt` is the cairn's name, since here the image *is* the
  content rather than a decorative stand-in beside a filename.
