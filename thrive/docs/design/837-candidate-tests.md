# 837 — Candidate tests, found on Sundays or asked by the owner

Specifies [#837](https://github.com/luketmoss/keel/issues/837), part of epic
[#834](https://github.com/luketmoss/keel/issues/834). The definition keys, measures and grading are
[`830-data-findings.md`](830-data-findings.md). The card sits on the weekly page
([`832-weekly-rework.md`](832-weekly-rework.md)) and saves the way #831's trial card does
([`831-trials.md`](831-trials.md)). Every figure is made up, and nothing here introduces a token.

## The Sunday scan

Run by the weekly brief, after the grading.

1. **Pairs.** Every **lever** paired with every **outcome**, within one fixed list each:
   - **Levers:** the day measures the owner controls: `sleep_start`, `water_oz`, `water_gap_h`, `water_by_noon_oz`,
     `drank`, `alcohol_drinks`, `coffee_last`, `unwind`, `kcal`, `protein_g`, `sodium_mg`, `fiber_g`, `satfat_g`,
     `late_kcal`, `steps`
   - **Outcomes:** the night and morning measures
   - A pair an existing test already asks (same lever, same outcome) is skipped.
2. **Groups.** A flag splits on itself; a number or time splits by `thirds`. `drop: excluded`, plus `ride_day` when the
   outcome is a night or morning measure.
3. **The bar is higher than a grade's,** because searching many pairs finds chance differences:
   - the difference is at least **twice** the measure's threshold
   - each group has at least 8 days
   - the window's two halves agree in sign, each at least the threshold
4. **One a week at most:** the pair furthest over its bar that serves a goal on the goals page. None passing: no card.

The scan's figures are a reason to ask, never a grade. A test it proposes counts only days from the day its page is
written (`from:`).

## The card, on the weekly page

After the grades that moved:

```
A QUESTION WORTH TESTING                        found by searching
Does eating more after dinner cost deep sleep?
In the last 90 days, nights after the top third of after-dinner calories had 14 min less deep sleep than the bottom
third (22 nights each). Found by looking through many pairs, so it counts only from today.

[ Add this test ]   [ Not now ]   [ Don't suggest again ]
```

- The page declares `db` and `user` with owner-only writes on `candidates`. One document per proposal,
  `candidates/<id>`, with `decision` (`add`, `not_now`, `never`), `decided_at`, and the pair.
- The states, failure and no-database lines follow #831's card:
  - `Added. Tomorrow night's brief writes the page.`
  - `Not now. It won't come back for 8 weeks.`
  - `Won't suggest this again.`
  - `Couldn't save. Try again.`
  - `Open this page in Claude to answer.`
- `not_now` holds the pair off for 8 weeks (eight scans); `never` is permanent.

## Writing the page

The next nightly run that can write the wiki reads the weekly page's `candidates` with `ArtifactData`. For an `add` row,
it writes `wiki/syntheses/test-<topic>.md` in §2's form:
- the prose fields in plain words
- the definition keys, with `from:` the day it is written
- `grade: collecting`
- a first Timeline entry: `created from the weekly scan of <date>`, with the scan's figures as the reason it was asked,
  marked as not a grade

It lists the page under *Collecting* on `data-findings` and appends a `log.md` line, in one `writeback` commit. With the
wiki not writable, it waits for the next run that can write.

## The owner's own question

A wiki command, `/add-test <question>`, in the owner's wiki (wiki side):
1. It drafts a test page from the question in the same form, with the definition keys drawn only from #830's measures.
2. It runs `grade.py check` on the draft, and shows the draft and the check in chat.
3. It writes the page only on the owner's yes.

An owner's question isn't found by searching, so it has no `from:` unless the owner asks for one. A question no
measure can express is said plainly, and the command offers a `grader: hand` page instead.

`grade.py check <page>` validates one page's keys and measures and prints what it would group, writing nothing.

## How it is built

Decisions made while building it, where the note above left room.

- **The rules are `candidates.py`** (stdlib, tested in `test_candidates.py`); `grade.py scan` runs its `scan`, and
  `grade.py check` is in `grade.py`. `candidates.py add` is the nightly's write, run before `trials.py` and `grade.py`.
- **Only a pair that serves a goal is offered.** Outcomes are the night and morning measures that have a threshold
  (`sleep_start` is a lever, not an outcome). The skill passes `goals`, a map from a measure to the goal it serves,
  read from the goals page; a pair serves a goal when its lever or its outcome is in the map. The furthest over its bar
  is `|difference| / (2 x threshold)`.
- **A pair is "asked" by the raw keys of a test page** (`a`, `b`, `thirds` for the lever, `y` for the outcome), so a
  page that can't be graded still counts. A trial's page and a `grader: hand` page ask nothing.
- **Answers** are one document per card, `candidates/<id>`, `cand-<date>-<lever>-<outcome>`, holding `decision`,
  `decided_at`, `lever`, `outcome`, `found_on`, `diff`, `a` and `b` (days a group). The page text is rebuilt from the
  lever, the outcome and those numbers; no text from a row is written anywhere. A `never` always wins, a `not_now` holds
  a pair for 56 days from `decided_at`, and an `add` keeps the pair out of the scan.
- **The page** is `test-<lever>-<outcome>` with hyphens, `kind: watching`, `grade: collecting`, `per_side: 8`,
  `total: 20`, `from:` the day it is written and `drop: excluded, ride_day`. A flag lever writes `a` and `b`, a number
  `thirds`. The index is not touched by the nightly: the issue names `data-findings` and `log.md`.
- **`grade.py check PAGE`** prints one JSON object (`ok`, `errors`, `groups`, `outcomes`) and exits 1 on any error. It
  keeps going after the first problem so it reports all of them.
