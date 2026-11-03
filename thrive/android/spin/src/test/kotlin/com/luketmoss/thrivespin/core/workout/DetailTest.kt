package com.luketmoss.thrivespin.core.workout

import com.luketmoss.thrivespin.core.FtmsFeatures
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetailTest {
    private val withErg = FtmsFeatures(cadence = true, power = true, erg = true, spinDown = false)
    private val noErg = FtmsFeatures(cadence = true, power = true, erg = false, spinDown = false)

    @Test
    fun intensityStartsAt100AndStopsAtTheLimits() {
        var s = DetailState.open("w", null)
        assertEquals(100, s.intensityPct)
        repeat(100) { s = s.easier() }
        assertEquals(50, s.intensityPct)
        assertFalse(s.canEasier)
        assertTrue(s.canHarder)
        repeat(200) { s = s.harder() }
        assertEquals(130, s.intensityPct)
        assertFalse(s.canHarder)
        s = s.harder()
        assertEquals(130, s.intensityPct)
    }

    @Test
    fun theButtonsMoveByOne() {
        val s = DetailState.open("w", null)
        assertEquals(101, s.harder().intensityPct)
        assertEquals(99, s.easier().intensityPct)
    }

    @Test
    fun aPresetSetsItsValueAndNoneIsSelectedBetween() {
        val s = DetailState.open("w", null)
        for (p in listOf(80, 90, 100, 105, 110)) {
            assertEquals(p, s.preset(p).intensityPct)
            assertEquals(p, s.preset(p).selectedPreset)
        }
        assertNull(s.withIntensity(97).selectedPreset)
        assertNull(s.harder().selectedPreset)
    }

    @Test
    fun aDetailStateMadeAgainIsBackAt100() {
        val first = DetailState.open("w", null).preset(110)
        assertEquals(110, first.intensityPct)
        assertEquals(100, DetailState.open("w", null).intensityPct)
    }

    @Test
    fun theHintAndStartLabelFollowTheNote() {
        val s = DetailState.open("w", null)
        assertEquals("The whole workout, as written", s.hint)
        assertEquals("Start ride", s.startLabel)
        val up = s.preset(105)
        assertEquals("The whole workout at 105% · watts below are scaled", up.hint)
        assertEquals("Start at 105%", up.startLabel)
        assertEquals("Start at 95%", s.withIntensity(95).startLabel)
    }

    @Test
    fun theModeDefaultsToErgUnlessTheTrainerKnowsItLacksIt() {
        assertEquals(TrainerMode.Erg, DetailState.open("w", null).mode)
        assertEquals(TrainerMode.Erg, DetailState.open("w", withErg).mode)
        assertEquals(TrainerMode.Resistance, DetailState.open("w", noErg).mode)
        assertFalse(DetailState.ergDisabled(null))
        assertFalse(DetailState.ergDisabled(withErg))
        assertTrue(DetailState.ergDisabled(noErg))
        assertEquals(
            "Your trainer doesn't report ERG, so the targets are a guide.",
            DetailState.modeHint(TrainerMode.Resistance, true),
        )
        assertEquals(
            "ERG holds the target power for you, whatever your cadence or gear.",
            DetailState.modeHint(TrainerMode.Erg, false),
        )
    }

    @Test
    fun trainerModeIsOfferedOnlyWithAnErgStep() {
        assertTrue(exampleSteps().hasErg)
        assertFalse(StepsV1(listOf(Step("A", 60, StepMode.Free), Step("B", 60, StepMode.Resistance, level = 20))).hasErg)
    }

    @Test
    fun startBuildsASnapshotWithTheValuesShown() {
        val steps = exampleSteps()
        val state = DetailState.open("rw_1", withErg).preset(105).withMode(TrainerMode.Slope)
        val request = state.request("Sweet Spot 3x12", steps, 250)!!
        assertEquals(RideRequest("rw_1", "Sweet Spot 3x12", steps, 105, TrainerMode.Slope, 250), request)
        // A later change to the state or the workout leaves the built request as it was.
        state.preset(80)
        assertEquals(105, request.intensityPct)
        assertEquals(250, request.ftpW)
    }

    @Test
    fun withNoFtpNoRequestIsBuilt() {
        assertNull(DetailState.open("rw_1", null).request("A", exampleSteps(), null))
    }
}
