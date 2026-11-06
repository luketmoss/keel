"""Tests for trials.py (#831), on made-up data and made-up wiki pages in a temporary folder.
Nothing here is the owner's data or wiki."""
import copy
import os
import shutil
import tempfile
import unittest
from datetime import date, timedelta

import grade as g
import trials as t
from test_grade import page, sleepers, day, TODAY

OFFER = dict(
    trial_change="Lights out by {target} on weeknights", trial_lever="sleep_start <=", trial_target="22:15",
    trial_bounds="21:45..22:45", trial_step="15", trial_days="weeknights", goal="sleep and recovery (training-goals)",
    compare="asleep by 10:30 vs after 11:00")
HUB = """# Data findings

## Strong

- [[test-early-bed]]: earlier nights sleep longer.

## Excluded days

- 2026-10-01: travel

## Trials

*None yet.* One runs at a time.
"""


def cand(slug="test-a", grade_name="strong", rank_a=8, rank_b=8, **kw):
    c = {
        "slug": slug, "title": "A test", "grade": grade_name, "counts": {"a": rank_a, "b": rank_b}, "per_side": 3,
        "total": 8, "outcome": "slept_min", "threshold": 20.0,
        "primary_outcome": {"measure": "slept_min", "mean_a": 440.0, "mean_b": 385.0},
        "a_label": "Asleep by 10:30", "b_label": "After 11:00", "goal": "sleep and recovery",
        "offer": t.offer_from_fm(OFFER),
    }
    c.update(kw)
    return c


LOGGED = ["sleep_start", "slept_min"]


def inp(**kw):
    d = {"today": TODAY, "candidates": [cand()], "logged": LOGGED, "goal_rank": {"test-a": 0}, "rows": [],
         "pages": [], "busy": []}
    d.update(kw)
    return d


def next_days(start_offset, n):
    first = date.fromisoformat(TODAY) + timedelta(days=start_offset)
    return [(first + timedelta(days=i)).isoformat() for i in range(n)]


class Proposal(unittest.TestCase):
    def card(self, **kw):
        return t.propose(inp(**kw))["card"]

    def test_fixtures_meeting_every_condition_propose_exactly_one_trial_the_top_goals(self):
        a, b = cand("test-a"), cand("test-b")
        card = self.card(candidates=[b, a], goal_rank={"test-a": 0, "test-b": 1})
        self.assertEqual(card["slug"], "test-a")
        self.assertEqual(card["id"], "tr-%s-a" % TODAY)

    def test_a_running_or_accepted_trial_proposes_none(self):
        running = {"status": "running", "proposal": "tr-x"}
        self.assertIsNone(self.card(pages=[running]))
        self.assertIsNone(self.card(rows=[{"id": "tr-y", "decision": "accept", "slug": "test-z",
                                           "decided_at": TODAY + "T20:00:00Z"}]))

    def test_an_accept_row_a_page_already_carries_is_not_accepted_any_more(self):
        done = {"status": "worked", "proposal": "tr-y"}
        row = {"id": "tr-y", "decision": "accept", "slug": "test-a", "decided_at": day(30) + "T20:00:00Z"}
        self.assertIsNotNone(self.card(pages=[done], rows=[row]))

    def test_each_condition_failed_on_its_own_stops_it(self):
        cases = {
            "no goal": dict(goal_rank={}),
            "lever not logged": dict(logged=["slept_min"]),
            "outcome not logged": dict(logged=["sleep_start"]),
            "collecting and can fill": dict(candidates=[cand(grade_name="collecting", rank_a=2, rank_b=2)]),
            "collecting, short of days": dict(candidates=[cand(grade_name="collecting", rank_a=1, rank_b=5)]),
            "ruled out": dict(candidates=[cand(grade_name="ruled-out")]),
            "calendar": dict(busy=next_days(2, 4)),
            "not now 20 days ago": dict(rows=[{"id": "r", "decision": "not_now", "slug": "test-a",
                                               "decided_at": day(20) + "T20:00:00Z"}]),
            "never": dict(rows=[{"id": "r", "decision": "never", "slug": "test-a", "decided_at": day(400) + "T20:00:00Z"}]),
        }
        for name, kw in cases.items():
            self.assertIsNone(self.card(**kw), name)

    def test_a_not_now_row_29_days_old_no_longer_stops_it(self):
        row = {"id": "r", "decision": "not_now", "slug": "test-a", "decided_at": day(29) + "T20:00:00Z"}
        self.assertIsNotNone(self.card(rows=[row]))
        self.assertIsNone(self.card(rows=[dict(row, decided_at=day(28) + "T20:00:00Z")]))

    def test_a_row_for_another_test_does_not_stop_it(self):
        row = {"id": "r", "decision": "never", "slug": "test-other", "decided_at": day(2) + "T20:00:00Z"}
        self.assertIsNotNone(self.card(rows=[row]))

    def test_a_quarter_of_the_days_busy_still_fits_and_one_more_does_not(self):
        self.assertIsNotNone(self.card(busy=next_days(2, 3)))
        self.assertIsNone(self.card(busy=next_days(2, 4)))
        # busy days outside the trial's own window do not count
        self.assertIsNotNone(self.card(busy=next_days(0, 2) + next_days(20, 5)))

    def test_a_cant_fill_test_qualifies(self):
        c = cand(grade_name="collecting", rank_a=1, rank_b=9, primary_outcome=None)
        card = self.card(candidates=[c])
        self.assertEqual(card["chip"], "Can't fill on its own")
        self.assertIn("haven't varied enough", card["why"])

    def test_ranked_by_goal_then_strong_before_leaning_before_cant_fill(self):
        c = [cand("test-a", "collecting", 1, 9, primary_outcome=None), cand("test-b", "leaning"), cand("test-c", "strong")]
        same = {"test-a": 0, "test-b": 0, "test-c": 0}
        self.assertEqual(self.card(candidates=c, goal_rank=same)["slug"], "test-c")
        self.assertEqual(self.card(candidates=c[:2], goal_rank=same)["slug"], "test-b")
        self.assertEqual(self.card(candidates=c, goal_rank={"test-a": 0, "test-b": 1, "test-c": 1})["slug"], "test-a")

    def test_the_card_holds_what_is_fixed_in_advance(self):
        card = self.card()
        self.assertEqual((card["period"], card["chip"], card["state"]), (14, "Strong", "proposed"))
        self.assertEqual(card["changeT"], "Lights out by {target} on weeknights")
        self.assertEqual((card["lo"], card["hi"], card["step"], card["kind"]), (21 * 60 + 45 + 0, 22 * 60 + 45, 15.0, "time"))
        self.assertEqual(card["value"], 22 * 60 + 15)
        self.assertIn("7:20 slept", card["why"])
        self.assertIn("6:25 (16 days)", card["why"])
        self.assertIn("Your goal: sleep and recovery.", card["why"])
        self.assertEqual(card["measured"], "minutes slept, weeknights, against your last 28 days.")
        self.assertEqual(card["success"], "you average 20 min more on the nights you hit the target.")


class Offer(unittest.TestCase):
    def test_reads_the_keys(self):
        o = t.offer_from_fm(OFFER)
        self.assertEqual((o["lever"], o["op"], o["days"], o["period"], o["better"]), ("sleep_start", "<=", "weeknights", 14, "higher"))

    def test_a_page_with_no_trial_keys_offers_none(self):
        self.assertIsNone(t.offer_from_fm({"goal": "x"}))

    def test_malformed_keys_are_reported(self):
        for bad in (dict(trial_change="no placeholder"), dict(trial_lever="mood <="), dict(trial_target="23:30"),
                    dict(trial_period="30"), dict(trial_days="sometimes"), dict(trial_step="0"),
                    dict(trial_lever="ride_day <=")):
            with self.assertRaises(t.Bad, msg=str(bad)):
                t.offer_from_fm(dict(OFFER, **bad))

    def test_a_target_is_stored_as_a_clock_time_or_a_number(self):
        self.assertEqual(t.to_row_value("time", 22 * 60 + 15), "22:15")
        self.assertEqual(t.to_row_value("time", 24 * 60 + 15), "00:15")
        self.assertEqual(t.to_row_value("num", 64.0), 64)
        self.assertEqual(t.parse_value("time", "00:15"), 24 * 60 + 15)


class Reading(unittest.TestCase):
    """A trial of lights out by 22:15 on weeknights, starting 2026-11-02 (a Monday), 14 days."""

    def setUp(self):
        c = cand()
        row = {"id": "tr-1", "decision": "accept", "target": "22:15", "slug": "test-a", "decided_at": "2026-10-31T20:00:00Z"}
        self.trial = t.parse_trial_page("/x/test-a-trial.md", t.page_text(c, row, "2026-11-01", "2026-11-02", "2026-10-31"))

    def data(self, on_target_nights=None):
        """Baseline nights of 6:30 slept before the start; trial days: weeknights at 22:00 and 7:30 slept."""
        days = {}
        for i in range(1, 29):
            d = date(2026, 11, 2) - timedelta(days=i)
            # the night after D is read from D + 1
            days[(d + timedelta(days=1)).isoformat()] = {"sleep_start": "23:30", "slept_min": 390}
        for i in range(14):
            d = date(2026, 11, 2) + timedelta(days=i)
            if d.weekday() in t.WEEKNIGHTS:
                days[(d + timedelta(days=1)).isoformat()] = {"sleep_start": "22:00", "slept_min": 450}
        return {"days": days}

    def ctx(self, data=None):
        return {"data": data or self.data(), "excluded": set()}

    def test_the_page_carries_the_agreed_fields(self):
        p = self.trial
        self.assertEqual(p["errors"], [])
        self.assertEqual((p["period"], p["start"], p["ends"], p["target"], p["days"]),
                         (14, "2026-11-02", "2026-11-15", 22 * 60 + 15, "weeknights"))
        self.assertEqual((p["outcome"], p["threshold"], p["minimum"], p["proposal"], p["test"]),
                         ("slept_min", 20.0, 3, "tr-1", "test-a"))
        self.assertEqual(p["change"], "Lights out by 10:15 PM on weeknights")

    def test_progress_counts_weeknights_on_target_and_the_outcome_so_far(self):
        ev = t.evaluate(self.trial, self.ctx(), "2026-11-05")  # Mon to Thu
        self.assertEqual((ev["on"], ev["counted"]), (4, 4))
        self.assertEqual((ev["mean_on"], ev["mean_base"]), (450, 390))
        self.assertEqual(t.progress_line(self.trial, ev),
                         "On target 4 of 4 weeknights so far · minutes slept on those nights: 7:30, against 6:30 before")

    def test_a_night_missed_is_counted_but_not_on_target(self):
        data = self.data()
        data["days"]["2026-11-04"]["sleep_start"] = "23:45"  # the night after Tuesday
        ev = t.evaluate(self.trial, self.ctx(data), "2026-11-05")
        self.assertEqual((ev["on"], ev["counted"]), (3, 4))

    def test_weekends_and_excluded_days_are_left_out(self):
        ev = t.evaluate(self.trial, {"data": self.data(), "excluded": {"2026-11-03"}}, "2026-11-08")
        self.assertEqual(ev["counted"], 4)  # Mon, Wed, Thu, Sun
        self.assertEqual(ev["total"], 9)

    def test_worked_didnt_work_and_not_enough_days(self):
        ev = t.evaluate(self.trial, self.ctx(), "2026-11-15")
        self.assertEqual(ev["result"], "worked")
        self.assertEqual((ev["on"], ev["total"]), (10, 10))
        data = self.data()
        for v in data["days"].values():
            if v["sleep_start"] == "22:00":
                v["slept_min"] = 400  # only 10 min more
        self.assertEqual(t.evaluate(self.trial, self.ctx(data), "2026-11-15")["result"], "didn't work")
        for v in data["days"].values():
            if v["sleep_start"] == "22:00":
                v["sleep_start"] = "23:30"
        ev = t.evaluate(self.trial, self.ctx(data), "2026-11-15")
        self.assertEqual((ev["on"], ev["result"]), (0, "not enough days"))

    def test_the_readout_states_the_figures(self):
        ev = t.evaluate(self.trial, self.ctx(), "2026-11-15")
        self.assertEqual(t.readout_line(self.trial, ev),
                         "On target 10 of 10 weeknights · 7:30 slept on them, against 6:30 before: 60 min more, past the 20 you set out.")

    def test_lower_is_better_flips_the_difference(self):
        tr = dict(self.trial, better="lower", outcome="resting_hr", threshold=2.0)
        data = {"days": {}}
        for i in range(1, 29):
            data["days"][(date(2026, 11, 2) - timedelta(days=i - 1)).isoformat()] = {"resting_hr": 60}
        for i in range(14):
            d = date(2026, 11, 2) + timedelta(days=i)
            data["days"][(d + timedelta(days=1)).isoformat()] = {"sleep_start": "22:00", "resting_hr": 55}
        ev = t.evaluate(tr, self.ctx(data), "2026-11-15")
        self.assertEqual(ev["result"], "worked")


class Wiki(unittest.TestCase):
    """The run end to end on a made-up wiki, with a writeback that records its calls."""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.dir, True)
        self.folder = os.path.join(self.dir, "wiki", "syntheses")
        os.makedirs(self.folder)
        self.hub = os.path.join(self.folder, "data-findings.md")
        g.put(self.hub, HUB)
        g.put(os.path.join(self.folder, "test-early-bed.md"), page(per_side="3", total="8", **OFFER))
        self.calls = []
        self.refuse = False

    def writeback(self, msg, paths):
        self.calls.append((msg, sorted(os.path.basename(p) for p in paths)))
        return {"status": "refused", "reason": "changes"} if self.refuse else {"status": "pushed"}

    def run_night(self, data, today, rows=None, write=True, busy=None):
        state = {"rows": rows or [], "busy": busy or [], "goal_rank": {"test-early-bed": 0}, "nightly_url": "https://x/n"}
        tests, fms = {}, {}
        import glob
        for path in glob.glob(os.path.join(self.folder, "test-*.md")):
            text = g.read(path)
            fm = g.frontmatter(g.split_page(text)[0])
            if fm.get("kind") == "trial":
                continue
            x = g.parse_test(path, text)
            tests[x["slug"]], fms[x["slug"]] = x, fm
        ctx = {"data": data, "excluded": g.read_excluded(g.read(self.hub))}
        results = {s: g.grade_test(ctx, x, today, set()) for s, x in tests.items()}
        return t.run(data, today, state, tests, fms, results, t.load_trial_pages(self.folder), ctx["excluded"],
                     g.read(self.hub), writable=write, hub=self.hub, writeback=self.writeback)

    def seed(self):
        return {"days": sleepers(8, 8)}

    ACCEPT = {"id": "tr-%s-early-bed" % TODAY, "decision": "accept", "target": "22:00", "slug": "test-early-bed",
              "decided_at": TODAY + "T21:41:00Z"}

    def trial_path(self):
        return os.path.join(self.folder, "test-early-bed-trial.md")

    def test_with_fixtures_it_proposes_one_card_and_writes_nothing(self):
        out = self.run_night(self.seed(), TODAY)
        self.assertEqual(out["card"]["state"], "proposed")
        self.assertEqual(out["card"]["slug"], "test-early-bed")
        self.assertEqual(self.calls, [])
        self.assertEqual(out["weekly"], {"text": "A trial is waiting for your answer on tonight's brief.", "href": "https://x/n"})

    def test_the_first_run_after_an_accept_creates_the_page_and_the_hub_entry_in_one_commit(self):
        today = (date.fromisoformat(TODAY) + timedelta(days=1)).isoformat()
        out = self.run_night(self.seed(), today, rows=[dict(self.ACCEPT)])
        self.assertEqual(self.calls, [("brief: trial test-early-bed-trial", ["data-findings.md", "test-early-bed-trial.md"])])
        text = g.read(self.trial_path())
        fm = g.frontmatter(g.split_page(text)[0])
        self.assertEqual(fm["kind"], "trial")
        self.assertEqual(fm["start"], (date.fromisoformat(today) + timedelta(days=1)).isoformat())
        self.assertEqual((fm["target"], fm["change"], fm["period"], fm["outcome"], fm["threshold"]),
                         ("22:00", "Lights out by 10:00 PM on weeknights", "14 days", "slept_min", "20"))
        hub = g.read(self.hub)
        self.assertIn("### Running\n- [[test-early-bed-trial]]", hub)
        self.assertNotIn("None yet", hub)
        self.assertEqual(out["card"]["state"], "accepted")
        self.assertTrue(out["card"]["recorded"])

    def test_a_read_only_wiki_creates_nothing_and_the_next_run_starts_a_day_after_itself(self):
        d1 = (date.fromisoformat(TODAY) + timedelta(days=1)).isoformat()
        out = self.run_night(self.seed(), d1, rows=[dict(self.ACCEPT)], write=False)
        self.assertFalse(os.path.exists(self.trial_path()))
        self.assertEqual(self.calls, [])
        self.assertTrue(out["card"]["waits"])
        self.assertIn("wiki not writable", out["note"])
        d2 = (date.fromisoformat(TODAY) + timedelta(days=2)).isoformat()
        self.run_night(self.seed(), d2, rows=[dict(self.ACCEPT)])
        fm = g.frontmatter(g.split_page(g.read(self.trial_path()))[0])
        self.assertEqual(fm["start"], (date.fromisoformat(d2) + timedelta(days=1)).isoformat())

    def test_a_refused_writeback_leaves_the_wiki_as_it_was_and_the_trial_waits(self):
        self.refuse = True
        d1 = (date.fromisoformat(TODAY) + timedelta(days=1)).isoformat()
        before = g.read(self.hub)
        out = self.run_night(self.seed(), d1, rows=[dict(self.ACCEPT)])
        self.assertFalse(os.path.exists(self.trial_path()))
        self.assertEqual(g.read(self.hub), before)
        self.assertIn("wiki not writable", out["note"])

    def create(self, start="2026-11-02"):
        c = t.candidate(g.parse_test("/x/test-early-bed.md", g.read(os.path.join(self.folder, "test-early-bed.md"))),
                        None, g.frontmatter(g.split_page(g.read(os.path.join(self.folder, "test-early-bed.md")))[0]),
                        graded=False)
        row = dict(self.ACCEPT, id="tr-1", target="22:15")
        g.put(self.trial_path(), t.page_text(c, row, "2026-11-01", start, "2026-10-31"))
        g.put(self.hub, t.edit_hub_trials(g.read(self.hub), "test-early-bed-trial", "- [[test-early-bed-trial]]: x. Running.", False))

    def trial_data(self):
        days = {}
        for i in range(1, 29):
            days[(date(2026, 11, 2) - timedelta(days=i - 1)).isoformat()] = {"sleep_start": "23:30", "slept_min": 390}
        for i in range(14):
            d = date(2026, 11, 2) + timedelta(days=i)
            if d.weekday() in t.WEEKNIGHTS:
                days[(d + timedelta(days=1)).isoformat()] = {"sleep_start": "22:00", "slept_min": 450}
        return {"days": days}

    def test_a_running_trial_shows_progress_and_writes_nothing_and_proposes_nothing(self):
        self.create()
        out = self.run_night(self.trial_data(), "2026-11-05")
        self.assertEqual(self.calls, [])
        c = out["card"]
        self.assertEqual((c["state"], c["day"], c["of"], c["endId"]), ("running", 4, 14, "tr-1-end"))
        self.assertIn("On target 4 of 4 weeknights so far", c["line"])
        self.assertEqual(out["weekly"]["text"], "Trial: Lights out by 10:15 PM on weeknights, day 4 of 14.")

    def test_the_first_run_after_the_last_day_writes_the_readout_once(self):
        self.create()
        out = self.run_night(self.trial_data(), "2026-11-16")
        self.assertEqual(self.calls, [("brief: trial test-early-bed-trial", ["data-findings.md", "test-early-bed-trial.md"])])
        text = g.read(self.trial_path())
        self.assertEqual(text.count("**worked**"), 1)
        self.assertIn("status: worked", text)
        self.assertIn("### Finished\n- [[test-early-bed-trial]]", g.read(self.hub))
        self.assertNotIn("### Running\n- [[test-early-bed-trial]]", g.read(self.hub))
        self.assertEqual((out["card"]["state"], out["card"]["result"]), ("ended", "worked"))
        self.assertIn("60 min more", out["card"]["line"])
        # the next night: nothing more is written, and no ended card
        self.calls.clear()
        again = self.run_night(self.trial_data(), "2026-11-17")
        self.assertEqual(self.calls, [])
        self.assertEqual(g.read(self.trial_path()).count("**worked**"), 1)
        self.assertNotEqual((again["card"] or {}).get("state"), "ended")

    def test_a_read_only_wiki_shows_the_ended_card_but_waits_to_write_it(self):
        self.create()
        out = self.run_night(self.trial_data(), "2026-11-16", write=False)
        self.assertEqual(self.calls, [])
        self.assertTrue(out["card"]["pending"])
        self.assertIn("status: running", g.read(self.trial_path()))

    def test_end_trial_writes_the_readout_with_the_days_so_far_as_ended_early(self):
        self.create()
        end = {"id": "tr-1-end", "decision": "end", "slug": "test-early-bed", "target": "22:15",
               "decided_at": "2026-11-06T18:00:00Z"}
        out = self.run_night(self.trial_data(), "2026-11-07", rows=[dict(self.ACCEPT, id="tr-1"), end])
        text = g.read(self.trial_path())
        self.assertIn("ended early on 2026-11-06", text)
        self.assertEqual(out["card"]["end"], "ended early Friday")
        self.assertEqual(out["card"]["state"], "ended")
        # only the days through the 6th counted: Monday to Thursday
        self.assertIn("On target 4 of 10 weeknights", out["card"]["line"])

    def test_a_trial_page_is_not_graded_as_a_test(self):
        self.create()
        pages = g.load_pages(self.folder)
        self.assertEqual(list(pages), ["test-early-bed"])

    def test_the_weekly_line_for_each_state(self):
        self.assertIsNone(t.weekly_line(None))
        self.assertEqual(t.weekly_line({"state": "running", "change": "X", "day": 3, "of": 14}, "u")["text"], "Trial: X, day 3 of 14.")
        self.assertIsNone(t.weekly_line({"state": "ended"}))


class Hub(unittest.TestCase):
    def test_moves_a_bullet_from_running_to_finished(self):
        h = t.edit_hub_trials(HUB, "test-x-trial", "- [[test-x-trial]]: x. Running.", False)
        self.assertIn("## Trials\n\n### Running\n- [[test-x-trial]]: x. Running.\n", h)
        self.assertNotIn("None yet", h)
        h = t.edit_hub_trials(h, "test-x-trial", "- [[test-x-trial]]: x. **worked**.", True)
        self.assertEqual(h.count("[[test-x-trial]]"), 1)
        self.assertIn("### Finished\n- [[test-x-trial]]: x. **worked**.", h)

    def test_a_hub_with_no_trials_section_gets_one(self):
        h = t.edit_hub_trials("# Hub\n\n## Strong\n\n- [[a]]\n", "test-x-trial", "- [[test-x-trial]]: x.", False)
        self.assertTrue(h.rstrip().endswith("## Trials\n\n### Running\n- [[test-x-trial]]: x."))

    def test_grade_py_moving_a_test_does_not_catch_the_trial_bullet(self):
        h = t.edit_hub_trials(HUB, "test-early-bed-trial", "- [[test-early-bed-trial]]: x.", False)
        out = g.edit_hub(h, "test-early-bed", "Early bed", "leaning")
        self.assertIn("- [[test-early-bed-trial]]: x.", out)


if __name__ == "__main__":
    unittest.main()
