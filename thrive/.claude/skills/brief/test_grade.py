"""Tests for grade.py (#830), on made-up data and made-up test pages in a temporary folder.
Nothing here is the owner's data or wiki."""
import json
import os
import shutil
import tempfile
import unittest
from datetime import date, timedelta

import checkouts
import grade as g
from test_checkouts import Remote, run

TODAY = "2026-11-20"


def day(n):
    """The date n days before TODAY."""
    return (date.fromisoformat(TODAY) - timedelta(days=n)).isoformat()


PAGE = """---
title: Test page
grade: collecting
updated: 2026-11-01
grader: machine
a: sleep_start <= 22:30
b: sleep_start >= 23:00
y: slept_min
drop: ride_day, excluded
per_side: 3
total: 8
---
# Early bed

**Earlier nights sleep longer.**

compare: x

## Timeline
- **2026-11-01:** created.
"""


def page(**kw):
    """PAGE with keys replaced, added (before the closing ---) or, with None, removed."""
    lines, out, seen, closed = PAGE.split(chr(10)), [], set(), 0
    for line in lines:
        if line == "---":
            closed += 1
            if closed == 2:
                out += ["%s: %s" % (k, v) for k, v in kw.items() if k not in seen and v is not None]
        elif closed == 1:
            key = line.split(":", 1)[0]
            if key in kw:
                seen.add(key)
                if kw[key] is None:
                    continue
                line = "%s: %s" % (key, kw[key])
        out.append(line)
    return chr(10).join(out)


def parse(text):
    return g.parse_test("/x/test-early-bed.md", text)


def grade(text, days, today=TODAY, excluded=(), failed=()):
    t = parse(text)
    return g.grade_test({"data": {"days": days}, "excluded": set(excluded)}, t, today, set(failed))


def sleepers(early, late, early_min=480, late_min=440, start=2):
    """Rows for `early` and `late` days, interleaved so both groups span the window; the night after
    day D is on D + 1, so the row for day(n - 1) belongs to day(n)."""
    seq = []
    e, l = early, late
    while e or l:
        if e:
            seq.append(("22:00", early_min)); e -= 1
        if l:
            seq.append(("23:30", late_min)); l -= 1
    return {day(start - 1 + i): {"sleep_start": b, "slept_min": m} for i, (b, m) in enumerate(seq)}


class Definition(unittest.TestCase):
    def test_reads_every_key_without_yaml(self):
        t = parse(page(y="slept_min, sleep_score+1", matters="slept_min 25, sleep_score 4", **{"from": "2026-11-05"}))
        self.assertEqual(t["errors"], [])
        self.assertEqual(t["y"], [("slept_min", 0), ("sleep_score", 1)])
        self.assertEqual(t["drop"], ["ride_day", "excluded"])
        self.assertEqual((t["per_side"], t["total"], t["from"]), (3, 8, "2026-11-05"))
        self.assertEqual(t["thr"], {"slept_min": 25.0, "sleep_score+1": 4.0})
        self.assertEqual(t["title"], "Test page")

    def test_trailing_comment_is_dropped(self):
        t = parse(page(per_side="3            # days a group"))
        self.assertEqual(t["per_side"], 3)

    def test_thirds_in_place_of_a_and_b(self):
        t = parse(page(a=None, b=None, thirds="water_oz", y="deep_min"))
        self.assertEqual(t["errors"], [])
        self.assertEqual(t["thirds"], "water_oz")

    def test_unknown_measure_is_reported_by_name(self):
        t = parse(page(y="slept_min, mood"))
        self.assertEqual(t["errors"], ["unknown measure: mood"])
        t = parse(page(a="mood <= 3"))
        self.assertEqual(t["errors"], ["unknown measure: mood"])

    def test_malformed_conditions_are_reported(self):
        for bad in ("sleep_start <=", "sleep_start <= 22", "slept_min <= 22:30", "ride_day <= 1", "not sleep_start",
                    "sleep_start", "sleep_start <= 22:30 and"):
            self.assertTrue(parse(page(a=bad))["errors"], bad)

    def test_bad_page_is_not_graded_and_the_others_are(self):
        pages = {"test-a": page(y="mood"), "test-b": page()}
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder, True)
        for slug, text in pages.items():
            with open(os.path.join(folder, slug + ".md"), "w") as fh:
                fh.write(text)
        out = g.run({"days": sleepers(4, 4)}, TODAY, g.load_pages(folder), set())
        by = {r["slug"]: r for r in out["tests"]}
        self.assertEqual(by["test-a"]["errors"], ["unknown measure: mood"])
        self.assertIsNone(by["test-a"]["grade"])
        self.assertEqual(by["test-b"]["errors"], [])
        self.assertIsNotNone(by["test-b"]["grade"])
        self.assertIn("Test page names a measure the brief doesn't know: mood.", out["foot"])

    def test_missing_threshold_is_reported(self):
        self.assertEqual(parse(page(y="steps"))["errors"], ["no threshold for steps"])

    def test_hand_pages_are_not_parsed_for_keys(self):
        t = parse(page(grader="hand", y="mood"))
        self.assertEqual(t["errors"], [])


class Conditions(unittest.TestCase):
    def ctx(self, rows, excluded=()):
        return {"data": {"days": rows}, "excluded": set(excluded)}

    def test_operators_over_numbers_and_times(self):
        rows = {day(0): {"steps": 5000, "coffee_last": "14:30", "sleep_start": "23:15"},
                day(1): {"steps": 9000}}
        c = self.ctx(rows)
        cond = lambda s: g.parse_condition(s)
        self.assertTrue(g.holds(c, day(0), cond("steps < 6000")))
        self.assertTrue(g.holds(c, day(0), cond("steps <= 5000")))
        self.assertFalse(g.holds(c, day(0), cond("steps > 5000")))
        self.assertTrue(g.holds(c, day(0), cond("steps >= 5000")))
        self.assertTrue(g.holds(c, day(0), cond("steps = 5000")))
        self.assertTrue(g.holds(c, day(0), cond("coffee_last <= 14:30")))
        self.assertFalse(g.holds(c, day(0), cond("coffee_last < 14:30")))
        # the night after day(1) is day(0): 23:15 is later than 23:00, and after midnight is later still
        self.assertTrue(g.holds(c, day(1), cond("sleep_start >= 23:00")))
        rows[day(0)]["sleep_start"] = "00:30"
        self.assertTrue(g.holds(c, day(1), cond("sleep_start > 23:00")))

    def test_flags_not_and_and(self):
        rows = {day(0): {"ride_day": True, "lift_day": False, "steps": 9000}}
        c = self.ctx(rows)
        cond = lambda s: g.parse_condition(s)
        self.assertTrue(g.holds(c, day(0), cond("ride_day")))
        self.assertFalse(g.holds(c, day(0), cond("not ride_day")))
        self.assertTrue(g.holds(c, day(0), cond("not lift_day")))
        self.assertTrue(g.holds(c, day(0), cond("ride_day and steps >= 9000")))
        self.assertFalse(g.holds(c, day(0), cond("ride_day and steps > 9000")))

    def test_missing_measure_is_unknown(self):
        c = self.ctx({day(0): {"steps": 5}})
        self.assertIsNone(g.holds(c, day(0), g.parse_condition("water_oz > 10")))
        self.assertIsNone(g.holds(c, day(0), g.parse_condition("steps > 1 and water_oz > 10")))

    def test_night_and_morning_come_from_the_day_after(self):
        rows = {day(5): {"steps": 100, "hrv": 1, "weight_am": 1}, day(4): {"hrv": 50, "weight_am": 80, "steps": 200},
                day(3): {"hrv": 60, "steps": 300}}
        c = self.ctx(rows)
        self.assertEqual(g.value(c, day(5), "hrv"), 50)
        self.assertEqual(g.value(c, day(5), "weight_am"), 80)
        self.assertEqual(g.value(c, day(5), "steps"), 100)
        self.assertEqual(g.value(c, day(5), "hrv", 1), 60)  # +1: the day after that
        self.assertEqual(g.value(c, day(5), "steps", 1), 200)

    def test_not_drank_needs_a_drink_logged(self):
        rows = {day(0): {"alcohol_drinks": 2, "drinks_logged": True},
                day(1): {"alcohol_drinks": 0, "drinks_logged": True},
                day(2): {"drinks_logged": False}, day(3): {}}
        c = self.ctx(rows)
        self.assertEqual([g.value(c, day(i), "drank") for i in range(4)], [True, False, None, None])
        self.assertIsNone(g.holds(c, day(2), g.parse_condition("not drank")))
        self.assertTrue(g.holds(c, day(1), g.parse_condition("not drank")))

    def test_food_measures_need_a_complete_day(self):
        rows = {}
        for i in range(2, 12):
            rows[day(i)] = {"kcal": 2000 + i, "complete_day": i % 2 == 0, "slept_min": 400 + i}
            rows[day(i - 1)] = dict(rows.get(day(i - 1), {}), slept_min=400 + i)
        t = parse(page(a="kcal >= 2000", b="kcal < 2000", y="slept_min", per_side="1", total="2"))
        ctx = self.ctx(rows)
        days = [day(i) for i in range(2, 12)]
        qualified = [d for d, _ in g.qualifying(ctx, t, days)]
        self.assertEqual(qualified, [day(i) for i in range(2, 12) if i % 2 == 0])

    def test_thirds_top_against_bottom_with_ties_in_the_middle(self):
        rows = {}
        values = [1, 2, 3, 4, 4, 4, 7, 8, 9]  # nine days: a third is three
        for i, v in enumerate(values):
            rows[day(i + 2)] = {"water_oz": v}
            rows[day(i + 1)] = dict(rows.get(day(i + 1), {}), deep_min=60)
        t = parse(page(a=None, b=None, thirds="water_oz", y="deep_min", per_side="1", total="2"))
        groups = g.split_groups(self.ctx(rows), t, [day(i) for i in range(0, 12)])
        self.assertEqual(sorted(rows[d]["water_oz"] for d, _ in groups["A"]), [7, 8, 9])
        self.assertEqual(sorted(rows[d]["water_oz"] for d, _ in groups["B"]), [1, 2, 3])
        # a tie across the boundary leaves the tied days in the middle
        rows[day(4)]["water_oz"] = 3  # now 1 2 3 3 ...: the 3s straddle the bottom boundary
        rows[day(5)]["water_oz"] = 3
        groups = g.split_groups(self.ctx(rows), t, [day(i) for i in range(0, 12)])
        self.assertTrue(all(rows[d]["water_oz"] < 3 for d, _ in groups["B"]))


class Exclusion(unittest.TestCase):
    def test_drop_excluded_and_from_leave_days_out(self):
        rows = {}
        for i in range(2, 8):
            rows[day(i - 1)] = {"sleep_start": "22:00", "slept_min": 480}
        rows[day(5)]["ride_day"] = True       # D = day(5) rides: dropped
        rows[day(4)]["ride_day"] = False
        t = parse(page(**{"from": day(6)}))
        ctx = {"data": {"days": rows}, "excluded": {day(3)}}
        kept = [d for d, _ in g.qualifying(ctx, t, [day(i) for i in range(0, 12)])]
        # D = day(i) reads its night on day(i-1); rows exist on day(1)..day(6) so D runs day(2)..day(7)
        self.assertNotIn(day(5), kept)  # ride_day on its own day, via the drop list
        self.assertNotIn(day(3), kept)  # on the excluded list
        self.assertNotIn(day(7), kept)  # before `from`
        self.assertEqual(sorted(kept), sorted([day(6), day(4), day(2)]))

    def test_excluded_days_always_leave_even_without_the_drop_key(self):
        rows = {day(1): {"sleep_start": "22:00", "slept_min": 480}}
        t = parse(page(drop=None))
        ctx = {"data": {"days": rows}, "excluded": {day(2)}}
        self.assertEqual(g.qualifying(ctx, t, [day(2)]), [])

    def test_excluded_list_is_read_from_the_hub(self):
        text = "# Hub\n## Collecting\n- 2026-01-01 not me\n## Excluded days\n- 2026-10-02: travel\n- 2026-10-09: flu\n## Other\n- 2026-10-10: no\n"
        self.assertEqual(g.read_excluded(text), {"2026-10-02", "2026-10-09"})


class Grades(unittest.TestCase):
    def test_blocked_when_a_measure_has_no_data_at_all(self):
        r = grade(page(), {})
        self.assertEqual(r["tonight"], "blocked")
        self.assertIn("slept_min", r["empty"])

    def test_blocked_names_what_it_awaits_in_the_pages_words(self):
        r = grade(page() + "", {})
        self.assertIn("slept_min", r["awaits"])
        r = grade(page().replace("grader: machine", "grader: machine\nneeds: A BP cuff by the bed"), {})
        self.assertEqual(r["awaits"], "A BP cuff by the bed")

    def test_collecting_when_one_side_is_short(self):
        r = grade(page(), sleepers(2, 6))
        self.assertEqual(r["tonight"], "collecting")
        self.assertEqual(r["progress"]["text"], "2 + 6 of 3 + 3")

    def test_collecting_when_the_total_is_short(self):
        r = grade(page(total="10"), sleepers(4, 4))
        self.assertEqual(r["tonight"], "collecting")
        self.assertEqual(r["progress"]["text"], "8 of 10")

    def test_ruled_out_when_every_difference_is_under_threshold(self):
        r = grade(page(), sleepers(5, 5, early_min=480, late_min=470))
        self.assertEqual(r["tonight"], "ruled-out")

    def test_leaning_with_enough_difference_but_under_twice_the_minimum(self):
        r = grade(page(), sleepers(5, 5, early_min=500, late_min=440))
        self.assertEqual(r["tonight"], "leaning")
        self.assertEqual(r["primary"], "slept_min")

    def test_leaning_when_the_halves_disagree(self):
        days = {}
        n = 2
        # early half: B sleeps longer; later half: A sleeps longer; overall A is ahead by well over 20
        plan = [("22:00", 400), ("23:30", 600)] * 3 + [("22:00", 700), ("23:30", 300)] * 3
        # order matters: the day nearest TODAY is last in time, so build oldest first
        for i, (bed, mins) in enumerate(plan):
            days[day(len(plan) + 1 - i)] = {"sleep_start": bed, "slept_min": mins}
        r = grade(page(per_side="3", total="8"), days)
        self.assertEqual(r["counts"], {"a": 6, "b": 6})
        self.assertEqual(r["tonight"], "leaning")
        self.assertFalse(r["outcomes"][0]["halves_agree"])

    def test_strong(self):
        r = grade(page(), sleepers(6, 6, early_min=500, late_min=440))
        self.assertEqual(r["tonight"], "strong")
        self.assertEqual(round(r["outcomes"][0]["diff"]), 60)

    def test_strong_needs_twice_the_minimum_in_each_group(self):
        r = grade(page(), sleepers(6, 5, early_min=500, late_min=440))
        self.assertEqual(r["tonight"], "leaning")

    def test_matters_overrides_the_default(self):
        days = sleepers(6, 6, early_min=500, late_min=440)  # 60 minutes apart
        self.assertEqual(grade(page(), days)["tonight"], "strong")
        self.assertEqual(grade(page(matters="slept_min 90"), days)["tonight"], "ruled-out")

    def test_grade_is_written_only_when_the_three_windows_agree(self):
        stable = sleepers(6, 6, early_min=500, late_min=440)
        r = grade(page(grade="leaning"), stable)
        self.assertTrue(r["agreed"])
        self.assertTrue(r["moved"])
        self.assertEqual(r["grade"], "strong")
        # an edge case: the newest early day is the one that tips the window into strong
        edge = sleepers(6, 5, early_min=500, late_min=440, start=2)
        edge[day(0)] = {"sleep_start": "23:30", "slept_min": 440}  # tonight and yesterday see 6 and 6; the day before sees 6 and 5
        r = grade(page(grade="leaning"), edge)
        self.assertEqual(r["tonight"], "strong")
        self.assertFalse(r["agreed"])
        self.assertFalse(r["moved"])
        self.assertEqual(r["grade"], "leaning")  # stays as the page has it

    def test_hand_pages_report_their_own_grade_and_never_move(self):
        r = grade(page(grader="hand", grade="leaning"), sleepers(6, 6, early_min=500, late_min=440))
        self.assertEqual((r["grade"], r["moved"]), ("leaning", False))

    def test_one_failed_source_leaves_its_tests_ungraded(self):
        r = grade(page(), sleepers(6, 6, early_min=500, late_min=440), failed=["Thrive sleep"])
        self.assertTrue(r["ungraded"])
        self.assertFalse(r["moved"])
        self.assertEqual(r["sources"], ["Thrive sleep"])
        other = grade(page(), sleepers(6, 6, early_min=500, late_min=440), failed=["Forage"])
        self.assertFalse(other["ungraded"])


class Write(unittest.TestCase):
    """--write against a real temporary wiki, through checkouts.writeback."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.remote = Remote(self.tmp, "wiki")
        self.folder = os.path.join(self.tmp, "briefs")
        os.makedirs(self.folder)
        self.wiki = self.remote.clone(os.path.join(self.tmp, "wiki"))
        self.syn = os.path.join(self.wiki, "wiki", "syntheses")
        os.makedirs(self.syn)
        self.hub = os.path.join(self.syn, "data-findings.md")
        with open(self.hub, "w", newline="\n") as fh:
            fh.write("# Findings\n\n## Collecting\n- [[test-early-bed]]: Early bed\n- [[test-other]]: Other\n\n## Strong\n")
        self.path = os.path.join(self.syn, "test-early-bed.md")
        with open(self.path, "w", newline="\n") as fh:
            fh.write(page(grade="leaning"))
        hand = os.path.join(self.syn, "test-hand.md")
        with open(hand, "w", newline="\n") as fh:
            fh.write(page(grader="hand", grade="collecting"))
        run(self.wiki, "add", "-A")
        run(self.wiki, "commit", "-q", "-m", "pages")
        run(self.wiki, "push", "-q", "origin", "main")
        with open(os.path.join(self.folder, checkouts.SETTINGS), "w") as fh:
            fh.write("- **wiki**: `%s`\n" % self.wiki)
        self.keel = os.path.join(self.folder, "keel")
        os.makedirs(self.keel)
        self.data = {"days": sleepers(6, 6, early_min=500, late_min=440)}

    def go(self, write=True, data=None):
        checkouts.sync(self.keel, self.folder)
        tests = g.load_pages(self.syn)
        return g.run(data or self.data, TODAY, tests, set(), self.hub, write, self.wiki, self.keel, self.folder)

    def commits(self):
        return int(run(self.wiki, "rev-list", "--count", "HEAD"))

    def test_one_commit_changes_page_timeline_and_hub(self):
        before = self.commits()
        out = self.go()
        self.assertEqual(out["write"]["status"], "pushed")
        self.assertEqual(out["write"]["tests"], ["test-early-bed"])
        self.assertEqual(self.commits(), before + 1)
        with open(self.path, encoding='utf-8') as fh:
            text = fh.read()
        self.assertIn("grade: strong", text)
        self.assertIn("updated: %s" % TODAY, text)
        self.assertEqual(text.count("**%s:**" % TODAY), 1)
        self.assertIn("**leaning → strong**", text)
        self.assertIn("read %s)" % TODAY, text)
        self.assertIn("6 days with sleep_start <= 22:30 averaged 500 slept_min", text)
        with open(self.hub, encoding='utf-8') as fh:
            hub = fh.read()
        self.assertEqual(hub.count("test-early-bed"), 1)
        self.assertLess(hub.index("## Strong"), hub.index("[[test-early-bed]]"))
        self.assertIn("[[test-other]]", hub)
        changed = run(self.wiki, "show", "--name-only", "--format=", "HEAD").split("\n")
        self.assertEqual(sorted(changed), ["wiki/syntheses/data-findings.md", "wiki/syntheses/test-early-bed.md"])

    def test_nothing_daily_or_counted_is_written_for_a_collecting_move(self):
        thin = {"days": sleepers(2, 2)}
        self.go(data=thin)
        with open(self.path, encoding='utf-8') as fh:
            text = fh.read()
        self.assertIn("grade: collecting", text)
        self.assertNotIn(" of 3", text)
        self.assertNotIn("22:00", text)
        self.assertNotIn("2 days", text)

    def test_hand_pages_are_never_written(self):
        self.go()
        with open(os.path.join(self.syn, "test-hand.md")) as fh:
            self.assertEqual(fh.read(), page(grader="hand", grade="collecting"))

    def test_no_move_no_commit(self):
        self.go()
        before = self.commits()
        out = self.go()
        self.assertEqual(out["write"]["status"], "nothing to write")
        self.assertEqual(self.commits(), before)

    def test_a_wiki_that_is_not_writable_is_left_exactly_alone(self):
        with open(os.path.join(self.wiki, "stray.txt"), "w") as fh:
            fh.write("mine")
        with open(self.path, encoding='utf-8') as fh:
            before = fh.read()
        out = self.go()
        self.assertEqual(out["write"]["status"], "refused")
        with open(self.path, encoding='utf-8') as fh:
            self.assertEqual(fh.read(), before)
        self.assertTrue(out["tests"][0]["moved"])  # tonight's grade still shows

    def test_a_wrapped_hub_bullet_moves_whole(self):
        hub = ("# Hub\n\n## Strong\n\n- [[test-a]]: a long line that\n  wraps onto a second line\n  and a third.\n"
               "- [[test-b]]: stays.\n\n## Leaning\n\n- [[test-c]]: one line.\n\n## Collecting\n")
        text = g.edit_hub(hub, "test-a", "A", "leaning")
        self.assertIn("## Leaning\n\n- [[test-c]]: one line.\n- [[test-a]]: a long line that\n  wraps onto a second line\n"
                      "  and a third.\n\n## Collecting", text)
        self.assertIn("## Strong\n\n- [[test-b]]: stays.\n", text)
        self.assertEqual(text.count("wraps onto"), 1)
        self.assertEqual(text.count("and a third"), 1)

    def test_a_one_line_hub_bullet_moves_as_before(self):
        hub = "## Strong\n- [[test-a]]: x.\n- [[test-b]]: y.\n\n## Leaning\n- [[test-c]]: z.\n"
        text = g.edit_hub(hub, "test-b", "B", "leaning")
        self.assertEqual(text, "## Strong\n- [[test-a]]: x.\n\n## Leaning\n- [[test-c]]: z.\n- [[test-b]]: y.\n")

    def test_a_timeline_entry_goes_before_a_trailing_blockquote(self):
        res = {"grade": "strong", "page_grade": "leaning", "counts": {"a": 6, "b": 6}, "primary": "slept_min",
               "outcomes": [{"measure": "slept_min", "mean_a": 500.0, "mean_b": 440.0, "diff": 60.0, "threshold": 20.0}],
               "window": {"from": "2026-08-23", "to": TODAY}, "empty": []}
        t = parse(PAGE)
        body = (PAGE.rstrip("\n") + "\n  - nested figure.\n\n  (thrive: made up)\n\n> **Inference:** a note.\n")
        out = g.edit_page(body, res, t, TODAY)
        tail = out[out.index("## Timeline"):]
        lines = [l for l in tail.split("\n") if l.strip()]
        self.assertEqual(lines[-1], "> **Inference:** a note.")
        self.assertTrue(lines[-2].startswith("- **%s:**" % TODAY))
        self.assertLess(tail.index("(thrive: made up)"), tail.index("**%s:**" % TODAY))
        self.assertEqual(out.count("> **Inference:** a note."), 1)

    def test_a_timeline_with_no_trailing_note_still_appends_at_the_end(self):
        res = {"grade": "strong", "page_grade": "leaning", "counts": {"a": 6, "b": 6}, "primary": "slept_min",
               "outcomes": [{"measure": "slept_min", "mean_a": 500.0, "mean_b": 440.0, "diff": 60.0, "threshold": 20.0}],
               "window": {"from": "2026-08-23", "to": TODAY}, "empty": []}
        out = g.edit_page(PAGE, res, parse(PAGE), TODAY)
        self.assertTrue(out.rstrip("\n").split("\n")[-1].startswith("- **%s:**" % TODAY))

    def test_the_hub_gains_a_missing_section(self):
        text = g.edit_hub("# Hub\n\n## Collecting\n- [[test-x]]: X\n", "test-x", "X", "ruled-out")
        self.assertIn("## Ruled out\n- [[test-x]]: X", text)
        self.assertNotIn("## Collecting\n- [[test-x]]", text)

    def test_a_failed_source_names_itself_in_the_foot_and_is_not_written(self):
        data = dict(self.data, failed=["Thrive sleep"])
        out = self.go(data=data)
        self.assertIn("Not graded tonight: Thrive sleep couldn't be read.", out["foot"])
        self.assertEqual(out["write"]["status"], "nothing to write")
        with open(self.path, encoding="utf-8") as fh:
            self.assertIn("grade: leaning", fh.read())

    def test_windows_that_disagree_write_nothing(self):
        edge = dict(self.data)
        edge = sleepers(6, 5, early_min=500, late_min=440)
        edge[day(0)] = {"sleep_start": "23:30", "slept_min": 440}
        before = self.commits()
        out = self.go(data={"days": edge})
        self.assertFalse(out["tests"][0]["agreed"])
        self.assertEqual(out["write"]["status"], "nothing to write")
        self.assertEqual(self.commits(), before)


class Scratch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.wiki = os.path.join(self.tmp, "wiki")
        os.makedirs(os.path.join(self.wiki, "wiki", "syntheses"))
        run(self.wiki, "init", "-q")
        self.scratch_dir = tempfile.mkdtemp(prefix="nightly-")
        self.addCleanup(shutil.rmtree, self.scratch_dir, True)
        self.data = os.path.join(self.scratch_dir, "grade.json")

    def argv(self, path=None):
        return ["--data", path or self.data, "--today", TODAY, "--wiki", self.wiki, "--keel", self.tmp]

    def test_scratch_file_and_folder_are_gone_after_a_run(self):
        with open(self.data, "w") as fh:
            json.dump({"days": {}}, fh)
        self.assertEqual(g.main(self.argv()), 0)
        self.assertFalse(os.path.exists(self.data))
        self.assertFalse(os.path.exists(self.scratch_dir))

    def test_scratch_file_is_gone_after_a_failed_run(self):
        with open(self.data, "w") as fh:
            fh.write("{not json")
        with self.assertRaises(ValueError):
            g.main(self.argv())
        self.assertFalse(os.path.exists(self.data))

    def test_a_scratch_file_inside_a_checkout_is_refused(self):
        inside = os.path.join(self.wiki, "grade.json")
        with open(inside, "w") as fh:
            json.dump({"days": {}}, fh)
        with self.assertRaises(SystemExit):
            g.main(self.argv(inside))


if __name__ == "__main__":
    unittest.main()
