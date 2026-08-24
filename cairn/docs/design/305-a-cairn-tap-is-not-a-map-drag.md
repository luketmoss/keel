# 305 — a cairn tap in 3D is not a map drag

#293 said the map must not also claim the press. It still does.

Standing documents: [design-language.md](design-language.md),
[cairns.md](cairns.md). Prior notes:
[293-clicking-a-cairn-in-3d.md](293-clicking-a-cairn-in-3d.md) (the
reconstructed tap, and why `click` is not usable here),
[273-cairns-in-the-3d-map.md](273-cairns-in-the-3d-map.md) (the marker, the
portal, and what parity with the 2D layer means),
[285-cairns-behind-the-terrain.md](285-cairns-behind-the-terrain.md) (occlusion,
which decides whether a marker can be pressed at all).

## Why

> *"In 3d view, when clicking on a photo in the map, it behaves as though I am
> holding the mouse button and the map moves with the mouse even though I am not
> clicking the button."*

#293 reconstructed the tap from `pointerdown`/`pointerup` and stopped
propagation on the press so `<gmp-map-3d>`'s greedy gesture handling would not
also take it. The tap half worked; the stop never did. React dispatches its
synthetic events from a listener on the app root — an **ancestor** of the map
element — so by the time `stopPropagation` runs, the map has already seen the
native press and begun a gesture. The user gets the selection *and* a camera
that has latched onto their pointer.

The fix is not a different threshold or a different event. It is doing the stop
somewhere it can actually happen: **the outermost node in the press's path that
this app owns**, which is the `<gmp-map-3d>` element itself, above everything
inside its own shadow tree.

## The rule

**A press that begins on a cairn marker belongs to the marker, start to finish.
The camera does not move during it.**

Not "the camera moves less", not "the camera stops when the tap resolves" — a
press that starts on a marker is not a camera gesture at all, whichever way it
ends.

## The main path

3D is on and the user presses a cairn marker.

1. The press is recognised as belonging to that marker and goes no further; the
   map never begins a gesture.
2. The camera is still for the whole press.
3. On release within the tap slop, the cairn is selected and opened — the same
   outcome as today, the same slop as today.

## States

| Press begins on | Release | Result |
|---|---|---|
| A marker | Over it, within slop | Selected and opened. Camera still |
| A marker | Over it, beyond slop | Nothing selected. Camera still |
| A marker | Off it | Nothing selected. Camera still |
| Empty map | Anywhere | The map's own pan / orbit, unchanged |
| An occluded marker | — | The marker is not pressable; the press is the map's, as #285 already specifies |

## Edge cases

- **Dragging off a marker.** Nothing happens — no selection, and no camera
  movement either. Losing an orbit that started on a marker is the smaller cost:
  the map is everywhere and the marker is small, so a press that landed on a
  marker was aimed at the marker.
- **A second pointer during a press** (a pinch that starts with a finger on a
  marker). The marker's press is abandoned on cancel and nothing is selected.
  The map's own multi-touch handling is not intercepted.
- **The marker is removed mid-press** — the cairn is deleted, a facet filters it
  out. The press resolves to nothing.
- **Selection re-stacks the marker.** Selecting re-appends the marker so it
  draws in front (#273). That happens after the press has resolved and does not
  affect it.
- **Hover.** Unchanged, and still ordinary DOM events on the marker's own
  content: hovering a marker lights its row, hovering a row lights the marker.
- **Track lines.** A 3D route click is `gmp-click` on the polyline and is not
  touched by any of this.

## Copy

None. This issue adds no strings.

## New tokens

None. `CAIRN3D_TAP_SLOP` stays what #293 set it to, and stays a module constant
for the reason that note gives: it is a threshold read in JS and never reaches a
stylesheet.
