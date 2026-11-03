package com.luketmoss.thrivespin.core.ride

import com.luketmoss.thrivespin.core.workout.Maths
import com.luketmoss.thrivespin.core.workout.WorkoutText
import kotlin.math.abs

/** The two clocks a ride reads: a monotonic one for ride time, and the wall clock for the files. */
interface RideClock {
    /** Android's `elapsedRealtime`: never goes back, keeps counting through sleep. */
    fun monotonicMs(): Long

    fun wallMs(): Long
}

/** How a 3 s power sits against the erg target. */
enum class Band { On, Below, Above }

object Targets {
    const val BAND_PERCENT = 5

    /**
     * The erg target in watts at [second] seconds into a step of [durS] seconds, or null when the step has
     * no erg target. A flat percentage equals #767's watts to the watt; a ramp is the same line, rounded half up.
     */
    fun ergWatts(step: RideStep, second: Int, ftpW: Int?, intensityPct: Int): Int? {
        val d = step.durS
        return when (val t = step.target) {
            is StepTarget.PctOfFtp -> {
                val ftp = ftpW ?: return null
                if (t.start == t.end || d == null) {
                    Maths.watts(ftp, t.start, intensityPct)
                } else {
                    val pct = t.start + (t.end - t.start).toDouble() * second / d
                    Maths.roundHalfUp(ftp * pct * intensityPct / 10000.0)
                }
            }
            is StepTarget.Watts ->
                if (t.startW == t.endW || d == null) t.startW else Maths.roundHalfUp(t.startW + (t.endW - t.startW).toDouble() * second / d)
            is StepTarget.WattsStairs -> t.startW + t.stepW * (second / maxOf(1, t.everyS))
            is StepTarget.Level, is StepTarget.Grade, StepTarget.Free -> null
        }
    }

    /** The target as a percentage of FTP at this second, for the zone colour and "n% FTP". Null for a non-percentage step. */
    fun scaledPct(step: RideStep, second: Int, intensityPct: Int): Double? {
        val t = step.target as? StepTarget.PctOfFtp ?: return null
        val d = step.durS
        val pct = if (t.start == t.end || d == null) t.start.toDouble() else t.start + (t.end - t.start).toDouble() * second / d
        return pct * intensityPct / 100.0
    }

    /** On target within 5% of the target, else below or above. Null with no target or no power. */
    fun band(targetW: Int?, power3sW: Int?): Band? {
        if (targetW == null || power3sW == null || targetW <= 0) return null
        return when {
            abs(power3sW - targetW) * 100 <= targetW * BAND_PERCENT -> Band.On
            power3sW < targetW -> Band.Below
            else -> Band.Above
        }
    }

    /** A target as the screen and the notification word it: "225 W", "125–175 W", "Level 30", "Slope 4.5%", "Free". */
    fun text(step: RideStep, second: Int, ftpW: Int?, intensityPct: Int): String = when (val t = step.target) {
        is StepTarget.PctOfFtp, is StepTarget.Watts -> {
            val start = ergWatts(step, 0, ftpW, intensityPct)
            val end = step.durS?.let { ergWatts(step, it, ftpW, intensityPct) } ?: start
            if (start == null) "" else if (end != null && end != start) "$start–$end W" else "$start W"
        }
        is StepTarget.WattsStairs -> "${ergWatts(step, second, ftpW, intensityPct)} W"
        is StepTarget.Level -> "Level ${t.level}"
        is StepTarget.Grade -> "Slope ${WorkoutText.grade(SpinGrade.tenths(t.grade))}"
        StepTarget.Free -> "Free"
    }
}

object SpinGrade {
    /** A grade in whole tenths of a percent: 4.5 is 45. */
    fun tenths(grade: Double): Int = Math.round(grade * 10).toInt()
}

/** `m:ss` under an hour, else `h:mm:ss`. */
object RideTime {
    fun clock(totalS: Int): String {
        val s = totalS.coerceAtLeast(0)
        val h = s / 3600
        val m = s % 3600 / 60
        val sec = s % 60
        return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}" else "$m:${sec.toString().padStart(2, '0')}"
    }
}
