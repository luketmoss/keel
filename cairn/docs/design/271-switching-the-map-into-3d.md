# 271 — switching the map into 3D

Standing documents: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md),
[cairns.md](cairns.md). This note amends two things in the second: the
bottom-left corner's contents, and the rule that a track's route draws only on
hover and selection. Both are under
[Standing document amendments](#standing-document-amendments).

It extends [263-labels-toggle.md](263-labels-toggle.md)'s panel with a second
switch and supersedes nothing in it. [5-track-rendering.md](5-track-rendering.md)
continues to describe the 2D map's three-stroke polyline exactly as it does
today; 3D's single stroke is stated here and applies only there.

## The idea

**3D is a way the map can be, not a place you go.** You flip a switch, the
ground stands up, and you keep navigating the map you were already navigating —
same trips, same tracks, same column, same everything. You flip it back and the
ground lies down again.

That sentence decides the rest. A mode is not a destination: nothing navigates,
nothing opens, no route changes, and the panel you were reading does not move.
The only thing that changes is the field behind the chrome.

The flyover — a framed fly-in and an orbit, performed for you rather than driven
by you — is a genuinely different thing and lives in #274.

## The control

3D belongs in the Layers panel, because Layers is already the answer to *what am
I looking at*. #263 made that panel a tile row, a hairline, and a switch. It
gains a second switch above the first.

```
┌─────────────────────────────┐
│  ▨       ▨       ▨          │   tiles, unchanged
│ Map   Satellite Terrain     │
├─────────────────────────────┤   1px var(--border)
│  ☑  3D                      │   the new switch
│     Satellite only          │   var(--text-xs), var(--text-muted)
│  ☑  Labels                  │   unchanged
└─────────────────────────────┘
        ┌──────────┐
        │ ▨ Layers │   trigger — gains a 3D badge while on
        └──────────┘
```

**3D sits above Labels** because it is the larger change: it decides what kind
of surface you are looking at, and Labels decides what is written on it. Reading
top to bottom the panel goes from most to least consequential, which is the
order the tile row already establishes.

Both switches take #263's switch treatment exactly — same row height, same
`--space-1` panel padding, same full-width hairline pulled out with negative
margins. Nothing about the existing row moves.

### `Satellite only`

A caption line beneath the 3D switch at `--text-xs` in `--text-muted`, present
always rather than only when it becomes relevant. It is the honest one-line
version of a vendor constraint: there is no 3D road map and no 3D terrain map on
the beta channel, so 3D and the two drawn basemaps cannot both be true.

The two directions resolve without a dialog and without a disabled control:

| You do this | The panel does this |
|---|---|
| Turn 3D on while Map or Terrain is selected | The tile selection moves to Satellite |
| Select Map or Terrain while 3D is on | The 3D switch turns off |

**Neither is a blocked action and neither asks a question.** Both changes happen
inside the panel the user is looking at, one row from the control they touched,
so the consequence is visible at the moment it occurs. Disabling the Map and
Terrain tiles while 3D is on would be the alternative, and it is worse: it makes
two controls argue instead of letting one answer.

### The trigger

The bottom-left trigger keeps its thumbnail and its `Layers` label. While 3D is
on it carries a small `3D` badge on the swatch — `--accent-soft` fill, `--accent`
text, `--text-xs`, `--radius-full`. That is the language's Selected treatment on
a control that is currently doing something, and it is the only way the collapsed
control can say which surface you are on.

### When 3D cannot run

The switch takes the Disabled treatment — `opacity: 0.4`, no hover response —
with one sentence beneath it in place of `Satellite only`:

> This browser can't draw 3D. Check that hardware acceleration is on.

One sentence per surface, not a tooltip per control, which is #73's rule. The
rest of the panel is untouched and the map keeps working in 2D.

If 3D was on and the surface then fails, the map falls back to 2D at the same
place and the switch goes to the disabled state. **Google's own error panel is
never what the user sees**, which is the same commitment `MapUnavailable`
already makes for the 2D map.

## Turning it on

1. The 3D surface mounts beneath the 2D map, framed on the same centre and
   extent, flat, and invisible.
2. Once its first tiles are up, the two cross-fade over `--motion-base`.
3. The camera tilts from `0°` to `55°` over `--motion-slow`, north-up.

**The tilt is animated and the fade is not a cut**, because this is the one
moment where the app has to say *this is the same place, stood up*. A hard swap
to a tilted view reads as a navigation, which is exactly what it is not. `55°`
rather than the flyover's steeper angle: this is a map you are about to work in,
and past about 60° the horizon eats half the viewport.

Turning it off reverses it — tilt returns to `0°`, the surfaces cross-fade back —
and the 2D map lands **where 3D got to, not where 3D started**. That is the whole
point of a mode. Heading returns to north-up on the way out, and that is the one
thing that does not round-trip; cairn's 2D map is north-up by construction and
inventing a rotated 2D map to preserve a heading is a bigger change than this
issue.

Under `prefers-reduced-motion: reduce` both the fade and the tilt collapse, per
the design language's block. The switch still works; it simply arrives.

### The camera, in both directions

2D thinks in zoom levels and 3D thinks in metres from the target, so the swap is
a conversion rather than a copy.

| | Going in | Coming out |
|---|---|---|
| Centre | preserved exactly | preserved exactly |
| Extent | `range` derived from the 2D zoom and the viewport's height in metres per pixel | zoom derived back from `range` by the inverse |
| Tilt | `0°` → `55°` | back to `0°` |
| Heading | `0°` | forced to `0°` |

The conversion is not exact at high tilt — a tilted camera sees further than a
flat one at the same range — and it does not need to be. What it has to
guarantee is that nothing jumps somewhere else, and that flipping the switch
twice leaves you roughly where you started rather than progressively zoomed in
or out.

## What draws on the 3D map

**Tracks, and nothing else, in this issue.**

- One `Polyline3DElement` per track, `altitudeMode: CLAMP_TO_GROUND`, so a
  track crossing a valley sits on the ground along its length.
- The track's own colour from `palette.ts` — the design language's standing
  exception for track colour as data.
- **One stroke, not three.** The 2D map stacks a 9px halo at 0.35, a 5px black
  casing and a 3px core; the halo exists to hold a thin line off flat imagery,
  and over shaded terrain it reads as a smear.
- No draw-on animation and no active-track glow. The first confirms an import
  parsed, which has happened long before anything reaches this surface; the
  second belongs to a selection this issue does not add.

### Routes draw at rest in 3D

`shell-and-content-model.md` says a track's route draws on hover and on
selection, never at rest, because at rest every kind is a marker. **In 3D there
are no markers** — `Marker3DElement` is not an HTML host, so the trip dot, the
track tile and the cairn marker have no form there, and that is what #273
exists to solve.

So the rule inverts for this surface only: **in 3D, routes draw at rest and
there are no marker glyphs.** The world view in 3D is a set of routes lying on
terrain.

This does not touch the performance rule. 3D reads the same
`overview.geojson` the 2D world view reads, at the same simplification, for
trips and loose tracks alike. What changes is that simplified geometry is drawn
rather than held for hover — and a simplified polyline is what that file exists
to make cheap.

### Cairns do not draw yet, and the panel says so

While 3D is on, a third line appears beneath the switches:

> Cairns don't show in 3D yet.

`--text-xs`, `--text-muted`, present only while 3D is on. A trip's photos
silently vanishing when a switch is flipped is the kind of thing that reads as a
bug and gets reported as one; one line removes that entirely. #273 deletes the
line along with the limitation.

## States

| State | The map | The 3D switch |
|---|---|---|
| 2D, as today | unchanged | off |
| Turning on, first tiles not up | 2D still showing; no flicker to `--ground` | on |
| 3D, populated | terrain with routes | on, trigger badged |
| 3D, no geometry in view | terrain, no routes — not an empty state | on |
| Browser cannot draw 3D | 2D | Disabled, with its sentence |
| 3D failed after starting | falls back to 2D at the same place | Disabled, with its sentence |
| Signed out / disconnected | 3D is a way of looking, not a mutation — unchanged | unaffected |

**The switch commits before the surface is ready**, and the 2D map stays up
until the first 3D tiles are. Flipping to `--ground` and back is a flicker that
makes a working feature feel broken; the standing pattern of no spinners applies
here too.

## Edge cases

- **Flipping repeatedly, fast.** The switch is the source of truth and the last
  flip wins. A cross-fade interrupted mid-way reverses from where it got to.
  Neither surface is destroyed and remounted per flip.
- **Flipping mid-pan or mid-fit.** The in-flight 2D camera movement finishes
  into the conversion rather than being cancelled, so 3D arrives at the place
  the map was going to, not the place it had reached.
- **Opening a trip while 3D is on.** The trip's tracks draw and the world's
  stop, exactly as in 2D. This is a content change, not a camera change; the
  existing fit behaviour applies and the camera keeps its tilt.
- **Zooming a long way out in 3D.** It becomes a globe. That is correct and
  nothing clamps it — `restriction`/`strictBounds`, which keeps the 2D map to
  one copy of the world, has no equivalent and needs none, because a globe
  cannot tile itself side by side.
- **A track outside 3D surface coverage.** Terrain is worldwide even where
  buildings and trees are not, so a backcountry track always has ground under
  it. Nothing special happens and nothing is said.
- **Turning 3D on with no geometry anywhere** — a new, empty account. Terrain,
  and the list face's existing empty copy in the column. The map is not the
  thing that reports emptiness.
- **The tilt against the phone sheet.** At the full detent the sheet covers most
  of the viewport and the visible slice of a tilted map is near the horizon.
  The camera does not compensate; #258 already settled that the sheet's detents
  are the user's to drive.

## Mobile

The Layers panel gains one row and is otherwise unchanged, including the way it
clears the column and slides to the map's edge when the panel is collapsed.

The map controls stack above the sheet's top edge and move with it, as they do
over the 2D map. Gesture posture matches the 2D map's `greedy` handling: one
finger pans, two fingers tilt and rotate. **One finger pans rather than orbits**
— the opposite of the flyover in #274, and deliberately so. In a mode you are
navigating, moving is the common act; in a view you are admiring, turning is.

## New tokens

None. `--accent-soft`, `--accent`, `--text-xs`, `--text-muted`, `--radius-full`,
`--motion-base`, `--motion-slow`, `--ease` and #263's switch row all already
exist. The camera's `55°` and the 2D-zoom-to-range conversion are parameters of
a view of data, not values of the visual system.

## Standing document amendments

Both in `shell-and-content-model.md`.

**1. The map's corners.** The bottom-left row keeps its wording and gains a
sentence beneath the table:

> The Layers panel also carries the **3D** switch. While 3D is on the trigger
> is badged, and the tile selection is Satellite — there is no 3D form of Map
> or Terrain.

**2. Routes.** The rule *a track's route draws on hover and on selection, never
at rest* gains a scope:

> **On the 2D map.** In 3D there are no marker glyphs, so routes draw at rest
> and the world view is a set of routes on terrain. Both surfaces read the same
> `overview.geojson`; the performance rule is unchanged.

Nothing else in that file moves. One map instance for the session still holds —
the 3D surface is a second surface in the same region, mounted and unmounted by
the switch, and the 2D map it fades between is never destroyed.
