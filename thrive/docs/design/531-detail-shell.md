# 531 — Activity detail: top bar, title block, stats card

Part of #525. Uses #526's tokens. Boards D and E of the prototype
(https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). This is the shell every
activity's detail screen gets. For a completed activity without a drawable
track it's the whole screen. #532 puts a map above it, and #533 puts the
strength body inside it.

Earlier notes kept: #403's in-app confirm and `deleteWorkoutCopy` wording,
#404's interaction states, #157's provenance line, #260's View on COROS link,
#145's estimate on planned workouts, #362's resume.

## Order on screen

1. Top bar
2. Title block
3. Body: the stats card (completed non-weight), #533's strength body
   (completed weight), or today's planned or active body
4. Note card
5. Provenance row
6. Planned: Start workout. Active: Resume workout (today's full-width primary
   buttons, unchanged)

Sections are `--space-sm` + `--space-xs` (12) apart, with `--space-md` side
padding.

## Top bar

A row 44px tall, padding `--space-sm` + `--space-xs` (12) at the sides and
`--space-sm` at the top.

- **Back** (left): a 44px round `button`, a 20px chevron-left icon, named
  "Back". It calls `goBack()` as today. The text "← Back" goes.
- **Edit** (right): a 44px round icon button with a pencil icon, named "Edit
  workout", `data-focus-key="workout-edit"` (kept). It opens
  `#/history/<id>/edit`.
- **More actions** (right, after Edit): a 44px round icon button with a
  three-dot icon, named "More actions", `aria-haspopup="menu"`,
  `aria-expanded`.

The icons are #405-style drawn SVGs, 20px, `currentColor`, `--color-text`.
The buttons have no background here. On #532's map they gain a scrim.

### The menu

A popover under More actions, aligned to its right edge,
`--color-surface-raised`, `--radius-md`, the app's menu shadow, `role="menu"`.
Items are `menuitem` buttons, 44px tall, `--text-base`, with a 20px icon then
the words:

| Item | Shown when | Does |
|---|---|---|
| Copy workout | weight, not planned (today's Copy rule) | today's `handleCopy` |
| Save as template | weight, not planned, has exercises (today's rule) | today's `handleSaveAsTemplate` (still `prompt()`, out of scope) |
| Delete workout | always | today's `handleDelete`: the #403 confirm with `deleteWorkoutCopy`, then back |

- **Delete workout** is last, separated by a hairline (`--color-border-light`),
  with its word and icon in `--color-danger-text`. Colour isn't the only
  signal: the word says Delete, and the confirm follows.
- **Keys:** opening focuses the first item. Up and Down move and wrap, and Home
  and End jump. Escape or Tab closes it and returns focus to More actions. A tap
  outside closes it.
- **While deleting:** More actions is disabled (`aria-disabled`), as the Delete
  button was today.

## Title block

A row: a 44px **type tile** (#526's tint and the #405 icon at 24px in
`--type-<type>`, `--radius-md` + `--space-xs`), then a column, then the effort
chip.

- **Name:** the screen's only `h1`, `--text-2xl`, 700, wrapping freely. It
  falls back to the type word.
- **Date line:** `--text-sm` `--color-text-secondary`: "Sun, Oct 18 · 12:04
  PM". The time is left out when `time` is blank. Planned workouts show
  "Planned for Wed, Oct 21", followed by " · about 45 min" when there's an
  estimate (#145). Active workouts show "In progress".
- **Effort chip:** today's `.workout-effort-*` pill, only when effort is set,
  on completed workouts only.
- **Planned and active:** the type tile is replaced by a tile with the type
  icon on `--color-primary-light`.

## Stats card

Completed bike, hike, run, walk and stretch. Weight is #533's.

`--color-surface`, `--radius-lg`, padding `--space-md`.

- **Headline:** `--figure-xl`, 700, then the unit in `--text-lg`
  `--color-text-secondary` on the baseline.
  - Distance in miles, one decimal, when `distance_m` is set.
  - Otherwise the duration: "33 min" under an hour, "1:48" "h" from an hour.
  - With neither, there's no headline, and the grid has no rule above it.
- **Grid:** a hairline (`--color-border-light`), then a 3-column grid
  (`repeat(3, minmax(0, 1fr))`), `--space-md` row gap, `--space-sm` column gap.
  - Each cell is a value at `--text-xl` 700 `tabular-nums`, with its unit in
    `--text-sm` `--color-text-secondary`, over a label in `--text-xs`
    `--color-text-secondary`.
  - Cells, in order, each left out when its source is blank:

| Label | Value | Shown for |
|---|---|---|
| Activity time | elapsed, h:mm:ss ("1:47:53"; "33:00" under an hour) | when the headline is distance |
| Avg speed | distance / elapsed, mph, one decimal | bike |
| Avg pace | elapsed / distance, m:ss "/mi" | hike, run, walk |
| Avg heart rate | `avg_hr` "bpm" | all |
| Elev gain | `ascent_m` in ft, grouped "1,620" | all |
| Elev loss | `descent_m` in ft | all |
| Calories | `calories` "kcal", grouped | all |
| Moving time | `moving_seconds`, h:mm:ss | all, unless it equals elapsed to the minute |

- **Empty cells:** none is ever "0" or "—". Leaving one out pulls the next one
  forward. The grid has no empty cells.
- **Accessible names:** `aria-label` on each value spells its unit ("8.4 miles
  per hour").
- **Nothing to show:** with no headline and no cells, the card is replaced by
  one line, "No details recorded", `--text-sm` `--color-text-secondary`. The
  old "No additional details" empty state goes.

## Note card

Only when `notes` is non-blank. `--color-surface`, `--radius-lg`, padding
`--space-sm` + `--space-xs` (12) `--space-md`.

- **Heading:** `h2` "Note", `--text-base` 600, with a 16px pencil-line icon in
  `--color-text-secondary`.
- **Text:** `--text-sm`, line-height 1.5, `white-space: pre-wrap`.

## Provenance row

A row with `--space-sm` gap that wraps.

- **Left:** #157's `WatchGlyph` and the `provenanceDetail` text, `--text-sm`
  `--color-text-secondary`. It's left out for hand-logged rows, as today.
- **Right:** #260's "View on COROS" link with its external glyph and sr-only
  "(opens in a new tab)", unchanged, given a 44px tall hit area.
- **Copied:** "Copied from a previous workout" on its own line under them, as
  today.
- With nothing to show, the row isn't rendered.

## Planned and active workouts

They get the top bar and the title block. Their bodies stay as today: the
compact exercise list for planned weight, nothing for planned cardio, and the
active view. Start workout and Resume workout stay as the bottom primary
button. The bottom Delete button goes, because Delete is in the menu.

## Not found

Unchanged: "Workout not found" and "Back to Activities".

## Focus

Arriving from a list card, focus behaves as today (`focus-handoff`). Back
returns to the opener, focus lands on the card's `data-focus-key`, and
returning from Edit focuses the Edit button.
