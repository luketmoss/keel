# 347 — attaching a photo while the cairn is still a draft

Standing documents, all outranking this note: [cairns.md](cairns.md) (one image
per cairn, the marker rule, the position rule), [design-language.md](design-language.md)
(field labels, states, tokens), [shell-and-content-model.md](shell-and-content-model.md)
(the panel's faces).

Prior notes this extends rather than revises:
[156-creating-a-cairn.md](156-creating-a-cairn.md) — **the face being added
to**, whose field idiom, draft stance and ownership readout are reused whole —
[339-adding-a-photo-without-a-drag.md](339-adding-a-photo-without-a-drag.md)
(the control, the input's attributes, the two labels),
[157-photo-onto-a-cairn.md](157-photo-onto-a-cairn.md) (everything behind the
attach, and the EXIF rules),
[155-cairns-replace-photos.md](155-cairns-replace-photos.md) (the opposite
journey, which starts from photos), [346-editing-a-cairn-from-its-row.md](346-editing-a-cairn-from-its-row.md)
(the sibling issue, and the file input this note also uses).

## The one idea

**A cairn with a photograph is the ordinary cairn, and the face that creates
cairns cannot make one.**

`cairns.md`: *"'photo' is not a kind. Photos and points of interest are one
cairn — something at a coordinate, carrying an optional image and an optional
icon."* The create face offers the icon and refuses the image. So the thing the
app exists for — a photograph at a place — is the one thing you cannot place in
one go.

This note adds a field. **It adds no new attach behaviour**: the upload is
#157's `attachImage`, run once against the record the save just made.

## Where it goes

After `DATE`, before the ownership readout. It is a field, written the way the
face's other fields are written — `PHOTO` in `--text-xs` `--mono` uppercase
`--text-muted`, its control beneath.

**Before the readout, not after it.** The readout and the `Sign in to keep
cairns.` line are the face's closing argument — what is about to happen and
whether it can — and a field below them reads as an afterthought bolted under
the summary.

```
DATE
[ 14/08/2026 ]

PHOTO
┌──────────────────────────────┐
│                              │
│      [ the chosen image ]    │   4:3, --radius-sm
│                              │
└──────────────────────────────┘
IMG_4417.JPG
[ Replace the photo ]  [ Remove ]

positionSource placed
trip null  (nothing was open — this will be loose)

  Create        Cancel
```

With nothing chosen the block collapses to the single button #339 already
draws:

```
PHOTO
[ Add a photo ]
```

**The preview is shown, not just the filename.** A filename is not evidence you
picked the right photograph, and this is the one moment before the commit when
being wrong is free. It is rendered from a `URL.createObjectURL` of the chosen
`File`, revoked when the choice changes and on unmount — nothing is uploaded
and nothing is read out of the file but its pixels.

4:3 at the face's content width, `--radius-sm`, on `--surface-lift` while it
loads — the same slot shape `LooseFace` and the lightbox already use, because
this is a preview of exactly what those will show.

The filename beneath it in `--text-xs` `--mono` `--text-muted`, ellipsised at
one line. It is the thing that tells two similar photographs apart.

## The control

`AddPhotoButton`, reused. Same hidden `<input type="file">`: not `multiple`,
`accept=".jpg,.jpeg,.png,.webp"`, no `capture`, `value` cleared on every
change. Same two labels, driven by the same predicate — which here reads *has a
file been chosen*, not *does the record have an image*, because there is no
record yet.

`Remove` sits beside `Replace the photo` once a file is chosen, taking the
`Cancel` button's treatment rather than `--danger`: nothing has been written, so
there is nothing to destroy.

## The draft holds a `File`

The chosen file joins `CairnDraftFields`. Everything that already follows from
that is the behaviour this note wants and does not have to specify twice:

- **Cancel discards it.** The draft is dropped; nothing was ever uploaded.
- **Escape is Cancel**, as #156 says.
- **A re-place keeps it.** #156: *"the existing draft is replaced by a pin at
  the new coordinate; typed values are kept."* A chosen photo is a typed value.
  A mis-click during placement is still more likely than a deliberate second
  cairn, and re-choosing the photo to fix a coordinate would be the same wrong
  tax the name was spared.
- **Nothing touches Drive until `Create`.**

## The commit is two writes, in one order

1. The cairn is written, exactly as today.
2. If a file was chosen, it is attached to the record that write returned.

**The cairn first, and the cairn is the success.** A photo that fails to upload
is not a reason to refuse the cairn — the coordinate, the name and the icon are
the part that cannot be recovered by trying again, and the photo is still
sitting in the library where it was.

**Which means the trip path has to give back what it made.**
`TripDetail.createCairnHere` narrows `useCairnImport.createCairn`'s
`CairnRecord | null` to a `boolean` on its way to `App`'s `tripCreateRef`, and
there is no way to attach to a record whose identity was thrown away one
function earlier. Widening that return is the single structural change in this
issue. The loose path already hands back its record.

**The face closes when the cairn is written**, not when the photo lands — the
loose path still navigates to the new cairn's face, the trip path still lets
its list pick the cairn up. The upload continues behind it and the cairn's
marker and row gain the image when it finishes, per `cairns.md`'s marker rule.
That change *is* the confirmation, which is #157's stance and #81's before it.

**The position is never touched.** EXIF GPS is ignored: a person put the pin
there, `positionSource` is `placed`, and `cairns.md` forbids moving it. The
date is the one field the attach may fill, and only when the draft committed
without one — #157's rule, unchanged, and the reason this note does not read
EXIF on the face.

## States

| State | The face |
|---|---|
| Just opened | `PHOTO` with `Add a photo` beneath it. Name focused, as #156 |
| A file chosen | Preview, filename, `Replace the photo` · `Remove` |
| A file refused | The block returns to `Add a photo`; `validateImageFile`'s message on the face's existing error line |
| Saving the cairn | `Create` reads `Saving…`, as today; both photo controls disabled |
| Uploading the photo | Not seen — the face has closed. The cairn's marker and row carry it |
| Disconnected (#73) | `Create` Disabled with `Sign in to keep cairns.`; **the photo control stays enabled** |
| Cairn failed | `Couldn't save this cairn — try again.`, as today. The chosen photo is kept |
| Cairn saved, photo failed | The face is gone. A toast: `Couldn't add the photo — <name> was saved without it.` |

**The photo control stays enabled while signed out**, and this is the one place
this note deliberately disagrees with #339. There, the control *was* the write,
so a control that cannot write is Disabled. Here it writes nothing — it fills in
a draft field, and #156 is explicit that *"the form still fills in"* while
disconnected, with only the commit refused. Disabling it would make the create
face refuse to accept typing in one field and not the others.

**A toast for the partial failure, and only for it.** #157 is right that success
needs no toast — the marker changing is the confirmation. A failure after the
face has closed has no surface left to appear on, and the app already uses a
toast for exactly this shape (`Couldn't save ${item.name} — try again.`). The
toast names the cairn because by then it is one row among others.

## Copy

| Where | String | Source |
|---|---|---|
| Field label | `Photo` | new, matching `Name` / `Description` / `Date` |
| Nothing chosen | `Add a photo` | #339's `ADD_PHOTO_LABEL` |
| A file chosen | `Replace the photo` | #339's `REPLACE_PHOTO_LABEL` |
| Clear the choice | `Remove` | new |
| Refused type | `validateImageFile`'s existing messages | #155 |
| Saving | `Saving…` | #156, unchanged |
| Cairn failed | `Couldn't save this cairn — try again.` | #156, unchanged |
| Photo failed after the save | `Couldn't add the photo — <name> was saved without it.` | new |
| Disconnected | `Sign in to keep cairns.` | #156, unchanged |

`Remove`, not `Remove the photo` — the button sits directly beneath the
photograph it removes, and the longer phrase would be a caption on the thing you
are looking at. It is also not `Clear`: every other exit in this app is named
for what it does to the thing, not to the field.

## Edge cases

- **The chooser is dismissed with nothing chosen.** Nothing happens; any file
  already chosen is kept. Dismissing a chooser is not a `Remove`.
- **The same file is chosen twice.** The second choice replaces the first. The
  input's `value` is cleared on every change, so the second selection fires at
  all — #339's trap, and the test for it must assert the assignment rather than
  `input.value === ''`.
- **An unsupported type or an HEIC.** Refused at the moment it is chosen, on
  the face, with nothing written and no pin moved. This is the ordering #344
  exists about, and this path gets it right for free by validating before the
  commit rather than inside it — worth saying plainly at `/develop` that this
  issue does not fix #344 for the import paths it is actually about.
- **`Create` pressed with the name empty and a photo chosen.** #156's rule is
  unchanged: the name commits as the icon's label, or `Cairn`. A photo does not
  become the name.
- **A cairn created with no date and a photo carrying one.** The date is
  filled by the attach — #157's one permitted extra field.
- **A photo carrying EXIF GPS far from the pin.** The pin wins, silently. The
  gesture placed it, and a photograph is not an argument about where you are
  standing.
- **Cancel while the file chooser is open.** The OS owns the screen; the face
  is gone when it returns and the selection lands nowhere. The draft is the
  only thing that could have held it and it no longer exists.
- **The app is navigated away from mid-upload.** #157's rule: the upload
  continues or is abandoned by its own path, and no orphaned Drive files are
  left. Nothing here changes it.
- **A very large image.** Whatever `attachImage` already does. The face has
  closed and the queue is elsewhere; this issue does not add progress reporting
  it did not have.
- **Touch.** `Add a photo`, `Replace the photo` and `Remove` are all at least
  `--hit-target` tall, like the icon grid above them.
- **The phone sheet.** The field is a row inside the face and inherits the
  sheet's scrolling. The preview makes the face taller, which is what scrolling
  is for. No detent change — #258's rule stands.

## New tokens

**None.** `--radius-sm`, `--surface-lift`, `--hit-target`, `--text-xs`,
`--mono`, `--space-2` and `--space-4` all exist and are all already used by the
fields this one sits beneath.

## What was measured, and what was not

**Not measured, and this note says so rather than implying otherwise.** No
criterion in the issue asserts a quantity — no width, no hit target, no count —
so there is nothing here for a `getBoundingClientRect()` to settle. Every
criterion is behavioural.

The preview's 4:3 and the face's content width are taken from the slot
`LooseFace` already draws rather than discovered, the same way #339 matched its
button to an existing neighbour. If the preview turns out to push `Create` off
a short phone screen, that is a real finding for `/test` to make by looking, and
the answer would be a shorter preview rather than a different field.

## Decisions taken here

- **The cairn is written first and is the success**; the photo failing does not
  refuse it or roll it back.
- **The face closes on the cairn's write**, not the photo's — the marker
  changing is the confirmation, per #157.
- **A toast, and only for the partial failure.**
- **A preview, not just a filename.** The last free moment to notice you picked
  the wrong photograph.
- **The photo control stays enabled while signed out** — the opposite of #339,
  because here it writes nothing.
- **The draft holds a `File`**, so cancel, escape and re-place all follow from
  #156 without a second rule.
- **`createCairnHere` widens** to return the record it made.

## Out of scope

- Reading EXIF on the face to prefill the date. The attach still fills an
  absent date, which is #157's and costs nothing.
- More than one photo per cairn.
- The camera. #339's reason for omitting `capture` stands.
- The placement queue (#155), which starts from photos and arrives at the
  opposite end of this journey.
- #344's HEIC timing on the import paths.
- The row menu's entry points (#346).
- Progress reporting for the upload, which the attach has never had.
