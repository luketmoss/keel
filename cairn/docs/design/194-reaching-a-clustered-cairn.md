# 194 — reaching a cairn on the map

Every cairn must be openable from the map alone, at any zoom, however close it
sits to its neighbours. Today two of them stacked at one viewpoint are reachable
only from the sidebar.

Standing documents: [cairns.md](cairns.md) (markers, selection),
[shell-and-content-model.md](shell-and-content-model.md) (markers and routes,
selection dimming), [design-language.md](design-language.md) (motion, states).
Prior notes: [54-photo-markers.md](54-photo-markers.md) — clustering and the
Selection section this revises — [55-photo-list-lightbox.md](55-photo-list-lightbox.md),
[158-moving-a-cairn.md](158-moving-a-cairn.md).

**What this revises in #54:** its Selection section says clicking a cluster
zooms to fit its members, and its own edge-case note accepts that two photos at
identical coordinates are reachable only from the list. That acceptance is what
this note withdraws. Everything else in #54 — the marker shapes, the provenance
ring, the footprint-based clustering — stands.

## One click opens

> **Clicking a cairn marker selects that cairn and opens its detail face, in one
> action.**

The same sentence already governs a list row. `CairnList.onOpenRow` documents it
and `TripDetail.openCairn` implements it; the map is the only surface that
stages selection and opening across two clicks, and it is the surface where a
user is least likely to expect a second one.

An already-selected marker behaves identically: it stays selected and opens.
There is no click that deselects and no click that closes — Escape and the close
control own that, per #55.

**What this gives up.** There is no longer a way to select a cairn from the map
*without* opening its detail face. That is a real loss and it is worth taking:
since #169 the detail face *is* what selection was for, the list still
highlights on hover without opening anything, and a two-click contract that
differs between two views of one object costs more than the state it preserves.

**Dragging is unaffected.** `useDraggableCairn.consumeDragClick()` already
swallows the click a drag ends with, and it is checked first in `handleClick`.
Nothing about that ordering changes.

## Reaching a cluster's members

A cluster's click has one job: get the user to the cairns inside it. There are
two ways to do that and which one applies is a computation, not a preference.

```
                     ┌─ members separate at the cap ─→  zoom to fit  (today)
click a cluster  ────┤
                     └─ they do not ────────────────→  expand in place
```

### The test

Run `clusterMarkers` over the cluster's own members at `CLUSTER_MAX_ZOOM` with
the same `MARKER_FOOTPRINT_PX`. More than one cluster back means zooming
separates them; exactly one means it never will.

This reuses the pure function that produced the cluster in the first place, so
the two can never disagree — which is the whole failure mode today, where
`clusterMarkers` says *these overlap* and `zoomToFitCluster` independently
decides whether it can do anything about it.

It also subsumes the degenerate-bounds case without special-casing it: identical
coordinates are distance zero at every zoom, so they come back as one cluster
and go straight to the expansion.

### Zoom to fit

Unchanged. `zoomToFitCluster`, `CLUSTER_MAX_ZOOM = 20`, `FIT_PADDING = 48`, the
camera moving over `--motion-slow`. Its degenerate-bounds early return stays as
a guard; it is simply no longer the only thing standing between the user and the
photo, because the test above never routes that case here.

### Expand in place

The cluster's members fan out around its anchor.

```
              ◉
        ╲     │     ╱
         ◉    │    ◉
              ▲            ← the cluster's anchor, kept in place
```

| Property | Value |
|---|---|
| Layout | Evenly spaced on a circle centred on the cluster's anchor, first member at 12 o'clock, going clockwise |
| Radius | `--fan-radius` (new token) for up to 8 members; beyond that, a second ring at 2× |
| Leader line | 1px, `--text-muted` at 40%, from the anchor to each marker's centre; drawn beneath the markers |
| Anchor | The cluster badge stays, at `opacity: 0.4`, as the thing the lines lead back to |
| Marker | Each member draws as its own `CairnMarker` at full size, with its provenance ring, exactly as an unclustered marker does |
| Motion | Markers travel from the anchor to their positions over `--motion-base`; collapse is the same in reverse |

The fan is a **presentation of the same markers**, not new objects: each carries
the same `data-cairn-id`, the same `aria-label`, the same `aria-pressed`, and
the same click behaviour as any single marker. Clicking one selects and opens
it, per the rule above.

**A fanned marker is not draggable.** Its drawn position is a lie about its
coordinate, and dragging from a lie writes a coordinate the user did not choose.
`draggable` is false for the duration of the fan; collapsing restores it. Say so
on the surface only if the user tries — a disabled-looking marker in a fan
raises a question that has no good short answer.

### Collapsing

The fan closes on any of:

- **Escape.**
- **A click anywhere on the map that is not one of its markers.**
- **Any camera move** — zoom or pan. The anchor's screen position is what the
  fan is arranged around, and a fan that lags the camera is worse than no fan.
- **Opening a different cluster.** Only one fan exists at a time.
- **Clicking one of its own markers.** The detail face is opening; the fan has
  done its job. The cairn stays selected underneath, so closing the detail face
  returns to a normal clustered map with that cairn selected.

## States

| State | Cluster badge | Members |
|---|---|---|
| Rest | Count, provenance ring, per #54 | Not drawn |
| Hover | Per #54, unchanged | Not drawn |
| Clicked, members separate | — | Camera moves; the cluster dissolves naturally at the new zoom |
| Clicked, members do not separate | `opacity: 0.4`, in place | Fanned, full size, individually clickable |
| Fanned, one member selected | `opacity: 0.4` | The selected member at its selected treatment; every other marker on the map dimmed, per `shell-and-content-model.md` |
| Fanned, camera moves | Restored | Collapsed |
| Two members, one of which is the open cairn | `opacity: 0.4` | Fanned; the open one reads as selected |

## Edge cases

- **A cluster of two.** Fans to 12 o'clock and 6 o'clock. Two markers and two
  short leader lines is not overkill — it is the minimum case the whole feature
  exists for, and it is the one in the screenshot that raised this.
- **A cluster of twenty at one coordinate.** Eight on the inner ring, twelve on
  the outer. Beyond about twenty the fan stops being usable, and that is the
  point at which the sidebar list is genuinely the better tool — do not add a
  third mode for it. The list is reachable and complete.
- **A fan near the viewport edge.** Markers may fall outside it. The map is not
  panned to accommodate them: a camera move is what collapses a fan, and moving
  the camera to reveal a fan would collapse the fan. Accepted; the user can zoom
  out one step and click again from a better position.
- **A member is deleted while the fan is open.** It disappears from the fan and
  the remaining members re-space over `--motion-base`. If one member is left,
  the fan collapses to a single ordinary marker.
- **A member's icon changes while the fan is open** (retyped from the detail
  face). Its marker redraws in place. Nothing re-spaces.
- **A facet (#192) filters the fan down.** Same as deletion: re-space, and
  collapse at one.
- **The map is at a zoom where the fan's radius exceeds the cluster's own
  spread.** Harmless — the fan is a screen-space arrangement and does not claim
  to be geographic. The leader lines are what make that legible, which is why
  they are not optional.
- **Reduced motion.** The fan appears and collapses instantly. The camera move
  in the zoom-to-fit branch already collapses under the global block, per
  design-language.md's note that it covers the map camera.
- **Touch.** A tap is the click. The fan's markers are `--hit-target`, which at
  `--fan-radius` do not overlap for eight members.

## Copy

**No visible copy is added.** There is no hint chip, no tooltip, and no
instruction on the badge: the fan happens on the click the user already made, so
there is nothing to tell them to do.

The cluster badge's existing `aria-label` (`clusterAriaLabel`) already names the
count. For the fanned state it becomes `n cairns, expanded`, and each fanned
marker keeps its own cairn's name as its label.

## New tokens

| Token | Value | For |
|---|---|---|
| `--fan-radius` | `48px` | The distance from a cluster's anchor to its expanded members |

48px keeps two `--hit-target` (40px) markers from overlapping at any angle on
the inner ring while staying close enough that the anchor is obviously the
parent. The outer ring is `2 × --fan-radius`, computed, not a second token.

## Out of scope

`WorldMap`'s clustering, which pools trips, tracks and cairns and would need its
own answer for a fan containing three kinds. The clustering geometry itself. The
detail face's contents (#196, #197). Keyboard traversal of markers, which #55
deliberately left out of the tab order.
