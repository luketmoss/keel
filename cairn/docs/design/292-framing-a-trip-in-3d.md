# 292 — framing a trip in 3D

The 2D map's "the content changed, so the camera does too" transcribed to the
3D surface, which never got it.

Standing documents: [design-language.md](design-language.md) (the motion
durations), [shell-and-content-model.md](shell-and-content-model.md) (the faces,
and what each one draws). Prior notes:
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) (the
surface, and the flip's own framing from the 2D camera),
[288-selecting-a-track-in-3d.md](288-selecting-a-track-in-3d.md) (the 3D
reveal this sits beside, and `frameGeometry`'s use as a 3D fit),
[274-a-flyover-of-a-trip.md](274-a-flyover-of-a-trip.md) (`frameGeometry`
itself, and what a later flight does to an earlier one),
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the reveal rule, and its suspension while a decision owns the map),
[37-world-map.md](37-world-map.md) (the world view's own fit).

## Why

> *"When in 3D mode within a trip, going back to the trip view and selecting
> another trip does not take the user to the location of that trip."*

Two cameras, one of which moves. `TrackLayer` fits the 2D map to a trip's
tracks as they arrive; `Track3DLayer` draws lines and touches no camera at all.
So opening a second trip in 3D leaves you flying over the first one, looking at
terrain with nothing on it, with the trip you asked for somewhere over the
horizon and no gesture short of turning 3D off that will find it.

#288 brought *selection* to the 3D camera and stopped there — deliberately, it
was a track-selection issue. This is the other half: **content arriving is a
camera event too, on whichever surface is showing.**

## The main path

3D is on, a trip is open. The user goes back to the trips list and opens a
different trip.

1. The face changes; the previous trip's routes and cairns leave the surface and
   the new trip's arrive, exactly as they do today.
2. The 3D camera flies to frame the arriving trip — `frameGeometry` over every
   point the surface now draws, at its existing `FLYOVER_MARGIN_PERCENT`.
3. **Heading and tilt are read off the live camera and handed back unchanged**,
   as in #288. You arrive over the new trip in the attitude you were already
   flying in; the app does not straighten you up.
4. The 2D map underneath fits the same content, as it always has. Turning 3D off
   lands where 3D got to (#271), so the two surfaces agree again.

Going back to the world view is the same event with different content: the
world's trips and loose tracks arrive on the surface, and the camera frames
them.

## What fires it

**The set of geometry the surface draws, changing.** Not the route, not the
face, not the camera — the same signal `TrackLayer`'s 2D fit already keys on, so
the two surfaces cannot drift on what counts as "the content changed".

| Change | 2D today | 3D |
|---|---|---|
| A face's tracks arrive (trip opened, world view returned to) | fits | frames |
| A file imported into the open trip | fits | frames |
| A track's visibility toggled | fits | frames |
| A track removed | **no fit** | **no frame** |
| The user pans, orbits or zooms | nothing | nothing |
| A track selected | reveal (#270) | reveal (#288) |
| 2D → 3D flipped, same content | — | the flip's own framing (#271) |

The removal row is `TrackLayer`'s own rule and its reason carries across
verbatim: *a viewport lurching because something was deleted is worse than a
slightly loose fit.*

**The flip is not a content change.** #271 frames the surface from the 2D
camera when 3D comes on, and that is still the only thing that happens on a
flip. A trip opened while 3D was off is already framed in 2D when the switch is
flipped, so nothing here needs to fire for it.

## The geometry it frames

Every visible track the face draws — a multi-track file counted as its lines,
hidden tracks excluded at source, exactly the set `Track3DLayer` renders.

**A trip with no drawable track geometry falls back to its cairns.** A photos-
only trip is the case the report is worst in: nothing arrives on the surface to
frame, so the camera would sit over the previous trip with the new trip's
markers off screen — the reported bug, unfixed, in the one situation where the
map is the entire content of the trip. Framing its cairns costs nothing when
tracks exist, because it never runs then.

This is a deliberate half-step past 2D parity: the 2D map does not fit to a
photos-only trip either. That is arguably its own bug and is **not fixed here** —
see *Out of scope*.

## The flight

| Property | Value |
|---|---|
| Target and range | `frameGeometry(points)`, #274's framing at its existing margin |
| Heading | the camera's own, unchanged |
| Tilt | the camera's own, unchanged |
| Duration | `TRACK3D_REVEAL_MS` (280) — `--motion-slow`, the token the design language assigns to *"map camera, bounds fitting"*, which this literally is |
| Reduced motion | no flight; `center` and `range` are assigned and the camera arrives |

Everything in that table is #288's reveal flight, reused rather than
re-specified. One duration, one framing helper, one attitude rule across every
camera move this surface makes.

## States

| State | The 3D camera |
|---|---|
| Trip opened, tracks already loaded | frames them |
| Trip opened, tracks still loading | frames when they arrive — the same signal, one beat later |
| Trip opened, tracks arrive in batches | frames on each arrival, ending on the whole trip. A trip that loads in three parts flies three times; the last one is the right one |
| Trip has no tracks and no cairns | no move. There is nothing to frame and no honest place to put the camera |
| Trip has cairns only | frames the cairns |
| Every track in the trip hidden | frames the cairns, by the same fallback — the visible set is empty |
| Back to the world view | frames the world's trips and loose tracks |
| A decision owns the map (#81, #155, #156) | **no move.** `revealSuspended`, the same gate #270 and #288 both take |
| 3D off | no move. The 2D fit is the camera that matters, and the flip frames from it |
| A flyover requested after the content arrived | the flyover wins — a later `flyCameraTo` replaces the flight in progress (#274, #288) |
| Disconnected (#73) | unaffected. Framing is a way of looking |

## Edge cases

- **Opening the trip you just left.** It frames again. A flight to where the
  camera already is, which is a no-op the user cannot see — #288's own answer to
  the same question.
- **Opening a trip while a flyover of the previous one is still flying.** The
  content framing is the later flight and replaces it. The flyover's own token
  guard already stops its orbit from firing after it has been superseded.
- **A track imported while the camera is somewhere the user put it.** It frames,
  the same as 2D re-fits. Import is a content change, and #270's *"the zoom is
  the user's"* covers gestures, not arrivals.
- **The surface is mounted but not yet visible** (the first flip's tile wait).
  The camera is a property of an element that already exists; it is simply
  correct when the surface fades in.
- **Antimeridian-spanning trips.** Framed from the same normalised points the
  2D fit uses — `normalizeAntimeridian` runs before `frameGeometry`, as it does
  for #288's reveal.
- **A single-point track.** Not drawn in 3D (`points.length < 2`) and so not
  part of the framed set; if it is all the trip has, the cairn fallback answers.

## Copy

**None.** No labels, no toasts, no "flying to Kepler Track". The camera move is
the whole feedback.

## New tokens

**None.** `TRACK3D_REVEAL_MS` and `frameGeometry`'s `FLYOVER_MARGIN_PERCENT`
already exist and are reused unchanged.

## Decisions taken here

- **The content framing always fires, like #288's reveal and unlike #270's 2D
  rule.** Same reason: `Map3DElement` has no coordinate-to-pixel projection, so
  "only when it has to" cannot be implemented on this surface.
- **Cairns are the fallback geometry, not part of the normal framing.** Adding
  them to every fit would change how a trip with one distant photo is framed in
  3D but not in 2D, which is a divergence nobody asked for. As a fallback it
  only ever runs where the alternative is not moving at all.
- **Suspended while a decision owns the map**, matching #270 and #288 rather
  than `TrackLayer`'s 2D fit, which predates `revealSuspended` and is not
  gated by it. A camera flight underneath a placement queue is exactly what that
  gate exists to prevent.
- **Removal still does not re-frame**, inherited from `TrackLayer` and not
  re-argued.

## Out of scope

- **The 2D map's own behaviour**, including its missing fit for a photos-only
  trip. If that is worth fixing it is its own issue, on its own surface.
- **Framing on cairn arrival** in a trip that already has tracks.
- **#270's least-move test in 3D**, unless Google ships a projection (#288).
- **The flyover, its orbit, and the `Fly over` control** (#274).
- **Any change to how tracks or cairns are drawn** — this issue moves a camera
  and nothing else.
