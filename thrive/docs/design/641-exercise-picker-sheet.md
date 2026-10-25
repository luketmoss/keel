# 641 — Exercise picker: a bottom sheet that adds several

Part of #637. Prototype board "Builder · Add exercise sheet"
(https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note replaces
`AddExerciseModal`'s look and its one-pick-and-close behaviour, for every
caller: the template editor, the workout planner and the workout tracker.
#640 is the first caller to pass a section.

Earlier notes kept: #319's dialog semantics and `useModalFocus` (trap,
Escape, restore to the opener), the exercise form and its words, and the
tag-filter rule (an exercise matches when it has **any** selected label).

## API

```ts
interface AddExerciseModalProps {
  onAdd: (exercises: ExerciseWithRow[]) => void; // pick order, at least one
  onClose: () => void;
  sectionLabel?: string; // "Superset 1": shown as "to Superset 1"
}
```

`onSelect` goes. Each caller's handler takes the array and does for each
element exactly what it does today for one:

- **Template editor:** appends slots (section from #640, else `primary`),
  then opens the first added.
- **Planner:** appends `PlannerExercise` slots, then opens the first added.
- **Tracker:** appends `TrackerExercise`s with consecutive `exercise_order`
  (max + 1, + 2 …), each with one empty set.

The sheet calls `onAdd` and the caller closes it, as callers close it today.

## The sheet

- **Scrim:** fixed, full screen, `rgba(0, 0, 0, 0.5)` in both themes (the
  existing `.modal-overlay` value). A tap on it closes.
- **Panel:** fixed to the bottom, full width (max 600px, the app column, centred on wide
  screens), top at `--space-xl` + `--space-xl` + `--space-sm` (72) from the
  viewport top, `--color-surface-raised`, top corners `--radius-lg`. It's a
  column, and only its list scrolls. On a 375 × 667 viewport that leaves at
  least six 56px rows visible under the header, search and filters. `/test`
  measures it.
- **Grab bar:** 36 × 4, `--radius-full`, `--color-border-strong`,
  `--space-sm` from the top, `aria-hidden`. It's decorative: a drag to close
  is not built.
- **Motion:** it slides up from the bottom over `--transition-normal`. Under
  `prefers-reduced-motion: reduce` it appears in place, with the scrim fading
  only.

## Header

- **Title:** `h2` "Add exercises", `--text-xl` 700, the dialog's
  `aria-labelledby` target.
- **Subtitle:** when `sectionLabel` is given, "to Superset 1" in `--text-sm`
  `--color-text-secondary` under the title, included in the dialog's
  `aria-describedby`.
- **Close:** a 44px round button on the right, × icon, named "Close".

## Search and filters

- **Search:** full width inside `--space-md` sides, 44px, `--color-bg` field,
  `--radius-md` + `--space-xs` (12), with a 18px search icon and the
  placeholder "Search exercises", named "Search exercises". Initial focus, as
  today.
- **Filters:** one row of `.filter-chip` pills that scrolls sideways
  (`.activities-chips`' scroller: no scrollbar, edge bleed). Each pill is an
  8px dot in the label's colour (`getLabelColor` of its `color_key`, else `colorKeyFromName`; the dot only, the word is
  `--color-text`), then the label word. `aria-pressed`, group named "Filter by
  label". The order is today's `allTags`.

## Rows

Each exercise is a `button` with `aria-pressed`, at least 56px, hairlines
between rows:

```
Incline Press DB                           ( ✓ )
Push · Chest · DB · last Oct 24
```

- **Line 1:** the name, `--text-base` 500.
- **Line 2:** `--text-xs` `--color-text-secondary`: the labels joined by " · ",
  then "last Oct 24" (with the year when not this year), from
  `buildLastPerformedMap`. Either part is left out when absent.
- **Check:** a 24px circle on the right. Unselected, it's a 2px
  `--color-border-strong` ring. Selected, it's filled `--color-primary-fill`
  with a check in `--color-on-fill`. The pressed state and the check both say
  "selected", so it never rests on colour alone.
- **Order:** alphabetical, as today.
- **Name:** "Incline Press DB, Push, Chest, DB, last done October 24", with
  pressed or not pressed spoken by `aria-pressed`.

Selections are kept by id in pick order. They survive search and filter
changes, so a selected exercise filtered out of view stays selected.

## Add button

Pinned at the panel's bottom, over the list's end, in a bar with
`--space-sm` + `--space-xs` padding and a `--color-surface-raised` background
that fades in from transparent. It's a full-width `btn btn-primary`, 48px:

| Selected | Label | State |
|---|---|---|
| 0 | Choose exercises | disabled (#404) |
| 1 | Add 1 exercise | enabled |
| n | Add n exercises | enabled |

Pressing it calls `onAdd(selected)`.

## Create

The last row of the list, always present, a `button`, at least 52px,
`--color-primary-text` 600, with a plus icon:

- **No search, or matches:** it reads "Create new exercise".
- **The search matches nothing:** it reads "Create “Landmine press”" (the
  search, trimmed). The "No matching exercises" status line still shows
  above it, and is still announced.

It opens today's `ExerciseForm` in the sheet (title "New exercise"), with Name
prefilled from the search when there was one. Submit is "Create" (was "Create
& Select"). On success the form closes, the search clears, and the new
exercise is selected (appended to the pick order), with focus on its row.
Cancel returns to the list with nothing changed.

## Closing

Close, a scrim tap or Escape closes with nothing added, even with selections
(they are not data: nothing to confirm). Focus returns to the opener
(`useModalFocus`).

## Contrast

Existing pairs: `--color-text`, `--color-text-secondary` and
`--color-text-muted` on `--color-surface-raised` (muted measured at 4.61 in
`suite-language.md`); `--color-on-fill` on `--color-primary-fill`;
`--color-primary-text` on `--color-surface-raised`. The ring and dots are
3:1 marks with their words beside them.

## Removed

The centred `.modal-content` look for this dialog only (other dialogs keep
it), the wrapping `LabelBadge` filter rows, the `LabelBadge`s on rows, and
"Select Exercise" / "+ Create New Exercise".
