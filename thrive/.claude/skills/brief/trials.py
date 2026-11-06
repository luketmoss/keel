#!/usr/bin/env python3
"""Trials, proposed by the nightly brief and accepted on its page (#831).

  trials.py run --data SCRATCH.json --today YYYY-MM-DD --state STATE.json [--write]
                [--wiki DIR] [--syntheses DIR] [--hub FILE] [--keel DIR] [--folder DIR]
  trials.py weekly --today YYYY-MM-DD --state STATE.json [--wiki DIR] [--syntheses DIR]

`run` reads the same scratch file `grade.py` reads (and leaves it for `grade.py`, which deletes it), the wiki's
test and trial pages, and a state file: the rows of the nightly page's `trials` collection, the calendar's
travel and all-day dates, and the goals page's order. It prints one JSON object: the card for the page, the
weekly's one line, and what it wrote. With `--write` it creates an accepted trial's page, writes a finished
trial's readout and moves the trial on `data-findings`, in one commit through `checkouts.py writeback`.

The decisions are code so they are tested on made-up fixtures (test_trials.py) rather than reasoned out again
every night. The wording and states are thrive/docs/design/831-trials.md. Standard library only.
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
import nightly

PERIOD_DEFAULT, PERIOD_MIN, PERIOD_MAX = 14, 7, 21
BASELINE_DAYS = 28
NOT_NOW_DAYS = 28
LOGGED_DAYS = 14  # a measure with a value in the last 14 days is being logged
START_AFTER = 2  # a proposal made tonight starts the day after tomorrow's run
WEEKNIGHTS = (6, 0, 1, 2, 3)  # Sunday to Thursday: the day D whose night is followed by a work morning
RANK = {"strong": 0, "leaning": 1, "cant_fill": 2}
CHIP = {"strong": "Strong", "leaning": "Leaning", "cant_fill": "Can't fill on its own"}
FINAL = ("worked", "didn't work", "not enough days")
SYNTHESES = grade.SYNTHESES


class Bad(ValueError):
    """A page problem, reported by name; the page offers or runs nothing."""


# --- formats ----------------------------------------------------------------

MEASURED = {  # measure -> what the trial is measured by
    "slept_min": "minutes slept", "deep_min": "minutes of deep sleep", "sleep_score": "sleep score",
    "hrv": "HRV", "resting_hr": "resting heart rate", "systolic_am": "morning systolic pressure",
    "diastolic_am": "morning diastolic pressure", "weight_am": "morning weight", "water_oz": "ounces of water",
}
PHRASE = {  # measure -> the figure in a sentence, after the number
    "slept_min": "slept", "deep_min": "of deep sleep", "sleep_score": "sleep score", "hrv": "HRV",
    "resting_hr": "resting HR", "systolic_am": "systolic", "diastolic_am": "diastolic", "weight_am": "morning weight",
    "water_oz": "of water",
}


def num(x):
    return ("%.1f" % x).rstrip("0").rstrip(".")


def hm(minutes):
    h, m = divmod(int(round(minutes)), 60)
    return "%d:%02d" % (h, m)


def figure(measure, v):
    """A value of an outcome as words: slept time as h:mm, the rest with their unit."""
    if measure == "slept_min":
        return hm(v)
    unit = nightly.OUTCOME.get(measure, (None, None, ""))[2]
    return ("%s %s" % (num(v), unit)).strip()


def gap(measure, d):
    """A difference as words: '34 min', '3 ms'."""
    unit = nightly.OUTCOME.get(measure, (None, None, ""))[2]
    return ("%s %s" % (num(abs(d)), unit)).strip()


def night_measure(measure):
    return grade.MEASURES[measure][1] == 1 and grade.MEASURES[measure][2] == grade.SLEEP


def day_word(offer_days, outcome):
    return "nights" if night_measure(outcome) else "days"


def iso(d):
    return d.isoformat()


def to_date(s):
    return _date.fromisoformat(str(s)[:10])


def weekday_name(s):
    return to_date(s).strftime("%A")


def short_date(s):
    d = to_date(s)
    return "%s %d" % (d.strftime("%b"), d.day)


# --- what a test page offers ------------------------------------------------


def parse_value(kind, raw):
    """A target or bound as a number: a time on the night scale in minutes, else a plain number."""
    raw = str(raw).strip()
    if kind == "time":
        if not grade.TIME_RE.match(raw):
            raise Bad("malformed time: %s" % raw)
        return grade.on_night_scale(grade.parse_clock(raw))
    if not grade.NUM_RE.match(raw):
        raise Bad("malformed number: %s" % raw)
    return float(raw)


def to_row_value(kind, v):
    """What a row's `target` holds: HH:MM for a time, a number otherwise."""
    if kind == "time":
        m = int(v) % 1440
        return "%02d:%02d" % (m // 60, m % 60)
    return int(v) if float(v) == int(v) else float(v)


def from_row_value(kind, raw):
    return parse_value(kind, raw)


def show_value(kind, v, unit):
    if kind == "time":
        return nightly.clock_text(v)
    return ("%s %s" % (num(v), unit)).strip()


def offer_from_fm(fm):
    """The trial a test page offers, from its flat `trial_*` keys; None when it offers none; Bad when malformed.

    trial_change: Lights out by {target} on weeknights
    trial_lever: sleep_start <=       # the logged measure the owner pulls, and which side of the target is on target
    trial_target: 22:15               # the default; trial_bounds: 21:45..22:45; trial_step: 15
    trial_days: weeknights            # or daily (the default); trial_period: 14 (7 to 21); trial_min: days
    trial_better: higher              # or lower: which way the outcome should move; trial_unit: oz
    """
    if not fm.get("trial_change"):
        return None
    change = fm["trial_change"]
    if "{target}" not in change:
        raise Bad("trial_change has no {target}")
    m = re.match(r"^([a-z_]+)\s*(<=|>=|<|>)$", fm.get("trial_lever", "").strip())
    if not m or m.group(1) not in grade.MEASURES or grade.MEASURES[m.group(1)][0] == grade.FLAG:
        raise Bad("malformed trial_lever")
    lever, op = m.groups()
    kind = "time" if grade.MEASURES[lever][0] in (grade.TIME, grade.NIGHT_TIME) else "num"
    try:
        lo, hi = fm["trial_bounds"].split("..")
        lo, hi = parse_value(kind, lo), parse_value(kind, hi)
        target = parse_value(kind, fm["trial_target"])
        step = float(fm["trial_step"])
    except (KeyError, ValueError) as e:
        raise Bad("malformed trial target, bounds or step: %s" % e)
    if not lo <= target <= hi or step <= 0:
        raise Bad("trial_target outside trial_bounds, or no step")
    days = fm.get("trial_days", "daily")
    if days not in ("daily", "weeknights"):
        raise Bad("trial_days must be daily or weeknights")
    period = int(fm.get("trial_period", PERIOD_DEFAULT))
    if not PERIOD_MIN <= period <= PERIOD_MAX:
        raise Bad("trial_period must be 7 to 21")
    better = fm.get("trial_better", "higher")
    if better not in ("higher", "lower"):
        raise Bad("trial_better must be higher or lower")
    minimum = int(fm["trial_min"]) if fm.get("trial_min", "").isdigit() else None
    return {"change": change, "lever": lever, "op": op, "kind": kind, "target": target, "lo": lo, "hi": hi,
            "step": step, "days": days, "period": period, "better": better, "min": minimum,
            "unit": fm.get("trial_unit", "")}


def goal_text(fm):
    g = re.sub(r"\s*\([^)]*\)\s*$", "", fm.get("goal", "")).strip()
    return g or None


# --- the proposal -----------------------------------------------------------


def cant_fill(c):
    """A collecting test with enough days in all but too few in one group: its days don't vary on their own."""
    a, b = c["counts"]["a"], c["counts"]["b"]
    return c["grade"] == "collecting" and a + b >= c["total"] and min(a, b) < c["per_side"]


def kind_of(c):
    if c["grade"] in ("strong", "leaning"):
        return c["grade"]
    return "cant_fill" if cant_fill(c) else None


def age_days(today, decided_at):
    return (to_date(today) - to_date(decided_at)).days


def active_trial(rows, pages):
    """A running trial's page, else an accepted row no page carries yet, else None."""
    for p in pages:
        if p["status"] == "running":
            return {"page": p}
    made = {p["proposal"] for p in pages}
    for r in sorted(rows, key=lambda r: r.get("decided_at") or ""):
        if r.get("decision") == "accept" and r.get("id") not in made:
            return {"row": r}
    return None


def calendar_fits(busy, today, period):
    start = to_date(today) + timedelta(days=START_AFTER)
    window = {iso(start + timedelta(days=i)) for i in range(period)}
    return len({b for b in busy or [] if b in window}) * 4 <= period


def why_text(c, kind):
    goal = " Your goal: %s." % c["goal"] if c.get("goal") else ""
    if kind == "cant_fill":
        ps = c["per_side"]
        return ("Your days haven't varied enough on their own to answer this: %d and %d of the %d each side needs. "
                "A trial makes the difference on purpose.%s" % (c["counts"]["a"], c["counts"]["b"], ps, goal))
    o = c.get("primary_outcome")
    if not o:
        return goal.strip()
    n = c["counts"]["a"] + c["counts"]["b"]
    return "%s: %s %s; %s: %s (%d days).%s" % (
        c["a_label"], figure(o["measure"], o["mean_a"]), PHRASE.get(o["measure"], ""), c["b_label"],
        figure(o["measure"], o["mean_b"]), n, goal)


def success_text(c):
    o, off = c["outcome"], c["offer"]
    return "you average %s %s on the %s you hit the target." % (
        gap(o, c["threshold"]), "more" if off["better"] == "higher" else "less",
        "nights" if night_measure(o) else "days")


def proposal_card(c, kind, today):
    off = c["offer"]
    topic = c["slug"][5:] if c["slug"].startswith("test-") else c["slug"]
    days_label = "weeknights" if off["days"] == "weeknights" else "daily"
    return {
        "state": "proposed", "id": "tr-%s-%s" % (today, topic), "slug": c["slug"], "period": off["period"],
        "chip": CHIP[kind], "grade": kind, "changeT": off["change"],
        "kind": off["kind"], "unit": off["unit"], "value": off["target"], "lo": off["lo"], "hi": off["hi"],
        "step": off["step"],
        "why": why_text(c, kind),
        "measured": "%s, %s, against your last %d days." % (MEASURED.get(c["outcome"], c["outcome"]), days_label,
                                                              BASELINE_DAYS),
        "success": success_text(c),
    }


def propose(inp):
    """inp: today, candidates (see run()), logged (measures with a recent value), goal_rank {slug: n}, rows, pages,
    busy (dates with travel or an all-day event). Returns {'card': ... | None, 'skipped': {slug: reason}}."""
    today = inp["today"]
    skipped = {}
    if active_trial(inp.get("rows") or [], inp.get("pages") or []):
        return {"card": None, "skipped": {"*": "a trial is running or accepted"}}
    logged = set(inp.get("logged") or [])
    rows = inp.get("rows") or []
    keep = []
    for i, c in enumerate(inp["candidates"]):
        slug = c["slug"]
        why = None
        rank = (inp.get("goal_rank") or {}).get(slug)
        mine = [r for r in rows if r.get("slug") == slug]
        if rank is None:
            why = "serves no goal on the goals page"
        elif c["offer"]["lever"] not in logged or c["outcome"] not in logged:
            why = "the lever or the outcome isn't logged"
        elif kind_of(c) is None:
            why = "not leaning or strong, and it can fill on its own"
        elif not calendar_fits(inp.get("busy"), today, c["offer"]["period"]):
            why = "travel or all-day events on more than a quarter of its days"
        elif any(r.get("decision") == "never" for r in mine):
            why = "answered Don't suggest again"
        elif any(r.get("decision") == "not_now" and age_days(today, r["decided_at"]) <= NOT_NOW_DAYS for r in mine):
            why = "answered Not now in the last %d days" % NOT_NOW_DAYS
        if why:
            skipped[slug] = why
        else:
            keep.append((rank, RANK[kind_of(c)], i, c))
    if not keep:
        return {"card": None, "skipped": skipped}
    keep.sort(key=lambda r: r[:3])
    c = keep[0][3]
    return {"card": proposal_card(c, kind_of(c), today), "skipped": skipped}


# --- a trial's page ---------------------------------------------------------


def parse_trial_page(path, text):
    lines, body = grade.split_page(text)
    fm = grade.frontmatter(lines)
    slug = os.path.splitext(os.path.basename(path))[0]
    t = {"slug": slug, "path": path, "errors": []}
    try:
        t["status"] = fm.get("status", "running")
        t["proposal"] = fm.get("proposal", "")
        t["change"] = fm.get("change", fm.get("title", slug))
        t["period"] = int(re.match(r"\d+", fm.get("period", "")).group(0))
        t["start"], t["ends"] = fm["start"], fm["ends"]
        m = re.match(r"^([a-z_]+)\s*(<=|>=|<|>)$", fm.get("lever", ""))
        t["lever"], t["op"] = m.groups()
        t["kind"] = "time" if grade.MEASURES[t["lever"]][0] in (grade.TIME, grade.NIGHT_TIME) else "num"
        t["target"] = parse_value(t["kind"], fm["target"])
        t["days"] = fm.get("days", "daily")
        t["outcome"] = fm["outcome"]
        grade.measure_ref(t["outcome"])
        t["better"] = fm.get("better", "higher")
        t["threshold"], t["minimum"] = float(fm["threshold"]), int(fm["minimum"])
        t["test"] = fm.get("test", "")
        t["unit"] = fm.get("unit", "")
    except (KeyError, AttributeError, ValueError, grade.Bad, Bad) as e:
        t["errors"].append(str(e) or "malformed trial page")
        t.setdefault("status", "unreadable")
    return t


def page_text(c, row, today, start, accepted_on):
    """The trial page for an accepted proposal. `c` is its test's candidate, `row` the accept row."""
    off = c["offer"]
    target = min(max(parse_value(off["kind"], row["target"]) if row.get("target") not in (None, "") else off["target"],
                     off["lo"]), off["hi"])
    change = off["change"].replace("{target}", show_value(off["kind"], target, off["unit"]))
    ends = iso(to_date(start) + timedelta(days=off["period"] - 1))
    minimum = off["min"] or c["per_side"]
    fm = [
        "title: %s" % change, "type: synthesis", "domain: training", "tags: [test, trial]",
        "created: %s" % today, "updated: %s" % today, "sources: []", "confidence: low",
    ]
    if c.get("goal"):
        fm.append("goal: %s" % c["goal"])
    fm += [
        "kind: trial", "status: running", "change: %s" % change, "period: %d days" % off["period"],
        "start: %s" % start, "ends: %s" % ends, "target: %s" % to_row_value(off["kind"], target),
        "lever: %s %s" % (off["lever"], off["op"]), "days: %s" % off["days"], "outcome: %s" % c["outcome"],
        "better: %s" % off["better"], "threshold: %s" % num(c["threshold"]), "minimum: %d" % minimum,
        "unit: %s" % off["unit"] if off["unit"] else None, "baseline: %d days before start" % BASELINE_DAYS,
        "test: %s" % c["slug"], "proposal: %s" % row["id"], "accepted: %s" % accepted_on,
    ]
    fm = [f for f in fm if f]
    body = [
        "# %s" % change, "",
        "**A trial of [[%s]]: %s %s for %d days.** The brief proposed it and Luke accepted it on %s. It counts as "
        "working if %s %s %s more on the days the target is met than in the %d days before it, and the target is met "
        "on at least %d of them. Part of [[data-findings]]." % (
            c["slug"], "the target is", show_value(off["kind"], target, off["unit"]), off["period"], accepted_on,
            MEASURED.get(c["outcome"], c["outcome"]), "rises by" if off["better"] == "higher" else "falls by",
            gap(c["outcome"], c["threshold"]), BASELINE_DAYS, minimum),
        "", "## Timeline",
        "- **%s:** accepted on the nightly brief. Starts %s, ends %s. (nightly brief %s)" % (today, start, ends, today),
        "",
    ]
    return "---\n" + "\n".join(fm) + "\n---\n" + "\n".join(body)


def append_timeline(text, entry, status, today):
    lines, body = grade.split_page(text)
    if not lines:
        raise Bad("no frontmatter")
    grade.set_key(lines, "status", status)
    grade.set_key(lines, "updated", today)
    body_lines = body.split("\n")
    at = next((i for i, l in enumerate(body_lines) if re.match(r"^##\s+Timeline\s*$", l)), None)
    if at is None:
        while body_lines and not body_lines[-1].strip():
            body_lines.pop()
        body_lines += ["", "## Timeline", entry, ""]
    else:
        end = next((i for i in range(at + 1, len(body_lines)) if body_lines[i].startswith("#")), len(body_lines))
        while end > at + 1 and not body_lines[end - 1].strip():
            end -= 1
        stop = grade.last_item_end(body_lines, at + 1, end)
        body_lines.insert(end if stop is None else stop, entry)
    return "---\n" + "\n".join(lines) + "\n---\n" + "\n".join(body_lines)


def edit_hub_trials(text, slug, bullet, finished):
    """Put a trial's bullet under `## Trials`: `### Running`, or `### Finished` once it has a result. Removes the
    bullet's earlier place and the `None yet` line."""
    lines = text.split("\n")
    kept, i = [], 0
    mine = re.compile(r"^[-*]\s+(\[\[)?%s(?![\w-])" % re.escape(slug))
    while i < len(lines):
        if mine.match(lines[i]):
            i += 1
            while i < len(lines) and lines[i].strip() and lines[i][0].isspace():
                i += 1
            continue
        if re.match(r"^\*None yet\.\*", lines[i]):
            i += 1
            continue
        kept.append(lines[i])
        i += 1
    at = next((j for j, l in enumerate(kept) if re.match(r"^##\s+Trials\s*$", l)), None)
    if at is None:
        while kept and not kept[-1].strip():
            kept.pop()
        kept += ["", "## Trials"]
        at = len(kept) - 1
    end = next((j for j in range(at + 1, len(kept)) if re.match(r"^##\s", kept[j])), len(kept))
    head = "### Finished" if finished else "### Running"
    sub = next((j for j in range(at + 1, end) if kept[j].strip() == head), None)
    if sub is None:
        while end > at + 1 and not kept[end - 1].strip():
            end -= 1
        kept[end:end] = ["", head, bullet]
    else:
        stop = sub + 1
        while stop < end and not kept[stop].startswith("#"):
            stop += 1
        while stop > sub + 1 and not kept[stop - 1].strip():
            stop -= 1
        kept.insert(stop, bullet)
    return "\n".join(kept).rstrip("\n") + "\n"


# --- reading a trial from the data ------------------------------------------


def trial_day(t, d):
    return t["days"] != "weeknights" or d.weekday() in WEEKNIGHTS


def hits(t, v):
    return {"<=": v <= t["target"], ">=": v >= t["target"], "<": v < t["target"], ">": v > t["target"]}[t["op"]]


def evaluate(t, ctx, last_day):
    """Progress and, once it is over, the result, over the trial's days up to `last_day` (inclusive)."""
    start, end = to_date(t["start"]), to_date(t["ends"])
    last = min(to_date(last_day), end)
    n_days = (last - start).days + 1
    span = [start + timedelta(days=i) for i in range(max(0, n_days))]
    counted = on = 0
    outs = []
    for d in span:
        if not trial_day(t, d) or iso(d) in ctx["excluded"]:
            continue
        lever = grade.value(ctx, iso(d), t["lever"])
        if lever is None:
            continue
        counted += 1
        if hits(t, lever):
            on += 1
            y = grade.value(ctx, iso(d), t["outcome"])
            if y is not None:
                outs.append(y)
    full = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    total = sum(1 for d in full if trial_day(t, d) and iso(d) not in ctx["excluded"])
    base = []
    for i in range(1, BASELINE_DAYS + 1):
        d = start - timedelta(days=i)
        if trial_day(t, d) and iso(d) not in ctx["excluded"]:
            y = grade.value(ctx, iso(d), t["outcome"])
            if y is not None:
                base.append(y)
    mean_on = grade.mean(outs) if outs else None
    mean_base = grade.mean(base) if base else None
    diff = None
    if mean_on is not None and mean_base is not None:
        diff = mean_on - mean_base if t["better"] == "higher" else mean_base - mean_on
    if on < t["minimum"] or diff is None:
        result = "not enough days"
    else:
        result = "worked" if diff >= t["threshold"] else "didn't work"
    return {"counted": counted, "on": on, "total": total, "mean_on": mean_on, "mean_base": mean_base,
            "diff": diff, "result": result, "last": iso(last)}


def count_word(t):
    return "weeknights" if t["days"] == "weeknights" else day_word(t["days"], t["outcome"])


def progress_line(t, ev):
    cw = count_word(t)
    head = "On target %d of %d %s so far" % (ev["on"], ev["counted"], cw)
    if ev["mean_on"] is None:
        return head + "."
    base = "" if ev["mean_base"] is None else ", against %s before" % figure(t["outcome"], ev["mean_base"])
    return "%s · %s on those %s: %s%s" % (
        head, MEASURED.get(t["outcome"], t["outcome"]), day_word(t["days"], t["outcome"]),
        figure(t["outcome"], ev["mean_on"]), base)


def readout_line(t, ev):
    """The figures behind a result, in a sentence."""
    cw = count_word(t)
    if ev["result"] == "not enough days" and ev["on"] < t["minimum"]:
        return "On target %d of %d %s, fewer than the %d it needs for a result." % (ev["on"], ev["total"], cw,
                                                                                    t["minimum"])
    if ev["diff"] is None:
        return "On target %d of %d %s, but there was no baseline to compare with." % (ev["on"], ev["total"], cw)
    more = (ev["mean_on"] - ev["mean_base"]) >= 0
    past = ev["diff"] >= t["threshold"]
    return "On target %d of %d %s · %s %s on them, against %s before: %s %s, %s the %s you set out." % (
        ev["on"], ev["total"], cw, figure(t["outcome"], ev["mean_on"]), PHRASE.get(t["outcome"], ""),
        figure(t["outcome"], ev["mean_base"]), gap(t["outcome"], ev["mean_on"] - ev["mean_base"]),
        "more" if more else "less", "past" if past else "short of", num(t["threshold"]) +
        ("" if t["outcome"] == "slept_min" else " " + nightly.OUTCOME.get(t["outcome"], (0, 0, ""))[2]).rstrip())


def timeline_entry(t, ev, today, early_on):
    when = "ended early on %s" % early_on if early_on else "ended %s" % t["ends"]
    return "- **%s:** **%s** (%s). %s (thrive: daily data %s to %s, read %s)" % (
        today, ev["result"], when, readout_line(t, ev), t["start"], ev["last"], today)


def hub_bullet(t, ev=None, early_on=None):
    if ev is None:
        return "- [[%s]]: %s. Running %s to %s." % (t["slug"], t["change"], t["start"], t["ends"])
    return "- [[%s]]: %s. **%s**%s, %s to %s." % (
        t["slug"], t["change"], ev["result"], " (ended early)" if early_on else "", t["start"], ev["last"])


# --- the card for the page --------------------------------------------------


def running_card(t, ev, today):
    n = max(1, (to_date(today) - to_date(t["start"])).days + 1)
    if to_date(t["start"]) > to_date(today):
        return {"state": "accepted", "id": t["proposal"], "change": t["change"], "period": t["period"],
                "start": weekday_name(t["start"]), "recorded": True}
    return {"state": "running", "id": t["proposal"], "endId": t["proposal"] + "-end", "change": t["change"],
            "day": min(n, t["period"]), "of": t["period"], "line": progress_line(t, ev), "slug": t["test"],
            "target": to_row_value(t["kind"], t["target"])}


def ended_card(t, ev, early_on, pending):
    end_word = "ended early %s" % weekday_name(early_on) if early_on else "ended %s" % weekday_name(t["ends"])
    return {"state": "ended", "id": t["proposal"], "change": t["change"], "end": end_word, "result": ev["result"],
            "line": readout_line(t, ev), "pending": pending}


def weekly_line(card, nightly_url=None):
    """The weekly page's one line, and where it links; None with nothing waiting or running."""
    if not card:
        return None
    st = card.get("state")
    if st == "proposed":
        text = "A trial is waiting for your answer on tonight's brief."
    elif st == "running":
        text = "Trial: %s, day %d of %d." % (card["change"], card["day"], card["of"])
    elif st == "accepted":
        text = "Trial: %s, starts %s." % (card["change"], card.get("start") or "soon")
    else:
        return None
    return {"text": text, "href": nightly_url}


# --- the run ----------------------------------------------------------------


def logged_measures(data, today):
    out = set()
    for i in range(LOGGED_DAYS):
        day = iso(to_date(today) - timedelta(days=i))
        for m, (kind, shift, _) in grade.MEASURES.items():
            if m == "excluded":
                continue
            ctx = {"data": data, "excluded": set()}
            if grade.value(ctx, day, m) is not None:
                out.add(m)
    return out


def candidate(test, res, fm, graded=True):
    """A test page, its graded result and its frontmatter as a candidate; None when it offers no trial.
    `graded=False` skips the grade checks: enough to build the page of a trial already accepted."""
    if test["grader"] == "hand" or test["errors"]:
        return None
    if graded and (res["ungraded"] or res.get("grade") is None):
        return None
    try:
        offer = offer_from_fm(fm)
    except Bad:
        return None
    if offer is None or not test["y"] or test["y"][0][1]:
        return None
    outcome = test["y"][0][0]
    res = res or {}
    o = next((o for o in res.get("outcomes") or [] if o["measure"] == outcome), None)
    return {
        "slug": test["slug"], "title": test["title"], "grade": res.get("display_grade"), "counts": res.get("counts"),
        "per_side": test["per_side"], "total": test["total"], "outcome": outcome, "threshold": test["thr"].get(outcome),
        "primary_outcome": o if o and o.get("mean_a") is not None and o.get("mean_b") is not None else None,
        "a_label": res.get("a_label") or test.get("a_text"), "b_label": res.get("b_label") or test.get("b_text"),
        "goal": goal_text(fm), "offer": offer,
    }


def load_trial_pages(folder):
    pages = []
    for path in sorted(glob.glob(os.path.join(folder, "test-*.md"))):
        text = grade.read(path)
        lines, _ = grade.split_page(text)
        if grade.frontmatter(lines).get("kind") == "trial":
            pages.append(parse_trial_page(path, text))
    return pages


def run(data, today, state, tests, fms, results, pages, excluded, hub_text, writable=False, hub=None,
        writeback=None):
    """Returns {'card', 'weekly', 'write', 'foot', 'note', 'skipped'}. Edits are written only when `writable`."""
    ctx = {"data": data, "excluded": excluded}
    rows = state.get("rows") or []
    by_id = {r.get("id"): r for r in rows}
    foot, edits, written = [], {}, []
    out = {"card": None, "weekly": None, "foot": foot, "note": None, "skipped": {},
           "write": {"status": "not asked", "trials": []}}
    for t in pages:
        if t["errors"]:
            foot.append("%s can't be read: %s." % (t["slug"], t["errors"][0]))
    live = [p for p in pages if not p["errors"]]
    hub_now, note = hub_text, None

    # 1. a running trial that is over, or that the owner ended, gets its readout
    ended_now = None
    for t in [p for p in live if p["status"] == "running"]:
        end_row = by_id.get(t["proposal"] + "-end")
        early_on = None
        if end_row and to_date(end_row["decided_at"]) < to_date(t["ends"]):
            early_on = iso(to_date(end_row["decided_at"]))
        if not (end_row or to_date(today) > to_date(t["ends"])):
            continue
        ev = evaluate(t, ctx, early_on or t["ends"])
        if writable:
            edits[t["path"]] = append_timeline(grade.read(t["path"]), timeline_entry(t, ev, today, early_on),
                                               ev["result"], today)
            hub_now = edit_hub_trials(hub_now, t["slug"], hub_bullet(t, ev, early_on), True)
            written.append(t["slug"])
            t["status"] = ev["result"]
        else:
            note = "Trial readout waits: wiki not writable"
        ended_now = ended_card(t, ev, early_on, pending=not writable)

    # 2. an accepted proposal with no page yet becomes one, starting the day after this run
    made = {p["proposal"] for p in live}
    created = waiting = None
    for r in sorted(rows, key=lambda r: r.get("decided_at") or ""):
        if r.get("decision") != "accept" or r.get("id") in made or any(p["status"] == "running" for p in live):
            continue
        slug = r.get("slug")
        c = candidate(tests[slug], None, fms[slug], graded=False) if slug in tests else None
        if c is None:
            foot.append("An accepted trial couldn't be started: its test page can't offer one now.")
            continue
        has_target = r.get("target") not in (None, "")
        target = min(max(from_row_value(c["offer"]["kind"], r["target"]) if has_target else c["offer"]["target"],
                         c["offer"]["lo"]), c["offer"]["hi"])
        if writable:
            start = iso(to_date(today) + timedelta(days=1))
            path = os.path.join(os.path.dirname(tests[slug]["path"]), slug + "-trial.md")
            text = page_text(c, r, today, start, iso(to_date(r["decided_at"])))
            edits[path] = text
            t = parse_trial_page(path, text)
            hub_now = edit_hub_trials(hub_now, t["slug"], hub_bullet(t), False)
            created = t
            written.append(t["slug"])
        else:
            waiting = {"state": "accepted", "id": r["id"], "waits": True, "recorded": False, "start": None,
                       "period": c["offer"]["period"],
                       "change": c["offer"]["change"].replace(
                           "{target}", show_value(c["offer"]["kind"], target, c["offer"]["unit"]))}
            note = "Trial waits: wiki not writable"
        break

    # 3. the one card
    running = [p for p in live if p["status"] == "running"]
    if ended_now:
        out["card"] = ended_now
    elif created:
        out["card"] = {"state": "accepted", "id": created["proposal"], "change": created["change"],
                       "period": created["period"], "start": weekday_name(created["start"]), "recorded": True}
    elif waiting:
        out["card"] = waiting
    elif running:
        out["card"] = running_card(running[0], evaluate(running[0], ctx, today), today)
    else:
        cands = [c for s, t in tests.items() for c in [candidate(t, results[s], fms[s])] if c]
        res = propose({"today": today, "candidates": cands, "logged": sorted(logged_measures(data, today)),
                       "goal_rank": state.get("goal_rank") or {}, "rows": rows, "pages": live,
                       "busy": state.get("busy") or []})
        out["card"], out["skipped"] = res["card"], res["skipped"]
    out["weekly"] = weekly_line(out["card"], state.get("nightly_url"))
    out["note"] = note

    if edits:
        if hub and hub_now != hub_text:
            edits[hub] = hub_now
        originals = {p: (grade.read(p) if os.path.isfile(p) else None) for p in edits}
        for path, text in edits.items():
            grade.put(path, text)
        res = writeback("brief: trial %s" % "; ".join(written), list(edits))
        if res.get("status") == "refused":
            for path, text in originals.items():  # leave the wiki as we found it
                if text is None:
                    os.remove(path)
                else:
                    grade.put(path, text)
            out["write"] = {"status": "refused", "reason": res.get("reason"), "trials": []}
            out["note"] = "Trial waits: wiki not writable"
        else:
            out["write"] = {"status": res.get("status"), "reason": res.get("reason"), "trials": written}
    return out


def build(data, today, state, folder, hub, write, wiki, keel, folder_arg):
    """Reads the wiki, grades the tests (as grade.py does) and calls run()."""
    excluded = grade.read_excluded(grade.read(hub)) if os.path.isfile(hub) else set()
    tests, fms = {}, {}
    for path in sorted(glob.glob(os.path.join(folder, "test-*.md"))):
        text = grade.read(path)
        lines, _ = grade.split_page(text)
        fm = grade.frontmatter(lines)
        if fm.get("kind") == "trial":
            continue
        t = grade.parse_test(path, text)
        tests[t["slug"]], fms[t["slug"]] = t, fm
    ctx = {"data": data, "excluded": excluded}
    failed = set(data.get("failed") or [])
    results = {s: grade.grade_test(ctx, t, today, failed) for s, t in tests.items()}
    pages = load_trial_pages(folder)
    wb = lambda msg, paths: checkouts.writeback(msg, paths, keel, folder_arg)
    return run(data, today, state, tests, fms, results, pages, excluded, grade.read(hub) if os.path.isfile(hub) else "",
               writable=write, hub=hub, writeback=wb)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("mode", choices=("run", "weekly"))
    p.add_argument("--data", help="the scratch file grade.py also reads; left for grade.py to delete")
    p.add_argument("--today", required=True)
    p.add_argument("--state", required=True, help="rows, busy, goal_rank, nightly_card, nightly_url as JSON")
    p.add_argument("--wiki")
    p.add_argument("--syntheses")
    p.add_argument("--hub")
    p.add_argument("--write", action="store_true")
    p.add_argument("--keel")
    p.add_argument("--folder")
    args = p.parse_args(argv)
    keel = args.keel or checkouts.toplevel(checkouts.HERE)
    wiki = args.wiki or checkouts.read_wiki_path(checkouts.find_settings(keel, args.folder))
    if not wiki:
        raise SystemExit("no wiki: pass --wiki or set the wiki: line in settings.local.md")
    folder = args.syntheses or os.path.join(wiki, SYNTHESES)
    hub = args.hub or os.path.join(folder, "data-findings.md")
    with open(args.state, encoding="utf-8") as fh:
        state = json.load(fh)
    if args.mode == "weekly":
        card = state.get("nightly_card")
        running = [t for t in load_trial_pages(folder) if t["status"] == "running" and not t["errors"]]
        if running and not (card and card.get("state") in ("running", "accepted")):
            t = running[0]
            n = (to_date(args.today) - to_date(t["start"])).days + 1
            card = {"state": "running", "change": t["change"], "day": max(1, min(n, t["period"])), "of": t["period"]} \
                if n >= 1 else {"state": "accepted", "change": t["change"], "start": weekday_name(t["start"])}
        print(json.dumps({"trial": weekly_line(card, state.get("nightly_url"))}))
        return 0
    scratch = os.path.abspath(args.data)
    for repo in (keel, checkouts.toplevel(wiki) if os.path.isdir(wiki) else wiki, checkouts.toplevel(os.path.dirname(scratch))):
        if grade.inside(scratch, repo):
            raise SystemExit("the scratch file must be outside both checkouts: %s" % scratch)
    with open(scratch, encoding="utf-8") as fh:
        data = json.load(fh)
    print(json.dumps(build(data, args.today, state, folder, hub, args.write, wiki, keel, args.folder)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
