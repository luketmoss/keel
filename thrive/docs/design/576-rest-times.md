# 576 — Rest times: Settings defaults, template sections

Part of #575 (Lift Mode). Prototype: https://claude.ai/artifact/87xdgi7Pe4ce6BJ8GqYgWz
(the Plan screen's rest rows). This note covers the two places a person sets
rest: Settings and the template editor. The per-day change is #577's start
screen, and the resolution rules for `rest_target_s` are in the issue.

## Shared control: the duration stepper

One control everywhere a rest or switch time is set (#577's start screen
reuses it).

- A row: label on the left, stepper on the right. The stepper has a − button,
  the value in `m:ss`, and a + button.
- The buttons are 44 × 44 (the touch minimum #580 holds Lift Mode to) at `--radius-md`, with a `--color-border` 1px border
  and `--color-surface` fill, holding "−" and "+" at `--text-lg` 700. The value
  is `--text-base` 700, `font-variant-numeric: tabular-nums`, with a minimum
  width that holds "10:00" so the buttons don't move.
- **Steps.** Rest moves by 15 s, from 0:15 to 10:00. Switch moves by 5 s, from
  0:00 to 2:00. At a limit the button is disabled at `--opacity-disabled` with
  `aria-disabled="true"`.
- **Names.** The buttons are labelled "Less rest" / "More rest" or "Less switch
  time" / "More switch time". The value is `aria-live="polite"`.
- Holding a button repeats every 150 ms after 400 ms.

## Settings: Rest times group

A new `h2` "Rest times" section on the Settings screen, after Hydration, styled
as the existing sections.

| Row label | Key | Default |
|---|---|---|
| Primary, between sets | `rest_primary_s` | 1:30 |
| Supersets, between rounds | `rest_superset_s` | 0:45 |
| Supersets, switch | `switch_superset_s` | 0:15 |
| Burnout, between rounds | `rest_burnout_s` | 0:45 |
| Burnout, switch | `switch_burnout_s` | 0:10 |

Under the rows, in `--text-sm` `--color-text-secondary`: "Templates use these
unless a section sets its own. Lift Mode lets you change them for the day."

- **Saving.** A value saves 800 ms after the last press, one call per key.
  While it saves, the row shows nothing new. On success, "Saved" appears under
  the group in `--text-sm` `--color-text-secondary` for 2 s. On failure the row
  goes back to the stored value and shows "Couldn't save rest times. Try
  again." in the class the water-goal error uses (`drink-error`).
- **Loading.** Until the settings arrive, the rows show the defaults with their
  steppers disabled. If loading fails, the defaults stay, the steppers stay
  disabled, and "Couldn't load rest times." shows under the group.
- **Offline.** As for loading failure. Nothing is queued.

## Template editor: per-section rest

Each section group in the template editor that is `primary`, `SS1`–`SS3` or
`burnout` gets rest rows under its exercises, inside the section's card, on a
`--color-primary-light` band (`--radius-md`, padding `--space-sm`
`--space-md`). `warmup` and `cooldown` get none.

- **Primary:** one row, "Rest between sets".
- **Superset or burnout:** two rows, "Rest after each round" and "Switch
  between exercises".

Each row has two states:

1. **Default** (the cell is blank). The label is followed by "Default (1:30)",
   showing the Settings value now, in `--color-text-secondary`, and a text
   button "Change" in `--color-primary-text`. Tapping Change turns the row into
   state 2, starting at the default value.
2. **Set.** The duration stepper, with a text button "Use default" under it in
   `--text-sm` `--color-primary-text`. Tapping Use default returns to state 1
   and blanks the cell on save.

Values save with the template, through the editor's existing Save. Every row of
the section gets the same `rest_s` and `switch_s`.

- **A section that loses its last exercise** loses its rest rows with it.
- **Changing an exercise's section** moves it under the new section's values on
  save.
- **Read-only template detail** (`template-detail.tsx`). After each section's
  exercises, one `--text-sm` `--color-text-secondary` line: "Rest 1:30" or
  "Rest 0:45 · switch 0:15". The line uses the template's own value, or the
  default followed by "(default)".

## Copy

| Where | String |
|---|---|
| Settings heading | Rest times |
| Settings helper | Templates use these unless a section sets its own. Lift Mode lets you change them for the day. |
| Settings saved | Saved |
| Settings save failure | Couldn't save rest times. Try again. |
| Settings load failure | Couldn't load rest times. |
| Editor row (primary) | Rest between sets |
| Editor rows (superset, burnout) | Rest after each round · Switch between exercises |
| Editor default state | Default (m:ss) · Change |
| Editor set state link | Use default |
| API refusal | rest_primary_s must be whole seconds, 15 to 600 (and the same for each key with its own range) |

## New tokens

None. Everything above uses existing suite and Thrive tokens.
