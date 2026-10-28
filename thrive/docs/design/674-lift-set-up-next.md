# 674 — Lift Mode: Set up next between groups

Changes #577's run between working sections. It uses #577's screen frame,
cards, `LogCard`, `StepBadge` and stepper, and #580's compact rules, and adds
one screen. Everything not named here behaves as #577, #578, #579 and #580 say.

## Principles

- **Between groups is setup, not rest.** Nothing counts toward a target, and
  nothing vibrates or toasts. The clock is a record, not a prompt.
- **Show the whole group at once.** A superset is two or more exercises, so
  the screen shows all of them before the first set starts.
- **Logging still never blocks.** The previous group's last round stays
  loggable here.
- **One primary button.** Start <group>. No Skip on this screen.

## Where it appears

A new phase, `setup`, in `LiftRun`. `stepIndex` is the group's first unlogged
step. `restFor` and `restStartedAt` are the set that ended the previous group
and its Done time, or null before the first group.

| From | Today | Now |
|---|---|---|
| Done on a step whose next unlogged step is in another working section | `rest` | `setup` |
| Start working sets (warm-up) | `ready` | `setup`, no clock |
| Start workout with no warm-up | `ready` | `setup`, no clock |
| Opening from Logbook (#579), or a load with no usable stored state, at a step that is its section's first unlogged step | `ready` | `setup`, no clock |
| The same, part-way through a section | `ready` | `ready`, unchanged |
| Done on the last working set | rest, then cooldown or summary | unchanged |
| Skip set on a rest or Ready, landing on a step in another section | `rest` or `ready` showing Up next | `setup` for that section, keeping the running clock |

"Its section's first unlogged step" means no earlier step of the same
section is unlogged. A group whose first set was skipped but whose second
was logged counts as part-way through.

## The screen

Content, top to bottom, inside `.lift-content`.

### 1. Since-last-set line

A single row, not a hero. On the left, "Since last set" at `--text-sm`
`--color-text-secondary`. On the right, the elapsed time in m:ss at `--text-lg`
700 tabular figures in `--color-text`. It is read from `restStartedAt` like
every Lift Mode clock. Absent when there is no last set (before the first
group).

No ring, no target, no overtime line, no `--color-warning` and no pulse,
however long it runs. The alert effect (`alertSlot`) does not run in
`setup`.

### 2. Group heading

- The section badge (`.section-badge`, the section's existing classes) with
  the group name: "Primary", "Superset 1", "Superset 2", "Superset 3",
  "Burnout". These are the labels `exercise-detail.tsx` already uses; lift that
  map somewhere shared rather than copying it.
- Then "Set up" at `--text-2xl` 700, and beside the badge in `--text-sm`
  `--color-text-secondary`: "2 exercises · 3 rounds" for a superset or
  burnout, or "4 sets" for primary. The rounds are the section's distinct set
  numbers.

### 3. One card per exercise

In run order (`exercise_order`), one `.lift-card` each. Inside a superset or
burnout the card's left border is the section colour (`--sec-*`, #577's
token), 4px. Primary's card has no coloured border.

Each card:

- **Head.** The letter and name: "A · Lat Pulldown" at `--text-xl` 700, with
  the letter in the section colour. Primary has no letter.
- **Plan line**, `--text-base` `--color-text-secondary`: "3 × 10". When the
  exercise's sets plan different reps, list them as "3 sets · 10, 8, 6". With
  no planned reps, "3 sets". Then, only when any of its rows carries a
  weight, " · planned **95 lb**". If the planned weights differ by set, it
  reads " · planned **95–105 lb**". With none, the planned part is left out,
  never "0 lb" or "BW".
- **Last time block**, `--text-sm`:
  - A label "Last time · Oct 21" in `--color-text-muted` uppercase
    letter-spaced, like #577's "SET TIME" caption. The date is
    `getLastTimeData(...).workoutDate` as "MMM D", plus the year when it is
    not this year.
  - Then one row per set of that session, in set order: "1  90 × 10  Medium".
    The set number is in `--color-text-muted`, the figures are in
    `--color-text` tabular, and the effort is a small pill tinted with
    `--effort-easy`, `--effort-medium` or `--effort-hard` at `--text-xs`. With
    no effort, there is no pill. A blank weight reads "BW". Blank reps read "?",
    as `lastTimeLine` does.
  - With no history: "First time doing this exercise" in
    `--color-text-muted`.
- **Weight row**, on a `--color-primary-light` band (`--radius-md`, padding
  `--space-sm` `--space-md`), the way #576's rest rows sit:
  - The label "Weight" on the left. On the right, #577's `Stepper` with unit
    "lb" and the same steps (`stepWeight`: ±5 at 20 lb and up, ±1 below,
    never under 0).
  - The **number in the middle is a text field**, `inputmode="decimal"`,
    sized to "000.0". Typing replaces the value; a non-number or a negative is
    put back to the last good value on blur. This departs from the log card's
    plain value deliberately. Setup is where big jumps happen (135 → 185, or 0
    → 45 on a first-time exercise), and pressing + nine times at a new station
    is the friction this issue removes.
  - **Starting value:** the exercise's set 1 planned weight, else last time's
    set 1 weight, else blank. Blank shows "Bodyweight" in
    `--color-text-secondary` in place of the stepper, with an "Add weight"
    text button in `--color-primary-text`. Tapping it shows the stepper at 0
    with the field focused.
  - A changed value shows "Changed" under the band in `--text-xs`
    `--color-primary-text`. Stepping or typing back to the starting value
    removes it.
  - The field's accessible name is "Weight for Lat Pulldown". The buttons are
    "Less weight" and "More weight", which is the `Stepper`'s own
    `Less ${what}`.

### 4. The previous group's log card

#577's `LogCard`, unchanged, for the round that ended the previous group (the
same items the rest screen would have shown), with its "earlier sets without
effort" line. It goes after the exercise cards. Absent before the first group.

Setup comes first because it is what this screen is for and it is what must
fit in compact. The log card is one scroll away, and #578's summary catches
anything left.

### 5. Action bar

- Primary: **"Start Superset 1"**, the group name from §2, at #577's primary
  button size.
- No secondary button.

## Start <group>

In order:

1. Held log-card stepper changes flush (`flushLogDrafts`), as Start set does.
2. For each exercise whose weight is marked Changed, write the new weight to
   every one of its sets in this workout that is not logged (`isStepLogged`
   false). This is the tracker's quick-fill weight rule. A blank weight that
   was never touched writes nothing. Writes go through `saveSet`, one per row,
   like the tracker's quick-fill.
3. If `restFor` is set, write `rest_s` to it (`wholeSeconds`), as Start set
   does.
4. `phase: 'set'` at the group's first unlogged step, with its set clock at
   0:00.

While step 2 is in flight the button reads "Starting…" and is disabled. If a
weight write fails, `saveSet`'s existing toast shows. The run still moves to
the set screen, whose target line shows whatever the row now holds, and the
weight can be fixed in the log card or All sets. The person is under the bar,
and a failed write should not hold the set hostage.

## Set screen wording

On a step whose next unlogged step is in another section:

- Done reads **"Done · set up next"**. It replaces "Done · rest 1:30" and
  "Done".
- The what-comes-next line reads **"Then set up Superset 1"**.

The last working set keeps "Done · finish" and "That's the last set. Done
opens the finish." Steps inside a section are unchanged.

## States

| State | Shows |
|---|---|
| Before the first group | No since-last-set line, no log card; heading, cards, Start |
| Between groups | All four sections |
| Exercise with no history | "First time doing this exercise"; weight from plan, else Bodyweight + Add weight |
| Exercise with planned weight and history | Both: planned in the plan line, last time's sets below; the stepper starts at planned |
| Last session had fewer sets than planned | Show the sets it had; nothing for the missing ones |
| Starting | Start reads "Starting…", disabled; the steppers are disabled too |
| Offline | Clock and navigation work; weight writes fail with the existing toast and the run continues (above) |
| Reload during setup | Back on Set up next for the same group, the clock still counting from `restStartedAt`; held weight edits are lost and the steppers show their starting values again |

## Edge cases

- **A group with one exercise left unlogged.** For example, a superset whose
  B sets were all logged in Logbook. The card list still shows every exercise
  in the section. An exercise with no unlogged sets reads "Done" in place of
  its weight row, and it is not written.
- **All sets of the group already logged.** No setup for it: `nextIndex`
  passes over it, as now.
- **The header's All sets** stays available during setup. The group's
  first set shows as the target, not "lifting now".
- **Progress bar** is unchanged; setup is not a set.
- **Rapid double tap on Start** runs once (the button disables on the first).
- **A very long setup** (over 10 minutes) reads "12:34", with no alert ever.
- **Two tabs** are not guarded, as in #577.

## Compact (`@media (max-height: 560px)`)

In #580's block:

| Element | Full | Compact |
|---|---|---|
| Since-last-set time | `--text-lg` | `--text-base` |
| "Set up" title | `--text-2xl` | `--text-lg` |
| Exercise name | `--text-xl` | `--text-base` 700 |
| Last time rows | one per set | one line: "Oct 21: 90×10 M · 95×8 H · 95×6 H", with the effort as a letter in its effort colour |
| Card padding | as #577 | as #580 |
| Primary button | 52px | 44px |

**Must stay visible without scrolling at 412 × 480:** the group badge and
title, the first exercise's name, and Start.

This is estimated from #580's figures, not measured, because the screen does
not exist yet:

| Element | Height |
|---|---|
| Header | about 60 |
| Since-last-set line | about 28 |
| Badge and title | about 56 |
| First card's head | about 32 |
| Action bar | about 72 |
| **Total** | **about 248**, against 480 |

`/test` measures it with `getBoundingClientRect()` per the web stack skill.

## Copy

| Where | String |
|---|---|
| Since line | Since last set |
| Title | Set up |
| Group meta | 2 exercises · 3 rounds / 4 sets |
| Plan line | 3 × 10 / 3 sets · 10, 8, 6 / 3 sets · planned 95 lb / planned 95–105 lb |
| Last time label | Last time · Oct 21 |
| No history | First time doing this exercise |
| Weight row | Weight · Bodyweight · Add weight · Changed |
| Exercise all logged | Done |
| Action | Start Primary / Start Superset 1 / Start Burnout · Starting… |
| Set screen Done | Done · set up next |
| Set screen next line | Then set up Superset 1 |

## New tokens

None. The left border uses #577's `--sec-*`, and the effort pills use the
existing `--effort-*`.
