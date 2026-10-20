# 533 — Strength detail: sets ring, set effort, exercises by section

Part of #525. Fills #531's body slot for a completed weight workout. Board C of
the prototype (https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). The sets ring
reuses #489's ring and `isSetLogged`.

The owner's rule about sets (unreliable against the plan, and not important)
was given for the **list** (#529). On the detail screen sets are the content,
so they stay. The ring counts what was logged against what the workout holds,
and it's the only place a sets ratio appears.

## Order in the body

1. Hero card
2. Set effort card
3. (#531's Note card)
4. Exercises heading and Last time chip
5. One card per section

## Hero card

`--color-surface`, `--radius-lg`, padding `--space-md`. A row with
`--space-md` + `--space-xs` (20) gap.

- **Ring**, 108px:
  - a full circle track of 10px stroke in `--color-border-light`
  - the arc in `--type-weight` from 12 o'clock, with round caps, its share =
    logged ÷ total set rows (`isSetLogged`: reps or weight entered)
  - inside it, the logged count at `--figure-lg` 700 over "of 26 sets" in
    `--text-xs` `--color-text-secondary`
  - `role="img"`, named "22 of 26 sets logged"
  - with zero set rows the ring is left out, and the grid takes the full width
- **Grid:** 2 columns (`repeat(2, minmax(0, 1fr))`), `--space-md` row gap.
  Each cell is styled as in #531's grid, and left out when blank:

| Label | Value |
|---|---|
| Time | elapsed, m:ss or h:mm:ss |
| Moving | `moving_seconds`, same format; left out when equal to elapsed to the minute |
| Avg heart rate | `avg_hr` "bpm" |
| Calories | `calories` "kcal" |

- **Nothing at all:** with no ring and no cells, the card is replaced by "No
  details recorded".

## Set effort card

Shown when at least one logged set outside the warm-up has an effort.

- **Header:** `h2` "Set effort" on the left. On the right, "18 working sets"
  (logged non-warm-up sets), `--text-xs` `--color-text-secondary`.
- **Bar:** 12px, `--radius-sm`, 2px gaps, segments Easy, Medium, Hard in that
  order, sized by count. Each is filled with its effort colour, `--effort-easy`,
  `--effort-medium` or `--effort-hard` (#526). An effort with zero sets has no
  segment.
  - `role="img"`, named "Set effort: 12 easy, 7 medium, 3 hard", plus ", 2
    without effort" when there are any.
- **Legend:** a 3-column grid: a swatch and the word in `--text-xs`
  `--color-text-secondary`, over the count in `--text-lg` 600. All three
  efforts are listed, zero included, so the columns don't move.
- **Without effort:** when some logged working sets have no effort, a line
  under the legend reads "2 without effort", `--text-xs`
  `--color-text-secondary`.

## Exercises heading

A row with `--space-lg` above it.

- **Left:** `h2` "Exercises", `--text-lg` 700.
- **Right:** the **Last time** chip, only when `findPreviousWorkout` finds one
  (today's rule: same template, else same name). It's a 34px outlined chip in
  a 44px hit row, with a history icon and "Last time", using `aria-pressed`.
  Pressed, it's filled with `--color-primary-light` and
  `--color-primary-text`.

## Section cards

One card per section present, in the order the workout's exercises first
appear (`exercise_order`): normally warm-up, primary, SS1, SS2, SS3, burnout,
cool-down. `--color-surface`, `--radius-lg`, padding `--space-sm` +
`--space-xs` (12) `--space-md`, `--space-sm` + 2 (10) apart.

- **Heading:** `h3`, `--text-xs` 700, upper case, letter-spacing 0.04em,
  `--color-text-secondary`. The words are "WARM-UP", "PRIMARY", "SUPERSET 1",
  "SUPERSET 2", "SUPERSET 3", "BURNOUT" and "COOL-DOWN". The section label
  colours used elsewhere in the app aren't used here. The words carry it.
- **Exercises inside** are separated by a hairline (`--color-border-light`)
  with `--space-sm` + `--space-xs` padding.

### Warm-up rows

One row per exercise: the name on the left, `--text-sm`. On the right is what
was logged, in `--color-text-secondary` `tabular-nums`: the reps ("30"), the
weight and reps ("20 lb × 10"), or nothing when unlogged. Multiple warm-up sets
are joined: "30, 30".

### Working exercises

```
Pullovers DB                         50 lb × 10
[50×10] [50×10] [50×10]
 MED     MED     MED
```

- **Line:** the name (`--text-base` 600, wrapping) on the left. On the right
  is the top set, `--text-xs` `--color-text-secondary`: the heaviest logged
  set as "50 lb × 10". With no weights it's "BW × 5", and with nothing logged
  it's left out.
- **Tiles:** a wrapping row, `--space-xs` + 2 (6) gap, one per set row in
  `set_number` order. Each is 58×44, `--radius-md` + 2 (10), centred column:
  - **Logged:** fill `--color-surface-raised`, the value in `--text-sm` 600
    `tabular-nums`, then the effort under it in 10px (the one place below
    `--text-xs`, as the prototype; see New tokens), 700, upper case, in its
    `--effort-*` colour.
    - The value is "50×10", "BW×5" (reps, no weight), or "50 lb" (weight, no
      reps).
    - The effort is "EASY", "MED" or "HARD", or nothing when unset.
  - **Not logged:** transparent, `1px dashed --color-border`, "×8" (planned
    reps) in `--color-text-muted` over "NOT DONE" in `--color-text-muted`.
  - Tiles are `aria-hidden`. The row is `role="img"`, named "Sets: 50 pounds
    by 10, medium; 50 pounds by 10, medium; …", and "not done" for unlogged
    ones.
- **Last time line:** when the chip is pressed and the previous workout has
  this exercise (same id and order, as today), a line under the tiles reads
  "Last time (Oct 12): 50 lb × 10 · Medium", using today's best-set rule,
  `--text-xs` `--color-text-secondary`.

There's no expand or collapse. `ExerciseDetail`'s toggle and its expanded
state go.

## New tokens

| Token | Value | For |
|---|---|---|
| `--text-2xs` | `0.625rem` (10px) | the effort word on a set tile, upper case, 700. This is the only use. Upper case at 700 keeps it legible, and the word is also in the row's accessible name |

## CLAUDE.md

`thrive/CLAUDE.md`, UX Design Decisions: "**Activity detail**: Summary per
exercise, tap to expand set-by-set" becomes "**Activity detail**: exercises in
section cards with every set shown as a tile (value and effort); no expand
(decided 2026-10-20, #525)".
