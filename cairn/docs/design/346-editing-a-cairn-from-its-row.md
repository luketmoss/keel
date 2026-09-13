# 346 — reaching a cairn's face, and its photo, from the row

Standing documents, all outranking this note:
[shell-and-content-model.md](shell-and-content-model.md) (row anatomy, the `⋮`
rule, "loose is not lesser"), [cairns.md](cairns.md) (the marker rule, one
image per cairn), [design-language.md](design-language.md) (tokens, states, hit
targets).

Prior notes this extends rather than revises:
[193-trip-row-anatomy.md](193-trip-row-anatomy.md) — **the note that built this
menu**, whose reveal, touch and disabled rules are reused whole —
[339-adding-a-photo-without-a-drag.md](339-adding-a-photo-without-a-drag.md)
(the control, the copy, the input's attributes),
[157-photo-onto-a-cairn.md](157-photo-onto-a-cairn.md) (everything behind the
attach), [250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) and
[294-a-cairn-without-a-photo-expands.md](294-a-cairn-without-a-photo-expands.md)
(the two clicks this note is an alternative to, and does not remove),
[196-editing-a-cairn.md](196-editing-a-cairn.md) (what the face can edit once
it is open), [133-editing-a-loose-item.md](133-editing-a-loose-item.md) (the
loose row's menu, which is the shape being matched).

## The one idea

**A menu that only destroys is not a menu.**

#193 gave the trip's rows a `⋮` and moved `⤴` and `×` into it. That was the
whole of its job, and it left the cairn row with a menu whose every item gets
rid of the cairn. Meanwhile the same cairn, sitting loose in `TripsPanel`,
has `Add to a trip…`, `Rename`, `Export` and `Delete…`. The standing document
says a move between loose and owned changes ownership and nothing else; today
it costs the cairn its whole non-destructive menu.

This note adds two items. **It adds no new behaviour behind either of them**:
`Edit` calls what the expanded row's body already calls, and the photo item
calls what #339's button already calls.

## The menu

| Order | Item | Destructive |
|---|---|---|
| 1 | `Edit` | no |
| 2 | `Add a photo` / `Replace the photo` | no |
| 3 | `Remove from trip` | reversible |
| 4 | `Delete permanently…` | `danger` |

Non-destructive first, then the two exits in the order #193 already put them.
This is `LooseFace`'s and `TripsPanel`'s order too — everything you might do to
the thing, then the ways to stop having it — so a cairn's menu reads the same
whichever list it is in.

No separator between the halves. `RowMenu` has never drawn one, the loose row's
five items do without, and a rule that exists only to say *the dangerous ones
are below* is doing the job the words already do.

### `Edit`

Opens the cairn's detail face — `onOpenPreview`, the same callback the expanded
row's preview and summary buttons call, so the row and the menu cannot disagree
about what "open this cairn" means.

**It does not expand the row on the way.** #250's expansion is a peek; the face
is the thing with the fields on it, and routing through the peek would make the
menu item slower than the two clicks it exists to replace.

**Named `Edit`, not `Open`.** `Open` is the more literal description of what
happens and it is rejected: the reason a person opens this menu is that they
want to change something, and #196 made the face able to change name,
description and icon. A menu item is a question about intent, not a narration
of the mechanism. It is also the word the request used.

**One item, not four.** `Rename`, `Edit description`, `Change icon` would each
open the same face with a different field focused. The loose row gets away with
`Rename` because renaming happens *in the row*; here nothing does.

### `Add a photo` / `Replace the photo`

#339's control, reached from the row. The label follows the same predicate —
`cairns.md`'s image predicate, which `CairnRow` already computes as `hasImage`
for its glyph — so the two entry points never disagree about which word they
are showing.

Behind it, `AddPhotoButton`'s hidden `<input type="file">`: not `multiple`,
`accept=".jpg,.jpeg,.png,.webp"`, no `capture`, `value` cleared on every
change. **Reused, not re-grown.** `AddPhotoButton` renders a button beside its
input, and a menu item is not that button, so the row needs the input without
the button — which is the one structural change in this issue and is specified
below.

Everything after the file is chosen is #157's, unchanged: `attachImage`, the
EXIF rules, the replacement ordering, the marker update.

## The structural change: the input without the button

`AddPhotoButton` today is a `<button>` and an `<input>` in a fragment. The menu
needs the input's behaviour — the accept list, the single file, the `value`
reset — driven by a `RowMenuAction` instead.

**Split the file input out as `PhotoFileInput`**, and let `AddPhotoButton`
render it. The input's contract (its attributes, its `value` reset, its
one-file unwrapping) lives in one place and both callers get it; the button
keeps its labels and its disabled logic and is otherwise untouched. The
alternative — a second copy of the same four attributes inside `CairnList` — is
how #339's own note says the two faces would have drifted.

The row holds a ref to its input and the menu item calls `click()` on it, which
is exactly what `AddPhotoButton`'s own button already does.

## States

The row is the surface now, so the row carries the states the detail face
carried in #339.

| State | The row | The `⋮` |
|---|---|---|
| Rest | As today | Revealed on hover / focus-within, per #193 |
| Chooser open | Rest. The OS owns the screen | Closed — `RowMenu` closes on select |
| Attaching | `uploading…` in place of the `⋮`, in `.cairn-row__removing`'s treatment; the row stays at full opacity | Not rendered |
| Attach succeeded | The glyph becomes the thumbnail or gains the camera badge, per `cairns.md` | Back, with the item now reading `Replace the photo` |
| Attach failed | `Couldn't add the photo — try again.` beneath the row, in `.cairn-row__error` | Back, unchanged |
| Removing | `Removing…`, as today | Not rendered |
| Confirming | The inline confirm, as today | Not rendered |
| Signed out | As today | `Edit` enabled; the other three disabled |

**`uploading…` replaces the `⋮`, and the row does not dim.** `Removing…` does
both — it dims to `opacity: 0.4` because the row is about to stop existing and
is inert meanwhile. An attaching row is neither: its cairn is fine, you can
still select it, still open its face, still see it on the map. Dimming it would
say the wrong thing with a treatment borrowed for its convenience. The word
goes in the same slot because that slot is where a row says what it is doing.

**The failure line is the row's existing error slot.** `removeErrors` already
renders there and a row can only be doing one of these at a time. One line,
one place.

**`Edit` stays enabled while signed out.** Opening a face is not a write, the
face's own fields already take #73's Disabled treatment, and refusing to let
someone *look* at their cairn because Drive is unreachable would be new
behaviour invented by a menu. The photo item is disabled for #339's reason,
stated there and unchanged: an attach is a Drive upload and nothing else.

## Copy

Every string is already in the app. That is deliberate — this issue adds entry
points, and an entry point that invents vocabulary makes the app sound like two
apps.

| Case | String | Source |
|---|---|---|
| Open the face | `Edit` | new — the one new word, and see above |
| Cairn has no image | `Add a photo` | #339's `ADD_PHOTO_LABEL` |
| Cairn has an image | `Replace the photo` | #339's `REPLACE_PHOTO_LABEL` |
| Uploading | `uploading…` | #157 |
| Failure | `Couldn't add the photo — try again.` | #157 |
| The trigger's label | `Row actions for <name>` | #193, unchanged |

No longer form. #157's `Add a photo to <name>` belongs to the drop overlay,
which needs to name its target because the gesture is aimed from a distance.
A menu opened from a row whose name is six pixels away is not that, and the
menu's own `aria-label` already says whose row it is.

## Edge cases

- **The chooser is dismissed with nothing chosen.** Nothing happens.
- **The same file is chosen twice in a row.** Both attach. The input's `value`
  is cleared on every change — without it the browser fires no second `change`
  event. #339 records the trap in the test for this: asserting
  `input.value === ''` passes whether or not the handler clears it, so assert
  the assignment.
- **A second row's photo item while one is attaching.** `TripDetail` holds a
  single `attachingCairnId`, and #157 chose that deliberately — one at a time.
  The other rows' menus stay open-able but their photo item is disabled while
  any attach is in flight, so the refusal is visible before it is needed rather
  than swallowed at the callback.
- **The row's cairn is the one whose lightbox is open.** Nothing special: the
  face and the row read the same `attachingCairnId` and both show their own
  in-flight treatment. This already works, because the attach was never bound
  to the open face.
- **An unsupported type is chosen.** `validateImageFile`'s refusal, on the
  row's error line rather than the face's.
- **An HEIC is chosen.** Whatever #344 leaves it as. The attach path does no
  position resolution, so it may not share the defect at all — worth saying
  which during `/develop`, exactly as #339 was asked to.
- **The cairn is removed while its attach is in flight.** #157's rule: the
  upload is abandoned and its files trashed. The row unmounts and takes its
  menu with it; `RowMenu` already cleans up its own document listeners.
- **The facet filter hides the row mid-attach.** The row unmounts, the attach
  continues, and the result appears when the filter is cleared. Nothing is
  lost, and freezing a filter because an upload is running would be a stranger
  rule than this one.
- **Touch.** The `⋮` is already at full opacity below the tablet breakpoint
  (#193) and `RowMenu`'s items are already `--hit-target` tall. Two more items
  make the menu taller, not different.
- **The phone sheet.** The menu opens inside the sheet's scroll, as it does
  today. No detent change — #258's rule stands.

## New tokens

**None.** `.cairn-row__removing` and `.cairn-row__error` already exist and
already carry the treatments this note reuses; `RowMenu` brings its own.

## What was measured, and what was not

**Not measured, and this note says so rather than implying otherwise.** No
acceptance criterion here asserts a quantity — there is no width, no hit
target, no count to check. Every criterion is behavioural, which is what
`/test` can drive in the suite.

The one thing that would have been worth measuring is whether a four-item menu
still fits above the fold on a phone sheet, and it is not a criterion because
`RowMenu` has never positioned itself against the viewport and a five-item menu
already ships on the loose row without anyone reporting it. If it turns out to
overflow, that is `RowMenu`'s problem for every caller at once, not this
issue's.

## Decisions taken here

- **`Edit`, not `Open`** — the word for why you clicked, not for what happens.
- **One `Edit` rather than per-field items.** The face is the editor.
- **Non-destructive items first**, matching the loose row and `LooseFace`.
- **No separator** between the halves; the words carry it, as #193 established
  for colour.
- **`uploading…` in the `⋮`'s slot, without the dim** that `Removing…` gets.
- **The file input is split out of `AddPhotoButton`** rather than copied.
- **`Edit` stays enabled while signed out**; the photo item does not.

## Out of scope

- The loose cairn's row in `TripsPanel`. It never lost its menu, and its
  attach goes through `looseStore` rather than `useCairnImport` — a different
  wire for the same item, and its own issue.
- The track row's `⋮`, in a trip or out of one.
- Renaming from the row. #193 deliberately adds no edit affordance there and
  this note does not overturn it: `Edit` leaves the row and opens the face.
- Removing a photo from a cairn; the camera; more than one image per cairn.
- Everything behind `attachImage` — the diff should not touch `photo/` or
  `store/` beyond what widening a callback requires.
- #344's HEIC timing.
- Attaching a photo while creating a cairn (#347).
