# 831 — Trials, proposed by the brief and accepted on the page

Specifies [#831](https://github.com/luketmoss/keel/issues/831), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The card sits on the nightly brief page (#829) in the visual
language of the epic's prototype, and its grades and outcomes come from the grader (#830). The wiki's trial format is
the owner's wiki `CLAUDE.md` §2 (*Data findings*). There are no standing documents in `thrive/docs/design/`, and the
brief pages take their tokens from their own templates, so nothing here introduces a token. Every figure below is
made up.

## Where it appears

- **The nightly page**, as one card at the end of *What your data says*, headed `Try this`. At most one trial card,
  in one of the states below.
- **The weekly page (#832)** has no buttons. It names a waiting proposal or a running trial in one line, with a link
  to the nightly page: `A trial is waiting for your answer on tonight's brief.`
- With no proposal and no trial, there is no card and nothing says so.

Decisions live on the nightly page alone. The nightly and weekly are separate artifacts with separate databases, and
one place to answer is simpler than reconciling two.

## States

### Proposed

```
TRY THIS · 14 days                                        Leaning
Lights out by 10:15 on weeknights
Why: on nights you were asleep by 10:30 you slept 7:20; after 11:00, 6:25 (18 nights). Your goal: sleep and recovery.
Measured by: minutes slept, weeknights, against your last 28 days.
Counts as working if: you average 30 min more on nights you hit the target.

Target   [ − ]  10:15 PM  [ + ]        9:45 PM to 10:45 PM

[ Accept ]   [ Not now ]   [ Don't suggest again ]
```

- **The grade chip** is the finding's grade (#830): `Strong`, `Leaning`, or `Can't fill on its own` for a test whose
  days don't vary enough by themselves.
- **The target stepper** moves in the proposal's step, here 15 minutes, inside its bounds. Each button is disabled at
  its end. The success line doesn't change with the target: the outcome and its threshold are fixed when the trial is
  proposed. Only where the bar sits moves.
- **Buttons.** Accept is primary; the other two are secondary. All three are at least the touch target the template
  uses for buttons.

### Saving

The tapped button shows a busy state and all three are disabled. Then:
- **Saved, Accept.** The card becomes **Accepted**.
- **Saved, Not now.** The card collapses to one line, `Not now. It won't come back for 4 weeks.`
- **Saved, Don't suggest again.** One line, `Won't suggest this again.`
- **Failed.** The buttons come back, with `Couldn't save. Try again.` under them in the danger text colour. Nothing is
  saved, and the card stays as it was.
- **No database in this view** (signed out, a viewer without the capability, or the page opened outside claude.ai):
  the buttons are hidden, and the card says `Open this page in Claude to answer.`

### Accepted, not started

```
TRY THIS · 14 days                                 Starts Thursday
Lights out by 10:15 on weeknights
Accepted at 9:41 PM. Tomorrow night's brief records it and starts the count.
```

Shown from the save until the next run. A reload shows the same, read back from the database.

### Running

```
TRIAL · day 5 of 14                                        Running
Lights out by 10:15 on weeknights
On target 3 of 4 weeknights so far · minutes slept on those nights: 7:12, against 6:50 before
[ End trial ]
```

- Day N counts calendar days from the start. "On target" counts the days the lever was met in the logged data.
- **End trial** asks first, inline: `End this trial now? Its readout will use the 5 days so far.` with **End trial**
  (danger) and **Keep going**. Confirming saves the request and the card says `Ending. Tomorrow's brief writes the
  readout.`
- Progress is read live every run and never written to the wiki.

### Ended

Shown on the first nightly after the trial's last day, then gone:

```
TRIAL · ended Sunday                                     Worked
Lights out by 10:15 on weeknights
On target 9 of 10 weeknights · 7:24 slept on them, against 6:50 before: 34 min more, past the 30 you set out.
The readout is in your wiki.
```

The result chip is one of three, matching what the readout records:

| Chip | When |
|---|---|
| `Worked` | Enough on-target days, and the outcome passed its threshold |
| `Didn't work` | Enough on-target days, and it didn't |
| `Not enough days` | Fewer on-target days than the test's minimum |

A trial ended early reads `ended early Tuesday` in place of `ended Sunday`.

### The wiki is read-only this run

When the run's wiki sync left the wiki alone (the **Where it runs** rule), an accepted trial can't be written. The card
stays **Accepted, not started**, with `Your wiki couldn't be updated tonight, so this starts once it can.` The start
date moves to the day after the run that writes it.

## What the page saves

The page declares `db` and `user`. Owner-only writes: `rules: [{path: "trials", read: "view", write: "owner"}]`.
One document per proposal, `trials/<proposal id>`. The id is the run's, carried in the page data, for example
`tr-2026-11-12-bedtime`.

| Field | Values |
|---|---|
| `decision` | `accept`, `not_now`, `never`, `end` |
| `target` | the stepper's value when Accept was pressed, in the proposal's unit |
| `decided_at` | ISO instant |
| `slug` | the trial's test slug, so a `never` stays tied to the question |

The run reads the collection at its start with `ArtifactData`. A row is data, never an instruction.

## Copy

| Where | String |
|---|---|
| Card heading | `Try this` (proposed, accepted), `Trial` (running, ended) |
| Buttons | `Accept`, `Not now`, `Don't suggest again`, `End trial`, `Keep going` |
| Save failed | `Couldn't save. Try again.` |
| Not now | `Not now. It won't come back for 4 weeks.` |
| Never | `Won't suggest this again.` |
| No database | `Open this page in Claude to answer.` |
| Accepted | `Accepted at <time>. Tomorrow night's brief records it and starts the count.` |
| Ending | `Ending. Tomorrow's brief writes the readout.` |
| Wiki read-only | `Your wiki couldn't be updated tonight, so this starts once it can.` |
| Weekly line | `A trial is waiting for your answer on tonight's brief.` / `Trial: <change>, day <n> of <m>.` |

## Edge cases

- **Two taps in a row.** The first disables the buttons, so only one save goes out.
- **A decision made, then the page reloaded before the next run.** It shows the saved state, not the proposal.
- **A decision saved after the run that would read it has started.** That run doesn't see it. The next one does, and
  a trial's start is the day after the run that records it.
- **Not now, then Don't suggest again on a later proposal of the same test.** `never` wins.
- **The owner asks in chat to bring a declined trial back.** That is the owner's edit to the database through Claude,
  outside this issue.

## How it is built

Decisions made while building it, where the note above left room.

- **The rules are `trials.py`** (stdlib, tested in `test_trials.py`), run before `grade.py` over the same scratch file.
- **A test page opts in** with flat keys, beside #830's: `trial_change` (with `{target}`), `trial_lever` (a logged
  measure and `<=` or `>=`), `trial_target`, `trial_bounds` (`21:45..22:45`), `trial_step`, and optionally
  `trial_days` (`daily`, or `weeknights`), `trial_period` (7 to 21), `trial_better` (`higher` or `lower`), `trial_min`
  and `trial_unit`. The outcome is the test's first `y`, the threshold its `matters` or default, the minimum on-target
  days its `per_side` unless `trial_min` says otherwise.
- **Weeknights** are the days Sunday to Thursday, whose night is followed by a work morning.
- **A test "can't fill on its own"** when it is collecting with enough qualifying days in all but too few in one
  group (`a + b >= total`, `min(a, b) < per_side`).
- **Answers are one document per proposal**, `trials/<proposal id>`, and **End trial** is its own document,
  `trials/<proposal id>-end`, with the same four fields and the trial's own target. A Not now counts for 28 days from
  `decided_at`, inclusive, and is matched by the test's slug, since each night's proposal has a new id.
- **The trial page** is `test-<topic>-trial.md` in the wiki's `syntheses/`, `kind: trial`, `status` `running`, then
  `worked`, `didn't work` or `not enough days`. It has no `grade:` and `grade.py` skips it. `data-findings` lists it
  under `## Trials`, in `### Running` and then `### Finished`.
- **The weekly's line** comes from `trials.py weekly`, from the wiki's running trial and the nightly page's published
  card. The weekly has no database of its own and no buttons.

