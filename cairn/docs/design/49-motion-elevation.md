# 49 — Add motion and elevation tokens for Alpenglow

Tokens from [design-language.md](design-language.md)'s Motion and Elevation
sections, applied exactly. This note covers the elevation reclassification the
issue body raised without resolving, and the two effects' actual mechanics
against the real rendering stack.

## Main path

Nothing about what the app does changes. Importing a track still imports it;
hovering a track row still just hovers it. What's new is what both of those
look like while they happen.

## Elevation, reclassified

Three chrome surfaces exist today with three different blur values and no
shared reasoning. Sorting them against the doc's L0/L1/L2:

| Surface | Today | Becomes |
|---|---|---|
| `Sidebar` | `blur(8px)`, no shadow | **L1** — shared blur token, no shadow (attached edge) |
| `WorldMap` filter row, trip-totals card | `blur(8px)`, no shadow | **L2** — shared blur token, `0 10px 30px rgba(6,8,18,.55)` shadow (floats, touches no edge) |
| `DropOverlay` | `blur(2px)`, dashed accent border, no shadow | **L2**, but see below |

`DropOverlay`'s smaller blur isn't an oversight — it sits over a
full-viewport region during an active drag, and a strong blur there would
obscure the very thing being dropped onto. It keeps its own lighter blur value
rather than adopting the shared L1/L2 token, but does gain the L2 shadow: it
floats over the map exactly like the filter row does, it just blurs less
while doing it. Its dashed border stays as the primary "this is a drop target"
signal; the shadow is additive, not load-bearing.

## The two effects, mechanically

Both assume Google Maps `Polyline` objects (`TrackLayer.tsx`,
`@vis.gl/react-google-maps`), which is what the app actually renders through —
not the plain SVG the design doc's language (`stroke-dasharray`,
`drop-shadow`) implies.

**Draw-on.** `Track`'s `points` prop already exists in full when
`TrackLayer` renders it — reveal is achieved by rendering a growing prefix of
that array as an animation frame runs from 0 to `points.length`, timed to
`--motion-slow`, then rendering the full array once complete (and staying
there — this runs once, on first appearance, never on a subsequent visibility
toggle). A `requestAnimationFrame` loop keyed to import time is enough; no new
dependency.

**Hover glow.** `TrackList`'s existing `.tr:hover` rule already exists per
row. Add a hover handler on the row that reports which file id is hovered
upward (through whatever prop channel `TrackList` already receives its
`files` through, or a small local callback prop — this is plumbing, not a new
architectural layer). `TrackLayer` renders one extra `Polyline` — wider
stroke, same colour, lower opacity — for whichever file id matches, and none
when nothing is hovered. Hiding a track (existing visibility toggle) removes
its row's glow along with everything else about it; there's nothing special
to handle there since a hidden file already isn't in `renderedTracks`.

## Edge cases

- **Import happens while the map is mid-pan or mid-zoom from a previous
  import's bounds-fit.** Draw-on still runs against the final `points` array;
  it doesn't need to know or care what the camera is doing, since it only
  touches the polyline's own path, not the map's viewport.
- **Two tracks imported in the same batch.** Each gets its own independent
  draw-on animation starting at the same time — they are not staggered or
  sequenced relative to each other. A sequence would need a decision about
  ordering that nothing here calls for.
- **Hovering rapidly across several rows.** The glow polyline swaps to
  whichever row is currently hovered with no transition of its own; only the
  glow's appearance/disappearance on mount is instant, matching how the
  existing `.tr:hover` background already behaves with no fade.
- **Reduced motion and the glow.** Hover glow is not a duration-based
  animation — it's an instant mount/unmount tied to pointer state — so
  `prefers-reduced-motion` has nothing to shorten there. It only affects
  draw-on, which collapses to the completed track appearing immediately.

## Not decided here

Whether the trip-totals card and the world-map filter row ever need different
shadow values from each other is not raised by anything in scope — both are
L2, both get the one shadow token, and nothing here asks for a second L2
variant.
