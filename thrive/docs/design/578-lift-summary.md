# 578 — Lift Mode summary: review and edit every set

Part of #575. It builds on #577's screen frame, log controls and All sets
sheet; read that note first. Prototype: the summary after the last set at
https://claude.ai/artifact/87xdgi7Pe4ce6BJ8GqYgWz.

## Where it appears

In Lift Mode, these open the summary in place of `finish-modal.tsx`:

- Done on the last working set (after any cooldown checklist);
- Finish workout now in All sets;
- #579 switching into Lift Mode with everything logged.

Logbook keeps the modal.

The summary is a Lift Mode screen. Its header shows the workout name with no
session clock, no All sets chip and no progress bar.

## Order

1. Totals
2. Sets heading line
3. One card per working section (the sets list)
4. Session card: effort and notes
5. Action bar: Back · Save workout

## 1. Totals

A 2 × 2 grid, `--space-sm` gaps, of stat tiles. Each tile is `--color-surface`
at `--radius-lg` with a `--color-border-light` border and padding `--space-sm`
`--space-md`. The value is `--text-2xl` 700 in tabular figures; the label is
`--text-xs` `--color-text-muted`.

| Value | Label |
|---|---|
| 47:12 | Session |
| 22/26 | Sets |
| 14:05 | Under the bar |
| 24:40 | Resting · avg +0:12 vs plan |

- **Session:** from Start workout to opening the summary, frozen at that
  moment.
- **Sets:**
  - working sets with reps logged, over working sets in the workout;
  - warm-ups don't count.
- **Under the bar:** the sum of `set_s`.
- **Resting:**
  - the sum of `rest_s`;
  - the average is the mean of `rest_s − rest_target_s` over sets with both,
    signed, as "avg +0:12 vs plan" or "avg −0:05 vs plan";
  - with no pair, the label is just "Resting".
- **No data:** a total with no data shows "—" and its label alone. A workout
  started in Logbook and switched over late can have this.

## 2. Sets heading

A row: "SETS · TAP ONE TO VIEW OR EDIT" in `--text-xs` uppercase letter-spaced
`--color-text-muted` on the left. On the right, when any are missing, "3 need
effort" in `--text-sm` 600 `--color-warning`.

## 3. Sets list

The list component replaces #577's All sets body. Here it gets an `editable`
rule: in the summary, every working set opens; in All sets during the workout,
only sets done or skipped open.

- One card per working section, in run order, headed by its badge.
- **Rows.** Each row is a full-width button (or a plain row when it can't
  open), on a `--color-border-light` top rule:
  - a 44px column with "Set 2" in tabular figures;
  - the exercise, ellipsised;
  - the state on the right.
  The row is at least 44px tall.
- **Row states** (right column):

  | State | Text |
  |---|---|
  | Logged with effort | 90 × 8 · Easy ("BW" for no weight) |
  | Logged, no effort | 90 × 8 · needs effort, the last part in `--color-warning` 600 |
  | Skipped / never done | skipped, in `--color-text-muted` |
  | Not reached (All sets only) | the target, in `--color-text-muted` |
  | Lifting now (All sets only) | lifting now, 700 `--color-primary-text` |

- **Open.** Tapping a row sets `aria-expanded="true"`, turns its text
  `--color-primary-text` 600, and opens an editor directly under it. The editor
  is a `--color-bg` block at `--radius-md` with padding `--space-sm`, holding
  #577's log controls for that set: the weight and reps steppers and the
  effort pills. Opening one row closes any other. Tapping the open row closes
  it.
- **Skipped set, open:** the controls are prefilled from the plan, and a line
  under them reads "Tap an effort to log this set." in `--text-sm`
  `--color-text-muted`.
- **Saving:** as in #577's log card. An effort tap writes weight, reps and
  effort, and a stepper change is held until an effort tap or the row closes.
  The row's text updates on success. On failure the controls go back to the
  values before the edit and `saveSet`'s toast shows.

## 4. Session card

- "SESSION EFFORT" heading, then the three effort pills (single choice, or
  none).
- "NOTES" heading, then a textarea at least 64px tall, placeholder "How did it
  go?".
- Both keep their values across row edits, Back and a reload: they are held in
  #577's stored run state under `notes` and `sessionEffort`.

## 5. Actions

- **Back** (secondary). It returns to the Lift Mode step the person came from,
  with any running rest still counting from its original Done.
  - From Done on the last set it returns to that set's rest, which has no Up
    next. The screen shows the hero and log card and the action "Finish
    workout".
- **Save workout** (primary). It runs `finishWorkout` with notes and session
  effort. While saving, it reads "Saving…" and both buttons are disabled.
  - **Success:** the same exit as today's finish (toast "Workout saved", back
    to where the tracker's finish lands). The stored run state is cleared.
  - **Failure:** `finishWorkout`'s existing toast shows. The summary stays,
    with everything typed kept.

## Copy

| Where | String |
|---|---|
| Totals labels | Session · Sets · Under the bar · Resting · avg +0:12 vs plan |
| Sets heading | SETS · TAP ONE TO VIEW OR EDIT |
| Missing | 3 need effort |
| Row states | needs effort · skipped · lifting now |
| Skipped hint | Tap an effort to log this set. |
| Session card | SESSION EFFORT · NOTES · How did it go? |
| Actions | Back · Save workout · Saving… · Finish workout |

## New tokens

None. It uses #577's tokens and the suite's.
