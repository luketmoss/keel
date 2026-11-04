# #813 — Log card in round order, and a log step after the last set

Amends [#577](577-lift-mode.md) §Log card and the end of the working sets, and
[#578](578-lift-summary.md) §5 Back. Everything not named here is unchanged.

## 1. Log card order

The round's done sets are listed **in round order**: the round's first exercise
at the top, its last at the bottom. This replaces #577's "newest first". It
reads the way the superset was planned and performed (A, then B), which is
how the person scans it.

- A single-exercise round has one set in the card, so nothing changes there.
- A round with a skipped set still leaves that set out; the rest keep round
  order.
- The same order applies wherever the log card appears: the rest screen, the
  final rest, and #674's Set up next.

## 2. After Done on the last working set

Done on the last working set no longer opens the summary or the cool-down at
once. It goes to **the final rest**, the screen #578 already returns to on
Back: the rest hero counting from Done (no target, no Up next) and the log card
for the round just finished, headed as any other log card ("Log the set you
just did" / "Log this round").

The primary action is the way on:

| Template has a cool-down | Primary action | It opens |
|---|---|---|
| No | Finish workout | the summary (#578) |
| Yes | Start cool-down | the cool-down checklist |

There is no secondary action (no Skip set: there is no next set).

- The last set's `set_s` is written on Done, as now. No `rest_s` is written for
  the final rest, as now.
- Held stepper changes in the log card are written before the next screen
  opens (`flushLogDrafts`), as on every other leave of the card.
- **Back** from the summary still returns to this screen.
- From the cool-down checklist, Finish workout opens the summary as now, and
  Back from that summary returns to the cool-down checklist.
- **Skipping** the last set (Skip set) is unchanged: there is no set just done
  to log, so it goes straight to the cool-down or the summary.
- **Reload** on the final rest restores it from the stored run (phase `rest`,
  `restFor` = the last step), as any rest does.
- The "earlier sets without effort" line under the log card works as on any
  rest, pointing at All sets.

## Copy

| Where | String |
|---|---|
| Final rest, no cool-down | Finish workout |
| Final rest, with a cool-down | Start cool-down |
| Set screen next line, last set | That's the last set. Done opens the finish. → **That's the last set. Log it, then finish.** |
