# 218 — the trip's totals, and four more numbers per track

Standing documents read first: [design-language.md](design-language.md) (type,
colour, elevation, states), [shell-and-content-model.md](shell-and-content-model.md)
(the column, the trip face). Prior notes this builds on:
[7-track-statistics.md](7-track-statistics.md) (the units module, the meta line,
the unavailable-versus-zero rule), [193-trip-row-anatomy.md](193-trip-row-anatomy.md)
(the track row, which this issue does not touch).

A static prototype at [`../prototypes/trip-stats.html`](../prototypes/trip-stats.html)
carries the layout at a real `--panel-width` and every measurement quoted below.
It is the artefact to look at; this note is what it decided.

**#219 is the other half.** A track's own five numbers and its elevation profile
live in a detail this issue does not build. Everything here is computation and
the trip-level block.

## What the reader gets

Six values, under the trip's header, above the track list:

```
┌──────────────────────────────────────────────┐
│ DISTANCE      ASCENT        DESCENT          │
│ 26.6 mi       6,960 ft ↑    6,830 ft ↓       │
│                                              │
│ HIGH POINT    LOW POINT     TRACKS           │
│ 14,153 ft     9,640 ft      4                │
│ ─────────────────────────────────────────    │
│ Elevation from 3 of 4 tracks. Distance       │
│ covers them all.                             │
└──────────────────────────────────────────────┘
```

Three columns rather than two because six cells in two columns is three rows
tall, and the column's height is its scarcest resource — the track list is what
the reader came for and every row the header spends is a row the list loses.

**`Tracks` counts tracks, not files.** A trip holding four KMLs where one carries
three `<gx:Track>` elements reads `6`. The label says tracks and the number has
to mean it; the file is a container the reader did not choose and mostly does
not think about.

## Where it sits, and why it is inset rather than lifted

`--surface-lift`, `--radius-sm`, `--space-3` padding — the treatment
`design-language.md` gives "inputs, pressed rows, selected segments". An inset
region inside the panel, not a card on top of it.

**This deliberately reads against one line of the standing document.** Its
Elevation section lists "the trip totals card" as an example of L2 lifted chrome
— `--radius-md`, `--shadow-lifted`, `backdrop-filter`. That line predates the
shell rebuild. `shell-and-content-model.md` now makes **the panel itself** the
L2 surface, floating over the map at `--radius-md`, and the totals block lives
inside it. Two consequences settle it:

- **A shadow inside a shadowed panel is the mistake the language warns about.**
  "If a shadow is ever visible as an outline it is wrong" — a lifted card resting
  on a lifted panel is exactly that, because there is no map gap behind it for
  the shadow to recede into.
- **"Blur only over the map."** The panel is opaque `--surface`. A
  `backdrop-filter` here composites a blur of a flat colour: no visual
  difference, real GPU cost, and a promise of depth the layout does not keep.

The language's own Navigation section already concedes that
`shell-and-content-model.md` supersedes it on layout. This is that supersession
reaching one more sentence, and it is written down here so it is not re-litigated
as a mistake later.

## Type — the part the prototype got wrong first

Both of these are standing rules the first draft broke, and both changed the
measurements, so they are recorded rather than assumed.

- **Labels are `--text-xs`, uppercase, `--mono`, `--text-muted`.** The first
  draft used `10px`, which the language drops from the scale outright. The
  uppercase-monospace-`--text-xs` treatment is what
  `shell-and-content-model.md` already uses for a meta label, so this is
  consistency rather than a new idea.
- **Values are `--mono` with `font-variant-numeric: tabular-nums`**, at
  `--text-sm`. "All numerals are tabular-nums in a monospace face" — a grid of
  six figures is the case that rule exists for. In the UI face the three columns
  visibly failed to line up; in the mono face they do, which is the whole reason
  to spend a grid on this rather than a sentence.
- Weight is 400 throughout the block. Nothing here is a title.

## It fits, measured rather than asserted

At `--panel-width: 380px`, with `--space-4` panel padding and `--space-3` inside
the block, three columns gapped by `--space-3`:

| | Width |
|---|---|
| Cell | **99.3px** |
| Widest label, `HIGH POINT` | 73.2px |
| Widest value, `6,960 ft ↑` | 77.0px |
| Stress case, `12,345 ft ↑` | 84.7px |
| Stress case, `-1,234 ft` (below sea level) | 69.3px |

14.6px of headroom on the worst case that can actually occur. No cell wraps and
none is clipped.

**No new token.** An earlier draft proposed `--stat-gap: 10px`; the language puts
spacing on a 4px grid and names `10px` as one of exactly two off-grid values in
the codebase, both of which resolve *up*. `--space-3` is that resolution, and it
still fits, so the token was deleted rather than argued for.

## The footnote

One line beneath the grid, `--text-xs` `--text-muted`, separated by a 1px
`--border` rule with `--space-1` above it.

| Coverage | Copy |
|---|---|
| Every track carries elevation | *no footnote at all* |
| Some do | `Elevation from 3 of 4 tracks. Distance covers them all.` |
| None do, but there are tracks | `No track in this trip carries elevation.` |
| No tracks at all | `Add a track to see totals.` |

The second sentence says "them all" rather than "all 4" because "all 2" reads
badly and a parameterised string should not have a number that only works above
three.

**No footnote when coverage is complete.** A line saying `Elevation from 4 of 4
tracks` is noise on the common path, and its absence is the signal that nothing
is missing — which is only legible if it is genuinely absent most of the time.

`Add a track to see totals.` follows the empty-field voice the trip header
already uses for `Add dates` and `Add notes`: it describes what the surface is
for on a line whose only job is to explain a blank.

## States

| State | The block shows |
|---|---|
| Populated, full coverage | Six values, no footnote |
| Populated, partial coverage | Distance and count real; the four elevation cells real; footnote naming the count |
| Populated, no coverage | Distance and count real; four em dashes; footnote |
| No tracks | Em dash in all five stat cells, `0` in `Tracks`, footnote |
| Loading | Not rendered — `TripDetail` already shows `Loading tracks…` in its place |
| Disconnected (#73) | **Rendered normally, at full contrast** |

**Disconnected is the one worth arguing about, so here is the argument.** #73's
Disabled treatment (`opacity: 0.4`) exists for controls that would fail if used.
The totals block is derived data with no control in it, and dimming it says
*these numbers are unavailable* when they are neither unavailable nor stale —
they were computed from tracks already in memory. A trip you are reading offline
should read exactly as well as one you are reading online.

## Empty is em dashes, not an absent block

The block renders for every trip, including one with no tracks at all.

The alternative — hide it until there is something to total — was the first
draft and is wrong for the reason #7 already established about values: a stat
absent because there is no data looks identical to a stat absent because the
feature was never built, and only one of those is true. #7 applied that to the
value; this applies it to the container.

Five em dashes and a `0` also teach the shape of the thing before there is
anything in it, so the block does not appear from nowhere the moment a first
track lands.

## Edge cases

- **A multi-track file.** Every track inside it contributes, and each counts
  toward `Tracks`. The file's *row* still shows no stats line — #6's rule, and
  #7's, both unchanged.
- **A file whose Drive object is missing.** It contributes nothing and is not
  counted. `MissingFileRow` already announces it on its own row; a second
  announcement in the footnote would be the same news twice.
- **Hiding a track.** Totals do not change. Visibility is a map control, and a
  number that moves when you toggle an eye invites the reading that it was
  filtered — which would then be wrong for every other panel in the app.
- **A single-point track.** Distance `0`, elevation unavailable, counts as one
  track. Consistent with #7.
- **A track below sea level.** Low point renders negative. No clamping; #7's
  rule that a wrong number you can see is debuggable and a silently clamped one
  is not applies unchanged.
- **Implausibly large totals.** Displayed as computed, same rule.
- **Elevation present but every value identical.** Unavailable, per the issue's
  parse rule — this is the `clampToGround` export and it is the common case for
  a planned trip drawn in My Maps, not an exotic one.
- **A trip where one track's ascent is available and another's is not.** The sum
  is over the ones that are, and the footnote is what makes that honest. A total
  silently computed over a subset is the failure this whole section exists to
  prevent.
- **Phone.** The column becomes the bottom sheet at `375px`, so cells fall to
  roughly `96px` — still clear of the `84.7px` stress case. Three columns hold;
  no responsive collapse to two is specified, because none is needed.
- **Reduced motion.** The block animates nothing. Adding and removing a track
  changes the numbers without a transition — a count that tweens is a count you
  cannot read while it does.

## Copy

| String | Where |
|---|---|
| `Distance` | Cell label |
| `Ascent` | Cell label |
| `Descent` | Cell label |
| `High point` | Cell label |
| `Low point` | Cell label |
| `Tracks` | Cell label |
| `Elevation from {n} of {m} tracks. Distance covers them all.` | Footnote, partial coverage |
| `No track in this trip carries elevation.` | Footnote, no coverage |
| `Add a track to see totals.` | Footnote, no tracks |

Labels are sentence case, not the uppercase the CSS renders — the transform is
presentation, and a string that arrives pre-shouted cannot be reused anywhere
that does not shout.

## Formatting, in `units.ts`

Three additions beside `formatDistance` / `formatDuration` / `formatElevationGain`,
all reading the same `SYSTEM` constant:

| Function | Renders | Unavailable |
|---|---|---|
| `formatElevationGain` *(exists)* | `6,960 ft ↑` | em dash |
| `formatElevationLoss` | `6,830 ft ↓` | em dash |
| `formatElevation` | `14,153 ft` | em dash |

**High and low points take no arrow.** The arrow on gain exists because, as #7
put it, a bare foot value beside a distance otherwise reads as altitude. Here it
*is* altitude, so the arrow would be the lie instead of the fix. The label
carries the meaning and the two elevation cells sit on their own row directly
beneath the two arrowed ones, which is the layout doing the disambiguating that
a glyph would otherwise have to.

## New tokens

None. See "It fits" above for the token that was proposed and withdrawn.

## Out of scope

- **The opened track detail and the elevation profile** — #219.
- **The track row's meta line.** Unchanged, and #218's acceptance criteria say
  so explicitly so that a helpful refactor does not widen it.
- **Totals for a loose track.** A loose track keeps its #7 row line and gains no
  block; a block of totals over one track is that track's stats with extra
  furniture.
- **A combined elevation profile for the trip.** Concatenating four tracks with
  gaps between them draws a shape that describes no walk anyone took.
- **Sorting or filtering the track list by any of these values.** Real, and a
  different issue.
