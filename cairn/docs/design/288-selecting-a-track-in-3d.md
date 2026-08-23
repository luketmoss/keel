# 288 — selecting a track in 3D

The 2D map's route click and selected treatment, transcribed to the 3D surface
by the means that surface actually has.

Standing documents: [design-language.md](design-language.md) (the one route
effect, and the motion durations),
[shell-and-content-model.md](shell-and-content-model.md) (routes on the map,
and #271's amendment that in 3D they draw at rest). Prior notes:
[269-emphasising-a-track-on-the-map.md](269-emphasising-a-track-on-the-map.md)
(the two strengths and the stacking order this transcribes),
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the route click, the reveal rule and its suspension),
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) — **the
note that deferred this** —
[273-cairns-in-the-3d-map.md](273-cairns-in-the-3d-map.md) (the parity pass
this is the track half of),
[274-a-flyover-of-a-trip.md](274-a-flyover-of-a-trip.md) (`frameGeometry`, and
what a map gesture does to a running flight),
[268-expanding-a-track-row.md](268-expanding-a-track-row.md) (the row the click
expands).

## Why

> *"When in 3D mode, clicking on tracks no longer takes you to that track or
> highlights the track amongst the other tracks."*

Both halves are true and neither is a regression. #271 drew every 3D track the
same way deliberately — *"no active-track glow … belongs to a selection this
issue does not add"* — and #269 and #270 then built the selection, the hit
lines and the reveal on `TrackLayer` alone. #273 took cairns to parity in 3D
and tracks never got the same pass.

What that leaves is worse than a missing feature: the same gesture works one
switch away, so 3D reads as broken. And it fails hardest where 3D is most worth
being in — an out-and-back up a valley, two days sharing an approach — which is
the case #269 exists for.

## The main path

3D is on, a trip is open, its tracks lie on the terrain at #271's appearance.

1. The user clicks a route.
2. Its track becomes the selection, and its row expands and scrolls into view —
   `onSelectRoute`, the same callback the 2D hit line fires.
3. The route redraws heavier, with an outer edge, above every other route.
4. The camera flies to frame the track, keeping its heading and tilt.

Steps 2 and 3 are already written; step 1 needs an element that can be clicked
and step 4 needs a 3D framing. Nothing about the selection itself is new —
`selectedTrackId` lives in `TripDetail`, which is why a track selected in 2D is
still selected when the switch is flipped, and takes the other surface's
treatment on arrival.

## Clicking a route

`Polyline3DElement` receives no pointer events. `Polyline3DInteractiveElement`
extends it and adds exactly one: `gmp-click`. Every track's line becomes one of
those, and the line the user sees is the line they click.

| You do | Effect |
|---|---|
| Click a resting track's route | Selects it, expands its row (#268), scrolls the row into view |
| Click the selected track's route again | Collapses its row. **Stays selected** |
| Click a multi-track file's route | Selects the file. Nothing expands — it has no expanded state |
| Click terrain, sky, or a gap between routes | Nothing. No selection is cleared |
| Click a cairn marker sitting on a route | The cairn. `MarkerElement` hosts real DOM above the surface and takes the click |

Row two is #250's second-click contract, which #270 already followed for the 2D
route; row four is #269's *"nothing deselects except selecting another track"*.
Neither is re-decided here.

**No separate hit line.** The 2D layer draws an invisible 20px `TRACK_HIT_WEIGHT`
polyline over each route because a 3px stroke is not a touch target. The 3D
equivalent would be a fully transparent `Polyline3DInteractiveElement`, and
whether a zero-alpha 3D stroke receives `gmp-click` at all is undocumented. One
element per track is what ships; the transparent companion is the escape hatch
if the drawn line proves too fine on touch, and it is a follow-up rather than a
guess made now. See *Decisions taken here*.

**Hover is not part of this.** `Polyline3DInteractiveElementEventMap` has
`gmp-click` and nothing else — no enter, no leave — so the map-to-row direction
#251 named cannot exist on this surface. A row-hover band that lights a 3D
route with no way for the route to light the row back would be half a feature,
and every treatment added to a flat 3D stroke weakens #271's case for it being
flat. 3D has one strength of emphasis, not two.

## The selected treatment

#269's table transcribed to one stroke, the same way #271 transcribed rest:

| | Outer | Stroke | zIndex band |
|---|---|---|---|
| **Rest** | — | the track's colour, `TRACK3D_WIDTH_REST` (4) | `TRACK3D_Z_REST` |
| **Selected** | `TRACK3D_OUTER_COLOR`, `TRACK3D_OUTER_WIDTH` (12) | the track's colour, `TRACK3D_WIDTH_SELECTED` (8) | `TRACK3D_Z_SELECTED` |

Rest is #271's, unchanged and unchallenged.

**Two carriers, not one.** The stroke doubles *and* gains a dark outer edge, so
the selected track reads apart from a resting one in a screenshot, at low
contrast, and where its own colour is close to a neighbour's — #269's *"colour
is never the only carrier"*, which matters more here because 3D has no second
strength to fall back on.

**The outer edge is not the 2D halo.** #269's halo is the track's own colour at
`0.30` and 4px each side; #271 rejected that shape for this surface because a
wide translucent stroke over shaded terrain reads as a smear. `outerColor` is a
hard edge rather than a glow — the 2D *casing*'s job, not the halo's. It exists
only on the selected track: at rest, one stroke, as #271 says.

**`outerWidth` is a fraction of `strokeWidth`, not a pixel count** — the Maps
API's own definition, discovered writing this rather than assumed. `0.3` of an
8px selected stroke is the value; there is no independent pixel width to pick.

**Stacking is `zIndex`, not element order.** `Polyline3DElement` carries a
`zIndex`, so #269's scheme transcribes directly and there is no need for #273's
remove-and-re-append (`MarkerElement` has no `zIndex`; a polyline does). Two
bands rather than three, since there is no hovered band here:

```
zIndex = band + track index
```

| Part | Values |
|---|---|
| Band | rest `0` · selected `20000` |
| Track index | the track's position in the trip — today's deterministic order, preserved within the band |

No layer term: one element per track means there is nothing to keep in order
inside a track, and the outer edge is drawn by the same element as its stroke.

**A multi-track file takes it together**, every line at once, exactly as in 2D —
the id names the row, not one track within it.

## The camera

**Selecting a track in 3D frames it, every time.** Not #270's three-step rule.

#270 moves the camera *only when it has to*: if the item is already inside the
visible area, nothing happens. That test needs a coordinate-to-pixel projection,
and `Map3DElement` has none — the same wall #273 hit over clustering. There is
no way to ask this surface whether a track is on screen, so there is no way to
implement "only when it has to", and a rule that silently degrades to "always"
is better stated as "always" than left looking like the 2D one.

The flight:

- **Target and range** from `frameGeometry(points)` — #274's own framing, over
  the selected file's tracks rather than the whole trip, at its existing
  `FLYOVER_MARGIN_PERCENT`.
- **Heading and tilt are read off the camera and handed back unchanged.** A
  reveal that also re-oriented would undo the user's own orbit, and *"the zoom
  is the user's"* (#270) is the same argument one dimension over.
- **`--motion-slow`, transcribed** as `TRACK3D_REVEAL_MS` (280), beside
  `Map3D.tsx`'s `TILT_ANIMATION_MS`, which transcribes the same token for the
  same reason: a duration handed to `flyCameraTo` never reaches a stylesheet.
  The design language assigns `--motion-slow` to *"map camera, bounds fitting"*
  and this is that.
- **Fired by the selection changing, never by the camera changing** — #270's own
  line, and the failure mode this is one listener away from.

**Reduced motion:** no flight. `center` and `range` are set directly and the
camera arrives, which is how `Map3D.tsx` already gates its tilt-in — the CSS
global block cannot reach `flyCameraTo`.

## States

| State | The 3D map |
|---|---|
| Nothing selected | Every visible track at #271's rest appearance. No camera move |
| A track selected | That track heavier, with its outer edge, in the selected band. Every other track at rest |
| Selected, pointer over its row | No change. There is no hovered band in 3D |
| The selected track is hidden | **No route at all.** The selection is kept and the treatment returns when it is shown again (#193, #269) |
| Selected track shown again | Redraws in the selected band. No camera move — reveal answers to selection, not visibility |
| Single-point track | Not drawn in 3D today (`points.length < 2` is skipped) and not clickable. Selecting it from the row selects nothing on this surface and moves no camera |
| Multi-track file selected | Every one of its lines takes the treatment and the band together; the framing covers all of them |
| Trip still loading | Tracks arrive at rest; a selection made before its track arrives applies when it does |
| A decision owns the map (#81, #155, #156) | Routes are not clickable and no reveal fires — 2D's `hitLinesEnabled` / `revealSuspended`, unchanged |
| A flyover is running | The click's own `pointerdown` cancels the flight (#274), then the selection and its framing proceed |
| Switching 2D → 3D with a track selected | Arrives selected, in this surface's treatment. **No reveal** — the switch is not a selection change |
| Switching 3D → 2D with a track selected | The 2D halo and bands, as #269 has always drawn them |
| Disconnected (#73) | Unaffected |

## Edge cases

- **Two tracks exactly on top of each other**, one selected. The selected one is
  above by band, is twice the width, and shows its outer edge either side of the
  other's stroke. Pixel-identical geometry is not solvable by any treatment and
  the row is what disambiguates — #269's own answer.
- **The selected track is removed, or removed from the trip.** #269's
  id-no-longer-matches guard already clears `selectedTrackId`; the 3D line goes
  with the file and no camera move fires for the clearing.
- **The colour changes while selected.** The stroke restyles immediately; the
  outer edge does not, because it is not the track's colour.
- **The selected track is behind a ridge.** `drawsOccludedSegments` stays
  `false` (#271), so the hidden part stays hidden and the framing does not tilt
  to expose it. Selection is not a promise of line of sight.
- **The same route clicked twice quickly.** The second click collapses the row
  and re-frames the same geometry — a flight to where the camera already is,
  which is a no-op the user cannot see.
- **Clicking one route mid-flight from another's reveal.** Last selection wins;
  `flyCameraTo` replaces the flight in progress, the same rule #274 gives two
  flyovers.
- **A track selected while 3D is mounted but not yet visible** (the first flip's
  tile wait). The treatment is a property on an element that already exists, so
  it is simply true when the surface fades in; the flight waits for the same
  readiness signal #271's tilt-in waits for.
- **A trip with 200 tracks.** The index term needs 20,000 tracks in one trip
  before it could reach the next band. Well past anything the performance rule
  contemplates.
- **Touch.** No hover, so the selected treatment is the only one a touch user
  sees — #269's argument for it being the strong one, and the reason the drawn
  line's own width is what the hit-target question turns on.

## Copy

**None.** No labels, no tooltips, no popover on the 3D surface. The row is the
accessible representation of a track and it carries the state, exactly as in 2D.
`Polyline3DInteractiveElement` is not in the tab order and this note does not
put it there.

## New tokens

**No CSS custom properties.** As in #269, these are module constants — a
`zIndex`, a stroke width and a flight duration handed to the Maps API never
reach a stylesheet. The stroke and stacking ones live in `Track3DLayer.tsx`;
`TRACK3D_REVEAL_MS` lives in `track3D.ts` beside `MAP3D_ID`, since the flight
it times is driven by `TripDetail` on the element `Track3DLayer` draws to, not
by the layer component itself.

| Constant | Value | For |
|---|---|---|
| `TRACK3D_WIDTH_REST` | `4` | #271's `STROKE_WIDTH`, renamed now there is a second |
| `TRACK3D_WIDTH_SELECTED` | `8` | The selected track's stroke |
| `TRACK3D_OUTER_WIDTH` | `0.3` | Its outer edge — a fraction of `strokeWidth`, the API's own unit |
| `TRACK3D_OUTER_COLOR` | `#00000059` | The 2D casing's colour, reused rather than a second near-black |
| `TRACK3D_Z_REST` | `0` | Band base, a track at rest |
| `TRACK3D_Z_SELECTED` | `20000` | Band base, the selected track — #269's own value, so the two surfaces read as one scheme |
| `TRACK3D_REVEAL_MS` | `280` | `--motion-slow`, transcribed for `flyCameraTo` |

## Decisions taken here

- **The reveal always fires in 3D**, where 2D moves the camera only when it
  must. Forced by the missing projection, and it is the decision most worth
  arguing with: a click on a route that is already centred still flies. The
  alternative — no camera move at all in 3D — was rejected because *"takes you
  to that track"* is half of what was reported missing.
- **One interactive line per track, no transparent hit line.** A 4px target is
  finer than 2D's 20px one. Doubling the resting width to buy tolerance would
  change how the map looks at rest, which #271 settled; a transparent hit line
  rests on undocumented behaviour. Ship the honest version and widen it if touch
  proves it necessary.
- **No hovered band in 3D.** See *Clicking a route*.
- **An outer edge rather than the halo**, and only when selected. See *The
  selected treatment*.
- **`zIndex` rather than #273's re-append.** A polyline has one; a marker does
  not.

## Out of scope

- **The world map in 3D** — loose tracks and trips in `LooseLayer`. #270 left
  the world map's selection alone and this does not reopen it.
- **Hover in either direction on the 3D surface**, per above.
- **Dimming the other routes**, which #269 decided against and #270 declined to
  reopen.
- **Clustering, the fan, and cairn selection** — #194, #273.
- **Keyboard traversal of routes** (#55).
- **A 3D form of #270's least-move test**, unless Google ships a projection.
