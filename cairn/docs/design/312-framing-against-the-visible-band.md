# 312 — framing against the visible band on phone

The reveal rule already knows the sheet is there. Every other camera move does
not, and none of them notice when the sheet moves.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md)
(the column, the sheet and its detents, the map's corners),
[design-language.md](design-language.md) (`--motion-slow` is the map camera,
the reduced-motion rule), [cairns.md](cairns.md) (what is plotted). Prior
notes: [270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
— **required, and revised here in one edge case** — it owns the three-step rule
and the visible area this note extends —
[112-phone-bottom-sheet.md](112-phone-bottom-sheet.md) (the detents and the
settle), [258-detail-keeps-its-detents.md](258-detail-keeps-its-detents.md)
(a detail can be lowered, which is what makes a moving sheet common),
[304-the-home-view.md](304-the-home-view.md) (the home framing and its Reset
control), [194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md)
(the cluster zoom), [5-track-rendering.md](5-track-rendering.md)
(`fitTracksToBounds` and its cap).

## Why

> *"On mobile the bottom menu covers the map that the items are plotted on and
> there is dead space at the top of the map that could be getting used. Maybe
> the map needs to recenter if the menu is opened or closed."*

Both halves are the same bug seen from two ends. The camera frames against the
viewport; the user sees against the band the sheet and the search card leave
behind. Everything lands low, half of it behind the sheet, and the strip across
the top stays empty because nothing ever aims at it.

## The visible band

#270's *visible area*, with the top edge finally counted:

```
┌───────────────────────────────┐
│  ┌─────────────────────────┐  │ ← --space-2 + --search-height
│  └─────────────────────────┘  │   search card, floating
│                               │
│      the visible band         │   what every camera move frames into
│                               │
├───────────────────────────────┤ ← --sheet-current
│  ▁▁▁▁                         │
│  the sheet                    │
└───────────────────────────────┘
```

| Edge | Inset, phone | Inset, desktop |
|---|---|---|
| Top | `--space-2` + `--search-height` | none |
| Bottom | `--sheet-current` — the sheet's height at its settled detent | none |
| Left | none | `--space-4` + `--panel-width` + `--space-4` |
| Right | none | none |
| All | plus `FIT_PADDING` | plus `FIT_PADDING` |

The top inset is new and it is what answers "dead space at the top". Without it
the band would simply move up and the search card would become the new place
things hide; with it, the band is the whole map minus the two things floating
over it, and content is centred in the band rather than in the viewport.

**One function, every camera move.** `columnInset()` already computes this and
is already read by the home view, the trip reveal and the loose reveal. The
fits that centre on the raw viewport today — a trip's tracks on open, the world
map's first fit, `Fit to everything`, both cluster zooms — read the same
function. Nothing gets its own idea of where the map is.

## The main path

1. The sheet is at half over the trips list. The band is the strip between the
   search card and the sheet's top edge.
2. Opening a trip fits its tracks **into the band**: the whole route sits above
   the sheet's edge, below the card, and centred between them.
3. Dragging the sheet up to full shrinks the band. On the settle, the map
   re-frames so the trip is still whole inside the smaller band.
4. Dragging back down to half grows the band. The trip is already inside it, so
   **the camera does not move** — the user gets more map around what they were
   looking at, which is what they asked for by lowering the sheet.

## The re-frame rule

> **A detent settle re-frames by the same three steps a selection does, and
> only when the subject no longer fits.**

| After the settle | Camera |
|---|---|
| The subject is inside the new band | **Nothing** |
| It would be, after a pan at this zoom | Pan to centre it in the band |
| It would not | Fit its bounds, at or below the existing cap |

Which is to say: raising the sheet can move the camera, lowering it almost
never does. That asymmetry is not a special case — it falls out of the rule,
because growing the band cannot take anything out of it.

### What the subject is

The most specific thing currently framed, and nothing broader:

| State | Subject |
|---|---|
| A cairn is selected | Its coordinate |
| A track is selected | Its geometry, the same points #270 reveals |
| A trip is open, nothing selected inside it | The trip's tracks and cairns |
| A loose item is open | Its overview line strings, or its coordinate |
| The list face, nothing selected | **None — no re-frame.** The world view is not a subject |

The last row matters. Dragging the sheet over an unfiltered world map moves
nothing: there is no one thing being looked at, and picking one would be the
app deciding for the user.

### When the user has taken the camera

**A pan or a zoom by hand disowns the subject until the selection changes
again.** After the user has moved the map themselves, a detent settle does
nothing at all — restoring their previous view would be the leash #270 named,
arriving a gesture later. Selecting something again, or opening something else,
makes it a subject once more.

### During the drag

Nothing. The camera moves at most once per detent change, after the settle. A
camera tracking the finger is two direct manipulations fighting over one
surface, and the sheet is the one the finger is on.

## What this revises in #270

That note's edge case reads:

> **The window is resized, or the sheet is dragged, while something is
> selected.** No reveal. Reveal fires on selection, not on layout.

Replace it with:

> **The sheet settles at a new detent** while something is framed. Re-frame by
> the three-step rule against the new band — see
> [312-framing-against-the-visible-band.md](312-framing-against-the-visible-band.md).
> **The window is resized, or the orientation changes.** Still no reveal.

The sentence *"reveal is a response to the selection changing, never to the
camera changing"* is untouched and still the most important line in #270. A
detent is not the camera: it is how much of the map exists.

## States

| State | On a detent settle |
|---|---|
| List face, nothing selected | No camera move |
| Trip open, nothing selected inside | Re-frame the trip if it no longer fits |
| Trip open, cairn or track selected | Re-frame that item if it no longer fits |
| Loose item open | Re-frame that item if it no longer fits |
| User has panned or zoomed since the last selection | No camera move |
| A decision owns the map (draft, queue, create) | No camera move — detents are suspended, so no settle happens |
| 3D | No camera move. 3D framing is out of scope and keeps today's behaviour |
| Desktop | No detents, nothing to settle |
| Disconnected (#73) | Re-frames normally — reading a map writes nothing |
| Reduced motion | The re-frame is a jump |

## Edge cases

- **Peek dropped on rotation to landscape** (#112). The sheet falls back to
  half; that is a detent change and re-frames like any other.
- **A subject larger than the band even at minimum zoom.** The fit branch does
  what `fitTracksToBounds` does today. Nothing new is promised, and the band
  being small is not a reason to shrink the sheet.
- **The band is tiny** — full, on a short phone. The fit branch fires most
  times and the result is a distant camera. That is the honest outcome of a
  sheet the user raised; the fix is lowering it, and it is one drag away.
- **Rapid dragging between detents.** Only the settle fires, so a flick through
  half to full produces one camera move, not two. `panTo` is interruptible and
  no queue is kept, as #270 already establishes.
- **A trip with no usable geometry**, or an overview that has not loaded. No
  subject, no move, nothing said. Not an error state.
- **The sheet settling on the detent it was already at** — a drag that returns
  where it started. No height change, so nothing fires.
- **Crossing 719px** with something framed. The desktop inset takes over on the
  next camera move; the crossing itself does not move the camera, per the
  resize rule above.
- **A cluster zoom on phone.** Fits its members into the band, at
  `CLUSTER_MAX_ZOOM` as today. The only change is which rectangle it fits into.
- **`Fit to everything` and Reset view** (#304). Same: they fit into the band.
  Reset still goes to the home bounds, framed against the band rather than the
  viewport.

## Transitions

| What | Duration |
|---|---|
| A re-frame after a settle | `--motion-slow`, `--ease` — the map camera, unchanged |
| The sheet's own settle | `--motion-base`, unchanged |

The camera starts when the detent is decided, not when the sheet finishes
moving: they overlap, and the sheet's `--motion-base` finishes first. Waiting
for the sheet would read as the map lagging the gesture.

Under `prefers-reduced-motion: reduce` the camera jumps, per the standing rule.

## Copy

**None.** No labels, no toasts, no announcement. A camera move is a visual
consequence of a gesture the user just made, and #270 already decided it is not
announced.

## New tokens

**None.** `--search-height`, `--space-2`, `--sheet-current`, `--space-4` and
`--panel-width` all exist and are read off the root, never transcribed —
`--sheet-current` is what `BottomSheet` already publishes on every height
change. `FIT_PADDING` stays the one margin, exported from `fitBounds.ts` and
reused rather than copied.

## Decisions taken here

- **The top inset is the search card, not zero.** Otherwise "use the dead space
  at the top" would mean drawing items under a floating card — the same bug,
  moved.
- **Lowering the sheet does not re-centre.** It falls out of the three-step
  rule, and it is also the behaviour worth wanting: lowering is how the user
  asks for more map around what they are looking at, not for a different view
  of it.
- **The list face has no subject.** Dragging the sheet over the world map moves
  nothing. The alternative — re-fitting everything — would make the sheet a
  camera control, and a world fit is already one drag on the map away.
- **A hand-moved camera suspends the re-frame.** Without this, the sheet
  becomes the leash #270 was written to avoid.
- **The settle drives it, not the drag.** One camera move per detent change.
- **3D is excluded.** Its framing is altitude, tilt and heading (#292, #303),
  not a bounds rectangle, and inseting a 3D camera by a sheet height is a
  different piece of geometry that deserves its own note.
