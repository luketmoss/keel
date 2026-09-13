# 339 — adding a photo without a drag

Standing documents, all outranking this note: [cairns.md](cairns.md) (the
`image` attribute, the marker rule, "one image per cairn"),
[shell-and-content-model.md](shell-and-content-model.md) (the column, the two
detail faces, the phone sheet), [design-language.md](design-language.md)
(tokens, interaction states, hit targets).

Prior notes this inherits rather than revises:
[157-photo-onto-a-cairn.md](157-photo-onto-a-cairn.md) — **the note this
completes**, and whose states, copy and edge cases are reused whole —
[197-seeing-the-photo.md](197-seeing-the-photo.md) (the image column, and the
decision this note deliberately does not overturn),
[196-editing-a-cairn.md](196-editing-a-cairn.md) (the fields the face owns),
[294-a-cairn-without-a-photo-expands.md](294-a-cairn-without-a-photo-expands.md)
(how an icon-only cairn's face is reached at all),
[133-editing-a-loose-item.md](133-editing-a-loose-item.md) (the loose face),
[338-importing-without-a-drag.md](338-importing-without-a-drag.md) (the rule
below, and the precedent for the control).

## The one idea, again

**Every gesture that writes data needs a control in the panel.**

#338 established it for the world view's import. This is the second instance
and the one the request actually started from: #157 specified adding a photo to
an existing cairn, built it, and reached it only by dragging. On a phone the
journey works right up to the last step — long-press to drop a campsite, tap
its row to open the face — and then stops.

This note adds the control. **It adds no behaviour.** Everything after the file
is chosen is #157's, unchanged: `attachImage`, the `uploading…` treatment, the
failure line, the replacement ordering, the EXIF rules, the marker update.

## Where the control goes

**In the detail column, as an action — not as an empty image slot.**

The tempting design is to always render the image slot and make the empty one a
dashed drop-target reading `Add a photo`. It is rejected, and the reason is a
prior decision rather than taste: #197 deliberately renders **no image column
at all** for an icon-only cairn, which is what lets the lightbox narrow to
`--panel-width` for a cairn that is not a photograph. A permanent empty slot
overturns that, makes the narrow case wide again, and spends the face's most
valuable space on an absence.

So the control sits with the face's other actions, in the same place whether or
not the cairn has an image. One location, one label that changes with state —
predictable, and it does not move under the user when an attach succeeds.

| Face | Where |
|---|---|
| `Lightbox` (a cairn in a trip) | In `.lightbox__detail`, directly above `Remove from trip` |
| `LooseFace` (a loose cairn) | After the `What is this place` icon grid, in the same actions area |

### The control

| Property | Value |
|---|---|
| Form | A full-width button, matching `.lightbox__remove-from-trip`'s treatment |
| Ground | `--surface-lift`, `--text` label, `--radius-sm` |
| Padding | `--space-2` `--space-4`, and a `min-height` of `--hit-target` |
| Hover / Pressed | `--hover` / `--pressed`, as its neighbour |
| Font | `--text-sm` |

Behind it, a hidden `<input type="file">` — **not `multiple`**, because
`cairns.md` allows one image per cairn and offering a multi-selection that is
then mostly refused is a worse answer than not offering it.

`accept=".jpg,.jpeg,.png,.webp"`. Narrower than #338's list, which had to admit
tracks and archives; a cairn takes a photograph. Concrete extensions rather
than `image/*` for the same reason #338 gives — it is what gives iOS its best
chance of handing back a JPEG from the library.

**No `capture` attribute.** It forces the camera and removes the library.

## Copy

#157 already wrote these strings for the drop overlay. They are reused verbatim,
because the two gestures do the same thing and a second vocabulary for one
action is how copy drifts.

| Case | String |
|---|---|
| Cairn has no image | `Add a photo` |
| Cairn has an image | `Replace the photo` |
| Uploading | `uploading…` — #157's, unchanged |
| Failure | `Couldn't add the photo — try again.` — #157's, unchanged |
| Signed out | `Sign in to keep photos.` — #157's, unchanged |

The overlay's longer forms (`Add a photo to <name>`) stay the overlay's: a drop
needs to name its target because the gesture is aimed from a distance and could
mean something else. A button inside a cairn's own face is already unambiguous,
and repeating the name there is a caption on the thing you are looking at.

## States

| State | The control |
|---|---|
| Rest, no image | `Add a photo` |
| Rest, has an image | `Replace the photo` |
| Hover / Pressed | `--hover` / `--pressed` |
| Focus | The global 2px `--accent` outline at 2px offset |
| Uploading | Disabled, per the language's Disabled treatment. The face's image slot carries the progress — #157 already specifies it, and a second spinner on the button would be two answers to one question |
| Signed out (#73) | Disabled, with #157's `Sign in to keep photos.` The face's other writing controls (`IconPicker`, the text fields) already take this treatment, so the control is consistent with its neighbours rather than inventing a refusal of its own |
| Chooser open | Rest. The OS owns the screen |

**Disabled while signed out, unlike #338's import control.** The two are
opposite on purpose, and the reason is the same rule read in both directions:
#338 stays enabled because half of what it does (the track draft) genuinely
works while disconnected. Nothing here does — an attach is a Drive upload and
nothing else — so the honest treatment is Disabled, which is also what every
other writing control on these two faces already does.

## Edge cases

- **The chooser is dismissed with nothing chosen.** Nothing happens.
- **The same file is chosen twice in a row.** The second attach runs. The
  input's `value` is cleared on every change — without it a browser fires no
  second `change` event. #338 learned this one the hard way: the test that was
  meant to cover it asserted `input.value === ''`, which is true whether or not
  the handler clears it. Assert the assignment, not the value.
- **An unsupported type is chosen.** `validateImageFile`'s existing refusal, on
  the face's existing `attachError` line.
- **An HEIC is chosen.** Whatever #344 leaves it as. That issue — the refusal
  arriving only after the user places the photo — was found during #338's
  `/test` run and is unresolved; this note does not pre-empt its answer, and
  the attach path may not even share the defect, since an attach does no
  position resolution at all. **Worth checking during `/develop`, and saying
  which it is.**
- **The cairn already has an image.** Replace. #157's ordering stands: the old
  original and thumbnail are trashed only after both new uploads succeed.
- **The photo carries EXIF GPS.** Ignored for position. The cairn has one and
  `cairns.md` forbids moving it. #157's rule, and this control is not a new
  path to break it.
- **The cairn has no date and the photo has one.** The date is filled. Still
  the only field other than `image` an attach may write.
- **An attach fails.** The cairn is exactly as it was, and for a cairn that had
  no image the slot disappears again — `LooseFace` already comments on this
  behaviour and it is unchanged.
- **The face is open on a phone sheet.** The control is a row inside the face
  and inherits the sheet's scrolling. No detent change — #258's rule that the
  detail keeps its detents is untouched.

## New tokens

**None.** `--hit-target`, `--surface-lift`, `--radius-sm`, `--space-2`,
`--space-4`, `--text-sm`, `--hover` and `--pressed` all exist and are all
already used by the button this one is modelled on.

## What was measured, and what was not

**Not measured, and this note says so rather than implying otherwise.** The two
detail faces could not be driven in a browser in this environment: seeding
`cairn.loose.index` and opening `/cairns/<id>` renders `Not found`, because the
face needs a hydrated session the local seed does not produce. #338's panel
measurements were possible because the world list renders with no session at
all; these faces do not.

So the control's dimensions are **matched to an existing neighbour rather than
discovered**: `.lightbox__remove-from-trip`'s own padding and treatment, plus
the `--hit-target` minimum #338 measured as the panel's real button standard
(`New trip` renders at exactly 40px). The one criterion asserting a quantity —
the hit target — is therefore a specification to be verified at `/test`, not a
measurement already taken. **`/test` should read it off the running app if it
can get a session, and say plainly if it cannot.**

There is no fit question of the kind #338 had: this is a full-width button in a
single-column face, not a fourth item competing for a fixed-width row.

## Decisions taken here

- **An action in the detail column, not a permanent empty image slot.** #197
  decided the image column is absent for an icon-only cairn; overturning that
  to gain an affordance would make the narrow face wide for every cairn that
  is not a photograph.
- **One location, label changes with state.** `Add a photo` / `Replace the
  photo` in the same place, so the control does not move when an attach
  succeeds.
- **Disabled while signed out** — the opposite of #338's control, for a reason
  stated above, and consistent with every other writing control on these faces.
- **Single file.** One image per cairn is `cairns.md`'s, and an input that
  accepts five to refuse four is a worse refusal than not offering it.
- **#157's copy reused verbatim**, in its short form.

## Out of scope

- Everything behind `attachImage`. The diff should not touch `photo/` or
  `store/` — the same mechanical check #338 used for its own scope line.
- #344's HEIC timing.
- Removing a photo from a cairn; taking one with the camera; more than one
  image per cairn.
- The row's `⋮` menu. A second entry point is a reasonable thing to want and is
  its own issue — this note puts the control where the result appears, once.
