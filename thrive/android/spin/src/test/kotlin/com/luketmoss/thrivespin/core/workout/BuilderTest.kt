package com.luketmoss.thrivespin.core.workout

import com.luketmoss.thrivespin.core.SpinJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BuilderTest {
    private fun fresh() = Draft.forNew("id-1")

    private fun named(d: Draft) = d.withName("Test").withCategory("Endurance")

    @Test
    fun aNewWorkoutStartsWithOneSelectedWarmUp() {
        val d = fresh()
        assertEquals("", d.content.name)
        assertNull(d.content.category)
        assertEquals(listOf<Block>(Step("Warm-up", 600, StepMode.Erg, pct = 55)), d.blocks)
        assertEquals(Selection(0), d.selected)
        assertFalse(d.dirty)
    }

    @Test
    fun theAddButtonsAddTheNotesDefaultsAndSelectThem() {
        var d = fresh().addStep()
        assertEquals(Step("Endurance", 600, StepMode.Erg, pct = 65), d.blocks[1])
        assertEquals(Selection(1), d.selected)

        d = d.addRepeat()
        val repeat = d.blocks[2] as Repeat
        assertEquals(4, repeat.times)
        assertEquals(listOf(Step("Work", 180, StepMode.Erg, pct = 110), Step("Recover", 180, StepMode.Erg, pct = 50)), repeat.steps)
        assertEquals(Selection(2), d.selected)

        d = d.addStepInRepeat(2)
        assertEquals(Step("Recover", 180, StepMode.Erg, pct = 50), (d.blocks[2] as Repeat).steps[2])
        assertEquals(Selection(2, 2), d.selected)
        assertTrue(d.dirty)
    }

    @Test
    fun theLimitsAreEnforcedAtTheButtons() {
        var d = fresh()
        repeat(99) { d = d.addStep() }
        assertEquals(100, d.blocks.size)
        assertFalse(d.canAddBlock)
        assertEquals(d, d.addStep())
        assertEquals(d, d.addRepeat())

        var r = fresh().addRepeat()
        // The repeat has two steps; add until 20.
        repeat(18) { r = r.addStepInRepeat(1) }
        assertEquals(20, (r.blocks[1] as Repeat).steps.size)
        assertFalse(r.canAddStepInRepeat(1))
        assertEquals(r, r.addStepInRepeat(1))
    }

    @Test
    fun moveStaysWithinItsOwnList() {
        val d = fresh().addStep().addRepeat()
        // Top level: [Warm-up, Endurance, repeat].
        assertFalse(d.canMoveDown(Selection(2)))
        assertTrue(d.canMoveUp(Selection(2)))
        val up = d.moveUp(Selection(2))
        assertTrue(up.blocks[1] is Repeat)
        assertEquals(Selection(1), up.selected)
        assertEquals(d, d.moveDown(Selection(2)))

        // In the repeat: [Work, Recover].
        assertFalse(d.canMoveUp(Selection(2, 0)))
        assertTrue(d.canMoveDown(Selection(2, 0)))
        val down = d.moveDown(Selection(2, 0))
        assertEquals(listOf("Recover", "Work"), (down.blocks[2] as Repeat).steps.map { it.label })
        assertEquals(3, down.blocks.size)
        assertEquals(Selection(2, 1), down.selected)
        assertEquals(d, d.moveUp(Selection(2, 0)))
    }

    @Test
    fun deletingARepeatsLastStepRemovesTheRepeat() {
        var d = fresh().addRepeat()
        d = d.delete(Selection(1, 1))
        assertEquals(1, (d.blocks[1] as Repeat).steps.size)
        assertEquals(Selection(1, 0), d.selected)
        d = d.delete(Selection(1, 0))
        assertEquals(1, d.blocks.size)
        assertTrue(d.blocks[0] is Step)
        assertEquals(Selection(0), d.selected)
    }

    @Test
    fun deletingMovesTheSelectionToTheBlockBeforeElseAfterElseNothing() {
        val d = fresh().addStep().addStep()
        assertEquals(Selection(1), d.delete(Selection(2)).selected)
        assertEquals(Selection(0), d.delete(Selection(0)).selected)
        assertEquals(2, d.delete(Selection(0)).blocks.size)
        val only = fresh().delete(Selection(0))
        assertTrue(only.blocks.isEmpty())
        assertNull(only.selected)
    }

    @Test
    fun deletingARepeatRemovesItsSteps() {
        val d = fresh().addRepeat().delete(Selection(1))
        assertEquals(1, d.blocks.size)
        assertEquals(Selection(0), d.selected)
    }

    @Test
    fun switchingModeKeepsLabelDurationAndCadenceAndSetsTheDefaultTarget() {
        val sel = Selection(0)
        var d = fresh().setLabel(sel, "Spin up").setDuration(sel, 900).setCadenceOn(sel, true).setCadence(sel, 100)
        val resistance = d.setMode(sel, StepMode.Resistance).stepAt(sel)!!
        assertEquals(Step("Spin up", 900, StepMode.Resistance, level = 30, cadence = 100), resistance)
        val slope = d.setMode(sel, StepMode.Slope).stepAt(sel)!!
        assertEquals(Step("Spin up", 900, StepMode.Slope, gradeTenths = 20, cadence = 100), slope)
        val free = d.setMode(sel, StepMode.Free).stepAt(sel)!!
        assertEquals(Step("Spin up", 900, StepMode.Free, cadence = 100), free)
        d = d.setRamp(sel, true)
        assertEquals(75, d.stepAt(sel)!!.pctEnd)
        val erg = d.setMode(sel, StepMode.Erg).stepAt(sel)!!
        assertEquals(Step("Spin up", 900, StepMode.Erg, pct = 65, cadence = 100), erg)
    }

    @Test
    fun theDurationStepperMovesHalfAMinuteBelowFiveAndAMinuteFromThere() {
        assertEquals(240, Draft.nextDuration(210, true))
        assertEquals(300, Draft.nextDuration(270, true))
        assertEquals(360, Draft.nextDuration(300, true))
        assertEquals(300, Draft.nextDuration(360, false))
        assertEquals(240, Draft.nextDuration(300, false))
        assertEquals(210, Draft.nextDuration(240, false))
        assertEquals(30, Draft.nextDuration(30, false))
        assertEquals(14400, Draft.nextDuration(14400, true))
    }

    @Test
    fun theSteppersStayInRange() {
        val sel = Selection(0)
        var d = fresh().setPct(sel, 300).nudgePct(sel, true)
        assertEquals(300, d.stepAt(sel)!!.pct)
        d = d.setPct(sel, 0).nudgePct(sel, false)
        assertEquals(0, d.stepAt(sel)!!.pct)
        d = d.setRamp(sel, true)
        assertEquals(20, d.stepAt(sel)!!.pctEnd)
        d = d.setPct(sel, 290).setRamp(sel, true)
        assertEquals(300, d.stepAt(sel)!!.pctEnd)
        d = d.setRamp(sel, false)
        assertNull(d.stepAt(sel)!!.pctEnd)

        val r = fresh().setMode(sel, StepMode.Slope)
        assertEquals(-100, r.setGrade(sel, -500).stepAt(sel)!!.gradeTenths)
        assertEquals(200, r.setGrade(sel, 900).stepAt(sel)!!.gradeTenths)
        assertEquals(25, r.nudgeGrade(sel, true).stepAt(sel)!!.gradeTenths)

        val c = fresh().setCadenceOn(sel, true)
        assertEquals(90, c.stepAt(sel)!!.cadence)
        assertEquals(150, c.setCadence(sel, 400).stepAt(sel)!!.cadence)
        assertEquals(40, c.setCadence(sel, 1).stepAt(sel)!!.cadence)
        assertNull(c.setCadenceOn(sel, false).stepAt(sel)!!.cadence)

        val rep = fresh().addRepeat()
        assertEquals(2, rep.setTimes(1, 1).repeatAt(Selection(1))!!.times)
        assertEquals(50, rep.setTimes(1, 99).repeatAt(Selection(1))!!.times)
        assertEquals(5, rep.nudgeTimes(1, true).repeatAt(Selection(1))!!.times)
    }

    @Test
    fun aLoadedWorkoutSavedWithNoEditsSerializesEqualToWhatWasLoaded() {
        val loaded = exampleSteps()
        val d = Draft.forEdit("rw_1", "Sweet Spot", "Sweet spot", "", loaded)
        assertFalse(d.dirty)
        assertEquals(loaded, d.steps())
        assertEquals(loaded.toJson(), d.steps().toJson())
        assertNull(d.problem())
        assertFalse(d.isNew)
    }

    @Test
    fun saveStopsOnTheNotesProblemsInOrder() {
        var d = fresh()
        assertEquals("Give the workout a name.", d.problem()!!.text)
        d = d.withName("  ")
        assertEquals("Give the workout a name.", d.problem()!!.text)
        d = d.withName("Test")
        assertEquals("Pick a category.", d.problem()!!.text)
        d = d.withCategory("VO2")
        assertNull(d.problem())

        val blank = d.addRepeat().setLabel(Selection(1, 0), " ")
        val p = blank.problem()!!
        assertEquals("Every step needs a name.", p.text)
        assertEquals(Selection(1, 0), p.selection)

        val topBlank = d.setLabel(Selection(0), "")
        assertEquals(Selection(0), topBlank.problem()!!.selection)
    }

    @Test
    fun overSixHoursAndOverFiveThousandCharactersAreStopped() {
        val sel = Selection(0)
        var d = named(fresh()).setDuration(sel, 14400).addStep().setDuration(Selection(1), 14400)
        assertEquals("A workout can be at most 6 hours.", d.problem()!!.text)
        d = named(fresh())
        repeat(60) {
            d = d.addStep()
            val i = d.blocks.size - 1
            d = d.setLabel(Selection(i), "x".repeat(40)).setDuration(Selection(i), 30)
        }
        assertEquals("This workout has too many steps to save.", d.problem()!!.text)
    }

    @Test
    fun theLimitsOnTextAreKept() {
        assertEquals(80, fresh().withName("x".repeat(200)).content.name.length)
        assertEquals(1000, fresh().withDescription("x".repeat(2000)).content.description.length)
        assertEquals(40, fresh().setLabel(Selection(0), "x".repeat(100)).stepAt(Selection(0))!!.label.length)
    }

    @Test
    fun theDraftSurvivesBeingSavedAsAString() {
        val d = named(fresh().addRepeat().addStepInRepeat(1).setCadenceOn(Selection(1, 0), true))
        val text = SpinJson.encodeToString(Draft.serializer(), d)
        assertEquals(d, SpinJson.decodeFromString(Draft.serializer(), text))
    }
}
