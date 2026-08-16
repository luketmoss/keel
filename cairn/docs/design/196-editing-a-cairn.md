# 196 — editing a cairn's name and description

Click-to-edit on a cairn's detail face, copying the trip header's pattern rather
than inventing a second one.

Standing documents: [cairns.md](cairns.md) (the record, the empty-name rule),
[shell-and-content-model.md](shell-and-content-model.md) (loose is not lesser),
[design-language.md](design-language.md) (states, type, motion). Prior notes:
[70-trip-metadata-display.md](70-trip-metadata-display.md) — **the pattern being
copied** — [133-editing-a-loose-item.md](133-editing-a-loose-item.md),
[155-cairns-replace-photos.md](155-cairns-replace-photos.md),
[55-photo-list-lightbox.md](55-photo-list-lightbox.md),
[73-disconnected-read-only.md](73-disconnected-read-only.md).

## The pattern, restated once

Not re-designed. `TripMetadataHeader` already implements all of it, and this
note's only job is to say that a cairn's two fields behave identically.

| Step | Behaviour |
|---|---|
| Rest | The value, rendered as text, with a hover affordance |
| Click | Becomes an input holding the current value, focused, contents selected |
| Enter | Commits |
| Blur | Commits |
| Escape | Reverts; nothing is written |
| Empty commit | An aborted edit — *except for the description, see below* |
| Success | The field flashes `--accent` on its bottom edge for 300ms |
| Failure | The value reverts and a `--danger` line appears beneath the field |
| A second field clicked mid-edit | The first commits; two inputs are never open |
| Disconnected | The Disabled treatment; the click does not start an edit |

The saved flash is `TrackList.css`'s `.track-row__field--saved` —
`inset 0 -2px 0 0 var(--accent)`, transitioned over `--motion-base`. Reuse it.

## Where the fields are

On a trip-owned cairn, the detail face is the lightbox (#169). The two fields
are already there and already in the right order; they stop being static.

```
┌────────────────────────────────────────┐
│  ×                                     │
│ ‹        [ the photograph ]         ›  │
│                                        │
│   Cairn above the couloir              │  ← --text-lg / 700, click to edit
│   12 AUG 2026 · HAZARD · PHOTO         │  ← not editable
│   Loose slab, crossed high on the left │  ← --text-sm, click to edit
│                                        │
│   ▏No GPS, so it was positioned by …   │  ← not editable
│                                        │
│   WHAT IS THIS PLACE                   │
│   [ icon grid ]                        │  ← #156, unchanged
│   [ Remove from trip ]                 │
└────────────────────────────────────────┘
```

On a loose cairn it is `LooseFace`, which already edits the name. Only the
description changes there.

**The meta line is not editable here.** It is derived — date, icon, image — and
each part has its own owner: the icon grid below it, the image by dropping a
photo, and the date by nothing yet (see Out of scope).

## Name

- One-line `input`, `--text-lg`/700, `--surface-lift` fill at `--radius-sm`,
  sized to the field it replaces so the dialog does not resize.
- Trimmed on commit.
- **Empty is an aborted edit**, per `cairns.md`'s rule for the create face and
  `LocalTripStore.updateTripSync`'s for a trip. A cairn always has a name; there
  is no state where it has none, so an empty commit cannot be a save.
- No length limit and no uniqueness check. Two cairns may share a name.

## Description

- Multi-line `textarea`, `--text-sm`, `--surface-lift`, `--radius-sm`, three
  rows at rest and growing to a cap of eight before scrolling.
- **Empty is a valid value.** `CairnRecord.description` is `''`, never `null`,
  and clearing a description is a thing a person means to do — unlike clearing a
  name, which leaves the record unidentifiable. This is the one place the two
  fields differ and it is the only rule here worth reading twice.
- Trailing whitespace trimmed; internal newlines preserved.

### Enter commits; Shift+Enter inserts a newline

The alternative — Enter inserts, and committing needs a button or a blur — is
the more conventional textarea contract and it is rejected here. Every other
field in cairn commits on Enter, the descriptions this holds are one or two
lines, and a field whose commit key differs from its neighbour's is the kind of
inconsistency that gets discovered by losing an edit.

Shift+Enter is the escape hatch and it is discoverable the way it is everywhere
else: by trying it. A hint is not shown. If it turns out people write long
descriptions here, that is evidence for a change, not a reason to pre-empt one.

### The empty placeholder

A cairn with no description shows `Add a description` in `--text-muted`, italic,
in the description's own slot, clickable exactly as a value is. `Lightbox.tsx`
currently renders `No description.` — a statement rather than an invitation,
which is why an empty description reads today as a field that does not exist.

## States

| State | Name | Description |
|---|---|---|
| Populated, at rest | Value, `--text` | Value, `--text` |
| Empty, at rest | Not reachable | `Add a description`, `--text-muted`, italic |
| Hover | `--hover` fill on the field's box, `cursor: text` | Same |
| Editing | Input, focused, contents selected, global `--accent` focus outline | Textarea, focused, cursor at the end |
| Saving | The input closes immediately; the value shows optimistically | Same |
| Saved | `--accent` bottom edge, 300ms | Same |
| Write failed | Reverts; `Couldn't save — name reverted.` beneath | Reverts; `Couldn't save — description reverted.` beneath |
| Disconnected | `opacity: 0.4`, no hover response, click does nothing | Same |
| A photo is uploading onto this cairn (#157) | Editable — the fields have nothing to do with the image | Same |

**Optimistic, then written.** `setCairnIcon`'s shape: apply locally, write to
Drive, revert on failure. The user does not wait on a round trip to see their
own typing, and #73 already guarantees the write is never attempted against a
dead token.

## Copy

| String | Where |
|---|---|
| `Add a description` | The description's empty placeholder |
| `Couldn't save — name reverted.` | Under the name, on a failed write |
| `Couldn't save — description reverted.` | Under the description, on a failed write |
| `Cairn name` | The name input's `aria-label` |
| `Description` | The description input's `aria-label` |

The failure lines match `TripMetadataHeader`'s `Couldn't save — ${field} reverted.`
word for word. Two phrasings for one failure is how an app ends up sounding like
two apps.

`No description.` is removed. It said something true and useless.

## Edge cases

- **Editing while the arrow keys navigate the lightbox.** `Lightbox`'s
  document-level `keydown` listener moves to the previous or next cairn on
  `ArrowLeft` / `ArrowRight`. While either field is being edited those keys must
  move the caret instead. The listener ignores the event when its target is an
  `input` or `textarea`. This is the one real hazard in the issue and the reason
  it is written down rather than left to the implementation.
- **Escape while editing.** Reverts the field and keeps the lightbox open. It
  does **not** also close the lightbox — one Escape, one effect, innermost
  first.
- **The focus trap.** The lightbox traps Tab across `button:not(:disabled)`.
  Inputs must join that set or Tab escapes the dialog mid-edit.
- **Blur caused by closing the lightbox.** The commit fires first. Closing is
  not a cancel, and a user who types and clicks `×` means to keep what they
  typed.
- **The cairn is deleted while its description is being edited.** The lightbox
  already unmounts on `openCairnId` no longer resolving. The pending write
  resolves against a record that is gone; the store's own missing-record path
  handles it and no error is shown, because the user's intent was to delete it.
- **A name long enough to overflow.** `.lightbox__name` already ellipsises at
  one line with a `title`. Editing shows the whole value in the input.
- **A description of 4000 characters.** Scrolls at the eight-row cap. No
  truncation and no limit — Drive is holding a JSON file, not a database column.
- **Reduced motion.** The saved flash's transition collapses under the global
  block; the colour still appears and disappears.
- **Touch.** Tap is the click. The fields are at least `--row-touch` tall in
  their rest state so a tap target exists even for an empty description.

## Loose parity

`LooseFace` gains the description field under identical rules and identical
copy. Its name editing is already correct and is not touched.

This is in scope rather than deferred because the alternative is a capability
that appears when a cairn joins a trip, which is exactly the promotion
`shell-and-content-model.md` says a move is not. Two surfaces, one behaviour;
if the two implementations start to drift, that is the signal to extract the
field into a shared component, not now.

## Out of scope

Editing the date (its own control, its own decision), the icon (#156 already
ships it here), the position (#158's drag), renaming from a sidebar row (#193
deliberately adds no edit affordance there), bulk rename, and rich text.
