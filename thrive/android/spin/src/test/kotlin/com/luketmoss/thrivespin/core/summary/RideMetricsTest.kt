package com.luketmoss.thrivespin.core.summary

import com.luketmoss.thrivespin.core.ride.recording.RideEvent
import com.luketmoss.thrivespin.core.summary.Recs.flat
import com.luketmoss.thrivespin.core.summary.Recs.recording
import com.luketmoss.thrivespin.core.summary.Recs.sample
import com.luketmoss.thrivespin.core.summary.Recs.stepStart
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RideMetricsTest {
    private fun summary(samples: List<com.luketmoss.thrivespin.core.ride.recording.Sample>, ftp: Int? = 250, events: List<RideEvent>? = null) =
        RideMetrics.summarize(
            if (events == null) recording(samples) else recording(samples, events),
            ftp,
        )

    @Test
    fun averagePowerKeepsZerosAndLeavesOutNulls() {
        val s = summary(listOf(sample(0, 0), sample(1, 100), sample(2, null), sample(3, 200)))
        assertEquals(100, s.avgPowerW)
    }

    @Test
    fun averageCadenceLeavesOutNullsAndZeros() {
        val s = summary(
            listOf(sample(0, 100, cadence = 0), sample(1, 100, cadence = 80), sample(2, 100, cadence = null), sample(3, 100, cadence = 90)),
        )
        assertEquals(85, s.avgCadence)
    }

    @Test
    fun averageHeartRateIsNullWithNoReadings() {
        assertNull(summary(flat(5, 100)).avgHr)
        assertNull(summary(flat(5, 100)).maxHr)
        val s = summary(flat(4, 100, hr = 141))
        assertEquals(141, s.avgHr)
        assertEquals(141, s.maxHr)
    }

    @Test
    fun intensityPctIsTheSamplesMeanRoundedHalfUp() {
        val samples = List(4) { sample(it, 100, intensity = if (it < 3) 100 else 102) } // 100.5
        assertEquals(101, summary(samples).intensityPct)
    }

    @Test
    fun normalizedPowerOfAHundredThenThreeHundredIsTwoTwentyThree() {
        val samples = List(60) { sample(it, if (it < 30) 100 else 300) }
        val s = summary(samples)
        assertEquals(200, s.avgPowerW)
        assertEquals(223, s.npW)
        assertEquals(223.07, RideMetrics.normalizedPower(samples)!!, 0.01)
    }

    @Test
    fun anHourAtTwoHundredWattsIsTwoHundredNp() {
        assertEquals(200, summary(flat(3600, 200)).npW)
    }

    @Test
    fun aSeriesUnderThirtySamplesUsesTheAverage() {
        val s = summary(listOf(sample(0, 100), sample(1, 200), sample(2, 300)))
        assertEquals(200, s.avgPowerW)
        assertEquals(200, s.npW)
    }

    @Test
    fun aWindowWithFewerThanFifteenReadingsIsSkipped() {
        // 14 readings at 400 W, a long gap, then 15 at 100 W. Only the last window holds 15 readings, so it is
        // the only one kept: NP is 100, where the average is 245 and the sparse windows would give far more.
        val samples = List(60) { sample(it, if (it < 14) 400 else if (it >= 45) 100 else null) }
        assertEquals(100.0, RideMetrics.normalizedPower(samples)!!, 0.0001)
        assertEquals(245, summary(samples).avgPowerW)
        assertEquals(100, summary(samples).npW)
        // 14 readings in every window: nothing is kept, so NP is the average of what was read.
        val sparse = List(60) { sample(it, if (it % 30 < 14) 400 else null) }
        assertEquals(RideMetrics.meanPower(sparse)!!, RideMetrics.normalizedPower(sparse)!!, 0.0001)
        // 15 readings: the window counts and NP is its mean (the nulls are not zeros).
        val fifteen = List(30) { sample(it, if (it < 15) 300 else null) }
        assertEquals(300.0, RideMetrics.normalizedPower(fifteen)!!, 0.0001)
    }

    @Test
    fun intensityFactorAndTssForAnHourAtNpTwoFifteenOnFtpTwoFifty() {
        val s = summary(flat(3600, 215))
        assertEquals(215, s.npW)
        assertEquals(0.86, s.intensityFactor!!, 0.0)
        assertEquals(74, s.tss)
    }

    @Test
    fun workIsTheSumOfNonNullWattsInKilojoulesRounded() {
        val s = summary(flat(3600, 190))
        assertEquals(684, s.workKj)
        assertEquals(684_000L, s.workJ)
        assertEquals(1, summary(listOf(sample(0, 600), sample(1, null), sample(2, 400))).workKj)
    }

    @Test
    fun withNoFtpIfAndTssAreBlank() {
        val noFtp = RideMetrics.summarize(
            recording(flat(100, 200), session = Recs.session(ftp = null)),
            null,
        )
        assertNull(noFtp.ftpW)
        assertNull(noFtp.intensityFactor)
        assertNull(noFtp.tss)
        assertEquals(200, noFtp.npW)
    }

    @Test
    fun theFtpPassedInWinsOverTheRecordingsAndAnOutOfRangeOneCountsAsNone() {
        val r = recording(flat(100, 200), session = Recs.session(ftp = 250))
        assertEquals(240, RideMetrics.summarize(r, 240).ftpW)
        assertEquals(250, RideMetrics.summarize(r, 5000).ftpW)
        assertEquals(250, RideMetrics.summarize(r, null).ftpW)
    }

    @Test
    fun noPowerAtAllLeavesEveryPowerFigureBlank() {
        val s = summary(flat(10, null))
        assertNull(s.avgPowerW)
        assertNull(s.npW)
        assertNull(s.workKj)
        assertTrue(!s.hasPower)
    }

    @Test
    fun pausesPairUpAndAnUnderOneSecondOneAndATrailingPauseAreDropped() {
        val events = listOf(
            stepStart(0, 0, "A"),
            RideEvent("pause", 10, 100_000L),
            RideEvent("resume", 10, 145_000L), // 45 s
            RideEvent("pause", 20, 200_000L),
            RideEvent("resume", 20, 200_400L), // under a second
            RideEvent("pause", 30, 300_000L), // never resumed
        )
        val s = summary(flat(40, 100), events = events)
        assertEquals(listOf(RidePause(10, 45)), s.pauses)
        assertEquals(40, s.movingS)
        assertEquals(85, s.elapsedS)
        assertEquals(45, s.pausedS)
    }

    @Test
    fun complianceBandsFollowTheRoundedPercent() {
        fun band(power: Int, target: Int = 100): IntervalRow {
            val samples = List(20) { sample(it, power, target) }
            return summary(samples).intervals.single()
        }
        assertEquals(Band.OnTarget, band(95).band)
        assertEquals(95, band(95).percent)
        assertEquals(Band.OnTarget, band(105).band)
        assertEquals(Band.Below, band(94).band)
        assertEquals(Band.Above, band(106).band)
        val close = summary(List(20) { sample(it, 224, 225) }).intervals.single()
        assertEquals(100, close.percent)
        assertEquals(Band.OnTarget, close.band)
        assertEquals("On target", close.band.word)
    }

    @Test
    fun aStepWithFewerThanTenScoredSecondsIsTooShort() {
        val samples = List(20) { sample(it, if (it < 9) 100 else null, 100) }
        val row = summary(samples).intervals.single()
        assertEquals(Band.TooShort, row.band)
        assertNull(row.percent)
        assertEquals(100, row.targetMeanW)
    }

    @Test
    fun averageIsOverTheSecondsWithBothValuesAndTargetIsTheStepsMean() {
        // Power only on 10 of 20 seconds; the target changes across the step.
        val samples = List(20) { sample(it, if (it >= 10) 150 else null, if (it < 10) 100 else 200) }
        val row = summary(samples).intervals.single()
        assertEquals(150, row.targetMeanW)
        assertEquals(150, row.avgW)
        assertEquals(100, row.percent)
        assertEquals("100–200", row.targetText)
    }

    @Test
    fun aRepeatsStepIsNamedWithItsPositionAndNonErgStepsHaveNoRow() {
        val session = Recs.session(
            steps = listOf(
                Recs.step("Sweet spot", 30, position = "1 of 2"),
                Recs.step("Sweet spot", 30, position = "2 of 2"),
                Recs.step("Cool-down", 30),
            ),
        )
        val samples = List(90) { i ->
            val step = i / 30
            sample(i, 100, if (step < 2) 100 else null, step = step)
        }
        val events = listOf(
            stepStart(0, 0, "Sweet spot"),
            stepStart(30, 1, "Sweet spot", reason = "time"),
            stepStart(60, 2, "Cool-down", mode = "free", reason = "time"),
        )
        val rows = RideMetrics.summarize(recording(samples, events, session), 250).intervals
        assertEquals(listOf("Sweet spot · 1 of 2", "Sweet spot · 2 of 2"), rows.map { it.name })
        val none = RideMetrics.summarize(recording(flat(30, 100)), 250).intervals
        assertTrue(none.isEmpty())
    }

    @Test
    fun aZeroLengthStepIsNotARowASpanOrALap() {
        val events = listOf(stepStart(0, 0, "A"), stepStart(0, 1, "B", reason = "skip"), stepStart(10, 2, "C", reason = "skip"))
        val spans = summary(flat(20, 100, 100), events = events).spans
        assertEquals(listOf("B", "C"), spans.map { it.label })
        assertEquals(listOf(0 to 10, 10 to 20), spans.map { it.startS to it.endS })
    }

    // ---- The streams file ----

    private fun streams(recording: com.luketmoss.thrivespin.core.ride.recording.RideRecording): Pair<JsonObject, BuiltText> {
        val summary = RideMetrics.summarize(recording, 250)
        val built = StreamsBuilder.build(recording, summary)
        assertNotNull(built)
        return Json.parseToJsonElement(built!!.text).jsonObject to built
    }

    @Test
    fun theStreamsFileHasNinetySevenSixtyFiveShape() {
        val samples = List(30) { sample(it, if (it == 5) null else 100 + it, if (it < 20) 120 else null, hr = if (it == 7) 150 else null, cadence = if (it == 9) null else 90) }
        val events = listOf(
            stepStart(0, 0, "Warm-up"),
            stepStart(20, 1, "A very long label that goes on and on past forty characters", mode = "free", reason = "time"),
            RideEvent("pause", 25, 1_000L),
            RideEvent("resume", 25, 47_000L),
        )
        val (obj, built) = streams(recording(samples, events))
        assertEquals("thrive-spin-streams", obj["format"]!!.jsonPrimitive.content)
        assertEquals(1, obj["v"]!!.jsonPrimitive.int)
        assertEquals("ride-1", obj["ride_id"]!!.jsonPrimitive.content)
        assertEquals(Recs.START_UTC, obj["started_at_utc"]!!.jsonPrimitive.content)
        assertEquals(1, obj["interval_s"]!!.jsonPrimitive.int)
        assertEquals(250, obj["ftp_w"]!!.jsonPrimitive.int)
        assertEquals(100, obj["intensity_pct"]!!.jsonPrimitive.int)
        for (key in listOf("power_w", "target_w", "hr_bpm", "cadence_rpm")) assertEquals(30, obj[key]!!.jsonArray.size)
        assertEquals(JsonNull, obj["power_w"]!!.jsonArray[5])
        assertEquals(JsonPrimitive(106), obj["power_w"]!!.jsonArray[6])
        assertEquals(JsonNull, obj["target_w"]!!.jsonArray[25])
        assertEquals(JsonPrimitive(150), obj["hr_bpm"]!!.jsonArray[7])
        assertEquals(JsonNull, obj["cadence_rpm"]!!.jsonArray[9])
        val steps = obj["steps"]!!.jsonArray.map { it.jsonObject }
        assertEquals(listOf(0 to 20, 20 to 30), steps.map { it["start_s"]!!.jsonPrimitive.int to it["end_s"]!!.jsonPrimitive.int })
        assertEquals(40, steps[1]["label"]!!.jsonPrimitive.content.length)
        assertEquals("free", steps[1]["mode"]!!.jsonPrimitive.content)
        val pauses = obj["pauses"]!!.jsonArray.map { it.jsonObject }
        assertEquals(1, pauses.size)
        assertEquals(25, pauses[0]["at_s"]!!.jsonPrimitive.int)
        assertEquals(46, pauses[0]["duration_s"]!!.jsonPrimitive.int)
        // Compact JSON and the hash of exactly these bytes.
        assertTrue(!built.text.contains("\": ") && !built.text.contains(", "))
        assertEquals(Hashes.sha256Hex(built.text.toByteArray(Charsets.UTF_8)), built.sha256)
        assertEquals(64, built.sha256.length)
        assertEquals(built.sha256, built.sha256.lowercase())
    }

    @Test
    fun streamsCannotBeBuiltWithNoFtp() {
        val r = recording(flat(10, 100), session = Recs.session(ftp = null))
        assertNull(StreamsBuilder.build(r, RideMetrics.summarize(r, null)))
    }

    @Test
    fun aNullStaysNullAndZeroStaysZero() {
        val (obj, _) = streams(recording(listOf(sample(0, 0, cadence = 0), sample(1, null, cadence = null))))
        assertEquals(JsonPrimitive(0), obj["power_w"]!!.jsonArray[0])
        assertEquals(JsonNull, obj["power_w"]!!.jsonArray[1])
        assertEquals(JsonPrimitive(0), obj["cadence_rpm"]!!.jsonArray[0])
        assertTrue(obj["hr_bpm"] is JsonArray)
    }
}
