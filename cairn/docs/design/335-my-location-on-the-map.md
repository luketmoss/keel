# 335 — my location on the map, and a cairn dropped on it

Where the user is, and the one action that follows from knowing it.

Standing documents: [cairns.md](cairns.md) (the record, `positionSource`, the
ownership rule), [design-language.md](design-language.md) (tokens, contrast,
motion), [shell-and-content-model.md](shell-and-content-model.md) (the map's
corners). Prior notes: [156-creating-a-cairn.md](156-creating-a-cairn.md) (the
create gesture and the create face), [304-the-home-view.md](304-the-home-view.md)
(the bottom-right stack and what a camera control may touch),
[270-selecting-reveals-it-on-the-map.md](270-selecting-reveals-it-on-the-map.md)
(the visible area and its insets),
[271-switching-the-map-into-3d.md](271-switching-the-map-into-3d.md) and
[285-cairns-behind-the-terrain.md](285-cairns-behind-the-terrain.md) (drawing on
the 3D surface), [112-phone-bottom-sheet.md](112-phone-bottom-sheet.md) (the
stack rides the sheet), [305-a-cairn-tap-is-not-a-map-drag.md](305-a-cairn-tap-is-not-a-map-drag.md)
(tapping a marker on touch).

## Why this is two controls and not one

The request is a sequence: *show me where I am*, then *put a cairn there*. It is
tempting to collapse it into one button that locates and creates in a single
press, and that is wrong for one concrete reason — **a fix has an accuracy, and
the accuracy is what tells you whether the coordinate is worth saving.** Indoors,
under canopy, or on a desktop resolving by IP, the browser returns a position
that is honestly labelled as being good to three kilometres. A one-press
locate-and-create writes that into a cairn before the user has seen the number.

So: the locate control establishes a fix and draws it, with its accuracy visible.
Creating from that fix is a second, deliberate act.

## The locate control

**Bottom right, in the existing `map-controls` stack, between fit-to-everything
and the zoom pair.** The corner is the standing document's for camera controls,
and #304 set the stack's ordering rule — coarsest move at the top. Reset view
frames a state, fit-to-everything frames all your content, locate frames a single
point, zoom is relative. Locate slots in where that ordering puts it.

| | |
|---|---|
| Glyph | `◎`, `aria-hidden` |
| Accessible name | `Show my location` |
| Tooltip (`title`) | `Show my location` |
| Style | The existing `map-controls__button` — no new styling |

**It is not a toggle.** Google's version latches because it has a follow mode to
latch into; cairn has none (see *Out of scope* in the issue), so a latched
appearance would promise a moving dot that never arrives. Pressing it again
simply requests a fresh fix.

## The main path

1. The user presses `Show my location`.
2. The control enters its pending state (below) and
   `navigator.geolocation.getCurrentPosition` is called with
   `enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 0`. A fresh fix
   every time — a cached one is exactly the thing that puts a cairn at the last
   place you opened the app.
3. The browser may prompt for permission. Nothing in the app changes while it is
   up; the control stays pending.
4. The fix arrives. The position marker draws at it, the camera moves to it, and
   the control returns to rest.
5. The user taps the marker. Its callout opens, naming the accuracy and offering
   `Drop a cairn here`.
6. Pressing that opens the existing create face with the pin dropped and selected
   at the fix — the same face, the same fields, the same defaults as the
   right-click path in #156. `Create` saves; `Cancel` removes the pin and nothing
   existed.

Steps 1–4 and steps 5–6 are independent. A user who only ever wants to see where
they are never touches the second half.

### The camera move

The map fits **the accuracy circle**, inset-aware against the visible area, over
`--motion-slow` — the same duration and the same inset as #304's reset.

Fitting the circle rather than flying to a fixed zoom is what makes the arrival
honest: a five-metre fix lands close in, a three-kilometre fix lands zoomed out
over the area it actually describes, and the user is never shown a confident
building-level view of a coordinate that does not support one.

**Capped at zoom 17** (`LOCATE_MAX_ZOOM`). A fix accurate to two metres would
otherwise fit to maximum zoom and land on an unreadable tile with no context
around it. One step closer in than `fitTracksToBounds`'s own 16, which is
framing a walk rather than a point.

| 3D | What happens |
|---|---|
| Off | The 2D map fits the accuracy circle, inset-aware, over `--motion-slow` |
| On | The 3D camera flies to the fix — its centre, a range covering the accuracy circle, heading and tilt untouched — with the look-at resolved onto the ground per #303 |

A locate is a *pan*, not a reset: unlike #304 it deliberately leaves heading and
tilt alone. You pressed it to see where you are, not to be turned around.

Pressed mid-flyover, the flight is cancelled and the camera goes to the fix —
#274's "a deliberate input on the surface cancels the flight", unchanged.

## The position marker

A filled dot in `--position`, `--marker-size` across, with a `--marker-ring` ring
in `--text` so it reads on satellite, terrain and the map basemap alike, and
`--shadow-lifted` beneath it. Around it, a circle of the fix's reported accuracy
in metres, filled `--position` at 16% with a 1px `--position` stroke.

**The accuracy circle is a geographic circle, not a pixel radius.** Drawn in
metres it grows and shrinks correctly as the user zooms, which is the entire
point of showing it — a halo that stayed 40px wide at every zoom would be
decoration.

Where the circle's on-screen radius would be smaller than the dot, it is not
drawn at all. A halo hidden behind the thing it qualifies is noise.

### Why the dot is blue, and not `--accent`

[design-language.md](design-language.md) says one accent, spent on interaction,
and a new hex literal in a component stylesheet is a bug. This note adds a second
hue and a token for it, deliberately.

The accent means *interactive, selected, completed*. The position marker is none
of those — it is not clickable in the sense a cairn is, it is not selected, and it
is not content. Drawing it in `--accent` would make it indistinguishable at a
glance from a selected cairn or a completed route, on a surface where those are
the two things most likely to be near it. Spending one cold hue on "this is you"
costs less than that collision does, and blue-dot-is-me is the single most widely
trained convention in consumer mapping — it is also what the user asked for in as
many words.

It is a marker colour, the same category as the track polyline exception the
language already carves out: data about the world, not chrome.

### Copy

| Where | String |
|---|---|
| Marker `aria-label` | `Your location, accurate to about 39 ft` |
| Marker `aria-label`, coarse fix | `Your location, accurate to about 0.2 mi` |

**Accuracy goes through `formatDistance`, not a metre literal.** This note was
drafted in metres; the app is imperial (`format/units.ts` holds one `SYSTEM`
constant that every distance in the app obeys). A hand-written `12 m` here would
have been the only distance in cairn that ignored that switch. Always "about" —
a reported accuracy is a radius of probability, and `±39 ft` reads like a
tolerance.

## The callout

Tapping the marker opens a small card anchored above it. Tapping the marker again,
tapping the map, or pressing `Escape` closes it.

```
┌─────────────────────────────┐
│ You are here                │
│ Accurate to about 12 m      │
│                             │
│ [  Drop a cairn here  ]     │
└─────────────────────────────┘
```

`--surface` with `backdrop-filter: blur(var(--blur))`, `--radius-sm`,
`--shadow-lifted`. Title in `--text`, the accuracy line in `--text-muted`, the
action a full-width `--accent` button at `--hit-target`.

**The action lives here rather than in the control stack.** A button that appears
in the stack only once a fix exists shifts every control below it the moment it
arrives, and it would sit a screen-width away from the coordinate it acts on. On
the marker, the action is attached to the thing it is about, and tapping the dot
to find out what you can do with it is the gesture people already have. It also
puts a *discoverable* create path on the map, which is the debt
[156-creating-a-cairn.md](156-creating-a-cairn.md) recorded when its hint chip
shipped as an admitted placeholder — this does not discharge that debt in general,
because it only works where you are standing, but it is the first create
affordance in cairn that is visible without being told about it.

### When the fix is old

A fix does not expire, but a dot from an hour ago that is presented as *you are
here* is a lie. Once the fix is older than two minutes the callout carries a third
line, in `--text-muted`:

> `Located 14 minutes ago`

Rendered by `formatTimeAgo`, added to `format/dates.ts` for this — cairn had no
relative time before, so its rounding rule is decided there: minutes, then
hours, then days, counted through the existing `pluralize` so the singular case
cannot drift from every other count in the app. `Drop a cairn here` stays enabled — marking somewhere you were
half an hour ago is a legitimate thing to want, and the line is there so it is a
choice. Re-pressing the control in the stack is how you refresh; the callout does
not carry its own update button, because the control is two taps away and a second
way to do one thing is a second thing to maintain.

## The created cairn

Nothing about creation is new. The callout's action calls the same handler
`CairnCreateGesture` calls, with the fix's coordinate.

- `positionSource` is **`placed`**. A person pressed a button to put a cairn at a
  coordinate; that is what `placed` means, and it correctly earns `placed`'s
  guarantee in [cairns.md](cairns.md) that interpolation will never move it again.
  **No new `PositionSource` value.** A `geolocated` value would have to answer
  whether interpolation may overwrite it, and the answer is no — which is
  `placed`.
- **Ownership follows the gesture's context**, per [cairns.md](cairns.md): a trip
  open means a cairn in that trip, nothing open means a loose cairn. The locate
  path is not an exception to that table.
- Name, icon, description and date behave exactly as #156 specifies, including
  the empty-name rule that commits the icon's label.
- After `Create`, the position marker is still there. Creating a cairn does not
  dismiss your location, and dropping two cairns from one fix is allowed.

## States

### The locate control

| State | What it shows |
|---|---|
| Rest | `◎` in `--text-muted`; `--text` on hover, `--pressed` on press |
| Pending | The glyph is replaced by a rotating ring in `--accent`; the button is `disabled` and `aria-busy="true"`; accessible name becomes `Finding your location…` |
| After a fix | Rest. It is not a toggle and does not latch |
| After a denial | Rest. The next press re-requests, because the user may have changed the setting |
| Geolocation unavailable | **The control is not rendered.** No API object, or a non-secure context |
| Map unavailable (no key, key rejected) | Goes with the map, along with the whole stack, as #304 already has it |
| `prefers-reduced-motion` | The pending ring does not rotate; it pulses opacity instead |

Under `prefers-reduced-motion` the camera is set directly rather than glided, on
both the 2D and 3D paths — the same rule #304 applies to reset.

### Failures

Both surface through the existing `ToastStack`, and neither draws a marker.

| Cause | Toast |
|---|---|
| `PERMISSION_DENIED` | `Location is blocked. Allow location for this site in your browser, then try again.` |
| `POSITION_UNAVAILABLE`, `TIMEOUT` | `Couldn't find your location. Try again with a clearer view of the sky.` |

Two strings and not one, because they need different things from the user: a
denial is fixed in browser settings and retrying immediately will fail again; an
unavailable fix is fixed by moving and retrying. A single "couldn't get your
location" would send the user to the wrong place half the time.

### The callout

| State | What it shows |
|---|---|
| No fix | No marker, so no callout. There is nothing to tap |
| Fix under two minutes old | Title, accuracy, action |
| Fix over two minutes old | Title, accuracy, age, action |
| An import draft or the placement queue is open | Title, accuracy, age — **and no action.** Absent, not disabled |

That last row is #156's edge case applied unchanged: the placement queue already
owns the map's click and two placement intents at once has no sensible reading.
The locate control itself keeps working throughout — seeing where you are is not a
placement intent, and #304 already established that a camera control stays live
while a decision owns the map.

## Edge cases

- **Pressed while a request is in flight.** Ignored; the button is disabled for
  the duration. No queue, no second request.
- **Pressed while the callout is open.** The callout closes, the request runs, and
  the callout does not reopen on its own — the marker may have moved, and
  reopening it over a new coordinate the user has not looked at yet is worse than
  making them tap once.
- **A second fix lands in the same place.** The marker does not re-animate; the
  camera still runs its fit, which at an identical position is a no-op the user
  cannot tell from a very short glide.
- **3D toggled while a request is in flight.** The marker draws on whichever
  surface is current when the fix lands. The camera move runs in that surface's
  form.
- **The fix is nowhere near any content.** Nothing special. Fit-to-everything and
  the home view are unaffected — this is a camera control and touches only the
  camera, per #304's rule.
- **Phone, sheet at the full detent.** The stack rides the sheet's top edge and is
  pushed off the top of the screen at `--sheet-full`. This is pre-existing — the
  stack is `--hit-target` × 4 plus gaps tall against the roughly 8vh the full
  detent leaves — and this note does not fix it; it does make it one button worse,
  and that is worth recording rather than discovering. Lowering the sheet brings
  the whole stack back, as it does today.
- **Permission prompt dismissed without an answer.** Chrome resolves this as a
  denial; the denial toast is correct.
- **The user walks while the callout is open.** Nothing moves. There is no
  `watchPosition` anywhere in this feature, by design.

## Measurement

The pixel claim in *Edge cases* above — that the stack overflows the screen at
`--sheet-full` on a phone — is **token arithmetic, not a measurement against the
running app.** This container has no `VITE_GOOGLE_MAPS_API_KEY`, so `MapCanvas`
renders `MapUnavailable` and the control stack does not mount at all; there is
nothing to call `getBoundingClientRect()` on. No acceptance criterion asserts a
pixel quantity, so nothing ships on the strength of that arithmetic. Whoever
builds this should confirm it with a key present.

## New tokens

| Token | Value | For |
|---|---|---|
| `--position` | `#4C9BFF` | the position marker's fill, and the accuracy circle's stroke and fill |

**One token, not two.** This note first proposed a `--position-soft` derived with
the same `color-mix` form as `--accent-soft`, for the accuracy circle's fill. It
has nowhere to go: `google.maps.Circle` takes `fillColor` and `fillOpacity` as
two separate options and cannot parse `color-mix()`, and the circle is the only
thing that would have used it. The fill is `--position` at `0.16` — the same
resulting colour, expressed the way that API accepts it — and a token nothing
can reference is not worth adding to the system.

Contrast, computed the same way [design-language.md](design-language.md)'s table
is:

| Pair | Ratio | |
|---|---|---|
| `--position` on `--ground` | 6.43 | AA |
| `--position` on `--surface` | 5.77 | AA |

The `--text` ring around the dot is 2.55 against `--position` and is a boundary,
not text — it exists to separate the dot from a satellite tile, and the dot's
legibility against the map is carried by the ring's presence rather than by that
ratio.

## Decisions not taken

- **One button that locates and creates in a single press.** Rejected: it writes a
  coordinate before the user has seen its accuracy, which is the one number that
  decides whether the coordinate is worth saving.
- **A follow mode / `watchPosition`.** Rejected in the issue's scope, and the
  design follows it: the control does not latch, and nothing about the marker
  implies it will update.
- **`geolocated` as a fourth `PositionSource`.** Rejected: the only question the
  field answers is whether interpolation may overwrite the coordinate, and for a
  location fix the answer is no — which is `placed`, already.
- **The create action as a second button in the control stack.** Rejected: it
  appears and disappears with the fix, shifting the controls below it, and it puts
  the action a screen away from the coordinate it acts on.
- **Drawing the dot in `--accent`.** Rejected: it collides with selected cairns
  and completed routes, the two things most likely to be next to it.
- **Fitting to a fixed zoom.** Rejected: it shows a building-level view of a
  coordinate that may only be good to a kilometre.
- **An accuracy circle in 3D.** Not taken now — the dot draws on the 3D surface
  clamped to terrain per #285, and a ground-projected circle there is machinery
  this issue does not need. The accuracy stays legible in 3D through the callout's
  text.
- **A `Dismiss` control on the marker.** Rejected: a dot showing a real past
  position is not wrong, the age line handles the staleness, and a dismiss control
  is one more thing to look for and find missing.
