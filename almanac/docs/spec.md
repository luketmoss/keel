# Journal — Product Specification

**Revision 2** — 22 September 2026
**Status:** Draft. Scaffolded 19 September 2026 as `almanac/` in the keel
workspace — a project folder, not its own repository. §9's first decisions were
recorded 20 September. §9.6–14, and the amendments to §1, §2, §4, §8 and §9.3–4,
come from a prototype review on 22 September
(<https://claude.ai/artifact/Dk2WztPMbKAQLscNCKmnyP>). The visual decisions live
in `docs/design/design-language.md`.
**Companions:** `docs/data-architecture.md` (the cross-app contracts this
depends on) and `docs/coros-sync-plan.md` (how the health data arrives).

This document specifies the app. The contracts it consumes live in
`data-architecture.md` and are being built into Thrive and Hive
independently — see §8 for what those apps owe this one.

*(The app is called **almanac**, decided 19 September 2026 — see §9.4. It is
still referred to as "the Journal" throughout the body of this document, which
has not been rewritten around the name.)*

---

## 1. What it is

**A morning driver, not a retrospective log.**

Revision 1 of `data-architecture.md` assumed a journal was something you
scroll backwards through — a record of days that already happened. That was
wrong, or at least half right. The primary use is opening it in the morning
to see the day ahead: what is scheduled, what is due, what the night's sleep
looked like. Looking backwards is the secondary mode.

This distinction drives almost everything below, because **the data that
answers "what is today" is not the data that answers "what was the 12th."**
`DailySummary` is a completed-day rollup and answers only the second.

### Non-goals

- **Not a second Thrive or Hive.** It surfaces and links; it does not
  reimplement either app's workflows.
- **Not an analysis tool.** Trends charts show the data — each day's value,
  a rolling average, your own range — and never draw conclusions from it
  (§9.10). Pattern-finding over this data is an agent's job, reading the same
  sheets.
- **Not a Forage client**, yet. Forage is unbuilt; §7 names where it attaches.

---

## 2. The three day states

A date is past, today, or future, and the page means something different in
each. This is one screen with three states, not three screens — but building
only the "today" state and bolting the others on afterwards will not work,
because the panels' content changes kind, not just value.

| Panel | Past day | Today | Future day |
|---|---|---|---|
| **Thrive** | What was done — activities, distance, effort | What is scheduled, plus what has been done so far | What is scheduled |
| **Hive** | What was completed that day | Due today, due soon, overdue | Due that day |
| **Notes** | The entry, editable | The entry, editable | Usually empty; editable |
| **Health** | That day's metrics, complete | Last night's sleep, resting HR and HRV, and steps so far — each once a sync has brought it (§9.9) | Nothing yet |

The **Hive** row is the one that changes most sharply: a past day asks "what
did I finish," which is an event-log question (`getAuditLog`), while today
asks "what is outstanding," which is a due-date question (`getItems`). Two
different queries against two different fields, sharing a panel.

---

## 3. Thrive panel

### Today and future

- **Scheduled workout** for the date, if one exists. Thrive already models
  this as `Workouts.status = 'planned'`.
- **Tapping it opens Thrive at that workout in edit mode**, where it can be
  rescheduled or deleted. The Journal does not do either itself — see §5.
- **No scheduled workout** → an action that launches Thrive to create one.
  The Journal does not build workouts.

### Past

- The day's completed activities: type, sub_type, distance, moving time,
  effort.
- Tapping one opens it in Thrive.

### Reading

The day rollup comes from `DailySummary` (one row, fifteen cells). Individual
activities come from the `Workouts` read, both through Thrive's Apps Script
API. Scheduled workouts are `status = 'planned'` rows for the date.

**Gap:** `DailySummary` is computed nightly from completed activities. It
does not carry scheduled work, so the "today" state cannot be served from it
alone and needs a separate planned-workout query. This is the Journal's only
genuinely new read requirement in Thrive. See §8.

---

## 4. Hive panel

### Today

Three groups, in this order:

1. **Overdue** — `due_date` before today, not in a terminal status.
2. **Due today** — `due_date` equals today.
3. **Due soon** — a short forward window. **[DECIDE]** — three days, seven,
   or configurable.

### Past

What was completed that day, from the `Audit Log` via the new `getAuditLog`
action, filtered on the `completed` action. `data-architecture.md` §3 covers
why this reads the event log rather than `completed_at`.

**Hive returns raw events; almanac decides what they mean.** This is settled on
Hive's side (`luketmoss/hive#239`) and it is deliberate — Hive collapsing events
to a daily verdict would bind every future consumer to one reading of "done".
Rows come back exactly as logged, in chronological order, with no deduplication
and no netting.

Three consequences, and all three are this app's to handle:

1. **An item completed on more than one day appears on each of them.** Complete
   on the 12th, reopen on the 15th, complete again on the 20th: the 12th and the
   20th both return a `completed` row. That is correct — on the 12th it *was*
   finished, and a past day's answer must not change later. §2's past state is a
   record of what happened, not a recalculation.
2. **Completed twice in one day returns two rows.** The panel shows one line per
   item per day; dedupe on `item_id`.
3. **Completed then reopened on the same day still returns the `completed`
   row.** **Decided: shown struck through, with the time it was reopened**
   (§9.4). Chronological ordering is guaranteed, so the reopen that follows the
   completion is always there to read.

### Links

Every item links into Hive, opening that item directly with its full detail.

**This does not work today.** Hive puts board and view in the URL
(`initActiveBoardFromUrl`, `initActiveViewFromUrl`) but `selectedItemId` is a
plain signal with no URL binding. Deep-linking to an item is new work in
Hive — see §8.

---

## 5. Writes

**The Journal writes its own notes, and nothing else.**
`data-architecture.md` §10 stands unchanged.

Rescheduling a workout, deleting one, completing a task, fixing a wrong
sport type — all of it happens in the app that owns the data, reached by a
link. The Journal's job is to show you the day and get you to the right
place; it is not a second editor.

**Deep-linking is what makes this work rather than merely safe.** Thrive's
`#/history/:id/edit` route already opens a planned workout in the planner UI
(`workout-edit.tsx` branches on `isPlanned`), so "reschedule this" is one tap
into an editor that already exists and already enforces Thrive's rules. No
API write action, no row mapping in the Journal, no interaction with the sync
plan's §8 merge, and no second implementation of anything.

The same holds for Hive, whose writes carry business rules, cascading child
updates and audit entries that live in Apps Script precisely so that clients
do not reimplement them.

This is the cheaper design as well as the more conservative one: every write
capability the Journal *doesn't* have is one it doesn't have to build, test,
or keep in step.

---

## 6. Notes panel

Free text, plus a small structured set. This reverses
`data-architecture.md` §7's free-text-only decision, taken before the
morning-driver framing existed.

| Field | Type | Values |
|---|---|---|
| `notes` | Free text | |
| `sleep_hours` | Number | Self-reported. Coexists with the watch figure — see below |
| `sleep_quality` | 3-level | `Poor` / `OK` / `Good` |
| `energy` | 3-level | `Low` / `OK` / `High` |

**Three named levels, matching Thrive's `Effort` in shape but not in
wording.** Effort is `Easy`/`Medium`/`Hard`, which reads correctly for a
workout and not at all for sleep — "hard sleep" means nothing. The useful
property being copied is three named steps rather than a numeric scale:
faster to enter daily, and self-reported middle values on a 1–5 or 1–10
scale blur together anyway.

All fields nullable. A blank field means nobody said, and must never render
or store as a zero or a middle value — the same discipline CLAUDE.md applies
to `Workouts!L–Q`. A day you did not fill in is not an `OK` day.

### The sleep conflict

`sleep_hours` overlaps `DailyHealth.sleep_total_s`, which already arrives
from COROS. These are **different measurements**, and neither is wrong:

- The watch measures sleep, but only when worn, and reports its own idea of
  what counted as sleep.
- A self-report is always available and is usually time in bed.

**Decided: store both, separately, and never let one overwrite the other.**

- `DailyHealth.sleep_total_s` — what the watch measured, owned by the sync.
- `sleep_hours` — what you reported, owned by the Journal, in its own sheet.

Display the watch figure when present, with the self-report as fallback on
nights the watch has nothing and as an override when you disagree with it.

Collapsing them into one number would lose the ability to ask why they
disagree, and that disagreement is plausibly the more interesting signal — a
night the watch scored well and you remember badly is exactly the kind of
thing this system exists to surface.

Note that `sleep_quality` may end up partially double-sourced too: COROS
EvoLab produces a sleep score, and whether it appears in the daily payload
is **[VERIFY]**. If it does, the same rule applies — separate fields, no
overwriting.

### Where it lives

The Journal's own Google Sheet, written directly — `data-architecture.md`
§7. One row per day, keyed on the local calendar date in `America/Denver`.

---

## 7. Where Forage attaches

Not now. When it exists, it adds a fourth panel on the same contract: a
per-day summary keyed on the Denver-local date, read through whatever seam
Forage exposes. Nothing in this specification needs to change to admit it,
which is the point of §2's panel structure.

---

## 8. What the other apps owe this one

The Journal cannot be built until these exist. **All of it is work in Thrive
and Hive, not here** — which is the main reason this specification is
separate.

### Thrive

| Needs | Status |
|---|---|
| Apps Script API | Planned — sync plan Phase 2b |
| `DailySummary` tab | Planned — sync plan Phase 3 |
| `DailyHealth` tab | Planned — sync plan Phase 3 |
| COROS sync running | Planned — sync plan Phases 1–6 |
| `sub_type` on activities | Planned — sync plan §5 |
| **Query planned workouts by date, via API** | **New** — needed to *display* the scheduled workout |
| Deep link to an activity | **Already works** — `#/history/:id` |
| Deep link to a planned workout's editor | **Already works** — `#/history/:id/edit` handles `status = 'planned'` |
| **Deep link to plan a new workout on a date** | **New** (22 Sep) — the day's "Plan" action opens Thrive's planner with the date filled in. `#/workout/new` exists but takes no date |
| **More than one COROS sync a day** | **New** (22 Sep) — the 03:17 run lands before waking, so today's numbers need daytime runs (§9.9). Being changed in the COROS job |
| Step goal in the daily payload | **[VERIFY]** (22 Sep) — §9.11 |

### Hive

All five are now filed and refined on Hive's board, across three issues:

| Needs | Hive issue | Status |
|---|---|---|
| `getAuditLog` action | [#239](https://github.com/luketmoss/hive/issues/239) | Refined |
| Explicit `completed` audit action | [#239](https://github.com/luketmoss/hive/issues/239) | Refined |
| Denver-local date filtering | [#239](https://github.com/luketmoss/hive/issues/239) | Refined |
| Due-date range queries | [#241](https://github.com/luketmoss/hive/issues/241) | Refined — `getItems()` filters `due_after` / `due_before` (`hive/apps-script/src/items.js` L31–36, with a test), but `main.js` never forwards the two parameters, so the filter is unreachable over HTTP |
| **Deep link to an item** | [#240](https://github.com/luketmoss/hive/issues/240) | Refined — board and view are URL-bound, `selectedItemId` is not |

**One more, from the prototype review (22 Sep), not yet filed on Hive's board:**
a deep link that opens Hive's create screen with the due date filled in, for the
day's "Add" action.

Two things surfaced during Hive's refinement that this side should know:

- **The `Audit Log` tab already has data**, and both of Hive's write paths log
  status changes. #239 adds a read path and one unambiguous event type to a log
  that has been accumulating, rather than building one.
- **Completion history starts when #239 ships.** Earlier completions can only be
  approximated, by reading historical `status_changed` rows against the current
  terminal set — which misreads history if a column's `is_terminal` flag was ever
  changed. A past day rendered from before #239 is therefore best-effort, and the
  panel should not imply otherwise.

### Withings

Not in the first version (§9.12, [keel#354](https://github.com/luketmoss/keel/issues/354)).
Nothing syncs weight, body fat or blood pressure today, and no document names a
sheet or columns for them.

### Sequencing

Thrive's API (Phase 2b) gates everything on the Thrive side. Hive's work is
independent of it and can proceed in parallel — it is five small additions to
an existing deployment, none of which changes Hive's write path.

---

## 9. Open questions

1. **[VERIFY §6] Still open.** Does COROS's daily payload carry a sleep score?
   If so, `sleep_quality` is double-sourced and follows the same store-both
   rule. **This gates nothing** — §6 already fixes the rule that applies under
   either answer, so no work upstream of it should wait. It is answered by
   whoever builds sync Phase 3, from a real payload.

2. **[DECIDE §4] Decided: three days, fixed.** The "due soon" window is a
   fixed three-day forward window, not configurable. §5 leaves the Journal with
   no settings surface at all, and one integer does not justify inventing one.

3. **[DECIDE §2] Decided: single days now, a week view later.** The day screen
   is date-addressable and carries all three day states from the start, because
   §2's panels change kind rather than value and cannot be bolted on afterwards.
   The data layer stays day-keyed so that a week is N days, and the week view is
   its own later piece of work rather than a thing this screen grows into.
   **Amended 22 September: a month calendar joins the day screen now.** You move
   between days by swiping or with the week strip in the day's header. The month
   grid is for going back: each day shows its activities and whether it has a
   journal entry, and can be shaded by one health metric. Tapping a day
   summarises it, with a way into the full day. It reads the same day-keyed data
   — a month is N days.

4. **[DECIDE §4] Decided 22 September: struck through.** Hive returns the
   `completed` row either way (`luketmoss/hive#239` settled that Hive does not
   interpret), so the panel had to choose between hiding the item, striking it
   through, or showing it plainly as completed. Struck through, with the time it
   was reopened, tells both truths: the day's record says it *was* completed,
   and the strike stops anyone scanning yesterday from reading it as still
   done. Hiding loses an event that happened; showing it plainly misleads.

5. **Decided: it is called `almanac`, and it does not get its own repository.**
   It is a project folder in the keel workspace, on keel's board and lifecycle.
   The name is load-bearing: an almanac is a day-by-day forward-looking
   reference that happens to keep records, which is §1's framing. "Journal"
   named the retrospective log §1 explicitly says this is not.

The rest were settled in the prototype review on 22 September.

6. **Decided: Preact and almanac's own CSS, following Thrive and Hive — not the
   Keel Alpenglow foundation.** Alpenglow is the more restrictive of the two by
   design: dark only for now, one accent that may only mark interaction, fixed
   type, radius and spacing scales, and under the Keel platform plan a
   foundation shared by every app that no app may override. Almanac keeps the
   freedom Thrive and Hive have, each owning its own `global.css`. This
   confirms `CLAUDE.md`'s Preact decision; the tokens are in
   `docs/design/design-language.md`.

7. **Decided: the accent is amethyst.** Hive is gold, Thrive is becoming blue,
   Forage is green and cairn is orange. Violet was rejected for sitting too
   close to Thrive's blue. Values are in the design language.

8. **Decided: "your range" is the mean ± 1 standard deviation of the 30 days
   before the date, shown once 14 of them have a value.** It applies to resting
   HR, HRV, sleep and steps, and it is the only comparison the day screen makes —
   no composite scores. A value outside the range is coloured only when it is
   outside in the unwelcome direction (resting HR above, HRV or sleep below),
   and it always carries words, never colour alone. Thirty days follows real
   change — a training block, altitude, a season — faster than the 60 that
   Athlytic and Bevel use.

9. **Decided: a number appears when a sync has brought it, and not before.**
   Until today's first sync lands, each of today's health rows says "Arrives
   with the next sync." It never shows a stand-in such as the night before —
   blank is not zero, and neither is yesterday. Totals that grow through the
   day, such as steps, show the count so far with the time of the sync that
   brought it. A past day shows the completed day. The COROS job is being
   changed to run several times a day (§8), and a sync button comes later.

10. **Decided: Trends is a third screen beside the day and the calendar.** One
    metric or a group — recovery, sleep, body, blood pressure, activity,
    fitness, check-in, or a custom set of up to four — stacked on one shared
    date axis. Never two y-axes on one chart. Each chart shows every day as a
    dot and a rolling average as a line, with the band from §9.8 behind them.
    Blank days stay blank and break the line. The range (1W, 1M, 3M, 6M, 1Y,
    All) and the average (off, 7, 14 or 30 days) are view controls remembered
    on the device, not settings, so §9.2's "no settings surface" still holds.
    Every chart has a table view. Charts show; they never conclude (§1).

11. **Decided: the step goal comes from COROS if it comes at all.** COROS lets
    a daily goal be set in its app. If the daily payload carries it, the steps
    row fills toward it; if not, steps sit against the range from §9.8 like
    everything else. Almanac never sets or stores a goal, which keeps
    `data-architecture.md` §8's "goals are out of scope" true.
    **[VERIFY]** whether the payload carries the goal at all: the COROS MCP
    documentation lists no goal field. It is answered from a real payload, the
    same way as §9.1.

12. **Decided: Withings is out of the first version.**
    [keel#354](https://github.com/luketmoss/keel/issues/354) tracks it. The
    design keeps its weight, body fat and blood-pressure rows, so nothing
    changes when the data arrives.

13. **Decided: every Hive board appears on the day screen**, each item tagged
    with its board's own colour from Hive.

14. **Decided: the day's header shows sunrise, sunset and hours of daylight,**
    worked out on the device for Denver. It needs no data source, and it is the
    detail that makes an almanac an almanac.
