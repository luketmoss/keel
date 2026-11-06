"""Tests for nightly.py (#829), on made-up fixtures only: no reading here is real."""
import unittest

import nightly as n


def night(bed, wake, slept_h, awake_min=0):
    return {"bed_time": bed, "wake_time": wake,
            "sleep_total_s": int(slept_h * 3600) + awake_min * 60, "sleep_awake_s": awake_min * 60}


def sixty(good, bad_bed="01:30"):
    """`good` nights of 8 h slept, bed 22:20 to 06:20 (8 h in bed), the rest short and late."""
    return [night("22:20", "06:20", 8) for _ in range(good)] + \
           [night(bad_bed, "06:00", 5.5) for _ in range(60 - good)]


FULL = {"Breakfast": ["a"], "Lunch": ["b"], "Dinner": ["c"]}
LIFT = [{"date": "2026-11-05", "sessions": [{"type": "weight", "title": "Upper Push B"}]}]


class BedBy(unittest.TestCase):
    def test_fewer_than_five_good_nights_gives_none(self):
        self.assertIsNone(n.usual(sixty(4)))
        self.assertIsNone(n.bed_by(n.usual(sixty(4)), {}))
        self.assertIsNone(n.compute({"nights": sixty(4), "mornings": []})["tonight"])

    def test_five_good_nights_is_enough(self):
        self.assertEqual(n.usual(sixty(5))["n"], 5)

    def test_usual_is_median_bed_rounded_down_to_the_quarter(self):
        us = n.usual(sixty(10))
        self.assertEqual(us["n"], 10)
        self.assertEqual(n.clock_text(us["bed"]), "10:15 PM")  # 22:20 floors to 22:15

    def test_rounds_down_never_to_the_nearest(self):
        nights = [night("22:29", "06:29", 8)] * 5
        self.assertEqual(n.clock_text(n.usual(nights)["bed"]), "10:15 PM")

    def test_median_not_latest(self):
        nights = sixty(9) + [night("23:50", "07:50", 8)]
        self.assertEqual(n.clock_text(n.usual(nights)["bed"]), "10:15 PM")

    def test_after_midnight_bed_times_sort_late(self):
        nights = [night("00:10", "08:10", 8)] * 5
        self.assertEqual(n.clock_text(n.usual(nights)["bed"]), "12:00 AM")

    def test_seven_oclock_lift_pulls_it_earlier(self):
        us = n.usual(sixty(10))  # 8:00 in bed
        b = n.bed_by(us, LIFT[0])
        self.assertEqual(b["wake_by"], 6 * 60)
        self.assertEqual(n.clock_text(b["bed"]), "10:00 PM")  # 6:00 minus 8:00 in bed
        self.assertEqual(b["why"], "Upper Push B")

    def test_a_late_commitment_keeps_the_usual(self):
        b = n.bed_by(n.usual(sixty(10)), {"events": [{"start": "10:30", "title": "x"}]})
        self.assertEqual(b["why"], "your usual")
        self.assertEqual(n.clock_text(b["bed"]), "10:15 PM")

    def test_outdoor_session_without_a_time_changes_nothing(self):
        b = n.bed_by(n.usual(sixty(10)), {"sessions": [{"type": "bike:mountain"}]})
        self.assertEqual(b["why"], "your usual")

    def test_timed_event_before_ten_counts_but_never_pushes_later(self):
        b = n.bed_by(n.usual(sixty(10)), {"events": [{"start": "08:00", "title": "Dentist"}]})
        self.assertEqual(b["wake_by"], 7 * 60)
        self.assertEqual(n.clock_text(b["bed"]), "10:15 PM")  # 23:00 is later than usual

    def test_each_day_uses_the_next_morning(self):
        inp = {"nights": sixty(10), "mornings": [
            {"date": "2026-11-05", "sessions": []},
            {"date": "2026-11-06", "sessions": [{"type": "weight", "title": "Legs B"}]},
            {"date": "2026-11-07", "sessions": []}]}
        out = n.compute(inp)
        self.assertEqual(out["tonight"]["why"], "your usual")
        self.assertEqual([d["why"] for d in out["days"]], ["Legs B", "your usual", "your usual"])
        self.assertEqual(out["days"][0]["bed_by"], "10:00 PM")


class BlankAwake(unittest.TestCase):
    def test_a_night_with_no_awake_figure_is_not_a_good_night(self):
        unknown = dict(night("21:00", "07:00", 10), sleep_awake_s=None)
        self.assertEqual(n.good_nights([unknown]), [])
        self.assertIsNone(n.usual([unknown] * 60))

    def test_a_blank_string_is_unknown_too(self):
        self.assertEqual(n.good_nights([dict(night("21:00", "07:00", 10), sleep_awake_s="")]), [])

    def test_zero_awake_is_a_figure_and_counts(self):
        self.assertEqual(len(n.good_nights([night("22:00", "06:00", 8, awake_min=0)])), 1)

    def test_it_stays_out_of_the_time_in_bed(self):
        unknown = [dict(night("20:30", "07:30", 11), sleep_awake_s=None)] * 20
        self.assertEqual(n.usual(sixty(10) + unknown)["tib"], 480)


class Moves(unittest.TestCase):
    def base(self, **kw):
        inp = {"today": "2026-11-04", "nights": sixty(10), "mornings": [{"date": "2026-11-05", "sessions": []}],
               "water": {"oz": 64, "goal_oz": 64}, "alcohol": 0, "food_week": [], "goals": {},
               "last_bp": "2026-11-03"}
        inp.update(kw)
        return inp

    def week(self, n_complete, protein, sodium):
        days = [{"slots": FULL, "protein_g": protein, "sodium_mg": sodium} for _ in range(n_complete)]
        return days + [{"slots": {"Breakfast": ["a"]}, "protein_g": 1, "sodium_mg": 9999}] * (7 - n_complete)

    def test_no_trigger_no_moves(self):
        self.assertEqual(n.compute(self.base())["moves"], [])

    def water(self, now=None):
        inp = {"nights": sixty(10), "mornings": [], "water": {"oz": 56, "goal_oz": 64}}  # bed-by 10:15 PM
        if now is not None:
            inp["now"] = now
        return [m for m in n.compute(inp)["moves"] if m["kind"] == "water"]

    def test_water_left_out_after_the_stop_time(self):
        self.assertEqual(self.water("21:16"), [])

    def test_water_kept_at_the_stop_time(self):
        self.assertEqual(len(self.water("21:15")), 1)
        self.assertEqual(self.water("21:15")[0]["action"], "8 oz now, then stop by 9:15 PM")

    def test_water_kept_with_no_run_time(self):
        self.assertEqual(len(self.water()), 1)

    def test_water_kept_on_a_morning_hand_run(self):
        self.assertEqual(len(self.water("09:30")), 1)

    def test_other_moves_survive_a_passed_stop_time(self):
        inp = {"nights": sixty(10), "mornings": LIFT, "water": {"oz": 56, "goal_oz": 64}, "alcohol": 1,
               "now": "22:00"}
        self.assertEqual([m["kind"] for m in n.compute(inp)["moves"]], ["drink"])

    def test_water_gap_capped_and_rounded_with_stop_time(self):
        m = n.compute(self.base(water={"oz": 40, "goal_oz": 64}))["moves"]
        self.assertEqual(m[0]["kind"], "water")
        self.assertEqual(m[0]["action"], "16 oz now, then stop by 9:15 PM")  # usual 10:15 minus 60 min
        m = n.compute(self.base(water={"oz": 58, "goal_oz": 64}))["moves"]
        self.assertTrue(m[0]["action"].startswith("8 oz now"))  # a 6 oz gap rounds to 8
        m = n.compute(self.base(water={"oz": 63, "goal_oz": 64}))["moves"]
        self.assertTrue(m[0]["action"].startswith("4 oz now"))

    def test_drink_needs_alcohol_and_an_early_commitment(self):
        self.assertEqual(n.compute(self.base(alcohol=1, mornings=LIFT))["moves"][0]["kind"], "drink")
        self.assertEqual(n.compute(self.base(alcohol=1))["moves"], [])
        self.assertEqual(n.compute(self.base(alcohol=0, mornings=LIFT))["moves"], [])
        late = [{"date": "d", "events": [{"start": "09:30"}]}]
        self.assertEqual(n.compute(self.base(alcohol=1, mornings=late))["moves"], [])

    def test_protein_move_needs_lift_and_three_complete_days(self):
        goals = {"protein_g": 180, "sodium_mg": 2300}
        m = n.compute(self.base(mornings=LIFT, goals=goals, food_week=self.week(5, 150, 2000)))["moves"]
        self.assertEqual([x["kind"] for x in m], ["food"])
        self.assertIn("150 g against 180", m[0]["line"])
        self.assertEqual(n.compute(self.base(mornings=LIFT, goals=goals, food_week=self.week(2, 150, 2000)))["moves"], [])
        self.assertEqual(n.compute(self.base(goals=goals, food_week=self.week(5, 150, 2000)))["moves"], [])

    def test_sodium_move(self):
        goals = {"protein_g": 180, "sodium_mg": 2300}
        m = n.compute(self.base(goals=goals, food_week=self.week(4, 200, 3100)))["moves"]
        self.assertEqual(m[0]["action"], "Keep tonight's snack low in salt")
        self.assertIn("3,100 mg against 2,300", m[0]["line"])

    def test_incomplete_days_do_not_count(self):
        goals = {"sodium_mg": 2300}
        self.assertEqual(n.compute(self.base(goals=goals, food_week=self.week(2, 200, 3100)))["moves"], [])

    def test_cuff_after_seven_days(self):
        self.assertEqual(n.compute(self.base(last_bp="2026-10-28"))["moves"][0]["line"], "No blood pressure since Oct 28.")
        self.assertEqual(n.compute(self.base(last_bp="2026-10-29"))["moves"], [])  # 6 days ago is inside the window
        self.assertEqual(n.compute(self.base(last_bp=None))["moves"][0]["kind"], "cuff")

    def test_at_most_three_in_order(self):
        out = n.compute(self.base(water={"oz": 10, "goal_oz": 64}, alcohol=2, mornings=LIFT, goals={"protein_g": 180},
                                  food_week=self.week(5, 100, 0), last_bp=None))["moves"]
        self.assertEqual([m["kind"] for m in out], ["water", "drink", "food"])


class Food(unittest.TestCase):
    def test_complete_needs_three_meals(self):
        self.assertTrue(n.complete_day(FULL))
        self.assertFalse(n.complete_day({"Breakfast": ["a"], "Dinner": ["c"], "Snacks": ["z"]}))

    def test_yesterday_lines(self):
        self.assertEqual(n.yesterday_line({"Breakfast": ["a"], "Dinner": ["c"]}), "Yesterday's lunch isn't logged.")
        self.assertEqual(n.yesterday_line({"Breakfast": ["a"]}), "Yesterday's lunch and dinner aren't logged.")
        self.assertIsNone(n.yesterday_line(FULL))

    def test_compute_line_only_for_yesterday(self):
        self.assertIsNone(n.compute({"nights": [], "yesterday_slots": FULL})["yesterday_line"])
        self.assertEqual(n.compute({"nights": [], "yesterday_slots": {}})["yesterday_line"],
                         "Yesterday's breakfast, lunch and dinner aren't logged.")
        self.assertIsNone(n.compute({"nights": []})["yesterday_line"])


class Tiles(unittest.TestCase):
    def test_step_down_limits(self):
        self.assertEqual(n.tile_state("hrv", 45, 50), "down")
        self.assertEqual(n.tile_state("hrv", 46, 50), "ok")
        self.assertEqual(n.tile_state("hrv", 55, 50), "good")
        self.assertEqual(n.tile_state("heart", 58, 53), "down")
        self.assertEqual(n.tile_state("heart", 48, 53), "good")
        self.assertEqual(n.tile_state("sleep", 350, 360), "down")
        self.assertEqual(n.tile_state("sleep", 400, 465), "down")
        self.assertEqual(n.tile_state("sleep", 470, 400), "good")
        self.assertEqual(n.tile_state("sleep", None, 400), "ok")

    def test_phone_note(self):
        self.assertEqual(n.phone_note(["Hive"], "Yesterday's lunch isn't logged."),
                         "Not read: Hive · Yesterday's lunch isn't logged.")
        self.assertEqual(n.phone_note([], None), "")


def result(slug, grade, lever, a=8, b=9, outcomes=None, **kw):
    """A grade.py result, made up."""
    t = {"slug": slug, "title": slug.replace("-", " ").title(), "lead": "Lead.", "grader": "machine",
         "page_grade": grade, "grade": grade, "display_grade": grade, "tonight": grade, "moved": False,
         "errors": [], "lever": lever, "counts": {"a": a, "b": b}, "a_label": "Group A", "b_label": "Group B",
         "outcomes": outcomes or [{"measure": "deep_min", "mean_a": 60.0, "mean_b": 75.0, "diff": -15.0,
                                   "threshold": 8, "over": True}],
         "primary": "deep_min"}
    t.update(kw)
    return t


class Findings(unittest.TestCase):
    def test_moved_first_then_touching_strong_before_leaning(self):
        tests = [
            result("t-ride", "leaning", ["ride_day"]),
            result("t-bed", "strong", ["sleep_start"]),
            result("t-drink", "leaning", ["drank"]),
            result("t-moved", "ruled-out", ["steps"], moved=True, page_grade="leaning"),
            result("t-sodium", "strong", ["sodium_mg"]),
        ]
        ctx = {"ride_planned": True, "alcohol_today": True}
        cards = n.select_findings(tests, ctx)
        self.assertEqual([c["slug"] for c in cards], ["t-moved", "t-bed", "t-ride"])  # at most three
        self.assertEqual(cards[0]["moved"], "New tonight: leaning → ruled out")
        self.assertNotIn("moved", cards[1])

    def test_with_none_touching_the_strongest_shows(self):
        tests = [result("t-lean", "leaning", ["sodium_mg"]), result("t-strong", "strong", ["unwind"]),
                 result("t-ruled", "ruled-out", ["steps"])]
        cards = n.select_findings(tests, {})
        self.assertEqual([c["slug"] for c in cards], ["t-strong"])

    def test_nothing_graded_shows_nothing(self):
        self.assertEqual(n.select_findings([result("t", "collecting", ["steps"])], {}), [])

    def test_the_water_and_late_calories_rules(self):
        t = [result("w", "leaning", ["water_gap_h"]), result("l", "leaning", ["late_kcal"])]
        self.assertEqual(n.select_findings(t, {"water_gap_h": 6.5, "after_dinner": False}), n.select_findings(t[:1], {}) * 1)
        self.assertEqual([c["slug"] for c in n.select_findings(t, {"water_gap_h": 5, "after_dinner": True})], ["l"])

    def test_card_has_chip_lead_comparison_and_labels(self):
        c = n.select_findings([result("t", "strong", ["sleep_start"], a=22, b=18)], {})[0]
        self.assertEqual(c["chip"], "Strong · 40 nights")
        self.assertEqual((c["lead"], c["a_label"], c["b_label"]), ("Lead.", "Group A", "Group B"))
        self.assertEqual(c["bars"], [{"measure": "deep_min", "label": "Deep sleep", "unit": "min", "a": 60.0, "b": 75.0,
                                      "diff": -15.0, "over": True}])
        lean = n.select_findings([result("t", "leaning", ["sleep_start"], a=6, b=9)], {})[0]
        self.assertEqual(lean["chip"], "Leaning · 6 nights each")

    def test_hand_graded_card_chip(self):
        c = n.select_findings([result("h", "strong", ["sleep_start"], grader="hand", outcomes=[])], {})[0]
        self.assertEqual(c["chip"], "Hand-graded")

    def test_in_progress_lists_every_collecting_and_blocked_test(self):
        tests = [
            result("c1", "collecting", ["x"], progress={"text": "3 + 4 of 6 + 6", "fraction": 0.58}),
            result("c2", "collecting", ["x"], progress={"text": "7 of 10", "fraction": 0.7}),
            result("b1", "blocked", ["x"], awaits="a blood pressure cuff"),
            result("s", "strong", ["x"]),
            result("h", "collecting", ["x"], grader="hand"),
        ]
        out = n.in_progress(tests)
        self.assertEqual([(p["slug"], p["kind"], p["text"]) for p in out], [
            ("c1", "collecting", "3 + 4 of 6 + 6"), ("c2", "collecting", "7 of 10"),
            ("b1", "blocked", "Waiting for a blood pressure cuff")])


def ride_test(**kw):
    outs = [{"measure": "resting_hr", "mean_a": 56.0, "mean_b": 52.0, "diff": 4.0, "threshold": 2, "over": True},
            {"measure": "resting_hr+1", "mean_a": 52.5, "mean_b": 52.0, "diff": 0.5, "threshold": 2, "over": False}]
    return result("t-ride-hr", kw.pop("grade", "strong"), ["ride_day"], a_text="ride_day", outcomes=outs, **kw)


class Outlook(unittest.TestCase):
    DATES = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10"]  # Fri to Tue
    PLANNED = {"2026-11-08": ["bike:mountain"]}  # a ride planned on Sunday

    def rows(self, tests, planned=None):
        mornings = [{"date": d} for d in self.DATES]
        out = n.compute({"nights": [], "mornings": mornings, "tests": tests, "planned": planned or self.PLANNED})
        return {d["date"]: d for d in out["days"] if d}

    def test_a_strong_test_puts_the_line_on_the_morning_after_the_ride(self):
        # a usual bed-by is needed for the rows to exist
        mornings = [{"date": d} for d in self.DATES]
        out = n.compute({"nights": sixty(10), "mornings": mornings, "tests": [ride_test()], "planned": self.PLANNED})
        by = {d["date"]: d for d in out["days"]}
        self.assertEqual(by["2026-11-09"]["outlook"],
                         "Monday will read high: resting HR runs about 4 bpm over after a ride, back by Tuesday.")
        self.assertIsNone(by["2026-11-08"]["outlook"])
        self.assertIsNone(by["2026-11-10"]["outlook"])

    def test_a_leaning_test_puts_none(self):
        mornings = [{"date": d} for d in self.DATES]
        out = n.compute({"nights": sixty(10), "mornings": mornings, "tests": [ride_test(grade="leaning")],
                         "planned": self.PLANNED})
        self.assertTrue(all(d["outlook"] is None for d in out["days"]))

    def test_back_by_only_when_the_next_day_is_under_threshold(self):
        t = ride_test()
        t["outcomes"][1].update(diff=3.0, over=True)
        lines = n.outlook_lines([t], self.PLANNED, self.DATES)
        self.assertEqual(lines["2026-11-09"], "Monday will read high: resting HR runs about 4 bpm over after a ride.")

    def test_no_planned_ride_no_line(self):
        self.assertEqual(n.outlook_lines([ride_test()], {"2026-11-08": ["weight"]}, self.DATES), {})


class FindingBackedMoves(unittest.TestCase):
    BASE = {"today": "2026-11-04", "nights": sixty(10), "alcohol": 1, "last_bp": "2026-11-04",
            "mornings": [{"date": "2026-11-05", "sessions": [{"type": "weight"}]}]}

    def drink(self, tests):
        out = n.compute(dict(self.BASE, tests=tests))["moves"]
        return next(m for m in out if m["kind"] == "drink")

    def alcohol(self, grade):
        return result("t-alcohol", grade, ["drank"], a_text="drank", a=6, b=6)

    def test_cites_a_leaning_or_strong_alcohol_test(self):
        m = self.drink([self.alcohol("leaning")])
        self.assertIn("Drinking nights brought 15 min less deep sleep (6 nights each, leaning).", m["line"])
        self.assertEqual(m["finding"], "t-alcohol")
        self.assertIn("strong).", self.drink([self.alcohol("strong")])["line"])

    def test_cites_nothing_otherwise(self):
        for grade in ("collecting", "ruled-out"):
            m = self.drink([self.alcohol(grade)])
            self.assertNotIn("finding", m)
            self.assertNotIn("Drinking nights", m["line"])
        self.assertNotIn("Drinking nights", self.drink([])["line"])


if __name__ == "__main__":
    unittest.main()
