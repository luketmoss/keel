# 7 — Track statistics: distance, duration, elevation gain

Tokens from [2-map-shell.md](2-map-shell.md). Rendered into the rows defined in
[6-track-list.md](6-track-list.md).

## Units — a decision that could have gone the other way

**Imperial by default**: miles, feet. Formatting is isolated in one module
(`src/format/units.ts`) with a single `SYSTEM` constant, so switching to metric
or adding a preference later is a one-line change and not a search-and-replace
through the components.

This is a guess about the reader, not a conclusion. If the tracks being imported
are mostly non-US, flip the constant — nothing else has to move. Flagged at
Gate 1 rather than buried here.

## The line

A single 12px `--text-muted` line, second row of each list entry, values
separated by ` · `:

> 12.4 mi · 3h 42m · 1,850 ft ↑

Order is distance, duration, elevation gain — most to least universally
available. Distance can always be computed; the other two depend on what the
export carried.

## Formatting

| Value | Rule | Example |
|---|---|---|
| Distance ≥ 0.1 mi | one decimal | `12.4 mi` |
| Distance < 0.1 mi | whole feet | `340 ft` |
| Duration ≥ 1 h | `Xh Ym` | `3h 42m` |
| Duration < 1 h | `Xm` | `47m` |
| Duration < 1 min | `<1m` | `<1m` |
| Elevation gain | whole feet, thousands separator, trailing `↑` | `1,850 ft ↑` |

The `↑` marks gain specifically. Without it, a bare foot value next to a
distance reads as altitude, which is a different number entirely.

## Unavailable versus zero

The distinction the whole issue turns on. A `LineString` export carries no
timestamps, so its duration is **unknown**. Rendering `0m` would assert
something false about the track.

Unavailable values render as an em dash with the unit suppressed entirely:

> 8.1 mi · — · —

Zero renders as zero, with units:

> 8.1 mi · 47m · 0 ft ↑

`0 ft ↑` is a real and correct reading for a flat or descent-only track, and it
must not look like missing data.

If every optional value is unavailable, the line shows distance alone rather
than trailing two dashes:

> 8.1 mi

Two dashes carry no information the user can act on and make the row look
broken. One dash among present values is informative — it says *this track came
from a file that did not record it* — which is why the mixed case keeps them.

## Computation

- **Distance** — haversine between consecutive points, summed. Earth radius
  6,371,008.8 m (mean). Error against a true geodesic is under 0.5% at any
  realistic track scale, which is well inside what the acceptance criterion
  asks and far inside consumer GPS error.
- **Duration** — last timestamp minus first. Elapsed, not moving time; pause
  detection is explicitly out of scope, and elapsed is the honest number to show
  without it.
- **Elevation gain** — sum of positive deltas between consecutive elevations.
  No smoothing and no threshold. Raw GPS elevation is noisy and this will read
  high on long tracks; that is a known, accepted v1 behaviour, revisited when a
  real file reads implausibly rather than pre-emptively.

Computed once at import, stored on the track alongside its geometry. Rows
re-render on every visibility toggle, and recomputing a 10,000-point haversine
sum on each one is the obvious way to make the list feel slow.

## Edge cases

- **Single-point track** — `0 ft`, no duration, no gain. Distance zero is true.
- **Two identical consecutive points** — contribute zero distance. No special
  handling.
- **Timestamps out of order** — take the span as `max − min` rather than
  `last − first`, so a scrambled export cannot produce a negative duration.
- **Some points carry elevation, some do not** — compute gain across the points
  that do, skipping gaps rather than treating a missing value as zero, which
  would invent a cliff at every gap.
- **A track spanning a DST boundary** — timestamps are absolute (`Z` in KML), so
  elapsed time is unaffected. No local-time conversion happens anywhere in v1.
- **Implausibly large values** — displayed as computed. No clamping. A wrong
  number the user can see is debuggable; a silently clamped one is not.
