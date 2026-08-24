# 306 — a flyover of a long track

`Fly over` works on a trip and fails on a track, and the difference is how many
points the elevation request is carrying.

Standing documents: [design-language.md](design-language.md). Prior notes:
[274-a-flyover-of-a-trip.md](274-a-flyover-of-a-trip.md) (the flight, its
phases, and its framing),
[224-sampled-elevation.md](224-sampled-elevation.md) (the Elevation API and how
this project asks it things),
[223-importing-gpx.md](223-importing-gpx.md) (where a 2,400-point track comes
from). #303, not yet built, gives the 3D reveal the same ground-resolution
rule this note gives the flyover — no link, since its own note has not
landed yet.

## Why

> *"Flyover still isn't working right for an individual track. Seems to still be
> going inside the earth and zooming in/out of a blue screen."*

A trip's flyover is handed its precomputed overview — a few dozen points. A
track's is handed the track: 2,418 of them for the Young Gulch GPX, 4,233 for
the Flat Tops one. All of them go into the elevation request as its path, to ask
for sixteen samples along it. When that call does not come back inside the
timeout, the ground resolves to **zero** — and a sea-level look-at under 1.9 km
of Colorado is the buried camera #286 already diagnosed. Inside the earth, then
sky, then inside the earth again.

Two things are wrong. The request is enormous for the answer it wants, and the
answer it falls back to when the request fails is the single worst value it
could pick.

## Ask a small question

**The path is reduced to the samples being asked for before the request is
made.** At most `MAX_SAMPLES` evenly-spaced points along the route, always
keeping the first and the last so the ends of the track are never cut off. A
2,418-point track and a 40-point overview then cost the same call, and a flyover
of a track costs what a flyover of a trip costs.

Nothing about the *flight* changes: the camera still frames the track's real
geometry. Only the elevation question is smaller.

## Fail flat, not buried

When the ground cannot be resolved at all — no sampler, a failed call, a
timeout — the caller is told, rather than handed a `0` it cannot tell apart from
a genuine coastline.

**A camera move with no resolved ground stays at tilt 0.** At tilt 0 the camera
sits a full `range` directly above its look-at and clears the terrain however
high it is. The flyover still flies in and still orbits; it simply does it
overhead instead of at 65 degrees.

A flat flyover is a worse view. A flyover from inside a mountain is not a view.
This is the same rule #303 gives the 3D reveal, deliberately identical in both.

## States

| State | `Fly over` on a track |
|---|---|
| Ground resolves | #274's flight, unchanged: fly in tilting down, then one orbit |
| Ground does not resolve | The same flight, overhead at tilt 0 |
| Elevation library unavailable | As above — overhead, never buried |
| Track with fewer than two points | No flight; the control does not render for a subject with no geometry (#274) |
| `prefers-reduced-motion` | The camera is set to the framing directly and does not orbit, as #274 already specifies |

## Edge cases

- **Pressed twice on the same track.** Restart, do not stack — #274's rule,
  unchanged — and still one elevation request, because the reduced path caches
  under the same key.
- **A track and the trip that contains it.** Different paths, different keys,
  one request each. Neither is wrong.
- **A track whose points are nearly coincident.** Reduction leaves at least the
  two ends, which is what the sampler needs; the range floor still applies.
- **The request comes back after the flight has already landed flat.** The
  answer is cached and the *next* camera move over that subject uses it. The
  landed flight is not re-flown — a camera that jumps once the user has stopped
  expecting it to is worse than a flat view they can fly out of.
- **`Fly over` on a trip.** Unchanged in every respect.

## Copy

None. This issue adds no strings. In particular there is no message when the
ground cannot be resolved: the reader is not told about a degraded camera any
more than #224 tells them about a failed elevation sample.

## New tokens

None.
