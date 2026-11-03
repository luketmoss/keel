package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.ride.recording.Sample
import com.luketmoss.thrivespin.core.workout.TrainerMode
import com.luketmoss.thrivespin.core.workout.Zone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RideTextTest {
    @Test
    fun theNotificationReadsTheStepTimeLeftAndTarget() {
        val rig = Rig(session(pct("Sweet spot", 90, durS = 600), step("Coast", StepTarget.Free, 60), step("Hill", StepTarget.Grade(4.5), 60)))
        assertEquals("Connecting to the trainer…", RideText.notification(rig.state))
        rig.ready()
        assertEquals("Pedal to start", RideText.notification(rig.state))
        rig.pedal()
        rig.seconds(2)
        assertEquals("Sweet spot · 9:58 left · 225 W", RideText.notification(rig.state))
        rig.engine.pause()
        assertEquals("Paused at 0:02", RideText.notification(rig.state))
        rig.engine.resume()
        rig.engine.skipStep()
        assertEquals("Coast · 1:00 left · Free", RideText.notification(rig.state))
        rig.idle(2_000)
        rig.engine.skipStep()
        assertEquals("Hill · 1:00 left · Slope 4.5%", RideText.notification(rig.state))
        rig.engine.onTrainerDisconnected()
        assertEquals("Lost the trainer · reconnecting", RideText.notification(rig.state))
    }

    @Test
    fun anOpenEndedStepCountsUpInTheNotification() {
        val rig = Rig(session(step("Ramp", StepTarget.WattsStairs(100, 20, 60), null), ftp = null, adjustable = false))
        rig.start()
        rig.seconds(61)
        assertEquals("Ramp · 1:01 · 120 W", RideText.notification(rig.state))
    }

    @Test
    fun theFirstStepsTargetShowsWhileGettingReady() {
        val rig = Rig(session(pct(durS = 600)))
        assertEquals("225", RideText.targetFigure(rig.state))
        assertEquals(Zone.Z3, rig.state.zone)
    }

    @Test
    fun theTargetCardWordsErgGuideLevelSlopeAndFree() {
        val erg = Rig(session(pct(durS = 600)))
        erg.start()
        assertEquals("225", RideText.targetFigure(erg.state))
        assertEquals("watts · 90% FTP", RideText.targetCaption(erg.state))
        assertEquals(Zone.Z3, erg.state.zone)

        val guide = Rig(session(pct(durS = 600), mode = TrainerMode.Slope))
        guide.start()
        assertEquals("watts · 90% FTP · guide", RideText.targetCaption(guide.state))

        val absolute = Rig(session(step("Ramp", StepTarget.Watts(150, 150), 60), ftp = null))
        absolute.start()
        assertEquals("watts", RideText.targetCaption(absolute.state))

        val others = Rig(session(step("L", StepTarget.Level(30), 1), step("G", StepTarget.Grade(4.5), 1), step("F", StepTarget.Free, 5), ftp = null))
        others.start()
        assertEquals("30" to "resistance level", RideText.targetFigure(others.state) to RideText.targetCaption(others.state))
        others.seconds(1)
        assertEquals("4.5%" to "slope", RideText.targetFigure(others.state) to RideText.targetCaption(others.state))
        others.seconds(1)
        assertEquals("Free" to "no target", RideText.targetFigure(others.state) to RideText.targetCaption(others.state))
    }

    @Test
    fun thePillsAndStatusLinesAreTheNotesWords() {
        val rig = Rig(session(pct(durS = 600)))
        assertEquals("Connecting…", RideText.trainerPill(rig.state))
        assertEquals("No heart rate", RideText.hrPill(rig.state))
        assertEquals("Connecting to KICKR CORE 1A2B…", RideText.ready(ReadyStatus.Connecting, "KICKR CORE 1A2B"))
        assertTrue(RideText.ready(ReadyStatus.CantFind, "KICKR").startsWith("Can't find KICKR. Pedal to wake it"))
        rig.start()
        assertEquals("KICKR CORE 1A2B · ERG", RideText.trainerPill(rig.state))
        rig.engine.onTrainerDisconnected()
        assertEquals("Reconnecting…", RideText.trainerPill(rig.state))
        assertEquals("Lost the trainer. Reconnecting… The clock keeps running.", RideText.banner(rig.state.banner!!))
    }

    @Test
    fun theEndDialogNamesWhatIsLeft() {
        val rig = Rig(session(pct("A", durS = 100), pct("B", 60, durS = 100)))
        rig.start()
        rig.seconds(30)
        assertEquals("You've ridden 0:30. 2:50 of the workout is left.", RideText.endBody(rig.state))
        rig.engine.skipStep()
        assertEquals("You've ridden 0:30.", RideText.endBody(rig.state))
        assertEquals("The ride stopped at 1:14:00 when the app was closed. It's paused.", RideText.banner(RideBanner.Interrupted(4440)))
    }

    @Test
    fun theNextLineNamesTheNextStepOrFinish() {
        val rig = Rig(session(pct("Warm up", 60, durS = 120), pct("Recover", 55, 240, end = 75), step("Free", StepTarget.Free, 30)))
        rig.start()
        assertEquals("Next" to "Recover · 4:00 · 138–188 W", RideText.next(rig.state.next))
        rig.engine.skipStep()
        rig.idle(1_500)
        rig.engine.skipStep()
        assertEquals("Next" to "Finish", RideText.next(rig.state.next))
    }

    @Test
    fun theRecordedLineIsElapsedAverageAndKilojoules() {
        fun sample(t: Int, power: Int?) = Sample(t, 0, 0, power, null, null, null, 100, true)
        assertEquals("1:00 · 200 W avg · 12 kJ", RideRecordedText.line((0 until 60).map { sample(it, 200) }))
        assertEquals("0:03 · — W avg · 0 kJ", RideRecordedText.line((0 until 3).map { sample(it, null) }))
    }

    @Test
    fun theRideProfileScalesAndKeepsNonPercentageStepsNeutral() {
        val s = session(pct("A", 100, durS = 100), step("B", StepTarget.Level(30), 50), step("C", StepTarget.Watts(200, 200), 50), ftp = 250)
        val model = RideProfile.model(s, 100)
        assertEquals(3, model.bars.size)
        assertEquals(200, model.totalS)
        assertEquals(null, model.bars[1].zone)
        assertEquals(null, model.bars[2].zone)
        val harder = RideProfile.model(s, 130)
        assertTrue(harder.bars[0].startFraction > model.bars[0].startFraction * 0.9f)
    }
}
