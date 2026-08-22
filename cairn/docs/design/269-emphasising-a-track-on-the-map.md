# 269 — emphasising a track on the map

Two strengths of emphasis, and a stacking order so neither can be buried.

Standing documents: [design-language.md](design-language.md) — **decisive
here**, it licenses the one route effect and says who may spend it —
[shell-and-content-model.md](shell-and-content-model.md) (routes draw on hover
and on selection; markers, rings and the one-object rule). Prior notes:
[5-track-rendering.md](5-track-rendering.md) (the polyline and its casing),
[49-motion-elevation.md](49-motion-elevation.md) — **revised here**, the halo
moves off hover — [251-linked-hover.md](251-linked-hover.md) (the hover-versus-
selection rule this borrows wholesale, and the note that named this gap),
[268-expanding-a-track-row.md](268-expanding-a-track-row.md) (the row click
that now also selects), [193-trip-row-anatomy.md](193-trip-row-anatomy.md),
[218-track-and-trip-stats.md](218-track-and-trip-stats.md).

## Why

> *"I would also like the track to better visualize on the map when it's
> selected or hovered over. If the track is 'behind' another track, it doesn't
> do anything."*

The second sentence is a stacking bug and the first is a missing state, and
they are worth separating because only one of them is a bug.

**The stacking.** No polyline in `TrackLayer` carries a `zIndex`, so Google
Maps draws them in creation order — the trip's own track order. Track 1's
emphasis is drawn under tracks 2 through 6. The cases where a user most needs
to tell two tracks apart are exactly the cases where they overlap: an
out-and-back, a shared approach, a road walk between two days. The feature is
therefore absent precisely where it was wanted.

**The missing state.** `design-language.md` licenses one route effect and is
explicit about what buys it:

> **Active-track glow.** The selected track's polyline carries
> `drop-shadow(0 0 7px)` in its own colour. Only one track at a time, and only
> on explicit selection — a glow on everything is a glow on nothing.

There is no track selection in cairn, so #49 spent that effect on hover. The
strongest emphasis the language allows is fired by a pointer passing over a
row, and a track the user actually picked has nothing left to say with.

## The two strengths

#251 settled this shape for cairn markers and its reasoning transfers without
change:

> Hover is a weaker claim than selection and must not be able to impersonate
> it. … if hover took the same treatment, the selected cairn would become
> unfindable the moment the pointer entered the list.

| | Casing | Stroke | Halo | Band |
|---|---|---|---|---|
| **Rest** | `#00000059`, weight 5 | the track's colour, weight 3 | — | rest |
| **Hovered** | `#00000059`, weight 7 | the track's colour, weight 4 | — | hovered |
| **Selected** | `#00000059`, weight 9 | the track's colour, weight 5 | the track's colour at `0.30`, weight 17 | selected |
| **Selected and hovered** | the selected row, unchanged | | | selected |

Three differences between hovered and selected — the halo, the weights, and
the band — so the two read apart even where they touch. **A hovered track that
is also selected keeps the selected treatment in full**; selection is not
degraded by pointing at it, which is #251's rule verbatim.

Rest is unchanged from #5. Nothing about a map at rest moves.

**The halo is the language's `drop-shadow(0 0 7px)`, transcribed.** A
`Polyline` exposes no filter, so the glow is a wider stroke at low opacity
beneath the casing — #49's own approximation, kept, and moved to the state it
was licensed for. Its width follows from the line it wraps: #49's weight 9 sat
around a weight-5 casing and read as 2px of halo each side. The selected casing
is 9, and selection is now the strong effect rather than the weak one, so it
gets twice that — 4px each side, hence weight 17.

**Colour is never the only carrier.** Every step also changes weight, so the
three states are distinguishable in a screenshot, at low contrast, and against
a track whose own colour is close to the halo's.

## The stacking order

Every polyline gets an explicit `zIndex`, composed of three parts:

```
zIndex = band + (track index × 10) + layer
```

| Part | Values |
|---|---|
| Band | rest `0` · hovered `10000` · selected `20000` |
| Track index | the track's position in the trip, `× 10` — so resting tracks keep the deterministic order they have today |
| Layer | halo `0` · casing `1` · stroke `2` |

Two properties fall out and both are the point:

- **A hovered or selected track, and its casing and halo, draw above every
  resting track**, whatever order the trip lists them in.
- **A selected track draws above a hovered one.** Sweeping the pointer down the
  list never covers the track you picked.

The bands are module constants in `TrackLayer.tsx` beside `DRAW_ON_DURATION_MS`,
not CSS custom properties — a `zIndex` handed to the Maps API never reaches a
stylesheet, and `--motion-slow` already has a transcribed twin there for the
same reason. `MARKER_FOOTPRINT_PX` in `CairnLayer.tsx` is the other precedent.
Naming them and giving them one table is what keeps them from being five
scattered magic numbers.

## Selection

**`TripDetail` gains `selectedTrackId`.** A track row's click sets it.

**Held apart from #268's `expandedTrackId`**, for the reason #250 gives for the
cairn pair: derived, the header's second click would have to deselect in order
to collapse, and losing the map's highlight is not what *"close this detail"*
means. Collapsing a row leaves its track selected.

**A multi-track file's row selects.** #268 gives it no expanded state — a file
with three tracks has no unambiguous single set of numbers (#6, #7) — and left
its click doing nothing. It has an unambiguous *position*, so selecting it is
meaningful where expanding it is not, and every polyline in the file takes the
selected treatment together. This is what its click means from here on.

**Nothing deselects except selecting another track**, or leaving the trip.
There is no click on the empty map that clears it, which is #194's contract for
cairns — *"there is no click that deselects"* — and the reason holds harder for
a route: the highlight costs nothing to leave on, and losing your place to a
stray pan is worse than any tidiness it buys.

**A track selection and a cairn selection are independent.** They are different
objects at different scales, and reading a track's profile while stepping
through the photos taken along it is one task, not two. `selectedTrackId` and
`selectedCairnId` never clear each other.

## States

| State | The map |
|---|---|
| Rest | #5's casing and stroke, rest band |
| Row hovered | Hovered treatment, hovered band |
| Marker or route hovered from the map | Not a source yet — nothing on the map reports hover for a track. #270's |
| Row selected | Selected treatment with the halo, selected band |
| Selected and hovered | Selected treatment, selected band. Hover adds nothing |
| Hidden with the visibility control | **No route at all**, selected or not. The selection is kept — #193's rule is that hiding a track on the map does not make it less the one you picked, and showing it again restores the highlight |
| Single-point track | Drawn as a circle marker, not a polyline. Hovered and selected scale it from radius 5 to 7 and raise it into the matching band; no halo, since there is no line to wrap |
| Multi-track file | Every one of its polylines takes the same treatment and the same band together |
| Drawing on (#5's draw-on) | The revealed prefix takes whatever treatment applies. A track imported into a hovered row emphasises as it draws |
| Removing, or confirming a delete | Treatment unchanged while the row is inert. The route disappears with the file |
| Disconnected (#73) | Unaffected. Emphasis reads nothing |
| Trip still loading (#35) | Tracks emphasise as they arrive. Indices are assigned from the list as it stands, so a later arrival re-bands nothing visible |

## Edge cases

- **The selected track is removed, or removed from the trip.** The selection
  clears with it, by an id-no-longer-matches guard — the self-cleaning shape
  `expandedKey` already has in `CairnLayer`.
- **The selected track is hidden.** The selection stays; the route is simply
  not drawn. See the States table.
- **Two tracks exactly on top of each other**, one selected. The selected one
  is above by band, and its halo shows around the other's stroke where they
  diverge by even a few metres. Where they are pixel-identical there is nothing
  any treatment can do, and the row is what disambiguates.
- **A track whose colour is close to `#00000059`.** The casing widening from 5
  to 9 is the carrier there, not the colour.
- **The colour changes while selected.** Stroke and halo restyle immediately —
  both read the value the swatch and the profile read.
- **The pointer moves from one row straight to the next.** One hovered id at a
  time; `mouseleave` and `mouseenter` land in that order and the band moves
  rather than accumulating. #251's own edge case, same mechanism.
- **The pointer leaves the window.** `mouseleave` fires on the row and the
  hover clears. No window listener.
- **A trip with 200 tracks.** The index term allows 1,000 per band before two
  tracks could collide, and a collision inside a band is only the ordering the
  map has today.
- **Reduced motion.** Nothing here animates. `Polyline` options change on the
  next frame and there is no transition to collapse — worth stating, since
  every other state change in the app has one.
- **Touch.** No hover. A tap on a row selects, and the selected treatment is
  the only one a touch user will see — which is the argument for it being the
  strong one.

## Copy

**None.** No labels, no chips, no tooltips on the map.

Routes are `clickable={false}` and are not in the tab order, so there is
nothing here to announce. The row is the accessible representation of a track
and it carries the state — its `aria-expanded` from #268, and the selected row
treatment `design-language.md` already defines (`--accent-soft` fill,
`--accent` text).

## New tokens

**No CSS custom properties.** The values above are module constants in
`TrackLayer.tsx`, for the reason given under *The stacking order*.

| Constant | Value | For |
|---|---|---|
| `TRACK_Z_REST` | `0` | Band base, a track at rest |
| `TRACK_Z_HOVERED` | `10000` | Band base, the hovered track |
| `TRACK_Z_SELECTED` | `20000` | Band base, the selected track |
| `TRACK_WEIGHT_REST` | `[5, 3]` | Casing and stroke at rest — #5's values, named |
| `TRACK_WEIGHT_HOVERED` | `[7, 4]` | Casing and stroke, hovered |
| `TRACK_WEIGHT_SELECTED` | `[9, 5]` | Casing and stroke, selected |
| `TRACK_HALO_WEIGHT` | `17` | The selected track's halo |
| `TRACK_HALO_OPACITY` | `0.30` | The selected track's halo |

## Decisions taken here

- **The halo moves from hover to selection**, which revises #49. The language
  licensed it for selection and #49 could only spend it on hover because
  selection did not exist. It does now.
- **The other routes are not dimmed while one is selected.**
  `shell-and-content-model.md` says *"selecting anything dims every other
  marker"* — markers, and the reason is a field of pins where one matters. A
  trip's routes are read against each other: which day went over the ridge,
  where two days share an approach. Raising the emphasised track answers the
  report on its own, and dimming can be added later without contradicting
  anything here. **This is the decision that could most reasonably have gone
  the other way.**
- **Hover keeps a treatment rather than being reduced to the band alone.** The
  band fixes occlusion; it does not make a track findable among six that are
  not overlapping. Both halves are needed.
- **Track selection and cairn selection are independent.** See *Selection*.

## Out of scope

- **Clicking a route to select its track**, and moving the camera to a selected
  item — both #270. This note gives that issue the state it will write to.
- **The world map's loose routes** (`LooseLayer`). A loose track's route is
  drawn *only* while it is hovered or selected, so exactly one exists at a time
  and nothing can be behind anything — the bug this note fixes cannot occur
  there. Its treatment is left as it is rather than unified on speculation.
- **Cairn markers, clustering, and the fan** (#54, #194, #251).
- **Draft imports** (#81), whose white route means unsaved and is not a
  selection state.
- **A hover source on the map for tracks.** #251 named the missing map-to-row
  direction; giving a route a pointer at all is #270's, since it arrives with
  the click.
