#!/usr/bin/env python3
"""Grade the wiki's tests the same way every run (#830).

  grade.py --data SCRATCH.json --today YYYY-MM-DD [--write] [--wiki DIR]
           [--syntheses DIR] [--hub FILE] [--keel DIR] [--folder DIR]

Reads a scratch file of made-up-or-real daily measures (one object a date) and the
wiki's `test-*.md` pages, and prints one JSON result: a grade a test, whether it moved,
the groups, the differences, the halves, and progress for collecting tests. With
`--write` it writes only grade changes, in one commit through `checkouts.py writeback`.
The scratch file is deleted when the run ends, after a failed run too, and must sit
outside the Keel and wiki checkouts.

The definition keys, measures and the grading rule are
thrive/docs/design/830-data-findings.md. Standard library only; the tests are
test_grade.py, on made-up fixtures in a temporary folder.
"""
import argparse
import glob
import json
import os
import re
import sys
from datetime import date as _date, timedelta

import checkouts

NIGHT_START = 12 * 60  # the scale starts at noon, as in nightly.py
WINDOW_DAYS = 90
WINDOWS = 3  # windows ending today, yesterday and the day before

# measure -> (kind, days after D it is read from, source). Night and morning measures of day D
# are the night and morning after it, so they are read from D + 1.
NUM, FLAG, TIME, NIGHT_TIME = "num", "flag", "time", "night_time"
SLEEP, BODY, SUMMARY, WORKOUTS, DRINKS, FORAGE = (
    "Thrive sleep", "Thrive body", "Thrive daily summary", "Thrive workouts", "Thrive drinks", "Forage")
MEASURES = {
    "slept_min": (NUM, 1, SLEEP), "deep_min": (NUM, 1, SLEEP), "sleep_score": (NUM, 1, SLEEP),
    "sleep_start": (NIGHT_TIME, 1, SLEEP), "hrv": (NUM, 1, SLEEP), "resting_hr": (NUM, 1, SLEEP),
    "systolic_am": (NUM, 1, BODY), "diastolic_am": (NUM, 1, BODY), "weight_am": (NUM, 1, BODY),
    "steps": (NUM, 0, SUMMARY), "training_load": (NUM, 0, SUMMARY), "stress_avg": (NUM, 0, SUMMARY),
    "ride_day": (FLAG, 0, WORKOUTS), "lift_day": (FLAG, 0, WORKOUTS), "rest_day": (FLAG, 0, WORKOUTS),
    "water_oz": (NUM, 0, SUMMARY), "water_gap_h": (NUM, 0, SUMMARY), "water_by_noon_oz": (NUM, 0, SUMMARY),
    "alcohol_drinks": (NUM, 0, SUMMARY), "drank": (FLAG, 0, SUMMARY), "coffee_cups": (NUM, 0, SUMMARY),
    "coffee_last": (TIME, 0, DRINKS), "unwind": (FLAG, 0, SUMMARY), "unwind_mg": (NUM, 0, SUMMARY),
    "complete_day": (FLAG, 0, FORAGE), "kcal": (NUM, 0, FORAGE), "protein_g": (NUM, 0, FORAGE),
    "sodium_mg": (NUM, 0, FORAGE), "fiber_g": (NUM, 0, FORAGE), "satfat_g": (NUM, 0, FORAGE),
    "late_kcal": (NUM, 0, FORAGE),
    "excluded": (FLAG, 0, None),
}
FOOD = {"kcal", "protein_g", "sodium_mg", "fiber_g", "satfat_g", "late_kcal"}
DEFAULT_MATTERS = {
    "slept_min": 20, "deep_min": 8, "sleep_score": 3, "hrv": 3, "resting_hr": 2,
    "water_oz": 6, "systolic_am": 4, "diastolic_am": 3, "weight_am": 0.5,
}
GRADES = ("blocked", "collecting", "ruled-out", "leaning", "strong")
OPS = ("<=", ">=", "<", ">", "=")
NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")
TIME_RE = re.compile(r"^\d{1,2}:\d{2}$")
SYNTHESES = os.path.join("wiki", "syntheses")


class Bad(ValueError):
    """A page problem, reported by name and not graded."""


# --- pages ------------------------------------------------------------------


def split_page(text):
    """(frontmatter lines, body) of a page; frontmatter is [] without a leading --- block."""
    lines = text.split("\n")
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return lines[1:i], "\n".join(lines[i + 1:])
    return [], text


def frontmatter(lines):
    """Flat `key: value` lines, a trailing ` # comment` dropped. No YAML."""
    out = {}
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        out[key.strip()] = value
    return out


def page_title(fm, body, slug):
    if fm.get("title"):
        return fm["title"].strip("\"'")
    m = re.search(r"^#\s+(.+)$", body, re.M)
    return m.group(1).strip() if m else slug


def page_lead(body):
    """The first bold sentence of the body."""
    m = re.search(r"\*\*(.+?)\*\*", body, re.S)
    return " ".join(m.group(1).split()) if m else None


def listed(value):
    return [p.strip() for p in (value or "").split(",") if p.strip()]


def parse_clock(text):
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def on_night_scale(minutes):
    return minutes + 1440 if minutes < NIGHT_START else minutes


def measure_ref(text):
    """'resting_hr+1' -> ('resting_hr', 1); raises Bad for an unknown measure."""
    base, plus = text, 0
    if text.endswith("+1"):
        base, plus = text[:-2], 1
    if base not in MEASURES:
        raise Bad("unknown measure: %s" % text)
    return base, plus


def parse_condition(text):
    """A condition as [(measure, op, value, negated)]; raises Bad on an unknown measure or a malformed term.
    A term is `<measure> <op> <value>`, a flag, or `not <flag>`, joined by `and`."""
    terms = []
    for part in re.split(r"\s+and\s+", text.strip()):
        part = part.strip()
        if not part:
            raise Bad("malformed condition: %s" % text)
        neg = False
        if part.startswith("not "):
            neg, part = True, part[4:].strip()
        m = re.match(r"^([a-z_]+)\s*(<=|>=|<|>|=)\s*(\S+)$", part)
        if m:
            name, op, raw = m.groups()
            if name not in MEASURES:
                raise Bad("unknown measure: %s" % name)
            kind = MEASURES[name][0]
            if neg or kind == FLAG:
                raise Bad("malformed condition: %s" % text)
            if kind == NUM and NUM_RE.match(raw):
                value = float(raw)
            elif kind in (TIME, NIGHT_TIME) and TIME_RE.match(raw):
                value = parse_clock(raw)
                if kind == NIGHT_TIME:
                    value = on_night_scale(value)
            else:
                raise Bad("malformed condition: %s" % text)
            terms.append((name, op, value, False))
        elif re.match(r"^[a-z_]+$", part):
            if part not in MEASURES:
                raise Bad("unknown measure: %s" % part)
            if MEASURES[part][0] != FLAG:
                raise Bad("malformed condition: %s" % text)
            terms.append((part, None, None, neg))
        else:
            raise Bad("malformed condition: %s" % text)
    return terms


def parse_matters(text):
    out = {}
    for item in listed(text):
        bits = item.split()
        if len(bits) != 2 or not NUM_RE.match(bits[1]):
            raise Bad("malformed matters: %s" % item)
        measure_ref(bits[0])
        out[bits[0]] = float(bits[1])
    return out


def whole(fm, key):
    v = fm.get(key, "")
    if not re.match(r"^\d+$", v):
        raise Bad("missing or malformed %s" % key)
    return int(v)


def parse_test(path, text):
    """A page as a test dict. A machine page that can't be read has `errors` and is not graded."""
    slug = os.path.splitext(os.path.basename(path))[0]
    lines, body = split_page(text)
    fm = frontmatter(lines)
    test = {
        "slug": slug, "path": path, "title": page_title(fm, body, slug), "lead": page_lead(body),
        "grader": fm.get("grader", "machine"), "page_grade": fm.get("grade") or None,
        "needs": fm.get("needs"), "errors": [],
    }
    if test["grader"] == "hand":
        return test
    try:
        if "thirds" in fm and ("a" in fm or "b" in fm):
            raise Bad("a/b and thirds together")
        if "thirds" in fm:
            name, plus = measure_ref(fm["thirds"])
            if plus or MEASURES[name][0] == FLAG:
                raise Bad("malformed thirds: %s" % fm["thirds"])
            test["thirds"] = name
            test["a"] = test["b"] = None
        else:
            if "a" not in fm or "b" not in fm:
                raise Bad("missing a and b (or thirds)")
            test["a"], test["b"] = parse_condition(fm["a"]), parse_condition(fm["b"])
            test["a_text"], test["b_text"] = fm["a"], fm["b"]
        ys = [measure_ref(y) for y in listed(fm.get("y"))]
        if not ys:
            raise Bad("missing y")
        test["y"] = ys
        test["drop"] = [measure_ref(d)[0] for d in listed(fm.get("drop"))]
        test["per_side"], test["total"] = whole(fm, "per_side"), whole(fm, "total")
        matters = parse_matters(fm.get("matters"))
        test["thr"] = {}
        for name, plus in ys:
            full = name + ("+1" if plus else "")
            thr = matters.get(full, matters.get(name, DEFAULT_MATTERS.get(name)))
            if thr is None:
                raise Bad("no threshold for %s" % full)
            test["thr"][full] = thr
        if fm.get("from"):
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", fm["from"]):
                raise Bad("malformed from: %s" % fm["from"])
            test["from"] = fm["from"]
    except Bad as e:
        test["errors"].append(str(e))
    labels = re.split(r"\s+vs\.?\s+", fm.get("compare", ""), maxsplit=1)
    if len(labels) == 2 and "thirds" not in test:
        test["a_label"], test["b_label"] = [s.strip()[:1].upper() + s.strip()[1:] for s in labels]
    return test


def read_excluded(text):
    """Dates under `## Excluded days`, one `- YYYY-MM-DD: reason` a line."""
    out, inside = set(), False
    for line in text.split("\n"):
        if line.startswith("#"):
            inside = line.lstrip("#").strip().lower() == "excluded days"
            continue
        m = re.match(r"^\s*[-*]\s*(\d{4}-\d{2}-\d{2})\b", line)
        if inside and m:
            out.add(m.group(1))
    return out


# --- measures ---------------------------------------------------------------


def iso(d):
    return d.isoformat()


def shifted(day, n):
    return iso(_date.fromisoformat(day) + timedelta(days=n))


def raw(data, day, name):
    row = data["days"].get(day)
    v = None if row is None else row.get(name)
    return None if v in (None, "") else v


def value(ctx, day, name, plus=0):
    """A measure of day D, read from the day it lives on; None when missing."""
    kind, shift, _ = MEASURES[name]
    at = shifted(day, shift + plus)
    if name == "excluded":
        return day in ctx["excluded"]
    if name == "drank":
        a = raw(ctx["data"], at, "alcohol_drinks")
        if a is not None and a > 0:
            return True
        return False if raw(ctx["data"], at, "drinks_logged") else None
    if name == "unwind":
        mg = raw(ctx["data"], at, "unwind_mg")
        if raw(ctx["data"], at, "unwind") is True or (mg is not None and mg > 0):
            return True
        return False if raw(ctx["data"], at, "drinks_logged") else None
    v = raw(ctx["data"], at, name)
    if v is None:
        return None
    if kind == FLAG:
        return bool(v)
    if kind in (TIME, NIGHT_TIME):
        if not TIME_RE.match(str(v)):
            return None
        m = parse_clock(str(v))
        return on_night_scale(m) if kind == NIGHT_TIME else m
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def holds(ctx, day, terms):
    for name, op, want, neg in terms:
        v = value(ctx, day, name)
        if v is None:
            return None
        if op is None:
            ok = bool(v) != neg
        else:
            ok = {"<": v < want, "<=": v <= want, ">": v > want, ">=": v >= want, "=": v == want}[op]
        if not ok:
            return False
    return True


def test_measures(test):
    """The measures a test names in a, b/thirds and y, as (name, plus) pairs."""
    out = set(test["y"])
    for terms in (test["a"], test["b"]):
        out.update((t[0], 0) for t in terms or [])
    if test.get("thirds"):
        out.add((test["thirds"], 0))
    return out


def sources_of(test):
    names = {m for m, _ in test_measures(test)}
    if names & FOOD:
        names.add("complete_day")
    return sorted({MEASURES[n][2] for n in names if MEASURES[n][2]})


# --- the grading rule -------------------------------------------------------


def mean(xs):
    return sum(xs) / len(xs)


def window_days(end):
    e = _date.fromisoformat(end)
    return [iso(e - timedelta(days=i)) for i in range(WINDOW_DAYS - 1, -1, -1)]


def qualifying(ctx, test, days):
    """Days that count: not dropped or excluded, on or after `from`, every named measure present.
    Returns [(day, {measure: value}, group_value)]."""
    names = {m for m, _ in test_measures(test)}
    need_food = bool(names & FOOD)
    out = []
    for d in days:
        if d in ctx["excluded"] or d < test.get("from", ""):
            continue
        if any(value(ctx, d, f) is True for f in test["drop"]):
            continue
        if need_food and value(ctx, d, "complete_day") is not True:
            continue
        ys = {}
        for name, plus in test["y"]:
            v = value(ctx, d, name, plus)
            ys[name + ("+1" if plus else "")] = v
        if any(v is None for v in ys.values()):
            continue
        out.append((d, ys))
    return out


def split_groups(ctx, test, days):
    """({'A': [(day, ys)], 'B': [...]}) for a/b, or the top and bottom thirds."""
    rows = qualifying(ctx, test, days)
    a, b = [], []
    if test.get("thirds"):
        scored = []
        for d, ys in rows:
            v = value(ctx, d, test["thirds"])
            if v is not None:
                scored.append((v, d, ys))
        scored.sort(key=lambda r: (r[0], r[1]))
        k = len(scored) // 3
        if k:
            lo, hi = scored[k][0], scored[len(scored) - k - 1][0]
            # a value tied across a boundary belongs to the middle third
            b = [(d, ys) for v, d, ys in scored if v < lo]
            a = [(d, ys) for v, d, ys in scored if v > hi]
        return {"A": a, "B": b}
    for d, ys in rows:
        ina, inb = holds(ctx, d, test["a"]), holds(ctx, d, test["b"])
        if ina is None or inb is None or ina == inb:
            continue
        (a if ina else b).append((d, ys))
    return {"A": a, "B": b}


def outcome_stats(test, groups, name):
    a, b = groups["A"], groups["B"]
    thr = test["thr"][name]
    ma = mean([ys[name] for _, ys in a]) if a else None
    mb = mean([ys[name] for _, ys in b]) if b else None
    diff = None if ma is None or mb is None else ma - mb
    over = diff is not None and abs(diff) >= thr
    # the halves of the days that were compared, earlier and later
    pooled = sorted([(d, "A", ys[name]) for d, ys in a] + [(d, "B", ys[name]) for d, ys in b])
    cut = len(pooled) // 2
    halves = []
    for part in (pooled[:cut], pooled[cut:]):
        pa = [v for _, g, v in part if g == "A"]
        pb = [v for _, g, v in part if g == "B"]
        halves.append(mean(pa) - mean(pb) if pa and pb else None)
    steady = (
        over and all(h is not None and h * diff > 0 and abs(h) >= thr / 2 for h in halves))
    return {"measure": name, "mean_a": ma, "mean_b": mb, "diff": diff, "threshold": thr,
            "over": over, "halves": halves, "halves_agree": steady}


def grade_window(ctx, test, end):
    """One window's grade and its figures."""
    days = window_days(end)
    # blocked: a named measure has no value on any day of the window
    empty = sorted(
        {m + ("+1" if p else "") for m, p in test_measures(test)
         if all(value(ctx, d, m, p) is None for d in days)})
    if "complete_day" not in empty and {m for m, _ in test_measures(test)} & FOOD:
        if all(value(ctx, d, "complete_day") is None for d in days):
            empty.append("complete_day")
    groups = split_groups(ctx, test, days)
    na, nb = len(groups["A"]), len(groups["B"])
    res = {"end": end, "from": days[0], "a": na, "b": nb, "outcomes": [], "primary": None}
    if empty:
        res.update(grade="blocked", empty=empty)
        return res
    outs = [outcome_stats(test, groups, n + ("+1" if p else "")) for n, p in test["y"]]
    if na < test["per_side"] or nb < test["per_side"] or na + nb < test["total"]:
        res["grade"] = "collecting"
    elif not any(o["over"] for o in outs):
        res["grade"] = "ruled-out"
    elif na >= 2 * test["per_side"] and nb >= 2 * test["per_side"] and any(o["halves_agree"] for o in outs):
        res["grade"] = "strong"
    else:
        res["grade"] = "leaning"
    res["outcomes"] = outs
    pool = [o for o in outs if o["diff"] is not None]
    if res["grade"] == "strong":
        pool = [o for o in pool if o["halves_agree"]] or pool
    elif res["grade"] == "leaning":
        pool = [o for o in pool if o["over"]] or pool
    if pool:
        res["primary"] = max(pool, key=lambda o: abs(o["diff"]) / o["threshold"])["measure"]
    return res


def progress(test, res):
    """The live count of a collecting test: `7 of 10`, or `3 + 4 of 6 + 6` while a group is short."""
    na, nb, ps = res["a"], res["b"], test["per_side"]
    if na < ps or nb < ps:
        return {"a": na, "b": nb, "text": "%d + %d of %d + %d" % (na, nb, ps, ps),
                "fraction": (min(na, ps) + min(nb, ps)) / (2.0 * ps)}
    return {"a": na, "b": nb, "text": "%d of %d" % (na + nb, test["total"]),
            "fraction": min(1.0, (na + nb) / float(test["total"]))}


def grade_test(ctx, test, today, failed):
    """The result a test, over three windows ending today, yesterday and the day before."""
    out = {k: test.get(k) for k in ("slug", "title", "lead", "grader", "page_grade", "needs")}
    out.update(path=test["path"], errors=list(test["errors"]), moved=False, ungraded=False, sources=[])
    if test["grader"] == "hand":
        out.update(grade=test["page_grade"], display_grade=test["page_grade"])
        return out
    if test["errors"]:
        out.update(grade=None, display_grade=None)
        return out
    lever = [t[0] for terms in (test["a"], test["b"]) for t in terms or []] + (
        [test["thirds"]] if test.get("thirds") else [])
    out["lever"] = sorted(set(lever))
    out["y"] = list(test["thr"])
    for k in ("a_text", "b_text", "a_label", "b_label", "thirds"):
        if test.get(k):
            out[k] = test[k]
    wins = [grade_window(ctx, test, shifted(today, -i)) for i in range(WINDOWS)]
    tonight = wins[0]
    out["window"] = {"from": tonight["from"], "to": today}
    out["tonight"] = tonight["grade"]
    out["counts"] = {"a": tonight["a"], "b": tonight["b"]}
    out["outcomes"] = tonight["outcomes"]
    out["primary"] = tonight["primary"]
    out["empty"] = tonight.get("empty", [])
    agreed = len({w["grade"] for w in wins}) == 1
    out["agreed"] = agreed
    out["grade"] = tonight["grade"] if agreed else (test["page_grade"] or tonight["grade"])
    out["display_grade"] = out["grade"]
    out["moved"] = agreed and tonight["grade"] != test["page_grade"]
    if tonight["grade"] == "collecting":
        out["progress"] = progress(test, tonight)
    if tonight["grade"] == "blocked":
        out["awaits"] = test["needs"] or "data for " + ", ".join(tonight.get("empty", []))
    srcs = [s for s in sources_of(test) if s in failed]
    if srcs:
        out.update(ungraded=True, sources=srcs, moved=False)
    return out


# --- writing ----------------------------------------------------------------


def fmt(x):
    return ("%.1f" % x).rstrip("0").rstrip(".")


def entry_text(test, res, today):
    """One Timeline line in §2's form. Figures of a finding; never a daily value, series or progress count."""
    old, new = res["page_grade"] or "none", res["grade"]
    head = "- **%s:** **%s → %s**." % (today, old, new)
    cite = "(thrive: daily data %s to %s, read %s)" % (res["window"]["from"], today, today)
    if new in ("strong", "leaning", "ruled-out"):
        o = next(o for o in res["outcomes"] if o["measure"] == res["primary"]) if res["primary"] else None
        ga = test.get("a_text") or "the top third of %s" % test.get("thirds")
        gb = test.get("b_text") or "the bottom third of %s" % test.get("thirds")
        body = "%d days with %s averaged %s %s; %d days with %s averaged %s. A minus B is %s against a threshold of %s." % (
            res["counts"]["a"], ga, fmt(o["mean_a"]), o["measure"], res["counts"]["b"], gb, fmt(o["mean_b"]),
            fmt(o["diff"]), fmt(o["threshold"]))
    elif new == "blocked":
        body = "No data yet for %s." % ", ".join(res["empty"])
    else:
        body = "Not enough days in each group yet."
    return "%s %s %s" % (head, body, cite)


def set_key(lines, key, val):
    for i, line in enumerate(lines):
        if re.match(r"^%s\s*:" % re.escape(key), line):
            lines[i] = "%s: %s" % (key, val)
            return
    lines.append("%s: %s" % (key, val))


def last_item_end(lines, start, end):
    """The index just past the last top-level list item, and what is indented under it, in lines[start:end];
    None when the section has no list item. A note after the list, such as a blockquote, stays after it."""
    last = None
    for i in range(start, end):
        if re.match(r"^[-*]\s", lines[i]):
            last = i
    if last is None:
        return None
    stop = last + 1
    for i in range(last + 1, end):
        if lines[i].strip() and not lines[i][0].isspace():
            break
        if lines[i].strip():
            stop = i + 1
    return stop


def edit_page(text, res, test, today):
    lines, body = split_page(text)
    if not lines:
        raise Bad("no frontmatter")
    set_key(lines, "grade", res["grade"])
    set_key(lines, "updated", today)
    entry = entry_text(test, res, today)
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
        stop = last_item_end(body_lines, at + 1, end)
        body_lines.insert(end if stop is None else stop, entry)
    return "---\n" + "\n".join(lines) + "\n---\n" + "\n".join(body_lines)


def edit_hub(text, slug, title, grade):
    """Move a test's bullet, with the indented lines that continue it, to its new grade's section on
    `data-findings`, adding the section if needed."""
    name = grade.replace("-", " ")
    lines = text.split("\n")
    kept, moved = [], None
    mine = re.compile(r"^[-*]\s+(\[\[)?%s(?![\w-])" % re.escape(slug))
    i = 0
    while i < len(lines):
        if moved is None and mine.match(lines[i]):
            moved = [lines[i]]
            i += 1
            while i < len(lines) and lines[i].strip() and lines[i][0].isspace():
                moved.append(lines[i])
                i += 1
            continue
        kept.append(lines[i])
        i += 1
    entry = moved or ["- [[%s]]: %s" % (slug, title)]
    at = next((i for i, l in enumerate(kept)
               if l.startswith("#") and l.lstrip("#").strip().lower() == name), None)
    if at is None:
        while kept and not kept[-1].strip():
            kept.pop()
        kept += ["", "## " + name[:1].upper() + name[1:]] + entry + [""]
        return "\n".join(kept)
    end = next((i for i in range(at + 1, len(kept)) if kept[i].startswith("#")), len(kept))
    while end > at + 1 and not kept[end - 1].strip():
        end -= 1
    kept[end:end] = entry
    return "\n".join(kept)


def read(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read().replace("\r\n", "\n")


def put(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def write_changes(results, tests, today, wiki, hub, writeback):
    """Write the moved grades in one commit. Nothing changes unless the wiki is writable.
    Returns {'status': ..., 'tests': [slugs]}."""
    moved = [r for r in results if r["moved"] and not r["ungraded"] and r["grader"] != "hand" and not r["errors"]]
    if not moved:
        return {"status": "nothing to write", "tests": []}
    originals, edits = {}, {}
    try:
        hub_text = read(hub) if os.path.isfile(hub) else ""
        for r in moved:
            page = r["path"]
            originals.setdefault(page, read(page))
            edits[page] = edit_page(edits.get(page, originals[page]), r, tests[r["slug"]], today)
            hub_text = edit_hub(hub_text, r["slug"], r["title"], r["grade"])
    except (OSError, Bad) as e:
        return {"status": "not written", "reason": str(e), "tests": []}
    edits[hub] = hub_text
    originals.setdefault(hub, read(hub) if os.path.isfile(hub) else None)
    for path, text in edits.items():
        put(path, text)
    slugs = [r["slug"] for r in moved]
    message = "brief: %s" % "; ".join(
        "%s %s → %s" % (r["slug"], r["page_grade"] or "none", r["grade"]) for r in moved)
    result = writeback(message, list(edits))
    if result.get("status") == "refused":
        for path, text in originals.items():  # leave the wiki as we found it
            if text is None:
                os.remove(path)
            else:
                put(path, text)
        return {"status": "refused", "reason": result.get("reason"), "tests": []}
    return {"status": result.get("status"), "reason": result.get("reason"), "tests": slugs}


# --- run --------------------------------------------------------------------


def inside(path, repo):
    if not repo:
        return False
    a, b = os.path.realpath(path), os.path.realpath(repo)
    return a == b or a.startswith(b + os.sep)


def load_pages(folder):
    tests = {}
    for path in sorted(glob.glob(os.path.join(folder, "test-*.md"))):
        text = read(path)
        if frontmatter(split_page(text)[0]).get("kind") == "trial":
            continue  # a trial's page (#831) is not a test to grade
        t = parse_test(path, text)
        tests[t["slug"]] = t
    return tests


def run(data, today, tests, excluded, hub=None, write=False, wiki=None, keel=None, folder=None, writeback=None):
    ctx = {"data": data, "excluded": excluded}
    failed = set(data.get("failed") or [])
    results = [grade_test(ctx, t, today, failed) for t in tests.values()]
    foot = []
    for s in sorted(failed):
        foot.append("Not graded tonight: %s couldn't be read." % s)
    for r in results:
        for e in r["errors"]:
            if e.startswith("unknown measure"):
                foot.append("%s names a measure the brief doesn't know: %s." % (r["title"], e.split(": ", 1)[1]))
            else:
                foot.append("%s can't be graded: %s." % (r["title"], e))
    out = {"today": today, "tests": results, "foot": foot,
           "write": {"status": "not asked", "tests": []}}
    if write:
        wb = writeback or (lambda msg, paths: checkouts.writeback(msg, paths, keel, folder))
        out["write"] = write_changes(results, tests, today, wiki, hub, wb)
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--data", required=True, help="the scratch file; deleted when the run ends")
    p.add_argument("--today", required=True)
    p.add_argument("--wiki", help="the wiki checkout (default: the wiki: line of settings.local.md)")
    p.add_argument("--syntheses", help="the folder of test pages (default: <wiki>/%s)" % SYNTHESES)
    p.add_argument("--hub", help="the data-findings page (default: <syntheses>/data-findings.md)")
    p.add_argument("--write", action="store_true", help="write grade changes through checkouts.py writeback")
    p.add_argument("--keel", help="the Keel worktree (default: the one holding this script)")
    p.add_argument("--folder", help="the briefs' folder (default: the worktree's parent)")
    args = p.parse_args(argv)
    keel = args.keel or checkouts.toplevel(checkouts.HERE)
    wiki = args.wiki or checkouts.read_wiki_path(checkouts.find_settings(keel, args.folder))
    scratch = os.path.abspath(args.data)
    try:
        for repo in (keel, checkouts.toplevel(wiki) if wiki and os.path.isdir(wiki) else wiki,
                     checkouts.toplevel(os.path.dirname(scratch))):
            if inside(scratch, repo):
                raise SystemExit("the scratch file must be outside both checkouts: %s" % scratch)
        with open(scratch, encoding="utf-8") as fh:
            data = json.load(fh)
        if not wiki:
            raise SystemExit("no wiki: pass --wiki or set the wiki: line in settings.local.md")
        folder = args.syntheses or os.path.join(wiki, SYNTHESES)
        hub = args.hub or os.path.join(folder, "data-findings.md")
        excluded = read_excluded(read(hub)) if os.path.isfile(hub) else set()
        result = run(data, args.today, load_pages(folder), excluded, hub, args.write, wiki, keel, args.folder)
        print(json.dumps(result))
    finally:
        try:
            os.remove(scratch)
            parent = os.path.dirname(scratch)
            if os.path.basename(parent).startswith("nightly-"):
                os.rmdir(parent)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
