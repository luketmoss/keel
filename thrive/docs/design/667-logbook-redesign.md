# 667 — Logbook in the new look

Prototype: https://claude.ai/artifact/VcetV6BYsfKZBNpQRZmnDz. Board 1 is
interactive. Boards 2–5 show a set open with Last time on, the finish sheet,
edit mode, and the empty and offline states. This note replaces the look of
the tracker at `#/workout/<id>` and `#/history/<id>/edit`
(`workout-tracker.tsx`, `exercise-row.tsx`, `set-row.tsx`,
`last-time-panel.tsx`, `finish-modal.tsx`). It draws a workout in progress
the way #533 draws a finished one, made editable, and borrows its controls
from #640 (builder), #578 (sets list and editor) and #531 (top bar and menu).

**Nothing about what is written changes.** The debounced save (1 s,
`saveOwnRow`), `runRemoval`'s delete-and-shift, `writeOrders`, the offline
queue, `switchToLift`, `handleFinish` and `handleSaveEdits` are called as
they are today. Every control below names the handler it calls.

Earlier notes kept: #531's top bar and menu keys, #533's section words, set
tiles and Last time chip, #577's steppers and `stepWeight`, #579's Lift Mode
chip, #640's Add exercise, Add a section and move behaviour, #641's picker,
#403's confirms and their words, #404's interaction states, and #328/#371's
reorder focus and announcements (`useReorderFocus`).

## Order on screen (log mode)

1. Top bar
2. Title block
3. Offline banner, only when sets are queued
4. Progress card
5. Exercises heading and Last time chip
6. One section card per section, in order of first appearance
7. "Add a section" and its pills
8. Finish workout bar, pinned

Blocks are `--space-sm` + `--space-xs` (12) apart, with `--space-md` sides.
The tab bar stays.

## Top bar

#531's `detail-top-bar`, right-aligned:

- **Lift Mode:** #579's chip, unchanged in rules and behaviour
  (`switchToLift`, active `weight` workouts only, disabled while finishing or
  switching), with a 16px dumbbell icon before the word.
- **More actions:** #531's three-dot button and menu. One item: **Discard
  workout**, with a trash icon, its word in `--color-danger-text`. It runs
  `handleDiscard` (the #403 confirm with `discardWorkoutCopy`). While
  finishing, More actions is `aria-disabled`.

## Title block

- **Meta line:** "Logbook · in progress", `--text-sm` 500
  `--color-text-secondary`.
- **Title:** the workout name, `h1.detail-title` (#531).

## Offline banner

Replaces `.sync-status-bar`. Only when `pendingSyncCount > 0`. An inset row
on `--color-warning-light`, `--radius-md`, padding `--space-xs`
`--space-xs` `--space-xs` `--space-sm` + `--space-xs`. It holds an 18px
no-signal icon in `--color-warning` (`aria-hidden`), the text
`--text-sm` `--color-text`, and on the right a 44px text button, "Sync now",
in `--color-primary-text` 600.

| State | Text | Button |
|---|---|---|
| Queued | "2 sets not synced" ("1 set not synced") | Sync now: today's `flushQueue` and toasts |
| Syncing | "Syncing…" | `aria-disabled` |

The row is `aria-live="polite"`, as today.

## Progress card

A Day card (`--color-surface`, `--radius-lg`, no border, padding
`--space-md`), with a row of `--space-md` + `--space-xs` (20) gap.
`aria-live="polite"`. Not shown in edit mode or when there are no exercises.

- **Ring:** #533's 108px ring, arc in `--type-weight`. Its share is logged
  over total working sets. Warm-up exercises have no sets and count for
  nothing. Logged means `isSetLogged` (weight or reps entered). Inside,
  the logged count at `--figure-lg` 700 over "of 17 sets" in `--text-xs`
  `--color-text-secondary`. `role="img"`, named "8 of 17 sets logged".
- **Cells,** stacked, styled as #531's grid cells:
  - "2 of 5" (`--text-sm` `--color-text-secondary` on "of 5") over
    "Exercises done": working exercises with at least one set, every one of
    them logged.
  - "3" in `--color-warning` over "Need effort": logged working sets with no
    effort. Left out at zero. The word carries the meaning, so the colour is
    not the only signal.

## Exercises heading

#533's row: `h2` "Exercises" (`--text-lg` 700) and the **Last time** chip on
the right, `aria-pressed`. The chip is shown whenever there are exercises.
Each exercise decides on its own whether it has a last time (below). The chip
replaces every exercise's clock button and `LastTimePanel`.

## Section cards

#533's card: `--color-surface`, `--radius-lg`, padding `--space-sm` +
`--space-xs` (12) `--space-md` `--space-xs`. The heading is an `h2` with
#533's words ("WARM-UP" … "COOL-DOWN", `--text-xs` 700 upper case,
`--color-text-secondary`), and on the right #640's count ("2 exercises",
`--text-xs` `--color-text-secondary`). There are no section colours, no
coloured borders and no badges.

Exercises within a card are separated by a `--color-border-light` hairline.

### A working exercise

1. **Name row,** at least 44px: the name (`--text-base` 600, wrapping), then a
   44px round options button (three dots, 20px), named "Barbell Row options",
   `aria-haspopup="menu"`.
2. **Last time line,** only while the chip is pressed and `getLastTimeData`
   finds a previous performance: "Last time (Oct 21): 135 lb × 8 · Medium",
   using #533's best-set rule, in `--text-xs` `--color-text-secondary`. On its
   right is a 44px text button "Copy" in `--color-primary-text` 600, named
   "Copy last time into Barbell Row". It runs `handleCopyDown` with that
   workout's sets, so the confirm (`replaceSetsCopy`) and the flash are as
   today. With no previous performance there is no line, where today there is
   a "No previous data" panel.
3. **Tiles,** a wrapping row, `--space-xs` + 2 (6) gap. Each is a `button`,
   58 × 44, `--radius-md` + 2 (10):

| Set | Fill | Top line (`--text-sm` 600 `tabular-nums`) | Bottom line (`--text-2xs` 700 upper case) |
|---|---|---|---|
| Logged | `--color-surface-raised` (light: `--color-bg`) | "135×8", "BW×7" (reps only), "135 lb" (weight only) | EASY / MED / HARD in its `--effort-*` colour, or nothing |
| Not logged | none, 1px dashed `--color-border-strong` | "×8" (planned reps; "—" with none), `--color-text-muted` 500 | "SET 3", `--color-text-muted` |
| Open | as above, plus a 2px `--color-primary` border | | |

   A tile is named for a screen reader: "Set 2: 135 pounds by 8, hard",
   "Set 3: not logged, target 8", "Set 1: bodyweight by 7, no effort". It
   carries `aria-expanded`.
   The row ends with an **Add set** tile: the same box, dashed, with an 18px
   plus in `--color-primary-text`, named "Add a set to Barbell Row". It runs
   `handleAddSet` and opens the new set.
4. **Set editor,** under the tiles, when one of this exercise's sets is open.

On the light theme a logged tile uses `--color-bg` rather than
`--color-surface-raised`, because the raised surface is white on a white
card there. Dark uses `--color-surface-raised` as #533 does.

### The set editor

**One set is open at a time across the whole screen.** Tapping a tile opens
it and closes any other, tapping the open tile closes it, and opening a menu
or a sheet leaves it open. The editor is an inset block on `--color-bg`,
`--radius-md`, padding `--space-sm` + `--space-xs` (12), `--space-sm` +
`--space-xs` gap, `role="group"` named "Barbell Row, set 3".

1. **Head:** "Set 3" (600), then "target 8" (`--text-sm`
   `--color-text-secondary`; left out when there is no planned reps), then
   on the right the save status, `--text-xs` `--color-text-secondary`,
   `role="status"`: "Saving…" from the first change until `saveOwnRow`
   resolves, then "Saved". Nothing shows before a change. Log mode only.
2. **Steppers,** two equal columns, `--space-sm` + `--space-xs` gap, each a
   label ("Weight (lb)", "Reps", `--text-xs` 500 `--color-text-secondary`)
   over a pill (`--color-surface`, 1px `--color-border`, `--radius-full`):
   a 44px − button, a text field, and a 44px + button.
   - The field is an `input` (`inputmode="decimal"` for weight, `numeric` for
     reps), centred, `--text-base` 600 `tabular-nums`, with no border of its
     own. Placeholders are "BW" for weight and the planned reps (or "reps")
     for reps. Typing changes it directly, as today's inputs do.
   - Weight steps by `stepWeight` (5 at 20 lb and up, else 1). Reps step by 1.
     Neither goes below 0, and stepping down to 0 leaves the field blank.
   - The buttons are named "Less weight", "More weight", "Fewer reps" and
     "More reps".
   - Every change goes through `handleUpdateSet`, so it is saved by the
     debounce as today.
3. **Same for all sets:** a 44px text button on the right, `--color-primary-text`
   600. It sets every set of the exercise to this set's weight, reps and
   effort, through the existing `handleQuickFillWeight`, `…Reps` and
   `…Effort`. That is today's quick-fill, which also overwrote every set.
   The toast is "Copied to all 3 sets of Barbell Row".
4. **Effort:** three equal pills, "Easy", "Medium", "Hard", at least 44px,
   `--radius-full`. Unselected: 1px `--color-border-strong` on
   `--color-surface`. Selected: filled with its `--effort-*` colour, text
   `--color-on-fill`, `aria-pressed="true"`. Tapping the selected one clears
   it. This is today's `EffortToggle` behaviour.
5. **Actions:** "Remove set" (44px text button, `--color-danger-text`) on the
   left. It runs `handleRemoveSet`, so a repeat tap is ignored as today, and
   the editor closes. On the right is a 44px pill,
   `--color-primary-fill`: "Next set" opens the exercise's next set, and on
   the last set it reads "Done" and closes the editor.

In a 375px viewport the card's content is 311px wide (375 − 2 × `--space-md`
screen sides − 2 × `--space-md` card padding). That fits four tiles a row
(4 × 58 + 3 × 6 = 250, and a fifth would need 314), so a three-set exercise and
its Add set tile share one row. The editor's content is 287px. Each stepper is
137px, which leaves its field 49px between the buttons: room for "137.5" at
`--text-base` 600, and the reason the field isn't `--text-lg`. The actions
row fits "Remove set" and "Next set" with room to spare, which is why "Same
for all sets" has its own line.

### Warm-up rows

List only, as today. One row per exercise, at least 48px: the name in
`--text-sm`, then the options button. There are no tiles, no editor and no
Last time line.

### Exercise options menu

#531's menu (`--color-surface-raised`, `--radius-md`, its shadow,
`role="menu"`, its keys), anchored under the options button, aligned right:

| Item | Does |
|---|---|
| Move up | `handleMove(…, 'up')` |
| Move down | `handleMove(…, 'down')` |
| Change section… | opens the section sheet |
| — hairline — | |
| Remove exercise | `handleRemoveExercise` (#403 confirm with `removeExerciseCopy`), in `--color-danger-text` |

**Moves stay within the section,** as #640's do. Move up is `aria-disabled`
on the section's first exercise, and Move down on its last. The move swaps
the exercise with its neighbour in that section, and the order written is the
on-screen order, as today. Focus follows the row through `useReorderFocus`.
The announcement counts within the section: "Barbell Row moved down, 2 of 2".
This changes `handleMove`'s neighbour from the next exercise in the whole
list to the next one in the same section. `writeOrders` is untouched.

### Change section sheet

A bottom sheet in #641's frame (scrim, `--color-surface-raised` panel, top
corners `--radius-lg`, its dialog semantics and `useModalFocus`):

- **Title:** "Move Barbell Row to", `--text-lg` 700.
- **Rows:** a `radiogroup`, one 48px `radio` row per section ("Warm-up",
  "Primary", "Superset 1", "Superset 2", "Superset 3", "Burnout",
  "Cool-down"), hairlines between, with the current one checked.
- **Choosing the current section** closes the sheet.
- **Choosing another** runs `handleChangeSection` and closes the sheet. The
  exercise moves to the **end** of that section's card, which is created at
  the end of the list when the section is new (#640). The card it left goes
  away if it is now empty. The toast is "Moved to Superset 2".
- **Choosing Warm-up for an exercise with logged sets** first swaps the rows
  for a warning, on `--color-warning-light`, `--radius-md`: "Warm-ups are list
  only, so its 2 logged sets are deleted." Under it are a danger-filled
  "Move to warm-up" and a secondary "Cancel". This replaces today's inline
  warning ("Warmup exercises are list-only — set data will be removed." /
  "Switch to Warmup") in the new words.

### Add exercise

The card's last control is #640's text button, separated by a hairline:
plus icon, "Add exercise", named "Add exercise to Superset 1". It opens
#641's sheet with `sectionLabel`. `handleAddExercises` takes the section:
the exercises are inserted after the section's last exercise (today they
always go to `primary` at the end), each with one empty set, and the first
one's set opens. Their `exercise_order`s are renumbered from the on-screen
order and written with `writeOrders` once rows exist, as a move does.

## Add a section

#640's block exactly: `h2` "Add a section" and dashed pills for each section
kind not present, with "Superset" standing for the lowest free of SS1–SS3.
A pill opens #641's sheet for that section. Hidden when every kind is
present.

## Finish workout

- **The bar:** #639's pinned bar (`position: sticky; bottom: 0`, a
  `--color-bg` fade over its top `--space-md`), holding a full-width
  `btn btn-primary`, 48px, "Finish workout". It keeps today's guard: with sets
  queued it asks `finishUnsyncedCopy` first. Disabled while finishing.
- **The sheet,** in #641's frame, replacing `FinishWorkoutModal`'s centred
  dialog. The semantics are kept: `role="dialog"`, `useModalFocus` with focus
  in the notes, and Escape or the scrim does nothing while saving.
  1. "Finish workout", `--text-lg` 700.
  2. A summary line, `--text-sm` `--color-text-secondary`: "14 of 17 sets
     logged · 3 need effort" (the second part left out at zero).
  3. "Session effort" label and the three effort pills, as in the editor.
  4. "Notes" label and a textarea, at least 72px, placeholder "How did it
     go?".
  5. "Save workout" (full-width primary, 48px; "Saving…" while saving), which
     is `handleFinish`, and "Keep logging" (full-width secondary, 44px), which
     closes the sheet.

## Edit mode (`#/history/<id>/edit`)

- **Top bar:** #640's. On the left, **Close** (a round × button): its
  `handleDiscard`, with `discardChangesCopy('workout')`. On the right a
  **Save** pill: `handleSaveEdits`, reading "Saving…" while saving.
- **Title block:** "Editing · Wed, Oct 21" over the name.
- **Details card:** a Day card with `h2` "Details" (`--text-base` 600) and
  the fields from today's form, with labels in the meta style: Name; Date and
  Duration (min) side by side; Session effort (the pills); Notes. The fields
  are 44px, 1px `--color-border-strong`, `--radius-md`, on `--color-surface`.
- **Then** the section cards and Add a section, working as in log mode. Every
  change is held until Save, as today. There is no progress card, offline
  banner, Lift Mode chip, Finish bar or save status line.

## Empty

With no exercises: the title block, then "Add a section to start." in
`--text-sm` `--color-text-secondary`, then the Add a section block with every
pill. No progress card and no Exercises heading. Today's "No exercises yet"
empty state goes.

## States

- **Saving a set:** the editor's status line. A failed save shows
  `saveSet`'s toast as today, and the status line clears, so neither
  "Saving…" nor "Saved" is shown for a set that did not save.
- **Removing:** while `runRemoval` is in flight for a set, its tile and the
  editor's Remove set are `aria-disabled`.
- **Finishing:** Finish workout, More actions and the Lift Mode chip are
  disabled. The finish sheet's buttons are disabled while saving.
- **Interaction states:** #404's for every button, tile and pill. Focus is
  the global ring. Under `forced-colors: active`, cards and tiles take
  `1px solid CanvasText`, the open tile `2px solid Highlight`, and selected
  effort pills `Highlight` with `HighlightText`, as #485 does for cards.

## Copy

| Where | String |
|---|---|
| Meta line | Logbook · in progress · Editing · Wed, Oct 21 |
| Banner | 2 sets not synced · 1 set not synced · Syncing… · Sync now |
| Progress | of 17 sets · Exercises done · Need effort · 8 of 17 sets logged (ring name) |
| Last time | Last time (Oct 21): 135 lb × 8 · Medium · Copy |
| Tiles | SET 3 · EASY · MED · HARD · Add a set to Barbell Row |
| Editor | Set 3 · target 8 · Saving… · Saved · Weight (lb) · Reps · BW · Same for all sets · Remove set · Next set · Done |
| Options menu | Barbell Row options · Move up · Move down · Change section… · Remove exercise |
| Section sheet | Move Barbell Row to · Warm-ups are list only, so its 2 logged sets are deleted. · Move to warm-up · Cancel |
| Toasts | Copied to all 3 sets of Barbell Row · Moved to Superset 2 |
| Cards | Add exercise · Add a section · Superset · Add a section to start. |
| Finish | Finish workout · 14 of 17 sets logged · 3 need effort · Session effort · Notes · How did it go? · Save workout · Saving… · Keep logging |
| Edit | Close · Save · Saving… · Details · Name · Date · Duration (min) · Session effort · Notes |
| Menu | More actions · Discard workout |

Confirm dialogs keep their existing `confirm-copy.ts` wording.

## New tokens

None. `--text-2xs` (#533) is reused for the tile's bottom line.

## Contrast

Existing measured pairs only: text, secondary and muted on `--color-surface`,
`--color-bg` and `--color-surface-raised`; `--color-primary-text` and
`--color-danger-text` on those; `--color-on-fill` on the primary and danger
fills; `--color-text` and `--color-warning` on `--color-warning-light`
(#183's banner pairs). Effort colours on a tile are #533's pairs. A selected
effort pill puts `--color-on-fill` on an `--effort-*` fill. That pair is
new, so `/develop` measures it in both themes, and in light it uses
`--color-text` on the fill wherever `--color-on-fill` falls under 4.5:1.

## CLAUDE.md

`thrive/CLAUDE.md`, UX Design Decisions:

- "**Supersets**: Flat list with section labels/colors (not grouped flow)"
  becomes "**Supersets**: grouped in section cards, in Logbook as in templates
  and the activity detail; moves stay within a section (#667)".
- "**Set entry**: Quick-fill weight for all sets, override individual sets if
  different" becomes "**Set entry**: tap a set to open its editor; Same for
  all sets copies its weight, reps and effort to the exercise's other sets
  (#667)".

## Removed

`.workout-tracker-header`'s Finish button, `.tracker-exercise`'s section
badge, section picker pills, colour classes and ▲ ▼ ✕ toolbar, the
quick-fill row, `SetRow`'s `S1` rows with E/M/H buttons, ✓ and ×,
"+ Add Set", "+ Add Exercise", the red Discard Workout button,
`LastTimePanel`'s table and its "No previous data", `FinishWorkoutModal`'s
centred dialog, and `.sync-status-bar`'s look.
