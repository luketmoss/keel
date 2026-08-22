# 274 — a flyover of a trip

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md). This note amends none of them. It adds a control to two
faces and a camera behaviour to the 3D surface, and neither is a rule those
documents state.

It builds on [271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md)
and reuses its camera conversion, its switch and its unavailable-3D sentence.
It touches [226-track-face.md](226-track-face.md) and
[218-track-and-trip-stats.md](218-track-and-trip-stats.md) only as the places the
control sits. [258-detail-keeps-its-detents.md](258-detail-keeps-its-detents.md)
gets one deliberate exception, argued under [Mobile](#mobile).

## The idea

**A flyover is a verb the map performs, not a place you go.**

#271 settled that 3D is a mode you navigate yourself. This is the other half:
one thing the app does *for* you, on that same surface, and then hands back. You
press it, the ground stands up if it was not already, the camera finds your trip
and swings around it, and when it stops you are simply in 3D — free, exactly as
if you had flown there by hand.

Nothing opens. Nothing closes. Nothing is dismissed. That sentence decides the
rest of this note, the same way #271's decided that one.

## The control

It lives **beneath the stat grid**, on both faces — `TripStats` for a trip and
`TrackFaceBody` for a track. The stat grid is where the face already talks about
the shape of the route (distance, gain, the elevation profile), and the flyover
is the same subject answered visually. A control that shows you the terrain
belongs next to the numbers that describe it.

```
┌──────────────────────────────┐
│  Ridge Traverse          ⋮   │   the face head, unchanged
│  trip · completed            │
├──────────────────────────────┤
│  ╱╲__╱╲___                   │   elevation profile (#224)
├──────────────────────────────┤
│  38.4 km │ 1,840 m │ 4 days  │   the stat grid (#218)
│   ...    │   ...   │   ...   │
├──────────────────────────────┤
│  ⛰  Fly over                 │   ← this issue
└──────────────────────────────┘
```

### Not the ⋮ menu, and not the primary button

`RowMenu` holds Rename, Remove from trip and Delete permanently — management and
destruction, reached rarely and deliberately. A flyover is neither, and burying a
showpiece behind a kebab is how a feature nobody finds gets built.

The `loose-face__primary` accent button is also wrong. That slot means *the thing
this face is for* — `Remove from trip`, `Add to a trip` — and it is already spent
on both faces. A flyover competing with it for accent fill would make two
controls argue about which is the point of the face.

So it is a **secondary button**: `--surface-lift` fill, `--text` label,
`--radius-sm`, `min-height: var(--hit-target)`, `--space-4` horizontal padding —
the same metrics `loose-face__primary` already uses, without the accent fill. It
takes the design language's standard Hover, Active, Focus and Disabled
treatments and defines none of its own.

### Copy

| Where | String |
|---|---|
| Label | `Fly over` |
| Accessible name | `Fly over <name>` |
| Disabled, no 3D support | `This browser can't draw 3D. Check that hardware acceleration is on.` |

`Fly over` rather than `Flyover` or `3D tour`: it is a verb, and the button does
the thing rather than naming a feature. The subject is the face you are on, so
the label does not repeat it — the accessible name does, because a screen reader
user may reach the button without the heading in context.

The disabled sentence is **#271's, verbatim**. One sentence per surface, not a
tooltip per control (#73's rule), and the same condition already puts the same
words under the Layers switch.

## The flight

Three phases, no gaps between them.

### 1. Framing

From the subject's own geometry: a bounding box over every point of every track
it owns, its centre as the camera target, and a `range` derived from the larger
of the two spans in metres with a **20% margin**.

This is new work. `fitBounds.ts` fits a 2D viewport in zoom levels, and
`camera3D.ts`'s `zoomToRange` converts a camera that already exists — neither
frames geometry into a 3D camera. The prototype's `frame(points, marginPct)` is
the shape to carry over.

**Framing reads the same simplified geometry everything else does.** A flyover of
a trip composes its `overview.geojson`, per the performance rule in cairn's
`CLAUDE.md`. A bounding box does not need full resolution, and the world view
already proved it does not.

### 2. The fly-in — 2000 ms

The camera is placed flat and overhead at the framed centre and range, then flies
to the same centre and range at **65° of tilt**, north-up.

**Starting flat and tilting down is the arrival**, not a move that follows it.
That is what makes it read as the ground rising to meet you rather than a cut
followed by a lean.

**65°, where #271's mode uses 55°.** That note chose 55 because "past about 60°
the horizon eats half the viewport" — correct for a map you are about to work in,
and exactly backwards here. A flyover *wants* the horizon; it is the thing that
makes a ridge look like a ridge. This is the "flyover's steeper angle" #271
already refers to by name.

### 3. The orbit — 12000 ms, one round

`flyCameraAround` from the camera the fly-in landed, one full round, ending
where it started. The subject stays framed for the whole revolution because the
target does not move.

One round rather than looping forever: a flight that never ends is a thing you
have to stop, and this note's whole premise is that nothing has to be dismissed.

## Cancelling

**Any deliberate map gesture cancels the flight**, immediately, leaving the
camera exactly where the gesture took it. No snap-back, no resumption, no
confirmation.

This is what makes the flyover safe to start. If it could not be interrupted it
would be a mode, and a mode is a thing to get stuck in — `cairns.md` already
rejects one for exactly this reason.

Cancelling is driven by **input on the 3D surface** — `pointerdown`, `wheel`, and
the arrow/`+`/`-` keys the surface itself handles — not by the camera-change
events. `gmp-centerchange` and its siblings fire on the app's own
`flyCameraTo` too, so a listener on those would cancel the flight the instant it
began.

| Also cancels | Why |
|---|---|
| Pressing `Fly over` again | Restarts rather than stacking — see below |
| Turning 3D off | The surface the flight runs on is going away |
| Navigating to another face | The subject is gone |
| Opening a cairn from the map | The user asked for something else |

**Starting a flyover while one is running replaces it.** The last press wins,
which is the same rule #271 gives its switch. Two `flyCameraAround` calls at once
on one surface is not a state worth reasoning about.

## Starting from 2D

If 3D is off when `Fly over` is pressed, **it turns itself on first** and the
flight begins from the 3D surface.

The order matters and it is the one race in this issue. #271 mounts the surface
on the first `on`, then waits a frame for its first tiles before making it
visible. A `flyCameraTo` issued before that lands on a surface nobody is looking
at, and the user sees the cross-fade arrive at an already-finished flight.

So the flight waits for the same signal #271's own tilt animation waits for, and
**#271's tilt-in is skipped when a flyover is the reason 3D came on** — the
fly-in is a better version of the same gesture, and running both means tilting to
55° and then immediately to 65°.

The Layers switch shows 3D on, and its trigger takes the `3D` badge, exactly as
if the user had flipped it. There is no third state, and turning it back off
afterwards behaves normally.

## States

| State | The button | The map |
|---|---|---|
| 3D on, subject has geometry | enabled | flies on press |
| 3D off, subject has geometry | enabled | turns 3D on, then flies |
| Flight running | enabled, and restarts the flight | flying |
| Browser cannot draw 3D | Disabled, with #271's sentence beneath | 2D, untouched |
| Subject has no usable geometry | **absent** | — |
| Disconnected / signed out | enabled — a flyover is a way of looking, not a mutation | flies |
| `prefers-reduced-motion: reduce` | enabled | arrives, no flight — see below |

**No geometry means no button, not a disabled one.** A disabled control says *you
could do this, but not now*; a trip with no tracks will never have anything to
fly over until it gets some, at which point the button appears. This matches how
the elevation profile already handles a track with no usable elevation — it is
not drawn, rather than drawn empty.

**There is no loading state and no spinner.** The button does not go busy while
3D mounts. The app's standing pattern is that a working feature that flickers
reads as broken, and the visible cross-fade already says something is happening.

## Reduced motion

Under `prefers-reduced-motion: reduce` the camera is **assigned** the framed,
tilted view outright — no fly-in, no orbit. The button still works and the user
still gets the thing they asked for: their trip, framed, in 3D, from a good
angle.

This is the design language's rule applied literally, and it matches #271's own
choice for the tilt: "The switch still works; it simply arrives."

## Edge cases

- **A backgrounded tab.** `flyCameraTo` is driven by the compositor, so a tab
  that is not being painted never advances the animation and the camera sits
  flat — looking broken on return. The camera is landed unconditionally on a
  timer just past the flight's own duration, which is what the prototype already
  does. **This is a known property of the API, not a defensive guess.**
- **A subject spanning a huge area** — an eight-day trip across a range. The
  framing is a bounding box, so it simply produces a large `range`. Zoomed far
  enough out the 3D surface becomes a globe, which #271 already settled is
  correct and clamps nothing.
- **A subject at a single point**, or a track whose points are nearly
  coincident. The framed span floors at a minimum range so the camera does not
  end up inside the terrain.
- **A trip whose tracks are far apart.** One bounding box over all of them, so
  the flight frames the whole trip and not one track. That is the subject the
  button names.
- **Pressing `Fly over` twice quickly.** The second press cancels the first and
  starts again from the framing step. Both flights never run together.
- **The subject changes mid-flight** — a track is removed from the trip while it
  orbits. The flight is not re-framed; it finishes on the frame it started with.
  Re-framing mid-orbit would be a camera jump with no gesture behind it.
- **Turning 3D off mid-flight.** The flight cancels and #271's existing
  round-trip returns the 2D map at the place the flight reached.
- **A flyover started, then the browser loses 3D.** #271's fallback already
  returns the map to 2D and disables the switch; the flight cancels with it and
  the button takes its disabled state.

## Mobile

The control sits in the sheet, in the same place in the face, and takes the same
`--hit-target` minimum as every other control there.

**Pressing it drops the sheet to its smallest detent.** This is a deliberate
exception to #258, which says the sheet's detents are the user's to drive, and it
needs the argument: at the full detent the sheet covers most of the viewport, so
a flyover behind it would be a control that visibly does nothing. The user has
just pressed a button whose entire purpose is to look at the map, which is as
clear a statement of intent as the app ever gets.

It stays an exception rather than becoming a rule because it is **one gesture,
reversible**: the sheet is dragged straight back up, and #258's actual complaint
— that a detail face *pinned* the sheet at full and buried the map — is the
opposite failure.

Gesture posture during a flight follows #271's: one finger pans, and doing so
cancels the flight.

## New tokens

None.

The camera's parameters — `65°`, `2000 ms`, `12000 ms`, one round, a 20% margin —
are **not** design-language values and deliberately do not become tokens. #271
settled this for its own `55°` and its zoom-to-range conversion: these are
parameters of a view of data, not values of the visual system, and putting a
flight duration beside `--motion-fast` would invite someone to reuse it for a
hover.

Everything visual reuses what exists: `--surface-lift`, `--text`, `--radius-sm`,
`--hit-target`, `--space-4`, `--text-sm` and the standard interaction states.
