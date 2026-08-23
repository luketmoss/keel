# 295 — the 3D toggle through an open panel

Why the first tap on `Map3DToggle` only closes `LayersControl`, and what
closes it instead.

Standing documents: [design-language.md](design-language.md) (interaction
states), [shell-and-content-model.md](shell-and-content-model.md) (the map's
corner controls). Prior notes:
[284-one-layers-control.md](284-one-layers-control.md) — **the note whose own
edge case this repairs** — [271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md)
(the toggle itself, unchanged here).

## Why

> *"User clicks the 3D checkbox, the base map option minimizes with 3D
> unselected and I have to select again. This on mobile."*

`Map3DToggle` sits beside `LayersControl` in one bottom-left cluster (#284),
never inside its panel. #284 named the case where the panel is open and the
user presses the 3D toggle instead of a tile or Labels, and gave it an answer
in a comment: *"A press anywhere outside the panel — including on the 3D
toggle, a sibling in the cluster rather than a child of this control — closes
it and still does its own job."* Both halves were meant to happen from the
same press.

Only the first half does. `LayersControl` closes the panel on `pointerdown`,
document-wide, the instant the finger lands — before the browser has decided
the gesture is a tap rather than a scroll or a drag. React commits the closed
panel synchronously inside that handler, which changes the layout under the
finger mid-touch. Mobile Safari and Chrome both withhold the `click` a touch
would otherwise produce when the DOM under the pointer mutates between
`touchstart` and `touchend` — the platforms' own defence against a target
that moved being tapped by surprise. `Map3DToggle`'s own `onClick` is exactly
that click, and it is the one being withheld. The panel closes; 3D does not
turn on; the second, ordinary tap is what actually flips it, on an already-
collapsed cluster where nothing intervenes.

Nothing about `Map3DToggle` is wrong. The fix belongs entirely to
`LayersControl`'s outside-press listener, which closes the panel for a target
it does not know is about to want its own click.

## The fix

**Split "outside the panel" into two cases the dismissal already implicitly
has, and answer them differently:**

| Where the press lands | Today | Now |
|---|---|---|
| Truly outside the cluster — the map, the column, anywhere else | `pointerdown` closes immediately | unchanged |
| Inside the cluster, outside the panel — the 3D toggle, the only other member | `pointerdown` closes immediately | **closes on `click` instead** |

A press on the map has no `onClick` of its own competing for the same touch,
and nothing there needs the panel to survive a beat longer — `pointerdown` is
still correct and still immediate for that case, and stays exactly as it is.

The sibling case moves to a `click` listener, still on `document`, still
closing on anything the panel itself doesn't contain within the cluster. A
document-level `click` listener runs in the bubble phase, after the target
element's own listener has already run — so `Map3DToggle`'s `onClick` fires
first, on the panel that is still mounted under it, and the panel then closes
as the same gesture's second effect. One tap, both jobs, in the order #284
always meant.

**Why not just drop `pointerdown` everywhere and use `click` for all outside
presses?** A drag that starts inside the panel and ends outside it — panning
the map with a finger that happened to land near the control — fires no
`click` at all; only `pointerdown` (or `pointerup`) is guaranteed to see that
gesture start. Keeping `pointerdown` for the truly-outside case is what makes
a drag off the panel still close it. The cluster is the one place a click
listener is both necessary (a sibling's own handler must run first) and
sufficient (nothing inside the cluster is panned).

**Why not delay the sibling's `pointerdown` handling instead** (a
`requestAnimationFrame`, a microtask)? That still mutates the DOM before the
browser's own click-suppression check runs on some engines, and delaying a
dismissal by an unspecified tick to dodge a platform heuristic is exactly the
kind of thing that stops working the next time a browser tunes that
heuristic. Reading the click itself, rather than guessing at the browser's
timing, is the fix that does not need to be revisited.

## Main path

1. The layers panel is open.
2. The user taps the 3D toggle.
3. `Map3DToggle.onChange` fires — 3D turns on (or off).
4. The document `click` listener then sees the press landed inside the
   cluster but outside the panel, and closes it.
5. The cluster is now collapsed, showing the basemap trigger, with 3D in its
   new state — one tap.

## States

| State | Panel | 3D |
|---|---|---|
| Panel open, tap a basemap tile | stays open (#284) | unaffected |
| Panel open, tap the Labels switch | stays open (#284) | unaffected |
| Panel open, tap the 3D toggle | closes | flips, in the same gesture |
| Panel open, tap the map | closes (unchanged, `pointerdown`) | unaffected |
| Panel open, drag from inside the panel out onto the map | closes (unchanged, `pointerdown`) | unaffected |
| Panel closed, tap the 3D toggle | — (nothing to close) | flips, as always |
| Panel open, `Escape` | closes, focus returns to the trigger (unchanged) | unaffected |
| Panel open, focus leaves the cluster | closes (unchanged, `focusin`) | unaffected |
| Panel open, keyboard `Tab` from the panel onto the 3D toggle | stays open (unchanged — focus, not a click) | unaffected until `Enter`/`Space` |
| Panel open, keyboard activates the 3D toggle (`Enter`/`Space`) | closes, on the synthetic `click` those keys already produce | flips |

The keyboard row falls out of the same fix for free: `Enter`/`Space` on a
button dispatch a real `click` event, so the new listener catches it exactly
as it catches a tap.

## Edge cases

- **3D is unavailable** (`Map3DToggle` disabled). A tap on a disabled button
  fires no `click` at all, so nothing closes the panel and nothing was
  supposed to — the same as today.
- **Roadmap or Terrain selected from the open panel**, where `Map3DToggle`
  itself unmounts (`visible={baseMap.type === 'satellite'}`) as part of the
  same `onChange`. The tile click was already inside the panel and closes
  nothing new; this path is untouched.
- **A pointer press that starts on the 3D toggle and drags off it before
  release.** No `click` fires (the browser's own rule for a moved pointer),
  so the panel does not close from this listener — a drag starting on the
  toggle behaves like a drag starting on the map, correctly, since a click
  never happened.
- **Two rapid taps on the 3D toggle** (on, then off). Each is its own
  `pointerdown`→`click` pair; the panel is already closed after the first, so
  the second tap goes to the collapsed trigger cluster, per the "panel
  closed" row above.
- **Mouse users.** `click` already covers mouse the same way it covers touch;
  this is not a touch-only code path, it replaces the sibling case for every
  input device.

## Copy

None. No new strings.

## New tokens

None. This is a listener change with no visual difference in any state.

## Out of scope

- **The 3D toggle's own appearance or unavailable state** (#271, #284) —
  unchanged.
- **Any other outside-dismiss surface** (a popover, a menu) — this is
  `LayersControl`'s own cluster-aware listener and does not generalize a
  pattern anywhere else in the app.
- **Reordering the cluster** or changing which control is a sibling of which.
