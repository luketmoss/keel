# 258 — a detail face keeps its detents

**Revises** [shell-and-content-model.md](shell-and-content-model.md)'s Mobile
section (standing, and therefore the sentence that actually governs) and
[112-phone-bottom-sheet.md](112-phone-bottom-sheet.md)'s states table. Both say
a detail face takes the sheet to full; this note says it does not.

Standing documents: [design-language.md](design-language.md) (tokens),
[shell-and-content-model.md](shell-and-content-model.md) (the column, the sheet,
the detents).

## The change, in one sentence

The sheet's detents are suspended by **decisions** — an import draft, the
placement queue, the cairn-create panel — and by nothing else; a trip, a loose
item and a track face are places, and a place you cannot lower is a place that
has taken the map away.

## The amendments

`shell-and-content-model.md`, Mobile section. Replace:

> Draggable, snapping under `--motion-base`. Opening anything goes to full.

with:

> Draggable, snapping under `--motion-base`. Opening a **decision** — an import
> draft, the placement queue, the cairn-create panel — goes to full and
> suspends the detents until it closes. Opening a **place** — a trip, a loose
> item, a track face — changes the face and leaves the detent alone, except
> that peek is promoted to half so the face is not a sliver.

`112-phone-bottom-sheet.md`, states table. Replace the `Detail open | Full` row
with:

| State | Sheet |
|---|---|
| Detail open | Unchanged, or half if it was at peek |
| Draft, queue or create open | Full, detents suspended |

and, in "The main path", replace step 4 —

> 4. Activating a row takes the sheet to full and swaps to that detail face.

with:

> 4. Activating a row swaps to that detail face at the detent the sheet is
>    already at, promoting peek to half.

Step 5's rule — Back returns to the detent the sheet was at before the detail
opened — stands, and now has almost nothing to do: since opening only ever
moves the sheet in the peek case, Back undoes the promotion and nothing else. A
drag the user made *inside* the detail is theirs, and Back never undoes it.

## The main path

1. The sheet is at half over a trips list. Map above, list below.
2. Activating a trip row swaps the sheet's contents to the trip's face. **The
   sheet does not move.** The search card above it swaps to the trip's name and
   a Back control; the chips disappear, as they already do on a detail.
3. Dragging the grabber lowers the sheet to peek. The trip's tracks and cairns
   are still drawn on the map, which now has the rest of the viewport.
4. Dragging it back to full shows the whole list of tracks and cairns.
5. Back returns to the list face at the detent the sheet is currently at —
   half, here, since the user did not move it. Had they opened the trip from
   peek, Back would put them back at peek.

Nothing in steps 2–5 is a new interaction. It is the list face's behaviour,
extended to the face it was already extended to everywhere except here.

## States

| State | Sheet | Grabber |
|---|---|---|
| List | Peek, half or full | Live |
| Trip detail | Peek, half or full | Live |
| Loose item detail | Peek, half or full | Live |
| Track face inside a trip | Peek, half or full | Live |
| Import draft | Full | Inert |
| Placement queue | Full | Inert |
| Cairn create | Full | Inert |
| Dragging | Follows the pointer, no transition | — |

"Inert" is today's behaviour and is unchanged: the grabber ignores pointer and
key input while a decision is open. It stays rendered rather than hidden so the
sheet's top edge does not change shape when a draft opens.

## Opening a detail: the detent rule

| Detent when the row is activated | Detent after |
|---|---|
| Peek | Half |
| Half | Half |
| Full | Full |

Peek promotes because a detail face at peek shows a header and nothing
actionable — activating a row and getting a sliver reads as the tap having
failed. Half and full are left exactly alone: the user put the sheet there.

The promotion animates as a settle, `--motion-base` with `--ease`, the same
transition a drag release uses. Under `prefers-reduced-motion: reduce` it is a
cut, per the standing reduced-motion rule.

**Why not always open at half?** Because it throws away a deliberate full. A
user who dragged the sheet up to read a long list and then opened one of its
rows wants that list's detail at the same size, not shrunk.

## What a detail shows at peek

Nothing new is drawn. The search card floats above the sheet at every detent
and already carries the trip's name and its kind, so a detail lowered to peek
still says what it is without the sheet contributing anything. Below the
grabber, `--sheet-peek` of the detail face's own body shows — for a trip, its
metadata header and the start of its stats.

This is the same deal the list face gets at peek ("header, chips and the first
row visible") and is why this issue adds no peek-specific layout.

## Edge cases

**A decision opens while a detail is showing at peek.** The draft, queue or
create panel takes the sheet to full and suspends the detents, as today. On
close, the sheet returns to peek — the detent it was at before the decision.
The existing restore already stores this; it now stores a detail's detent as
well as a list's.

**Back pressed after dragging the detail down to peek.** Returns to the list
face, still at peek. The sheet does not rise to announce the change; the face
swapping is the announcement, and raising it would take back the map the user
just uncovered. The peek-promotion restore does not fire here, because the
user's own drag disowns it — the sheet only ever undoes moves *it* made.

**Rotation to landscape while a detail is at peek.** Peek is dropped when
`--sheet-peek` no longer fits in half the viewport (#112), and the sheet falls
back to half. Unchanged, and it now applies to a detail face too.

**The keyboard opening on a detail's name or description field** (#196).
#112's rule — the sheet goes to full and holds there until the field blurs —
was specified and never built, for the search field or for anything else. This
issue does not build it either: it is a separate bug, and a detail whose
detents work is not made worse by it. When it is built, it applies to a detail
face the same way, and the detent it returns to is the one the detail was at.

**A detail whose content is shorter than the detent** — a trip with one track.
The sheet keeps its detent height and the list ends. Sizing the sheet to its
content would make opening a trip resize the map.

**Scroll position across detents.** Preserved, as on the list. Lowering the
sheet to check the map and raising it again returns to the same row.

**Crossing 719px while a detail is open at peek.** The desktop column takes
over and shows the same detail face; the detent is remembered and applies again
on the way back. Nothing closes, nothing reloads. Unchanged from #112 beyond
the detent now being a thing a detail can have.

## Map controls

`--sheet-current` is published by the sheet on every height change, and the map
controls and layers control read it (`MapCanvas.css`, `LayersControl.css`).
They already track a dragged sheet; they now do so while a detail is open,
because the sheet can now be dragged there. No change to either stylesheet.

## Copy

No new strings. `aria-label="Resize sheet"` on the grabber and the polite
announcement of `Peek` / `Half` / `Full` are unchanged, and now fire while a
detail is open rather than being frozen at `Full`. `aria-expanded` reflects
full, as today.

## New tokens

None. `--sheet-peek`, `--sheet-half` and `--sheet-full` keep their values —
`--sheet-full` deliberately stays at `92vh`, since the problem was that full
was inescapable, not that it was tall.
