# 251 — the list and the map light together

One hovered cairn, two views, both directions.

Standing documents: [shell-and-content-model.md](shell-and-content-model.md),
which already requires this — *"Rows are `--row-touch` minimum. Hover and the
map's matching marker light together in both directions."* —
[design-language.md](design-language.md) for the states and the one accent, and
[cairns.md](cairns.md) for what a cairn's marker is. Prior notes:
[54-photo-markers.md](54-photo-markers.md) (the selected treatment this must not
impersonate), [194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md)
(clusters and the fan), [198-cairns-follow-their-track.md](198-cairns-follow-their-track.md)
(hidden rows), [80-trips-panel.md](80-trips-panel.md) (where "a row and its dot
are one object for hover" was established).

**This is not new behaviour, it is missing behaviour.** The world map already
does exactly this: `App.tsx` holds one `hoveredTripId`, `TripsPanel`'s rows
write it on `mouseenter` / `focus` and `LooseLayer`'s markers write the same
state from the map. A trip's own map is the surface where it matters most and
is the one place it was never wired.

## The main path

Inside a trip:

1. **Move the pointer onto a cairn row.** That cairn's marker on the map lights.
2. **Move off.** It stops.
3. **Move the pointer onto a cairn marker.** That cairn's row in the sidebar
   lights.
4. **Move off.** It stops.

Focus and blur do the same thing as enter and leave, on both surfaces — the
standing document's "one treatment, three sources", and the reason this is not a
mouse-only feature.

## The state

One `hoveredCairnIds: ReadonlySet<string>` in `TripDetail`, written by both
views and read by both — the shape `App.tsx` already uses, widened from an id to
a set for the one reason clusters give below. It is empty at rest, and it holds
exactly one id in every case except a hovered cluster.

Nothing else derives from it. Hover **never** changes the selection, moves the
camera, scrolls the list, expands a row (#250), or opens anything.

## The treatment

Hover is a weaker claim than selection and must not be able to impersonate it.
#54 spends `--accent` at `--marker-ring-selected` plus the licensed
`drop-shadow(0 0 7px)` glow on the selected marker, one at a time; if hover took
the same treatment, the selected cairn would become unfindable the moment the
pointer entered the list.

**The marker, hovered**

| Property | Value |
|---|---|
| Ring | `--accent` at `--marker-ring` — the orange moves, at the thinner width |
| Glow | **None.** The glow stays the selected marker's alone |
| Scale | `1.35`, over `--motion-fast` — the world map's existing hover treatment, unchanged |
| Provenance ring | Replaced while hovered, restored on leave — the same trade #54 already makes for selection |

Three differences from selected — ring width, glow, and the fact that a hovered
marker is scaled — so the two read apart at a glance even side by side.

**A hovered marker that is also the selected one** keeps the selected treatment
in full and adds the scale. Selection is not degraded by pointing at it.

**The row, hovered**

`--hover` fill, the language's row hover, applied by class rather than by the
`:hover` pseudo-class so the map can produce it. A pointer over the row and a
pointer over its marker have to produce the same pixels; two rules that drift
apart is the failure mode this replaces.

A **selected** row keeps `cairn-row--selected` on top of it. A **hidden** row
(#198) keeps its hidden treatment and lights anyway — its marker is off the map,
so hovering the row lights nothing, and hovering nothing back would make the row
look inert when it is not.

## Clusters

The half that is not symmetric, and the reason the state is a set.

| You hover | What lights |
|---|---|
| A row whose cairn is inside a collapsed cluster | The cluster marker |
| A cluster marker | **Every row** it holds |
| A cluster whose members include the selected cairn | The cluster, plus the selected row's own treatment, unchanged |

A cluster is not ambiguous about *which* cairns it stands for — only about which
one you meant, which is why #54 refuses to select from one. Lighting all of its
rows answers the question the pointer is actually asking, and the count on the
cluster already said how many to expect.

The cluster marker's own hover treatment is the scale and the `--accent` ring,
same as a single marker's. It has no thumbnail to ring, and the ring is drawn on
the cluster circle.

**The expanded fan (#194) is out of scope.** Its members are individual markers
in a temporary arrangement; hover on them is a fair follow-up and is not
specified here.

## States

| State | Row → marker | Marker → row |
|---|---|---|
| Ordinary cairn | Lights its marker | Lights its row |
| Selected cairn | Selected treatment plus the scale | Row keeps selected, gains nothing it did not have |
| Hidden by track visibility (#198) | Nothing on the map to light | Not reachable — the marker is not drawn |
| Filtered out by a facet | Not in the list, not on the map. Unreachable from either side | Same |
| Inside a collapsed cluster | Lights the cluster | The cluster lights every member row |
| Expanded row (#250) | Lights its marker, unchanged | Lights the row header; the preview is not tinted |
| Removing, or confirming a delete | Lights normally. Hover says *this one*, and that is still true of a row being removed | Same |
| Thumbnail not loaded | The `--surface-lift` fallback marker takes the ring and the scale like any other | Same |
| Disconnected (#73) | Unaffected. Pointing reads nothing | Same |
| Lightbox open | Unaffected underneath, and unreachable through the scrim | Same |

## Edge cases

- **Moving from one row straight to the next.** The set holds one id at a time;
  `mouseleave` on the first and `mouseenter` on the second land in that order and
  the emphasis moves rather than accumulating.
- **The pointer leaves the window entirely.** `mouseleave` fires on the row or
  marker it was over, and the state empties. There is no listener on the window
  and none is needed.
- **A hovered row's cairn is removed under the pointer.** The id no longer
  matches any cairn, so it matches nothing and lights nothing — the same
  self-cleaning property `expandedKey` already has in `CairnLayer`.
- **Hovering a row whose marker is off screen.** The marker lights where it is.
  Nothing pans; a camera that chased the pointer would be unusable.
- **Hovering a marker whose row is scrolled out of the list.** The row lights
  where it is. **The list does not scroll** — a list that jumps while the pointer
  is on the map is worse than not knowing which row it was, and the selection
  click still scrolls, as it always has.
- **A cluster of forty.** Forty rows take `--hover`. That is honest, and it is
  also the moment the user learns the cluster is worth zooming into.
- **The zoom changes while a row is hovered.** Clusters recompute; the same set
  of ids now matches different markers and the emphasis follows. Nothing has to
  be invalidated.
- **Dragging a marker (#158).** The drag's own treatment wins; hover emphasis is
  additive and does not fight it.
- **Reduced motion.** The 1.35 scale's transition collapses under the global
  block — the marker still scales, it just arrives instantly. The ring is a
  colour change and already collapses.
- **Touch.** No pointer, no hover, and nothing about a tap changes. This adds no
  state a touch user can get stuck in, which is the test #54 applied when it
  refused a hover *preview*.

## Copy

None. No strings, no tooltips, no name chip.

**No name chip on the trip map**, which is a deliberate departure from the
standing document's world-map treatment ("scale the marker to 1.35 and reveal
its name chip"). On the world map the chip is the only place the name appears at
all; inside a trip the sidebar row is right there and lights in the same
instant, so a chip would be the name said twice, over the photograph, at the
moment the user is looking at the row.

`aria-label`s on the markers are #54's and are unchanged. Hover emphasis is
decoration on a pointer position and is deliberately not announced.

## New tokens

None. `--accent`, `--marker-ring`, `--hover` and `--motion-fast` all exist, and
the 1.35 scale is the standing document's value, already implemented in
`LooseLayer.css`.

## Decisions taken here

- **Hover takes the accent ring but not the glow.** The orange moves, as asked,
  and the selected marker stays the one thing that is glowing.
- **A hovered cluster lights all its rows** rather than none. #54's refusal to
  *select* from a cluster is about picking one; pointing at all of them is not
  the same act.
- **The list never scrolls on hover.** See the edge case; this is the decision
  that could most reasonably have gone the other way.

## Out of scope

Loose cairns on the world map and in the shell panel — they already have this,
and their treatment is not reworked. The missing map-to-row direction for
*tracks* (`TrackList` lights its polyline, and the polyline lights nothing back)
— the same gap, a different list, its own issue. Hover on the expanded cluster
fan's members. Previewing a photo on hover: a hover that reveals content does not
survive touch, and the preview question is #250's. Any change to what a click
does, on either surface.
