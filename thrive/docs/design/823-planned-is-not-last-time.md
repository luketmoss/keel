# #823 — A planned workout is never last time

Every place that answers "when did I last do this, and what did I lift" ignores workouts whose
`status` is `planned`. That's the rule Lift Mode has kept since #674, now shared. Nothing gets a new
look, and no string is added: each surface keeps its existing states and copy, and only the
workout it reads changes.

## The rule

- **Counts:** finished workouts and an `active` one, as in Lift Mode today.
- **Never counts:** a `planned` workout, whatever its date: today's plan before it starts, a plan
  scheduled ahead, or an old plan that was never started.
- **Order:** this filter runs first, then #817's one-slot rule
  ([817-last-time-one-slot.md](817-last-time-one-slot.md)) picks the workout and slot from what's
  left.

Why `active` still counts: it's lifted weight, and only one workout can be active, normally the
one on screen, which every surface already excludes.

## Surfaces

| Surface | Before | After | With nothing left |
|---|---|---|---|
| Exercises screen, row's when text and Last used group | a plan's date: "Today", This week | the last finished session's date: "Fri", Last week | "Not done yet", no when text |
| Exercises screen, expanded last session | a plan's rows: `135 lbs — —`, "(today)" or "-7 days ago" | the last finished session's rows and date | "No previous data" |
| Logbook, Last time line and Copy (#667) | can read a plan dated after the last session: "Last time (Nov 12): 135 lb" | the last session that wasn't a plan | no line, so no Copy |
| Activity detail, last-time line | the previous same-template workout, even an unstarted past plan | the previous same-template workout that wasn't a plan | no line |
| Lift Mode (#577, #674) | already skips plans | unchanged | unchanged |

## Edge cases

- **Today's plan, before Start.** On the Exercises screen, its exercises keep their last finished
  date. Once it starts, it's `active` and counts on the Exercises screen. That's the honest
  answer once weight is being lifted. Logbook and Lift Mode exclude it as the current workout.
- **An exercise that has only ever been planned.** "Not done yet" on the Exercises screen, and
  "First time doing this exercise" in Lift Mode, as for an exercise never used.
- **A plan dated in the past and never started.** Ignored everywhere. Nothing cleans it up
  (out of scope).
- **Finishing a workout.** It stops being `planned` well before this, at Start, so it counts from
  then on with no extra step.
