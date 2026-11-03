package com.luketmoss.thrivespin.core.ramp

import com.luketmoss.thrivespin.core.FtmsFeatures
import com.luketmoss.thrivespin.core.ride.EndCondition
import com.luketmoss.thrivespin.core.ride.RideKind
import com.luketmoss.thrivespin.core.ride.RidePhase
import com.luketmoss.thrivespin.core.ride.RideSession
import com.luketmoss.thrivespin.core.ride.Rig
import com.luketmoss.thrivespin.core.ride.StepTarget
import com.luketmoss.thrivespin.core.ride.Targets
import com.luketmoss.thrivespin.core.ride.recording.RideJson
import com.luketmoss.thrivespin.core.workout.TrainerMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RampProtocolTest {
    private fun rig() = Rig(RampTest.session("ride-1"))

    /** Ready, pedalling, and through the warm-up by the tap: the ramp has begun. */
    private fun rampRig(): Rig {
        val rig = rig()
        rig.start()
        rig.seconds(2)
        rig.engine.skipStep()
        rig.seconds(2)
        assertEquals("Ramp", rig.state.stepLabel)
        return rig
    }

    // ---- The session ----

    @Test
    fun theSessionHasExactlyThreeStepsAndTheEngineAcceptsIt() {
        val s = RampTest.session("ride-1")
        assertEquals(RideKind.RampTest, s.kind)
        assertNull(s.ftpW)
        assertNull(s.workoutId)
        assertEquals(TrainerMode.Erg, s.mode)
        assertEquals(100, s.intensityPct)
        assertFalse(s.intensityAdjustable)
        assertEquals("Ramp test", s.name)
        assertEquals(3, s.steps.size)
        val (warm, ramp, cool) = s.steps
        assertEquals("Warm-up", warm.label)
        assertEquals(300, warm.durS)
        assertEquals(StepTarget.Watts(100, 100), warm.target)
        assertNull(warm.endWhen)
        assertEquals("Ramp", ramp.label)
        assertNull(ramp.durS)
        assertEquals(StepTarget.WattsStairs(100, 20, 60), ramp.target)
        assertEquals(EndCondition.CadenceBelow(60, 5), ramp.endWhen)
        assertEquals("Cool-down", cool.label)
        assertEquals(600, cool.durS)
        assertEquals(StepTarget.Watts(100, 100), cool.target)
        // #768 accepts it as valid: the engine is built on it and opens on the warm-up's first second.
        val rig = rig()
        assertEquals("Warm-up", rig.state.stepLabel)
        assertEquals(100, rig.state.targetW)
        // It survives the recording: the session is written whole into meta.json and read back.
        val json = RideJson.encodeToString(RideSession.serializer(), s)
        assertEquals(s, RideJson.decodeFromString(RideSession.serializer(), json))
        assertTrue(json.contains("\"kind\":\"ramp_test\""))
    }

    @Test
    fun theStaircaseIsOneHundredWattsRisingTwentyEveryMinute() {
        val ramp = RampTest.session("r").steps[1]
        assertEquals(100, Targets.ergWatts(ramp, 0, null, 100))
        assertEquals(100, Targets.ergWatts(ramp, 59, null, 100))
        assertEquals(120, Targets.ergWatts(ramp, 60, null, 100))
        assertEquals(240, Targets.ergWatts(ramp, 7 * 60 + 30, null, 100))
        assertEquals(360, Targets.ergWatts(ramp, 13 * 60, null, 100))
        assertEquals(240, RampTest.stairW(7))
    }

    @Test
    fun aTrainerThatCannotHoldAPowerTargetCannotRunTheTest() {
        assertTrue(RampTest.canRun(null))
        assertTrue(RampTest.canRun(FtmsFeatures(cadence = true, power = true, erg = true, spinDown = false)))
        assertFalse(RampTest.canRun(FtmsFeatures(cadence = true, power = true, erg = false, spinDown = false)))
    }

    // ---- The engine ends the ramp (against #768's fake trainer and clock) ----

    @Test
    fun theTapEndsTheRampAndStartsTheCooldownWithReasonSkip() {
        val rig = rampRig()
        rig.seconds(10)
        rig.engine.skipStep()
        assertEquals("Cool-down", rig.state.stepLabel)
        assertEquals("skip", rig.sink.events("step_start").last().text("reason"))
    }

    @Test
    fun cadenceUnderSixtyForFiveSamplesEndsTheRampWithReasonEndConditionAndFourDoNot() {
        val rig = rampRig()
        rig.seconds(10, cadence = 85.0)
        repeat(4) { rig.second(cadence = 50.0) }
        rig.second(cadence = 85.0)
        assertEquals("Ramp", rig.state.stepLabel)
        repeat(4) { rig.second(cadence = 50.0) }
        assertEquals("Ramp", rig.state.stepLabel)
        rig.second(cadence = 50.0)
        assertEquals("Cool-down", rig.state.stepLabel)
        assertEquals("end_condition", rig.sink.events("step_start").last().text("reason"))
    }

    @Test
    fun aSampleWithNoCadenceNeverCountsAndZeroRpmDoes() {
        val rig = rampRig()
        rig.seconds(5, cadence = 85.0)
        repeat(4) { rig.second(cadence = 50.0) }
        // The trainer drops out for a second: that sample has no cadence, and the run starts again.
        rig.engine.onTrainerDisconnected()
        rig.idle(1000)
        assertNull(rig.sink.samples.last().cadenceRpm)
        rig.connect()
        rig.answerAll()
        repeat(4) { rig.second(cadence = 50.0) }
        assertEquals("Ramp", rig.state.stepLabel)
        // Not pedalling (0 rpm) is under 60: five of those end it.
        repeat(5) { rig.second(cadence = 0.0) }
        assertEquals("Cool-down", rig.state.stepLabel)
    }

    @Test
    fun aTrainerThatReportsNoCadenceNeverEndsTheRampByItself() {
        val rig = rampRig()
        rig.idle(1000)
        rig.engine.onTrainerDisconnected()
        rig.idle(30_000)
        assertEquals("Ramp", rig.state.stepLabel)
        assertEquals(RidePhase.Running, rig.state.phase)
    }

    @Test
    fun aSecondTapWithinASecondOfTheFirstIsIgnored() {
        val rig = rig()
        rig.start()
        rig.seconds(2)
        rig.engine.skipStep()
        rig.engine.skipStep()
        assertEquals("Ramp", rig.state.stepLabel)
    }
}
