# 832 — The weekly rework, as input to /plan-week

Specifies [#832](https://github.com/luketmoss/keel/issues/832), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The weekly page is `thrive/.claude/skills/brief/weekly-template.html`
and its sections are the brief skill's *Weekly brief*. This note changes only what it names; everything else on the
page stays as it is. Grades come from #830, the trial line from #831's note
([`831-trials.md`](831-trials.md)), the 3:45 PM sync from #828. There are no standing documents in
`thrive/docs/design/`, and nothing here introduces a token. Every figure below is made up.

## When it runs, and what the owner does with it

1. **3:45 PM Sunday:** the scheduled COROS sync (#828), after the Sunday Sync watch on the phone (below).
2. **4:00 PM:** the weekly runs from the wiki's `/weekly-brief` command, files the week's review in the wiki and
   publishes the page to the existing **Weekly Brief** link.
3. **About 4:05 PM:** the phone says it is up. The owner reads it whenever planning starts that evening.
4. **Evening:** the owner runs `/plan-week`, which starts from the filed review and the page's proposal, settles the
   week with them, and schedules it.
5. **9:15 PM:** Sunday's nightly shows the newly planned days in its *Next 5 days*.

## The page

The order stays week ahead first, look back last. Three things change.

### 1. A filed line, under the header

One line, in the place of the optional `notice`. The notice, if any, goes under it.

| State | Line |
|---|---|
| Filed | `This week's review is filed in your wiki, ready for /plan-week.` |
| Wiki left alone this run | `This week's review isn't filed: your wiki had changes of its own. /plan-week will read the weeks itself.` |
| Filed, push failed | `This week's review is filed but not pushed yet. The next brief will push it.` |

### 2. The plan card gains meals, the trial and grade changes

`plan.suggestions` keeps its four kinds and adds one:

- **`meal`**: a meal to plan in Forage for a day ahead, when Forage has fewer dinners planned for the week than the
  days it covers (the night-out notes count as planned). At most two meal suggestions. Each one's `why` names the
  gap and the day, for example *"Nothing planned for Tuesday or Wednesday dinner, and Tuesday's calendar is full
  until 6:30."* A meal suggestion never names a recipe the library doesn't hold.

Below the suggestions, two optional lines:
- **The trial line** from #831, linked to the nightly page.
- **Grades that moved**: one line per test whose grade changed this week, for example
  `Water gaps and the day's total: collecting → leaning`. With none, the line is left out; it never says "no
  changes".

### 3. The look back gains *Plan against done*

A new first block in `back`, before the stats: every session planned for the week, one row each.

```
Mon  3 - Legs A        Done
Tue  Stretch           Swapped for an easy walk · "foot sore after Sunday"
Thu  4 - Upper Push B  Done, moved from Wednesday
Sat  Gravel ride       Missed · not explained in your notes
```

- **Statuses:** `Done`; `Done, moved from <day>`; `Swapped for <what was done>`; `Missed`.
- **The why** after a dot is quoted from the day's journal or a session note when one explains it. When none does,
  the row says `not explained in your notes`. The brief never guesses a reason.
- **Under the rows,** one line against the weekly targets on the wiki's scheduling page, for example
  `2 of 3 lifts · 1 of 1–2 stretches · 0 of about 1 ride`. A ride is reported, never scored, as that page says.

The page shows the review; the wiki keeps it.

## What is filed in the wiki

One dated entry, appended to the active block page's `## Outcome log`, in the shape `/weekly-review` writes today:
- the comparison of plan against done, with the why or "not explained" for each miss
- the frozen figures the review rests on, each with its read date
- where the active approach stands against its written success criteria, and how far into its trial it is, or that
  none were recorded
- any session note naming the limitations it tracks
- what it proposes for next week, marked as proposed

Then a line in `log.md`. Committed and pushed through the write-back rule.

The weekly files **facts and proposals, not verdicts**. It writes nothing to `session-structure`, project pages,
concept pages or the goals page. A keep, change or extend call at the end of an approach's trial is a proposal in the
entry, which `/plan-week` settles with the owner. That is where `/weekly-review` already says approach changes
happen.

## Phone

`docs/brief-phone.md`:
- **Sync watch, Sunday afternoon.** A third window for Macro 1, Sundays 1:00 to 3:40 PM, first unlock, with its own
  once-a-day variable (`coros_last_sun`), so it doesn't spend the evening window's.
- **Weekly watchdog (4b)** moves to Sunday at 4:20 PM, title **No weekly brief by 4:20**.
- **Open weekly brief (3b)** opens on the first unlock after the weekly is up, as now. Its "after about 6:50 PM"
  wording becomes "after about 4:05 PM".

## Copy

| Where | String |
|---|---|
| Filed line | as in the table above |
| Plan against done statuses | `Done`, `Done, moved from <day>`, `Swapped for <what>`, `Missed` |
| No explanation | `not explained in your notes` |
| Grade change | `<test title>: <old grade> → <new grade>` |
| Watchdog | **No weekly brief by 4:20** / *The desktop may be asleep, or the run is waiting on a prompt. Open the Weekly brief task in Claude.* |

## Edge cases

- **A week with nothing planned.** *Plan against done* says `Nothing was planned this week.` and the targets line
  still shows what was done.
- **The run fails before filing.** Nothing is written to the wiki, and the failure goes to the phone as the skill's
  *When it can't publish* says.
- **The run files, then the publish fails.** The entry stays filed. The phone gets the failure note, and the task's
  chat has the brief.
- **Run by hand on another day.** The review covers the seven days ending the day before. It files only when run on
  a Sunday, so a weekday run by hand never adds an entry for a part week.
