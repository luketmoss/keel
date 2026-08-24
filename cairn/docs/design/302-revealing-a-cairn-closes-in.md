# 302 — revealing a cairn closes in

Selecting a cairn from a list should arrive *at* it, not merely point the camera
its way.

Standing documents: [design-language.md](design-language.md) (the motion
durations), [shell-and-content-model.md](shell-and-content-model.md) (the
column, the sheet, and what the map's visible area is),
[cairns.md](cairns.md) (a cairn is one thing at a coordinate, photo or not).
Prior notes:
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the reveal rule this amends),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) (the
cluster fit and its own zoom cap),
[251-linked-hover.md](251-linked-hover.md) (what selection is *not*).

## Why

> *"When clicking on a cairn or photo in the side panel, the map should zoom in
> a bit and jump to that spot."*

#270's rule moves the camera by the least it can, and only when it has to. For a
track that is exactly right: the track has an extent, the user chose a zoom that
holds it, and taking that zoom away is taking away their own framing.

A cairn has no extent. Its bounds are a point, so it fits at every zoom, so it
always takes the pan branch, so its zoom is never touched. "As close as it can
get" for something with no size has to be expressed as a zoom or it is not
expressed at all — and from the world view, the honest description of what
selecting a photo does today is that the map slides sideways and nothing
arrives.

So: **a cairn's reveal is a different move from a track's**, not a special case
of it. That is the one decision in this note. The alternative — teaching
`revealPoints` to treat zero-size bounds as "fit me" — was rejected because it
would also change what a cluster fit and a degenerate track do, and neither of
those is broken.

## The main path

The user selects a cairn: a row in a trip's cairn list, a loose cairn's row in
the shell list, or the marker itself on the map.

1. The camera moves so the cairn sits at the centre of the **visible area** —
   #270's own definition, the map minus the column on desktop and minus the
   sheet at its settled detent on a phone. Unchanged from today.
2. The zoom closes in to the **cairn close-up zoom**, over `--motion-slow`.
3. If the map is already closer than that, the zoom is left exactly where the
   user put it. The reveal closes in; it never backs out.

The two moves are one gesture — the camera glides to its new centre and zoom
together, not pan-then-zoom.

## The close-up zoom

`CLUSTER_MAX_ZOOM` — the cap #194 already chose for "zoomed to a cluster of
photos taken at one viewpoint". A cairn is the same subject at a count of one,
and a second constant meaning the same thing is how a project ends up with two
numbers that drift.

| Camera before | After selecting a cairn |
|---|---|
| World view | Centred on the cairn, at the close-up zoom |
| A trip framed | Centred on the cairn, at the close-up zoom |
| Already closer than the close-up zoom | Centred on the cairn, zoom untouched |
| Already centred on it and closer | Nothing moves |

## States

| State | Behaviour |
|---|---|
| Cairn with a position | The main path |
| Cairn with no position (unplaced, awaiting the placement queue) | No camera move. It has no coordinate to reveal |
| A decision owns the map — import draft, placement queue, create gesture | No camera move. `revealSuspended` is unchanged by this issue |
| Map has no viewport yet (first frame) | No camera move, same guard `revealPoints` already keeps |
| `prefers-reduced-motion` | Centre and zoom are set directly, with no glide |

## Edge cases

- **Selecting the cairn that is already selected.** Selection does not change,
  so nothing fires — the reveal is keyed on the selection changing, never on the
  camera. #270's most important line, unchanged.
- **A clustered cairn.** The cairn's own coordinate is what is revealed, not the
  cluster's anchor — as #270 already specifies. Closing in usually pulls the
  cluster apart, at which point the member marker takes the selected treatment
  by the same recompute #251's hover relies on.
- **Clicking a cluster.** Still #194's fit-to-members. Unchanged.
- **Rapid selection down a list.** Each selection replaces the last move; the
  camera does not queue. Whatever is selected last is where it lands.
- **Selecting a cairn from the map marker.** Same rule, deliberately. A marker
  the user just clicked is already on screen, and usually already inside the
  close-up zoom, so in practice this is a small move in or nothing at all —
  and where it is not (a marker clicked from a wide view), closing in is the
  same thing the user asked for from the list.

## Copy

None. This issue adds no strings.

## New tokens

None. `--motion-slow` is the map camera's existing duration and the close-up
zoom is a parameter of a view of data, not a design token — the same reasoning
`camera3D.ts` and `flyover.ts` already carry for their own constants.
