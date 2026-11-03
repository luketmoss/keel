package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.DeviceState
import com.luketmoss.thrivespin.core.ride.recording.RideJson
import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.Repeat
import com.luketmoss.thrivespin.core.workout.RideRequest
import com.luketmoss.thrivespin.core.workout.Step
import com.luketmoss.thrivespin.core.workout.StepMode
import com.luketmoss.thrivespin.core.workout.StepsV1
import com.luketmoss.thrivespin.core.workout.TrainerMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RideStartingTest {
    private val steps = StepsV1(
        listOf(
            Step("Warm up", 300, StepMode.Erg, pct = 50, pctEnd = 70),
            Repeat(
                3,
                listOf(
                    Step("Sweet spot", 600, StepMode.Erg, pct = 90, cadence = 90),
                    Step("Recover", 240, StepMode.Resistance, level = 20),
                ),
            ),
            Step("Hill", 120, StepMode.Slope, gradeTenths = 45),
            Step("Cool down", 300, StepMode.Free),
        ),
    )
    private val request = RideRequest("rw_1", "Sweet Spot 3x10", steps, 105, TrainerMode.Slope, 250)

    private class Calls {
        val launched = mutableListOf<RideSession>()
        val outcomes = mutableListOf<StartOutcome>()
    }

    private fun launcher(calls: Calls, devices: DeviceState, active: Boolean) =
        RideLauncher({ devices }, { active }, { "ride-xyz" }, { calls.launched += it }, { calls.outcomes += it })

    @Test
    fun withNoTrainerSavedNothingStarts() {
        val calls = Calls()
        launcher(calls, DeviceState(), active = false).start(request)
        assertTrue(calls.launched.isEmpty())
        assertEquals(listOf<StartOutcome>(StartOutcome.NoTrainer), calls.outcomes)
    }

    @Test
    fun withARideActiveNothingNewStarts() {
        val calls = Calls()
        launcher(calls, DeviceState(trainer = TRAINER), active = true).start(request)
        assertTrue(calls.launched.isEmpty())
        assertEquals(listOf<StartOutcome>(StartOutcome.AlreadyRiding), calls.outcomes)
    }

    @Test
    fun otherwiseItBuildsASessionThatMatchesTheResolvedSteps() {
        val calls = Calls()
        launcher(calls, DeviceState(trainer = TRAINER), active = false).start(request)
        val session = calls.launched.single()
        assertEquals(listOf<StartOutcome>(StartOutcome.Started(session)), calls.outcomes)
        assertEquals("ride-xyz", session.rideId)
        assertEquals(RideKind.Workout, session.kind)
        assertEquals("rw_1", session.workoutId)
        assertEquals("Sweet Spot 3x10", session.name)
        assertEquals(250, session.ftpW)
        assertEquals(105, session.intensityPct)
        assertEquals(TrainerMode.Slope, session.mode)
        assertTrue(session.intensityAdjustable)

        val resolved = Maths.expand(steps, 250, 105)
        assertEquals(resolved.size, session.steps.size)
        resolved.zip(session.steps).forEach { (r, s) ->
            assertEquals(r.label, s.label)
            assertEquals(r.durS, s.durS)
            assertEquals(r.cadence, s.cadenceRpm)
            assertNull(s.endWhen)
        }
        assertEquals(StepTarget.PctOfFtp(50, 70), session.steps[0].target)
        assertEquals(StepTarget.PctOfFtp(90, 90), session.steps[1].target)
        assertEquals(StepTarget.Level(20), session.steps[2].target)
        assertEquals(StepTarget.Grade(4.5), session.steps[7].target)
        assertEquals(StepTarget.Free, session.steps[8].target)
        // The same watts as the detail screen: 90% at 105% of 250 W.
        assertEquals(resolved[1].wattsStart, Targets.ergWatts(session.steps[1], 0, 250, 105))
    }

    @Test
    fun stepsInsideARepeatKnowTheirPassOutOfTheCount() {
        val calls = Calls()
        launcher(calls, DeviceState(trainer = TRAINER), active = false).start(request)
        val positions = calls.launched.single().steps.map { it.position }
        assertEquals(
            listOf(null, "1 of 3", "1 of 3", "2 of 3", "2 of 3", "3 of 3", "3 of 3", null, null),
            positions,
        )
    }

    @Test
    fun aSessionSurvivesBeingWrittenAndRead() {
        val calls = Calls()
        launcher(calls, DeviceState(trainer = TRAINER), active = false).start(request)
        val session = calls.launched.single()
        val json = RideJson.encodeToString(RideSession.serializer(), session)
        assertEquals(session, RideJson.decodeFromString(RideSession.serializer(), json))
        val ramp = session(
            step("Ramp", StepTarget.WattsStairs(100, 20, 60), null, EndCondition.CadenceBelow(60, 5)),
            step("Cool", StepTarget.Watts(100, 100), 60),
            ftp = null,
            adjustable = false,
            kind = RideKind.RampTest,
        )
        val rampJson = RideJson.encodeToString(RideSession.serializer(), ramp)
        assertEquals(ramp, RideJson.decodeFromString(RideSession.serializer(), rampJson))
        assertTrue(rampJson.contains("\"kind\":\"ramp_test\""))
    }
}
