# #951 — Last time from the same group

Amends [#817](817-last-time-one-slot.md)'s rule for *which* earlier workout is last time. Nothing on
screen gets a new look and there are no new strings: the change is which rows reach the surfaces
#817 lists. Colors, tokens, layout and copy stay as #577, #580, #667, #674 and #817 set them.

## The rule

Sections fall into five **groups**:

| Group | Sections |
|---|---|
| warm-up | `warmup` |
| primary | `primary` |
| superset | `SS1`, `SS2`, `SS3` |
| burnout | `burnout` |
| cool-down | `cooldown` |

For an exercise in section S of the workout on screen:

1. **Which workout.** The most recent earlier workout that has the exercise in a section of S's
   **group**. A primary looks past a workout where the exercise was only in a superset, a burnout or
   a warm-up. The current workout and planned workouts (#823) are never candidates.
2. **Which slot.** In that workout, the exercise's slot in S itself if there is one. Otherwise its
   slot in the same group with the lowest `exercise_order` (only possible for supersets: today's
   `SS2` with last time's exercise in `SS1`). Rows are shown in set order.
3. **None.** No such workout means no last time, and each surface shows its existing empty state.

Why groups, not #817's kinds: a primary lift, a superset and a burnout are different types of
effort, usually at different reps, so a figure from one is not a fair target for another. That
costs history when a template moves a lift between the primary and a superset (the case #817 chose
kinds for): the first time in the new group says "First time doing this exercise". The owner chose
the fair comparison over that history.

Why `SS1`–`SS3` are one group: the number is the superset's position in the workout, not a
different effort. A lift that moves from the first superset to the second is the same work.

## Surfaces

| Surface | With a match | With none in today's group |
|---|---|---|
| Lift Mode, Set up next card (#674) | "Last time · Oct 21" and the slot's rows | "First time doing this exercise" |
| Lift Mode, set hint on Ready and the log card (#577) | "Last time: 90 × 8 · Easy" | "First time doing this exercise", or "No set 5 last time" |
| Set up next weight field | planned set 1, else the slot's set 1 weight | planned set 1, else "Bodyweight" with "Add weight" |
| Logbook, Last time line and Copy (#667) | "Last time (Oct 21): 90 lb × 8 · Easy"; Copy fills the slot's sets | no line, so no Copy |
| Exercises screen, expanded exercise | **unchanged**: the most recent primary, superset or burnout slot; else the most recent warm-up or cool-down slot | "No previous data" |

The Exercises screen has no section on screen, so there is no group to match. It keeps #817's
"most recent worked" reading: it is a glance at what was done, not a target to aim at.

## Edge cases

- **Primary today, superset last week, primary three weeks ago.** Last time is three weeks ago's
  primary slot, dated accordingly ("Last time · Oct 30").
- **Superset today, only ever primary before.** No match: "First time doing this exercise" in Lift
  Mode, no Last time line in Logbook. Literally wrong (it has been done), as in #817's warm-up case;
  the wording stays out of scope.
- **Twice in one earlier workout in different groups** (`primary` at order 2, `burnout` at order 6).
  Today's `primary` gets order 2; today's `burnout` gets order 6; today's `SS1` gets neither.
- **Twice in supersets in one earlier workout** (`SS1` and `SS3`). Today's `SS3` gets the `SS3`
  slot; today's `SS2` gets the lowest-order superset slot.
- **The most recent same-group session logged nothing** (abandoned). Still the match, as in #817.

## Copy

No new strings.
