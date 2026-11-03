package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.ftp.FtpDates
import com.luketmoss.thrivespin.core.ride.recording.RideFileState
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RampResultTest {
    private fun flat(w: Int, n: Int = 60): List<Int?> = List(n) { w }

    private fun best(power: List<Int?>) = RampResult.bestMinute(power)

    // ---- The pins ----

    @Test
    fun aFlatMinuteOf349WattsGivesFtp262And350GivesFtp263() {
        assertEquals(262, best(flat(349))!!.ftpW)
        assertEquals(349, best(flat(349))!!.watts)
        assertEquals(263, best(flat(350))!!.ftpW)
        assertEquals(350, best(flat(350))!!.watts)
    }

    @Test
    fun aMinuteAveraging348Point67GivesFtp262FromTheUnroundedMean() {
        // 40 x 349 + 20 x 348 is 20920 W over 60 s: 348.666..., and three quarters of it is 261.5 exactly.
        val minute: List<Int?> = List(60) { if (it < 40) 349 else 348 }
        assertEquals(20920L, minute.sumOf { it!!.toLong() })
        val b = best(minute)!!
        assertEquals(349, b.watts)
        assertEquals(262, b.ftpW)
    }

    @Test
    fun theRampRiddenExactlyOnTargetForEightMinutesHasItsBestAt240AndFtp180() {
        val b = best(RampRecs.onTarget(480))!!
        assertEquals(240, b.watts)
        assertEquals(180, b.ftpW)
    }

    @Test
    fun theSameStaircaseRiddenForFourteenMinutesHasItsBestInTheLastMinuteAt360() {
        // The note's 840 s example says 240 W; the staircase reaches 240 W at 480 s and 360 W at 780 s.
        val b = best(RampRecs.onTarget(840))!!
        assertEquals(360, b.watts)
        assertEquals(270, b.ftpW)
    }

    @Test
    fun anAverageOf238WattsInTheLastMinuteGivesFtp179() {
        val power = RampRecs.onTarget(420) + List(60) { 238 }
        val b = best(power)!!
        assertEquals(238, b.watts)
        assertEquals(179, b.ftpW)
    }

    // ---- Windows ----

    @Test
    fun theBestMinuteIsTheLargestMeanOverAnySixtyConsecutiveSamples() {
        // A strong minute in the middle, then the rider fades: the middle minute wins, not the last.
        val power = flat(200, 60) + flat(300, 60) + flat(250, 60)
        assertEquals(300, best(power)!!.watts)
        // A window that straddles two minutes is a candidate too: 30 s at 200 and 30 s at 300 is 250.
        assertEquals(250, best(flat(200, 30) + flat(300, 30))!!.watts)
    }

    @Test
    fun aWindowNeedsFiftyReadingsAndMissingOnesAreNotZeros() {
        // 49 readings in the window: not kept.
        val short = List(60) { if (it < 49) 300 else null }
        assertNull(best(short))
        // 50 readings: kept, and the mean is of the readings only (300), not diluted by the gaps.
        val ok = List(60) { if (it < 50) 300 else null }
        assertEquals(300, best(ok)!!.watts)
        // A dropout in the best minute does not make a better window of a worse one.
        val dropped = flat(400, 55) + List(5) { null } + flat(200, 60)
        assertEquals(400, best(dropped)!!.watts)
    }

    @Test
    fun fewerThanSixtySamplesGiveNoWindow() {
        assertNull(best(flat(300, 59)))
        assertNull(best(emptyList()))
        assertEquals(300, best(flat(300, 60))!!.watts)
    }

    @Test
    fun warmUpAndCoolDownSamplesAreNeverInTheWindow() {
        // A fast warm-up and cool-down around a slow ramp: only the ramp's samples are read.
        val rec = RampRecs.recording(power = flat(150, 90), cool = 600).let {
            RampResult.from(it) as RampOutcome.Measured
        }
        assertEquals(150, rec.bestMinuteW)
        val inRamp = RampRecs.recording(warm = 300, power = flat(150, 90), cool = 0).samples
        assertEquals(90, RampResult.rampSamples(inRamp).size)
        assertEquals(150, RampResult.soFar(inRamp)!!.watts)
    }

    // ---- The result ----

    @Test
    fun theResultReadsLastedLastStepMaxHeartRateAndTheReason() {
        val power = RampRecs.onTarget(480)
        val rec = RampRecs.recording(power = power, cool = 120, toCool = "skip", hr = { 100 + it / 10 })
        val r = RampResult.from(rec) as RampOutcome.Measured
        assertEquals(480, r.lastedS)
        assertEquals(240, r.bestMinuteW)
        assertEquals(180, r.computedFtpW)
        assertEquals(RampTest.stairW(7), r.lastStepW)
        assertEquals(100 + 479 / 10, r.maxHr)
        assertEquals(RampEnd.Tap, r.end)
        assertEquals(0, r.nullPowerS)
        assertFalse(r.droppedOut)
    }

    @Test
    fun maxHeartRateIsBlankWithNoHeartRateAndLastStepIsTheLastNonNullTarget() {
        val rec = RampRecs.recording(power = RampRecs.onTarget(120))
        val r = RampResult.from(rec) as RampOutcome.Measured
        assertNull(r.maxHr)
        assertEquals(120, r.lastStepW)
    }

    @Test
    fun theReasonItEndedComesFromTheRecordingSoItSurvivesTheProcessDying() {
        fun end(toCool: String?, endReason: String = "completed") =
            (RampResult.from(RampRecs.recording(power = RampRecs.onTarget(120), toCool = toCool, endReason = endReason)) as RampOutcome.Measured).end
        assertEquals(RampEnd.Tap, end("skip"))
        assertEquals(RampEnd.Cadence, end("end_condition"))
        assertEquals(RampEnd.Stopped, end("time"))
        // No cool-down: the ramp was cut. The app being closed is `interrupted`, anything else is a stop.
        assertEquals(RampEnd.Closed, end(null, "interrupted"))
        assertEquals(RampEnd.Stopped, end(null, "ended"))
        assertEquals(RampEnd.Stopped, end(null, "limit"))
    }

    @Test
    fun aRecoveredTestEndedByTheRiderStillReadsAsTheAppBeingClosed() {
        val base = RampRecs.recording(power = RampRecs.onTarget(120), toCool = null, endReason = "ended")
        val recovered = com.luketmoss.thrivespin.core.ride.recording.RideRecording(
            base.meta,
            base.samples,
            listOf(
                com.luketmoss.thrivespin.core.ride.recording.RideEvent(
                    "interrupted",
                    420,
                    com.luketmoss.thrivespin.core.summary.Recs.START_MS,
                    com.luketmoss.thrivespin.core.ride.recording.RideEvent.fields("gap_s" to 40),
                ),
            ) + base.events,
        )
        assertEquals(RampEnd.Closed, (RampResult.from(recovered) as RampOutcome.Measured).end)
    }

    @Test
    fun theIntroSaysWhatTheFtpIsOrThatThereIsNone() {
        assertEquals("Your FTP is 250 W, set 12 Oct.", RampText.introLine(com.luketmoss.thrivespin.core.ftp.FtpNow(250, "2026-10-12", "manual", false), 2026))
        assertEquals("You have no FTP yet.", RampText.introLine(null, 2026))
        assertEquals(3, RampText.INTRO_BULLETS.size)
        assertEquals(
            "The test ends when you tap \"I'm done\", or when your cadence stays under 60 rpm for 5 seconds.",
            RampText.INTRO_BULLETS.first(),
        )
    }

    @Test
    fun threeOrMoreDroppedSecondsSayTheBestMinuteMayBeLow() {
        val power: List<Int?> = flat(300, 30) + List(3) { null } + flat(300, 40)
        val r = RampResult.from(RampRecs.recording(power = power)) as RampOutcome.Measured
        assertEquals(3, r.nullPowerS)
        assertTrue(r.droppedOut)
        assertEquals("The trainer dropped out for 3 s during the test, so the best minute may be low.", ResultText.dropouts(r.nullPowerS))
        val two: List<Int?> = flat(300, 30) + List(2) { null } + flat(300, 40)
        assertFalse((RampResult.from(RampRecs.recording(power = two)) as RampOutcome.Measured).droppedOut)
    }

    @Test
    fun aRampOfUnderSixtySamplesOrWithNoWindowOfFiftyReadingsIsTooShort() {
        val short = RampResult.from(RampRecs.recording(power = RampRecs.onTarget(45)))
        assertEquals(RampOutcome.TooShort(noReadings = false, lastedS = 45), short)
        val missing = RampResult.from(RampRecs.recording(power = List(90) { if (it % 2 == 0) 200 else null }))
        assertEquals(RampOutcome.TooShort(noReadings = true, lastedS = 90), missing)
        val none = RampResult.from(RampRecs.recording(power = emptyList(), toCool = null))
        assertEquals(RampOutcome.TooShort(noReadings = false, lastedS = 0), none)
    }

    @Test
    fun aComputedFtpBelowFiftyIsShownClampedToFifty() {
        // A best minute of 60 W is 45 W of FTP, which addFtp would refuse.
        val r = RampResult.from(RampRecs.recording(power = flat(60, 90))) as RampOutcome.Measured
        assertEquals(45, r.computedFtpW)
        assertEquals(50, r.shownFtpW)
        val high = RampResult.from(RampRecs.recording(power = flat(1500, 90))) as RampOutcome.Measured
        assertEquals(1125, high.computedFtpW)
        assertEquals(1000, high.shownFtpW)
    }

    @Test
    fun theRampIsOverOnceTheCooldownBeganOrTheRideFinished() {
        val running = RampRecs.recording(power = RampRecs.onTarget(120), toCool = null, state = RideFileState.InProgress)
        assertFalse(RampResult.over(running))
        assertTrue(RampResult.over(RampRecs.recording(power = RampRecs.onTarget(120), toCool = "skip", state = RideFileState.InProgress)))
        assertTrue(RampResult.over(RampRecs.recording(power = RampRecs.onTarget(120), toCool = null)))
    }

    // ---- The test's date ----

    @Test
    fun theTestDateIsTheDenverDateOfItsStart() {
        // 11:30 pm in Denver on 7 Nov 2026 (MST, UTC-7) is 06:30 UTC on the 8th: the test day is the 7th.
        assertEquals("2026-11-07", FtpDates.denverDate("2026-11-08T06:30:00Z"))
        // 31 Oct 11:30 pm MDT (UTC-6) is 05:30 UTC on 1 Nov; the clocks go back on 1 Nov itself.
        assertEquals("2026-10-31", FtpDates.denverDate("2026-11-01T05:30:00Z"))
        // Across the change itself: 01:30 MDT and 01:30 MST are the same Denver date.
        assertEquals("2026-11-01", FtpDates.denverDate("2026-11-01T07:30:00Z"))
        assertEquals("2026-11-01", FtpDates.denverDate("2026-11-01T08:30:00Z"))
        // Spring forward, 8 Mar 2026: 11:30 pm MST on the 7th is 06:30 UTC on the 8th; 11:30 pm MDT on the 8th is 05:30 UTC on the 9th.
        assertEquals("2026-03-07", FtpDates.denverDate("2026-03-08T06:30:00Z"))
        assertEquals("2026-03-08", FtpDates.denverDate("2026-03-09T05:30:00Z"))
        // The phone's zone does not move it: the eyebrow is the phone's, the record's date is Denver's.
        assertEquals("SAT 7 NOV", FtpDates.eyebrow("2026-11-07T15:02:11Z", ZoneId.of("America/Denver")))
        assertEquals("SAT 7 NOV", FtpDates.eyebrow("2026-11-07T23:02:11Z", ZoneId.of("Europe/London")))
        assertEquals("SUN 8 NOV", FtpDates.eyebrow("2026-11-08T00:02:11Z", ZoneId.of("Europe/London")))
    }

    @Test
    fun datesReadDayThenMonthAndCarryTheYearWhenNotThisYears() {
        assertEquals("12 Oct", FtpDates.short("2026-10-12", 2026))
        assertEquals("12 Oct 2025", FtpDates.short("2025-10-12", 2026))
        assertEquals("", FtpDates.short("", 2026))
    }
}
