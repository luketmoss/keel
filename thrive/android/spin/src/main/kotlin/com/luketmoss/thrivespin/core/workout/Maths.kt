package com.luketmoss.thrivespin.core.workout

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.sqrt

/** One step of a ride, repeats unrolled. Watts are there only for an `erg` step, and only with an FTP. */
data class ResolvedStep(
    val label: String,
    val durS: Int,
    val mode: StepMode,
    val pctStart: Int?,
    val pctEnd: Int?,
    val level: Int?,
    val gradeTenths: Int?,
    val cadence: Int?,
    val wattsStart: Int?,
    val wattsEnd: Int?,
) {
    val isRamp: Boolean get() = pctStart != null && pctEnd != null && pctStart != pctEnd

    /** The step's zone at [intensityPct], by the mean of a ramp. Null for a step with no power target. */
    fun zone(intensityPct: Int): Zone? {
        if (mode != StepMode.Erg || pctStart == null || pctEnd == null) return null
        return Zones.forPct((pctStart + pctEnd) / 2.0 * intensityPct / 100.0)
    }
}

enum class Zone { Z1, Z2, Z3, Z4, Z5, Z6 }

object Zones {
    /** Coggan zones by a percentage of FTP, rounded half up to a whole percent first. */
    fun forPct(scaledPct: Double): Zone {
        val r = Maths.roundHalfUp(scaledPct)
        return when {
            r < 56 -> Zone.Z1
            r <= 75 -> Zone.Z2
            r <= 90 -> Zone.Z3
            r <= 105 -> Zone.Z4
            r <= 120 -> Zone.Z5
            else -> Zone.Z6
        }
    }
}

/** TSS, IF and work for a workout at an FTP and an intensity. [workKj] is null with no FTP. */
data class Estimates(val totalS: Int, val tss: Int, val ifHundredths: Int, val workKj: Int?) {
    val ifText: String get() = "${ifHundredths / 100}.${(ifHundredths % 100).toString().padStart(2, '0')}"
}

object Maths {
    const val MIN_INTENSITY = 50
    const val MAX_INTENSITY = 130

    /** Half up for the non-negative numbers here. */
    fun roundHalfUp(x: Double): Int = floor(x + 0.5).toInt()

    /** FTP x pct x intensity / 10000, rounded half up, in whole watts. */
    fun watts(ftpW: Int, pct: Int, intensityPct: Int): Int =
        ((ftpW.toLong() * pct * intensityPct * 2 + 10000) / 20000).toInt()

    /** The steps with repeats unrolled in order, and watts when [ftpW] is known. */
    fun expand(steps: StepsV1, ftpW: Int?, intensityPct: Int = 100): List<ResolvedStep> =
        steps.flatSteps.map { s -> resolve(s, ftpW, intensityPct) }

    fun resolve(s: Step, ftpW: Int?, intensityPct: Int): ResolvedStep {
        val erg = s.mode == StepMode.Erg && s.pct != null
        val start = if (erg) s.pct else null
        val end = if (erg) (s.pctEnd ?: s.pct) else null
        return ResolvedStep(
            label = s.label,
            durS = s.durS,
            mode = s.mode,
            pctStart = start,
            pctEnd = end,
            level = s.level,
            gradeTenths = s.gradeTenths,
            cadence = s.cadence,
            wattsStart = if (ftpW != null && start != null) watts(ftpW, start, intensityPct) else null,
            wattsEnd = if (ftpW != null && end != null) watts(ftpW, end, intensityPct) else null,
        )
    }

    /**
     * Planned estimates over the `erg` steps only. With p = pct x intensity / 10000: TSS is the sum of
     * hours x mean(p squared) x 100 (a ramp a to b: (a2 + ab + b2) / 3), IF is the root of TSS over the
     * total hours of every step over 100, and work is seconds x FTP x mean(p) / 1000.
     */
    fun estimate(steps: StepsV1, ftpW: Int?, intensityPct: Int = 100): Estimates {
        var tss = 0.0
        var work = 0.0
        for (s in steps.flatSteps) {
            if (s.mode != StepMode.Erg || s.pct == null) continue
            val a = s.pct * intensityPct / 10000.0
            val b = (s.pctEnd ?: s.pct) * intensityPct / 10000.0
            val hours = s.durS / 3600.0
            tss += hours * ((a * a + a * b + b * b) / 3.0) * 100.0
            if (ftpW != null) work += s.durS * ftpW * ((a + b) / 2.0) / 1000.0
        }
        val total = steps.totalSeconds
        val totalHours = total / 3600.0
        val ifValue = if (totalHours > 0.0) sqrt(tss / totalHours / 100.0) else 0.0
        return Estimates(
            totalS = total,
            tss = roundHalfUp(tss),
            ifHundredths = roundHalfUp(ifValue * 100.0),
            workKj = if (ftpW != null) roundHalfUp(work) else null,
        )
    }
}

/** How a duration, a total and a target read on screen. */
object WorkoutText {
    const val MINUS = '−'

    /** A step's duration: `12:00`, `0:30`, `75:00`. */
    fun clock(durS: Int): String = "${durS / 60}:${(durS % 60).toString().padStart(2, '0')}"

    /** A total: "45 min" under an hour, else "1 h 05 min". */
    fun total(totalS: Int): String {
        val minutes = maxOf(1, Maths.roundHalfUp(totalS / 60.0))
        return if (minutes < 60) "$minutes min" else "${minutes / 60} h ${(minutes % 60).toString().padStart(2, '0')} min"
    }

    /** A grade in tenths for the screen: `4.5%`, `−2.0%`. */
    fun grade(tenths: Int): String {
        val sign = if (tenths < 0) "$MINUS" else ""
        val a = abs(tenths)
        return "$sign${a / 10}.${a % 10}%"
    }

    /** The percentage as written: `90%`, or `50–70%` on a ramp. */
    fun pctText(s: ResolvedStep): String {
        val start = s.pctStart ?: return ""
        return if (s.isRamp) "$start–${s.pctEnd}%" else "$start%"
    }

    /** A step's target at the right of its row. */
    fun target(s: ResolvedStep): String = when (s.mode) {
        StepMode.Erg -> {
            val pct = pctText(s)
            val w = s.wattsStart
            val we = s.wattsEnd
            when {
                w == null || we == null -> pct
                s.isRamp -> "$pct · $w–$we W"
                else -> "$pct · $w W"
            }
        }
        StepMode.Resistance -> "Resistance ${s.level ?: 0}"
        StepMode.Slope -> "Slope ${grade(s.gradeTenths ?: 0)}"
        StepMode.Free -> "Free"
    }
}
