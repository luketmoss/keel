# 577 — Lift Mode: set and rest stopwatches

Part of #575. Prototype: https://claude.ai/artifact/87xdgi7Pe4ce6BJ8GqYgWz
(the Prototype tab). Reads #576's `rest_target_s`, writes its `set_s` and
`rest_s`. #578 replaces the finish modal and makes All sets editable. #579 adds
switching. #580 adds the compact layout and hides the tab bar.

## Principles

- **The phone runs the session; the watch only records.** Nothing on screen
  asks for the watch except the start-screen tip.
- **Clocks count up and never stop themselves.** A target is a reminder.
  Nothing advances without a tap.
- **Logging never blocks.** Every logging control is optional at the moment
  it's offered, and #578 catches what was left.
- **One primary button per screen**, full width at the bottom.

## Screen frame

Lift Mode is a route of its own for the active workout, `#/workout/:id/lift`.

- **Header.** `--color-surface` with a `--color-border-light` bottom rule.
  - Row 1: the workout name at `--text-lg` 700, ellipsised; the session clock at
    `--text-sm` `--color-text-secondary` in tabular figures (absent on the
    start screen); and an "All sets" chip button in `--color-primary-text`.
  - Row 2: a 4px progress bar (`--range-track` track, `--color-primary` fill)
    showing working sets logged out of working sets, with
    `aria-label="12 of 22 sets done"`.
- **Content.** Scrolls, with padding `--space-md` and `--space-md` gaps between
  cards. Cards are `--color-surface` at `--radius-lg` with a
  `--color-border-light` border.
- **Action bar.** Fixed at the bottom on `--color-surface`, with a
  `--color-border-light` top rule, padding `--space-md`, and the safe-area
  inset added below. The primary button fills the width.
  - Primary button: `--color-primary-fill` with `--color-on-fill` text,
    `--text-lg` 700, `--radius-md`, at least 52px tall.
  - A secondary button (Skip set) sits to its left in `--color-surface` with a
    `--color-border` border and `--color-text-secondary` text.

## 1. The choice (entry)

Where a weight workout starts today, from a planned workout's Start or from a
template, a choice sheet appears before anything is written. #579 remembers the
last choice.

- Two option cards side by side. Each is a radio (`role="radio"`) with a 2px
  `--color-border-light` border; the selected one has a `--color-primary`
  border on `--color-primary-light`.
  - **Lift Mode**: "Guided set by set, with set and rest timers"
  - **Logbook**: "Log sets when convenient, as today"
- With no remembered choice, Lift Mode is selected.
- Continue goes to the start screen (Lift Mode) or to today's tracker
  (Logbook).

## 2. Start screen

- **Section cards**, in exercise order. Each has the section badge (existing
  `.section-badge` classes), its exercises (name on the left; "4 × 8 · 90 lb"
  on the right in `--color-text-secondary` tabular figures, "BW" for no
  weight), and for timed sections the rest rows: #576's duration stepper on a
  `--color-primary-light` band.
  - Primary: "Rest between sets".
  - Superset or burnout: "Rest after each round" and "Switch between
    exercises".
  - The warm-up card adds "Untimed" on the right of its badge.
- **A rest change** writes `rest_target_s` to this workout's sets in that
  section, recomputed by #576's rules, 800 ms after the last press. It touches
  nothing else.
- **Tip card**, with `--color-bg` as its fill, comes last: "**On the watch:** start a Strength activity, then leave it alone
  until the end."
- **Action:** Start workout. It does what starting does today (status
  `active`, date and time), then shows the warm-up or the first working set.

## 3. Warm-up

- The `warmup` section badge, then "Tap each one when it's done" in `--text-sm`
  `--color-text-secondary`.
- One full-width button per warm-up exercise: a 24px check circle, the name,
  and "8 reps" on the right.
  - Done: the circle fills `--color-success` with a ✓ in `--color-on-fill`, and
    the name turns `--color-text-muted` and is struck through.
  - `aria-pressed` reflects done.
  - Ticking writes the planned reps to the exercise's sets; unticking clears
    them.
- Tip: "No set or rest timer on warm-ups. The session clock is already
  running."
- **Action:** Start working sets. It goes to Ready (§6, without a rest clock).
  Unticked warm-ups stay unlogged.
- **Cooldown** uses this same screen after the last working set, with the
  `cooldown` badge and the action "Finish workout".

## 4. Run order

Working sections in exercise order. Within a section, rounds: set *r* of each
exercise that has a set *r*, in exercise order. `rest_target_s` already
encodes switch versus round rest, and Lift Mode trusts it. A set already
logged, by Logbook or before a reload, is passed over.

## 5. Set screen

Centred, top to bottom:

- **Section badge.** Within a superset or burnout round, the badge adds the
  exercise's letter: "Superset 1 · A".
- **Exercise name**, `--text-2xl` 700, balanced wrap.
- **Target line**, `--text-base` `--color-text-secondary`: "Set 2 of 4 · **8
  reps** · **90 lb**", with the figures in `--color-text`.
- **Set clock**, `--lift-clock-size` 700 in tabular figures and
  `--color-primary-text`, with the caption "SET TIME" under it in `--text-xs`
  uppercase letter-spaced `--color-text-muted`.
- **Last-time card:** "Last time: 90 × 8 · Medium" or "No set 2 last time"
  (`getLastTimeData`). With no history at all: "First time doing this
  exercise".
- **What-comes-next card**, `--text-sm`, one of:
  - "Then rest 1:30, next OH Press"
  - "Then switch to Lateral Raise FT (0:15)"
  - "That's the last set. Done opens the finish."
- **Action:**
  - "Done · rest 1:30" after the last exercise in a round;
  - "Done · switch" inside a round;
  - "Done · finish" on the last working set;
  - "Done" when `rest_target_s` is blank.

## 6. Rest screen (and Ready)

### Rest hero

A row with a 132px ring on the left and text on the right.

- **Ring.** A 10px-stroke circle: the track in `--range-track`, the arc in
  `--color-primary` from 12 o'clock with round caps, filling as the rest
  approaches its target.
- **Inside the ring:** the rest clock at `--figure-md` 700 in tabular figures,
  and under it the overtime line (`--text-sm` 700 `--color-warning`), empty
  until rest is up.
- **Beside the ring:**
  - the label at `--text-xl` 700: "Rest", or "Switch" inside a round;
  - "Target 1:30" in `--text-sm` `--color-text-secondary`;
  - the hint "Counting until you start the next set" in the same style.

### Log card

The heading is "Log the set you just did", or "Log this round" when the round
had more than one set. Under it, the round's done sets, newest first,
separated by `--color-border-light` rules. Each set shows:

- **Head:** the exercise at 700 on the left; "Set 2 · 0:41" (its `set_s`) on
  the right in `--text-sm` `--color-text-muted` tabular figures.
- **Steppers:**
  - "lb", with ±5 at 20 lb and above and ±1 below, never under 0. Hidden for
    a blank weight, which reads "Bodyweight".
  - "reps", ±1, never under 0.
  These are #576's stepper with whole-number values.
- **Effort:** three pill buttons, Easy, Medium and Hard, sharing the width
  equally. `aria-pressed` reflects the choice. Pressed, a pill fills with
  `--effort-easy`, `--effort-medium` or `--effort-hard` with `--color-on-fill`
  text. Tapping the pressed pill clears it.
- **Saving:**
  - A stepper change alone is held until an effort is tapped or the set
    leaves the card; then it writes.
  - An effort tap writes weight, reps and effort through `saveSet` at once.
  - While a write is in flight, nothing changes on screen.
  - A failed write shows `saveSet`'s existing toast, and the controls keep
    the person's values for a retry.

Below the card, when earlier sets still lack effort: "2 earlier sets without
effort. They're in All sets." in `--text-sm` `--color-text-muted`.

### Up next card

- The heading is "UP NEXT", or "SWITCH TO" inside a round.
- Then the badge, the exercise at `--text-xl` 700, the target line, and the
  last-time line.
- When the next set is not the last in its round: "Then Lateral Raise FT, 0:15
  switch".
- Inside a round the card's border is the section's colour (`--sec-*`, see New
  tokens).

### Actions

Skip set, then Start set.

### Ready

Ready is this screen with no hero and no log card. The tip reads "Working sets.
Tap Start set when you're under the bar. Done starts your rest." Ready appears
after the warm-up and on resume without stored state.

## 7. Rest's up

At `rest_target_s` (never when it's 0 or blank):

- `navigator.vibrate([200, 100, 200])` where it exists.
- The ring arc and the label turn `--color-warning`. The label reads "Rest's
  up" or "Switch time's up", and the hint reads "Still counting. Start when
  you're ready."
- The overtime line counts "+0:01", "+0:02" and so on.
- Start set turns `--color-warning` fill with `--color-on-fill` text and a soft
  2 s pulse (box-shadow), with no pulse under `prefers-reduced-motion`.
- A toast (`role="status"`) for 2.6 s on `--color-warning` fill: "Rest's up.
  Start when you're ready." or "Switch time's up. Next: Lateral Raise FT".
- Every further 30 s: `navigator.vibrate([120])`, and the toast "Still resting.
  Next up: OH Press". The visuals stay as they are.

## 8. Start set, Skip set

- **Start set** writes `rest_s` to the set that started the rest, then shows
  the set screen with its clock at 0:00.
- **Skip set** passes over Up next's set, leaving it unlogged. The rest clock
  keeps running, and Up next shows the following set. Skipping the last
  working set goes to cooldown or the finish.

## 9. All sets (read-only in #577)

A bottom sheet over `--color-overlay`, `--radius-lg` top corners, up to 86% of
the height, scrolling.

- **Head:** "All sets" and a Close chip.
- **Body:** one card per working section with a row per set: "Set 2", the
  exercise, and on the right one of:
  - "90 × 8 · Easy";
  - "no effort", in `--color-warning`;
  - "skipped", struck through in `--color-text-muted`;
  - "lifting now", 700 `--color-primary-text`;
  - the target in `--color-text-muted`.
- **Last:** a full-width secondary button, "Finish workout now", which opens
  the finish.

## 10. Finishing

The finish modal (`finish-modal.tsx`), unchanged, until #578. Saving clears
Lift Mode's stored run state for the workout.

## Stored run state

- **Where.** `localStorage`, under `thrive.lift.<workoutId>`:
  `{ phase, stepIndex, setStartedAt, restStartedAt, restTarget, alertedAt }`.
  Times are epoch ms. Every read and write is in try/catch.
- **When.** Written on every transition. Cleared on finish, on deleting the
  workout, and by #579's switch.
- **Load.** On load, the state is used only if the workout is still `active`
  and the step's set is not yet logged. Otherwise, Ready at the first unlogged
  working set.
- **Resuming past a rest's target** shows Rest's up at once, without the first
  vibration.

## Wake lock

- `navigator.wakeLock.request('screen')` on entering Lift Mode with an active
  workout.
- Re-requested on `visibilitychange` to visible.
- Released on leaving the route or finishing.
- A rejection is ignored and shows nothing.

## Edge cases

- **A template with only warm-ups:** after the warm-up, "Finish workout"
  directly.
- **A set with planned reps blank:** the target line drops the reps part.
- **Two tabs open on the same workout:** the stored state is shared, and the
  last write wins. Not guarded.
- **Offline:** clocks and navigation work. Set writes fail with the existing
  toast and can be redone from All sets (#578).
- **A very long rest** (over 10 minutes): the clock reads "12:34", and the
  overtime reads "+11:04".

## Copy

| Where | String |
|---|---|
| Choice cards | Lift Mode · Guided set by set, with set and rest timers / Logbook · Log sets when convenient, as today |
| Start tip | On the watch: start a Strength activity, then leave it alone until the end. |
| Start action | Start workout |
| Warm-up hint | Tap each one when it's done |
| Warm-up tip | No set or rest timer on warm-ups. The session clock is already running. |
| Warm-up action | Start working sets |
| Ready tip | Working sets. Tap Start set when you're under the bar. Done starts your rest. |
| Set caption | SET TIME |
| Last time | Last time: 90 × 8 · Medium / No set 2 last time / First time doing this exercise |
| Next lines | Then rest 1:30, next OH Press / Then switch to Lateral Raise FT (0:15) / That's the last set. Done opens the finish. |
| Done | Done · rest 1:30 / Done · switch / Done · finish / Done |
| Rest labels | Rest / Switch / Rest's up / Switch time's up |
| Rest hints | Counting until you start the next set / Still counting. Start when you're ready. |
| Log headings | Log the set you just did / Log this round |
| Missing effort | 2 earlier sets without effort. They're in All sets. |
| Up next headings | UP NEXT / SWITCH TO |
| Toasts | Rest's up. Start when you're ready. / Switch time's up. Next: Lateral Raise FT / Still resting. Next up: OH Press |
| All sets | All sets · Close · Finish workout now · lifting now · skipped · no effort |

## New tokens

In `global.css`, Thrive's own:

| Token | Value | For |
|---|---|---|
| `--lift-clock-size` | `4.5rem` | the set clock; no existing figure size is that large |
| `--lift-ring-size` | `132px` | the rest ring; #580 overrides it |
| `--sec-warmup`, `--sec-primary`, `--sec-ss`, `--sec-burnout` | the existing `.section-*` text colours, per theme | the Up next border inside a round; today those colours exist only inside the badge rules |

The start-screen tip uses `--color-bg` as an inset fill on the card, the way
existing Thrive tips sit; no new token for it.
