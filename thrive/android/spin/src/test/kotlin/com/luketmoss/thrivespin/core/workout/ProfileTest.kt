package com.luketmoss.thrivespin.core.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProfileTest {
    @Test
    fun oneBarPerResolvedStepWithItsZone() {
        val m = Profile.model(exampleSteps(), 100)
        assertEquals(10, m.bars.size)
        assertEquals(4440, m.totalS)
        // The warm-up ramp 50-70% takes Z2 (mean 60); the sweet spot at 90% is Z3; Recover at 55% is Z1.
        assertEquals(Zone.Z2, m.bars[0].zone)
        assertEquals(Zone.Z3, m.bars[1].zone)
        assertEquals(Zone.Z1, m.bars[2].zone)
    }

    @Test
    fun heightsAreTheScaledPctOverTheChartsTop() {
        val m = Profile.model(exampleSteps(), 100)
        // Top is 130 (the highest target is 90).
        assertEquals(50f / 130f, m.bars[0].startFraction, 1e-6f)
        assertEquals(70f / 130f, m.bars[0].endFraction, 1e-6f)
        assertEquals(90f / 130f, m.bars[1].startFraction, 1e-6f)
        assertEquals(100f / 130f, m.ftpFraction, 1e-6f)
    }

    @Test
    fun nothingClipsAtHighIntensity() {
        val steps = StepsV1(listOf(Step("Hard", 60, StepMode.Erg, pct = 200)))
        val m = Profile.model(steps, 130)
        // 200 x 1.3 = 260; top is 270.
        assertEquals(260f / 270f, m.bars[0].startFraction, 1e-5f)
        assertEquals(100f / 270f, m.ftpFraction, 1e-5f)
    }

    @Test
    fun stepsWithNoPowerTargetAreFlatNeutralBars() {
        val m = Profile.model(exampleSteps(), 100)
        for (i in 7..9) {
            assertNull(m.bars[i].zone)
            assertEquals(0.4f, m.bars[i].startFraction, 0f)
            assertEquals(0.4f, m.bars[i].endFraction, 0f)
        }
    }

    @Test
    fun theContentDescriptionNamesTheStepsAndTheTotal() {
        assertEquals("Profile: 10 steps, 1 h 14 min", Profile.description(exampleSteps()))
    }
}
