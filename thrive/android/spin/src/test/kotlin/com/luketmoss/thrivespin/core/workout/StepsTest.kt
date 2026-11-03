package com.luketmoss.thrivespin.core.workout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** #765's example workout, the one the contract and every number in these tests hang on. */
const val EXAMPLE_STEPS = """{"v":1,"steps":[
  {"label":"Warm-up","dur_s":600,"mode":"erg","pct":50,"pct_end":70},
  {"repeat":3,"steps":[
    {"label":"Sweet spot","dur_s":720,"mode":"erg","pct":90,"cadence":90},
    {"label":"Recover","dur_s":240,"mode":"erg","pct":55}]},
  {"label":"Climb","dur_s":300,"mode":"slope","grade":4.5},
  {"label":"Spin","dur_s":300,"mode":"resistance","level":30},
  {"label":"Cool-down","dur_s":360,"mode":"free"}]}"""

fun exampleSteps(): StepsV1 = (StepsV1.parse(EXAMPLE_STEPS) as StepsParse.Ok).steps

class StepsTest {
    private fun problem(text: String): StepsProblem? = (StepsV1.parse(text) as? StepsParse.Invalid)?.problem

    private fun step(extra: String) =
        """{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"erg","pct":50$extra}]}"""

    @Test
    fun theExampleIsAccepted() {
        val steps = exampleSteps()
        assertEquals(5, steps.blocks.size)
        assertEquals(4440, steps.totalSeconds)
        assertTrue(steps.hasErg)
        val sweet = (steps.blocks[1] as Repeat).steps[0]
        assertEquals(90, sweet.pct)
        assertEquals(90, sweet.cadence)
        assertEquals(45, (steps.blocks[2] as Step).gradeTenths)
    }

    @Test
    fun parseSerializeParseGivesAnEqualValue() {
        val first = exampleSteps()
        val text = first.toJson()
        val second = (StepsV1.parse(text) as StepsParse.Ok).steps
        assertEquals(first, second)
        assertEquals(text, second.toJson())
    }

    @Test
    fun serializedKeysAreInTheExamplesOrder() {
        assertEquals(
            """{"v":1,"steps":[{"label":"Warm-up","dur_s":600,"mode":"erg","pct":50,"pct_end":70},""" +
                """{"repeat":3,"steps":[{"label":"Sweet spot","dur_s":720,"mode":"erg","pct":90,"cadence":90},""" +
                """{"label":"Recover","dur_s":240,"mode":"erg","pct":55}]},""" +
                """{"label":"Climb","dur_s":300,"mode":"slope","grade":4.5},""" +
                """{"label":"Spin","dur_s":300,"mode":"resistance","level":30},""" +
                """{"label":"Cool-down","dur_s":360,"mode":"free"}]}""",
            exampleSteps().toJson(),
        )
    }

    @Test
    fun theObjectTheApiSendsIsReadAsWellAsItsText() {
        val element = com.luketmoss.thrivespin.core.SpinJson.parseToJsonElement(EXAMPLE_STEPS)
        assertEquals(exampleSteps(), (StepsV1.fromElement(element) as StepsParse.Ok).steps)
    }

    @Test
    fun aNestedRepeatIsRefused() {
        val text = """{"v":1,"steps":[{"repeat":2,"steps":[{"repeat":2,"steps":[""" +
            """{"label":"A","dur_s":60,"mode":"free"}]}]}]}"""
        assertEquals(StepsProblem.NestedRepeat, problem(text))
    }

    @Test
    fun anUnknownKeyIsRefused() {
        assertEquals(StepsProblem.UnknownKey, problem(step(""","bogus":1""")))
        assertEquals(StepsProblem.UnknownKey, problem("""{"v":1,"steps":[],"extra":1}"""))
        assertEquals(
            StepsProblem.UnknownKey,
            problem("""{"v":1,"steps":[{"repeat":2,"extra":1,"steps":[{"label":"A","dur_s":60,"mode":"free"}]}]}"""),
        )
    }

    @Test
    fun aTargetOutOfRangeIsRefused() {
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"erg","pct":301}]}"""))
        assertEquals(StepsProblem.BadValue, problem(step(""","pct_end":301""")))
        assertEquals(StepsProblem.BadValue, problem(step(""","cadence":39""")))
        assertEquals(StepsProblem.BadValue, problem(step(""","cadence":151""")))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":0,"mode":"free"}]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":14401,"mode":"free"}]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"resistance","level":101}]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"","dur_s":60,"mode":"free"}]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"  ","dur_s":60,"mode":"free"}]}"""))
        val long = "x".repeat(41)
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"$long","dur_s":60,"mode":"free"}]}"""))
    }

    @Test
    fun aGradeNeedsOneDecimalAtMostAndStaysInRange() {
        fun grade(g: String) = problem("""{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"slope","grade":$g}]}""")
        assertEquals(StepsProblem.BadValue, grade("4.55"))
        assertEquals(StepsProblem.BadValue, grade("20.5"))
        assertEquals(StepsProblem.BadValue, grade("-10.5"))
        assertEquals(null, grade("4.5"))
        assertEquals(null, grade("-10"))
        assertEquals(null, grade("20.0"))
        assertEquals(null, grade("4"))
    }

    @Test
    fun aSlopeStepCarryingPctIsRefused() {
        assertEquals(
            StepsProblem.UnknownKey,
            problem("""{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"slope","grade":4.5,"pct":90}]}"""),
        )
    }

    @Test
    fun aRepeatOfOneOrFiftyOneIsRefused() {
        fun repeat(n: Int) = problem("""{"v":1,"steps":[{"repeat":$n,"steps":[{"label":"A","dur_s":60,"mode":"free"}]}]}""")
        assertEquals(StepsProblem.BadRepeat, repeat(1))
        assertEquals(StepsProblem.BadRepeat, repeat(51))
        assertEquals(null, repeat(2))
        assertEquals(null, repeat(50))
    }

    @Test
    fun theSameRulesApplyToAValueBuiltInTheBuilder() {
        val s = Step("A", 60, StepMode.Free)
        assertEquals(StepsProblem.BadRepeat, StepsV1(listOf(Repeat(1, listOf(s)))).problem())
        assertEquals(StepsProblem.BadRepeat, StepsV1(listOf(Repeat(51, listOf(s)))).problem())
        assertEquals(StepsProblem.BadRepeat, StepsV1(listOf(Repeat(2, emptyList()))).problem())
        assertEquals(StepsProblem.TooManySteps, StepsV1(listOf(Repeat(2, List(21) { s }))).problem())
        assertEquals(StepsProblem.TooManyBlocks, StepsV1(List(101) { s }).problem())
        assertEquals(StepsProblem.NoBlocks, StepsV1(emptyList()).problem())
        assertEquals(null, StepsV1(listOf(Repeat(2, listOf(s)))).problem())
    }

    @Test
    fun twentyOneStepsInARepeatAreRefused() {
        fun repeatOf(n: Int): String {
            val one = """{"label":"A","dur_s":10,"mode":"free"}"""
            return """{"v":1,"steps":[{"repeat":2,"steps":[${List(n) { one }.joinToString(",")}]}]}"""
        }
        assertEquals(StepsProblem.TooManySteps, problem(repeatOf(21)))
        assertEquals(null, problem(repeatOf(20)))
    }

    @Test
    fun aHundredAndOneBlocksAreRefused() {
        fun blocks(n: Int): String {
            val one = """{"label":"A","dur_s":10,"mode":"free"}"""
            return """{"v":1,"steps":[${List(n) { one }.joinToString(",")}]}"""
        }
        assertEquals(StepsProblem.TooManyBlocks, problem(blocks(101)))
        assertEquals(null, problem(blocks(100)))
    }

    @Test
    fun aTotalOverSixHoursIsRefused() {
        val a = """{"label":"A","dur_s":14400,"mode":"free"}"""
        val b = """{"label":"B","dur_s":7201,"mode":"free"}"""
        assertEquals(StepsProblem.TooLong, problem("""{"v":1,"steps":[$a,$b]}"""))
        val ok = """{"label":"B","dur_s":7200,"mode":"free"}"""
        assertEquals(null, problem("""{"v":1,"steps":[$a,$ok]}"""))
        // A repeat counts its seconds times its count.
        assertEquals(
            StepsProblem.TooLong,
            problem("""{"v":1,"steps":[{"repeat":2,"steps":[{"label":"A","dur_s":10801,"mode":"free"}]}]}"""),
        )
    }

    @Test
    fun serializedStepsOverFiveThousandCharactersAreRefused() {
        val label = "x".repeat(40)
        fun blocks(n: Int): String {
            val one = """{"label":"$label","dur_s":10,"mode":"erg","pct":50,"pct_end":60,"cadence":90}"""
            return """{"v":1,"steps":[${List(n) { one }.joinToString(",")}]}"""
        }
        assertEquals(StepsProblem.TooBig, problem(blocks(60)))
        assertEquals(null, problem(blocks(30)))
    }

    @Test
    fun aWrongVersionOrShapeIsRefused() {
        assertEquals(StepsProblem.BadVersion, problem("""{"v":2,"steps":[{"label":"A","dur_s":60,"mode":"free"}]}"""))
        assertEquals(StepsProblem.NotAnObject, problem("[]"))
        assertEquals(StepsProblem.NotAnObject, problem("not json"))
        assertEquals(StepsProblem.NoBlocks, problem("""{"v":1,"steps":[]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":60,"mode":"warp"}]}"""))
        assertEquals(StepsProblem.BadValue, problem("""{"v":1,"steps":[{"label":"A","dur_s":"60","mode":"free"}]}"""))
    }
}
