# 273 — cairns in the 3D map

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md). This note **corrects the reasoning** behind one of
#271's amendments to the second without changing its conclusion — see
[Standing document amendments](#standing-document-amendments).

It extends [271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md)
and supersedes exactly one section of it: *"Cairns do not draw yet, and the panel
says so"*. Everything else in that note — the switch, the camera, the tracks, the
`Satellite only` coupling — stands unchanged.

[54-photo-markers.md](54-photo-markers.md),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md),
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) and
[251-linked-hover.md](251-linked-hover.md) continue to describe the 2D map
exactly as they do today. Nothing here changes that surface.

## The idea

**A cairn is a thing at a coordinate, and 3D is a way the map can be.** The two
sentences together leave no room for a mode where cairns are absent. #271's
`Cairns don't show in 3D yet` was an honest note on an unfinished surface; this
issue removes the note by removing the reason for it.

The whole design follows from one discovery, so it goes first.

## The marker transfers unchanged

The issue was filed believing `Marker3DElement` is the only 3D marker and is not
an HTML host — that a pin, a glyph, a thumbnail and a camera badge would each
have to be rebuilt as 3D primitives or a glTF model.

That is not the case. `maps3d` ships a second class,
`google.maps.maps3d.MarkerElement`, which the API's own typings describe as
supporting *"high customization via custom HTML elements"*. It extends
`HTMLElement`, hosts arbitrary children, and its event map extends
`HTMLElementEventMap` — so `click`, `pointerenter` and `pointerleave` are
ordinary DOM events, with no `gmp-click` and no `Marker3DInteractiveElement`
involved. It is not alpha-gated; only its `autofitsCamera` property is, and this
issue does not use it. The app is already on `version="beta"`.

So **`CairnMarker` is rendered into a `MarkerElement` through a React portal, and
is not modified.** `CairnMarker.css`, `CairnIcon`, the thumbnail, the camera
badge, the provenance ring and the selected treatment all come across as they
are.

This matters beyond saving effort. `cairns.md` states the marker predicate once —

> A cairn draws as its thumbnail when it has an image and no icon. Otherwise it
> draws as a pin carrying its icon.

— and says the reason it lives in one component is that there is nowhere else a
caller could draw a cairn differently. Re-expressing it in 3D primitives would
have created exactly that second place, and the two would have drifted the first
time an icon was added.

### What `MarkerElement` does not have

Three options `Marker3DElement` carries are absent, and each decides something
below rather than being worked around:

| Absent | Consequence |
|---|---|
| `zIndex` | Stacking is append order. The selected marker is re-appended last — see *Selection*. |
| `drawsWhenOccluded` | Whether a marker behind a ridge shows is the platform's default, not ours to set. See *Edge cases*. |
| `sizePreserved` | Not needed. An HTML-hosted marker is sized in CSS pixels already, so a cairn is the same size near and far — which is what a marker should do. |

## The main path

1. 3D is on. The terrain is up, routes are drawn at rest.
2. A cairn draws at its coordinate as the same marker the 2D map draws for it,
   at the same size, clamped to the ground.
3. Hovering it scales it to `1.35` over `--motion-fast` and lights its list row,
   both directions, through the one `hoveredCairnIds` set #251 already holds.
4. Clicking it selects it and opens it — `onSelectCairn` then `onOpenCairn`, in
   that order, the same pair a 2D marker click and a list row both call.
5. The selected marker takes `CairnMarker`'s existing selected treatment and
   rises above its neighbours.
6. Turning 3D off returns the 2D map with its markers, its clustering and its
   fan-out entirely unchanged.

## Which cairns draw, on which face

**Parity with 2D, face for face.** This is the rule, and it resolves the one
question the issue does not answer.

| Face | 2D draws | 3D draws |
|---|---|---|
| World view | loose cairns (`LooseLayer`); a trip is one dot and its cairns are not drawn | loose cairns |
| Trip open | that trip's cairns (`CairnLayer`) | that trip's cairns |
| Track open | that track's cairns | that track's cairns |

The alternative was to draw every trip's cairns in the 3D world view, on the
argument that 3D has already abandoned the trip dot — a trip there is a set of
routes, not one marker, so it is the one place the trip is still collapsed.

**Rejected**, because the issue asks for parity and this would be a new
information-density decision smuggled in beside it. A trip's cairns have never
shown on the world view on either surface, nobody has asked for them, and
opening the trip is one click away. If the emptiness turns out to read as a bug
the way #271's did, that is its own issue with its own reasoning.

## Selection

`CairnMarker` already draws the selected treatment and it is unchanged here. The
only 3D-specific part is stacking: with no `zIndex`, the selected marker is
removed and re-appended so it is last in the surface's child order, which puts it
in front of anything it overlaps.

**One marker moves, not the whole set.** Re-appending every marker on every
selection change would rebuild the layer on a hover-adjacent interaction; moving
one is what the 2D layer's `zIndex={selected ? 1 : 0}` already achieves and this
is the same effect by the only means available.

A cairn selected in 2D and still selected when 3D is switched on arrives selected
— the selection is state in the column, not in either surface.

## Hover

Unchanged from #251's "one treatment, three sources", with the 3D marker as a
fourth source that writes the same set. `pointerenter` and `pointerleave` on the
hosted element write `hoveredCairnIds`; a list row's hover lights the 3D marker
by the same read.

The scale is `1.35` over `--motion-fast`, from
`CairnLayer.css`'s existing `.cairn-layer__hit--hovered` rule, which the portal's
wrapper carries so there is no second definition of the emphasis scale.

**Focus and blur are not wired.** The 2D marker's `tabIndex={-1}` exists so #55's
lightbox can return focus to it, and the 3D surface has no equivalent return
path. Adding a focusable marker to a surface nothing focuses into is dead code.

## Clustering does not come to 3D

The 2D trip layer clusters through
`clusterMarkers(clusterable, zoom, MARKER_FOOTPRINT_PX)` — screen-space maths
needing a zoom level and a flat projection. `Map3DElement` has neither: it thinks
in metres of `range` from a target, a tilted camera puts near and far markers at
very different screen densities, and there is no documented way to project a
coordinate to a pixel. #194's fan-out, its leader lines and
`clusterSeparatesAtZoom` all inherit those dependencies.

**In 3D every cairn draws and overlap is accepted.** Overlapping markers are all
still present and all still clickable, so #194's actual promise — every cairn is
reachable from the map alone — survives without the machinery. Tilting or moving
the camera separates them, which is a gesture 3D makes cheap and 2D does not.

`collisionBehavior: OPTIONAL_AND_HIDES_LOWER_PRIORITY` is the tempting one-line
alternative and is **rejected**: it hides markers with no gesture that brings
them back, which is the single thing #194 was written against. Markers are left
at the default `REQUIRED`.

Note this is a smaller departure than it sounds. The world view's loose cairns
are already unclustered in 2D — `LooseLayer` draws one marker per item — so the
only face where 3D differs from 2D is an open trip.

## The panel line goes

`LayersControl`'s third line, present only while 3D is on, is deleted along with
its test:

> ~~Cairns don't show in 3D yet.~~

Nothing replaces it. The panel returns to the two switches and the
`Satellite only` caption, exactly as #271's diagram draws it minus that line.
There is no "cairns don't cluster in 3D" line to take its place — a missing
feature that made content vanish earned a sentence, and a difference in how
markers group does not.

## States

| State | The 3D map |
|---|---|
| 3D on, cairns in view | every one drawn, at parity with 2D for that face |
| 3D on, no cairns in view | terrain and routes — not an empty state, the same as #271's "no geometry in view" row |
| Thumbnail not loaded yet | the `--surface-lift` fallback fill, as in 2D — never an empty space and never a spinner |
| Thumbnail failed | the same fallback fill, permanently. Unchanged from 2D. |
| No access token | every thumbnail marker draws the fallback fill; pins are unaffected |
| Filter or facet excludes a cairn | it is not drawn, from the one filter that drives the list and both map surfaces |
| Trip opened while 3D is on | that trip's cairns draw, the world's loose cairns stop — a content change, not a camera change |
| Placement queue running | no 3D cairn markers change; the queue owns the 2D map, per *Out of scope* |
| 3D failed after starting | the surface falls back to 2D and its markers go with it |
| Disconnected / signed out | cairns draw if their records are loaded; drawing is a way of looking, not a mutation |

## Edge cases

- **Flipping 3D off and on repeatedly.** The layer follows the surface, and the
  surface is mounted once for the session (#271). Markers are diffed by cairn id
  the way `Track3DLayer` diffs by track key, so nothing is duplicated and nothing
  is orphaned.
- **A cairn behind a ridge.** **Superseded by #285** —
  [285-cairns-behind-the-terrain.md](285-cairns-behind-the-terrain.md). On real
  terrain at a real tilt this read as broken rather than as a neutral platform
  default, so the app now computes occlusion itself with the Elevation API
  rather than accepting `MarkerElement`'s lack of `drawsWhenOccluded`.
- **Two cairns at the same coordinate.** Both draw, one on top of the other. The
  upper one takes the click. This is the accepted cost of *Clustering does not
  come to 3D*, and it is reachable by moving the camera.
- **A cairn added, moved or deleted in 2D, then 3D switched on.** The layer reads
  the same records, so it arrives current. There is no cached geometry to
  invalidate.
- **A cairn moved by a drag in 2D while 3D has been mounted this session.** The
  3D marker's position follows the record on the next render, the same way the
  2D marker does.
- **A trip with hundreds of cairns.** They all draw. The API notes
  `MarkerElement` is slower than `Marker3DElement` past about a thousand markers;
  cairn is personal-use and nowhere near it. This is a measurement to take if it
  ever bites, not a design to pre-empt.
- **`prefers-reduced-motion: reduce`.** The hover scale is a `transform`
  transition on `.cairn-marker` and collapses under the design language's global
  block, with no rule of its own here.

## Mobile

Nothing about the Layers panel changes except that it loses a line. The markers
are the same size in CSS pixels as they are in 2D, and the same `--hit-target`
wrapper gives them the same touch area.

`pointerenter` does not fire meaningfully on touch, so a tap selects and opens
without a hover step — which is what a tap on a 2D marker already does.

## New tokens

None. `--marker-size`, `--marker-poi`, `--marker-ring`, `--dot-size`,
`--hit-target`, `--surface-lift`, `--motion-fast`, `--accent` and the `1.35`
emphasis scale all already exist and are all reached through the components and
CSS this issue reuses rather than rewrites.

## Standing document amendments

One, in `shell-and-content-model.md`, and it is a correction rather than a new
rule.

#271 added this under *Routes*:

> **On the 2D map.** In 3D there are no marker glyphs, so routes draw at rest
> and the world view is a set of routes on terrain. Both surfaces read the same
> `overview.geojson`; the performance rule is unchanged.

The conclusion still holds — routes do still draw at rest in 3D — but its stated
reason stops being true the moment this issue lands, and a rule kept alive by a
false premise is one somebody deletes later for the right reason and the wrong
outcome. It becomes:

> **On the 2D map.** In 3D a trip has no dot and a track has no tile, so a
> track's route is the only thing that can stand for it and routes draw at rest.
> Cairns do draw their own markers in 3D (#273), unclustered; that is the one
> kind whose glyph exists on both surfaces.

Nothing else in that file moves.
