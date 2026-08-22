# 270 — selecting something reveals it on the map

One rule, four surfaces: what you picked is highlighted, and the map is looking
at it.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md)
(the column and its width, the sheet and its detents, *"selecting anything dims
every other marker"*, markers and routes),
[design-language.md](design-language.md) (`--motion-slow` is the map camera),
[cairns.md](cairns.md) (the marker and its selected treatment). Prior notes:
[269-emphasising-a-track-on-the-map.md](269-emphasising-a-track-on-the-map.md)
(**required** — it introduces `selectedTrackId` and the treatment revealed
here), [268-expanding-a-track-row.md](268-expanding-a-track-row.md) (the row a
route click expands),
[251-linked-hover.md](251-linked-hover.md) (the cluster mechanism extended here
from hover to selection, and the camera rule for hover that stays),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) (the
fan, unchanged), [250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md)
(the marker-behaves-like-the-row contract),
[54-photo-markers.md](54-photo-markers.md) (the selected marker),
[5-track-rendering.md](5-track-rendering.md) (`fitTracksToBounds` and its cap).

## Why

> *"Clicking on a track, cairn, etc should highlight that item as well as open
> up the preview/details in the side panel. If it is a cairn in a grouping,
> that grouping should be highlighted. If the map is not on that location of
> the item, it should move to that location."*

Three sentences, one complaint: **the map and the panel do not agree about what
you just picked.** A highlight drawn off screen is not a highlight, a cluster
that stays grey is a "nothing found", and a route you cannot click is the only
object on the map that isn't one.

## The reveal rule

> **Selecting something moves the camera by the least it can, and only when it
> has to.**

| Situation | Camera |
|---|---|
| The item is inside the visible area | **Nothing.** No pan, no zoom, no nudge |
| It would be, after a pan at the current zoom | Pan to centre it in the visible area |
| It would not | Fit its bounds, at or below `fitTracksToBounds`' existing cap |

The middle row is what makes this feel like a map rather than a slideshow: the
zoom is the user's, and a selection is not a reason to take it. The third row
only fires for something that genuinely does not fit — a 40 km traverse picked
while zoomed to a summit.

**Reveal is a response to the selection changing, never to the camera
changing.** Panning away from the selected item does not pull the map back;
that would make the selection a leash and the map unusable. Stated because it
is the failure mode this design is one line away from.

### The visible area

Not the viewport. The column floats *over* the map, so an item drawn behind the
panel is not visible in any sense the user cares about.

```
┌────────────────────────────────────────────────┐
│  ┌────────┐  ┌───────────────────────────────┐ │
│  │        │  │                               │ │
│  │ column │  │      the visible area         │ │
│  │        │  │                               │ │
│  └────────┘  └───────────────────────────────┘ │
└────────────────────────────────────────────────┘
   --space-4  --panel-width  --space-4
```

| Edge | Inset |
|---|---|
| Left, desktop | `--space-4` + `--panel-width` + `--space-4` |
| Bottom, phone | The sheet's height at the detent it settles at **after** the click |
| Left, phone | None — the sheet is at the bottom, not the side |
| All edges | Plus `FIT_PADDING`, so an item hugging an edge counts as out |

The phone inset reads the *settled* detent deliberately. #268 raises a peek
sheet to `--sheet-half` when a row expands, and computing visibility against
the pre-click detent would reveal an item into the space the sheet is about to
occupy.

### What gets revealed, per kind

| Kind | The geometry |
|---|---|
| Cairn | Its coordinate. A point, so the pan branch always applies and the zoom is never taken |
| Track, in a trip | Every point of its geometry, the same array `fitTracksToBounds` already takes |
| Multi-track file | Every point of every track in it — one file is one selection |
| Loose track, world map | Its `overview.geojson` line strings, per the performance rule. **Never the source KML** |
| Loose cairn, world map | Its coordinate |

## The cluster

A selected cairn inside a collapsed cluster gives that cluster the selected
treatment. This is #251's mechanism — *"a cluster is not ambiguous about which
cairns it stands for"* — extended from the weaker claim to the stronger one.

| | Ring | Glow | Scale |
|---|---|---|---|
| Hovered (#251) | `--accent` at `--marker-ring` | none | `1.35` |
| **Selected** | `--accent` at `--marker-ring-selected` | `drop-shadow(0 0 7px)` | `1.0` |
| Both | `--accent` at `--marker-ring-selected` | yes | `1.35` |

Three differences from hovered — ring width, glow, and the scale a hovered
cluster has and a merely selected one does not — which is exactly the test #251
applied to keep the two apart. Drawn on the cluster circle, which has no
thumbnail to ring.

**Selecting a member does not open the fan.** #194 owns what a cluster's own
click does, and nothing here changes it. A highlight answers *where is it*; the
fan answers *let me pick one*, and the user picking from the list has already
answered that.

**The camera pans to the cairn's own coordinate**, not the cluster's anchor.
The cairn is what was selected; the cluster is how it happens to be drawn at
this zoom, and it may not be drawn that way after the pan — in which case the
member marker takes the selected treatment and the cluster stops having it, by
the same recompute #251 already relies on.

## Clicking a route

Each track gains one **hit polyline** — `strokeOpacity: 0`, weight
`TRACK_HIT_WEIGHT`, `clickable: true` — drawn in the same band as its visible
polylines (#269) at the layer above them. Invisible, so it changes nothing
about how the map looks; topmost, so the emphasised track wins a click where
routes overlap, which is the same ordering #269 established for drawing.

| You do | Effect |
|---|---|
| Click a resting track's route | Selects it, expands its row (#268), scrolls the row into view |
| Click the selected track's route again | Collapses its row. **Stays selected** |
| Click a multi-track file's route | Selects the file. Nothing expands — it has no expanded state |
| Hover a route | `--hover` on its row. The list does **not** scroll |
| Click empty map | Nothing. No selection is cleared |

The second row is #250's contract, followed rather than re-decided: *"a marker
click does exactly what that cairn's row click does, including the second click
that collapses it."* A route is a track's other representation and gets the
same rule.

The hover half closes the gap #251 named — *"`TrackList` lights its polyline,
and the polyline lights nothing back"* — and it costs nothing extra, because
the hit line is what was missing. Its rules are #251's without change: hover
never moves the camera, never scrolls the list, never expands anything.

**Cairn markers always win.** `AdvancedMarker` renders in
`overlayMouseTarget`, above `Polyline`'s `overlayLayer`, so a marker sitting on
a route takes the click regardless of z. That is already true and is why no
arbitration is specified.

**Hidden tracks have no hit line.** A track the eye has turned off is not on
the map and must not be clickable from it.

## When reveal is suspended

While a **decision** owns the map — an import draft (#81), the placement queue
(#155), the cairn-create gesture (#156) — reveal does not fire and the hit
lines are not clickable.

Both halves are the same argument: a camera that moves while the user is aiming
at a coordinate moves the target under their hand, and an invisible 20px-wide
click target over every route would eat the map click the gesture exists to
receive. The sheet already suspends its detents for exactly these surfaces;
this is the map's version of the same sentence.

## States

| State | The map | The panel |
|---|---|---|
| Nothing selected | Rest, everywhere | No row selected |
| Track selected, in view | #269's selected treatment | Row expanded (#268) |
| Track selected, out of view | Treatment, then pan or fit | Row expanded, scrolled into view |
| Track selected then hidden | No route drawn; selection kept (#269) | Row keeps its treatment |
| Cairn selected, unclustered | #54's selected marker | Row expanded (#250) |
| Cairn selected, clustered | The cluster takes the selected treatment | Row expanded |
| Cairn selected, filtered out by a facet | Selection already clears (#250's guard) — nothing to reveal | — |
| Loose item opened from the shell list | World map reveals it and draws its route | Its face |
| A decision owns the map | No reveal, no route clicks | Unchanged |
| Disconnected (#73) | Reveals normally — reading a map writes nothing | Unchanged |
| Reduced motion | The camera jumps instead of gliding | Unchanged |

## Edge cases

- **Selecting the item that is already selected.** Clicking the same row again
  re-runs the rule, which finds the item in view and does nothing. There is no
  re-centring nudge; a camera that twitches on a repeat click is a bug the user
  cannot name.
- **An open fan (#194) when a reveal pans.** The fan collapses, because *any*
  camera move collapses it. Correct and already specified — a fan that lags the
  camera is worse than no fan.
- **A track with no usable geometry**, or a loose track whose overview has not
  loaded. Nothing to reveal; the selection lands, the camera does not move, and
  nothing is said. It is not an error state.
- **A track crossing the antimeridian.** Reveal reads the same normalised
  points `TrackLayer` draws, so it inherits whatever `normalizeAntimeridian`
  decided rather than forming a second opinion.
- **An item larger than the visible area even at minimum zoom.** The fit branch
  does what `fitTracksToBounds` does today; nothing new is promised.
- **The window is resized, or the sheet is dragged, while something is
  selected.** No reveal. Reveal fires on selection, not on layout.
- **A very narrow desktop window** where the inset leaves almost no visible
  area. The rule still holds and the fit branch fires more often, which is the
  honest outcome; the column is not shrunk to make room.
- **Selecting a cairn and a track in turn.** Two independent selections (#269),
  two reveals, in the order the clicks arrived. The second wins the camera.
- **Rapid clicking down the list.** Each selection issues its own camera move
  and the last one lands. `panTo` is interruptible and no queue is kept.
- **A route click that was really the end of a marker drag** (#158).
  `consumeDragClick` already swallows it, and it is checked before anything
  here.
- **Touch.** A tap on a route is a click. `TRACK_HIT_WEIGHT` is what makes a
  3px line tappable at all, which is most of why the hit line exists.

## Copy

**None.** No labels, no chips, no tooltips, no announcement that the map moved.

Routes stay out of the tab order, per #55's decision about markers. The row is
the accessible representation of every item here and already carries the state
— the selected row treatment from `design-language.md`, `aria-expanded` from
#268 and #250. A camera move is a visual consequence of a control the user
already operated and is deliberately not announced.

## New tokens

**No CSS custom properties.** Everything here is either an existing token read
in JavaScript or a module constant beside the code that uses it, matching
`FIT_PADDING` and #269's bands.

| Constant | Value | For |
|---|---|---|
| `TRACK_HIT_WEIGHT` | `20` | The invisible click target on a route — half of `--hit-target`, which puts 10px of tolerance either side of a 3px line |

`FIT_PADDING` (`48`, in `fitBounds.ts`) is exported and reused as the reveal
margin, rather than a second number meaning the same thing. The column inset is
computed from `--panel-width` and `--space-4` read off the root, never
transcribed — those two are already the values the column is laid out from, and
a copy would drift the first time the column is re-measured.

## Decisions taken here

- **Pan before zoom.** The three-step rule spends the smallest camera move that
  works. The alternative — always fitting the item's bounds — is simpler to
  write and throws away the user's zoom on every click.
- **Reveal fires on selection only, never on camera change.** Otherwise the
  selection is a leash. This is the single most important line in the note.
- **The visible area excludes the column.** Without this the feature appears
  broken for every item that happens to sit in the left 412px, which on a
  laptop is a third of the map.
- **A selected cluster is highlighted, not expanded.** See *The cluster*.
- **Routes become clickable, and the same hit line carries hover.** This is the
  decision that most enlarges the issue, and it is what makes the user's
  sentence *"clicking on a track … should open up the preview/details in the
  side panel"* true from the map as well as from the list. Splitting it out
  would ship half the sentence.
- **The world map is included; its clustering is not.** The camera rule is one
  helper at a second call site. A cluster highlight there would have to span
  trips, tracks and cairns at once, which is the thing #194 also declined.

## Out of scope

- **The world map's clustering**, for the reason above.
- **The fan**, its members' hover, and its dismissal — #194 and #251's
  follow-up.
- **Dimming other routes on selection** — #269 decided against it and this note
  does not reopen it.
- **A camera move on hover**, on either surface. #251: *"a camera that chased
  the pointer would be unusable."*
- **Keyboard traversal of markers or routes** (#55).
- **Trips on the world map.** Selecting a trip navigates to it and the trip's
  own map already fits its bounds; there is no un-revealed selection to fix.
- **The treatments themselves** — tracks are #269's, cairns are #54's, the row
  is #268's and #250's.
