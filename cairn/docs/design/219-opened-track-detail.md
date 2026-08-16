# 219 — opening a track

Standing documents read first: [design-language.md](design-language.md),
[shell-and-content-model.md](shell-and-content-model.md). Prior notes this
revises or builds on: [193-trip-row-anatomy.md](193-trip-row-anatomy.md) (the row
and its `⋮`), [46-track-file-editing.md](46-track-file-editing.md) (**revised** —
rename's affordance moves), [7-track-statistics.md](7-track-statistics.md) (the
meta line, unchanged), [194-reaching-a-clustered-cairn.md](194-reaching-a-clustered-cairn.md)
(the one-click-opens contract this follows), and
[218-track-and-trip-stats.md](218-track-and-trip-stats.md), which owns the
computation, the stat grid this reuses, and the em-dash rule.

Prototype: [`../prototypes/trip-stats.html`](../prototypes/trip-stats.html),
panel B.

## The shape

```
┌────────────────────────────────────────────────┐
│ ⠿  ●   Belford & Oxford traverse         👁  ⋮ │
│        6.4 mi · 5h 20m · 2,780 ft ↑            │
│        ╭──────────────────────────────╮        │
│        │      ▁▃▅▇█▇▅▆█▇▅▃▂▁          │        │
│        ╰──────────────────────────────╯        │
│        DISTANCE     ASCENT      DESCENT        │
│        6.4 mi       2,780 ft ↑  2,140 ft ↓     │
│                                                │
│        HIGH POINT   LOW POINT   DURATION       │
│        14,153 ft    12,020 ft   5h 20m         │
└────────────────────────────────────────────────┘
```

The same six-cell grid as #218's totals block, with the same type, spacing and
em-dash rules. **Duration takes the cell that holds `Tracks` at trip level** — it
is the per-track number with no sensible trip-level sum, and the grid should not
change shape between the two places it appears.

The detail is indented to the name's left edge, so it hangs off the row's text
column the way the meta line already does rather than starting a new block at the
row's own left edge.

## The affordance

**The row click opens the detail. `Rename` moves into the `⋮` menu.**

This revises #46, which put rename on the name click. That is the cost and it is
worth naming plainly: rename becomes two interactions instead of one, on a
surface where it was previously immediate.

Three things pay for it:

- **The row had no free click target.** The name was rename, the swatch is the
  colour popover, the eye is visibility, `⠿` drags, `⋮` is actions. Opening had
  to displace something.
- **`⋮` is already where row actions live.** #193 built it, tested it, and put
  `Remove from trip` and `Delete permanently…` in it precisely so the row could
  stop being a control panel. `Rename` is a row action and belongs with them.
- **A row click already means "open the thing" everywhere else.** #194 states the
  contract for cairns — one click opens the detail face. A track row that instead
  renames is the odd one out, and the inconsistency is invisible until you hit
  it, at which point you have renamed a file you meant to read.

Rename also gains something: an undiscoverable click-to-edit becomes a labelled
menu item. Nobody has ever found click-to-rename without being told.

### Click precisely

- **The name is a `<button>`** carrying `aria-expanded` and `aria-controls`. It
  is the keyboard path and the assistive-technology path, and it is free now that
  rename has moved off it.
- **The row's remaining non-interactive area also toggles**, for pointer users
  who aim at the meta line or the whitespace. Implemented by ignoring any click
  whose target sits inside an interactive descendant, rather than by stopping
  propagation in five different handlers — one rule in one place, so a control
  added later is not silently swallowed.
- **`⠿`, the swatch, the eye and `⋮` never toggle.** Nor does the colour popover
  or the inline remove confirm, both of which render inside the row.

### One at a time

Opening a track closes any other open track.

The column's height is the scarce resource and two open details push the list
around under the reader's hands. It also matches the rule #46 already set for
editing — one row at a time — and the reader's comparison is against the trip
totals directly above, not against a second track.

**Click-again closes.** This differs from #194's "no click closes" contract, and
the difference is the surface: #194 governs a modal detail face with a close
button and an Escape key. An inline disclosure has neither, and a control that
opens but cannot close is not a disclosure.

## The profile

An inline `<svg>`, `--profile-height` tall, full width of the text column.

**Drawn in the track's own colour**, not in `--accent`. The language spends its
one accent on interaction and forbids it on decoration — but track polyline
colours are explicitly data rather than chrome, and this line *is* that track.
Drawing it in the same colour as its swatch and its polyline is what makes the
row, the map and the profile read as one object.

| Part | Treatment |
|---|---|
| Line | The track's colour, `1.5px`, `vector-effect: non-scaling-stroke` |
| Fill beneath | `color-mix(in srgb, <track colour> 16%, transparent)` |
| Baseline | 1px `--border` |
| High and low marks | `--text-muted` dots, `2.5px` |

`non-scaling-stroke` is not a detail: the path is drawn into a viewBox stretched
to the row's width, and without it the stroke stretches with the geometry and the
line reads thick on a wide panel and thin on a phone.

**The x axis is cumulative distance, not point index.** A track sampled densely
on the descent and sparsely on the climb otherwise draws a profile that is
correct in its values and a lie in its shape — and the shape is the entire reason
to draw it rather than list two more numbers.

**The y axis spans the track's own low and high**, not sea level. A 2,000 ft
climb starting at 12,000 ft is a flat line against a zero baseline.

**Drawn from the median-filtered series** #218 stores. The unfiltered series
draws visibly hairy, which is the second reason that filter exists.

## States

| State | Row shows |
|---|---|
| Closed | #193's two-line row, unchanged |
| Open | The row, then the profile, then the grid; row keeps `--hover` fill |
| Open, no usable elevation | The grid with four em dashes; **no profile** |
| Open, single-point track | Distance `0`, duration and elevation em dashes, no profile |
| Multi-track file | **Does not open** — see below |
| Renaming | Unchanged from #46 apart from where it starts; an open detail stays open |
| Removing / confirming | #77's treatment replaces the row's contents, and the detail closes |
| Disconnected (#73) | Opens and reads normally; only `⋮`'s items are disabled |

**No profile rather than an empty frame** when elevation is unavailable. A flat
line across a 56px box asserts a flat walk; nothing asserts nothing, and the four
em dashes above it have already said why.

**Disconnected opens normally**, for #218's reason: this is derived data with no
control in it, and dimming it would claim the numbers are unavailable when they
were computed from tracks already in memory.

## Multi-track files do not open

A KML holding several tracks shows no stats line today — #6 and #7 both decided
that a file with three tracks has no unambiguous single set of numbers, and #193
kept it. Nothing here overturns that, so there is nothing for the detail to show.

Such a row therefore has **no name button, no `aria-expanded`, and no pointer
affordance** — it must not look like it opens, or the dead click is worse than
the missing feature. Its `⋮` still carries `Rename`, so nothing is lost.

This is a real gap: a three-track file is exactly the case where per-track
numbers would help most. The honest fix is a detail listing one grid per track,
each under its own name, and that is its own issue — not a thing to improvise
inside this one.

## Transitions

Expand and collapse over `--motion-base` using `grid-template-rows: 0fr → 1fr`
on a wrapper, which animates to content height without measuring anything.
Transition the named property, never `all`.

Collapses under `prefers-reduced-motion` via the global block — the detail
appears and disappears instantly, which is correct.

**The numbers do not animate.** No count-up, no cross-fade on change. A figure
that tweens is a figure you cannot read while it does.

## Accessibility

- The name button carries `aria-expanded` and `aria-controls` pointing at the
  detail's id.
- The detail is not `display: none` when closed — it is a collapsed grid row with
  `visibility: hidden` at the end of the transition, so it leaves the tab order
  without the layout jump `display` causes mid-animation.
- The profile is `role="img"` with an `aria-label` naming the two endpoints and
  the distance: `Elevation profile: 12,020 ft to 14,153 ft over 6.4 miles`. A
  screen-reader user gets the shape's summary, and the exact values are in the
  grid directly beneath it.
- Colour is never the only carrier: every value in the grid has a text label, and
  the profile's meaning is in its `aria-label`.

## Edge cases

- **The colour popover open while the detail is open.** Both stay; neither traps.
  Changing the colour restyles the profile immediately, since it reads the same
  value the swatch and the polyline do.
- **A track removed from the trip while open.** The row unmounts and takes the
  detail with it. Nothing to close.
- **The open row dragged.** Reordering collapses it first — dragging a row three
  times its normal height past its neighbours makes the drop indicator unreadable.
- **Rename committed while open.** The detail stays open and the profile's
  `aria-label` is unaffected; the name is not in it.
- **Visibility toggled while open.** The detail stays open at full contrast.
  #193's rule already says hiding a track on the map does not make its numbers
  less true.
- **A track whose every point shares one elevation.** Unavailable, per #218 —
  no profile, four em dashes.
- **A very long track.** The profile is one path from the stored filtered series;
  no resampling is specified, and if a 10,000-point path measures slow that is a
  real finding for a follow-up rather than a pre-emptive simplification.
- **Phone.** Rows keep `--row-touch` and the detail is reached by tap. The grid
  holds three columns at `375px` per #218's measurements.

## Copy

| String | Where |
|---|---|
| `Rename` | The `⋮` menu, track rows, above `Remove from trip` |
| `Distance` `Ascent` `Descent` `High point` `Low point` `Duration` | Cell labels |
| `Elevation profile: {low} to {high} over {distance}` | The profile's `aria-label` |

`Rename` sits first in the menu because it is the only non-removing item and
#193's order runs from safe to destructive.

## New tokens

| Token | Value | For |
|---|---|---|
| `--profile-height` | `56px` | The elevation profile's drawn height inside a row |

On the 4px grid. Tall enough that a rolling traverse is distinguishable from a
single climb, short enough that an open row stays inside one screen of the
column alongside its grid.

## Out of scope

- **The computation and the trip totals block** — #218.
- **A per-track detail for multi-track files** — see above.
- **Scrubbing the profile**, hover readouts, or a marker tracking the map. The
  profile is a picture here.
- **Panning or zooming the map to the track on open.** Reasonable, separate.
- **A combined trip profile.** #218 rules it out for the same reason.
- **Moving the colour swatch onto `--glyph-size`**, which #193 already parked.
