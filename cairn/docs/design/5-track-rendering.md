# 5 — Render imported tracks on the map

Tokens and layout from [2-map-shell.md](2-map-shell.md).

## Palette

Eight colours, assigned in order to each imported file, cycling after the
eighth. Deliberately high-chroma: satellite imagery is desaturated earth tone,
so saturated lines separate from it and from each other. No green or brown —
they disappear into vegetation and desert respectively.

| # | Hex | |
|---|---|---|
| 1 | `#FF3B30` | red |
| 2 | `#00D4FF` | cyan |
| 3 | `#FFCC00` | yellow |
| 4 | `#FF00A8` | magenta |
| 5 | `#FF8A00` | orange |
| 6 | `#7CFF00` | chartreuse |
| 7 | `#B47CFF` | violet |
| 8 | `#00FFB2` | spring green |

Assignment is by a monotonic counter, not by array index. Removing the second of
three files must not recolour the third — index-based assignment would, and the
map silently changing colour under you is disorienting.

After the eighth file colours repeat. Distinguishing nine tracks by colour alone
is not achievable anyway, and #6's swatches keep list and map tied together
regardless.

## Drawing

Each track is a polyline: 3px stroke in its file's colour, over a 5px casing in
`#00000059`. The casing is not decoration — a yellow line over snow or pale
desert is genuinely hard to see without it, and this is the standard
cartographic fix.

`clickable: false` for v1. Nothing responds to a click on a polyline yet, and a
cursor change promising otherwise is a lie.

## Bounds fitting

After every import, fit the viewport to the union of all *visible* tracks.

- Padding 48px on all sides, so endpoints do not sit against the viewport edge
- Maximum zoom 16 — without a cap, a 200m walk fills the screen at building
  level and the satellite context is lost
- Animated, honouring `prefers-reduced-motion`: an instant jump when reduced
  motion is requested

Re-fits on import and on visibility changes from #6. It does not re-fit on
removal — the viewport lurching because you deleted something is worse than a
slightly loose fit.

## States

**No tracks** — map as #2 leaves it, world view.

**Tracks visible** — polylines drawn, viewport fitted.

**All tracks hidden** — polylines gone, viewport left exactly where it was. No
re-fit, no message on the map; #6's list is where the user sees that rows still
exist with visibility off.

## Edge cases

- **Single-point track** — draws a 5px filled circle in the track colour rather
  than a zero-length line, which most renderers draw as nothing at all. Bounds
  fitting on a single point would zoom to maximum, so the zoom-16 cap covers it.
- **Antimeridian crossing** — normalise longitudes to a continuous run before
  drawing: walk the coordinates, and when a consecutive pair differs by more
  than 180°, offset the remainder by ±360°. Without this, a Pacific track draws
  a line the long way around the planet and bounds fitting zooms out to the
  whole globe. Fiji and Alaska are not hypothetical.
- **Track with two identical consecutive points** — draws normally, no special
  handling. Common in GPS logs at rest.
- **Very large track (10,000+ points)** — renders as one polyline. Google Maps
  handles this; the risk is many such tracks at once, which is out of scope
  until real data proves it a problem.
- **Coordinates outside valid range** — a point beyond ±90 latitude is dropped
  with the rest of the track drawn. Corrupt points in exports are real, and
  discarding the whole track over one bad row is the wrong trade.
- **Track entirely at (0,0)** — draws where it says. Null Island is a real
  export bug, and rendering it faithfully is how the user finds out.
