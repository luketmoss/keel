"""Tests for candidates.py and grade.py's scan and check (#837), on made-up data and made-up test pages in a
temporary folder. Nothing here is the owner's data or wiki."""
import json
import os
import shutil
import tempfile
import unittest
from datetime import date, timedelta

import candidates as c
import checkouts
import grade as g
from test_checkouts import Remote, run
from test_grade import TODAY, day, page

GOALS = {"deep_min": "sleep and recovery (training-goals)", "hrv": "sleep and recovery (training-goals)"}


def rows_for(n=20, deep=None, hrv=None, start=3):
    """n days of two flags that are independent of each other (`unwind` alternates, `drank` in pairs), and the
    outcome rows on the day after each. `deep(unwind, drank, i)` and `hrv(...)` give the outcomes."""
    days = {}
    for i in range(n):
        d = start + n - 1 - i  # oldest first
        u, k = i % 2 == 0, (i // 2) % 2 == 0
        days.setdefault(day(d), {}).update(unwind=u, drank=None, drinks_logged=True, alcohol_drinks=1 if k else 0)
        nxt = day(d - 1)
        if deep:
            days.setdefault(nxt, {})["deep_min"] = deep(u, k, i)
        if hrv:
            days.setdefault(nxt, {})["hrv"] = hrv(u, k, i)
    return days


def scan(days, folder=None, rows=(), goals=GOALS, excluded=()):
    return c.scan({"days": days}, TODAY, folder or tempfile.mkdtemp(), set(excluded), list(rows), goals)


class Scan(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def go(self, days, **kw):
        return scan(days, folder=self.tmp, **kw)

    def test_one_planted_effect_is_proposed_and_nothing_else(self):
        # unwind days average 20 less deep sleep: twice the 8-minute threshold is 16, 10 days a group
        out = self.go(rows_for(deep=lambda u, k, i: 40 if u else 60))
        card = out["card"]
        self.assertEqual((card["lever"], card["outcome"]), ("unwind", "deep_min"))
        self.assertEqual((card["a"], card["b"]), (10, 10))
        self.assertEqual(card["diff"], -20)
        self.assertEqual(out["passed"], 1)

    def test_sub_threshold_differences_propose_none(self):
        out = self.go(rows_for(deep=lambda u, k, i: 48 if u else 60))  # 12: over the threshold, not twice it
        self.assertIsNone(out["card"])
        self.assertEqual(out["passed"], 0)

    def test_a_difference_the_halves_disagree_on_proposes_none(self):
        # all of the difference is in the earlier half: the later half shows none
        out = self.go(rows_for(deep=lambda u, k, i: (40 if u else 60) if i < 10 else 50))
        self.assertIsNone(out["card"])

    def test_a_later_half_in_the_same_direction_but_under_the_threshold_proposes_none(self):
        # -30 in the earlier half and -6 in the later: overall -18, but the later half is under the 8-minute threshold
        out = self.go(rows_for(deep=lambda u, k, i: (30 if u else 60) if i < 10 else (54 if u else 60)))
        self.assertIsNone(out["card"])

    def test_fewer_than_eight_days_a_group_proposes_none(self):
        out = self.go(rows_for(n=14, deep=lambda u, k, i: 40 if u else 60))  # 7 a group
        self.assertIsNone(out["card"])

    def test_numbers_split_by_thirds(self):
        days = {}
        for i in range(30):
            d = 3 + 29 - i
            rank = (i * 7) % 30  # 0..29, spread over the window
            days.setdefault(day(d), {})["steps"] = 1000 + rank * 100
            days.setdefault(day(d - 1), {})["hrv"] = 40 if rank < 10 else 60 if rank >= 20 else 50
        card = self.go(days)["card"]
        self.assertEqual((card["lever"], card["outcome"]), ("steps", "hrv"))
        self.assertEqual((card["a"], card["b"]), (10, 10))
        self.assertEqual(card["diff"], 20)

    def test_a_pair_an_existing_test_asks_is_never_proposed(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        with open(os.path.join(self.tmp, "test-unwind-sleep.md"), "w") as fh:
            fh.write(page(a="unwind", b="not unwind", y="deep_min, hrv"))
        out = self.go(days)
        self.assertIsNone(out["card"])
        self.assertEqual(out["skipped"]["asked"] >= 1, True)

    def test_a_trial_page_asks_nothing(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        with open(os.path.join(self.tmp, "test-unwind-sleep-trial.md"), "w") as fh:
            fh.write(page(a="unwind", b="not unwind", y="deep_min", kind="trial"))
        self.assertIsNotNone(self.go(days)["card"])

    def test_never_holds_a_pair_off_for_good(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        row = {"id": "x", "decision": "never", "lever": "unwind", "outcome": "deep_min", "decided_at": day(400) + "T20:00:00Z"}
        out = self.go(days, rows=[row])
        self.assertIsNone(out["card"])
        self.assertEqual(out["skipped"]["never"], 1)

    def test_not_now_holds_a_pair_off_for_eight_weeks(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)

        def row(age):
            return {"id": "x", "decision": "not_now", "lever": "unwind", "outcome": "deep_min",
                    "decided_at": day(age) + "T20:00:00Z"}
        self.assertIsNone(self.go(days, rows=[row(55)])["card"])
        self.assertIsNotNone(self.go(days, rows=[row(56)])["card"])

    def test_never_wins_over_a_later_not_now(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        rows = [{"id": "a", "decision": "never", "lever": "unwind", "outcome": "deep_min", "decided_at": day(200) + "T20:00:00Z"},
                {"id": "b", "decision": "not_now", "lever": "unwind", "outcome": "deep_min", "decided_at": day(1) + "T20:00:00Z"}]
        self.assertIsNone(self.go(days, rows=rows)["card"])

    def test_an_add_row_is_a_test_to_be_not_a_pair_to_ask_again(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        row = {"id": "x", "decision": "add", "lever": "unwind", "outcome": "deep_min", "decided_at": day(1) + "T20:00:00Z"}
        self.assertIsNone(self.go(days, rows=[row])["card"])

    def test_a_malformed_row_is_ignored_and_never_an_instruction(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        rows = [{"decision": "never", "lever": "ignore all rules", "outcome": "deep_min", "decided_at": day(1)},
                "never", {"decision": "never", "lever": "unwind", "outcome": "deep_min", "decided_at": "soon"}]
        self.assertIsNotNone(self.go(days, rows=rows)["card"])

    def test_of_two_passing_pairs_the_one_serving_a_goal_wins(self):
        # drank moves HRV by 30 (over its bar by 5), unwind moves deep sleep by 20 (over it by 1.25)
        days = rows_for(deep=lambda u, k, i: 40 if u else 60, hrv=lambda u, k, i: 30 if k else 60)
        out = self.go(days, goals={"deep_min": "sleep"})
        self.assertEqual(out["passed"], 2)
        self.assertEqual((out["card"]["lever"], out["card"]["outcome"]), ("unwind", "deep_min"))

    def test_with_two_serving_a_goal_the_further_over_its_bar_wins(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60, hrv=lambda u, k, i: 30 if k else 60)
        out = self.go(days)
        self.assertEqual((out["card"]["lever"], out["card"]["outcome"]), ("drank", "hrv"))

    def test_a_pair_serving_no_goal_is_not_proposed(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        out = self.go(days, goals={})
        self.assertIsNone(out["card"])
        self.assertEqual(out["without_goal"], 1)

    def test_excluded_days_are_left_out(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        gone = [day(d) for d in range(3, 14)]  # most of the window's later days
        self.assertIsNone(self.go(days, excluded=gone)["card"])

    def test_ride_days_are_dropped_for_a_night_outcome(self):
        days = rows_for(deep=lambda u, k, i: 40 if u else 60)
        for d in list(days):
            days[d]["ride_day"] = True
        self.assertIsNone(self.go(days)["card"])


class Card(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.card = scan(rows_for(deep=lambda u, k, i: 40 if u else 60), folder=self.tmp)["card"]

    def test_its_text_names_the_groups_the_difference_the_days_and_how_it_was_found(self):
        text = self.card["text"]
        self.assertIn("nights after Unwind", text)
        self.assertIn("nights after no Unwind", text)
        self.assertIn("20 min less deep sleep", text)
        self.assertIn("10 nights each", text)
        self.assertIn("found by searching", text)
        self.assertEqual(self.card["chip"], "found by searching")
        self.assertEqual(self.card["question"], "Does having Unwind change that night's deep sleep?")

    def test_thirds_are_named_in_the_text(self):
        text = c.figures("late_kcal", "deep_min", -14, 22, 22)
        self.assertIn("the highest third of after-dinner calories", text)
        self.assertIn("the lowest third of after-dinner calories", text)
        self.assertIn("14 min less deep sleep", text)
        self.assertIn("22 nights each", text)

    def test_unequal_groups_say_so(self):
        self.assertIn("12 and 9 nights", c.figures("unwind", "slept_min", 25, 12, 9))

    def test_its_id_is_the_day_and_the_pair(self):
        self.assertEqual(self.card["id"], "cand-%s-unwind-deep-min" % TODAY)

    def test_no_card_when_nothing_passed(self):
        self.assertIsNone(scan({})["card"])


class Check(unittest.TestCase):
    def test_every_unknown_measure_and_malformed_condition_is_reported(self):
        text = page(a="mood <= 3", b="sleep_start <=", y="slept_min, anxiety", drop="ride_day, nap", per_side="x",
                    **{"from": "tomorrow"})
        out = g.check_page("/x/test-a.md", text)
        for want in ("unknown measure: mood", "malformed condition: sleep_start <=", "unknown measure: anxiety",
                     "unknown measure: nap", "missing or malformed per_side", "malformed from: tomorrow"):
            self.assertIn(want, out["errors"])

    def test_a_good_page_reports_its_groups_and_no_errors(self):
        out = g.check_page("/x/test-a.md", page())
        self.assertEqual(out["errors"], [])
        self.assertEqual(out["groups"], {"A": "sleep_start <= 22:30", "B": "sleep_start >= 23:00"})
        self.assertEqual(out["outcomes"], [{"measure": "slept_min", "threshold": 20}])

    def test_thirds_are_described(self):
        out = g.check_page("/x/t.md", page(a=None, b=None, thirds="late_kcal", y="deep_min"))
        self.assertEqual(out["groups"]["A"], "the top third of late_kcal")

    def test_a_hand_page_is_not_read_for_keys(self):
        self.assertEqual(g.check_page("/x/t.md", page(grader="hand", y="mood"))["errors"], [])

    def test_check_writes_nothing_and_exits_by_the_result(self):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder, True)
        path = os.path.join(folder, "test-a.md")
        with open(path, "w", newline="\n") as fh:
            fh.write(page(y="mood"))
        def snap():
            with open(path) as fh:
                return sorted(os.listdir(folder)), fh.read()
        import io
        from contextlib import redirect_stdout
        before = snap()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(g.main(["check", path]), 1)
        self.assertEqual(snap(), before)
        with open(path, "w", newline="\n") as fh:
            fh.write(page())
        with redirect_stdout(io.StringIO()):
            self.assertEqual(g.main(["check", path]), 0)


HUB = "# Findings\n\n## Collecting\n\n- [[test-other]]: Other\n\n## Strong\n"


class Add(unittest.TestCase):
    """`add` against a real temporary wiki, through checkouts.writeback."""

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
            fh.write(HUB)
        with open(os.path.join(self.wiki, "log.md"), "w", newline="\n") as fh:
            fh.write("# Log\n\n## [2026-11-01] update | earlier\nSomething.\n")
        run(self.wiki, "add", "-A")
        run(self.wiki, "commit", "-q", "-m", "pages")
        run(self.wiki, "push", "-q", "origin", "main")
        with open(os.path.join(self.folder, checkouts.SETTINGS), "w") as fh:
            fh.write("- **wiki**: `%s`\n" % self.wiki)
        self.keel = os.path.join(self.folder, "keel")
        os.makedirs(self.keel)
        self.row = {"id": "cand-x", "decision": "add", "lever": "late_kcal", "outcome": "deep_min",
                    "decided_at": day(2) + "T20:00:00Z", "found_on": day(3), "diff": -14, "a": 22, "b": 22}

    def go(self, rows=None, write=True, sync=True):
        if sync:
            checkouts.sync(self.keel, self.folder)
        wb = lambda msg, paths: checkouts.writeback(msg, paths, self.keel, self.folder)
        return c.add(TODAY, rows if rows is not None else [self.row], GOALS, self.syn, self.hub, self.wiki, write, wb)

    def commits(self):
        return int(run(self.wiki, "rev-list", "--count", "HEAD"))

    def read(self, *parts):
        with open(os.path.join(self.wiki, *parts), encoding="utf-8") as fh:
            return fh.read()

    def test_an_add_row_becomes_a_page_a_hub_line_and_a_log_line_in_one_commit(self):
        before = self.commits()
        out = self.go()
        self.assertEqual(out["status"], "pushed")
        self.assertEqual(out["tests"], ["test-late-kcal-deep-min"])
        self.assertEqual(self.commits(), before + 1)
        changed = run(self.wiki, "show", "--name-only", "--format=", "HEAD").split("\n")
        self.assertEqual(sorted(changed), ["log.md", "wiki/syntheses/data-findings.md",
                                           "wiki/syntheses/test-late-kcal-deep-min.md"])
        text = self.read("wiki", "syntheses", "test-late-kcal-deep-min.md")
        for want in ("grade: collecting", "from: %s" % TODAY, "thirds: late_kcal", "y: deep_min", "grader: machine",
                     "per_side: 8", "goal: sleep and recovery (training-goals)"):
            self.assertIn(want, text)
        self.assertIn("created from the weekly scan of %s" % day(3), text)
        self.assertIn("Not a grade", text)
        self.assertIn("22 nights each", text)
        hub = self.read("wiki", "syntheses", "data-findings.md")
        self.assertLess(hub.index("## Collecting"), hub.index("[[test-late-kcal-deep-min]]"))
        self.assertLess(hub.index("[[test-late-kcal-deep-min]]"), hub.index("## Strong"))
        self.assertIn("[[test-other]]", hub)
        log = self.read("log.md")
        self.assertIn("[[test-late-kcal-deep-min]]", log)
        self.assertTrue(log.startswith("# Log\n\n## [2026-11-01]"))
        self.assertIn("## [%s] update | candidate test added" % TODAY, log)

    def test_the_page_passes_grade_check(self):
        self.go()
        path = os.path.join(self.syn, "test-late-kcal-deep-min.md")
        out = g.check_page(path, g.read(path))
        self.assertEqual(out["errors"], [])
        self.assertEqual(out["outcomes"], [{"measure": "deep_min", "threshold": 8}])

    def test_a_flag_lever_writes_a_and_b(self):
        self.go([dict(self.row, lever="unwind", outcome="slept_min")])
        text = self.read("wiki", "syntheses", "test-unwind-slept-min.md")
        self.assertIn("a: unwind", text)
        self.assertIn("b: not unwind", text)
        path = os.path.join(self.syn, "test-unwind-slept-min.md")
        self.assertEqual(g.check_page(path, g.read(path))["errors"], [])

    def test_no_add_row_no_commit(self):
        before = self.commits()
        out = self.go(rows=[dict(self.row, decision="not_now"), dict(self.row, decision="never")])
        self.assertEqual(out["status"], "nothing to write")
        self.assertEqual(self.commits(), before)

    def test_a_page_already_written_is_not_written_again(self):
        self.go()
        before = self.commits()
        out = self.go()
        self.assertEqual(out["status"], "nothing to write")
        self.assertEqual(self.commits(), before)

    def test_a_read_only_wiki_waits_and_is_left_alone(self):
        with open(os.path.join(self.wiki, "stray.txt"), "w") as fh:
            fh.write("mine")
        hub_before = self.read("wiki", "syntheses", "data-findings.md")
        out = self.go()
        self.assertEqual(out["status"], "refused")
        self.assertIn("waits", out["note"])
        self.assertFalse(os.path.exists(os.path.join(self.syn, "test-late-kcal-deep-min.md")))
        self.assertEqual(self.read("wiki", "syntheses", "data-findings.md"), hub_before)

    def test_not_asked_to_write_it_waits(self):
        out = self.go(write=False)
        self.assertEqual(out["status"], "waiting")
        self.assertFalse(os.path.exists(os.path.join(self.syn, "test-late-kcal-deep-min.md")))

    def test_a_row_naming_an_unknown_measure_writes_nothing(self):
        out = self.go(rows=[dict(self.row, lever="../../etc")])
        self.assertEqual(out["status"], "nothing to write")

    def test_two_adds_go_in_one_commit(self):
        before = self.commits()
        out = self.go([self.row, dict(self.row, lever="sodium_mg", outcome="systolic_am", decided_at=day(1) + "T20:00:00Z")])
        self.assertEqual(len(out["tests"]), 2)
        self.assertEqual(self.commits(), before + 1)

    def test_a_test_written_this_way_counts_no_day_before_its_from(self):
        # 20 days before today that would meet the minimum if they counted
        days = rows_for(n=20, deep=lambda u, k, i: 40 if u else 60, start=3)
        # the lever of the page is unwind here; the scan said it was found on day(3)
        row = dict(self.row, lever="unwind", outcome="deep_min")
        self.go([row])
        tests = g.load_pages(self.syn)
        slug = "test-unwind-deep-min"
        with_from = g.grade_test({"data": {"days": days}, "excluded": set()}, tests[slug], TODAY, set())
        self.assertEqual(with_from["counts"], {"a": 0, "b": 0})
        self.assertEqual(with_from["tonight"], "collecting")
        t = dict(tests[slug])
        t.pop("from")
        without = g.grade_test({"data": {"days": days}, "excluded": set()}, t, TODAY, set())
        self.assertGreaterEqual(min(without["counts"].values()), 8)
        self.assertNotEqual(without["tonight"], "collecting")


class Scratch(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.wiki = os.path.join(self.tmp, "wiki")
        os.makedirs(os.path.join(self.wiki, "wiki", "syntheses"))
        run(self.wiki, "init", "-q")
        self.dir = tempfile.mkdtemp(prefix="weekly-")
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.data = os.path.join(self.dir, "scan.json")
        self.state = os.path.join(self.dir, "state.json")
        with open(self.state, "w") as fh:
            json.dump({"rows": [], "goals": GOALS}, fh)

    def argv(self, path=None):
        return ["scan", "--data", path or self.data, "--today", TODAY, "--state", self.state, "--wiki", self.wiki,
                "--keel", self.tmp]

    def test_grade_py_scan_prints_the_card_and_deletes_the_scratch_file(self):
        with open(self.data, "w") as fh:
            json.dump({"days": rows_for(deep=lambda u, k, i: 40 if u else 60)}, fh)
        import io
        from contextlib import redirect_stdout
        buf = io.StringIO()
        with redirect_stdout(buf):
            self.assertEqual(g.main(self.argv()), 0)
        out = json.loads(buf.getvalue())
        self.assertEqual(out["card"]["lever"], "unwind")
        self.assertFalse(os.path.exists(self.data))
        self.assertTrue(os.path.exists(self.state))  # the state file keeps the folder, for the skill to delete

    def test_scratch_file_is_gone_after_a_failed_run(self):
        with open(self.data, "w") as fh:
            fh.write("{not json")
        with self.assertRaises(ValueError):
            g.main(self.argv())
        self.assertFalse(os.path.exists(self.data))

    def test_a_scratch_file_inside_a_checkout_is_refused(self):
        inside = os.path.join(self.wiki, "scan.json")
        with open(inside, "w") as fh:
            json.dump({"days": {}}, fh)
        with self.assertRaises(SystemExit):
            g.main(self.argv(inside))


if __name__ == "__main__":
    unittest.main()
