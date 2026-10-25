# 640 — Template builder

Part of #637. Prototype boards "Template builder" and "Builder · Add exercise
sheet" (https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note replaces
the editor at `#/templates/new` and `#/templates/<id>/edit`. It draws the
template as #639 does (#533's section cards), with the controls moved into
rows you open. It needs #641's picker (`onAdd`, `sectionLabel`).

Earlier notes kept: #576's rest band behaviour and words (`SectionRestBand`,
`restToSave`), #376's `RepsField`, #328's reorder focus and announcements
(`useReorderFocus`), #403's confirms (`discardChangesCopy`,
`deleteTemplateCopy`), #404's interaction states, and today's save rules (a name
and at least one exercise).

## Order on screen

1. Top bar
2. Name
3. Summary card
4. Section cards, in order of first appearance
5. "Add a section" and its pills
6. Edit mode only: the quiet card (Discard changes, Delete template)

Blocks are `--space-sm` + `--space-xs` (12) apart, with `--space-md` sides
and `--space-xl` at the bottom. The tab bar stays, as today.

## Top bar

A 44px row, padding as #531's.

- **Close** (left): a round `detail-icon-btn` with a 20px × icon, named
  "Close". It runs today's `handleDiscard`: when dirty, the #403 confirm with
  `discardChangesCopy('template')`, then back to the detail (edit) or
  `#/templates` (new).
- **Save** (right): a pill button, 44px tall, `--radius-full`, padding 0
  `--space-lg` - 4 (20), `--color-primary-fill` with `--color-on-fill` text,
  600. It reads "Save", or "Saving…" while saving. It is disabled (#404's
  disabled, `aria-disabled` not removed from the tab order) until the name
  is non-blank and there is at least one exercise. It runs today's
  `handleSave`.

## Name

- A `label` for the input, styled as the meta line (`--text-sm`, 500,
  `--color-text-secondary`): "Template name".
- The input is full width, transparent, with no box. Its text is in the
  `.day-title` size and weight, with a 2px dashed `--color-border-strong`
  bottom border and `--space-xs` padding below. On `:focus-visible` the
  border turns solid `--color-primary`, which is its focus indicator (3:1 on
  `--color-bg` in both themes, per the registry), plus the global ring. The
  placeholder is "Name this template", in `--color-text-muted`.

## Summary card

#638's `TemplateSummary` with two figures, exercises and working sets. Last
took is left out: the builder is about the plan. There is no bar or legend.
It updates on every change, and its numbers sit in a polite live region so a
screen reader hears "8 exercises, 20 working sets" after an add or remove.

## Section cards

The card and heading are #639's (#533's words). After the heading, on the
right of the same row, is a count in `--text-xs` `--color-text-secondary`:
"2 exercises".

### Closed row

A `button`, full width, at least 52px, hairlines between rows,
`aria-expanded="false"`, holding:

- the name, `--text-base` 500, wrapping, on the left
- the prescription, `--text-base` 600, `tabular-nums`, as #639 ("5 × 4–6",
  "3 sets", "1 set")
- a 16px chevron-down in `--color-text-secondary`, which flips when open

The row's accessible name is "Bench Press BB, 5 sets of 4 to 6, edit".

### Open row

One row open at a time. Opening another closes the first, and opening the
open one closes it. Under the row, an inset panel on `--color-bg`,
`--radius-md`, padding `--space-sm` + `--space-xs` (12), `--space-sm` +
`--space-xs` gap, `--space-sm` + `--space-xs` margin below:

| Control | What | Notes |
|---|---|---|
| Section | today's `SectionPicker` (with its warm-up warning) | changing it moves the row, below |
| Sets | − value + stepper, 1–20, 40px round buttons, value `--text-lg` 600 `tabular-nums` | a button at its limit is `aria-disabled`, as `DurationStepper` does |
| Reps | today's `RepsField`, right-aligned | a stored range stays read-only until replaced, as today |
| Actions | "Move up", "Move down" (36px outlined chips, each in a 44px hit area), then "Remove" in `--color-danger-text`, pushed right | |

- **Move up / Move down:** within the row's section only. Each is
  `aria-disabled` at its section's end. Each move goes through today's
  `move()` and `reorder.moved()`, so focus follows the row and the move is
  announced ("Bench Press BB moved up, 1 of 2").
- **Remove:** removes the row with no confirm. Nothing is saved until Save,
  and Close or Discard undoes it. Focus goes to the next row in the card,
  else the previous one, else the card's Add exercise. The live summary
  announces the new count.
- **Section change:** the row moves to the end of the target section's card
  (created at the end of the list when new). It stays open, focus stays on
  the Section control, and it is announced: "Moved to Superset 2". The card
  it left disappears if it is now empty.

### Rest rows

Today's `SectionRestBand` rows, unchanged in behaviour and words ("Rest between
sets", "Rest after each round", "Switch between exercises", "Default (1:30)",
Change, Use default, the duration stepper). They are the last rows of the
card, in one inset block on `--color-bg`, `--radius-md`, padding
`--space-sm` `--space-sm` + `--space-xs`, each row at least 44px with the label on the
left. The group keeps its name ("Primary rest"). Warm-up and cool-down have none.
The blue `.template-rest-band` background goes.

### Add exercise

The card's last control: a text button, at least 44px, a 18px plus icon then
"Add exercise", `--color-primary-text` 600, named "Add exercise to Superset
1". It opens #641's sheet with `sectionLabel` "Superset 1". `onAdd` appends
each exercise to the end of this section in pick order (`sets: '1'`,
`reps: ''`), opens the first one added, and moves focus to its row button.

## Add a section

Under the last card: an `h2` "Add a section" (`.week-heading` style), then a
wrapping row of pills, `--space-sm` gap. They are `.filter-chip` buttons with a
1px dashed `--color-border-strong` outline, because they make something rather
than filter something. One pill per section kind not present:

| Pill | Section it starts |
|---|---|
| Warm-up | `warmup` |
| Primary | `primary` |
| Superset | the lowest free of `SS1`, `SS2`, `SS3`. Hidden when all three exist |
| Burnout | `burnout` |
| Cool-down | `cooldown` |

A pill opens #641's sheet for that section ("to Superset 2"). Exercises added
create the card at the end of the list. Closing the sheet with nothing added
creates nothing: there is never an empty card, because the sheet stores no
sections, only rows. With every kind present, the heading and row are hidden.

**New template, no exercises:** in place of the cards, "Add a section to
start." in `--text-sm` `--color-text-secondary`, then the heading and pills.

## Quiet card (edit mode)

A Day card with two full-width row buttons, each at least 48px, separated by a
hairline, left-aligned, `--text-base` 600:

- **Discard changes:** `--color-text`. Today's `handleDiscard`.
- **Delete template:** `--color-danger-text`, with a trash icon so colour is
  not the only signal. Today's `handleDelete` with `deleteTemplateCopy`.
  Disabled while saving.

New templates don't show the card: Close discards.

## Saving

`handleSave` writes rows in card order, then row order. Each section's rows
are contiguous, and Order counts up from 1. `restToSave` is unchanged. A
template whose sections were interleaved when loaded is shown grouped (cards
by first appearance, rows in their saved order within each section) and is
saved grouped. The detail and the strength workout already group this way, so
nothing the owner sees changes order.

## States

- **Loading a template to edit:** today's population effect. Until it lands,
  the name is blank and the card area empty, as today.
- **Saving:** Save shows "Saving…", and every control except Close stays
  usable. A failed save shows today's error toast and keeps the edits.
- **Rest settings not loaded:** rest rows show the built-in defaults, as
  today.

## Contrast

Existing pairs only: `--color-text`, `--color-text-secondary` and
`--color-text-muted` on `--color-surface` and `--color-bg`;
`--color-primary-text` on `--color-surface`; `--color-danger-text` on
`--color-surface` and `--color-bg`; `--color-on-fill` on
`--color-primary-fill`. All are measured in `suite-language.md` and the
keel-wide registry.

## Removed

`ExerciseCompactCard` and its up/down/× controls in the editor, the
full-width "+ Add Exercise", ghost "Discard Changes" and red "Delete Template"
buttons, the "Template Name" form label, and `TemplateExerciseConfig`'s
layout (its fields move into the open row).
