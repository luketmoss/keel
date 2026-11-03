package com.luketmoss.thrivespin.core.workout

import com.luketmoss.thrivespin.core.SpinJson
import java.math.BigDecimal
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Steps JSON v1, #765's format, as plain Kotlin. Targets are a percentage of FTP and are never
 * watts. The rules here are #765's rules, so the library's "couldn't be read" test and the
 * builder's checks never disagree with the API.
 */
enum class StepMode(val wire: String) {
    Erg("erg"),
    Resistance("resistance"),
    Slope("slope"),
    Free("free"),
}

@Serializable
sealed interface Block

/**
 * One step. Only the target of its [mode] is set: `pct` (and maybe `pctEnd`, a ramp) for ERG, `level`
 * for resistance, `gradeTenths` for slope (a grade is held in tenths of a percent, so 4.5 is 45 and
 * a grade with more than one decimal cannot exist).
 */
@Serializable
@SerialName("step")
data class Step(
    val label: String,
    val durS: Int,
    val mode: StepMode,
    val pct: Int? = null,
    val pctEnd: Int? = null,
    val level: Int? = null,
    val gradeTenths: Int? = null,
    val cadence: Int? = null,
) : Block

/** A repeat of 2-50 times through 1-20 steps. Repeats do not nest. */
@Serializable
@SerialName("repeat")
data class Repeat(val times: Int, val steps: List<Step>) : Block

enum class StepsProblem {
    NotAnObject,
    BadVersion,
    UnknownKey,
    BadValue,
    NestedRepeat,
    NoBlocks,
    TooManyBlocks,
    BadRepeat,
    TooManySteps,

    /** The total is over 6 hours. */
    TooLong,

    /** The serialized steps are over 5000 characters. */
    TooBig,
}

sealed interface StepsParse {
    data class Ok(val steps: StepsV1) : StepsParse
    data class Invalid(val problem: StepsProblem) : StepsParse
}

@Serializable
data class StepsV1(val blocks: List<Block>) {

    /** The total with repeats expanded, in seconds. */
    val totalSeconds: Int
        get() = blocks.sumOf { b ->
            when (b) {
                is Step -> b.durS
                is Repeat -> b.times * b.steps.sumOf { it.durS }
            }
        }

    /** Every step in order with repeats unrolled. */
    val flatSteps: List<Step>
        get() = blocks.flatMap { b ->
            when (b) {
                is Step -> listOf(b)
                is Repeat -> List(b.times) { b.steps }.flatten()
            }
        }

    val hasErg: Boolean get() = flatSteps.any { it.mode == StepMode.Erg }

    val allErg: Boolean get() = flatSteps.all { it.mode == StepMode.Erg }

    /** The compact JSON #765 stores, keys in the order of its example. */
    fun toJson(): String = buildString {
        append("{\"v\":1,\"steps\":[")
        blocks.forEachIndexed { i, b ->
            if (i > 0) append(',')
            when (b) {
                is Step -> appendStep(b)
                is Repeat -> {
                    append("{\"repeat\":").append(b.times).append(",\"steps\":[")
                    b.steps.forEachIndexed { j, s ->
                        if (j > 0) append(',')
                        appendStep(s)
                    }
                    append("]}")
                }
            }
        }
        append("]}")
    }

    /** The first rule this breaks, or null. Same rules for a parsed workout and for the builder's draft. */
    fun problem(): StepsProblem? {
        if (blocks.isEmpty()) return StepsProblem.NoBlocks
        if (blocks.size > MAX_BLOCKS) return StepsProblem.TooManyBlocks
        for (b in blocks) {
            when (b) {
                is Step -> if (!stepOk(b)) return StepsProblem.BadValue
                is Repeat -> {
                    if (b.times !in 2..MAX_REPEAT) return StepsProblem.BadRepeat
                    if (b.steps.isEmpty()) return StepsProblem.BadRepeat
                    if (b.steps.size > MAX_REPEAT_STEPS) return StepsProblem.TooManySteps
                    if (b.steps.any { !stepOk(it) }) return StepsProblem.BadValue
                }
            }
        }
        if (totalSeconds > MAX_TOTAL_S) return StepsProblem.TooLong
        if (toJson().length > MAX_CHARS) return StepsProblem.TooBig
        return null
    }

    private fun stepOk(s: Step): Boolean {
        if (s.label.isBlank() || s.label.length > MAX_LABEL) return false
        if (s.durS !in 1..MAX_STEP_S) return false
        if (s.cadence != null && s.cadence !in 40..150) return false
        return when (s.mode) {
            StepMode.Erg -> s.pct != null && s.pct in 0..300 && (s.pctEnd == null || s.pctEnd in 0..300) &&
                s.level == null && s.gradeTenths == null
            StepMode.Resistance -> s.level != null && s.level in 0..100 &&
                s.pct == null && s.pctEnd == null && s.gradeTenths == null
            StepMode.Slope -> s.gradeTenths != null && s.gradeTenths in -100..200 &&
                s.pct == null && s.pctEnd == null && s.level == null
            StepMode.Free -> s.pct == null && s.pctEnd == null && s.level == null && s.gradeTenths == null
        }
    }

    private fun StringBuilder.appendStep(s: Step) {
        append("{\"label\":").append(JsonPrimitive(s.label).toString())
        append(",\"dur_s\":").append(s.durS)
        append(",\"mode\":\"").append(s.mode.wire).append('"')
        when (s.mode) {
            StepMode.Erg -> {
                append(",\"pct\":").append(s.pct)
                if (s.pctEnd != null) append(",\"pct_end\":").append(s.pctEnd)
            }
            StepMode.Resistance -> append(",\"level\":").append(s.level)
            StepMode.Slope -> append(",\"grade\":").append(gradeJson(s.gradeTenths ?: 0))
            StepMode.Free -> Unit
        }
        if (s.cadence != null) append(",\"cadence\":").append(s.cadence)
        append('}')
    }

    companion object {
        const val MAX_BLOCKS = 100
        const val MAX_REPEAT = 50
        const val MAX_REPEAT_STEPS = 20
        const val MAX_TOTAL_S = 21600
        const val MAX_CHARS = 5000
        const val MAX_LABEL = 40
        const val MAX_STEP_S = 14400

        fun parse(text: String): StepsParse {
            val element = try {
                SpinJson.parseToJsonElement(text)
            } catch (e: SerializationException) {
                return StepsParse.Invalid(StepsProblem.NotAnObject)
            } catch (e: IllegalArgumentException) {
                return StepsParse.Invalid(StepsProblem.NotAnObject)
            }
            return fromElement(element)
        }

        /** Reads what the API sends: the parsed object, or the text of it. */
        fun fromElement(element: JsonElement?): StepsParse {
            if (element is JsonPrimitive && element.isString) return parse(element.content)
            val obj = element as? JsonObject ?: return invalid(StepsProblem.NotAnObject)
            if (obj.keys.any { it != "v" && it != "steps" }) return invalid(StepsProblem.UnknownKey)
            val v = obj["v"]?.let { whole(it) }
            if (v != 1) return invalid(StepsProblem.BadVersion)
            val array = obj["steps"] as? JsonArray ?: return invalid(StepsProblem.BadValue)
            if (array.size > MAX_BLOCKS) return invalid(StepsProblem.TooManyBlocks)
            val blocks = ArrayList<Block>(array.size)
            for (item in array) {
                val itemObj = item as? JsonObject ?: return invalid(StepsProblem.BadValue)
                if ("repeat" in itemObj) {
                    if (itemObj.keys.any { it != "repeat" && it != "steps" }) return invalid(StepsProblem.UnknownKey)
                    val times = itemObj["repeat"]?.let { whole(it) } ?: return invalid(StepsProblem.BadValue)
                    if (times !in 2..MAX_REPEAT) return invalid(StepsProblem.BadRepeat)
                    val inner = itemObj["steps"] as? JsonArray ?: return invalid(StepsProblem.BadValue)
                    if (inner.isEmpty()) return invalid(StepsProblem.BadRepeat)
                    if (inner.size > MAX_REPEAT_STEPS) return invalid(StepsProblem.TooManySteps)
                    val steps = ArrayList<Step>(inner.size)
                    for (s in inner) {
                        val sObj = s as? JsonObject ?: return invalid(StepsProblem.BadValue)
                        if ("repeat" in sObj) return invalid(StepsProblem.NestedRepeat)
                        when (val r = readStep(sObj)) {
                            is StepRead.Ok -> steps += r.step
                            is StepRead.Bad -> return invalid(r.problem)
                        }
                    }
                    blocks += Repeat(times, steps)
                } else {
                    when (val r = readStep(itemObj)) {
                        is StepRead.Ok -> blocks += r.step
                        is StepRead.Bad -> return invalid(r.problem)
                    }
                }
            }
            val steps = StepsV1(blocks)
            val problem = steps.problem()
            return if (problem == null) StepsParse.Ok(steps) else invalid(problem)
        }

        private fun invalid(problem: StepsProblem) = StepsParse.Invalid(problem)

        private sealed interface StepRead {
            data class Ok(val step: Step) : StepRead
            data class Bad(val problem: StepsProblem) : StepRead
        }

        private fun bad() = StepRead.Bad(StepsProblem.BadValue)

        private fun readStep(obj: JsonObject): StepRead {
            val modeText = (obj["mode"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val mode = StepMode.entries.firstOrNull { it.wire == modeText } ?: return bad()
            val allowed = HashSet<String>()
            allowed.addAll(listOf("label", "dur_s", "mode", "cadence"))
            when (mode) {
                StepMode.Erg -> allowed.addAll(listOf("pct", "pct_end"))
                StepMode.Resistance -> allowed.add("level")
                StepMode.Slope -> allowed.add("grade")
                StepMode.Free -> Unit
            }
            if (obj.keys.any { it !in allowed }) return StepRead.Bad(StepsProblem.UnknownKey)
            val label = (obj["label"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return bad()
            val dur = obj["dur_s"]?.let { whole(it) } ?: return bad()
            val cadenceEl = obj["cadence"]
            val cadence = if (cadenceEl == null) null else (whole(cadenceEl) ?: return bad())
            val step = when (mode) {
                StepMode.Erg -> {
                    val pct = obj["pct"]?.let { whole(it) } ?: return bad()
                    val endEl = obj["pct_end"]
                    val end = if (endEl == null) null else (whole(endEl) ?: return bad())
                    Step(label, dur, mode, pct = pct, pctEnd = end, cadence = cadence)
                }
                StepMode.Resistance -> {
                    val level = obj["level"]?.let { whole(it) } ?: return bad()
                    Step(label, dur, mode, level = level, cadence = cadence)
                }
                StepMode.Slope -> {
                    val grade = obj["grade"]?.let { tenths(it) } ?: return bad()
                    Step(label, dur, mode, gradeTenths = grade, cadence = cadence)
                }
                StepMode.Free -> Step(label, dur, mode, cadence = cadence)
            }
            return StepRead.Ok(step)
        }

        private fun number(e: JsonElement): BigDecimal? {
            val p = e as? JsonPrimitive ?: return null
            if (p.isString) return null
            return try {
                BigDecimal(p.content)
            } catch (ex: NumberFormatException) {
                null
            }
        }

        /** A whole number, or null. `10.0` is whole, as it is in JavaScript. */
        private fun whole(e: JsonElement): Int? {
            val n = number(e) ?: return null
            if (n.stripTrailingZeros().scale() > 0) return null
            return try {
                n.intValueExact()
            } catch (ex: ArithmeticException) {
                null
            }
        }

        /** A number with at most one decimal, in tenths, or null. */
        private fun tenths(e: JsonElement): Int? {
            val n = number(e) ?: return null
            val t = n.multiply(BigDecimal(10))
            if (t.stripTrailingZeros().scale() > 0) return null
            return try {
                t.intValueExact()
            } catch (ex: ArithmeticException) {
                null
            }
        }
    }
}

/** A grade in tenths as JSON: `45` is `4.5`, `-20` is `-2.0`. */
fun gradeJson(tenths: Int): String {
    val sign = if (tenths < 0) "-" else ""
    val a = kotlin.math.abs(tenths)
    return "$sign${a / 10}.${a % 10}"
}
