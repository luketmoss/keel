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


if __name__ == "__main__":
    unittest.main()
