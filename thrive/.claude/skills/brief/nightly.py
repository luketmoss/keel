#!/usr/bin/env python3
"""The nightly brief's rules (#829): bed-by, moves, food completeness, tile states.

Stdlib only. The brief skill's nightly mode reads the tools, then calls
`python nightly.py rules` with the readings as JSON on stdin and puts the answer
in the page's data. The judgment lives here so it is tested on made-up fixtures
(test_nightly.py) rather than reasoned out again on every run.

Times are minutes. A clock time in the evening or after midnight is placed on one
scale that starts at noon, so 22:15 is 1335 and 00:30 is 1470; a morning
commitment tomorrow at 7:00 is 1440 + 420.
"""
import json
import statistics
import sys
from datetime import date as _date, timedelta

GOOD_NIGHT_S = 7 * 3600 + 30 * 60  # 7:30 slept, the morning brief's threshold
MIN_GOOD_NIGHTS = 5
TRAINING_SLOT = 7 * 60  # a planned weight, stretch or indoor session
MORNING_CUTOFF = 10 * 60  # a timed event before this is a commitment
DRINK_CUTOFF = 9 * 60  # a commitment before this makes the drink move
MIN_COMPLETE_DAYS = 3
WATER_CAP_OZ = 16
WATER_STEP_OZ = 4
BP_DAYS = 7
NIGHT_START = 12 * 60  # the scale starts at noon


def parse_clock(s):
    """'23:15', '23:15:00' or an ISO datetime to minutes after midnight, else None."""
    if s is None or s == "":
        return None
    s = str(s)
    if "T" in s:
        s = s.split("T", 1)[1]
    elif " " in s:
        s = s.rsplit(" ", 1)[1]
    parts = s.split(":")
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return None


def on_night_scale(minutes):
    """Minutes after midnight to the noon-based scale: before noon means after midnight."""
    return minutes + 1440 if minutes < NIGHT_START else minutes


def floor_quarter(m):
    return int(m // 15 * 15)


def clock_text(m):
    m = int(m) % 1440
    h, mm = divmod(m, 60)
    return "%d:%02d %s" % (h % 12 or 12, mm, "PM" if h >= 12 else "AM")


def slept_s(night):
    total = night.get("sleep_total_s")
    if total in (None, ""):
        return None
    return int(total) - int(night.get("sleep_awake_s") or 0)


def good_nights(nights):
    """Nights with 7:30 or more slept and a bed and wake time; the caller passes the last 60."""
    out = []
    for n in nights:
        s = slept_s(n)
        bed, wake = parse_clock(n.get("bed_time")), parse_clock(n.get("wake_time"))
        if s is not None and s >= GOOD_NIGHT_S and bed is not None and wake is not None:
            out.append((on_night_scale(bed), bed, wake))
    return out


def usual(nights):
    """{'bed': usual bed-by on the night scale, 'tib': median minutes in bed, 'n': good nights}
    or None with fewer than five good nights."""
    g = good_nights(nights)
    if len(g) < MIN_GOOD_NIGHTS:
        return None
    bed = floor_quarter(statistics.median(b for b, _, _ in g))
    tib = statistics.median((w - b) % 1440 for _, b, w in g)
    return {"bed": bed, "tib": tib, "n": len(g)}


def first_commitment(morning):
    """morning: {'sessions': [{'type': 'weight'|'stretch'|'bike:indoor'|'bike:mountain', 'start': optional 'HH:MM'}],
    'events': [{'start': 'HH:MM', 'title': ...}]}. Returns (minutes, label) or None."""
    cands = []
    for s in morning.get("sessions") or []:
        t = str(s.get("type", ""))
        indoor = t in ("weight", "stretch") or t.endswith(":indoor")
        if indoor:
            cands.append((TRAINING_SLOT, s.get("title") or t))
        elif s.get("start"):
            m = parse_clock(s["start"])
            if m is not None and m < MORNING_CUTOFF:
                cands.append((m, s.get("title") or t))
        # an outdoor session with no time sets nothing
    for e in morning.get("events") or []:
        m = parse_clock(e.get("start"))
        if m is not None and m < MORNING_CUTOFF:
            cands.append((m, e.get("title") or "an early start"))
    return min(cands, key=lambda c: c[0]) if cands else None


def bed_by(us, morning):
    """The bed-by for a night given its next morning. None without a usual."""
    if us is None:
        return None
    c = first_commitment(morning or {})
    if c is None:
        return {"bed": us["bed"], "wake_by": None, "commitment": None, "why": "your usual"}
    wake_by = c[0] - 60
    needed = floor_quarter(1440 + wake_by - us["tib"])
    if needed < us["bed"]:
        return {"bed": needed, "wake_by": wake_by, "commitment": c, "why": c[1]}
    return {"bed": us["bed"], "wake_by": wake_by, "commitment": c, "why": "your usual"}


def round_oz(gap):
    r = int(round(gap / WATER_STEP_OZ)) * WATER_STEP_OZ
    return max(WATER_STEP_OZ, min(WATER_CAP_OZ, r))


def complete_day(slots):
    """A day is complete when Breakfast, Lunch and Dinner each have an entry."""
    return all((slots or {}).get(k) for k in ("Breakfast", "Lunch", "Dinner"))


def missing_meals(slots):
    return [k for k in ("Breakfast", "Lunch", "Dinner") if not (slots or {}).get(k)]


def yesterday_line(slots):
    miss = [m.lower() for m in missing_meals(slots)]
    if not miss:
        return None
    if len(miss) == 1:
        return "Yesterday's %s isn't logged." % miss[0]
    if len(miss) == 2:
        return "Yesterday's %s and %s aren't logged." % tuple(miss)
    return "Yesterday's %s, %s and %s aren't logged." % tuple(miss)


def week_average(days, key):
    """Average of key over the complete days that carry it, plus how many complete days there are."""
    comp = [d for d in days if complete_day(d.get("slots"))]
    vals = [d[key] for d in comp if d.get(key) is not None]
    return {"complete": len(comp), "avg": (sum(vals) / len(vals)) if vals else None}


def moves(inp, bb, lift_tomorrow, commitment_tomorrow):
    out = []
    w = inp.get("water") or {}
    if w.get("oz") is not None and w.get("goal_oz") and w["oz"] < w["goal_oz"]:
        amt = round_oz(w["goal_oz"] - w["oz"])
        stop = clock_text(bb["bed"] - 60) if bb else None
        out.append({
            "kind": "water", "icon": "water",
            "action": "%d oz now, then stop by %s" % (amt, stop) if stop else "%d oz now" % amt,
            "line": "%g oz today, %d%% of your %g oz goal." % (w["oz"], round(100 * w["oz"] / w["goal_oz"]), w["goal_oz"]),
        })
    if (inp.get("alcohol") or 0) > 0 and commitment_tomorrow is not None and commitment_tomorrow[0] < DRINK_CUTOFF:
        n = inp["alcohol"]
        wake = ", and you're up at %s" % clock_text(commitment_tomorrow[0] - 60).replace(" AM", "")
        out.append({
            "kind": "drink", "icon": "alcohol", "action": "Stop at one tonight" if n == 1 else "No more tonight",
            "line": "%s logged%s." % ("One is" if n == 1 else "%d are" % n, wake),
        })
    wk = week_average(inp.get("food_week") or [], "protein_g")
    goals = inp.get("goals") or {}
    if wk["complete"] >= MIN_COMPLETE_DAYS:
        if lift_tomorrow and wk["avg"] is not None and goals.get("protein_g") and wk["avg"] < goals["protein_g"]:
            out.append({
                "kind": "food", "icon": "coffee", "action": "Protein after dinner",
                "line": "Your week averages %d g against %d, and you lift tomorrow." % (round(wk["avg"]), goals["protein_g"]),
            })
        else:
            sod = week_average(inp.get("food_week") or [], "sodium_mg")
            if sod["avg"] is not None and goals.get("sodium_mg") and sod["avg"] > goals["sodium_mg"]:
                out.append({
                    "kind": "food", "icon": "coffee", "action": "Keep tonight's snack low in salt",
                    "line": "Your week averages {:,} mg against {:,}.".format(round(sod["avg"]), goals["sodium_mg"]),
                })
    last_bp, today = inp.get("last_bp"), inp.get("today")
    if today:
        t = _date.fromisoformat(today)
        stale = last_bp is None or _date.fromisoformat(last_bp) < t - timedelta(days=BP_DAYS - 1)
        if stale:
            out.append({
                "kind": "cuff", "icon": "heart", "action": "Put the cuff by the bed",
                "line": ("No blood pressure since %s." % _short_date(last_bp))
                if last_bp else "No blood pressure in the last 7 days.",
            })
    return out[:3]


def _short_date(iso):
    d = _date.fromisoformat(iso)
    return "%s %d" % (d.strftime("%b"), d.day)


def tile_state(kind, value, avg):
    """'down', 'good' or 'ok' by the morning brief's step-down limits. Missing values are 'ok'."""
    if value is None or avg is None:
        return "ok"
    if kind == "hrv":
        return "down" if value * 10 <= avg * 9 else "good" if value * 10 >= avg * 11 else "ok"
    if kind == "heart":
        return "down" if value - avg >= 5 else "good" if avg - value >= 5 else "ok"
    if kind == "sleep":  # minutes slept
        return "down" if value < 360 or avg - value >= 60 else "good" if value - avg >= 60 else "ok"
    return "ok"


def phone_note(not_read, yesterday):
    parts = []
    if not_read:
        parts.append("Not read: " + ", ".join(not_read))
    if yesterday:
        parts.append(yesterday)
    return " · ".join(parts)


def compute(inp):
    """inp: today, nights (last 60), mornings (list of {date, sessions, events}, tomorrow first, up to
    five days), water {oz, goal_oz}, alcohol, food_week [{slots, protein_g, sodium_mg}], goals, last_bp,
    yesterday_slots. Returns the bed-by for tonight and each day, the moves and the food line."""
    us = usual(inp.get("nights") or [])
    mornings = inp.get("mornings") or []
    tonight = bed_by(us, mornings[0] if mornings else {})
    days = []
    for i, m in enumerate(mornings):
        # the row for day i shows the night that ends in day i+1's morning; the last day's is unread
        nxt = mornings[i + 1] if i + 1 < len(mornings) else None
        b = bed_by(us, nxt) if nxt is not None else bed_by(us, {})
        days.append(None if b is None else {"date": m.get("date"), "bed_by": clock_text(b["bed"]), "why": b["why"]})
    first = first_commitment(mornings[0]) if mornings else None
    lift = any(str(s.get("type")) == "weight" for s in (mornings[0].get("sessions") or [])) if mornings else False
    return {
        "good_nights": 0 if us is None else us["n"],
        "tonight": None if tonight is None else {
            "bed_by": clock_text(tonight["bed"]), "bed_min": tonight["bed"], "why": tonight["why"],
            "wake_by": None if tonight["wake_by"] is None else clock_text(tonight["wake_by"]),
        },
        "days": days,
        "moves": moves(inp, tonight, lift, first),
        "yesterday_line": yesterday_line(inp["yesterday_slots"]) if inp.get("yesterday_slots") is not None else None,
    }


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rules":
        print(json.dumps(compute(json.load(sys.stdin))))
    else:
        sys.exit("usage: nightly.py rules < readings.json")
