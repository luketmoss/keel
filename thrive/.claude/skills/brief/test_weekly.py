"""Tests for weekly.py (#832), on made-up data and a made-up wiki in a temporary folder.
Nothing here is the owner's data or wiki."""
import os
import shutil
import subprocess
import tempfile
import unittest

import weekly as w

SUNDAY = "2026-11-08"
MON, TUE, WED, THU, SAT = "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-07"

BLOCK = """---
title: Training Block - Made Up
type: project
domain: training
status: active
tags: [training, block]
created: 2026-10-09
updated: 2026-11-01
---

# Training Block - Made Up

## Week of 2026-11-02

- Mon: Legs A

## Outcome log

Append dated results here.

- **2026-10-25 review.** An earlier entry.

## Related

- [[training]]
"""

OTHER = """---
title: Some Project
type: project
domain: training
status: active
tags: [brief]
---

# Some Project

## Outcome log

- nothing
"""

TEST_PAGE = """---
title: Water gaps and the day's total
type: synthesis
kind: watching
grade: leaning
---

# Water gaps

## Timeline

- **2026-10-20:** **none → collecting**. Not enough days.
- **2026-11-04:** **collecting → leaning**. Enough days.
- **2026-11-06:** **leaning → strong**. More days.
"""

TRIAL_PAGE = TEST_PAGE.replace("kind: watching", "kind: trial")


def p(day, title, typ="weight"):
    return {"day": day, "title": title, "type": typ}


class Dates(unittest.TestCase):
    def test_sunday_covers_monday_to_sunday(self):
        self.assertEqual(w.week_range(SUNDAY), ("2026-11-02", "2026-11-08"))

    def test_another_day_covers_the_seven_days_before(self):
        self.assertEqual(w.week_range("2026-11-04"), ("2026-10-28", "2026-11-03"))


class PlanAgainstDone(unittest.TestCase):
    def rows(self, plan, done, notes=None):
        return w.plan_against_done(plan, done, notes or {})

    def test_the_four_statuses(self):
        plan = [p(MON, "3 - Legs A"), p(TUE, "Stretch", "stretch"), p(WED, "4 - Upper Push B"),
                p(SAT, "Gravel ride", "bike")]
        done = [p(MON, "3 - Legs A"), p(TUE, "An easy walk", "walk"), p(THU, "4 - Upper Push B")]
        notes = {TUE: "foot sore after Sunday"}
        r = self.rows(plan, done, notes)
        self.assertEqual([x["status"] for x in r],
                         ["Done", "Swapped for An easy walk", "Done, moved from Wednesday", "Missed"])
        self.assertEqual(r[1]["why"], "foot sore after Sunday")

    def test_a_miss_or_swap_with_no_note_is_not_explained(self):
        r = self.rows([p(SAT, "Gravel ride", "bike"), p(TUE, "Stretch", "stretch")], [p(TUE, "Walk", "walk")])
        self.assertEqual({x["title"]: x["why"] for x in r},
                         {"Gravel ride": w.NOT_EXPLAINED, "Stretch": w.NOT_EXPLAINED})

    def test_a_session_done_as_planned_has_no_why(self):
        self.assertIsNone(self.rows([p(MON, "Legs")], [p(MON, "Legs")], {MON: "felt good"})[0]["why"])

    def test_a_moved_session_without_a_note_has_no_why(self):
        self.assertIsNone(self.rows([p(MON, "Legs")], [p(TUE, "Legs")])[0]["why"])

    def test_one_done_session_is_not_used_twice(self):
        r = self.rows([p(MON, "Legs"), p(TUE, "Legs")], [p(TUE, "Legs")])
        self.assertEqual([x["status"] for x in r], ["Missed", "Done"])

    def test_a_long_note_is_cut(self):
        r = self.rows([p(SAT, "Ride", "bike")], [], {SAT: "x" * 300})
        self.assertLessEqual(len(r[0]["why"]), w.QUOTE_MAX)

    def test_nothing_planned(self):
        out = w.pad({"plan": [], "done": [p(MON, "Legs")], "targets": {"lift": "3"}})
        self.assertEqual(out["empty"], "Nothing was planned this week.")
        self.assertEqual(out["targets"], "1 of 3 lifts")

    def test_targets_line_reports_a_ride_without_scoring_it(self):
        done = [p(MON, "a"), p(WED, "b"), p(TUE, "s", "stretch")]
        line = w.targets_line(done, {"lift": "3", "stretch": "1–2", "ride": "about 1"})
        self.assertEqual(line, "2 of 3 lifts · 1 of 1–2 stretches · 0 of about 1 ride")


class Meals(unittest.TestCase):
    DAYS = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]

    def test_every_dinner_planned_gives_none(self):
        self.assertEqual(w.meal_suggestions({"days": self.DAYS, "dinners": self.DAYS}), [])

    def test_at_most_two_each_naming_day_and_gap(self):
        out = w.meal_suggestions({"days": self.DAYS, "dinners": self.DAYS[:3], "library": []})
        self.assertEqual(len(out), 2)
        self.assertTrue(all(m["kind"] == "meal" for m in out))
        self.assertIn("Nothing planned for Thursday dinner", out[0]["why"])

    def test_a_full_evening_goes_first_and_is_named(self):
        out = w.meal_suggestions({"days": self.DAYS, "dinners": self.DAYS[:3] + self.DAYS[5:],
                                  "evenings": {"2026-11-13": "Friday's calendar is full until 6:30."}})
        self.assertEqual([m["date"] for m in out], ["2026-11-12", "2026-11-13"])
        self.assertIn("full until 6:30", out[1]["why"])

    def test_a_recipe_the_library_lacks_is_never_named(self):
        f = {"days": self.DAYS, "dinners": self.DAYS[1:], "library": ["Chili"],
             "picks": {"2026-11-09": "Moussaka"}}
        out = w.meal_suggestions(f)
        self.assertIsNone(out[0]["recipe"])
        self.assertNotIn("Moussaka", out[0]["title"])
        f["picks"] = {"2026-11-09": "chili"}
        self.assertEqual(w.meal_suggestions(f)[0]["title"], "Monday dinner: Chili")


class Wiki(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.wiki = os.path.join(self.dir, "wiki-repo")
        os.makedirs(os.path.join(self.wiki, "wiki", "projects"))
        os.makedirs(os.path.join(self.wiki, "wiki", "syntheses"))
        self.write("wiki/projects/block.md", BLOCK)
        self.write("wiki/projects/other.md", OTHER)
        self.write("wiki/syntheses/test-water.md", TEST_PAGE)
        self.write("wiki/syntheses/test-water-trial.md", TRIAL_PAGE)
        self.write("log.md", "# Log\n\n## [2026-11-05] schema | something\nText.\n")
        for args in (["init", "-q", "-b", "main"], ["add", "-A"],
                     ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "start"]):
            subprocess.run(["git", "-C", self.wiki] + args, check=True, capture_output=True)
        self.calls = []

    def write(self, rel, text):
        path = os.path.join(self.wiki, *rel.split("/"))
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)

    def read(self, rel):
        with open(os.path.join(self.wiki, *rel.split("/")), encoding="utf-8", newline="") as fh:
            return fh.read()

    def wb(self, result):
        def fn(message, paths):
            self.calls.append((message, list(paths)))
            return result
        return fn

    def file(self, today=SUNDAY, result=None):
        week = w.week_range(today)
        rows = w.plan_against_done([p(MON, "Legs A"), p(SAT, "Gravel ride", "bike")], [p(MON, "Legs A")], {})
        review = {"figures": [{"text": "Slept 7:05 on average", "read": today}], "approach": None,
                  "proposal": ["Keep Monday's lift."]}
        return w.file_review(self.wiki, week, today, rows, "1 of 3 lifts", review,
                             self.wb(result or {"status": "pushed"}))

    def test_a_sunday_run_appends_one_entry_and_one_log_line_in_one_commit(self):
        self.assertEqual(self.file()["state"], "filed")
        block = self.read("wiki/projects/block.md")
        self.assertEqual(block.count("weekly review, week of 2026-11-02"), 1)
        self.assertLess(block.index("An earlier entry."), block.index("weekly review, week of"))
        self.assertLess(block.index("weekly review, week of"), block.index("## Related"))
        self.assertIn("Gravel ride: Missed · not explained in your notes", block)
        self.assertIn("Slept 7:05 on average (read 2026-11-08)", block)
        self.assertIn("No success criteria were recorded", block)
        self.assertIn("Proposed for next week (proposed, not decided)", block)
        self.assertIn("updated: 2026-11-08", block)
        log = self.read("log.md")
        self.assertEqual(log.count("weekly review, week of 2026-11-02"), 1)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(sorted(self.calls[0][1]), ["log.md", "wiki/projects/block.md"])

    def test_nothing_else_is_written(self):
        before = {n: self.read(n) for n in ("wiki/projects/other.md", "wiki/syntheses/test-water.md")}
        self.file()
        for n, t in before.items():
            self.assertEqual(self.read(n), t)

    def test_a_filed_week_is_not_filed_twice(self):
        self.file()
        self.calls.clear()
        self.assertEqual(self.file()["state"], "filed")
        self.assertEqual(self.calls, [])
        self.assertEqual(self.read("wiki/projects/block.md").count("weekly review, week of 2026-11-02"), 1)

    def test_another_day_files_nothing(self):
        before = self.read("wiki/projects/block.md")
        self.assertEqual(self.file(today="2026-11-04")["state"], "not_sunday")
        self.assertEqual(self.read("wiki/projects/block.md"), before)
        self.assertEqual(self.calls, [])

    def test_a_dirty_wiki_is_left_alone(self):
        self.write("wiki/projects/other.md", OTHER + "\nmine\n")
        before = self.read("wiki/projects/block.md")
        self.assertEqual(self.file()["state"], "left")
        self.assertEqual(self.read("wiki/projects/block.md"), before)
        self.assertEqual(self.calls, [])

    def test_a_refusal_restores_the_wiki(self):
        before = (self.read("wiki/projects/block.md"), self.read("log.md"))
        for reason in ("branch", "diverged"):
            res = self.file(result={"status": "refused", "reason": reason})
            self.assertEqual((res["state"], res["reason"]), ("left", reason))
            self.assertEqual((self.read("wiki/projects/block.md"), self.read("log.md")), before)

    def test_a_failed_push_keeps_the_commit_and_says_so(self):
        res = self.file(result={"status": "not pushed", "reason": "push rejected"})
        self.assertEqual(res["state"], "not_pushed")
        self.assertIn("filed but not pushed yet", w.FILED_LINES["not_pushed"])
        self.assertIn("weekly review", self.read("wiki/projects/block.md"))

    def test_a_failed_commit_files_nothing(self):
        before = self.read("wiki/projects/block.md")
        res = self.file(result={"status": "not pushed", "reason": "commit failed"})
        self.assertEqual(res["state"], "left")
        self.assertEqual(self.read("wiki/projects/block.md"), before)

    def test_two_active_blocks_file_nothing(self):
        self.write("wiki/projects/second.md", BLOCK.replace("Made Up", "Second"))
        subprocess.run(["git", "-C", self.wiki, "add", "-A"], check=True, capture_output=True)
        subprocess.run(["git", "-C", self.wiki, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "x"],
                       check=True, capture_output=True)
        self.assertEqual(self.file()["state"], "no_block")

    def test_the_left_line_is_the_specified_copy(self):
        self.assertEqual(w.FILED_LINES["left"], "This week's review isn't filed: your wiki had changes of its own. "
                                                "/plan-week will read the weeks itself.")

    def test_grades_that_moved_get_one_line_and_trials_are_skipped(self):
        out = w.grade_moves(os.path.join(self.wiki, "wiki", "syntheses"), "2026-11-02", "2026-11-08")
        self.assertEqual([m["line"] for m in out], ["Water gaps and the day's total: collecting → strong"])

    def test_no_move_in_the_week_gives_no_line(self):
        self.assertEqual(w.grade_moves(os.path.join(self.wiki, "wiki", "syntheses"), "2026-11-09", "2026-11-15"), [])

    def test_run_without_write_asks_nothing_of_the_wiki(self):
        data = {"plan": [p(MON, "Legs A")], "done": [p(MON, "Legs A")]}
        out = w.run(data, SUNDAY, self.wiki, os.path.join(self.wiki, "wiki", "syntheses"))
        self.assertEqual(out["filed"]["state"], "not asked")
        self.assertEqual(out["pad"]["rows"][0]["status"], "Done")
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
