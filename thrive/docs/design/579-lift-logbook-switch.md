# 579 — Switch between Lift Mode and Logbook mid-workout

Part of #575. It builds on #577's choice sheet, stored run state and All
sets, and on #578's summary.

## Logbook → Lift Mode

- **The button.** In the tracker (`workout-tracker.tsx`) header, on an active
  `weight` workout only, a chip button "Lift Mode" sits before the existing
  header actions. It is styled like #577's All sets chip: a `--color-border`
  border, `--color-surface` fill, `--text-sm` 600 in `--color-primary-text`,
  and `--radius-full`.
- **On tap,** with no confirmation:
  1. Unsaved set edits in the tracker save first, exactly as navigating away
     does today. If that fails, the existing toast shows and nothing switches.
  2. Lift Mode opens on the same workout:
     - at **Ready**, on the first working set, in #577's run order, with no
       reps logged;
     - with no clock running, and no rest recorded for the gap.
  3. With every working set logged, it opens #578's summary instead.
- **Warm-ups** are not revisited. Unlogged warm-ups stay as they are.

## Lift Mode → Logbook

- **The action.** In All sets, above Finish workout now, a full-width secondary
  button "Switch to logbook".
- **On tap,** with no confirmation:
  1. Any running set or rest clock is dropped. Nothing is written for the
     interrupted step: no `set_s` for a set in progress, and no `rest_s` for a
     rest in progress. Values already logged stay.
  2. The stored run state `thrive.lift.<workoutId>` is removed.
  3. The tracker opens on the same workout. Every logged set shows with its
     values.
- **The toast** `Switched to logbook` (info, 2 s).

## Remembered choice

- **Saved:** `localStorage` key `thrive.weightMode`, `lift` or `logbook`,
  written when Continue is pressed on #577's choice sheet. Every read and
  write is in try/catch.
- **Next time:** the choice sheet preselects the stored mode.
  - With nothing stored, or storage unavailable, Lift Mode is preselected, as
    #577 specifies.
  - The sheet is always shown; remembering only preselects.
- **Not saved:** switching mid-workout does not change the remembered choice.
  Only the start choice is remembered.

## Edge cases

- **Switching back and forth repeatedly** always lands Lift Mode on the
  current first unlogged set. Nothing accumulates.
- **A set logged in Logbook out of order** (set 3 before set 2): Lift Mode
  resumes at set 2, then passes over set 3 because it's logged.
- **A workout with only warm-ups left unlogged:** the summary opens.
- **Offline:** switching works. Only the tracker's own save-before-switch can
  fail, and it shows its existing toast.

## Copy

| Where | String |
|---|---|
| Tracker chip | Lift Mode |
| All sets action | Switch to logbook |
| Toast | Switched to logbook |

## New tokens

None.
