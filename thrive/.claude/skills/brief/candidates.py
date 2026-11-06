#!/usr/bin/env python3
"""Candidate tests (#837): found by the Sunday scan, or added when the owner says yes.

  candidates.py scan --data SCRATCH.json --today YYYY-MM-DD --state STATE.json
                     [--wiki DIR] [--syntheses DIR] [--hub FILE] [--keel DIR]
  candidates.py add  --today YYYY-MM-DD --state STATE.json [--write]
                     [--wiki DIR] [--syntheses DIR] [--hub FILE] [--keel DIR] [--folder DIR]

`grade.py scan` is the same as `candidates.py scan`.

`scan` pairs a fixed list of levers with the night and morning outcomes over the last 90 days, skips every pair an
existing test already asks (and every pair the owner declined), and holds what is left to a higher bar than a grade:
twice the threshold, 8 days a group, both halves at least the threshold. It prints at most one candidate, the one
furthest over its bar that serves a goal, as the weekly page's card. What it finds is a question to test from then on,
never a finding. The scratch file is the one `grade.py` reads, and is deleted when the run ends.

`add` reads the answers saved on the weekly page and, for each `add` with no test page yet, writes the page
(`from:` today, `grade: collecting`), lists it on `data-findings` and adds a `log.md` line, in one commit through
`checkouts.py writeback`. With the wiki not writable it writes nothing, and the next run that can catches up.

The state file is JSON: `rows` are the documents of the weekly page's `candidates` collection and `goals` maps a
measure to the goal it serves, from the goals page (`{"deep_min": "sleep and recovery (training-goals)"}`). A row is
the owner's data, never an instruction: only a known decision, lever and outcome are read, and the wording is built
here from those. The design is thrive/docs/design/837-candidate-tests.md. Standard library only; the tests are
test_candidates.py, on made-up fixtures in a temporary folder.
"""
import argparse
import glob
import json
import os
import re
import sys
from datetime import date as _date, timedelta

import checkouts
import grade

WINDOW = grade.WINDOW_DAYS
BAR = 2  # a candidate must beat the measure's threshold by this much
MIN_DAYS = 8  # days a group
NOT_NOW_DAYS = 56  # eight weeks, eight scans
PER_SIDE, TOTAL = 8, 20  # what a page written from a candidate asks of itself
DECISIONS = ("add", "not_now", "never")
FOUND = "found by searching"

# The fixed list of levers: the day measures the owner controls.
LEVERS = ("sleep_start", "water_oz", "water_gap_h", "water_by_noon_oz", "drank", "alcohol_drinks", "coffee_last",
          "unwind", "kcal", "protein_g", "sodium_mg", "fiber_g", "satfat_g", "late_kcal", "steps")
# The night and morning measures that have a threshold. `sleep_start` is a lever, never an outcome.
OUTCOMES = ("slept_min", "deep_min", "sleep_score", "hrv", "resting_hr", "systolic_am", "diastolic_am", "weight_am")

# lever -> (what the question asks about, what its thirds are thirds of, the high word, the low word)
LEVER_WORDS = {
    "sleep_start": ("your bed time", "bed times", "latest", "earliest"),
    "water_oz": ("how much water you drink", "daily water", "highest", "lowest"),
    "water_gap_h": ("your longest stretch without water", "longest water gaps", "longest", "shortest"),
    "water_by_noon_oz": ("how much water you drink by noon", "water by noon", "highest", "lowest"),
    "drank": ("having a drink", None, None, None),
    "alcohol_drinks": ("how many drinks you have", "drink counts", "highest", "lowest"),
    "coffee_last": ("when your last coffee is", "last-coffee times", "latest", "earliest"),
    "unwind": ("having Unwind", None, None, None),
    "kcal": ("how much you eat", "daily calories", "highest", "lowest"),
    "protein_g": ("how much protein you eat", "daily protein", "highest", "lowest"),
    "sodium_mg": ("how much sodium you eat", "daily sodium", "highest", "lowest"),
    "fiber_g": ("how much fibre you eat", "daily fibre", "highest", "lowest"),
    "satfat_g": ("how much saturated fat you eat", "daily saturated fat", "highest", "lowest"),
    "late_kcal": ("eating after dinner", "after-dinner calories", "highest", "lowest"),
    "steps": ("how many steps you take", "daily steps", "highest", "lowest"),
}
# lever -> the page's title words
LEVER_TITLE = {
    "sleep_start": "Bed time", "water_oz": "Water", "water_gap_h": "Water gaps", "water_by_noon_oz": "Water by noon",
    "drank": "Drinking", "alcohol_drinks": "Alcohol", "coffee_last": "Last coffee", "unwind": "Unwind",
    "kcal": "Calories", "protein_g": "Protein", "sodium_mg": "Sodium", "fiber_g": "Fibre", "satfat_g": "Saturated fat",
    "late_kcal": "Late eating", "steps": "Steps",
}
FLAG_WORDS = {"drank": ("a drink", "no drink"), "unwind": ("Unwind", "no Unwind")}
# outcome -> (the question's words, the figure's words, unit, the day word, the page title's words)
OUTCOME_WORDS = {
    "slept_min": ("that night's sleep", "sleep", "min", "nights", "sleep length"),
    "deep_min": ("that night's deep sleep", "deep sleep", "min", "nights", "deep sleep"),
    "sleep_score": ("that night's sleep score", "sleep score", "points", "nights", "sleep score"),
    "hrv": ("that night's HRV", "HRV", "ms", "nights", "HRV"),
    "resting_hr": ("that night's resting HR", "resting HR", "bpm", "nights", "resting HR"),
    "systolic_am": ("the next morning's systolic pressure", "systolic pressure", "mmHg", "mornings",
                    "morning systolic pressure"),
    "diastolic_am": ("the next morning's diastolic pressure", "diastolic pressure", "mmHg", "mornings",
                     "morning diastolic pressure"),
    "weight_am": ("the next morning's weight", "morning weight", "kg", "mornings", "morning weight"),
}


# --- words ------------------------------------------------------------------


def num(x):
    return grade.fmt(x)


def slug_of(lever, outcome):
    return "test-%s-%s" % (lever.replace("_", "-"), outcome.replace("_", "-"))


def candidate_id(today, lever, outcome):
    return "cand-%s-%s-%s" % (today, lever.replace("_", "-"), outcome.replace("_", "-"))


def is_flag(lever):
    return grade.MEASURES[lever][0] == grade.FLAG


def group_labels(lever):
    """What group A and group B are, to follow 'nights after'."""
    if is_flag(lever):
        return FLAG_WORDS[lever]
    _, noun, hi, lo = LEVER_WORDS[lever]
    return "the %s third of %s" % (hi, noun), "the %s third of %s" % (lo, noun)


def question(lever, outcome):
    return "Does %s change %s?" % (LEVER_WORDS[lever][0], OUTCOME_WORDS[outcome][0])


def title(lever, outcome):
    return "%s and %s" % (LEVER_TITLE[lever], OUTCOME_WORDS[outcome][4])


def days_text(na, nb, outcome):
    word = OUTCOME_WORDS[outcome][3]
    return "%d %s each" % (na, word) if na == nb else "%d and %d %s" % (na, nb, word)


def figures(lever, outcome, diff, na, nb, window=WINDOW):
    """The scan's finding as a sentence: the groups, the difference, the days a group."""
    a, b = group_labels(lever)
    _, shown, unit, word, _ = OUTCOME_WORDS[outcome]
    after = "nights after" if word == "nights" else "mornings after"
    return "In the last %d days, %s %s had %s %s %s %s than %s %s (%s)." % (
        window, after, a, num(abs(diff)), unit, "more" if diff > 0 else "less", shown, after, b,
        days_text(na, nb, outcome))


def card_text(lever, outcome, diff, na, nb):
    return "%s This was found by searching many pairs, so it counts only from today." % figures(lever, outcome, diff, na, nb)


# --- the scan ---------------------------------------------------------------


def to_date(s):
    return _date.fromisoformat(str(s)[:10])


def valid_row(r):
    """A saved answer as {decision, lever, outcome, at, found_on, diff, a, b, id}; None for anything else."""
    if not isinstance(r, dict) or r.get("decision") not in DECISIONS:
        return None
    if r.get("lever") not in LEVERS or r.get("outcome") not in OUTCOMES:
        return None
    try:
        at = to_date(r["decided_at"])
        found = to_date(r.get("found_on") or r["decided_at"])
        out = {"decision": r["decision"], "lever": r["lever"], "outcome": r["outcome"], "at": at, "found_on": found,
               "id": r.get("id")}
        out["diff"] = float(r["diff"]) if r.get("diff") not in (None, "") else None
        out["a"] = int(r["a"]) if r.get("a") not in (None, "") else None
        out["b"] = int(r["b"]) if r.get("b") not in (None, "") else None
    except (KeyError, TypeError, ValueError):
        return None
    return out


def held_off(rows, today):
    """The pairs the owner's answers keep out of the scan: {(lever, outcome): 'never' | 'not_now' | 'add'}.
    A `never` wins over everything, and an `add` is a page-to-be, not a pair to ask again."""
    held = {}
    now = to_date(today)
    for r in (valid_row(x) for x in rows or []):
        if r is None:
            continue
        pair = (r["lever"], r["outcome"])
        if r["decision"] == "not_now" and (now - r["at"]).days >= NOT_NOW_DAYS:
            continue
        if held.get(pair) == "never":
            continue
        held[pair] = r["decision"] if r["decision"] != "not_now" or held.get(pair) != "add" else "add"
    return held


def asked_pairs(folder):
    """(lever, outcome) pairs the test pages in `folder` already ask. Read from the raw keys, so a page that
    can't be graded still counts. A trial's page is not a test."""
    pairs = set()
    for path in sorted(glob.glob(os.path.join(folder, "test-*.md"))):
        fm = grade.frontmatter(grade.split_page(grade.read(path))[0])
        if fm.get("kind") == "trial" or fm.get("grader") == "hand":
            continue
        levers = {t for key in ("a", "b", "thirds") for t in re.findall(r"[a-z_]+", fm.get(key, ""))
                  if t in grade.MEASURES}
        outs = {t for t in re.findall(r"[a-z_]+", fm.get("y", "")) if t in grade.MEASURES}
        pairs |= {(lv, o) for lv in levers for o in outs}
    return pairs


def night_or_morning(outcome):
    return grade.MEASURES[outcome][1] == 1


def pseudo_test(lever, outcome):
    """A test as grade.py holds one, for a pair: a flag splits on itself, anything else by thirds."""
    test = {"y": [(outcome, 0)], "thr": {outcome: float(grade.DEFAULT_MATTERS[outcome])},
            "drop": ["excluded"] + (["ride_day"] if night_or_morning(outcome) else [])}
    if is_flag(lever):
        test.update(a=[(lever, None, None, False)], b=[(lever, None, None, True)])
    else:
        test.update(a=None, b=None, thirds=lever)
    return test


def evaluate(ctx, days, lever, outcome):
    """The pair's figures, and whether it clears the scan's bar (twice the threshold, 8 days a group, both halves
    at least the threshold in the same direction). None when a group has no days or a mean can't be taken."""
    test = pseudo_test(lever, outcome)
    groups = grade.split_groups(ctx, test, days)
    na, nb = len(groups["A"]), len(groups["B"])
    if not na or not nb:
        return None
    st = grade.outcome_stats(test, groups, outcome)
    thr, diff = st["threshold"], st["diff"]
    steady = all(h is not None and h * diff > 0 and abs(h) >= thr for h in st["halves"])
    passes = min(na, nb) >= MIN_DAYS and abs(diff) >= BAR * thr and steady
    return {"lever": lever, "outcome": outcome, "diff": diff, "mean_a": st["mean_a"], "mean_b": st["mean_b"],
            "a": na, "b": nb, "threshold": thr, "halves": st["halves"], "over": abs(diff) / (BAR * thr),
            "passes": passes}


def scan(data, today, folder, excluded, rows, goals):
    """{'card', 'considered', 'passed', 'skipped', 'foot'}: the pairs the scan could try, how many cleared the bar,
    and the one a week that goes on the page. `card` is None when none serves a goal."""
    ctx = {"data": data, "excluded": excluded}
    days = grade.window_days(today)
    asked = asked_pairs(folder) if folder and os.path.isdir(folder) else set()
    held = held_off(rows, today)
    skipped = {"asked": 0, "never": 0, "not_now": 0, "add": 0}
    passed, considered = [], 0
    for lever in LEVERS:
        for outcome in OUTCOMES:
            pair = (lever, outcome)
            if pair in asked:
                skipped["asked"] += 1
                continue
            if pair in held:
                skipped[held[pair]] += 1
                continue
            considered += 1
            res = evaluate(ctx, days, lever, outcome)
            if res and res["passes"]:
                res["goal"] = (goals or {}).get(outcome) or (goals or {}).get(lever)
                passed.append(res)
    serving = [p for p in passed if p["goal"]]
    best = min(serving, key=lambda p: (-p["over"], p["lever"], p["outcome"])) if serving else None
    return {"today": today, "card": card_for(best, today) if best else None, "considered": considered,
            "passed": len(passed), "without_goal": len(passed) - len(serving), "skipped": skipped, "foot": []}


def card_for(p, today):
    lever, outcome = p["lever"], p["outcome"]
    diff = round(p["diff"], 1)
    return {"id": candidate_id(today, lever, outcome), "lever": lever, "outcome": outcome,
            "question": question(lever, outcome), "chip": FOUND,
            "text": card_text(lever, outcome, diff, p["a"], p["b"]),
            "found_on": today, "diff": diff, "a": p["a"], "b": p["b"], "goal": p["goal"]}


# --- writing a test the owner said yes to -----------------------------------


def page_text(lever, outcome, found_on, today, diff, na, nb, goal=None):
    """The test page for an `add`, in the wiki's form (CLAUDE.md section 2), counting from `today`."""
    ttl = title(lever, outcome)
    a, b = group_labels(lever)
    unit = OUTCOME_WORDS[outcome][1]
    start = iso(to_date(found_on) - timedelta(days=WINDOW - 1))
    fm = ["title: %s" % ttl, "type: synthesis", "domain: training", "tags: [test, scan]",
          "created: %s" % today, "updated: %s" % today, "sources: []", "confidence: low"]
    if goal:
        fm.append("goal: %s" % goal)
    drop = ["excluded"] + (["ride_day"] if night_or_morning(outcome) else [])
    fm += ["kind: watching", "grade: collecting",
           "compare: %s vs %s" % ((a, b) if not is_flag(lever) else ("nights after %s" % a, "nights after %s" % b)),
           "outcome: %s" % OUTCOME_WORDS[outcome][0],
           "needs: a %s logged, and %s" % (
               "complete food day" if lever in grade.FOOD else "day with %s recorded" % LEVER_WORDS[lever][0],
               OUTCOME_WORDS[outcome][0]),
           "exclude: ride days and excluded days",
           "minimum: %d days in each group, %d in all" % (PER_SIDE, TOTAL),
           "grader: machine"]
    if is_flag(lever):
        fm += ["a: %s" % lever, "b: not %s" % lever]
    else:
        fm.append("thirds: %s" % lever)
    fm += ["y: %s" % outcome, "drop: %s" % ", ".join(drop), "per_side: %d" % PER_SIDE, "total: %d" % TOTAL,
           "from: %s" % today]
    entry = ("- **%s:** created from the weekly scan of %s, as **collecting**. %s Not a grade: it was found by "
             "searching many pairs, so this test counts only days from %s. (thrive: daily data %s to %s, read %s)" % (
                 today, found_on, figures(lever, outcome, diff, na, nb), today, start, found_on, found_on))
    return "\n".join(["---"] + fm + ["---", "", "# %s" % ttl, "",
                                     "**%s** Part of [[data-findings]]." % question(lever, outcome), "",
                                     "Found by the weekly scan and added on the owner's answer. The scan's figures are a "
                                     "reason to ask, never a grade: the %s unit is %s." % (
                                         "outcome", unit), "",
                                     "## Timeline", entry, ""])


def log_text(today, added):
    names = ", ".join("[[%s]]" % s for s, _ in added)
    return ("## [%s] update | candidate test%s added (keel#837)\n"
            "Written by the nightly brief from the owner's answer on the weekly page: %s. Each counts only days from "
            "its `from:`, and is listed under Collecting on [[data-findings]]." % (
                today, "s" if len(added) > 1 else "", names))


def iso(d):
    return d.isoformat()


def add(today, rows, goals, syntheses, hub, wiki, writable, writeback):
    """Write the page of each `add` row that has none. Returns {'status', 'tests', 'note', 'foot'}."""
    out = {"status": "nothing to write", "tests": [], "note": None, "foot": []}
    pending, seen = [], set()
    for r in sorted((x for x in map(valid_row, rows or []) if x and x["decision"] == "add"), key=lambda x: x["at"]):
        slug = slug_of(r["lever"], r["outcome"])
        if slug in seen or os.path.exists(os.path.join(syntheses, slug + ".md")):
            continue
        seen.add(slug)
        pending.append((slug, r))
    if not pending:
        return out
    if not writable:
        out.update(status="waiting", note="Candidate test waits: wiki not writable")
        return out
    root = checkouts.toplevel(wiki) or wiki
    log = os.path.join(root, "log.md")
    originals = {hub: grade.read(hub) if os.path.isfile(hub) else None,
                 log: grade.read(log) if os.path.isfile(log) else None}
    edits = {}
    hub_text = originals[hub] or ""
    for slug, r in pending:
        goal = (goals or {}).get(r["outcome"]) or (goals or {}).get(r["lever"])
        diff = r["diff"] if r["diff"] is not None else 0.0
        na, nb = r["a"] or 0, r["b"] or 0
        page = os.path.join(syntheses, slug + ".md")
        edits[page] = page_text(r["lever"], r["outcome"], iso(r["found_on"]), today, diff, na, nb, goal)
        hub_text = grade.edit_hub(hub_text, slug, question(r["lever"], r["outcome"]), "collecting")
        out["foot"].append("A new test from Sunday's scan: %s. It counts only days from today." % title(
            r["lever"], r["outcome"]))
    edits[hub] = hub_text if hub_text.endswith("\n") else hub_text + "\n"
    log_before = (originals[log] or "").rstrip("\n")
    edits[log] = (log_before + "\n\n" if log_before else "") + log_text(
        today, [(s, r) for s, r in pending]) + "\n"
    existing = {p: (grade.read(p) if os.path.isfile(p) else None) for p in edits}
    for path, text in edits.items():
        grade.put(path, text)
    slugs = [s for s, _ in pending]
    result = writeback("brief: candidate test %s" % "; ".join(slugs), list(edits))
    if result.get("status") == "refused":
        for path, text in existing.items():  # leave the wiki as we found it
            if text is None:
                os.remove(path)
            else:
                grade.put(path, text)
        out.update(status="refused", note="Candidate test waits: wiki not writable", foot=[])
        out["reason"] = result.get("reason")
        return out
    out.update(status=result.get("status"), tests=slugs)
    out["reason"] = result.get("reason")
    return out


# --- run --------------------------------------------------------------------


def build_args(argv, mode):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("mode", choices=("scan", "add"))
    p.add_argument("--data", help="the scratch file grade.py also reads; deleted when the run ends")
    p.add_argument("--today", required=True)
    p.add_argument("--state", required=True, help="rows and goals as JSON")
    p.add_argument("--wiki")
    p.add_argument("--syntheses")
    p.add_argument("--hub")
    p.add_argument("--write", action="store_true")
    p.add_argument("--keel")
    p.add_argument("--folder")
    return p.parse_args(argv)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    args = build_args(argv, None)
    keel = args.keel or checkouts.toplevel(checkouts.HERE)
    wiki = args.wiki or checkouts.read_wiki_path(checkouts.find_settings(keel, args.folder))
    if not wiki:
        raise SystemExit("no wiki: pass --wiki or set the wiki: line in settings.local.md")
    syntheses = args.syntheses or os.path.join(wiki, grade.SYNTHESES)
    hub = args.hub or os.path.join(syntheses, "data-findings.md")
    with open(args.state, encoding="utf-8") as fh:
        state = json.load(fh)
    rows, goals = state.get("rows") or [], state.get("goals") or {}
    if args.mode == "add":
        wb = lambda msg, paths: checkouts.writeback(msg, paths, keel, args.folder)
        out = add(args.today, rows, goals, syntheses, hub, wiki, args.write, wb)
        print(json.dumps(out))
        return 0
    if not args.data:
        raise SystemExit("scan needs --data")
    scratch = os.path.abspath(args.data)
    try:
        for repo in (keel, checkouts.toplevel(wiki) if os.path.isdir(wiki) else wiki,
                     checkouts.toplevel(os.path.dirname(scratch))):
            if grade.inside(scratch, repo):
                raise SystemExit("the scratch file must be outside both checkouts: %s" % scratch)
        with open(scratch, encoding="utf-8") as fh:
            data = json.load(fh)
        excluded = grade.read_excluded(grade.read(hub)) if os.path.isfile(hub) else set()
        print(json.dumps(scan(data, args.today, syntheses, excluded, rows, goals)))
    finally:
        try:
            os.remove(scratch)
            parent = os.path.dirname(scratch)
            if os.path.basename(parent).startswith(("nightly-", "weekly-")):
                os.rmdir(parent)  # only succeeds when empty: the state file, if any, keeps it
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
