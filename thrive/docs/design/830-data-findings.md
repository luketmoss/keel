# 830 — Grading the wiki's tests, and *What your data says*

Specifies [#830](https://github.com/luketmoss/keel/issues/830), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). It adds a section to the nightly page
([`829-nightly-brief.md`](829-nightly-brief.md)) in that page's visual language, and a morning outlook to its *Next 5
days*. The test pages and their format are the owner's private wiki (`CLAUDE.md` §2, *Data findings*), which this
issue extends there. Every figure, threshold example and page excerpt below is made up. No document here is standing,
and the brief templates own their tokens, so nothing here introduces one.

## The definition, on each test page

The prose fields stay as they are (`compare`, `outcome`, `needs`, `exclude`, `minimum`): they are the question in
words. Beside them, flat frontmatter keys say the same thing so a script can read it. They are one `key: value` a line,
so a stdlib parser reads them without YAML:

```yaml
grader: machine            # machine | hand
a: sleep_start <= 22:30    # group A: a condition on the day
b: sleep_start >= 23:00    # group B (or: thirds: <measure>)
y: slept_min, sleep_score  # outcomes; "+1" = a day later, e.g. resting_hr+1
drop: ride_day, excluded   # days left out
per_side: 8
total: 20
matters: slept_min 20, sleep_score 3   # optional: the smallest difference that counts
from: 2026-11-05           # optional: days before this don't count
```

- **`a` and `b`** are each a condition: `<measure> <op> <value>` (`<`, `<=`, `>`, `>=`, `=`), a flag (`ride_day`), or
  `not <flag>`, joined by `and`.
- **`thirds: <measure>`** in place of `a`/`b` compares the top third of qualifying days with the bottom third. Ties at
  a boundary go to the middle third, which is not compared.
- **Values** are numbers or `HH:MM` local times.
- **A day's night measures are the night after it** and its morning measures the morning after, the way the
  questions are asked: "a drink on D, deep sleep that night". `+1` moves an outcome one day later: the second morning.
- **`grader: hand`**: the script reads the page's own grade and never writes it. Its page explains why.
- **The wiki's `CLAUDE.md` §2** documents these keys, and each of the eleven pages gets them in the same commit. That
  is the wiki side of this issue. `test-calories-weight-trend` (weeks, not days) and `test-protein-next-lift` (an
  outcome graded by the block page's rules) are `grader: hand`.

### Measures

The script knows these, and only these. A page naming any other is reported `unknown measure` and not graded.

| Kind | Measures |
|---|---|
| Night after D | `slept_min`, `deep_min`, `sleep_score`, `sleep_start` (COROS bed time), `hrv`, `resting_hr` |
| Morning after D | `systolic_am`, `diastolic_am` (first reading before 10:00), `weight_am` (first scale reading before noon) |
| Day D, Thrive | `steps`, `training_load`, `stress_avg`, `ride_day`, `lift_day`, `rest_day` (no completed session) |
| Day D, drinks | `water_oz`, `water_gap_h` (#827), `water_by_noon_oz` (#827), `alcohol_drinks`, `drank` (alcohol logged), `coffee_cups`, `coffee_last` (time of the last coffee), `unwind` (logged), `unwind_mg` |
| Day D, food | `complete_day` (Breakfast, Lunch and Dinner each logged), `kcal`, `protein_g`, `sodium_mg`, `fiber_g`, `satfat_g`, `late_kcal` (Dinner plus After dinner, #826) |
| Flags | `excluded`: a date on the wiki's excluded-days list (below) |

**A missing value is missing.** A day lacking any measure its `a`, `b`, `thirds` or `y` names doesn't qualify. "No
drink logged" counts as `not drank` only on a day with some drink logged, because an unlogged day is unknown, never dry.
A food measure qualifies only on a `complete_day`.

**Excluded days** (travel, illness, a blood donation) are a list on the wiki's `data-findings` page, under `##
Excluded days`, one `- YYYY-MM-DD: reason` a line. That is the wiki side too. The data can't see them, and the owner
names them.

## The grading rule

The same on every run, for each `machine` test, over the run's window of 90 days:

1. **Qualifying days:** the measures present, not dropped, on or after `from`.
2. **Groups:** A and B by their conditions, or the top and bottom thirds.
3. **Per outcome:** the difference of the means, A minus B, and the threshold that counts. The page's `matters`, or the
   script's default for that measure:

   | Measure | Default |
   |---|---|
   | `slept_min` | 20 min |
   | `deep_min` | 8 min |
   | `sleep_score` | 3 |
   | `hrv` | 3 ms |
   | `resting_hr` | 2 bpm |
   | `water_oz` | 6 oz |
   | `systolic_am` | 4 mmHg |
   | `diastolic_am` | 3 mmHg |
   | `weight_am` | 0.5 kg |

4. **The grade:**
   - **blocked:** a named measure has no value on any day of the window: the data can't answer it yet.
   - **collecting:** either group below `per_side`, or both together below `total`.
   - **ruled-out:** every outcome's difference is under its threshold.
   - **strong:** an outcome's difference is at or over its threshold, each group has at least twice `per_side`, and the
     window's earlier and later halves of qualifying days each show a difference of the same sign of at least half the
     threshold.
   - **leaning:** an outcome's difference is at or over its threshold, but it isn't strong.

The halves check is the guard against a coincidence: a real effect shows in both halves of the window, and one
lucky week doesn't. The thresholds are where "small" stops. Neither is re-tuned per run.

**A grade moves only when it holds.** The run grades three windows, ending today, yesterday and the day before. It
writes a new grade only when all three agree on it, so a test on the edge doesn't flip every night. The three windows
come from the same scratch data; no state is kept between runs.

## What is written, and where

Only grade changes, through #835's `writeback`, in one commit per run:
- the test page's `grade:` and `updated:`
- a Timeline entry appended in §2's form:
  `- **2026-11-20:** **collecting → leaning**. 9 days at 6 h or more averaged 45 oz; 31 shorter days averaged 53 oz. (thrive: daily summary 2026-08-23 to 2026-11-20, read 2026-11-20)`
- the test moved to its new section on `data-findings`

Never daily values or series, never progress counts. With the wiki not writable this run, nothing is written. The page
still shows tonight's grades, and the next run that can write catches up, because the three-window rule still holds.

## The run

- **The skill** gathers the window into one JSON scratch file in the run's own temporary folder, outside both checkouts,
  deleted when the run ends, whether it succeeded or not. It holds one object a date with the measures above, built
  from:
  - `thrive_daily_health` and `thrive_daily_summary`
  - `thrive_drinks` entries, for `coffee_last`
  - completed workouts
  - body measurements
  - `forage_food_log` in three 31-day reads
- **A source that fails** leaves its measures missing. The tests that need it report `collecting` or `blocked` tonight,
  and **no grade is written** for a test whose measures came from a failed source. The foot names the source.
- **`grade.py`** (stdlib, in the skill folder, tested in the `brief` CI job #835 adds) reads the scratch file and the
  test pages. It prints one JSON result a test: grade, page grade, whether it moved, counts per group, differences and
  the halves, and progress for collecting tests. With `--write` it makes the changes above.

## On the nightly page: *What your data says*

Between Today and Next 5 days, with the aside `<first date> to <today> · <n> nights`.

**Which findings.** At most three cards, chosen in this order:
1. a test whose grade moved tonight
2. a **strong** or **leaning** test that touches tonight or the next five days, by its `a`/`b`/`thirds` measure:

   | Measure | Touches when |
   |---|---|
   | `sleep_start` | always (tonight's bed-by) |
   | `ride_day` | a ride is planned in the next five days |
   | `drank` | alcohol is logged today |
   | `water_gap_h`, `water_oz` | today's gap is 6 h or more, or water is under goal |
   | `sodium_mg` | the week's sodium is over goal |
   | `late_kcal` | After dinner has an entry today |
   | `unwind` | Unwind is logged today |

Strong before leaning, then the goals page's order. None that touch: the section shows the strongest one, so it is
never empty while any test is graded.

**A card.**
- **The chip** is the grade and its days: `Strong · 40 nights`, `Leaning · 6 nights each`.
- **The heading** is the page's title, and its first line is the page's bold lead sentence.
- **The comparison**: one pair of bars an outcome, A against B, with the means and the group names from `a` and `b`
  (`Asleep by 10:30` / `After 11:00`).
- **A "So:" line** saying what it means tonight or for the day it touches. For example *So: Sunday's ride puts Monday's
  resting HR up. That's the ride, not a warning.*
- A moved grade says so above the chip: `New tonight: leaning → strong`.
- Every card says the grade is from the owner's data, and the foot keeps *not medical advice*.

**Tests in progress.** One card after the findings, listing every collecting and blocked test:
- a collecting test: its title, a progress meter and count (`7 of 10`, or `3 + 4 of 6 + 6` for two groups)
- a blocked test: what it's waiting for, in its page's words

Counts are live and never written.

**Hand-graded tests** appear with their page grade and `hand-graded` on the chip, and are never chosen for a card
unless strong or leaning.

## Morning outlook, on *Next 5 days*

On a day row, one line under the bed-by, with the outlook icon, when a **strong** test has a morning outcome (`hrv`,
`resting_hr`, or their `+1`) and its group-A condition is a session planned the day before:

`Monday will read high: resting HR runs about 4 bpm over after a ride, back by Tuesday.`

The figure is the test's difference, rounded. "Back by" appears only when the `+1` outcome is under its threshold.
Leaning tests make no outlook. A day with none has no line.

## Moves that rest on a finding

#829's moves keep their triggers. When a move's measure is a strong or leaning test's `a`/`b` measure, its line adds
the finding: `Drinking nights brought 15 min less deep sleep (6 nights each, leaning).` The drink move is the first
case.

## Copy

| Where | String |
|---|---|
| Section heading | `What your data says` |
| Chip | `Strong · <n> nights`, `Leaning · <n> nights each`, `Hand-graded` |
| Moved | `New tonight: <old> → <new>` |
| In progress | `Tests in progress` / `<n> of <m>` / `Waiting for <what>` |
| Source failed (foot) | `Not graded tonight: <source> couldn't be read.` |
| Unknown measure (foot) | `<test title> names a measure the brief doesn't know: <measure>.` |
