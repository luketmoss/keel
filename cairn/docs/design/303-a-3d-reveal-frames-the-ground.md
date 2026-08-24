# 303 — a 3D reveal frames the ground, not sea level

Every 3D camera move that frames a subject resolves the ground under it first.
Two of them do not, and this is the note that makes it one rule instead of three
copies.

Standing documents: [design-language.md](design-language.md) (the motion
durations). Prior notes:
[288-selecting-a-track-in-3d.md](288-selecting-a-track-in-3d.md) (the reveal
being fixed), [292-framing-a-trip-in-3d.md](292-framing-a-trip-in-3d.md) (the
arrival fit being fixed with it),
[274-a-flyover-of-a-trip.md](274-a-flyover-of-a-trip.md) (`frameGeometry`, and
the flight that already does this correctly),
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) (the
surface and the flip's own framing).

## Why

> *"3D view clicking on a track isn't working quite right still. It takes me to
> a place, but not always where the track is. In many cases, I'm near the track,
> but it's still not in view."*

#286 established the rule and `Map3D.tsx` follows it: `Map3DElement` positions
the camera as a `range` and a `tilt` **from a look-at point whose altitude is
absolute**. A look-at at sea level over Colorado is 3 km underground; the camera,
which sits only `range · cos(tilt)` above it, goes underground with it; Google
then collapses `range` to keep the camera out of the terrain, and what arrives
is a view that is neither the framing that was asked for nor anything the user
can navigate from.

#288's reveal and #292's arrival fit were both written after that was known and
both still fly to `altitude: 0`. Over the Flat Tops — a route whose recorded
elevation runs 3,136 m to 3,604 m — the error is larger than the framing.

## The rule

**A 3D camera move that frames a subject resolves the ground along that
subject's own geometry, and uses it as the look-at's altitude.** Along the
subject's route, not just its centre: a walk up a valley is framed from above
the ridge it ends on, not from inside it. That is `sampleGroundAltitude`'s
existing contract — the highest ground along the path — and it is already what
`Fly over` uses.

One helper, called by both moves, so they cannot drift apart again.

## The main path

3D is on and the user selects a track in the list, or opens a trip whose content
arrives on the surface.

1. The subject's points are framed — `frameGeometry`, unchanged, at its existing
   margin.
2. The ground along those points is resolved.
3. The camera flies to that centre and range over `--motion-slow`, **at the
   heading and tilt it already has**. #288's and #292's shared line: you arrive
   over the subject in the attitude you were already flying in. A reveal that
   straightened the user up would undo their own orbit.
4. The whole subject is in view when the flight lands, above the terrain.

## States

| State | Behaviour |
|---|---|
| 3D off | Nothing. The 2D reveal is #270's and is untouched |
| 3D on, subject with geometry | The main path |
| Subject with no usable geometry | No camera move, as #288 already specifies |
| A decision owns the map | No camera move — `revealSuspended`, unchanged |
| Ground cannot be resolved | The move still happens, at tilt 0 — see below |
| `prefers-reduced-motion` | Centre and range are set directly, no flight |

## Edge cases

- **The ground cannot be resolved** — no sampler, a failed call, a timeout.
  The camera still moves, but flattens to tilt 0 rather than keeping the user's
  tilt over an unknown look-at: at tilt 0 the camera sits a full `range` above
  the look-at and clears the terrain whatever its height. A flat arrival is a
  worse view; a buried one is not a view. This is the same fail-safe #306
  specifies for `Fly over`, and it is deliberately the same rule in both places.
- **A sea-level subject.** Resolving the ground returns approximately zero and
  the framing is what it is today. Nothing is pushed away from the camera.
- **Selecting a second track before the first flight lands.** The later move
  replaces the earlier one; the camera does not queue.
- **Flipping 3D on with a track already selected.** Still not a reveal. The
  switch is not a selection change — #288's rule, unchanged, and #271 owns the
  flip's own framing.
- **A track whose points number in the thousands.** The ground request is
  reduced before it is sent; that is #306's subject, and this issue depends on
  it landing first.

## Copy

None. This issue adds no strings.

## New tokens

None. `--motion-slow` is transcribed for `flyCameraTo` as `TRACK3D_REVEAL_MS`
already, for the reason `track3D.ts` gives: a duration handed to the Maps API
never reaches a stylesheet.
