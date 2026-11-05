# #817 — Last time is one slot

Every "last time" in a workout shows one exercise slot from one earlier workout. A slot is the
exercise's rows at one `exercise_order`. Nothing on screen gets a new look: the change is which rows
reach the surfaces that already exist. Colors, tokens, layout and copy stay as #577, #580, #667 and
#674 set them.

## The rule

Sections have three kinds: **warm-up** (`warmup`), **cool-down** (`cooldown`) and **working**
(`primary`, `SS1`, `SS2`, `SS3`, `burnout`).

For an exercise in section S of the workout on screen:

1. **Which workout.** The most recent earlier workout that has the exercise in a section of S's kind.
   A primary looks past a workout where the exercise was only a warm-up. A warm-up looks past one
   where it was only worked. The current workout is never a candidate. Lift Mode also skips planned
   workouts (#674), and Logbook doesn't.
2. **Which slot.** In that workout, the exercise's slot in S itself if there is one. Otherwise its
   slot of the same kind with the lowest `exercise_order`. Rows are shown in set order.
3. **None.** No such workout means no last time, and each surface shows its existing empty state
   (below).

Why kinds, not exact sections: templates move exercises between the primary and the supersets. An
exact match would hide real history ("First time doing this exercise" for a lift done last week
in `SS1`). A warm-up, though, is never comparable to a working set. It's an empty bar or a
mobility drill, which is exactly the `BW × ?` row this issue removes.

## Surfaces

| Surface | Reads | With a match | With none |
|---|---|---|---|
| Lift Mode, Set up next card (#674) | the slot | "Last time · Oct 21" and one row per set of the slot; the compact form (#580) is one line of the same rows | "First time doing this exercise" |
| Lift Mode, set hint on Ready and the log card (#577) | the slot's row with this set number | "Last time: 90 × 8 · Easy" | "First time doing this exercise", or "No set 5 last time" when the slot has fewer sets |
| Set up next weight field | planned set 1, else the slot's set 1 weight, else blank | starts at that weight | "Bodyweight" with "Add weight" (#674) |
| Logbook, Last time line and Copy (#667) | the slot | "Last time (Oct 21): 90 lb × 8 · Easy", and Copy fills exactly the slot's sets | no line, so no Copy |
| Exercises screen, expanded exercise | the most recent **working** slot; if the exercise has never been worked, the most recent warm-up or cool-down slot | date line and a row per set | "No previous data" |

## Edge cases

- **Same exercise twice in the earlier workout** (the Oct 21 case: warm-up at order 4, primary at
  order 5). A primary today gets order 5's four sets. A warm-up today gets order 4's one row. If
  that row logged nothing, Logbook shows no line for the warm-up, which is better than today's
  primary figures under a warm-up.
- **Twice in working sections** (say `primary` and `burnout`). Today's `primary` gets the earlier
  `primary` slot. Today's `SS1` gets the lowest-order working slot, here the `primary`. Rows from
  the two are never shown together, so set numbers never repeat and the Set up next card's
  per-set keys stay unique.
- **Only ever a warm-up, now a primary.** No working history, so Lift Mode says "First time doing
  this exercise". That's literally wrong (it's been done), but it's honest about there being no
  working figures to aim at. The wording stays out of scope.
- **The most recent working session logged nothing** (abandoned after the warm-up). It's still the
  match, exactly as today: the rule picks by section kind, not by whether anything was logged.
- **Copy into a slot with more sets than last time.** Unchanged from #667: Copy matches the
  slot's set count.

## Copy

No new strings. Every string above already exists.
