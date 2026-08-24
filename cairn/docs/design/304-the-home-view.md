# 304 — the home view

Where the map starts, and the one control that goes back there.

Standing documents: [design-language.md](design-language.md) (tokens, motion),
[shell-and-content-model.md](shell-and-content-model.md) (the map's corners —
bottom right is fit-to-everything, then zoom in / out). Prior notes:
[2-map-shell.md](2-map-shell.md) (the map's own chrome),
[37-world-map.md](37-world-map.md) (the world view's fit),
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the visible area and its insets),
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) (the 3D
surface and the zoom-to-range conversion),
[303-a-3d-reveal-frames-the-ground.md](303-a-3d-reveal-frames-the-ground.md)
(resolving the ground before a 3D camera move).

## Why

> *"I think the default view at home should be at the Colorado zoom level. I am
> mostly in that state and can zoom out to get to world view. I also want a
> 'reset' button of sorts on the map so that when I am NOT in a trip I can click
> it to reset back to this Colorado view."*

The whole world at zoom 2 was the right answer when there was nothing to show.
There is something to show now and it is all in one state. And once the camera
has wandered — a flyover left it over a ridge, a 3D orbit left it facing
south — there is no way back short of dragging. Fit-to-everything is not that
way back: it frames whatever is loaded, and it is disabled when nothing is,
which is exactly the situation the user is describing.

## The home view is an extent, not a zoom

Colorado, as bounds: **37.0 N to 41.0 N, -109.05 W to -102.04 W**.

Bounds rather than a centre and a zoom level, because a zoom level that fills a
1440px-wide desktop window shows a third of the state on a phone. Fitting an
extent gives the same *place* on every window, which is what "the Colorado zoom
level" actually means.

The extent is fitted inside the **visible area** — the map minus the column on
desktop, minus the sheet on a phone — the same inset every reveal already
respects. Colorado ends up centred in the space the user can actually see, not
behind the panel.

## The main path

**On load.** The map opens on the home view, once it reports a viewport. No
imported content is needed and none is waited for.

**Reset.** The user presses `Reset view` in the map's bottom-right stack.

| 3D | What happens |
|---|---|
| Off | The 2D map fits the home extent, inset-aware, over `--motion-slow` |
| On | The 3D camera flies to the home extent — its centre, a range covering it, **heading 0 and the surface's standard tilt**, with the look-at resolved onto the ground — over `--motion-slow` |

A reset resets *orientation* too. That is the difference between this and a pan:
after a flyover has left the camera facing an arbitrary direction, "reset" that
kept the heading would not read as a reset at all.

What it does **not** touch: the basemap, the labels switch, whether 3D is on,
the open face, or any selection. It is a camera control and only a camera
control.

## The control

Bottom right, in the existing stack, **above** fit-to-everything — the standing
document's corner for camera controls, and the order puts the coarsest move at
the top.

| | |
|---|---|
| Glyph | `⌂`, `aria-hidden` |
| Accessible name | `Reset view` |
| Style | The existing `map-controls__button` — `--surface`, `--radius-sm`, `--border`; no new styling |
| Enabled | **Always.** It never depends on there being content, which is the whole point of it |

Fit-to-everything keeps its `⛶`, its behaviour and its disabled state. Two
controls, two questions: *show me what I have* and *take me home*.

## States

| State | Behaviour |
|---|---|
| Nothing imported | Control enabled; opens and resets to Colorado |
| A trip open, camera on the trip | Control enabled. Pressing it leaves the trip open and moves the camera home |
| Map unavailable (no key, key rejected) | The whole control stack goes with the map, as it already does |
| 3D on | The 3D form of the reset, above |
| 3D on but the ground cannot be resolved | The camera still arrives, at tilt 0 — #303's fail-safe, the same rule |
| `prefers-reduced-motion` | The camera is set directly, with no glide |

## Edge cases

- **Pressed twice.** The second press replaces the first move. Already home,
  it is a no-op the user cannot tell from a very short glide.
- **Pressed mid-flyover.** The flight is cancelled and the camera goes home —
  the same "a deliberate input on the surface cancels the flight" rule #274
  already has.
- **Pressed while a decision owns the map** (import draft, placement queue,
  create gesture). It still works. `revealSuspended` exists to stop the app
  moving the camera out from under a decision; this is the user moving it
  themselves.
- **Phone, sheet at full detent.** The visible area can be too small to fit the
  extent into; the fit still runs and lands as close as it can, the same
  degenerate case #270 already accepts.

## Copy

| Where | String |
|---|---|
| Accessible name | `Reset view` |
| Tooltip (`title`) | `Reset view` |

## New tokens

None.
