# 285 — cairns behind the terrain

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md). This note changes none of them, and that is the
point of the approach it specifies.

It amends exactly one paragraph of
[273-cairns-in-the-3d-map.md](273-cairns-in-the-3d-map.md) — the *Edge cases*
entry for *"A cairn behind a ridge"* — and leaves the rest of that note,
including *"The marker transfers unchanged"*, standing.
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) and
[274-a-flyover-of-a-trip.md](274-a-flyover-of-a-trip.md) are unchanged.
[54-photo-markers.md](54-photo-markers.md),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md),
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md),
[251-linked-hover.md](251-linked-hover.md) and
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
continue to describe both surfaces exactly as they do today.

## The idea

**A marker is a claim about what you can see.** A cairn drawn on top of the
ridge it is actually behind is not a marker being permissive, it is the map
lying about where you are standing. #273 accepted the platform's default
because either behaviour seemed defensible. On real terrain at 55° of tilt it
is not: the far side of the valley arrives on top of the near side, and the
map stops being a picture of a place.

The whole design follows from refusing the obvious fix. `Marker3DElement`
would hand us correct occlusion for free and take the thumbnail, the camera
badge, the provenance ring, the hover scale and #251's marker-to-row hover
with it — `MarkerElement` is the only 3D class that hosts HTML, and the only
one that fires pointer events at all. So the app computes the occlusion
itself, and the marker is not touched.

## The rule

> **A cairn draws on the 3D surface unless, with the camera at rest, the
> ground between the camera and the cairn rises above the line between
> them.**

Three parts of that sentence are load-bearing.

**"At rest"** — the test costs an Elevation API call, so it runs when the
camera settles and never while it moves. See *While the camera moves*.

**"The ground"** — the Elevation API returns terrain height. Buildings are
not modelled and a cairn behind one still draws. Cairn is a backcountry tool;
this is the right amount of wrong.

**"Unless"** — the default is *drawn*. Everything unknown, unfinished or
failed resolves to visible. A cairn is never hidden because a network call
did not come back, which is what keeps #194's promise — every cairn reachable
from the map alone — independent of the Elevation API's availability.

## The main path

1. 3D is on. Cairns draw at parity with 2D for the face, exactly as #273
   specifies.
2. The camera stops. `Map3DElement` fires `gmp-steadychange` with
   `isSteady: true`.
3. Each drawn cairn not already answered for this camera position is tested:
   terrain is sampled along the ground track from the camera to the cairn,
   and the samples are compared against the straight line from the camera's
   altitude to the cairn's own ground altitude.
4. Cairns whose line of sight is blocked fade out over `--motion-base`.
   Cairns that were hidden and are now clear fade in over the same.
5. Everything still drawn behaves exactly as it did — same `CairnMarker`,
   same hover scale of `1.35` over `--motion-fast`, same selected treatment,
   same click pair of `onSelectCairn` then `onOpenCairn`.

## The geometry

Stated precisely enough to implement without inventing, because the failure
mode of getting it slightly wrong is a marker that flickers on a slope.

- **The camera** is `Map3DElement.cameraPosition`, a `LatLngAltitude` the API
  exposes directly. There is no need to derive it from `center`, `range` and
  `tilt`, and deriving it would be wrong the moment `flyCameraTo` lands
  somewhere other than where it was asked to — measured, and documented in
  `groundAltitude.ts`.
- **The cairn's altitude** is the terrain height at its own coordinate —
  which is the last sample of the same ray, so it costs nothing extra. 3D
  markers are `CLAMP_TO_GROUND` at `altitude: 0`, so the cairn sits on the
  ground by definition.
- **The ray** is sampled with `sampleAlongPath(path, 16)` — 16 points, the
  same `MAX_SAMPLES` `groundAltitude.ts` already settled on for the same
  reason: enough to catch a ridge, not enough to make one camera stop into a
  large request.
- **The test.** For each sample `i` of `n` along the ray, the line of sight
  is at `cameraAltitude + (cairnAltitude − cameraAltitude) · i/n`. The cairn
  is occluded if any sample's terrain exceeds that by more than the
  clearance below.
- **Clearance: 10 metres.** Terrain samples are interpolated from a dataset
  coarser than the rendered mesh, and a ray that grazes a ridge it is
  actually clearing would otherwise flicker as the camera drifts. Ten metres
  is roughly one sample's worth of vertical error at backcountry scale and is
  the smallest number that stops the flicker. This is a tolerance, not a
  tuning knob — if it turns out to be wrong it should be re-derived, not
  nudged.
- **The first and last samples are ignored.** The ground directly beneath the
  camera and the ground the cairn is standing on are both, trivially, at the
  line of sight at their ends.

## While the camera moves

**Verdicts hold.** A cairn hidden when the camera came to rest stays hidden
through the next drag, pinch or flyover, and is re-tested when the camera
settles again.

The alternative — showing everything while the camera is in motion and
re-hiding on rest — was considered and rejected. It converts every pan into a
flash of markers appearing and vanishing, which is more distracting than the
bug being fixed. Holding a stale verdict is wrong for the duration of a
gesture and right the moment it ends, and a gesture is exactly when nobody is
reading the markers.

This covers a flyover (#274) for free: a flyover is a moving camera, so the
markers it passes hold whatever they had and resolve when it lands. No
flyover-specific behaviour exists.

## Cost, and what bounds it

The Elevation API is billed and quota'd, so the budget is part of the design
rather than an implementation detail.

- **One call per cairn per novel camera position.** Nothing is sampled twice.
- **The cache key is the quantised camera plus the cairn id.** Camera
  latitude and longitude to four decimal places and altitude to ten metres —
  the same `toFixed(4)` quantisation `groundAltitude.ts`'s cache already
  uses, so nudging the camera by a few metres costs nothing and the two
  caches read the same way.
- **The cache is module-level**, surviving remounts, again as
  `groundAltitude.ts`'s does. Flipping 3D off and back on over the same place
  is free.
- **At most 64 rays per settle.** Beyond that, the remaining cairns are left
  untested — and therefore drawn, per *The rule*. A face with more than 64
  cairns in play degrades to partly-correct occlusion rather than to a
  hundred requests. It is worth saying plainly that this is a cap chosen to
  bound cost, not a number derived from anything.
- **A two-second timeout per settle**, matching `groundAltitude.ts`'s
  `DEFAULT_TIMEOUT_MS`. Whatever has not answered by then is drawn, and is
  re-tested at the next settle.

## What hiding is, and is not

Hiding is a property of **the 3D marker**, not of the cairn.

| Stays exactly as it is | Why |
|---|---|
| The list row | The row is how you reach a cairn you cannot see. Removing it would turn a rendering fix into a filter. |
| Filters and facets | One filter drives the list and both surfaces (#273's *States*). Occlusion is downstream of it and never feeds back into it. |
| Linked hover from the row | Hovering a row for a hidden cairn lights the row; there is nothing on the map to light, and no error in that. |
| Counts and totals | A hidden cairn is present. |
| The 2D map | Untouched, entirely. |
| `LayersControl` | No new line, no new switch. See *No new copy*. |

**The selected cairn always draws**, occluded or not. Selection arrives from
the list as often as from the map (#270), and #270's promise is that
selecting reveals the thing on the map. A selected marker that vanished
behind a ridge would break the one interaction whose entire job is to say
*here it is*. This is the single exception to the rule and it is deliberate.

## No new copy

Nothing here is announced. There is no "3 cairns hidden behind terrain"
caption, no `LayersControl` line, and no toggle to turn occlusion off.

#273 deleted *"Cairns don't show in 3D yet"* on the grounds that a missing
feature which made content vanish earned a sentence and a difference in how
markers behave does not. The same test applies here and gives the same
answer: a marker correctly hidden by a mountain is the map working, and
captioning it would be the app apologising for being right. The list is
already the complete answer to *what is here*.

## Transitions

| From | To | What is seen |
|---|---|---|
| Drawn | Occluded | `opacity` to `0` over `--motion-base`, `--ease`; `pointer-events: none` for the duration and after |
| Occluded | Drawn | `opacity` to `1` over `--motion-base`, `--ease`; pointer events restored on arrival |
| First settle after 3D turns on | either | Runs underneath #271's own cross-fade, so the first cull is absorbed by the surface arriving rather than reading as markers giving up |

**Opacity, not `display: none` and not unmounting.** The marker element stays
in the surface's child list and the portal stays mounted: a `MarkerElement`
that is removed and re-appended loses its place in the append order, which is
the only stacking control #273 has (*Selection*). Fading is also the only way
the transition can be seen at all.

Under `prefers-reduced-motion` the global block in
[49-motion-elevation.md](49-motion-elevation.md) collapses the durations and
markers cut rather than fade. That is correct and needs no special handling.

## States

| State | The 3D map |
|---|---|
| Camera at rest, terrain between camera and cairn | the cairn is not drawn |
| Camera at rest, clear line of sight | drawn, wholly unchanged from #273 |
| Camera in motion | every cairn holds the verdict it had when the camera last rested |
| 3D just turned on, nothing tested yet | every cairn drawn; the first settle culls |
| No elevation sampler (no API key, script not resolved) | every cairn drawn — today's behaviour exactly |
| Elevation call fails | the cairns in that call are drawn, and re-tested at the next settle |
| Elevation call times out | as above |
| More than 64 cairns in play | the first 64 tested; the rest drawn |
| A cairn is selected | drawn, occluded or not |
| Filter or facet excludes a cairn | not drawn, and not tested — the filter is upstream |
| Trip opened while 3D is on | the new face's cairns start untested and therefore drawn; the next settle culls |
| Flyover running | verdicts hold for the flight; the landing is a settle |
| 3D failed after starting | the surface falls back to 2D, which has no occlusion and needs none |
| Disconnected / signed out | unchanged — thumbnails fall back, occlusion is unaffected either way |

## Edge cases

- **A cairn behind the camera.** The ray is degenerate and the terrain test
  is meaningless. Not special-cased: `Map3DElement` does not render markers
  outside the frustum, so a cairn behind the camera is already not on screen,
  and testing it wastes a call at worst. It counts against the 64.
- **A cairn at the camera's own position.** The ray has zero length. Sampling
  a zero-length path is what `groundAltitude.ts` already widens by 0.001°
  rather than special-casing downstream; do the same, or short-circuit to
  *drawn*. Either is correct — the cairn is under your feet.
- **Two cairns at the same coordinate.** Both get the same verdict, which is
  right: they are the same point on the terrain. #273's "both draw, one on
  top of the other" is unchanged for the visible case.
- **A cairn moved (#158) while 3D is on.** Its cache entries are keyed by
  cairn id and are now stale. Clear that cairn's entries when its coordinate
  changes; until the next settle it draws, which is the safe default anyway.
- **Rapid flipping of 3D off and on.** The surface is mounted once for the
  session (#271) and the cache is module-level, so the second flip re-uses
  the first flip's verdicts and issues nothing.
- **The camera settles, then settles again in the same place.** The quantised
  key is identical and no request is made. This is the common case when a
  gesture ends in a small bounce.
- **A cairn on the near side of a ridge, right at the ridge line.** The 10 m
  clearance is what decides it, and it decides in favour of drawing. A cairn
  that flickers is worse than a cairn that shows a moment early.
- **The user is looking straight down.** At low tilt almost nothing occludes
  anything, so almost nothing is hidden and the 3D map looks the way it does
  today. That is the correct outcome, not a regression: from directly
  overhead, you can see all of it.

## New tokens

None. The fade uses `--motion-base` and `--ease`, both already in the
language, and hiding a marker needs no colour of its own.

The 10 m clearance, the 64-ray cap and the four-decimal cache quantisation
are not design tokens — they are constants belonging to the occlusion module,
and they are named here so that changing one is a decision someone made
rather than a number someone found.
