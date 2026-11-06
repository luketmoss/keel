#!/usr/bin/env python3
"""The weekly brief's rules (#832): plan against done, the meal gaps, the grades that moved, and the review it files.

  weekly.py run --data SCRATCH.json --today YYYY-MM-DD [--write]
                [--wiki DIR] [--syntheses DIR] [--keel DIR] [--folder DIR]

Reads a scratch file the run gathers from the tools, and prints one JSON object for the page:

  {"week": {"from", "to"}, "pad": {"rows", "targets", "empty"}, "meals": [...], "grades": [...],
   "filed": {"state", "line", "note"}, "foot": [...]}

The scratch file is one JSON object (made-up figures in the tests, test_weekly.py):

  "plan":    [{"day", "title", "type"}]   what was scheduled for the week, from the block page's week section
  "done":    [{"day", "title", "type"}]   completed sessions of the week, from Thrive
  "notes":   {"YYYY-MM-DD": "quote"}      only a journal or session note that explains a miss, a swap or a move
  "targets": {"lift": "3", "stretch": "1-2", "ride": "about 1"}   the scheduling page's weekly targets
  "forage":  {"days": [dates ahead], "dinners": [dates with a dinner planned or a night out noted],
              "library": [recipe names], "picks": {date: recipe}, "evenings": {date: "the calendar line"}}
  "review":  {"figures": [{"text", "read"}], "approach": text or null, "limitations": [text],
              "proposal": [text]}           what the entry rests on and proposes

It files only on a Sunday. With `--write` it appends one dated entry to the active block page's `## Outcome log`
and one line to `log.md`, in one commit through `checkouts.py writeback`, and writes nothing else. It leaves the
wiki as it found it when the wiki is not writable. The scratch file is deleted when the run ends. The wording and
states are thrive/docs/design/832-weekly-rework.md. Standard library only.
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

DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
NOT_EXPLAINED = "not explained in your notes"
NOTHING_PLANNED = "Nothing was planned this week."
KIND = {"weight": "lift", "stretch": "stretch", "bike": "ride"}  # a session type -> the weekly target it counts for
MAX_MEALS = 2
QUOTE_MAX = 120

FILED_LINES = {
    "filed": "This week's review is filed in your wiki, ready for /plan-week.",
    "left": "This week's review isn't filed: your wiki had changes of its own. /plan-week will read the weeks itself.",
    "not_pushed": "This week's review is filed but not pushed yet. The next brief will push it.",
    "no_block": "This week's review isn't filed: no single active training block page was found. "
                "/plan-week will read the weeks itself.",
}
SKIPPED_NOTE = {
    "left": "Review not filed: the wiki was left alone",
    "not_pushed": "Review filed, not pushed yet",
    "no_block": "Review not filed: no active block page",
}


# --- dates ------------------------------------------------------------------


def to_date(s):
    return _date.fromisoformat(s)


def iso(d):
    return d.isoformat()


def week_range(today):
    """The days the review covers: Monday to Sunday on a Sunday, else the seven days ending yesterday."""
    t = to_date(today)
    if t.weekday() == 6:
        return iso(t - timedelta(days=6)), iso(t)
    return iso(t - timedelta(days=7)), iso(t - timedelta(days=1))


def is_sunday(today):
    return to_date(today).weekday() == 6


def dow(day, full=False):
    name = DAYS[to_date(day).weekday()]
    return name if full else name[:3]


# --- plan against done ------------------------------------------------------


def quote(text):
    text = " ".join(str(text).split())
    return text if len(text) <= QUOTE_MAX else text[:QUOTE_MAX - 1].rstrip() + "…"


def explanation(notes, *days):
    """The first note a day has, quoted; None when none of the days has one."""
    for d in days:
        if notes.get(d) and str(notes[d]).strip():
            return quote(notes[d])
    return None


def plan_against_done(plan, done, notes):
    """One row for every planned session: Done, Done moved from a day, Swapped for something, or Missed.

    An exact match (same title, same day) goes first, then the same title on another day, then any other session
    done on the planned day. The why is a note the run kept, else 'not explained in your notes' for a swap or a
    miss; a session that was done as planned has none."""
    rows = sorted(plan, key=lambda p: (p["day"], p["title"]))
    pool = [dict(d) for d in done]
    used = set()
    result = {}

    def take(i, pred):
        for j, d in enumerate(pool):
            if j not in used and pred(d):
                used.add(j)
                result[i] = d
                return True
        return False

    status = {}
    for i, p in enumerate(rows):
        if take(i, lambda d, p=p: d["title"] == p["title"] and d["day"] == p["day"]):
            status[i] = "Done"
    for i, p in enumerate(rows):
        if i not in status and take(i, lambda d, p=p: d["title"] == p["title"]):
            status[i] = "Done, moved from %s" % dow(p["day"], full=True)
    for i, p in enumerate(rows):
        if i not in status and take(i, lambda d, p=p: d["day"] == p["day"]):
            status[i] = "Swapped for %s" % result[i]["title"]
    out = []
    for i, p in enumerate(rows):
        st = status.get(i, "Missed")
        why = None
        if st.startswith("Done, moved"):
            why = explanation(notes, p["day"], result[i]["day"])
        elif st != "Done":
            why = explanation(notes, p["day"], *( [result[i]["day"]] if i in result else [] )) or NOT_EXPLAINED
        out.append({"day": dow(p["day"]), "date": p["day"], "title": p["title"], "type": p.get("type"),
                    "status": st, "why": why})
    return out


def plural(noun, target):
    if target.strip() in ("1", "about 1"):
        return noun
    return noun + ("es" if noun.endswith("ch") else "s")


def targets_line(done, targets):
    """'2 of 3 lifts · 1 of 1-2 stretches · 0 of about 1 ride'. A ride is reported, never scored."""
    counts = {}
    for d in done:
        k = KIND.get(str(d.get("type", "")).split(":")[0])
        if k:
            counts[k] = counts.get(k, 0) + 1
    parts = []
    for noun in ("lift", "stretch", "ride"):
        if noun in (targets or {}):
            t = str(targets[noun])
            parts.append("%d of %s %s" % (counts.get(noun, 0), t, plural(noun, t)))
    return " · ".join(parts)


def pad(data):
    rows = plan_against_done(data.get("plan") or [], data.get("done") or [], data.get("notes") or {})
    return {"rows": rows, "targets": targets_line(data.get("done") or [], data.get("targets")),
            "empty": NOTHING_PLANNED if not rows else None}


# --- meals ------------------------------------------------------------------


def meal_suggestions(forage):
    """At most two `meal` suggestions, one for each day ahead with no dinner planned. None when every dinner is
    planned. A recipe is named only when the run picked one and the library holds it."""
    days = sorted((forage or {}).get("days") or [])
    planned = set((forage or {}).get("dinners") or [])
    library = {r.strip().lower(): r.strip() for r in (forage or {}).get("library") or []}
    picks = (forage or {}).get("picks") or {}
    evenings = (forage or {}).get("evenings") or {}
    gaps = [d for d in days if d not in planned]
    out = []
    # A day whose evening the calendar already fills needs the plan most, so it goes first.
    gaps.sort(key=lambda d: (0 if evenings.get(d) else 1, d))
    for d in gaps[:MAX_MEALS]:
        name = dow(d, full=True)
        recipe = library.get(str(picks.get(d, "")).strip().lower())
        why = "Nothing planned for %s dinner." % name
        if evenings.get(d):
            why += " " + evenings[d].strip()
        out.append({"kind": "meal", "date": d, "recipe": recipe,
                    "title": "%s dinner%s" % (name, ": " + recipe if recipe else ""), "why": why})
    out.sort(key=lambda m: m["date"])
    return out


# --- grades that moved ------------------------------------------------------

MOVE = re.compile(r"^[-*]\s+\*\*(\d{4}-\d{2}-\d{2}):\*\*\s+\*\*([^*→]+?)\s*→\s*([^*]+?)\*\*")


def grade_moves(folder, first, last):
    """One line a test whose grade moved between `first` and `last`: its first old grade and last new one."""
    out = []
    for path in sorted(glob.glob(os.path.join(folder, "test-*.md"))):
        text = grade.read(path)
        lines, body = grade.split_page(text)
        fm = grade.frontmatter(lines)
        if fm.get("kind") == "trial":
            continue
        slug = os.path.basename(path)[:-3]
        in_timeline, moves = False, []
        for line in body.split("\n"):
            if re.match(r"^##\s+", line):
                in_timeline = bool(re.match(r"^##\s+Timeline\s*$", line))
                continue
            m = MOVE.match(line) if in_timeline else None
            if m and first <= m.group(1) <= last:
                moves.append((m.group(1), m.group(2).strip(), m.group(3).strip()))
        if moves:
            moves.sort(key=lambda x: x[0])
            old, new = moves[0][1], moves[-1][2]
            if old != new:
                title = grade.page_title(fm, body, slug)
                out.append({"test": slug, "title": title, "old": old, "new": new,
                            "line": "%s: %s → %s" % (title, old, new)})
    return out


# --- the review, filed in the wiki -----------------------------------------


def entry_text(week, today, rows, targets, review):
    """The Outcome log entry: facts and proposals, never a verdict."""
    review = review or {}
    head = "- **%s weekly review, week of %s** (filed by the weekly brief; facts and proposals, not verdicts)." % (
        today, week[0])
    lines = [head, "  - **Plan against done.**"]
    if not rows:
        lines.append("    - %s" % NOTHING_PLANNED)
    for r in rows:
        why = ""
        if r["why"]:
            why = " · " + (r["why"] if r["why"] == NOT_EXPLAINED else "“%s”" % r["why"])
        lines.append("    - %s %s: %s%s" % (r["day"], r["title"], r["status"], why))
    if targets:
        lines.append("    - Against the weekly targets: %s." % targets)
    figures = review.get("figures") or []
    if figures:
        lines.append("  - **Figures this rests on.**")
        for f in figures:
            lines.append("    - %s (read %s)" % (f["text"].rstrip("."), f["read"]))
    approach = review.get("approach")
    lines.append("  - **Approach against its criteria.** %s" % (
        approach.strip() if approach and approach.strip() else "No success criteria were recorded for it."))
    for text in review.get("limitations") or []:
        lines.append("  - **Noted limitation.** %s" % text.strip())
    proposal = review.get("proposal") or []
    if proposal:
        lines.append("  - **Proposed for next week (proposed, not decided).**")
        for text in proposal:
            lines.append("    - %s" % text.strip())
    return "\n".join(lines)


def log_text(today, week, block_slug):
    return ("## [%s] review | weekly review, week of %s\n"
            "Filed by the weekly brief (keel#832) in [[%s]]'s Outcome log: plan against done, the figures it rests on "
            "and a proposal for next week. Facts and proposals only; /plan-week settles the week with Luke." % (
                today, week[0], block_slug))


def active_block(wiki):
    """The one page in wiki/projects with domain training, status active and a `block` tag; None otherwise."""
    found = []
    for path in sorted(glob.glob(os.path.join(wiki, "wiki", "projects", "*.md"))):
        fm = grade.frontmatter(grade.split_page(grade.read(path))[0])
        tags = [t.strip() for t in fm.get("tags", "").strip("[]").split(",")]
        if fm.get("domain") == "training" and fm.get("status") == "active" and "block" in tags:
            found.append(path)
    return found[0] if len(found) == 1 else None


def add_to_outcome_log(text, entry, today):
    """Append `entry` to the end of the `## Outcome log` section and set `updated:`. None without the section."""
    lines = text.split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s+Outcome log\s*$", l)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^##\s", lines[i])), len(lines))
    while end > start + 1 and not lines[end - 1].strip():
        end -= 1
    lines[end:end] = entry.split("\n")
    fm, body = grade.split_page("\n".join(lines))
    if fm:
        grade.set_key(fm, "updated", today)
        return "---\n" + "\n".join(fm) + "\n---\n" + body
    return "\n".join(lines)


def file_review(wiki, week, today, rows, targets, review, writeback):
    """Append the entry and the log line, commit and push. Returns {'state': ...}; the wiki is left as it was
    unless the commit was made."""
    if not is_sunday(today):
        return {"state": "not_sunday"}
    if not wiki or not os.path.isdir(wiki):
        return {"state": "left", "reason": "missing"}
    root = checkouts.toplevel(wiki) or wiki
    block = active_block(root)
    if not block:
        return {"state": "no_block"}
    log = os.path.join(root, "log.md")
    originals = {block: grade.read(block), log: grade.read(log) if os.path.isfile(log) else ""}
    marker = "weekly review, week of %s" % week[0]
    if marker in originals[block]:
        return {"state": "filed", "reason": "already filed"}
    if checkouts.changes(root):
        return {"state": "left", "reason": "changes"}
    entry = entry_text(week, today, rows, targets, review)
    page = add_to_outcome_log(originals[block], entry, today)
    if page is None:
        return {"state": "no_block", "reason": "no Outcome log"}
    slug = os.path.basename(block)[:-3]
    log_before = originals[log].rstrip("\n")
    log_after = (log_before + "\n\n" if log_before else "") + log_text(today, week, slug) + "\n"
    grade.put(block, page)
    grade.put(log, log_after)
    names = [os.path.relpath(p, root).replace(os.sep, "/") for p in (block, log)]
    result = writeback("brief: weekly review, week of %s" % week[0], names)
    status = result.get("status")
    if status == "pushed":
        return {"state": "filed"}
    if status == "not pushed" and result.get("reason") != "commit failed":
        return {"state": "not_pushed", "reason": result.get("reason")}
    for path, text in originals.items():  # nothing was committed: leave the wiki as we found it
        grade.put(path, text)
    return {"state": "left", "reason": result.get("reason") or "refused"}


# --- the run ----------------------------------------------------------------


def run(data, today, wiki, syntheses, write=False, writeback=None):
    week = week_range(today)
    p = pad(data)
    out = {"today": today, "week": {"from": week[0], "to": week[1]}, "pad": p,
           "meals": meal_suggestions(data.get("forage")),
           "grades": grade_moves(syntheses, week[0], week[1]) if syntheses and os.path.isdir(syntheses) else [],
           "filed": {"state": "not asked", "line": None, "note": None}, "foot": []}
    if write:
        res = file_review(wiki, week, today, p["rows"], p["targets"], data.get("review"), writeback)
        state = res["state"]
        out["filed"] = {"state": state, "line": FILED_LINES.get(state), "note": SKIPPED_NOTE.get(state),
                        "reason": res.get("reason")}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("mode", choices=("run",))
    ap.add_argument("--data", required=True, help="the scratch file; deleted when the run ends")
    ap.add_argument("--today", required=True)
    ap.add_argument("--wiki", help="the wiki checkout (default: the wiki: line of settings.local.md)")
    ap.add_argument("--syntheses", help="the folder of test pages (default: <wiki>/%s)" % grade.SYNTHESES)
    ap.add_argument("--write", action="store_true", help="file the review through checkouts.py writeback")
    ap.add_argument("--keel")
    ap.add_argument("--folder")
    args = ap.parse_args(argv)
    keel = args.keel or checkouts.toplevel(checkouts.HERE)
    wiki = args.wiki or checkouts.read_wiki_path(checkouts.find_settings(keel, args.folder))
    scratch = os.path.abspath(args.data)
    try:
        for repo in (keel, checkouts.toplevel(wiki) if wiki and os.path.isdir(wiki) else wiki,
                     checkouts.toplevel(os.path.dirname(scratch))):
            if grade.inside(scratch, repo):
                raise SystemExit("the scratch file must be outside both checkouts: %s" % scratch)
        with open(scratch, encoding="utf-8") as fh:
            data = json.load(fh)
        syntheses = args.syntheses or (os.path.join(wiki, grade.SYNTHESES) if wiki else None)
        wb = lambda msg, paths: checkouts.writeback(msg, paths, keel, args.folder)
        print(json.dumps(run(data, args.today, wiki, syntheses, args.write, wb)))
    finally:
        try:
            os.remove(scratch)
            parent = os.path.dirname(scratch)
            if os.path.basename(parent).startswith("weekly-"):
                os.rmdir(parent)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
