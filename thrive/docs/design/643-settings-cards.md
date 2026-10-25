# 643 — Settings in Day-style cards

Part of #637. Prototype board "Settings"
(https://claude.ai/artifact/2jw8SJaaHJ15fcXxL3Gc8B). This note relays out
`#/settings`. It adds no settings and changes no behaviour except the water
goal, which saves as you change it (decided by the owner, #637).

Earlier notes kept: #485's card and title row (icon + sentence-case title),
#576's rest times group (its save delay, notes and words), #520's water goal
range and messages, the Sync now control and status rows (luketmoss/thrive#409,
#210's labelled status regions), #404's interaction states, the focus key
`manage-labels`.

## Order on screen

1. Title: `h1.day-title` "Settings". No meta line: the account card under it
   says who you are.
2. Account
3. Appearance
4. Rest times
5. Hydration
6. Sync
7. Your data
8. Sign out

Cards are `--space-sm` + `--space-xs` (12) apart, `--space-md` sides.

## The card and the row

- **Card:** `--color-surface`, `--radius-lg`, no border, padding
  `--space-md`. A titled card opens with an `h2` row in #485's
  `.day-panel-title` style: an 18px #405 icon, `aria-hidden`, then the
  sentence-case title, `--text-base` 600, `--space-xs` below.
- **Row:** a flex row, at least 52px, label on the left, value or control on
  the right, `--space-sm` + `--space-xs` gap. Rows are separated by hairlines
  (`--color-border-light`). The label is `--text-base` `--color-text`. An
  optional secondary line under it is `--text-xs` `--color-text-secondary`.
  The value is `--text-base` `--color-text-secondary`, `tabular-nums`.
  Nothing is centred.

`.settings-section`, the centred `.settings-row` and `.settings-btn` styles go.

## Account

No title. A row: a 48px round badge (`--color-primary-light`, the initial of
the name, or of the email when there is no name, `--text-lg` 700,
`--color-primary-text`, `aria-hidden`), then the name (`--text-base` 600) over
the email (`--text-sm` `--color-text-secondary`). Demo mode shows Demo User.

## Appearance

Icon: half-filled circle. Title "Appearance". It holds `ThemeToggle`, laid out
as a full-width three-part segmented control: track `--color-bg`,
`--radius-md` + `--space-xs` (12), padding `--space-xs`. The three equal
buttons are 40px tall, `--radius-md` + 1 (9), `--text-sm` 600. The current
one has a `--color-surface` fill, `--color-text` and `aria-pressed="true"`;
the others are `--color-text-secondary`. The words (Light, Dark, System) and
behaviour are today's.

## Rest times

Icon: timer, in `--sec-primary`. Title "Rest times". Today's five rows, each
with today's `DurationStepper` on the right. Labels are split into a word and
a secondary line:

| Key | Label | Secondary |
|---|---|---|
| `rest_primary_s` | Primary | between sets |
| `rest_superset_s` | Supersets | between rounds |
| `switch_superset_s` | Supersets | switching exercises |
| `rest_burnout_s` | Burnout | between rounds |
| `switch_burnout_s` | Burnout | switching exercises |

Each stepper's accessible name stays the full phrase ("Primary, between sets").
The helper ("Templates use these unless a section sets its own. Lift Mode lets
you change them for the day.") sits under the rows after a hairline, in
`--text-xs` `--color-text-secondary`. The Saved and error notes appear there
too, and are unchanged.

## Hydration

Icon: droplet, in `--metric-water`. Title "Hydration". One row:

- **Label:** "Daily water goal", with the secondary line "Shown on Day's water
  card". The label is the input's `label`.
- **Control:** − [field] oz +. The buttons are 40px round, outlined
  `--color-border-strong`, with 16px icons, named "Lower goal" and "Raise
  goal". The field is 64px wide, 40px tall, centred, `--text-base` 600,
  `inputMode="numeric"`, no box until hover or focus (then 1px
  `--color-border-strong`, `--radius-md`). "oz" follows in `--text-sm`
  `--color-text-secondary`.
- **Steps:** each press moves the value 4 oz, clamped to `GOAL_OZ_MIN` –
  `GOAL_OZ_MAX`. A press on a non-multiple goes to the next multiple of 4 in
  that direction. A button at its limit is `aria-disabled`, keeps focus, and
  does nothing.
- **Saving:** a valid value (`ozToGoalMl` not null) saves 800 ms after the last
  press or keystroke, the same delay as rest times (`REST_SAVE_DELAY_MS`),
  through `saveWaterGoal`. On success the note under the row reads "Saved"
  for `REST_SAVED_MS`, then clears.
- **Invalid text:** a blank, non-numeric or out-of-range value shows "Enter a
  whole number from 9 to 338." (today's message, with the computed bounds),
  saves nothing, and keeps the text so it can be fixed.
- **Failed save:** "Couldn't save the goal. Try again." The value goes back to
  the stored goal.
- **Leaving:** leaving the screen with a valid change still waiting saves it,
  as rest times do. An invalid one is dropped.
- **Notes:** in `--text-xs` and `role="status"` (error in today's
  `.drink-error` colour), at the row's right edge under the control.

The Save button is removed.

## Sync

Icon: sync arrows. Title "Sync", and on the right of the title row today's
`SyncNowButton`, restyled as an outlined compact button: 36px tall in a 44px
hit area, `--radius-full`, `--text-sm` 600. Its words and states ("Sync now",
asking, disabled while both are open) are unchanged. Its spinner stops
rotating under reduced motion, which closes the keel-wide gap for this
screen.

Two rows, today's `CorosSyncStatusRow` and `WithingsSyncStatusRow`, relaid out:

- **Labels:** "COROS" with the secondary line "Activities, sleep, HRV", and
  "Withings" with "Weight, blood pressure". The status region's
  `aria-labelledby` points at the label word, so it reads "COROS". "last
  synced" goes from the label, because the status line already says when.
- **Status:** today's lines and tones, unchanged in wording, right-aligned,
  `--text-sm`, wrapping.

## Your data

Icon: database. Title "Your data". Four rows. Each row is a `button`: the label
on the left, the count on the right in `--color-text-secondary`, then a 16px
chevron:

| Row | Count | Opens |
|---|---|---|
| Workouts | 37 | `#/activities` |
| Exercises | 19 | `#/exercises` |
| Templates | 3 | `#/templates` |
| Labels | 14 | `#/settings/labels` (`data-focus-key="manage-labels"` kept) |

The counts are bare numbers ("37"); "logged", "in library", "saved" and
"defined" go. Before the stores load, a count is "—", never "0". Each row's
name is "Workouts, 37, open".

## Sign out

Not a card with a title: a full-width `button`, 48px, `--color-surface`,
`--radius-lg`, centred, a 18px sign-out icon then "Sign out", 600, in
`--color-danger-text`. It calls today's `logout`, with no confirm (nothing is
destroyed). The solid red `.settings-btn.danger` goes.

## Interaction states

Row buttons and Sign out are #404's surface buttons (hover and pressed
overlays, focus ring). Steppers keep `DurationStepper`'s states, and the water
buttons copy them. The segmented control's buttons have rest, hover, pressed,
focus and selected (the fill).

## Contrast

Existing pairs: `--color-text`, `--color-text-secondary` on `--color-surface`
and `--color-bg` (the segmented track); `--color-primary-text` on
`--color-primary-light` (the badge, as #533's pressed chip);
`--color-danger-text` on `--color-surface`. Icon tints (`--sec-primary`,
`--metric-water`) are beside their titles.
