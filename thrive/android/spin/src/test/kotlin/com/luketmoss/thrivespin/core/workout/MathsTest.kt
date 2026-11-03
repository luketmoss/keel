package com.luketmoss.thrivespin.core.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MathsTest {
    private val steps = exampleSteps()

    @Test
    fun theExampleAtFtp250And100Percent() {
        val e = Maths.estimate(steps, 250, 100)
        assertEquals(4440, e.totalS)
        assertEquals("1 h 14 min", WorkoutText.total(e.totalS))
        assertEquals(61, e.tss)
        assertEquals("0.70", e.ifText)
        assertEquals(675, e.workKj)
    }

    @Test
    fun theExampleAt105Percent() {
        val e = Maths.estimate(steps, 250, 105)
        assertEquals(67, e.tss)
        assertEquals("0.74", e.ifText)
        assertEquals(709, e.workKj)
    }

    @Test
    fun tssAndIfDoNotNeedAnFtpButWorkDoes() {
        val e = Maths.estimate(steps, null, 100)
        assertEquals(61, e.tss)
        assertEquals("0.70", e.ifText)
        assertNull(e.workKj)
    }

    @Test
    fun onlyErgStepsAddLoadButEveryStepAddsTime() {
        val ergOnly = StepsV1(listOf(Step("A", 600, StepMode.Erg, pct = 100)))
        val withFree = StepsV1(ergOnly.blocks + Step("B", 600, StepMode.Free))
        val a = Maths.estimate(ergOnly, 250, 100)
        val b = Maths.estimate(withFree, 250, 100)
        assertEquals(a.tss, b.tss)
        assertEquals(a.workKj, b.workKj)
        assertEquals(1200, b.totalS)
        // The same TSS over twice the hours is a lower IF.
        assertEquals("1.00", a.ifText)
        assertEquals("0.71", b.ifText)
    }

    @Test
    fun aWorkoutWithNoErgStepHasNoLoad() {
        val e = Maths.estimate(StepsV1(listOf(Step("A", 600, StepMode.Free))), 250, 100)
        assertEquals(0, e.tss)
        assertEquals("0.00", e.ifText)
        assertEquals(0, e.workKj)
    }

    @Test
    fun scaledWattsRoundHalfUp() {
        val resolved = Maths.expand(steps, 250, 105)
        // Warm-up ramp 50-70%.
        assertEquals(131, resolved[0].wattsStart)
        assertEquals(184, resolved[0].wattsEnd)
        // 90% at FTP 250 and 105% is 236.25.
        assertEquals(236, resolved[1].wattsStart)
        assertEquals(236, resolved[1].wattsEnd)
        assertEquals(Maths.watts(250, 50, 100), 125)
        assertEquals(Maths.watts(250, 70, 100), 175)
        // Exactly .5 goes up: 100 x 25 x 100 / 10000 = 25, 101 x 50 x 100 / 10000 = 50.5.
        assertEquals(51, Maths.watts(101, 50, 100))
    }

    @Test
    fun repeatsAreUnrolledInOrder() {
        val resolved = Maths.expand(steps, 250, 100)
        assertEquals(
            listOf("Warm-up", "Sweet spot", "Recover", "Sweet spot", "Recover", "Sweet spot", "Recover", "Climb", "Spin", "Cool-down"),
            resolved.map { it.label },
        )
    }

    @Test
    fun intensityNeverChangesALevelOrAGrade() {
        val at = Maths.expand(steps, 250, 130)
        val base = Maths.expand(steps, 250, 100)
        assertEquals(base[7].gradeTenths, at[7].gradeTenths)
        assertEquals(base[8].level, at[8].level)
        assertNull(at[7].wattsStart)
        assertNull(at[8].wattsStart)
        assertNull(at[9].wattsStart)
    }

    @Test
    fun noFtpMeansNoWatts() {
        val resolved = Maths.expand(steps, null, 100)
        assertNull(resolved[0].wattsStart)
        assertEquals("50–70%", WorkoutText.pctText(resolved[0]))
        assertEquals("90%", WorkoutText.target(resolved[1]))
    }

    @Test
    fun zonesAtTheBoundaries() {
        val expected = mapOf(
            55 to Zone.Z1, 56 to Zone.Z2, 75 to Zone.Z2, 76 to Zone.Z3, 90 to Zone.Z3,
            91 to Zone.Z4, 105 to Zone.Z4, 106 to Zone.Z5, 120 to Zone.Z5, 121 to Zone.Z6,
        )
        for ((pct, zone) in expected) assertEquals("$pct", zone, Zones.forPct(pct.toDouble()))
    }

    @Test
    fun aRampTakesTheZoneOfItsMean() {
        val ramp = Maths.resolve(Step("R", 60, StepMode.Erg, pct = 50, pctEnd = 70), 250, 100)
        // Mean 60 is Z2, though it starts in Z1.
        assertEquals(Zone.Z2, ramp.zone(100))
        // At 130% the mean is 78.
        assertEquals(Zone.Z3, ramp.zone(130))
        assertNull(Maths.resolve(Step("S", 60, StepMode.Free), 250, 100).zone(100))
    }

    @Test
    fun durationsAndTotalsRead() {
        assertEquals("12:00", WorkoutText.clock(720))
        assertEquals("0:30", WorkoutText.clock(30))
        assertEquals("75:00", WorkoutText.clock(4500))
        assertEquals("4:05", WorkoutText.clock(245))
        assertEquals("45 min", WorkoutText.total(2700))
        assertEquals("1 h 05 min", WorkoutText.total(3900))
        assertEquals("1 h 00 min", WorkoutText.total(3600))
        assertEquals("1 h 14 min", WorkoutText.total(4440))
    }

    @Test
    fun targetsReadAsTheNoteWrites() {
        val resolved = Maths.expand(steps, 250, 100)
        assertEquals("50–70% · 125–175 W", WorkoutText.target(resolved[0]))
        assertEquals("90% · 225 W", WorkoutText.target(resolved[1]))
        assertEquals("Slope 4.5%", WorkoutText.target(resolved[7]))
        assertEquals("Resistance 30", WorkoutText.target(resolved[8]))
        assertEquals("Free", WorkoutText.target(resolved[9]))
        assertEquals("−2.0%", WorkoutText.grade(-20))
    }
}
