# 293 — clicking a cairn in 3D

The gesture #273 specified, actually arriving.

Standing documents: [design-language.md](design-language.md) (interaction
states, motion), [cairns.md](cairns.md) (the marker, and that a cairn is one
kind), [shell-and-content-model.md](shell-and-content-model.md) (the column and
the phone sheet the click opens into). Prior notes:
[273-cairns-in-the-3d-map.md](273-cairns-in-the-3d-map.md) — **the note this
repairs**, whose "Clicking it selects it and opens it" is the contract —
[250-expanding-a-cairn-row.md](250-expanding-a-cairn-row.md) (what
select-then-open does on either surface),
[194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md) (every
cairn reachable from the map alone),
[285-cairns-behind-the-terrain.md](285-cairns-behind-the-terrain.md) (the
occluded marker, which is deliberately not clickable),
[288-selecting-a-track-in-3d.md](288-selecting-a-track-in-3d.md) (the route
click beside this one, and the note that a marker takes a click over a route).

## Why

> *"Clicking a photo or cairn on the map in 3D mode does not open the cairn in
> the side bar. Nothing happens. This is on mobile but may be desktop too."*

#273 wired `click` on the portaled marker content to `onSelectCairn` then
`onOpenCairn` — the same pair the 2D marker and the list row call — on the
finding that `MarkerElement` hosts ordinary DOM and therefore ordinary DOM
events. The markers draw, they hover, and the click does not arrive.

This is worse than a missing feature, for the reason #288 gave about routes: the
identical gesture works one switch away, so 3D reads as broken rather than as
unfinished. And it takes #194's promise with it — *every cairn is reachable from
the map alone* is what 3D's lack of clustering was allowed to rest on.

**The unit tests pass.** `Cairn3DLayer.test.tsx` builds a `FakeMarkerElement`
that is a plain `<div>`, so `fireEvent.click` on the portaled content proves the
handler is wired and proves nothing about `<gmp-map-3d>`'s real event
behaviour. That gap is the finding, not an aside — see *Verification*.

## The contract

Unchanged from #273 and #250. This note re-states it because it is what
"working" means, not because any of it is new:

| You do | Effect |
|---|---|
| Tap or click a cairn marker in 3D | Selects it, then opens it — `onSelectCairn` then `onOpenCairn`, in that order |
| Tap the marker of the already-expanded cairn | Collapses its row. Stays selected (#250) |
| Tap a marker on the world view in 3D | Navigates to that loose cairn's face, as `LooseLayer` does in 2D |
| Tap a marker sitting over a route | The cairn, not the track (#288) |
| Tap an occluded marker | Nothing. It is behind terrain and `pointer-events: none` (#285) |
| Drag starting on a marker | The map pans. **No selection**, and no click when the finger lifts |
| Tap terrain, sky, or a gap | Nothing. No selection is cleared |

The side bar's half is #250's and is untouched here: a cairn with an image
expands its row, and — once #294 lands — so does one without.

## What is actually wrong

The marker's DOM never sees a `click`. `<gmp-map-3d>` runs its own gesture
handling over the whole surface (`GestureHandling.GREEDY`), and a `pointerdown`
that the surface claims — by capturing the pointer for a possible pan or orbit —
does not resolve into a `click` on the child element the gesture started on.
Touch is where this bites hardest and first, which matches the report arriving
from a phone.

**So the gesture is reconstructed from the pointer events, not read off
`click`.** On the marker's own hit wrapper:

- `pointerdown` is where the gesture is claimed for the marker: the position is
  recorded and the event's propagation is stopped so the surface does not take
  the pointer.
- `pointerup` on the same marker, within `CAIRN3D_TAP_SLOP` of the recorded
  position, is a tap: select, then open.
- Anything further than the slop is a drag, and does nothing. The map will not
  have panned, because the marker took the pointer — a 40px `--hit-target` is a
  small enough part of the surface that this is the same trade the 2D marker
  already makes.
- `pointercancel`, or a `pointerup` elsewhere, is nothing.

`touch-action: none` on the hit wrapper, so the browser does not resolve the
touch into a scroll or a double-tap-zoom gesture before `pointerup` arrives.

This is mechanism rather than design, and it is written down because it is the
part a future change is likeliest to undo by accident.

**Consequence, stated rather than discovered later:** a `pointerdown` that the
marker stops does not reach `Map3D.tsx`'s flight-cancel listener, so tapping a
marker mid-flyover no longer cancels the flight the way tapping terrain does.
The tap's own select-and-open still happens, and the cairn reveal that follows
is a later camera move which supersedes the flight anyway (#274's *last flight
wins*). Accepted.

**What this is not.** Not `gmp-click` — that belongs to `Marker3DElement` and
`Polyline3DInteractiveElement`; `MarkerElement` hosts real DOM and #273's
portal stays exactly as it is. No marker is rebuilt, no `CairnMarker` changes,
and the 2D layer is not touched.

## States

| State | The 3D marker |
|---|---|
| At rest | Drawn, clickable |
| Hovered (pointer) | 1.35 scale, its row lit — unchanged (#251) |
| Selected | `CairnMarker`'s selected treatment, re-appended last (#273) |
| Occluded (#285) | Invisible and inert. A tap goes to whatever is behind it |
| Thumbnail still loading | Clickable. The fallback fill is a marker, not a placeholder |
| A decision owns the map (#81, #155, #156) | Unchanged from 2D: the decision owns the surface |
| 3D surface not yet visible | Not reachable — the surface is `pointer-events: none` until it fades in (#271) |
| Disconnected (#73) | Clickable. Opening a cairn is a way of looking |

## Edge cases

- **Two markers stacked.** The upper one takes the tap, as #273 says. Moving
  the camera separates them.
- **A tap that lands on the marker and lifts on the map.** Nothing. The tap must
  land and lift on the same marker.
- **A long press on a marker.** Selects and opens on release, provided it did
  not move past the slop. There is no long-press gesture on this surface to
  conflict with.
- **Rapid repeat taps on the same marker.** Each is a click and #250's toggle
  applies: expand, collapse, expand.
- **A marker tapped while the camera is flying.** Selects and opens; see the
  cancel note above.
- **Mouse users.** `pointerdown`/`pointerup` covers mouse, pen and touch alike;
  there is no separate mouse path and no `click` handler left behind to
  double-fire.

## Copy

**None.** No tooltip, no hint, no "tap a cairn" empty state. The gesture is
supposed to be invisible.

## New tokens

One module constant, not a CSS custom property — it is a pixel threshold read in
JS and never reaches a stylesheet, the same reasoning #288 gave for its own
constants.

| Constant | Value | For |
|---|---|---|
| `CAIRN3D_TAP_SLOP` | `10` | Pointer travel, in CSS pixels, that still counts as a tap rather than a drag |

## Verification

This cannot be proved by the suite as it stands, and the note says so rather
than letting a green run stand in for it. #288 hit the same wall on the same
surface — no Maps API key in the development environment — and its answer is the
one taken here.

- **The fake `MarkerElement` gains the behaviour that broke this.** Today it is
  a bare `<div>`, which is why the existing click test passes while the app does
  not. It captures the pointer on `pointerdown` and dispatches no `click`, the
  way `<gmp-map-3d>` does, so the test can fail for the real reason.
- **Unit tests** then cover the reconstructed gesture: down-then-up within slop
  selects and opens, in that order; past the slop does nothing; `pointercancel`
  does nothing; `pointerType: 'touch'` behaves identically to a mouse, since
  touch is where it was reported.
- **Mutation-check the coverage** — break the listener, confirm the tests fail —
  #288's own precedent for a 3D surface that cannot be driven for real.
- **On a real map**, where a key is available: dispatch `PointerEvent`s at
  coordinates computed from the marker's own `getBoundingClientRect()` and read
  the selection back out of the DOM (the expanded row, the marker's
  `data-selected`), per the web stack's browser guidance. A screenshot does not
  answer this, and a tool call reporting success is not evidence. Where no key
  is available this is the user's own check on their phone, and `/test` says so
  rather than passing it silently.

## Out of scope

- **Clustering or a fan in 3D** (#273, #194) — every marker still draws and
  overlap is still accepted.
- **Dragging a cairn to move it in 3D** (#158), which #273 already excluded.
- **Hover on the 3D route** (#288) and any other 3D pointer work not about
  reaching a cairn.
- **Keyboard traversal of 3D markers** — #273's "focus and blur are not wired"
  stands; there is still no return path to focus into.
- **What the side bar does once the cairn opens** — #250's, and #294's.
