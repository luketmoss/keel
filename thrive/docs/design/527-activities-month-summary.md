# 527 — Activities header: month picker, month summary, type chips

Part of #525. Uses #526's `--type-*` tokens. Board A of the prototype
(https://claude.ai/artifact/3EKueKvLjDGy2Now8unv9m). Replaces the week streak
(#105's dots), the three-cell stats bar, the cardio row and the funnel toggle
on the Activities screen.

## Layout, top to bottom

1. Month button
2. `h1` "Activities", at the Day header's title size (#486). Reuse its class
   rather than restating sizes.
3. Type chips row
4. Month summary card
5. (#528) In progress, Up next, week groups

## Month button

Above the heading, `--text-sm`, `--color-text-secondary`: "October 2026" and a
12px chevron. It's a `button` with `aria-haspopup="listbox"` and
`aria-expanded`, and its accessible name is "Choose month, October 2026". The
hit area is at least 44px tall (padding, not font size).

### The picker

A popover anchored under the button, `--color-surface-raised`,
`--radius-md`, shadow as the app's existing menus. It's a `listbox` of options,
newest first:

`October 2026 ·········· 16`
`September 2026 ········ 21`

- **Options:** the current month always, then each earlier month that has at
  least one completed activity (status not planned and not active). A month
  with none is not listed, so no past option can open on an empty list.
- **Count:** the right-hand count is that month's completed activities, all
  types (it ignores the type chip).
- **Selected option:** `aria-selected="true"`, drawn with
  `--color-primary-light` behind it and a check.
- **Keys:** Up and Down move, Enter or a tap chooses. Escape, a tap outside, or
  choosing closes it. Focus always returns to the month button.
- **Long lists:** more than eight options scroll inside the popover, with a
  maximum height of eight rows.

The chosen month is held in a store signal (`activitiesMonth`, a `YYYY-MM`
string), so it survives moving to another tab and back. A reload starts on the
current month again. At midnight on the first of a month, a screen left open on
the previous current month keeps showing it; it's the chosen month, not
"today's".

## Type chips

A row under the heading. On narrow screens it scrolls horizontally, with no
wrapping and no visible scrollbar.

- **Chips:** "All", then one per type that has any completed activity in all of
  history, in the order Weight, Bike, Stretch, Hike, Run, Walk. Each type chip
  carries its #405 icon in `--type-<type>` before the word. The words are the
  app's existing type labels.
- **Pressed:** exactly one chip is pressed (`aria-pressed="true"`), drawn
  filled in `--color-text` with `--color-bg` text; the others are outlined in
  `--color-border`. All is pressed by default. It's backed by the existing
  `filterType` signal (null = All).
- **Tags:** a last chip, "Tags", toggles today's tag filter row (`LabelBadge`
  chips and "Clear filters") under the chips, with `aria-expanded`. While any tag
  is active it reads "Tags · 2". Tag filtering is unchanged (`filterTags`).
- **Height:** 34px chips inside a 44px tall hit row.

## Month summary card

`--color-surface`, `--radius-lg`, padding `--space-md`, as a Day card (#485)
but on the Activities screen.

- **Title** (`h2`, `--text-base`, 600): "October so far" when the chosen month
  is the current month; "September" for a past month (with the year when it is
  not the current year: "December 2025").
- **Figures:** three columns of `--figure-md`, 700, each with a
  `--text-xs` `--color-text-secondary` label under it.
  - **Activities:** the completed activities in the month, after the type and
    tag filters, labelled "activities", or "activity" for one.
  - **Total time:** the sum of `elapsed_seconds`, as "14 h 2" (hours, then
    minutes, with the "h" in `--text-sm` `--color-text-secondary`), or "45 min"
    under an hour. The label is "total time". When some activities have no
    duration it reads "total time, 14 of 16". With no durations at all the
    figure is "—" and the label "no times recorded".
  - **Distance:** the sum of `distance_m` in miles to one decimal, with "mi" as
    the unit, labelled "distance". The column is left out when no activity has
    a distance, and the other two take the space.
- **Split bar:** 8px, `--radius-sm`, segments separated by 2px of the card's
  background, one per type present, in chip order, sized by count. Filled with
  `--type-<type>`. Only shown when two or more types are present; under a type
  chip it would be a single bar, so it's left out.
  - `role="img"`, named "By type: 7 weight, 4 bike, 5 stretch".
- **Legend:** under the bar, `--text-xs` `--color-text-secondary`: an 8px
  swatch, the count in `--color-text` 600, then the type word. It wraps.

### Empty

When the current month has nothing completed (for example, on the 1st), the
figures and bar are replaced by one line, `--text-sm` `--color-text-secondary`:
"Nothing logged in November yet". Under a type chip it reads "No bike
activities in November yet".

## Removed

- The streak dots, their sr-only description, and the labels.
- The stats bar, the cardio row, and the sr-only `statsSummary` paragraph.
- The funnel toggle button and the type row of `ActivitiesFilters` (its tag
  row stays, now opened by the Tags chip).
- The helpers only those used (`getWeekStreak`, `describeWeekStreak`, the
  week, last-week, month and cardio totals, `coverageSuffix` if unused) and their
  tests.

## States

| State | Shows |
|---|---|
| Loading (workouts not loaded) | The header and chips. The summary card's figures are "—" with labels, and no bar |
| Loaded, current month with data | As above |
| Current month empty | "Nothing logged in <Month> yet" |
| Type chip with no match this month | "No <type> activities in <Month>" (with "yet" on the current month) |
| Load error | Unchanged from today: the app's existing load-error state |
