# 313 — a map tap raises the sheet

The sheet already rises when a row opens something. It should rise when a
marker does, because they are the same gesture on two surfaces.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md)
(the sheet, its detents, and that a marker and its row are one object),
[cairns.md](cairns.md) (the marker), [design-language.md](design-language.md)
(`--motion-base`, the reduced-motion rule). Prior notes:
[258-detail-keeps-its-detents.md](258-detail-keeps-its-detents.md) —
**required**, it owns the peek promotion and the argument for it —
[112-phone-bottom-sheet.md](112-phone-bottom-sheet.md) (the detents and the
settle), [250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) (the
marker-behaves-like-the-row contract, and the inline preview this is about
seeing), [270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the reveal that follows, and its "the detent it settles at *after* the click"),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) (the
cluster, and what its own tap does),
[293-clicking-a-cairn-in-3d.md](293-clicking-a-cairn-in-3d.md) (the same tap in
3D), [269-emphasising-a-track-on-the-map.md](269-emphasising-a-track-on-the-map.md)
(the track selection a route tap makes).

## Why

> *"Clicking photos or cairns should pop the menu open to min size to display
> the item so I don't have to manually make it bigger to see the preview or
> details."*

#258 already made this argument for a row: a detail at peek "shows a header and
nothing actionable — activating a row and getting a sliver reads as the tap
having failed". #250 made the matching promise for the map: "a marker click
does exactly what that cairn's row click does". Today only one of the two can
move the sheet, so the promise is broken exactly where the map is the surface
the user is on.

## The rule

> **A map gesture that selects something promotes the sheet from peek to half.
> Nothing else about the sheet changes, and the sheet never lowers.**

| Detent when the marker is tapped | Detent after |
|---|---|
| Peek | Half |
| Half | Half |
| Full | Full |

Identical to #258's table, deliberately: this issue adds a second trigger to
one behaviour rather than a second behaviour. Half is *minimum size to see it*
— a cairn's expanded row with its inline preview does not fit in
`--sheet-peek`, which holds a header and one collapsed row.

## What counts as a selecting tap

| Gesture | Sheet |
|---|---|
| A cairn marker, 2D | Promotes |
| A cairn marker, 3D (#293) | Promotes |
| A cairn fanned out of a cluster (#194) | Promotes |
| A loose cairn or loose track marker on the world map | Promotes |
| A track's route hit line (#270) | Promotes |
| A cluster that zooms to fit its members (#194) | **No change** — nothing was selected |
| A cluster that expands in place because it cannot separate (#194) | **No change** — the fan is the answer, and picking from it is the next tap |
| An occluded 3D marker (#285) | No change — the tap does not land |
| Empty map, terrain, sky | No change, and no selection cleared |
| The end of a marker drag (#158) | No change — `consumeDragClick` swallows it first |
| A second tap on the already-expanded cairn's marker | No change. The row collapses (#250) and the sheet stays where it is |

The dividing line is one sentence: **the sheet moves for a tap that answers
*which one*, not for a tap that asks it.**

## The main path

1. The sheet is at peek over an open trip. The map has most of the screen,
   which is why the user lowered it.
2. Tapping a cairn marker selects it, expands its row (#250) and scrolls that
   row into view (#250's existing behaviour, unchanged).
3. **The sheet settles at half**, over `--motion-base` with `--ease` — the same
   settle a drag release uses.
4. The reveal (#270) runs against half: the cairn is centred in the band the
   half-height sheet leaves, never behind the sheet that is arriving.
5. The user reads the preview, then drags back to peek and taps the next
   marker. The sheet rises again — this is a sequence, and each tap is a fresh
   answer to *which one*.

Step 4 is the only ordering constraint in the issue: the reveal reads the
**target** detent, not the height mid-animation. #270 already requires this
("the sheet's height at the detent it settles at *after* the click"); a map tap
is now a second thing that makes the two differ.

## What the promotion is not

**It is not restored.** #258's promotion is undone when the detail closes,
because something closed. Here nothing closes — the user tapped a marker, they
did not open a modal — so half is simply where the sheet is now, and lowering
it is theirs to do. A promotion that sprang back would take the preview away
while they were reading it.

**It does not stack with #258's.** Tapping a loose item's marker on the world
map both opens a face and selects it; that is one promotion to half, not two
moves, and the restore #258 records for the face is unaffected.

## States

| State | A selecting map tap does |
|---|---|
| Sheet at peek | Promotes to half, then reveals against half |
| Sheet at half or full | Reveals; the sheet does not move |
| Mid-drag on the grabber | Nothing — the drag owns the sheet, and the settle that follows is the user's |
| A decision open (draft, queue, create) | Nothing. Detents are suspended and reveal is suspended (#258, #270) |
| Peek unavailable — landscape (#112) | Nothing to promote from; the sheet is already at half or full |
| Disconnected (#73) | Promotes normally. Reading writes nothing |
| Desktop (≥720px) | No sheet, no change |
| Reduced motion | The promotion is a cut |

## Edge cases

- **Tapping the marker of the cairn that is already selected.** The row
  collapses per #250 and the sheet does not move — including from peek, where
  the user has just been shown it once and is now putting it away.
- **Rapid taps down a row of markers.** Each selects and reveals; the first one
  promotes and the rest find the sheet already at half. One settle, not five.
- **A tap that lands while the sheet is animating** from a previous promotion.
  The detent is already half; nothing further happens.
- **A route tap on a track whose row is far down a long list.** The row scrolls
  into view inside the raised sheet, as it does from any other selection.
- **A cairn filtered out by a facet** cannot be tapped — it is not drawn.
- **The keyboard is open** on a name or description field (#196). Out of scope
  here, exactly as #258 left it; the sheet's keyboard rule is still unbuilt and
  this issue does not build it.
- **A marker tap in 3D while the 2D list is behind it.** No difference: the
  same select-then-open pair runs (#293), so the same promotion follows.

## Transitions

| What | Duration |
|---|---|
| The promotion settle | `--motion-base`, `--ease` — identical to #258's |
| The reveal that follows | `--motion-slow`, `--ease` — #270's, unchanged |

They overlap deliberately. Sequencing them would make the map wait on the
sheet, and the tap would read as slow.

Under `prefers-reduced-motion: reduce` both are cuts.

## Copy

**None.** The detent announcement — `Peek` / `Half` / `Full` on the grabber's
polite live region — already fires on any detent change and now fires for this
one too. No new strings, no toast, nothing said about why the sheet moved: the
preview arriving is the explanation.

## New tokens

**None.** `--sheet-peek`, `--sheet-half`, `--motion-base` and `--ease` all
exist, and the promotion reuses the mechanism `BottomSheet` already has for
#258 rather than adding a second path that moves the sheet.

## Decisions taken here

- **Half, not full.** Full buries the map on the very gesture that proves the
  user is working from it. Half is the smallest detent that shows a cairn's
  expanded row with its preview, which is what "min size" means here.
- **Never lowers.** A user at full who taps a marker is reading a list; taking
  their list away to show the map would be the mirror of the bug.
- **Not restored.** Nothing closes, so there is nothing to restore from — see
  *What the promotion is not*.
- **A cluster zoom does not promote.** It selects nothing, and a sheet that
  rose for it would cover the map at the moment the user is trying to find one
  cairn among several.
- **Route taps are included.** #270 made a route a track's other
  representation; leaving it out would mean tapping a track works from the list
  and half-works from the map.
