# 639 — Template detail

Part of #637. Prototype board "Template detail"
(https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note replaces the
screen at `#/templates/<id>`. It reuses #531's top bar and menu, #533's
section cards and #638's summary, so a template reads like the strength
workouts it produces.

Earlier notes kept: #403's in-app confirm and `deleteTemplateCopy` wording,
#404's interaction states, #576's rest line copy (`restLine`), and the Start
workout behaviour (active-workout toast, "Starting…").

## Order on screen

1. Top bar
2. Title block
3. Summary card
4. One section card per section
5. Start workout, pinned

Blocks are `--space-sm` + `--space-xs` (12) apart, with `--space-md` side
padding. The scrolling content ends with room for the pinned button, so the
last card's rest line can scroll clear of it.

## Top bar

#531's `detail-top-bar` exactly: 44px round `detail-icon-btn`s with 20px drawn
icons.

- **Back** (left): named "Back", opens `#/templates`. The text "← Back" goes.
- **Edit** (right): pencil icon, named "Edit template", opens
  `#/templates/<id>/edit`, `data-focus-key="template-edit"`.
- **More actions** (right, after Edit): #531's three-dot button and menu,
  with its keys (focus the first item on open, Escape returns focus to the
  button). One item: **Delete template**, with a trash icon and its word in
  `--color-danger-text`. It runs today's `handleDelete`: the #403 confirm with
  `deleteTemplateCopy(name, count)`, then `#/templates`. While deleting, the
  menu closes and Start workout is disabled.

The menu holds one item because Delete needs to be somewhere other than a big
red button. #531 already settled that place for workouts, and two places for
one kind of action is worse than a one-item menu.

## Title block

- **Meta line:** `--text-sm` `--color-text-secondary`: "Template · last done
  Thu, Oct 22", using #638's last-done words in lower case after the dot
  ("Template · last done today", "Template · not done yet").
- **Title:** the template name, `h1.detail-title` (#531).

## Summary card

#638's `TemplateSummary` in a Day card (`--color-surface`, `--radius-lg`, no
border, padding `--space-md`): the three figures, the section-mix bar and its
legend. It has no footer.

## Section cards

#533's section card: one per section in the order sections first appear,
`--color-surface`, `--radius-lg`, padding `--space-sm` + `--space-xs` (12)
`--space-md`. The heading is an `h2` with #533's words and styling
("WARM-UP" … "COOL-DOWN", `--text-xs` 700, upper case), with no section
colour. The words carry it, as on the workout detail.

- **Rows:** one per exercise, separated by hairlines
  (`--color-border-light`), at least 44px tall, `--space-sm` + `--space-xs`
  padding.
  - **Name:** on the left, `--text-base` 500, wrapping.
  - **Prescription:** on the right, `--text-base` 600, `tabular-nums`, no
    wrap: "5 × 4–6" (Sets × Reps, as stored, with an en dash in ranges as
    today), "3 sets" when Reps is blank, or "1 set".
- **Rest line:** the last thing in the card, for sections `restRowsFor` gives
  rows to. It is an inset row on `--color-bg`, `--radius-md`, padding
  `--space-sm` `--space-sm` + 2 (10): a 16px timer icon (#405 style,
  `aria-hidden`), then `restLine`'s text unchanged ("Rest 1:30 (default)",
  "Rest 0:45 · switch 0:15"), `--text-sm` `--color-text-secondary`.
  Warm-up and cool-down cards have none.

No text sits between cards. `.template-rest-line` is removed.

## Start workout

A full-width `btn btn-primary`, "Start workout" (sentence case, so "Start
Workout" changes), pinned above the tab bar: `position: sticky; bottom:
0`. It sits inside a bar with `--space-sm` + `--space-xs` padding and a
`--color-bg` background that fades from transparent over its top
`--space-md`, so cards scroll under it legibly. Behaviour unchanged, including
"Starting…" and the toast when a workout is already active.

## States

- **Not found:** "Template not found" (`--text-base` 600) and a secondary
  button "Back to Library" that opens `#/templates`, centred, `--space-xl`
  padding. No top bar.
- **Rest settings loading:** the rest line shows the built-in defaults, as
  `restLine` already does.
- **Workouts not loaded:** the summary shows "—" for last took and the meta
  line shows "Template · not done yet", updating when workouts load.

## Interaction states and contrast

Top bar and menu are #531's. Rows are not interactive. Every text pair is an
existing measured one: `--color-text`, `--color-text-secondary` on
`--color-surface` and on `--color-bg` (the inset rest line), and
`--color-danger-text` on `--color-surface-raised` (the menu, as #531).

## Removed

The `ExerciseCompactCard` list and the full-width Delete Template button on
this screen, and `.template-detail-footer`'s second button. `ExerciseCompactCard`
itself stays, because other screens use it.
